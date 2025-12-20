/**
 * Match Engine Batch Simulation & Validation
 *
 * Runs large batches of simulated matches to validate the match engine
 * produces realistic T20 cricket statistics.
 *
 * Expected T20 Ranges (from real IPL data):
 * - Average score: 155-175 (first innings tends to be higher)
 * - Average wickets: 6-7 per innings
 * - Boundary rate: 16-20% of balls
 * - Dot ball rate: 35-40%
 * - Run rate: 7.5-9.0 per over
 */

import { Player, Match, PitchConditions, InningsState } from '../types';
import { simulateMatch, generateDefaultTactics } from './matchEngine';
import { teams } from '../data/teams';
import { allPlayers } from '../data/players';

// ============================================
// TYPES
// ============================================

export interface InningsStats {
  runs: number;
  wickets: number;
  overs: number;
  fours: number;
  sixes: number;
  dots: number;
  totalBalls: number;
}

export interface MatchStats {
  firstInnings: InningsStats;
  secondInnings: InningsStats;
  winMarginRuns: number | null;
  winMarginWickets: number | null;
  wasTie: boolean;
  chaseSuccessful: boolean;
}

export interface SimulationResults {
  matchCount: number;
  timeElapsedMs: number;

  // Score distributions
  avgFirstInningsScore: number;
  avgSecondInningsScore: number;
  avgWickets: number;
  minScore: number;
  maxScore: number;

  // Score buckets
  scoresUnder100: number;
  scores100to140: number;
  scores140to170: number;
  scores170to200: number;
  scoresOver200: number;

  // Ball-level stats
  boundaryRate: number;      // (4s + 6s) / totalBalls
  fourRate: number;          // 4s / totalBalls
  sixRate: number;           // 6s / totalBalls
  dotBallRate: number;       // dots / totalBalls
  avgRunRate: number;        // runs / overs

  // Match outcomes
  chaseSuccessRate: number;  // % of chases won
  avgWinByRuns: number;      // When batting first wins
  avgWinByWickets: number;   // When chasing team wins
  tieRate: number;           // % of ties

  // Wicket distribution
  allOutRate: number;        // % of innings where all 10 wickets fell
  avgWicketsFirst: number;
  avgWicketsSecond: number;
}

export interface ValidationResult {
  passed: boolean;
  category: string;
  metric: string;
  actual: number;
  expected: { min: number; max: number };
  status: 'PASS' | 'WARN' | 'FAIL';
}

// ============================================
// EXPECTED RANGES (from real T20/IPL data)
// ============================================

