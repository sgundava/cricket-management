import {
  Player,
  PlayerDevelopmentResult,
  SkillChange,
  DevelopmentBand,
} from '../types';
import { DEVELOPMENT_CONFIG as DC } from '../config/gameConfig';

// ============================================
// PLAYER DEVELOPMENT ENGINE
// ============================================
// Pure functions that age players one season and shift their skills toward
// their `potential` ceiling (when young) or downward (with age). Driven by the
// age curve, headroom, playing time, season performance, and a luck roll.
// Nothing here mutates input players — callers receive new objects.

/** A player's aggregate contribution across a completed season. */
export interface SeasonAppearance {
  appearances: number; // matches featured in (batted and/or bowled)
  runs: number;
  wickets: number;
}

type SkillKind = 'physical' | 'technical';

interface SkillDef {
  category: 'batting' | 'bowling' | 'fielding';
  key: string;
  kind: SkillKind;
}

// Physical skills fade with age; technical/mental ones age gracefully.
const SKILL_DEFS: SkillDef[] = [
  { category: 'batting', key: 'technique', kind: 'technical' },
  { category: 'batting', key: 'power', kind: 'physical' },
  { category: 'batting', key: 'timing', kind: 'technical' },
  { category: 'batting', key: 'temperament', kind: 'technical' },
  { category: 'bowling', key: 'speed', kind: 'physical' },
  { category: 'bowling', key: 'accuracy', kind: 'technical' },
  { category: 'bowling', key: 'variation', kind: 'technical' },
  { category: 'bowling', key: 'stamina', kind: 'physical' },
  { category: 'fielding', key: 'catching', kind: 'technical' },
  { category: 'fielding', key: 'ground', kind: 'physical' },
  { category: 'fielding', key: 'throwing', kind: 'physical' },
  { category: 'fielding', key: 'athleticism', kind: 'physical' },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const bandForAge = (age: number): DevelopmentBand => {
  if (age <= DC.YOUTH_MAX_AGE) return 'youth';
  if (age <= DC.PRIME_MAX_AGE) return 'prime';
  if (age <= DC.DECLINE_MAX_AGE) return 'decline';
  return 'veteran';
};

const avg = (...vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;

const categoryAverage = (player: Player, category: 'batting' | 'bowling' | 'fielding'): number => {
  const s = player[category] as unknown as Record<string, number>;
  return avg(...SKILL_DEFS.filter((d) => d.category === category).map((d) => s[d.key]));
};

// Role-weighted overall rating used purely for the report's delta/sort.
export const getOverall = (player: Player): number => {
  const bat = categoryAverage(player, 'batting');
  const bowl = categoryAverage(player, 'bowling');
  const fld = categoryAverage(player, 'fielding');
  let w: { bat: number; bowl: number; fld: number };
  switch (player.role) {
    case 'bowler':
      w = { bat: 0.15, bowl: 0.7, fld: 0.15 };
      break;
    case 'allrounder':
      w = { bat: 0.4, bowl: 0.45, fld: 0.15 };
      break;
    case 'keeper':
      w = { bat: 0.6, bowl: 0.05, fld: 0.35 };
      break;
    case 'batsman':
    default:
      w = { bat: 0.7, bowl: 0.1, fld: 0.2 };
      break;
  }
  return Math.round(bat * w.bat + bowl * w.bowl + fld * w.fld);
};

// How much a player's season output exceeds a "regular contributor" baseline,
// normalized to 0..1. Bowlers judged on wickets, others on runs.
const performanceScore = (player: Player, app: SeasonAppearance): number => {
  if (app.appearances <= 0) return 0;
  let score = 0;
  if (player.role !== 'bowler') {
    const runsPerGame = app.runs / app.appearances;
    score = Math.max(score, clamp(runsPerGame / 40, 0, 1)); // ~40 rpi = elite
  }
  if (player.role === 'bowler' || player.role === 'allrounder') {
    const wktsPerGame = app.wickets / app.appearances;
    score = Math.max(score, clamp(wktsPerGame / 1.2, 0, 1)); // ~1.2 wpi = elite
  }
  return score;
};

/**
 * Develop a single player by one season. Returns a new player object (with
 * age incremented and skills shifted) plus a result describing the changes.
 * Contract/form/fitness resets remain the caller's responsibility.
 */
export const developPlayer = (
  player: Player,
  app: SeasonAppearance = { appearances: 0, runs: 0, wickets: 0 }
): { player: Player; result: PlayerDevelopmentResult } => {
  const band = bandForAge(player.age);
  const overallBefore = getOverall(player);

  // Playing-time modifiers.
  const playRatio = clamp(app.appearances / DC.APPEARANCES_FOR_FULL_GROWTH, 0, 1);
  const growthPlayMult = DC.BENCH_GROWTH_MULT + (1 - DC.BENCH_GROWTH_MULT) * playRatio;
  const declinePlayMult = app.appearances >= DC.REGULAR_APPEARANCES ? 1 : DC.BENCH_DECLINE_MULT;

  // Standout seasons accelerate growth.
  const perfMult = 1 + DC.PERFORMANCE_BONUS_MAX * performanceScore(player, app);

  // One luck roll per player per season so a "breakout" lifts everything together.
  const luck = 1 + (Math.random() * 2 - 1) * DC.RANDOM_VARIATION;

  const batting = { ...player.batting };
  const bowling = { ...player.bowling };
  const fielding = { ...player.fielding };
  const buckets: Record<string, Record<string, number>> = { batting, bowling, fielding };

  const changes: SkillChange[] = [];

  for (const def of SKILL_DEFS) {
    const cur = buckets[def.category][def.key];
    const cap = player.potential[def.category];
    let next = cur;

    if (band === 'youth' || band === 'prime') {
      const headroom = Math.max(0, cap - cur);
      const rate = band === 'youth' ? DC.GROWTH.youth : DC.GROWTH.prime;
      const gain = headroom * rate * growthPlayMult * perfMult * luck;
      next = Math.min(cur + gain, cap); // never overshoot potential
    } else {
      const base = band === 'decline' ? DC.DECLINE.decline : DC.DECLINE.veteran;
      const kindMult = def.kind === 'physical' ? DC.PHYSICAL_DECLINE_MULT : DC.TECHNICAL_DECLINE_MULT;
      const loss = base * kindMult * declinePlayMult * luck;
      next = cur - loss;
    }

    next = clamp(Math.round(next), 0, 100);
    if (next !== cur) {
      buckets[def.category][def.key] = next;
      changes.push({ category: def.category, skill: def.key, before: cur, after: next });
    }
  }

  changes.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));

  const updated: Player = {
    ...player,
    age: player.age + 1,
    batting: batting as Player['batting'],
    bowling: bowling as Player['bowling'],
    fielding: fielding as Player['fielding'],
  };

  const overallAfter = getOverall(updated);

  return {
    player: updated,
    result: {
      playerId: player.id,
      ageAfter: updated.age,
      band,
      overallBefore,
      overallAfter,
      delta: overallAfter - overallBefore,
      changes,
    },
  };
};

/**
 * Develop every player by one season. `appearances` maps player id -> season
 * contribution; missing entries are treated as zero playing time.
 */
export const developAllPlayers = (
  players: Player[],
  appearances: Map<string, SeasonAppearance>
): { players: Player[]; reports: PlayerDevelopmentResult[] } => {
  const out: Player[] = [];
  const reports: PlayerDevelopmentResult[] = [];
  for (const p of players) {
    const { player, result } = developPlayer(p, appearances.get(p.id));
    out.push(player);
    reports.push(result);
  }
  return { players: out, reports };
};
