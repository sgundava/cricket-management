/**
 * AI Squad Management
 *
 * Handles AI team decisions for:
 * - Mega Auction: Which players to retain (generateAIRetentions)
 * - Mini Auction: Which players to release (generateAIReleases)
 *
 * Each team has a distinct personality that influences their decisions.
 */

import { Player, Team, RetentionSlot } from '../types';
import { calculatePlayerValue } from '../data/auction';
import { AUCTION_STATS } from '../data/auctionData';
import { AUCTION_CONFIG } from '../config/gameConfig';

// ============================================
// CONFIGURATION
// ============================================

export const AI_SQUAD_CONFIG = {
  // Retention settings
  CORE_PLAYER_THRESHOLD: 75, // Value above which player is "core"
  YOUNG_TALENT_AGE: 24, // Age below which player is "young talent"
  YOUNG_TALENT_VALUE: 50, // Minimum value for young talent protection

  // Release settings
  POOR_VALUE_THRESHOLD: 40,
  POOR_VALUE_AGE: 30,
  MAX_RELEASES: 8,

  // Role targets for balanced squad
  ROLE_TARGETS: {
    batsman: 5,
    bowler: 5,
    allrounder: 3,
    keeper: 2,
  } as Record<string, number>,
};

// ============================================
// TEAM PERSONALITY PROFILES
// ============================================

interface TeamRetentionProfile {
  retentionStyle: string;
  retentionCount: { min: number; max: number };
  releaseCount: { min: number; max: number };
  preferences: {
    experienceBonus: number; // Bonus for age 30+
    youthBonus: number; // Bonus for age < 26
    starBonus: number; // Bonus for value > 80
    allrounderBonus: number; // Bonus for all-rounders
    paceBonus: number; // Bonus for pace bowlers
    spinBonus: number; // Bonus for spinners
    overseasBonus: number; // Bonus for overseas players
    variance: number; // Random variance in decisions (0-1)
  };
}

const TEAM_RETENTION_PROFILES: Record<string, TeamRetentionProfile> = {
  csk: {
    retentionStyle: 'Experience-first',
    retentionCount: { min: 3, max: 4 },
    releaseCount: { min: 2, max: 3 },
    preferences: {
      experienceBonus: 0.25,
      youthBonus: -0.1,
      starBonus: 0.1,
      allrounderBonus: 0.1,
      paceBonus: 0,
      spinBonus: 0.1,
      overseasBonus: 0,
      variance: 0.05,
    },
  },
  rcb: {
    retentionStyle: 'Star-focused',
    retentionCount: { min: 1, max: 2 },
    releaseCount: { min: 5, max: 7 },
    preferences: {
      experienceBonus: 0,
      youthBonus: 0.1,
      starBonus: 0.3,
      allrounderBonus: 0,
      paceBonus: 0.1,
      spinBonus: 0,
      overseasBonus: 0.15,
      variance: 0.1,
    },
  },
  mi: {
    retentionStyle: 'Core-builder',
    retentionCount: { min: 2, max: 3 },
    releaseCount: { min: 3, max: 5 },
    preferences: {
      experienceBonus: 0.1,
      youthBonus: 0.1,
      starBonus: 0.15,
      allrounderBonus: 0.2,
      paceBonus: 0.1,
      spinBonus: 0,
      overseasBonus: 0.1,
      variance: 0.05,
    },
  },
  pbks: {
    retentionStyle: 'Unpredictable',
    retentionCount: { min: 1, max: 3 },
    releaseCount: { min: 5, max: 6 },
    preferences: {
      experienceBonus: 0,
      youthBonus: 0.15,
      starBonus: 0.2,
      allrounderBonus: 0.1,
      paceBonus: 0.1,
      spinBonus: 0,
      overseasBonus: 0.1,
      variance: 0.25, // High variance = unpredictable
    },
  },
  kkr: {
    retentionStyle: 'Spin-focused',
    retentionCount: { min: 2, max: 3 },
    releaseCount: { min: 3, max: 4 },
    preferences: {
      experienceBonus: 0.1,
      youthBonus: 0.1,
      starBonus: 0.1,
      allrounderBonus: 0.15,
      paceBonus: 0,
      spinBonus: 0.2,
      overseasBonus: 0.1,
      variance: 0.1,
    },
  },
  srh: {
    retentionStyle: 'Pace-focused',
    retentionCount: { min: 2, max: 3 },
    releaseCount: { min: 3, max: 4 },
    preferences: {
      experienceBonus: 0,
      youthBonus: 0.15,
      starBonus: 0.15,
      allrounderBonus: 0.1,
      paceBonus: 0.25,
      spinBonus: -0.1,
      overseasBonus: 0.15,
      variance: 0.1,
    },
  },
  dc: {
    retentionStyle: 'Youth-focused',
    retentionCount: { min: 1, max: 2 },
    releaseCount: { min: 4, max: 5 },
    preferences: {
      experienceBonus: -0.15,
      youthBonus: 0.25,
      starBonus: 0.1,
      allrounderBonus: 0.1,
      paceBonus: 0.1,
      spinBonus: 0.1,
      overseasBonus: 0.1,
      variance: 0.1,
    },
  },
  gt: {
    retentionStyle: 'Value-focused',
    retentionCount: { min: 2, max: 3 },
    releaseCount: { min: 3, max: 4 },
    preferences: {
      experienceBonus: 0.05,
      youthBonus: 0.1,
      starBonus: 0.1,
      allrounderBonus: 0.15,
      paceBonus: 0.15,
      spinBonus: 0,
      overseasBonus: 0.05,
      variance: 0.05,
    },
  },
  rr: {
    retentionStyle: 'Analytics-driven',
    retentionCount: { min: 3, max: 4 },
    releaseCount: { min: 3, max: 4 },
    preferences: {
      experienceBonus: 0,
      youthBonus: 0.1,
      starBonus: 0.05,
      allrounderBonus: 0.15,
      paceBonus: 0.05,
      spinBonus: 0.1,
      overseasBonus: 0.05,
      variance: 0.02, // Very low variance = pure analytics
    },
  },
  lsg: {
    retentionStyle: 'Star + depth',
    retentionCount: { min: 2, max: 3 },
    releaseCount: { min: 3, max: 5 },
    preferences: {
      experienceBonus: 0.05,
      youthBonus: 0.1,
      starBonus: 0.2,
      allrounderBonus: 0.1,
      paceBonus: 0.1,
      spinBonus: 0.05,
      overseasBonus: 0.1,
      variance: 0.1,
    },
  },
};

