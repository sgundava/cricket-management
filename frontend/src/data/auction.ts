import {
  Player,
  Team,
  BasePrice,
  AuctionPlayer,
  AuctionType,
  AuctionSettings,
  TeamAuctionState,
  AIBiddingStrategy,
  BidIncrement,
} from '../types';
import { AUCTION_CONFIG } from '../config/gameConfig';

// ============================================
// BASE PRICE CALCULATION
// ============================================

/**
 * Calculate a player's skill-based value score
 * Used for base price assignment and AI bidding decisions
 */
export function calculatePlayerValue(player: Player): number {
  const battingAvg =
    (player.batting.technique +
      player.batting.power +
      player.batting.timing +
      player.batting.temperament) /
    4;

  const bowlingAvg =
    (player.bowling.speed +
      player.bowling.accuracy +
      player.bowling.variation +
      player.bowling.stamina) /
    4;

  const fieldingAvg =
    (player.fielding.catching +
      player.fielding.ground +
      player.fielding.throwing +
      player.fielding.athleticism) /
    4;

  // Role-based skill weighting
  let skillScore = 0;
  switch (player.role) {
    case 'batsman':
      skillScore = battingAvg * 0.85 + bowlingAvg * 0.05 + fieldingAvg * 0.1;
      break;
    case 'bowler':
      skillScore = bowlingAvg * 0.85 + battingAvg * 0.05 + fieldingAvg * 0.1;
      break;
    case 'allrounder':
      skillScore = (battingAvg + bowlingAvg) / 2 * 0.9 + fieldingAvg * 0.1;
      break;
    case 'keeper':
      skillScore = battingAvg * 0.7 + fieldingAvg * 0.3;
      break;
  }

  // Age factor - younger players are more valuable
  let ageFactor = 1;
  if (player.age < 23) ageFactor = 1.3;
  else if (player.age < 26) ageFactor = 1.2;
  else if (player.age < 30) ageFactor = 1.0;
  else if (player.age < 34) ageFactor = 0.85;
  else ageFactor = 0.7;

  // Form factor (-20 to +20 mapped to 0.8 to 1.2)
  const formFactor = 1 + player.form / 50;

  // Overseas premium (slightly more valuable in IPL context)
  const overseasFactor = player.contract.isOverseas ? 1.1 : 1;

  return skillScore * ageFactor * formFactor * overseasFactor;
}

/**
 * Assign base price tier based on player value
 */
export function calculateBasePrice(player: Player): BasePrice {
  const value = calculatePlayerValue(player);

  if (value >= 85) return 200; // 2 Cr - Elite
  if (value >= 70) return 150; // 1.5 Cr - Star
  if (value >= 55) return 100; // 1 Cr - Good
  if (value >= 40) return 75; // 75L - Average
  return 50; // 50L - Others
}

// ============================================
// RETENTION COSTS
// ============================================

/**
 * IPL retention cost structure (in lakhs)
 * Mega auction: Up to 4 retentions with deductions
 * Uses values from config for easy updates
 */
export const RETENTION_COSTS = AUCTION_CONFIG.RETENTION_COSTS;

/**
 * Get total retention cost for N retentions
 */
export function getTotalRetentionCost(retentionCount: number): number {
  let total = 0;
  for (let i = 1; i <= Math.min(retentionCount, 4); i++) {
    total += RETENTION_COSTS[i as 1 | 2 | 3 | 4];
  }
  return total;
}

// ============================================
// AUCTION POOL GENERATION
// ============================================

/**
 * Generate auction player pool based on auction type
 * Limits pool size to keep auctions manageable
 */