// Expected ranges calibrated from IPL data (2009-2025)
const EXPECTED_RANGES = {
  avgScore: { min: 145, max: 180 },
  avgWickets: { min: 5, max: 8 },
  boundaryRate: { min: 0.14, max: 0.22 },
  dotBallRate: { min: 0.30, max: 0.45 },
  avgRunRate: { min: 7.0, max: 9.5 },
  chaseSuccessRate: { min: 0.40, max: 0.60 },
  allOutRate: { min: 0.05, max: 0.15 },  // IPL reality: 8.8% all-out rate
  scoresUnder100Rate: { min: 0, max: 0.05 },  // Should be rare
  scoresOver200Rate: { min: 0.02, max: 0.20 }, // Some high scores expected
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const extractInningsStats = (innings: InningsState): InningsStats => {
  let fours = 0;
  let sixes = 0;
  let dots = 0;
  let totalBalls = 0;

  // Count from batter stats
  innings.batterStats.forEach((stats) => {
    fours += stats.fours;
    sixes += stats.sixes;
    totalBalls += stats.balls;
  });

  // Count dots from bowler stats
  innings.bowlerStats.forEach((stats) => {
    dots += stats.dots;
  });

  // Calculate total balls from overs + remaining balls
  const calculatedBalls = innings.overs * 6 + innings.balls;

  return {
    runs: innings.runs,
    wickets: innings.wickets,
    overs: innings.overs + innings.balls / 6,
    fours,
    sixes,
    dots,
    totalBalls: calculatedBalls || totalBalls,
  };
};

const getTeamPlayers = (teamId: string): Player[] => {
  const team = teams.find(t => t.id === teamId);
  if (!team) return [];
  return allPlayers.filter(p => team.squad.includes(p.id));
};

const getRandomTeamPair = (): [string, string] => {
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  return [shuffled[0].id, shuffled[1].id];
};

const createTestMatch = (homeTeamId: string, awayTeamId: string): Match => {
  const homePlayers = getTeamPlayers(homeTeamId);
  const awayPlayers = getTeamPlayers(awayTeamId);

  const homeTeam = teams.find(t => t.id === homeTeamId)!;
  const awayTeam = teams.find(t => t.id === awayTeamId)!;

  const pitch: PitchConditions = {
    pace: 50 + Math.floor(Math.random() * 20) - 10,
    spin: 50 + Math.floor(Math.random() * 20) - 10,
    bounce: 50 + Math.floor(Math.random() * 20) - 10,
    deterioration: 0,
  };

  // Handle nullable captains
  const homeCaptain = homeTeam.captain || homePlayers[0]?.id || '';
  const awayCaptain = awayTeam.captain || awayPlayers[0]?.id || '';

  return {
    id: `test-${Date.now()}-${Math.random()}`,
    homeTeam: homeTeamId,
    awayTeam: awayTeamId,
    venue: homeTeam.homeVenue,
    matchNumber: 0,
    matchType: 'league',
    weather: 'clear',
    status: 'upcoming',
    tossWinner: null,
    tossDecision: null,
    currentInnings: null,
    innings1: null,
    innings2: null,
    result: null,
    homeTactics: generateDefaultTactics(homePlayers, homeCaptain),
    awayTactics: generateDefaultTactics(awayPlayers, awayCaptain),
    pitch,
  };
};

// ============================================
// MAIN SIMULATION FUNCTIONS
// ============================================

export const runBatchSimulation = (
  matchCount: number = 100,
  options: {
    specificTeams?: [string, string];  // Force specific matchup
    verbose?: boolean;                  // Log each match
  } = {}
): SimulationResults => {
  const startTime = Date.now();
  const matchStats: MatchStats[] = [];

  for (let i = 0; i < matchCount; i++) {
    const [homeId, awayId] = options.specificTeams || getRandomTeamPair();
    const homePlayers = getTeamPlayers(homeId);
    const awayPlayers = getTeamPlayers(awayId);

    if (homePlayers.length < 11 || awayPlayers.length < 11) {
      if (options.verbose) {
        console.log(`Skipping match ${i + 1}: Not enough players`);
      }
      continue;
    }

    const match = createTestMatch(homeId, awayId);

    try {
      const result = simulateMatch(homePlayers, awayPlayers, match);

      const firstStats = extractInningsStats(result.firstInnings);
      const secondStats = extractInningsStats(result.secondInnings);

      const stats: MatchStats = {
        firstInnings: firstStats,
        secondInnings: secondStats,
        winMarginRuns: result.winMargin?.type === 'runs' ? result.winMargin.value : null,
        winMarginWickets: result.winMargin?.type === 'wickets' ? result.winMargin.value : null,
        wasTie: result.winner === null,
        chaseSuccessful: result.winMargin?.type === 'wickets' || false,
      };

      matchStats.push(stats);

      if (options.verbose) {
        console.log(
          `Match ${i + 1}: ${firstStats.runs}/${firstStats.wickets} vs ${secondStats.runs}/${secondStats.wickets}` +
          ` | ${stats.chaseSuccessful ? 'Chase won' : stats.wasTie ? 'Tie' : 'Defended'}`
        );
      }
    } catch (error) {
      if (options.verbose) {
        console.error(`Match ${i + 1} failed:`, error);
      }
    }
  }

  const timeElapsedMs = Date.now() - startTime;

  // Aggregate statistics
  return aggregateResults(matchStats, timeElapsedMs);
};

const aggregateResults = (matches: MatchStats[], timeElapsedMs: number): SimulationResults => {
  if (matches.length === 0) {
    throw new Error('No matches completed successfully');
  }

  // Collect all innings
  const allInnings = matches.flatMap(m => [m.firstInnings, m.secondInnings]);
  const firstInnings = matches.map(m => m.firstInnings);
  const secondInnings = matches.map(m => m.secondInnings);

  // Score stats
  const allScores = allInnings.map(i => i.runs);
  const avgFirstInningsScore = firstInnings.reduce((a, b) => a + b.runs, 0) / firstInnings.length;
  const avgSecondInningsScore = secondInnings.reduce((a, b) => a + b.runs, 0) / secondInnings.length;
  const avgWickets = allInnings.reduce((a, b) => a + b.wickets, 0) / allInnings.length;
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);

  // Score buckets
  const scoresUnder100 = allScores.filter(s => s < 100).length;
  const scores100to140 = allScores.filter(s => s >= 100 && s < 140).length;
  const scores140to170 = allScores.filter(s => s >= 140 && s < 170).length;
  const scores170to200 = allScores.filter(s => s >= 170 && s < 200).length;
  const scoresOver200 = allScores.filter(s => s >= 200).length;

  // Ball-level stats
  const totalBalls = allInnings.reduce((a, b) => a + b.totalBalls, 0);
  const totalFours = allInnings.reduce((a, b) => a + b.fours, 0);
  const totalSixes = allInnings.reduce((a, b) => a + b.sixes, 0);
  const totalDots = allInnings.reduce((a, b) => a + b.dots, 0);
  const totalRuns = allInnings.reduce((a, b) => a + b.runs, 0);
  const totalOvers = allInnings.reduce((a, b) => a + b.overs, 0);

  const boundaryRate = totalBalls > 0 ? (totalFours + totalSixes) / totalBalls : 0;
  const fourRate = totalBalls > 0 ? totalFours / totalBalls : 0;
  const sixRate = totalBalls > 0 ? totalSixes / totalBalls : 0;
  const dotBallRate = totalBalls > 0 ? totalDots / totalBalls : 0;
  const avgRunRate = totalOvers > 0 ? totalRuns / totalOvers : 0;

  // Match outcomes
  const chaseWins = matches.filter(m => m.chaseSuccessful).length;
  const ties = matches.filter(m => m.wasTie).length;
  const defenses = matches.filter(m => !m.chaseSuccessful && !m.wasTie).length;

  const winByRunsMatches = matches.filter(m => m.winMarginRuns !== null);
  const winByWicketsMatches = matches.filter(m => m.winMarginWickets !== null);

  const avgWinByRuns = winByRunsMatches.length > 0
    ? winByRunsMatches.reduce((a, b) => a + (b.winMarginRuns || 0), 0) / winByRunsMatches.length
    : 0;

  const avgWinByWickets = winByWicketsMatches.length > 0
    ? winByWicketsMatches.reduce((a, b) => a + (b.winMarginWickets || 0), 0) / winByWicketsMatches.length
    : 0;

  // Wicket distribution
  const allOutCount = allInnings.filter(i => i.wickets >= 10).length;
  const allOutRate = allOutCount / allInnings.length;
  const avgWicketsFirst = firstInnings.reduce((a, b) => a + b.wickets, 0) / firstInnings.length;
  const avgWicketsSecond = secondInnings.reduce((a, b) => a + b.wickets, 0) / secondInnings.length;

  return {
    matchCount: matches.length,
    timeElapsedMs,
    avgFirstInningsScore,
    avgSecondInningsScore,
    avgWickets,
    minScore,
    maxScore,
    scoresUnder100,
    scores100to140,
    scores140to170,
    scores170to200,
    scoresOver200,
    boundaryRate,
    fourRate,
    sixRate,
    dotBallRate,
    avgRunRate,
    chaseSuccessRate: chaseWins / matches.length,
    avgWinByRuns,
    avgWinByWickets,
    tieRate: ties / matches.length,
    allOutRate,
    avgWicketsFirst,
    avgWicketsSecond,
  };
};

