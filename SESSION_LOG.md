# Session Log

Running log of work sessions, to carry context across Claude Code sessions. Newest entries on top. Keep entries terse and factual: what changed, why, what's left, and any decisions/gotchas worth remembering.

> Format per entry:
> ```
> ## YYYY-MM-DD — <short title>
> **Done:** what shipped this session
> **Decisions:** non-obvious choices and why
> **Open / next:** unfinished threads, TODOs, known issues
> **Notes:** gotchas, file pointers
> ```

---

## 2026-06-19 — Player Development & Training (management-depth Phase 1)

**Done:** Built the player development system end-to-end (two slices), both `tsc -b` + `vite build` green; new files lint clean.
- *Slice 1 (passive):* new `engine/playerDevelopment.ts` ages players & shifts skills each season — age curve (youth grow → prime plateau → 30-33 decline → 34+ steep), growth scaled by headroom to `potential`, modulated by playing-time/performance (read from `fixtures`), physical skills (pace/stamina/athleticism) decay faster than technical/mental ones. `DEVELOPMENT_CONFIG` in `gameConfig.ts`. Wired into `processSeasonEnd` (computes per-player appearances from completed fixtures before they're reset; stores `GameState.lastDevelopmentReport`). New `DevelopmentReportScreen` shown after "Continue to Season N+1" via `startNextSeason` → `development-report` → `continueToAuctionPhase`.
- *Slice 2 (active):* per-player **training focus** + **intensity** (`TRAINING_CONFIG`, `Player.trainingFocus/trainingIntensity`, `setPlayerTraining`). Boosts growth / slows decline on targeted skills; intensive training costs season-start fitness. New `TrainingScreen` linked from `ClubScreen` "TEAM ACTIONS". Trained-focus chip surfaced in the Development Report. Training cleared on release (`confirmReleases`).

**Decisions:** `potential` was previously dead data (display-only) and skills were frozen for a career — development is the spine the rest of management depth hangs off. Gave development its own screen (vs cramming into Season Summary) because `processSeasonEnd` runs on the *Continue* click, after the summary. New fields are all optional → backward-compatible with old localStorage saves. Pre-existing lint debt in `gameStore.ts`/`ClubScreen.tsx` (unused vars) left untouched to keep the diff focused.

**Open / next:** Owner to playtest a full season and tune `DEVELOPMENT_CONFIG`/`TRAINING_CONFIG`. Next phase = **Coaching Staff** (multipliers on development; `ClubScreen` already has a "Staff — Coming Soon" placeholder). Full plan in new `ROADMAP.md`.

**Notes:** Sanity-checked curves numerically (prospect 50→74; express pace 90→57; veteran technique ages gracefully; fitness focus buys an aging quick ~+7 pace over 4 yrs). New screens need 3 edits each (Screen union in `types`, `App.tsx` renderScreen + `hideNavScreens`). Deploy is manual: `cd frontend && npm run deploy` (no CI auto-deploy; push to master does NOT publish).

---

## 2026-06-19 — Set up cross-session docs

**Done:** Reviewed the codebase end-to-end and created `CLAUDE.md` (architecture + commands + conventions) and this `SESSION_LOG.md`. README.md was heavily outdated (claimed backend was "WIP", version "v0.8 Beta"); refreshed it to match current state.

**Decisions:** Documented the frontend as the primary product and the backend as optional (game runs fully client-side with localStorage persistence + a local match engine; backend only offloads match-sim/event-gen with graceful offline fallback).

**Open / next:** Nothing in progress. The repo's `.gitignore` excludes all `*.md` and `.claude/`, so `CLAUDE.md`/`SESSION_LOG.md` are untracked by default — decide whether to `git add -f` them so they version with the repo.

**Notes:** Core logic funnels through `frontend/src/store/gameStore.ts` (~3k lines) and the domain model lives in `frontend/src/types/index.ts`. Match engine is `frontend/src/engine/matchEngine.ts`.
