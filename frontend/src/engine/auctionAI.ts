import {
  Player,
  AuctionPlayer,
  AuctionState,
  TeamAuctionState,
  AIBiddingStrategy,
  AuctionSettings,
} from '../types';
import {
  calculatePlayerValue,
  getNextBidAmount,
  canTeamAffordBid,
  canTeamAddOverseas,
  isSquadFull,
} from '../data/auction';
import {
  calculateDataDrivenValuation,
  getTeamProfile,
  calculateInterestFromDemand,
  PlayerValuation,
} from './auctionPricing';
import { AUCTION_STATS } from '../data/auctionData';

// ============================================
// AI BID DECISION
// ============================================

export interface AIBidDecision {
  shouldBid: boolean;
  maxBid: number;
  urgency: number; // 0-100, affects timing
  reason: string;
}

/**
 * Main AI bidding decision function
 * Determines if a team should bid and their maximum amount
 *
 * Uses data-driven valuation from IPL auction history:
 * - Role multipliers (all-rounders 1.15x, keepers 0.70x)
 * - Overseas premium (2.2x)
 * - Age factors (youth premium 1.3x)
 * - Team personality profiles
 */
export function calculateAIBidDecision(
  teamState: TeamAuctionState,
  strategy: AIBiddingStrategy,
  player: Player,
  auctionPlayer: AuctionPlayer,
  auctionState: AuctionState
): AIBidDecision {
  const settings = auctionState.settings;

  // Hard constraints - cannot bid
  if (!canTeamBid(teamState, player, auctionPlayer, settings)) {
    return {
      shouldBid: false,
      maxBid: 0,
      urgency: 0,
      reason: 'Cannot bid - constraints',
    };
  }

  // Get data-driven player valuation
  const valuation = calculateDataDrivenValuation(player);

  // Calculate base interest probability from demand score
  // This uses IPL historical data patterns
  const qualityInterest = calculateInterestFromDemand(valuation.demandScore);

  // Role need multiplier (1.0 to 1.5) - secondary factor
  const roleNeedMultiplier = calculateRoleNeed(teamState, player, strategy);

  // Overseas consideration based on team profile
  const teamProfile = getTeamProfile(teamState.teamId);
  const overseasPenalty = player.contract.isOverseas
    ? (teamState.overseasCount >= 6
        ? 0.3 + teamProfile.overseasPref * 0.2
        : teamState.overseasCount >= 4
          ? 0.6 + teamProfile.overseasPref * 0.3
          : 1.0)
    : 1.0;

  // Calculate maximum bid using data-driven valuation
  const maxBid = calculateMaxBidDataDriven(
    valuation,
    teamState,
    strategy,
    roleNeedMultiplier,
    settings
  );

  // Get next bid amount
  const nextBid = getNextBidAmount(auctionPlayer.currentBid);

  // Too expensive - drop out
  if (nextBid > maxBid) {
    return {
      shouldBid: false,
      maxBid,
      urgency: 0,
      reason: 'Price exceeds max bid',
    };
  }

  // Target player override - always bid if we can afford
  if (strategy.targetPlayers.includes(player.id)) {
    return {
      shouldBid: true,
      maxBid: maxBid * teamProfile.marqueeBonus, // Use team's marquee bonus
      urgency: 95,
      reason: 'Target player',
    };
  }

  // Calculate final bid probability using team aggression from profile
  const bidProgress = auctionPlayer.currentBid / Math.max(maxBid, 1);
  const progressPenalty = Math.max(0.3, 1 - bidProgress * 0.7);

  // Bidding war fatigue - based on historical patterns
  const bidWarFatigue = Math.max(0.5, 1 - auctionPlayer.bidHistory.length * 0.05);

  // Apply team aggression from calibrated profile
  const aggressionBonus = 1 + (teamProfile.aggression - 50) / 200;

  const finalProbability = Math.min(
    0.95,
    qualityInterest * roleNeedMultiplier * overseasPenalty * progressPenalty * bidWarFatigue * aggressionBonus
  );

  const shouldBid = Math.random() < finalProbability;
  const urgency = calculateUrgency(teamState, player, strategy, settings, valuation.baseValue);

  return {
    shouldBid,
    maxBid,
    urgency,
    reason: shouldBid ? `Value: ${valuation.baseValue.toFixed(0)}, Market: ${valuation.marketValue}L` : 'Passing',
  };
}

/**
 * Calculate base interest probability from player quality
 * THIS IS THE KEY FUNCTION - ensures stars attract bidders
 * @deprecated Use calculateInterestFromDemand from auctionPricing.ts
 */