// ============================================
// VALIDATION
// ============================================

export const validateResults = (results: SimulationResults): ValidationResult[] => {
  const validations: ValidationResult[] = [];

  const check = (
    category: string,
    metric: string,
    actual: number,
    expected: { min: number; max: number }
  ): ValidationResult => {
    let status: 'PASS' | 'WARN' | 'FAIL';

    if (actual >= expected.min && actual <= expected.max) {
      status = 'PASS';
    } else if (
      actual >= expected.min * 0.9 && actual <= expected.max * 1.1
    ) {
      status = 'WARN';
    } else {
      status = 'FAIL';
    }

    return {
      passed: status === 'PASS',
      category,
      metric,
      actual,
      expected,
      status,
    };
  };

  // Score validations
  const avgScore = (results.avgFirstInningsScore + results.avgSecondInningsScore) / 2;
  validations.push(check('Scoring', 'Average Score', avgScore, EXPECTED_RANGES.avgScore));

  validations.push(check('Scoring', 'Average Wickets', results.avgWickets, EXPECTED_RANGES.avgWickets));

  const scoresUnder100Rate = results.scoresUnder100 / (results.matchCount * 2);
  validations.push(check('Scoring', 'Low Scores (<100) Rate', scoresUnder100Rate, EXPECTED_RANGES.scoresUnder100Rate));

  const scoresOver200Rate = results.scoresOver200 / (results.matchCount * 2);
  validations.push(check('Scoring', 'High Scores (>200) Rate', scoresOver200Rate, EXPECTED_RANGES.scoresOver200Rate));

  // Ball-level validations
  validations.push(check('Ball-level', 'Boundary Rate', results.boundaryRate, EXPECTED_RANGES.boundaryRate));
  validations.push(check('Ball-level', 'Dot Ball Rate', results.dotBallRate, EXPECTED_RANGES.dotBallRate));
  validations.push(check('Ball-level', 'Run Rate', results.avgRunRate, EXPECTED_RANGES.avgRunRate));

  // Match outcome validations
  validations.push(check('Outcomes', 'Chase Success Rate', results.chaseSuccessRate, EXPECTED_RANGES.chaseSuccessRate));
  validations.push(check('Outcomes', 'All Out Rate', results.allOutRate, EXPECTED_RANGES.allOutRate));

  return validations;
};

