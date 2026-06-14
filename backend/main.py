from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hashlib
import os
import secrets
import sqlite3
import math
import numpy as np
from collections import deque
import json

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "app.db")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AuthPayload(BaseModel):
    username: str
    password: str


def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def hash_password(password: str, salt: bytes | None = None) -> tuple[bytes, bytes]:
    if salt is None:
        salt = secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return salt, password_hash


def verify_password(password: str, salt: bytes, password_hash: bytes) -> bool:
    test_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return secrets.compare_digest(test_hash, password_hash)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def read_root():
    return {"Hello": "World - Cyber-trener Backend is running!"}


@app.post("/auth/register")
def register(payload: AuthPayload):
    username = payload.username.strip()
    password = payload.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    salt, password_hash = hash_password(password)
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO users (username, salt, password_hash, created_at) VALUES (?, ?, ?, datetime('now'))",
            (username, salt, password_hash),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="User already exists")
    finally:
        conn.close()

    return {"username": username}


@app.post("/auth/login")
def login(payload: AuthPayload):
    username = payload.username.strip()
    password = payload.password.strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT username, salt, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(password, row["salt"], row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"username": row["username"]}


class EMAFilter:
    def __init__(self, alpha=0.3):
        self.alpha = alpha
        self.values = {}

    def update(self, key, new_value):
        if key not in self.values:
            self.values[key] = new_value
        else:
            self.values[key] = (
                self.alpha * new_value + (1 - self.alpha) * self.values[key]
            )
        return self.values[key]


def calculate_angle_2d(p1, p2, p3):
    radians = math.atan2(p3["y"] - p2["y"], p3["x"] - p2["x"]) - math.atan2(
        p1["y"] - p2["y"], p1["x"] - p2["x"]
    )
    angle = abs(math.degrees(radians))
    return 360.0 - angle if angle > 180.0 else angle


def calculate_torso_angle_2d(hip, shoulder):
    torso = np.array([shoulder["x"] - hip["x"], shoulder["y"] - hip["y"]])
    up = np.array([0.0, -1.0])
    torso_norm = torso / (np.linalg.norm(torso) + 1e-6)
    return np.degrees(np.arccos(np.clip(np.dot(torso_norm, up), -1.0, 1.0)))