function calculateQualityInterest(playerValue: number): number {
  // Star players (80+): 85-95% interest from each team
  if (playerValue >= 80) {
    return 0.85 + (playerValue - 80) * 0.005;
  }
  // Very good players (70-80): 70-85% interest
  if (playerValue >= 70) {
    return 0.70 + (playerValue - 70) * 0.015;
  }
  // Good players (60-70): 50-70% interest
  if (playerValue >= 60) {
    return 0.50 + (playerValue - 60) * 0.02;
  }
  // Average players (50-60): 30-50% interest
  if (playerValue >= 50) {
    return 0.30 + (playerValue - 50) * 0.02;
  }
  // Below average (40-50): 15-30% interest
  if (playerValue >= 40) {
    return 0.15 + (playerValue - 40) * 0.015;
  }
  // Low value (<40): 5-15% interest
  return 0.05 + playerValue * 0.0025;
}

/**
 * Calculate maximum bid using data-driven valuation
 * Uses IPL historical data patterns for realistic pricing
 */
function calculateMaxBidDataDriven(
  valuation: PlayerValuation,
  teamState: TeamAuctionState,
  strategy: AIBiddingStrategy,
  roleNeedMultiplier: number,
  settings: AuctionSettings
): number {
  // Start with ceiling from data-driven valuation
  let tierMaxBid = valuation.priceRange.ceiling;

  // Apply team personality from calibrated profiles
  const profile = getTeamProfile(teamState.teamId);

  // Aggression factor from team profile (0.85 to 1.15)
  const aggressionFactor = 0.85 + (profile.aggression / 100) * 0.3;

  // Budget conservation from strategy (0.85 to 1.15)
  const conservationFactor = 1.15 - (strategy.budgetConservation / 100) * 0.3;

  // Role need bonus (up to 20% more for needed roles)
  const needBonus = 1 + (roleNeedMultiplier - 1) * 0.2;

  // Marquee bonus for star players
  const marqueeBonus = valuation.baseValue >= 80 ? profile.marqueeBonus : 1.0;

  // Calculate budget constraint
  const slotsRemaining = settings.minSquadSize - teamState.squadSize;
  const maxSpendRatio = getMaxSpendRatio(teamState, settings);
  const budgetLimit = teamState.remainingPurse * maxSpendRatio;

  // Final max bid: data-driven with modifiers, capped by budget
  const adjustedMax = tierMaxBid * aggressionFactor * conservationFactor * needBonus * marqueeBonus;

  return Math.min(adjustedMax, budgetLimit);
}

/**
 * Calculate maximum bid based on player value tier
 * Realistic IPL-style pricing
 */
