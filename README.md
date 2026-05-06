# KCK_03 - Aplikacja fitness do kontroli ćwiczenia "Wiosłowanie sztangą"

Fitness app frontend with a dual camera preview.

## Features

- Landing screen with a start button.
- Two camera previews (if only one camera is available, the second view is mirrored).
- Voice assistant toggle (on/off).

## Stack

- React 18
- Vite 5
- CSS (custom)

## Requirements

- Node.js 18+ (or 20+)
- Camera access (works on HTTPS or localhost)

## Quick start (frontend)

1. Go to the frontend folder.
2. Install dependencies.
3. Start the dev server.

```
cd frontend
npm install
npm run dev
```

Vite will start the app at `http://localhost:5173` by default.

## Structure

```
frontend/
  index.html
  package.json
  vite.config.js
  src/
    App.jsx
    App.css
    index.css
    main.jsx
```

## Notes

- Camera access may require browser permission.
- The mirrored secondary view appears when only one camera is detected.