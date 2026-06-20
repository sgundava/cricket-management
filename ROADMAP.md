# Roadmap

Strategy: **make the IPL/franchise the deepest cricket *management* experience first**, one
system at a time. Breadth (other leagues, international, ODI/Test in franchise) comes after
the management core is rich. Build → iterate → move on. See also `cricket-mgmt-roadmap`
memory and `CLAUDE.md`.

The three pillars the owner cares about: **(A) management depth**, **(B) richer match & tactics**,
**(C) stats / history / polish**. Management depth (A) is the current track.

---

## ✅ Phase 1 — Player Development & Training (DONE, 2026-06-19)

The spine of the management game. Previously `potential` was dead data and players' skills
were frozen for their whole careers.

- **Slice 1 — passive development.** Players grow/decline every season end via an age curve
  (youth grow → prime plateau → 30-33 decline → 34+ steep), headroom-to-`potential`,
  playing-time & performance (read from fixtures), and a physical-vs-technical split
  (pace/stamina/athleticism fade fast; technique/temperament age well). New
  `engine/playerDevelopment.ts`, `DEVELOPMENT_CONFIG` in `gameConfig.ts`, wired into
  `processSeasonEnd`. New **Development Report** screen after "Continue to Season N+1".
- **Slice 2 — active training.** Per-player **training focus** (power-hitting, batting-technique,
  pace-bowling, bowling-craft, fielding, fitness) + **intensity** (light/normal/intensive) that
  boosts growth / slows decline on targeted skills, at a season-start fitness cost for intensive
  work. `TRAINING_CONFIG`, `setPlayerTraining`, new **Training Centre** screen (linked from Club),
  trained-focus chip shown in the Development Report.

**Owner to playtest:** tune `DEVELOPMENT_CONFIG` / `TRAINING_CONFIG` numbers after feeling a full season.

---

## Phase 2 — Coaching Staff  ← recommended next

**Goal:** hire/fire coaches who multiply the development & training system. There's already a
"Staff Management — Coming Soon" placeholder on `ClubScreen`.

**Why now:** it plugs directly into what Phase 1 just built — coaches are multipliers on
development, so the value is immediate and the engine hook already exists (`developPlayer`).

**Build:**
- *Model:* `Coach { id, name, role: 'head'|'batting'|'bowling'|'fielding'|'fitness', quality 0-100, salary }`.
  Add `Team.staff` (player team; AI teams can have implicit average staff).
- *Engine:* `developPlayer` takes a staff-multiplier per category; better batting coach →
  faster batting growth / slower batting-skill decline. Fitness coach → less physical decline
  + lower injury risk (ties into Phase 4). Head coach → small global bonus + affects morale.
- *Store:* `hireCoach` / `fireCoach`, salary deducted from budget; a small free-agent coach market.
- *UI:* Staff screen (replace the placeholder) — current staff, a hire market with quality/salary,
  budget impact. Surface staff effect in the Development Report ("+batting coach").

**Dependencies:** none beyond Phase 1.

---

## Phase 3 — Youth Academy & Scouting

**Goal:** the "find a raw gem and develop him" loop — the heart of a cricket management game.

**Build:**
- *Model:* an academy pool of young (16-19) generated players with high `potential` but low
  current skills and **hidden/fuzzy potential** until scouted.
- *Engine:* generation (regional flavour, position needs), a scouting accuracy model (scout
  network quality → how tight the revealed potential range is), promotion to senior squad.
- *Store:* `scoutPlayer`, `promoteYouth`, intake each off-season.
- *UI:* Academy screen; scouting reports; promote flow. Promoted youngsters feed Training (Phase 1).

**Dependencies:** Phase 1 (development), ideally Phase 2 (a youth/academy coach matters).

---

## Phase 4 — Injuries & Fitness Over Time

**Goal:** make squad depth, rotation, and training intensity carry real risk — closes the loop on
the training cost from Phase 1 Slice 2.

**Build:**
- *Engine:* injury rolls driven by fatigue, fitness, age, and training intensity (in matches and in
  training); severity + recovery timeline; physio/fitness coach reduces risk & speeds recovery.
- *Store:* injury state on `Player` (type, weeks out), recovery on `advanceDay`, auto-exclusion
  from XI selection, rotation prompts.
- *UI:* injury badges in Squad/MatchPrep, an injury list on Home/Club, recovery countdowns.

**Dependencies:** Phase 1 (fatigue/fitness already exist); Phase 2 (fitness coach lever).

---

## Phase 5 — Contracts & Player Happiness (between auctions)

**Goal:** retain the players you developed; manage unhappiness so stars don't walk.

**Build:** mid-cycle contract extensions/renegotiation; player unhappiness from playing time,
role vs `playingRole`, ambition, and being overlooked; transfer/release requests; wage budget
pressure. Ties into existing morale/personality and the auction.

**Dependencies:** Phases 1-3 (you need players worth keeping).

---

## Cross-cutting / foundational (slot in when going public)

- **Save schema versioning + migration.** Persisted-state changes risk breaking saves
  (`onRehydrateStorage` does ad-hoc validation today). Add a `version` + migration chain before a
  wide public release so we can ship-iterate-ship without burning testers. *Note:* Phase 1 & 2
  added optional fields only (`Player.trainingFocus/Intensity`, `GameState.lastDevelopmentReport`),
  which are backward-compatible with old saves, but this won't always hold.
- **Persistent career stats.** Stats are recomputed from `fixtures` each render and wiped on
  `resetForNewSeason`, so there's no career/all-time history. A persistent per-player season+career
  stat store unlocks pillar (C) (records, awards, head-to-head) *and* would feed development's
  performance signal more richly. Good companion to Phase 3/5.

## Later (breadth — after the management core is rich)

1. **ODI / Test in franchise** — engine already calibrated for both formats; mostly flow/UI wiring.
2. **International mode** — currently a BETA stub (hardcoded opponent/venues, no real series sim).
3. **Other leagues** (BBL, CPL, PSL, T20 Blast).

## Hosting / monetization (deferred)

Stay on GitHub Pages while the game is a static client-side bundle (≈zero server load). Move to a
multi-region backend (Vercel/Railway + DB/CDN in Asia/Oceania/Europe) only when server-side
simulation is needed. Monetization (accounts + cloud saves + entitlements, e.g. Supabase) is
secondary — only to offset hosting.

**Deploy note:** there is no CI auto-deploy. Pushing to `master` does **not** publish the site.
Run `cd frontend && npm run deploy` (builds + pushes `dist/` to the `gh-pages` branch via the
`gh-pages` package). GitHub Pages must be set to serve from the `gh-pages` branch.
