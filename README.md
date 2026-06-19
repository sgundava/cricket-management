# Cricket Management Game

A cricket management simulation (IPL / Football Manager style). Build squads through auctions, set match tactics, simulate matches ball-by-ball, manage players, and progress a manager career across seasons — in both franchise and international modes, across T20, ODI, and Test formats.

The game runs entirely in the browser; an optional backend can offload match simulation and event generation, but isn't required.

## Project structure

```
├── frontend/    # React 19 + TypeScript + Vite + Tailwind + Zustand — the game
├── backend/     # FastAPI (Python) — optional match-sim & event API (graceful offline fallback)
└── analysis/    # Python data analysis used to calibrate the engine & auction pricing
```

## Quick start

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Optional backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000 (/docs in debug)
# or: docker-compose up
```

## Features

- **Franchise mode** — league play (IPL, BBL, CPL, PSL, T20 Blast) with a full auction system: mega/mini auctions, retention, RTM, and AI bidding.
- **International mode** — manage a national team across bilateral series and ICC events in all three formats (feature-flagged via `VITE_ENABLE_INTERNATIONAL_MODE`).
- **Match engine** — ball-by-ball simulation for T20, ODI, and Test cricket (with declarations and day tracking), with batting/bowling tactics and field settings.
- **Saves** — auto-persists to `localStorage`, with three manual save slots.

## Deploy to GitHub Pages

```bash
cd frontend
npm run deploy     # builds and publishes dist/
```

## Documentation

- `CLAUDE.md` — architecture overview and conventions for working in this repo.
- `SESSION_LOG.md` — running log of development sessions.
