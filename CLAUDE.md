# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep this file current as the architecture evolves.

## What this is

A cricket management simulation game (IPL / Football Manager style). You run a franchise or a national team: build squads through auctions, set tactics, simulate matches ball-by-ball, manage players, and progress a career across seasons.

The **frontend is the product** — a fully playable game that runs entirely client-side. The backend is **optional** and the game works completely offline.

## Repository layout

```
cricket-management/
├── frontend/    # React 19 + TS + Vite + Tailwind v4 + Zustand — THE GAME (primary)
├── backend/     # FastAPI (Python) — OPTIONAL match-sim & event service, graceful offline fallback
└── analysis/    # Python data analysis (Jupyter + scripts) — calibrates engine/auction params from real cricket data
```

Deployed to GitHub Pages. Remote: `github.com/sgundava/cricket-management`. Vite base path is `/cricket-management/`.

## Commands

All frontend work happens in `frontend/`:

```bash
cd frontend
npm install
npm run dev        # local dev server (Vite, default :5173)
npm run build      # tsc -b && vite build
npm run lint       # eslint
npm run deploy     # build + publish dist/ to GitHub Pages (gh-pages)
```

Backend (optional, only if working on/with the API):

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # serves :8000, /docs when DEBUG=true
# or: docker-compose up
pytest                          # backend tests
```

There is no test runner wired into the frontend; `src/engine/matchSimulator.ts` is a batch validation harness for the match engine (run via the in-app DebugButton).

## Architecture — frontend

**Single source of truth: `src/store/gameStore.ts`** (~3,000 lines, Zustand + `persist` middleware). Nearly all game logic and state transitions live here. The store auto-persists to `localStorage`; explicit save slots (3) are handled by `src/utils/saveManager.ts`.

- `src/types/index.ts` — the complete domain model (Player, Team, Match, AuctionState, GameState, etc.). **Read this first** to understand any feature.
- `src/App.tsx` — screen router (a `switch` on `currentScreen`); no react-router. `currentScreen` is UI-only and NOT persisted — `App.tsx` restores the correct screen from persisted `phase`/`liveMatchState` on load.
- `src/screens/` — one component per screen (Home, Squad, Auction, MatchLive, MatchPrep, Schedule, Stats, etc.).
- `src/components/` — shared UI (NavBar, modals, PlayerCard, etc.).
- `src/config/gameConfig.ts` — tunable game constants (auction purse/retention/RTM rules, squad limits, overs, bowling-tactic thresholds).

**Engine (`src/engine/`) — runs locally, no backend needed:**
- `matchEngine.ts` — core ball-by-ball simulation. Supports t20/odi/test via `FORMAT_CONFIGS`. Exports `simulateMatch`, `simulateOver`, `simulateSingleBall`, `generateDefaultTactics`, `selectSmartBowler`, `getFormatConfig`.
- `matchSimulator.ts` — batch-runs the engine to validate realistic stat distributions (not used during normal play).
- `auctionAI.ts`, `auctionPricing.ts`, `aiSquadManagement.ts` — AI bidding, data-driven pricing, and AI retention/release logic.

**Data (`src/data/`):** static seed data — `players.ts` (~530 players, large file), `teams.ts`, `leagues.ts`, `countries.ts`, `fixtures.ts`, `internationalCalendar.ts`, `auction.ts`/`auctionData.ts` (auction pool generation + helpers), `events.ts` (random narrative events).

**Services (`src/services/api/`) — the optional backend bridge:** `client.ts` does health-checking with automatic offline mode; `match.service.ts` and `events.service.ts` call the backend but the game falls back to the local engine when offline. The live match UI (`MatchLiveScreen.tsx`) drives simulation through the local engine directly.

## Architecture — backend (optional)

FastAPI app under `backend/app/`. Two endpoint groups (`app/api/v1/`): `/match` (simulation) and `/events` (generation). Match probabilities are driven by YAML in `backend/config/probability_params*.yaml` (per-format: t20/odi/test). Event templates are YAML in `backend/config/event_templates/`. The frontend does NOT require this to function.

## Game modes & formats

- **Franchise mode** — league play (IPL + others: BBL, CPL, PSL, T20 Blast), full auction system (mega/mini, retention, RTM), seasons, playoffs.
- **International mode** — manage a country across a calendar of bilateral series + ICC events, in all three formats. Gated behind the `VITE_ENABLE_INTERNATIONAL_MODE` env flag.
- **Formats:** `t20`, `odi`, `test` (Test supports 4 innings, declarations, day tracking).

## Conventions & gotchas

- **Money is in lakhs** throughout the auction/contract code (e.g. `14000` = ₹140 Cr purse). `Team.budget` is in crores in some surfaces — check the field's comment in `types/index.ts`.
- **Player skills are 0–100**; dynamic state is `form` (−20..+20), `fitness`/`morale`/`fatigue` (0–100).
- `InningsState` uses `Map`s for batter/bowler stats; the persisted/serialized variant (`SerializedInningsState`) converts them to plain objects. Convert at the persistence boundary.
- **`.gitignore` excludes ALL `*.md` files** plus `.claude/`, `.cursor/`, `.ai/`, `.github/`. This file and `SESSION_LOG.md` are therefore untracked by default (Claude Code still reads them from disk). README.md is the exception (force-added). If you want docs committed, `git add -f`.
- New screens require three edits: a `Screen` union member in `types/index.ts`, a `case` in `App.tsx`'s `renderScreen()`, and (usually) NavBar visibility rules in `App.tsx`'s `hideNavScreens`.
- After changing the persisted state shape, remember existing `localStorage` saves may be stale — guard against missing fields.

## Workflow notes

- Keep `SESSION_LOG.md` updated at the end of meaningful work sessions (see that file for format).
- Prefer reading `types/index.ts` and `gameStore.ts` before touching any feature — most logic funnels through the store.