class CyberTrener:
    def __init__(self):
        self.is_calibrated = False
        self.state = "IDLE"
        self.reps = 0
        self.smoother = EMAFilter(alpha=0.3)

        # Bufory do kalibracji
        self.buffer_elbow = deque(maxlen=30)
        self.buffer_back = deque(maxlen=30)
        self.buffer_torso = deque(maxlen=30)
        self.buffer_knee = deque(maxlen=30)

        # Zapisane kąty idealnej postawy użytkownika
        self.base_elbow = 0.0
        self.base_back = 0.0
        self.base_torso = 0.0
        self.base_knee = 0.0

        # Proste liczniki błędów (histereza)
        self.error_counts = {"cat_back": 0, "knees": 0, "torso_up": 0}
        self.active_errors = {"cat_back": False, "knees": False, "torso_up": False}
        self.error_msgs = {
            "cat_back": "Wyprostuj plecy! (Koci grzbiet)",
            "knees": "Zegnij kolana!",
            "torso_up": "Obniż tułów.",
        }

    def _pobierz_katy(self, landmarks):
        # Wybór dominującej strony
        left_vis = sum(
            [landmarks[i].get("visibility", 0) for i in [7, 11, 13, 15, 23, 25, 27]]
        )
        right_vis = sum(
            [landmarks[i].get("visibility", 0) for i in [8, 12, 14, 16, 24, 26, 28]]
        )
        idx = (
            {"ear": 8, "sh": 12, "el": 14, "wr": 16, "hip": 24, "kn": 26, "ank": 28}
            if right_vis > left_vis
            else {
                "ear": 7,
                "sh": 11,
                "el": 13,
                "wr": 15,
                "hip": 23,
                "kn": 25,
                "ank": 27,
            }
        )

        if landmarks[idx["hip"]].get("visibility", 1.0) < 0.4:
            return None  # Ciało niewidoczne

        # Pobranie punktów
        ear, sh, el, wr = (
            landmarks[idx["ear"]],
            landmarks[idx["sh"]],
            landmarks[idx["el"]],
            landmarks[idx["wr"]],
        )
        hip, kn, ank = (
            landmarks[idx["hip"]],
            landmarks[idx["kn"]],
            landmarks[idx["ank"]],
        )

        # Obliczenia i wygładzanie
        elbow = self.smoother.update("elbow", calculate_angle_2d(sh, el, wr))
        knee = self.smoother.update("knee", calculate_angle_2d(hip, kn, ank))
        torso = self.smoother.update("torso", calculate_torso_angle_2d(hip, sh))
        back = self.smoother.update("back", calculate_angle_2d(ear, sh, hip))

        return elbow, knee, torso, back

    def _kalibruj(self, elbow, knee, torso, back):
        """Zbiera dane o postawie startowej przez około sekundę."""
        if not (40 < torso < 100):
            self.buffer_elbow.clear()
            return ["Pochyl się do pozycji startowej z opuszczonymi rękami."]

        self.buffer_elbow.append(elbow)
        self.buffer_back.append(back)
        self.buffer_torso.append(torso)
        self.buffer_knee.append(knee)

        if len(self.buffer_elbow) == 30:
            if np.std(self.buffer_elbow) < 5.0 and np.std(self.buffer_torso) < 5.0:
                self.base_elbow, self.base_back = np.mean(self.buffer_elbow), np.mean(
                    self.buffer_back
                )
                self.base_torso, self.base_knee = np.mean(self.buffer_torso), np.mean(
                    self.buffer_knee
                )
                self.is_calibrated = True
                return ["Kalibracja udana!"]
            else:
                return ["Zatrzymaj się w pozycji startowej na 1 sekundę..."]

        return ["KALIBRACJA..."]

    def _sprawdz_bledy(self, knee, torso, back):
        current_errors = []

        # Warunki błędów w bieżącej klatce
        conditions = {
            "cat_back": back < (self.base_back - 20),
            "knees": knee > self.base_knee + 8,
            "torso_up": torso < self.base_torso - 20,
        }

        # Aktualizacja liczników i generowanie komunikatów
        for key, is_bad in conditions.items():
            if is_bad:
                self.error_counts[key] = min(self.error_counts[key] + 1, 15)
            else:
                self.error_counts[key] = max(0, self.error_counts[key] - 1)

            # Prawdziwa histereza stanu chroniąca przed "mruganiem"
            if not self.active_errors[key]:
                if self.error_counts[key] >= 8:
                    self.active_errors[key] = True
            else:
                if self.error_counts[key] <= 0:
                    self.active_errors[key] = False

            if self.active_errors[key]:
                current_errors.append(self.error_msgs[key])

        return current_errors

    def _licz_powtorzenia(self, elbow):
        if self.state == "IDLE" and elbow < self.base_elbow - 10:
            self.state = "CONCENTRIC"
        elif self.state == "CONCENTRIC" and elbow < self.base_elbow - 60:
            self.state = "ECCENTRIC"
        elif self.state == "ECCENTRIC" and elbow > self.base_elbow - 20:
            self.reps += 1
            self.state = "CONCENTRIC"


    def process_frame(self, landmarks):
        # Pobranie kątów
        angles = self._pobierz_katy(landmarks)
        if not angles:
            return ["Pokaż całą sylwetkę z boku"], self.reps, self.state

        elbow, knee, torso, back = angles

        # Faza Kalibracji
        if not self.is_calibrated:
            msg = self._kalibruj(elbow, knee, torso, back)
            return msg, self.reps, "KALIBRACJA"
        
        self._licz_powtorzenia(elbow)

        # Tłumaczenie stanu dla UI i zwrócenie wyniku
        fazy_pl = {
            "IDLE": "OCZEKIWANIE",
            "CONCENTRIC": "PRZYCIĄGAJ",
            "ECCENTRIC": "OPUSZCZAJ",
        }

        # Analiza Błędów Techniki
        errors = self._sprawdz_bledy(knee, torso, back)
        if errors:
            return errors, self.reps, "POPRAW POZYCJĘ"

        return ["Dobra technika!"], self.reps, fazy_pl.get(self.state, "OCZEKIWANIE")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    analyzer = CyberTrener()
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                landmarks = payload.get("landmarks", [])
                
                if not landmarks or len(landmarks) < 33:
                    continue
                    
                messages, reps, phase = analyzer.process_frame(landmarks)
                
                await websocket.send_json({
                    "messages": messages,
                    "reps": reps,
                    "phase": phase
                })
            except json.JSONDecodeError:
                print("Invalid JSON received")
            except Exception as e:
                print(f"Error processing frame: {e}")
    except WebSocketDisconnect:
        print("Client disconnected")