// ============================================
// REPORT GENERATION
// ============================================

export const generateReport = (results: SimulationResults): string => {
  const validations = validateResults(results);
  const passCount = validations.filter(v => v.status === 'PASS').length;
  const warnCount = validations.filter(v => v.status === 'WARN').length;
  const failCount = validations.filter(v => v.status === 'FAIL').length;

  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║           MATCH ENGINE SIMULATION REPORT                    ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Matches Simulated: ${results.matchCount}`,
    `Time Elapsed: ${(results.timeElapsedMs / 1000).toFixed(2)}s`,
    `Speed: ${(results.matchCount / (results.timeElapsedMs / 1000)).toFixed(1)} matches/sec`,
    '',
    '─────────────────── SCORE DISTRIBUTION ────────────────────────',
    '',
    `Average 1st Innings: ${results.avgFirstInningsScore.toFixed(1)}`,
    `Average 2nd Innings: ${results.avgSecondInningsScore.toFixed(1)}`,
    `Score Range: ${results.minScore} - ${results.maxScore}`,
    '',
    `Under 100:   ${results.scoresUnder100} (${(results.scoresUnder100 / (results.matchCount * 2) * 100).toFixed(1)}%)`,
    `100-140:     ${results.scores100to140} (${(results.scores100to140 / (results.matchCount * 2) * 100).toFixed(1)}%)`,
    `140-170:     ${results.scores140to170} (${(results.scores140to170 / (results.matchCount * 2) * 100).toFixed(1)}%)`,
    `170-200:     ${results.scores170to200} (${(results.scores170to200 / (results.matchCount * 2) * 100).toFixed(1)}%)`,
    `Over 200:    ${results.scoresOver200} (${(results.scoresOver200 / (results.matchCount * 2) * 100).toFixed(1)}%)`,
    '',
    '─────────────────── BALL-LEVEL STATS ──────────────────────────',
    '',
    `Boundary Rate: ${(results.boundaryRate * 100).toFixed(1)}% (4s: ${(results.fourRate * 100).toFixed(1)}%, 6s: ${(results.sixRate * 100).toFixed(1)}%)`,
    `Dot Ball Rate: ${(results.dotBallRate * 100).toFixed(1)}%`,
    `Run Rate: ${results.avgRunRate.toFixed(2)} per over`,
    '',
    '─────────────────── MATCH OUTCOMES ────────────────────────────',
    '',
    `Chase Success Rate: ${(results.chaseSuccessRate * 100).toFixed(1)}%`,
    `Avg Win by Runs: ${results.avgWinByRuns.toFixed(1)}`,
    `Avg Win by Wickets: ${results.avgWinByWickets.toFixed(1)}`,
    `Tie Rate: ${(results.tieRate * 100).toFixed(1)}%`,
    '',
    '─────────────────── WICKET STATS ──────────────────────────────',
    '',
    `Average Wickets: ${results.avgWickets.toFixed(1)}`,
    `1st Innings Avg: ${results.avgWicketsFirst.toFixed(1)}`,
    `2nd Innings Avg: ${results.avgWicketsSecond.toFixed(1)}`,
    `All-Out Rate: ${(results.allOutRate * 100).toFixed(1)}%`,
    '',
    '═══════════════════ VALIDATION RESULTS ════════════════════════',
    '',
  ];

  // Group validations by category
  const categories = [...new Set(validations.map(v => v.category))];

  for (const category of categories) {
    lines.push(`[${category}]`);
    const categoryValidations = validations.filter(v => v.category === category);

    for (const v of categoryValidations) {
      const icon = v.status === 'PASS' ? '✓' : v.status === 'WARN' ? '⚠' : '✗';
      const actualStr = typeof v.actual === 'number' && v.actual < 1
        ? `${(v.actual * 100).toFixed(1)}%`
        : v.actual.toFixed(1);
      const expectedStr = v.expected.max < 1
        ? `${(v.expected.min * 100).toFixed(0)}-${(v.expected.max * 100).toFixed(0)}%`
        : `${v.expected.min.toFixed(0)}-${v.expected.max.toFixed(0)}`;

      lines.push(`  ${icon} ${v.metric}: ${actualStr} (expected: ${expectedStr})`);
    }
    lines.push('');
  }

  lines.push('─────────────────────────────────────────────────────────────');
  lines.push(`SUMMARY: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL`);
  lines.push('');

  if (failCount > 0) {
    lines.push('⚠️  Some validations failed. Consider adjusting match engine parameters.');
  } else if (warnCount > 0) {
    lines.push('✓ All critical validations passed. Some metrics are borderline.');
  } else {
    lines.push('✓ All validations passed! Match engine is producing realistic results.');
  }

  return lines.join('\n');
};

// ============================================
// QUICK TEST (for console/debug use)
// ============================================

export const runQuickTest = (matchCount: number = 50): void => {
  console.log(`\nRunning ${matchCount} match simulation...\n`);

  const results = runBatchSimulation(matchCount, { verbose: false });
  const report = generateReport(results);

  console.log(report);
};

// Export for use in debug button or console
export const runSimulation = runBatchSimulation;
