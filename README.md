# KCK_03 - Fitness app for barbell row form control

Training interface with a dual camera preview and a simple demo login panel.

## Features

- Two camera previews (if only one camera is available, the second view is mirrored).
- Voice mode toggle (on/off).
- Demo login and registration backed by the API.

## Stack

- Frontend: React 18, Vite 5, CSS
- Backend: FastAPI, SQLite

## Requirements

- Node.js 18+ (or 20+)
- Python 3.10+
- Camera access (works on HTTPS or localhost)

## Quick start

### Frontend

```
cd frontend
npm install
npm run dev
```

Vite will start the app at `http://localhost:5173`.

### Backend

```
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend runs at `http://127.0.0.1:8000` and creates a SQLite database at `backend/app.db`.

## Frontend-backend config

The frontend uses `VITE_API_BASE_URL`. For local development set, for example:

```
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Structure

```
audio/
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
```

## Notes

- The browser may require permission to access cameras.
- Login is a demo flow backed by a local SQLite database.
- The mirrored secondary view appears when only one camera is detected.