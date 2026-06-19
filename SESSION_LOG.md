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

## 2026-06-19 — Set up cross-session docs

**Done:** Reviewed the codebase end-to-end and created `CLAUDE.md` (architecture + commands + conventions) and this `SESSION_LOG.md`. README.md was heavily outdated (claimed backend was "WIP", version "v0.8 Beta"); refreshed it to match current state.

**Decisions:** Documented the frontend as the primary product and the backend as optional (game runs fully client-side with localStorage persistence + a local match engine; backend only offloads match-sim/event-gen with graceful offline fallback).

**Open / next:** Nothing in progress. The repo's `.gitignore` excludes all `*.md` and `.claude/`, so `CLAUDE.md`/`SESSION_LOG.md` are untracked by default — decide whether to `git add -f` them so they version with the repo.

**Notes:** Core logic funnels through `frontend/src/store/gameStore.ts` (~3k lines) and the domain model lives in `frontend/src/types/index.ts`. Match engine is `frontend/src/engine/matchEngine.ts`.
