import { useEffect, useRef, useState } from "react";
import "./App.css";



const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

const pickSecondaryDevice = (devices, primaryDeviceId) => {
  return devices.find((device) => device.deviceId && device.deviceId !== primaryDeviceId) || null;
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
  const [mirrorRight, setMirrorRight] = useState(false);

  const leftVideoRef = useRef(null);
  const rightVideoRef = useRef(null);
  const streamsRef = useRef([]);



  const stopStreams = () => {
    streamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    streamsRef.current = [];
  };

  const startCameras = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      
      return;
    }

    try {
      
      setMirrorRight(false);
      stopStreams();

      const primaryStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      if (leftVideoRef.current) {
        leftVideoRef.current.srcObject = primaryStream;
      }

      streamsRef.current.push(primaryStream);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === "videoinput");

      if (!videoDevices.length) {
        
        return;
      }

      const primaryDeviceId = primaryStream.getVideoTracks()[0]?.getSettings().deviceId;
      const secondaryDevice = pickSecondaryDevice(videoDevices, primaryDeviceId);

      if (secondaryDevice) {
        const secondaryStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: secondaryDevice.deviceId } },
          audio: false,
        });

        if (rightVideoRef.current) {
          rightVideoRef.current.srcObject = secondaryStream;
        }

        streamsRef.current.push(secondaryStream);
        
      } else {
        if (rightVideoRef.current) {
          rightVideoRef.current.srcObject = primaryStream;
        }
        setMirrorRight(true);
        
      }
    } catch (error) {
      
      console.error(error);
    }
  };

  const handleStart = async () => {
    setView("workout");
    await startCameras();
  };

  const canEnter = accessId.trim().length > 0 || accessKey.trim().length > 0;

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (!canEnter || authLoading) {
      return;
    }

    setAuthError("");
    setAuthLoading(true);

    try {
      const endpoint = authMode === "register" ? "/auth/register" : "/auth/login";
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

  useEffect(() => {
    return () => stopStreams();
  }, []);

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
                To demo bez prawdziwej weryfikacji. Wpisz dowolny tekst i przejdź dalej.
              </p>
              <div className="auth-badges">
                <span className="chip">Dwukamera</span>
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
                <button className="btn btn--primary" type="submit" disabled={!canEnter || authLoading}>
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
                    setAuthMode((prev) => (prev === "login" ? "register" : "login"))
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
                <div className="user-chip">Zalogowany: {displayName || accessId}</div>
                <div className="status-chip">Szkielet: live preview</div>
              </div>
            </header>

            <section className={`view view--menu ${view === "menu" ? "is-active" : ""}`}>
              <div className="hero">
                <p className="eyebrow">Inteligentny trener</p>
                <h1>Nowoczesny panel treningu z kamerami i natychmiastowym feedbackiem.</h1>
                <p className="lead">
                  Włącz dwa podglądy, ustaw pozycję i pozwól systemowi oceniać technikę.
                </p>
                <button className="btn btn--primary" onClick={handleStart}>
                  Zacznij ćwiczyć
                </button>
              </div>
              <div className="tiles">
                <article className="tile">
                  <h3>Podwójny widok</h3>
                  <p>Porównuj ujęcie z przodu i z boku w jednej scenie.</p>
                </article>
                <article className="tile">
                  <h3>Precyzyjna sylwetka</h3>
                  <p>Interfejs gotowy na analizę szkieletu i korekty postawy.</p>
                </article>
                <article className="tile">
                  <h3>Tryb głosowy</h3>
                  <p>Przełączasz głosowy feedback jednym ruchem.</p>
                </article>
              </div>
            </section>

            <section className={`view view--workout ${view === "workout" ? "is-active" : ""}`}>
              <div className="controls">
                <div className="controls-left">
                  <p className="eyebrow">Sesja treningowa</p>
                  <h2>Podgląd kamer</h2>
                  <p className="lead lead--compact">Ustaw się w kadrze i rozpocznij ćwiczenie.</p>
                </div>
                <div className="controls-right">
                  <button
                    className="toggle"
                    aria-pressed={voiceOn}
                    onClick={() => setVoiceOn((prev) => !prev)}
                  >
                    <span className="toggle-label toggle-off">Voice assistant off</span>
                    <span className="toggle-label toggle-on">Voice assistant on</span>
                    <span className="toggle-knob"></span>
                  </button>
                </div>
              </div>

              <div className="camera-grid">
                <article className="camera-card">
                  <div className="camera-header">
                    <div className="camera-title">
                      <span className="camera-dot"></span>
                      <span>Kamera 1</span>
                    </div>
                    <span className="chip">Live</span>
                  </div>
                  <div className="camera-frame">
                    <video ref={leftVideoRef} autoPlay playsInline muted></video>
                    <div className="camera-overlay">Front view</div>
                  </div>
                </article>

                <article className="camera-card">
                  <div className="camera-header">
                    <div className="camera-title">
                      <span className="camera-dot"></span>
                      <span>Kamera 2</span>
                    </div>
                    <span className="chip chip--alt">Live</span>
                  </div>
                  <div className="camera-frame">
                    <video
                      ref={rightVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={mirrorRight ? "is-mirrored" : ""}
                    ></video>
                    <div className="camera-overlay">Side view</div>
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