// Default profile for unknown teams
const DEFAULT_PROFILE: TeamRetentionProfile = {
  retentionStyle: 'Balanced',
  retentionCount: { min: 2, max: 3 },
  releaseCount: { min: 3, max: 5 },
  preferences: {
    experienceBonus: 0,
    youthBonus: 0.1,
    starBonus: 0.1,
    allrounderBonus: 0.1,
    paceBonus: 0.05,
    spinBonus: 0.05,
    overseasBonus: 0.05,
    variance: 0.1,
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getTeamProfile(teamId: string): TeamRetentionProfile {
  return TEAM_RETENTION_PROFILES[teamId] || DEFAULT_PROFILE;
}

function isPaceBowler(player: Player): boolean {
  return (
    player.role === 'bowler' &&
    (player.bowlingStyle === 'right-arm-fast' ||
      player.bowlingStyle === 'left-arm-fast' ||
      player.bowlingStyle === 'right-arm-medium' ||
      player.bowlingStyle === 'left-arm-medium')
  );
}

function isSpinner(player: Player): boolean {
  return (
    player.role === 'bowler' &&
    (player.bowlingStyle === 'off-spin' ||
      player.bowlingStyle === 'left-arm-spin' ||
      player.bowlingStyle === 'leg-spin')
  );
}

/**
 * Calculate retention score for a player based on team preferences
 */
function calculateRetentionScore(
  player: Player,
  team: Team,
  profile: TeamRetentionProfile
): number {
  // Base score from player value (40% weight)
  const baseValue = calculatePlayerValue(player);
  let score = baseValue * 0.4;

  // Age factor (20% weight)
  // Younger players get higher scores for long-term value
  let ageFactor = 1.0;
  if (player.age < 23) ageFactor = 1.3;
  else if (player.age < 26) ageFactor = 1.15;
  else if (player.age < 30) ageFactor = 1.0;
  else if (player.age < 34) ageFactor = 0.85;
  else ageFactor = 0.7;
  score += baseValue * 0.2 * ageFactor;

  // Role scarcity (15% weight)
  // Keepers and quality all-rounders are more valuable
  let roleFactor = 1.0;
  if (player.role === 'keeper') roleFactor = 1.2;
  else if (player.role === 'allrounder' && baseValue > 60) roleFactor = 1.25;
  score += baseValue * 0.15 * roleFactor;

  // Form and fitness (10% weight)
  const formFactor = 1 + player.form / 50; // -20 to +20 → 0.6 to 1.4
  const fitnessFactor = player.fitness / 100; // 0 to 1
  score += baseValue * 0.1 * formFactor * fitnessFactor;

  // Overseas status (15% weight)
  // Overseas players are valuable but limited to 8
  if (player.contract.isOverseas) {
    score += baseValue * 0.15 * (1 + profile.preferences.overseasBonus);
  } else {
    score += baseValue * 0.15;
  }

  // Apply team personality modifiers
  const prefs = profile.preferences;

  // Experience bonus (age 30+)
  if (player.age >= 30) {
    score *= 1 + prefs.experienceBonus;
  }

  // Youth bonus (age < 26)
  if (player.age < 26) {
    score *= 1 + prefs.youthBonus;
  }

  // Star player bonus (value > 80)
  if (baseValue > 80) {
    score *= 1 + prefs.starBonus;
  }

  // Role-specific bonuses
  if (player.role === 'allrounder') {
    score *= 1 + prefs.allrounderBonus;
  }
  if (isPaceBowler(player)) {
    score *= 1 + prefs.paceBonus;
  }
  if (isSpinner(player)) {
    score *= 1 + prefs.spinBonus;
  }

  // Captain/Vice-Captain priority
  if (team.captain === player.id || team.viceCaptain === player.id) {
    score *= 1.3; // 30% bonus for leadership
  }

  // Add controlled randomness based on team variance
  const variance = (Math.random() - 0.5) * 2 * prefs.variance;
  score *= 1 + variance;

  return score;
}

/**
 * Calculate release score for a player (higher = more likely to release)
 */
function calculateReleaseScore(
  player: Player,
  team: Team,
  profile: TeamRetentionProfile,
  roleCounts: Record<string, number>
): number {
  const baseValue = calculatePlayerValue(player);
  let releaseScore = 0;

  // Expired contract = must release
  if (player.contract.yearsRemaining <= 0) {
    return 1000; // Very high score = definite release
  }

  // Core player protection (value > 75)
  if (baseValue >= AI_SQUAD_CONFIG.CORE_PLAYER_THRESHOLD) {
    releaseScore -= 50; // Less likely to release
  }

  // Young talent protection
  if (
    player.age < AI_SQUAD_CONFIG.YOUNG_TALENT_AGE &&
    baseValue >= AI_SQUAD_CONFIG.YOUNG_TALENT_VALUE
  ) {
    releaseScore -= 40;
  }

  // Captain/Vice-Captain protection
  if (team.captain === player.id || team.viceCaptain === player.id) {
    releaseScore -= 60;
  }

  // Poor value + older = likely release
  if (
    baseValue < AI_SQUAD_CONFIG.POOR_VALUE_THRESHOLD &&
    player.age >= AI_SQUAD_CONFIG.POOR_VALUE_AGE
  ) {
    releaseScore += 40;
  }

  // Role surplus = release lowest value in that role
  const roleTarget = AI_SQUAD_CONFIG.ROLE_TARGETS[player.role] || 4;
  const roleCount = roleCounts[player.role] || 0;
  if (roleCount > roleTarget + 1) {
    // More than 1 extra in this role
    releaseScore += 20;
  }

  // Low form = more likely to release
  if (player.form < -10) {
    releaseScore += 15;
  }

  // Age-based release tendency (team personality)
  const prefs = profile.preferences;
  if (player.age >= 30 && prefs.experienceBonus < 0) {
    // Teams that don't value experience release older players
    releaseScore += 25;
  }
  if (player.age >= 34) {
    releaseScore += 20; // Even CSK considers releasing 34+ players
  }

  // Inverse of value - lower value = higher release score
  releaseScore += Math.max(0, 70 - baseValue);

  // Add controlled randomness
  const variance = (Math.random() - 0.5) * 2 * prefs.variance * 20;
  releaseScore += variance;

  return releaseScore;
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Generate AI retentions for mega auctions
 * Each AI team retains their best 2-4 players based on team personality
 */
export function generateAIRetentions(
  teams: Team[],
  players: Player[],
  playerTeamId: string
): Record<string, RetentionSlot[]> {
  const result: Record<string, RetentionSlot[]> = {};

  for (const team of teams) {
    // Skip player's team - they make their own retention decisions
    if (team.id === playerTeamId) continue;

    const profile = getTeamProfile(team.id);

    // Get team's current players
    const teamPlayers = players.filter((p) => team.squad.includes(p.id));

    // Calculate retention scores for all players
    const scoredPlayers = teamPlayers
      .map((player) => ({
        player,
        score: calculateRetentionScore(player, team, profile),
      }))
      .sort((a, b) => b.score - a.score);

    // Determine how many to retain based on team profile
    const { min, max } = profile.retentionCount;
    const retentionCount = min + Math.floor(Math.random() * (max - min + 1));

    // Create retention slots
    const retentions: RetentionSlot[] = [];
    for (let i = 0; i < 4; i++) {
      const slotNumber = (i + 1) as 1 | 2 | 3 | 4;
      const cost = AUCTION_CONFIG.RETENTION_COSTS[slotNumber];

      if (i < retentionCount && i < scoredPlayers.length) {
        retentions.push({
          playerId: scoredPlayers[i].player.id,
          cost,
          slotNumber,
        });
      } else {
        retentions.push({
          playerId: null,
          cost,
          slotNumber,
        });
      }
    }

    result[team.id] = retentions;

    // Debug logging
    if (import.meta.env.DEV) {
      console.log(
        `[AI Retention] ${team.shortName}: Retaining ${retentionCount} players (${profile.retentionStyle})`
      );
      retentions
        .filter((r) => r.playerId)
        .forEach((r, idx) => {
          const p = players.find((p) => p.id === r.playerId);
          if (p) {
            console.log(
              `  ${idx + 1}. ${p.name} (value: ${calculatePlayerValue(p).toFixed(1)}, age: ${p.age})`
            );
          }
        });
    }
  }

  return result;
}

/**
 * Generate AI releases for mini auctions
 * Each AI team releases underperformers and expired contracts based on team personality
 */
export function generateAIReleases(
  teams: Team[],
  players: Player[],
  playerTeamId: string
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const team of teams) {
    // Skip player's team - they make their own release decisions
    if (team.id === playerTeamId) continue;

    const profile = getTeamProfile(team.id);

    // Get team's current players
    const teamPlayers = players.filter((p) => team.squad.includes(p.id));

    // Count players by role for surplus detection
    const roleCounts: Record<string, number> = {};
    for (const player of teamPlayers) {
      roleCounts[player.role] = (roleCounts[player.role] || 0) + 1;
    }

    // Calculate release scores for all players
    const scoredPlayers = teamPlayers
      .map((player) => ({
        player,
        score: calculateReleaseScore(player, team, profile, roleCounts),
      }))
      .sort((a, b) => b.score - a.score); // Higher score = more likely to release

    // Determine how many to release based on team profile
    const { min, max } = profile.releaseCount;

    // Count mandatory releases (expired contracts)
    const mandatoryReleases = scoredPlayers.filter((sp) => sp.score >= 1000);
    const mandatoryCount = mandatoryReleases.length;

    // Target release count from profile, but at least mandatory
    let targetCount = min + Math.floor(Math.random() * (max - min + 1));
    targetCount = Math.max(targetCount, mandatoryCount);
    targetCount = Math.min(targetCount, AI_SQUAD_CONFIG.MAX_RELEASES);

    // Don't release more than we can afford (keep minimum squad)
    const maxReleasable = Math.max(
      0,
      teamPlayers.length - AUCTION_CONFIG.MIN_SQUAD_SIZE + 5
    ); // Leave room to rebuild
    targetCount = Math.min(targetCount, maxReleasable);

    // Select players to release
    const releasedIds = scoredPlayers
      .slice(0, targetCount)
      .map((sp) => sp.player.id);

    result[team.id] = releasedIds;

    // Debug logging
    if (import.meta.env.DEV) {
      console.log(
        `[AI Release] ${team.shortName}: Releasing ${releasedIds.length} players (${profile.retentionStyle})`
      );
      releasedIds.forEach((id) => {
        const p = players.find((p) => p.id === id);
        if (p) {
          const reason =
            p.contract.yearsRemaining <= 0
              ? 'expired'
              : calculatePlayerValue(p) < 40
                ? 'low value'
                : 'surplus';
          console.log(
            `  - ${p.name} (value: ${calculatePlayerValue(p).toFixed(1)}, age: ${p.age}, ${reason})`
          );
        }
      });
    }
  }

  return result;
}

/**
 * Get all AI released player IDs for mini auction pool
 */
export function getAllAIReleasedPlayerIds(
  aiReleases: Record<string, string[]>
): string[] {
  return Object.values(aiReleases).flat();
}