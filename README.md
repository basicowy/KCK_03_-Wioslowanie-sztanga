# KCK_03 - Barbell Row Form Studio

Fitness training app for barbell row technique analysis. The project combines a
React camera interface, MediaPipe pose detection, a FastAPI backend, and a small
Polish voice assistant prototype.

## Features

- Login and registration backed by a local SQLite database.
- Live camera preview in the browser.
- MediaPipe pose landmark detection rendered over the camera feed.
- WebSocket feedback loop between the frontend and backend.
- Barbell row calibration, movement phase tracking, repetition counting, and
  simple posture warnings.
- Voice assistant toggle in the frontend UI.
- Separate `audio/` prototype for Polish speech recognition and text-to-speech.

## Tech Stack

- Frontend: React 18, Vite, CSS, MediaPipe Tasks Vision.
- Backend: FastAPI, SQLite, NumPy, WebSockets.
- Audio prototype: SpeechRecognition, edge-tts, pygame, PyAudio.

## Requirements

- Node.js 18+.
- Python 3.10+.
- A webcam and browser camera permissions.
- Internet access while loading MediaPipe model and WASM assets from CDNs.
- A microphone for the optional audio assistant.

## Quick Start

Run the backend and frontend in separate terminals.

### Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

On macOS/Linux:

```bash
source .venv/bin/activate
```

Install dependencies and start the API:

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend runs at `http://127.0.0.1:8000`. It creates the local database at
`backend/app.db` on startup.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite app runs at `http://localhost:5173`.

## Configuration

The frontend defaults to the local backend:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

Create `frontend/.env.local` if you need to override those values.

## How It Works

1. The frontend opens the webcam and initializes MediaPipe Pose Landmarker.
2. Pose landmarks are drawn on the camera canvas.
3. Landmarks are sent to the backend through `ws://localhost:8000/ws`.
4. The backend calibrates the start position, estimates movement phase, counts
   reps, and returns feedback messages.
5. The frontend displays the current phase, rep count, and correction messages.

## Audio Assistant Prototype

The `audio/` folder contains a standalone Polish voice assistant prototype. It
is not wired into the frontend yet.

```bash
cd audio
python -m venv .venv
```

Activate the environment, then run:

```bash
pip install -r requirements.txt
python main.py
```

Notes:

- Requires a working microphone.
- `pyaudio` may need system-specific setup if installation fails.
- The prototype listens for a command similar to `start` and responds with
  synthesized Polish speech.

## Project Structure

```text
audio/
  main.py
  requirements.txt
backend/
  main.py
  requirements.txt
frontend/
  index.html
  package.json
  vite.config.js
  src/
    App.css
    App.jsx
    index.css
    main.jsx
vision/
  .gitkeep
```

## Useful Commands

```bash
# Frontend production build
cd frontend
npm run build

# Backend development server
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Development Notes

- Camera access works on `localhost`; production deployments should use HTTPS.
- The backend CORS configuration currently allows the local Vite origins.
- Authentication is intended for local/demo use and stores users in SQLite.
- The `vision/` directory is reserved for future vision-related assets or code.