function calculateMaxBid(
  playerValue: number,
  teamState: TeamAuctionState,
  strategy: AIBiddingStrategy,
  roleNeedMultiplier: number,
  settings: AuctionSettings
): number {
  // Base max bid by value tier (in lakhs)
  // These reflect realistic IPL auction prices
  let tierMaxBid: number;

  if (playerValue >= 85) {
    // Elite: 15-24 Cr (1500-2400L)
    tierMaxBid = 1500 + (playerValue - 85) * 60;
  } else if (playerValue >= 75) {
    // Star: 8-15 Cr (800-1500L)
    tierMaxBid = 800 + (playerValue - 75) * 70;
  } else if (playerValue >= 65) {
    // Very Good: 4-8 Cr (400-800L)
    tierMaxBid = 400 + (playerValue - 65) * 40;
  } else if (playerValue >= 55) {
    // Good: 2-4 Cr (200-400L)
    tierMaxBid = 200 + (playerValue - 55) * 20;
  } else if (playerValue >= 45) {
    // Average: 75L-2 Cr (75-200L)
    tierMaxBid = 75 + (playerValue - 45) * 12.5;
  } else {
    // Below average: 50-75L
    tierMaxBid = 50 + (playerValue - 35) * 2.5;
  }

  // Apply team strategy modifiers
  const aggressionFactor = 0.8 + (strategy.aggression / 100) * 0.4; // 0.8 to 1.2
  const conservationFactor = 1.2 - (strategy.budgetConservation / 100) * 0.4; // 0.8 to 1.2

  // Role need bonus (up to 20% more for needed roles)
  const needBonus = 1 + (roleNeedMultiplier - 1) * 0.2;

  // Calculate budget constraint
  const slotsRemaining = settings.minSquadSize - teamState.squadSize;
  const maxSpendRatio = getMaxSpendRatio(teamState, settings);
  const budgetLimit = teamState.remainingPurse * maxSpendRatio;

  // Final max bid: tier-based with modifiers, capped by budget
  const adjustedMax = tierMaxBid * aggressionFactor * conservationFactor * needBonus;

  return Math.min(adjustedMax, budgetLimit);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a team can physically bid (hard constraints)
 */
function canTeamBid(
  teamState: TeamAuctionState,
  player: Player,
  auctionPlayer: AuctionPlayer,
  settings: AuctionSettings
): boolean {
  // Already passed on this player
  if (teamState.hasPassedCurrentPlayer) return false;

  // Squad full
  if (isSquadFull(teamState, settings)) return false;

  // Overseas limit check
  if (player.contract.isOverseas && !canTeamAddOverseas(teamState, settings)) {
    return false;
  }

  // Can afford next bid
  const nextBid = getNextBidAmount(auctionPlayer.currentBid);
  if (!canTeamAffordBid(teamState, nextBid, settings)) return false;

  return true;
}

/**
 * Calculate role need multiplier based on squad composition
 */
function calculateRoleNeed(
  teamState: TeamAuctionState,
  player: Player,
  strategy: AIBiddingStrategy
): number {
  // Ideal squad composition targets
  const targets = {
    batsman: 6,
    bowler: 6,
    allrounder: 4,
    keeper: 2,
  };

  // Current deficits
  const deficits = {
    batsman: Math.max(0, targets.batsman - teamState.batsmen),
    bowler: Math.max(0, targets.bowler - teamState.bowlers),
    allrounder: Math.max(0, targets.allrounder - teamState.allrounders),
    keeper: Math.max(0, targets.keeper - teamState.keepers),
  };

  // Role need multiplier (1.0 to 2.5)
  let needMultiplier = 1.0;
  const priorityFactor = strategy.priorities[player.role === 'keeper' ? 'keepers' : `${player.role}s` as keyof typeof strategy.priorities] as number / 100;

  switch (player.role) {
    case 'batsman':
      needMultiplier = 1 + (deficits.batsman / targets.batsman) * priorityFactor;
      break;
    case 'bowler':
      needMultiplier = 1 + (deficits.bowler / targets.bowler) * priorityFactor;
      break;
    case 'allrounder':
      // Allrounders always valued - can fill multiple roles
      needMultiplier = 1.2 + (deficits.allrounder / targets.allrounder) * priorityFactor;
      break;
    case 'keeper':
      // Critical if none
      needMultiplier = teamState.keepers === 0 ? 2.0 : 1.0 + (deficits.keeper / targets.keeper) * priorityFactor;
      break;
  }

  // Late auction urgency - need to fill slots
  const slotsRemaining = 18 - teamState.squadSize;
  if (slotsRemaining <= 5 && slotsRemaining > 0) {
    needMultiplier *= 1 + (5 - slotsRemaining) * 0.1;
  }

  return Math.min(2.5, needMultiplier);
}

/**
 * Get maximum spend ratio based on remaining slots
 */
function getMaxSpendRatio(
  teamState: TeamAuctionState,
  settings: AuctionSettings
): number {
  const slotsRemaining = settings.minSquadSize - teamState.squadSize;

  if (slotsRemaining <= 1) return 0.9; // Can spend almost everything
  if (slotsRemaining <= 3) return 0.7;
  if (slotsRemaining <= 6) return 0.5;
  if (slotsRemaining <= 10) return 0.35;
  return 0.25; // Early auction, be conservative
}

/**
 * Calculate probability of bidding
 */
function calculateBidProbability(
  strategy: AIBiddingStrategy,
  currentBid: number,
  maxBid: number,
  bidCount: number,
  roleNeed: number
): number {
  // Base probability from aggression (0.3 to 0.85)
  const baseProbability = 0.3 + (strategy.aggression / 100) * 0.55;

  // Decrease as bid approaches max
  const bidRatio = currentBid / maxBid;
  const bidFactor = Math.max(0.2, 1 - bidRatio * 0.8);

  // Fatigue factor - less likely in long bidding wars
  const fatigueFactor = Math.max(0.4, 1 - bidCount * 0.08);

  // Role need increases probability
  const needFactor = Math.min(1.5, 0.8 + roleNeed * 0.2);

  return Math.min(0.95, baseProbability * bidFactor * fatigueFactor * needFactor);
}

/**
 * Calculate urgency for bid timing
 */
function calculateUrgency(
  teamState: TeamAuctionState,
  player: Player,
  strategy: AIBiddingStrategy,
  settings: AuctionSettings,
  playerValue: number
): number {
  // Base urgency from player quality - stars create urgency!
  let urgency = 30 + playerValue * 0.4; // 30-70 base from quality

  // Increase for target players
  if (strategy.targetPlayers.includes(player.id)) {
    urgency += 25;
  }

  // Increase if squad is lacking in this role
  const roleNeeds = {
    batsman: teamState.batsmen < 4,
    bowler: teamState.bowlers < 4,
    allrounder: teamState.allrounders < 2,
    keeper: teamState.keepers < 1,
  };

  if (roleNeeds[player.role]) {
    urgency += 15;
  }

  // Increase if squad is getting small on slots
  const slotsRemaining = settings.minSquadSize - teamState.squadSize;
  if (slotsRemaining <= 5) {
    urgency += (5 - slotsRemaining) * 4;
  }

  // Aggression affects urgency
  urgency += (strategy.aggression - 50) * 0.2;

  return Math.min(100, Math.max(0, urgency));
}

// ============================================
// TEAM SELECTION FOR BIDDING ROUND
// ============================================

/**
 * Get all teams willing to bid on current player, sorted by urgency
 */
export function getTeamsWillingToBid(
  auctionState: AuctionState,
  players: Player[],
  excludeTeamId?: string
): Array<{ teamId: string; decision: AIBidDecision }> {
  const currentPlayer = auctionState.currentPlayer;
  if (!currentPlayer) return [];

  const player = players.find((p) => p.id === currentPlayer.playerId);
  if (!player) return [];

  const willingTeams: Array<{ teamId: string; decision: AIBidDecision }> = [];

  Object.entries(auctionState.teamStates).forEach(([teamId, teamState]) => {
    // Skip excluded team (usually player's team or current highest bidder)
    if (teamId === excludeTeamId) return;
    if (teamId === currentPlayer.currentBidder) return;

    const strategy = auctionState.aiStrategies[teamId];
    if (!strategy) return;

    const decision = calculateAIBidDecision(
      teamState,
      strategy,
      player,
      currentPlayer,
      auctionState
    );

    if (decision.shouldBid) {
      willingTeams.push({ teamId, decision });
    }
  });

  // Sort by urgency (highest first)
  return willingTeams.sort((a, b) => b.decision.urgency - a.decision.urgency);
}

/**
 * Select which AI team bids next (with some randomness)
 */
export function selectNextBidder(
  willingTeams: Array<{ teamId: string; decision: AIBidDecision }>
): string | null {
  if (willingTeams.length === 0) return null;

  // Weight by urgency
  const totalUrgency = willingTeams.reduce((sum, t) => sum + t.decision.urgency, 0);

  if (totalUrgency === 0) {
    // Random selection if all urgencies are 0
    return willingTeams[Math.floor(Math.random() * willingTeams.length)].teamId;
  }

  // Weighted random selection
  let random = Math.random() * totalUrgency;
  for (const team of willingTeams) {
    random -= team.decision.urgency;
    if (random <= 0) {
      return team.teamId;
    }
  }

  return willingTeams[0].teamId;
}

// ============================================
// SIMULATE FULL AUCTION (FOR SIM MODE)
// ============================================

/**
 * Simulate bidding for a single player until sold or unsold
 */
export function simulatePlayerAuction(
  auctionState: AuctionState,
  players: Player[],
  playerTeamId: string
): { soldTo: string | null; finalBid: number; bidHistory: AuctionState['currentPlayer'] } {
  const currentPlayer = auctionState.currentPlayer;
  if (!currentPlayer) {
    return { soldTo: null, finalBid: 0, bidHistory: null };
  }

  let bidRound = 0;
  const maxRounds = 100; // Safety limit

  while (bidRound < maxRounds) {
    // Get teams willing to bid
    const willingTeams = getTeamsWillingToBid(auctionState, players, playerTeamId);

    if (willingTeams.length === 0) {
      break; // No more bidders
    }

    // Select next bidder
    const nextBidder = selectNextBidder(willingTeams);
    if (!nextBidder) break;

    // Place bid
    const nextBidAmount = getNextBidAmount(currentPlayer.currentBid);
    currentPlayer.currentBid = nextBidAmount;
    currentPlayer.currentBidder = nextBidder;
    currentPlayer.bidHistory.push({
      teamId: nextBidder,
      amount: nextBidAmount,
      timestamp: Date.now(),
      isRTM: false,
    });

    // Update team state
    const teamState = auctionState.teamStates[nextBidder];
    if (teamState) {
      // Mark other teams as potentially re-entering
      Object.keys(auctionState.teamStates).forEach((tid) => {
        if (tid !== nextBidder) {
          auctionState.teamStates[tid].hasPassedCurrentPlayer = false;
        }
      });
    }

    bidRound++;
  }

  return {
    soldTo: currentPlayer.currentBidder,
    finalBid: currentPlayer.currentBid,
    bidHistory: currentPlayer,
  };
}
