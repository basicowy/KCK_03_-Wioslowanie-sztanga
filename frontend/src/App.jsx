import React, { useEffect, useRef, useState } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import "./App.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

const formatSessionDate = (value) => {
  if (!value) return "Brak daty";

  const normalizedValue = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default function App() {
  const [view, setView] = useState("menu");
  const [isAuthed, setIsAuthed] = useState(false);
  const [accessId, setAccessId] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const [voiceOn, setVoiceOn] = useState(false);
    const voiceOnRef = useRef(false);

  // Analiza cyber-trenera
  const [messages, setMessages] = useState(["Oczekiwanie na dane..."]);
  const [reps, setReps] = useState(0);
  const [phase, setPhase] = useState("OCZEKIWANIE");

  // Historia sesji zapisywana w SQLite
  const [savedSessions, setSavedSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);

  const leftVideoRef = useRef(null);
  const leftCanvasRef = useRef(null);
  const streamsRef = useRef([]);

  const landmarkerRef = useRef(null);
  const requestRef = useRef(null);
  const wsRef = useRef(null);
  const lastSendTime = useRef(0);
  const isSavingRef = useRef(false);

  const activeUsername = displayName || accessId;

  const stopStreams = () => {
    streamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    streamsRef.current = [];
  };

  const stopWorkoutPreview = () => {
    stopStreams();

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const startCameras = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return;
    }

    try {
      stopStreams();

      const primaryStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      if (leftVideoRef.current) {
        leftVideoRef.current.srcObject = primaryStream;
      }

      streamsRef.current.push(primaryStream);
    } catch (error) {
      console.error(error);
    }
  };

  const initMediaPipe = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    );

    landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
    });
  };

  const loadTrainingSessions = async (username = activeUsername) => {
    const cleanUsername = username.trim();

    if (!cleanUsername) {
      return;
    }

    setSessionsLoading(true);
    setSessionsError("");

    try {
      const response = await fetch(
        `${apiBaseUrl}/training-sessions?username=${encodeURIComponent(cleanUsername)}`,
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.detail || "Nie udalo sie pobrac historii");
      }

      const payload = await response.json();
      setSavedSessions(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setSessionsError("Nie udało się pobrać zapisanych sesji.");
      console.error(error);
    } finally {
      setSessionsLoading(false);
    }
  };

  const saveWorkoutSession = async () => {
    const cleanUsername = activeUsername.trim();

    if (!cleanUsername || isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    setSessionsError("");
    setSaveNotice("");

    try {
      const response = await fetch(`${apiBaseUrl}/training-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: cleanUsername,
          reps,
          phase,
          messages,
          started_at: sessionStartedAt,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.detail || "Nie udalo sie zapisac sesji");
      }

      const savedSession = await response.json();
      setSavedSessions((prev) => [savedSession, ...prev].slice(0, 20));
      setSaveNotice(`Zapisano sesję: ${savedSession.reps} powtórzeń.`);
    } catch (error) {
      setSessionsError("Nie udało się zapisać sesji w bazie danych.");
      console.error(error);
    } finally {
      isSavingRef.current = false;
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    wsRef.current = new WebSocket(wsUrl);
    wsRef.current.onopen = () => {
      console.log("WebSocket connected");
      setMessages(["Podłączono. Oczekiwanie na detekcję..."]);
    };
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.messages) setMessages(data.messages);
        if (data.reps !== undefined) setReps(data.reps);
        if (data.phase) setPhase(data.phase);
        if (data.voiceOn !== undefined) {
           setVoiceOn(data.voiceOn);
           voiceOnRef.current = data.voiceOn;
        }
      } catch (err) {
        console.error("Błąd parsowania WS:", err);
      }
    };
    wsRef.current.onclose = () => {
      console.log("WebSocket disconnected");
      setMessages(["Rozłączono. Spróbuj ponownie."]);
    };
  };

  const drawPose = (video, canvas, results) => {
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results && results.landmarks && results.landmarks[0]) {
      const landmarks = results.landmarks[0];
      const drawingUtils = new DrawingUtils(ctx);
      drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 4,
      });
      drawingUtils.drawLandmarks(landmarks, {
        color: "#FF0000",
        lineWidth: 2,
      });
    }
  };

  const animate = () => {
    const video = leftVideoRef.current;

    if (video && video.readyState >= 2 && landmarkerRef.current) {
      const startTimeMs = performance.now();
      const results = landmarkerRef.current.detectForVideo(video, startTimeMs);

      drawPose(video, leftCanvasRef.current, results);

      if (
        results.landmarks &&
        results.landmarks[0] &&
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN
      ) {
        const now = Date.now();
        if (now - lastSendTime.current > 33) {
          wsRef.current.send(
            JSON.stringify({ landmarks: results.landmarks[0] }),
          );
          lastSendTime.current = now;
        }
      }
    }

    if (view === "workout" || requestRef.current) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  const handleStart = async () => {
    setReps(0);
    setPhase("OCZEKIWANIE");
    setMessages(["Oczekiwanie na dane..."]);
    setSelectedSessionId(null);
    setSaveNotice("");
    setSessionStartedAt(new Date().toISOString());
    setView("workout");
    await startCameras();
    await initMediaPipe();
    connectWebSocket();
    requestRef.current = requestAnimationFrame(animate);
  };

  const handleFinishWorkout = async () => {
    stopWorkoutPreview();
    await saveWorkoutSession();
    await loadTrainingSessions();
    setView("menu");
  };

  useEffect(() => {
    if (view !== "workout" && requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
  }, [view]);

  useEffect(() => {
    if (isAuthed && activeUsername.trim()) {
      loadTrainingSessions(activeUsername);
    }
  }, [isAuthed, displayName]);

  useEffect(() => {
    return () => {
      stopWorkoutPreview();
    };
  }, []);

  const canEnter = accessId.trim().length > 0 || accessKey.trim().length > 0;

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (!canEnter || authLoading) {
      return;
    }

    setAuthError("");
    setAuthLoading(true);

    try {
      const endpoint =
        authMode === "register" ? "/auth/register" : "/auth/login";
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: accessId,
          password: accessKey,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = payload?.detail || "Blad logowania";
        setAuthError(detail);
        return;
      }

      const payload = await response.json();
      setDisplayName(payload.username || accessId);
      setIsAuthed(true);
      setView("menu");
      setAccessKey("");
    } catch (error) {
      setAuthError("Brak polaczenia z backendem");
      console.error(error);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="background">
        <span className="orb orb--teal"></span>
        <span className="orb orb--coral"></span>
        <span className="orb orb--sand"></span>
        <span className="grid"></span>
      </div>

      <main className="app">
        {!isAuthed ? (
          <section className="auth">
            <div className="auth-intro">
              <p className="eyebrow">System wejścia</p>
              <h1>Logowanie do analizy techniki.</h1>
              <p className="lead">
                To demo bez prawdziwej weryfikacji. Wpisz dowolny tekst i
                przejdź dalej.
              </p>
              <div className="auth-badges">
                <span className="chip">Kamera Live</span>
                <span className="chip chip--alt">Live feedback</span>
                <span className="chip">Tryb głosowy</span>
              </div>
            </div>
            <div className="auth-card">
              <div className="auth-header">
                <h2>Panel dostępu</h2>
                <p>Studio treningowe w wersji demo.</p>
              </div>
              <form className="auth-form" onSubmit={handleLoginSubmit}>
                <label className="field">
                  <span>Użytkownik</span>
                  <input
                    type="text"
                    name="accessId"
                    value={accessId}
                    onChange={(event) => setAccessId(event.target.value)}
                    placeholder="np. User"
                  />
                </label>
                <label className="field">
                  <span>Hasło</span>
                  <input
                    type="password"
                    name="accessKey"
                    value={accessKey}
                    onChange={(event) => setAccessKey(event.target.value)}
                    placeholder="dowolny tekst"
                  />
                </label>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={!canEnter || authLoading}
                >
                  {authLoading
                    ? "Laczenie..."
                    : authMode === "register"
                      ? "Utworz konto"
                      : "Zaloguj sie"}
                </button>
                {authError ? <p className="auth-error">{authError}</p> : null}
                <button
                  className="auth-toggle"
                  type="button"
                  onClick={() =>
                    setAuthMode((prev) =>
                      prev === "login" ? "register" : "login",
                    )
                  }
                >
                  {authMode === "login"
                    ? "Nie masz konta? Utworz je"
                    : "Masz konto? Zaloguj sie"}
                </button>
              </form>
            </div>
          </section>
        ) : (
          <>
            <header className="topbar">
              <div className="logo">
                <span className="logo-mark"></span>
                <span className="logo-text">KCK Form Studio</span>
              </div>
              <div className="topbar-right">
                <div className="user-chip">
                  Zalogowany: {displayName || accessId}
                </div>
                <div className="status-chip">Szkielet: live preview</div>
              </div>
            </header>

            <section
              className={`view view--menu ${view === "menu" ? "is-active" : ""}`}
            >
              <div className="hero">
                <p className="eyebrow">Inteligentny trener</p>
                <h1>
                  Nowoczesny panel treningu z kamerą i natychmiastowym
                  feedbackiem.
                </h1>
                <p className="lead">
                  Ustaw pozycję, a system sam zadba o analizę i korekty postawy.
                </p>
                <button className="btn btn--primary" onClick={handleStart}>
                  Zacznij ćwiczyć
                </button>
              </div>
              <div className="tiles">
                <article className="tile">
                  <h3>Podgląd live</h3>
                  <p>Obserwuj swoje ujęcie na żywo podczas każdego ruchu.</p>
                </article>
                <article className="tile">
                  <h3>Precyzyjna sylwetka</h3>
                  <p>
                    Interfejs gotowy na analizę szkieletu i korekty postawy.
                  </p>
                </article>
                <article className="tile">
                  <h3>Tryb głosowy</h3>
                  <p>Przełączasz głosowy feedback jednym ruchem.</p>
                </article>
              </div>

              <article className="history-panel">
                <div className="history-header">
                  <div>
                    <p className="eyebrow">Historia treningów</p>
                    <h2>Zapisane powtórzenia</h2>
                    <p className="history-subtitle">
                      Każda zakończona sesja trafia do SQLite i zostaje tutaj w menu.
                    </p>
                  </div>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => loadTrainingSessions()}
                    disabled={sessionsLoading}
                  >
                    {sessionsLoading ? "Ładowanie..." : "Odśwież"}
                  </button>
                </div>

                {saveNotice ? <p className="save-note">{saveNotice}</p> : null}
                {sessionsError ? <p className="auth-error">{sessionsError}</p> : null}

                {savedSessions.length === 0 && !sessionsLoading ? (
                  <p className="history-empty">
                    Brak zapisanych sesji. Zakończ trening przyciskiem „Zakończ i zapisz”,
                    a wynik pojawi się w tym miejscu.
                  </p>
                ) : null}

                {savedSessions.length > 0 ? (
                  <div className="history-list">
                    {savedSessions.map((session) => {
                      const isOpen = selectedSessionId === session.id;
                      const sessionMessages = Array.isArray(session.messages)
                        ? session.messages
                        : [];

                      return (
                        <article
                          className={`history-card ${isOpen ? "is-open" : ""}`}
                          key={session.id}
                        >
                          <button
                            className="history-card-button"
                            type="button"
                            onClick={() =>
                              setSelectedSessionId(isOpen ? null : session.id)
                            }
                          >
                            <span className="history-date">
                              {formatSessionDate(session.ended_at)}
                            </span>
                            <strong>{session.reps} powtórzeń</strong>
                            <span className="chip">
                              {session.phase || "Zapisano"}
                            </span>
                          </button>

                          {isOpen ? (
                            <div className="history-details">
                              <p>Start: {formatSessionDate(session.started_at)}</p>
                              {sessionMessages.length > 0 ? (
                                <div className="history-messages">
                                  {sessionMessages.map((message, idx) => (
                                    <span className="history-message" key={idx}>
                                      {message}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p>Brak zapisanych uwag dla tej sesji.</p>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            </section>

            <section
              className={`view view--workout ${view === "workout" ? "is-active" : ""}`}
            >
              <div className="controls">
                <div className="controls-left">
                  <p className="eyebrow">Sesja treningowa</p>
                  <h2>Podgląd kamery</h2>
                  <p className="lead lead--compact">
                    Ustaw się w kadrze i rozpocznij ćwiczenie.
                  </p>
                </div>
                <div className="controls-right">
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={handleFinishWorkout}
                  >
                    Zakończ i zapisz
                  </button>
                  <button
                    className="toggle"
                    aria-pressed={voiceOn}
                    onClick={() => {
                      const next = !voiceOn;
                      setVoiceOn(next);
                      voiceOnRef.current = next;
                      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ type: "voice_toggle", state: next }));
                      }
                    }}
                  >
                    <span className="toggle-label toggle-off">
                      Voice assistant off
                    </span>
                    <span className="toggle-label toggle-on">
                      Voice assistant on
                    </span>
                    <span className="toggle-knob"></span>
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "48px",
                  marginBottom: "32px",
                  background:
                    "linear-gradient(140deg, rgba(16, 23, 33, 0.9), rgba(10, 15, 22, 0.75))",
                  padding: "24px 48px",
                  borderRadius: "24px",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow)",
                  maxWidth: "fit-content",
                  margin: "0 auto 32px auto",
                  backdropFilter: "blur(14px)",
                }}
              >
                <div style={{ textAlign: "center", minWidth: "120px" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "2px",
                      marginBottom: "8px",
                    }}
                  >
                    Faza ruchu
                  </div>
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: "700",
                      color: "#4ade80",
                      textShadow: "0 0 16px rgba(74, 222, 128, 0.3)",
                    }}
                  >
                    {phase}
                  </div>
                </div>
                <div
                  style={{
                    width: "1px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "1px",
                  }}
                ></div>
                <div style={{ textAlign: "center", minWidth: "120px" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "2px",
                      marginBottom: "8px",
                    }}
                  >
                    Powtórzenia
                  </div>
                  <div
                    style={{
                      fontSize: "32px",
                      fontWeight: "700",
                      color: "#60a5fa",
                      textShadow: "0 0 16px rgba(96, 165, 250, 0.3)",
                      lineHeight: "1",
                    }}
                  >
                    {reps}
                  </div>
                </div>
              </div>

              <div className="workout-grid">
                <article className="camera-card">
                  <div className="camera-header">
                    <div className="camera-title">
                      <span className="camera-dot"></span>
                      <span>Kamera</span>
                    </div>
                    <span className="chip">Live</span>
                  </div>
                  <div
                    className="camera-frame"
                    style={{ position: "relative" }}
                  >
                    <video
                      ref={leftVideoRef}
                      autoPlay
                      playsInline
                      muted
                    ></video>
                    <canvas
                      ref={leftCanvasRef}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                      }}
                    />

                    {phase === "KALIBRACJA" && (
                      <svg
                        viewBox="0 0 100 120"
                        preserveAspectRatio="xMidYMid meet"
                        style={{
                          width: "100%",
                          height: "100%",
                          position: "absolute",
                          top: 0,
                          left: 0,
                          zIndex: 10,
                          pointerEvents: "none",
                        }}
                      >
                        <defs>
                          <mask id="silhouette-mask">
                            <rect
                              x="-1000"
                              y="-1000"
                              width="3000"
                              height="3000"
                              fill="white"
                            />
                            <g
                              stroke="black"
                              strokeWidth="8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            >
                              <circle
                                cx="35"
                                cy="25"
                                r="5"
                                fill="black"
                                stroke="none"
                              />
                              <line x1="40" y1="35" x2="65" y2="55" />
                              <line x1="65" y1="55" x2="55" y2="80" />
                              <line x1="55" y1="80" x2="55" y2="105" />
                              <line
                                x1="48"
                                y1="40"
                                x2="48"
                                y2="70"
                                strokeWidth="5"
                              />
                            </g>
                          </mask>
                        </defs>
                        <rect
                          x="-1000"
                          y="-1000"
                          width="3000"
                          height="3000"
                          fill="rgba(0, 0, 0, 0.75)"
                          mask="url(#silhouette-mask)"
                        />
                        <text
                          x="50"
                          y="15"
                          fill="#4ade80"
                          fontSize="6"
                          textAnchor="middle"
                          fontWeight="bold"
                          letterSpacing="0.5"
                        >
                          KALIBRACJA
                        </text>
                        <text
                          x="50"
                          y="115"
                          fill="white"
                          fontSize="4"
                          textAnchor="middle"
                        >
                          Dopasuj sylwetkę do cienia
                        </text>
                      </svg>
                    )}

                    <div className="camera-overlay">Live view</div>
                  </div>
                </article>

                <article
                  className="camera-card"
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    className="camera-header"
                    style={{ marginBottom: "16px" }}
                  >
                    <div className="camera-title">
                      <span
                        className="camera-dot"
                        style={{
                          backgroundColor: "#f87171",
                          boxShadow: "0 0 0 6px rgba(248, 113, 113, 0.2)",
                        }}
                      ></span>
                      <span>Korekty i wskazówki</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      flex: 1,
                      overflowY: "auto",
                    }}
                  >
                    {Array.isArray(messages) && messages.length > 0 ? (
                      messages.map((msg, idx) => {
                        const isGood =
                          msg.toLowerCase().includes("dobra technika") ||
                          msg.toLowerCase().includes("kalibracja udana") ||
                          msg.toLowerCase().includes("podłączono");
                        const isNeutral =
                          msg.toLowerCase().includes("oczekiwanie") ||
                          msg.toLowerCase().includes("kalibracja") ||
                          msg.toLowerCase().includes("pokaż całą sylwetkę");

                        let bgColor = "rgba(248, 113, 113, 0.1)";
                        let borderColor = "rgba(248, 113, 113, 0.2)";
                        let textColor = "#f87171";

                        if (isGood) {
                          bgColor = "rgba(74, 222, 128, 0.1)";
                          borderColor = "rgba(74, 222, 128, 0.2)";
                          textColor = "#4ade80";
                        } else if (
                          isNeutral &&
                          !msg.toLowerCase().includes("błąd")
                        ) {
                          bgColor = "rgba(96, 165, 250, 0.1)";
                          borderColor = "rgba(96, 165, 250, 0.2)";
                          textColor = "#60a5fa";
                        }

                        return (
                          <div
                            key={idx}
                            style={{
                              padding: "16px",
                              borderRadius: "12px",
                              background: bgColor,
                              border: `1px solid ${borderColor}`,
                              color: textColor,
                              fontWeight: "500",
                              fontSize: "15px",
                              lineHeight: "1.5",
                            }}
                          >
                            {msg}
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          color: "var(--muted)",
                          fontStyle: "italic",
                          padding: "16px",
                          textAlign: "center",
                        }}
                      >
                        Brak uwag
                      </div>
                    )}
                  </div>
                </article>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