export function generateAuctionPool(
  auctionType: AuctionType,
  players: Player[],
  teams: Team[],
  retainedPlayerIds: string[] = [],
  miniAuctionPoolIds: string[] = []
): AuctionPlayer[] {
  // Get all players currently on team rosters
  const rosterPlayerIds = teams.flatMap((t) => t.squad);

  // For mega auction, all non-retained players go to pool
  // For mini auction, only released/unsold players
  let availablePlayers: Player[];

  if (auctionType === 'mega') {
    // Get all non-retained players
    const nonRetained = players.filter((p) => !retainedPlayerIds.includes(p.id));

    // Sort by value (highest first) and take top N
    const poolSize = AUCTION_CONFIG.MEGA_AUCTION_POOL_SIZE;
    availablePlayers = nonRetained
      .map(p => ({ player: p, value: calculatePlayerValue(p) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, poolSize)
      .map(pv => pv.player);
  } else {
    // Mini auction: only players in the pool (released + unsold + free agents)
    const miniPool = players.filter((p) => {
      // Include if in the explicit mini auction pool
      if (miniAuctionPoolIds.includes(p.id)) return true;
      // Include if player has expired contract and not on any roster
      if (p.contract.yearsRemaining === 0 && !rosterPlayerIds.includes(p.id)) return true;
      return false;
    });

    // Sort by value and limit mini auction pool
    const poolSize = AUCTION_CONFIG.MINI_AUCTION_POOL_SIZE;
    availablePlayers = miniPool
      .map(p => ({ player: p, value: calculatePlayerValue(p) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, poolSize)
      .map(pv => pv.player);
  }

  // Create auction player entries
  const auctionPlayers: AuctionPlayer[] = availablePlayers.map((player) => {
    // Find which team the player was previously with
    const previousTeam = teams.find((t) => t.squad.includes(player.id));

    return {
      playerId: player.id,
      basePrice: calculateBasePrice(player),
      currentBid: calculateBasePrice(player),
      currentBidder: null,
      status: 'available',
      bidHistory: [],
      setNumber: assignPlayerSet(player),
      previousTeamId: previousTeam?.id || null,
    };
  });

  // Sort by set number, then by base price (highest first within each set)
  return auctionPlayers.sort((a, b) => {
    if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber;
    return b.basePrice - a.basePrice;
  });
}

/**
 * Assign player to auction set based on value
 * Set 1 = Marquee (highest value), Set 2-4 by role
 */
function assignPlayerSet(player: Player): number {
  const value = calculatePlayerValue(player);

  // Set 1: Marquee players (top tier)
  if (value >= 75) return 1;

  // Sets 2-4 by role for variety
  switch (player.role) {
    case 'batsman':
      return 2;
    case 'bowler':
      return 3;
    case 'allrounder':
    case 'keeper':
      return 4;
    default:
      return 5;
  }
}

// ============================================
// AUCTION SETTINGS
// ============================================

export const DEFAULT_BID_INCREMENTS: BidIncrement[] = AUCTION_CONFIG.BID_INCREMENTS;

export function createAuctionSettings(type: AuctionType): AuctionSettings {
  return {
    auctionType: type,
    totalPurse: AUCTION_CONFIG.TOTAL_PURSE,
    minSquadSize: AUCTION_CONFIG.MIN_SQUAD_SIZE,
    maxSquadSize: AUCTION_CONFIG.MAX_SQUAD_SIZE,
    maxOverseas: AUCTION_CONFIG.MAX_OVERSEAS,
    maxRetentions: type === 'mega' ? AUCTION_CONFIG.MAX_RETENTIONS : 0,
    rtmCardsPerTeam: type === 'mega' ? AUCTION_CONFIG.RTM_CARDS_PER_TEAM : 0,
    bidIncrements: DEFAULT_BID_INCREMENTS,
  };
}

/**
 * Get the next bid increment based on current bid
 */
export function getNextBidIncrement(currentBid: number): number {
  const increment = DEFAULT_BID_INCREMENTS.find((i) => currentBid < i.upTo);
  return increment?.increment || 50;
}

/**
 * Calculate next bid amount
 */
export function getNextBidAmount(currentBid: number): number {
  return currentBid + getNextBidIncrement(currentBid);
}

// ============================================
// TEAM AUCTION STATE INITIALIZATION
// ============================================

export function createTeamAuctionState(
  team: Team,
  players: Player[],
  auctionType: AuctionType,
  retentionCost: number = 0
): TeamAuctionState {
  // For mega auction, start fresh. For mini, keep existing squad composition
  const squadPlayers =
    auctionType === 'mega'
      ? []
      : players.filter((p) => team.squad.includes(p.id));

  const overseasCount =
    auctionType === 'mega'
      ? 0
      : squadPlayers.filter((p) => p.contract.isOverseas).length;

  const roleCount = (role: string) =>
    auctionType === 'mega' ? 0 : squadPlayers.filter((p) => p.role === role).length;

  return {
    teamId: team.id,
    remainingPurse: AUCTION_CONFIG.TOTAL_PURSE - retentionCost,
    squadSize: auctionType === 'mega' ? 0 : squadPlayers.length,
    overseasCount,
    retentions: [
      { playerId: null, cost: RETENTION_COSTS[1], slotNumber: 1 },
      { playerId: null, cost: RETENTION_COSTS[2], slotNumber: 2 },
      { playerId: null, cost: RETENTION_COSTS[3], slotNumber: 3 },
      { playerId: null, cost: RETENTION_COSTS[4], slotNumber: 4 },
    ],
    rtmCardsRemaining: auctionType === 'mega' ? AUCTION_CONFIG.RTM_CARDS_PER_TEAM : 0,
    batsmen: roleCount('batsman'),
    bowlers: roleCount('bowler'),
    allrounders: roleCount('allrounder'),
    keepers: roleCount('keeper'),
    hasPassedCurrentPlayer: false,
  };
}

// ============================================
// AI BIDDING STRATEGIES
// ============================================

/**
 * Team-specific AI bidding strategies based on real IPL team tendencies
 */
export function createAIStrategies(teams: Team[]): Record<string, AIBiddingStrategy> {
  const strategies: Record<string, AIBiddingStrategy> = {};

  const teamProfiles: Record<
    string,
    {
      priorities: AIBiddingStrategy['priorities'];
      aggression: number;
      budgetConservation: number;
    }
  > = {
    mi: {
      priorities: { batsmen: 80, bowlers: 75, allrounders: 90, keepers: 60, overseas: 85 },
      aggression: 75,
      budgetConservation: 35,
    },
    csk: {
      priorities: { batsmen: 85, bowlers: 70, allrounders: 80, keepers: 75, overseas: 65 },
      aggression: 55, // CSK more conservative, strategic
      budgetConservation: 50,
    },
    rcb: {
      priorities: { batsmen: 95, bowlers: 60, allrounders: 70, keepers: 55, overseas: 90 },
      aggression: 90, // RCB historically aggressive bidders
      budgetConservation: 20,
    },
    kkr: {
      priorities: { batsmen: 75, bowlers: 80, allrounders: 85, keepers: 60, overseas: 80 },
      aggression: 70,
      budgetConservation: 40,
    },
    dc: {
      priorities: { batsmen: 80, bowlers: 75, allrounders: 80, keepers: 70, overseas: 75 },
      aggression: 65,
      budgetConservation: 45,
    },
    rr: {
      priorities: { batsmen: 75, bowlers: 80, allrounders: 85, keepers: 65, overseas: 70 },
      aggression: 60,
      budgetConservation: 50,
    },
    pk: {
      priorities: { batsmen: 85, bowlers: 70, allrounders: 75, keepers: 60, overseas: 80 },
      aggression: 80, // Punjab often aggressive
      budgetConservation: 30,
    },
    gt: {
      priorities: { batsmen: 70, bowlers: 85, allrounders: 90, keepers: 60, overseas: 75 },
      aggression: 65,
      budgetConservation: 45,
    },
    srh: {
      priorities: { batsmen: 70, bowlers: 90, allrounders: 75, keepers: 60, overseas: 85 },
      aggression: 70,
      budgetConservation: 40,
    },
  };

  teams.forEach((team) => {
    const profile = teamProfiles[team.id] || {
      priorities: { batsmen: 70, bowlers: 70, allrounders: 70, keepers: 70, overseas: 70 },
      aggression: 65,
      budgetConservation: 45,
    };

    strategies[team.id] = {
      teamId: team.id,
      priorities: profile.priorities,
      aggression: profile.aggression,
      budgetConservation: profile.budgetConservation,
      targetPlayers: [], // Will be populated dynamically
    };
  });

  return strategies;
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Check if a team can afford to bid on a player
 */
export function canTeamAffordBid(
  teamState: TeamAuctionState,
  bidAmount: number,
  settings: AuctionSettings
): boolean {
  // Must have enough purse for the bid
  if (teamState.remainingPurse < bidAmount) return false;

  // Must reserve enough for minimum squad
  const slotsNeeded = settings.minSquadSize - teamState.squadSize - 1;
  const minReserve = slotsNeeded * AUCTION_CONFIG.MIN_RESERVE_PER_SLOT;

  if (teamState.remainingPurse - bidAmount < minReserve) return false;

  return true;
}

/**
 * Check if a team can add an overseas player
 */
export function canTeamAddOverseas(
  teamState: TeamAuctionState,
  settings: AuctionSettings
): boolean {
  return teamState.overseasCount < settings.maxOverseas;
}

/**
 * Check if a team's squad is full
 */
export function isSquadFull(
  teamState: TeamAuctionState,
  settings: AuctionSettings
): boolean {
  return teamState.squadSize >= settings.maxSquadSize;
}

/**
 * Check if a team has met minimum squad requirement
 */
export function hasMinSquad(
  teamState: TeamAuctionState,
  settings: AuctionSettings
): boolean {
  return teamState.squadSize >= settings.minSquadSize;
}

// ============================================
// FORMATTING HELPERS
// ============================================

/**
 * Format amount in lakhs to readable string
 */
export function formatAmount(lakhs: number): string {
  if (lakhs >= 100) {
    const crores = lakhs / 100;
    return `₹${crores.toFixed(crores % 1 === 0 ? 0 : 2)} Cr`;
  }
  return `₹${lakhs}L`;
}

/**
 * Format amount for compact display
 */
export function formatAmountCompact(lakhs: number): string {
  if (lakhs >= 100) {
    return `${(lakhs / 100).toFixed(1)}Cr`;
  }
  return `${lakhs}L`;
}
