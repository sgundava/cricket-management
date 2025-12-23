/**
 * Data-Driven Auction Pricing Model
 *
 * Uses statistical insights from 10+ years of IPL auction data
 * to calculate realistic player valuations and price ranges.
 */

import { Player } from '../types';
import { AUCTION_STATS, TeamId, Role, AgeBracket, PriceTier } from '../data/auctionData';
import { calculatePlayerValue } from '../data/auction';

// ============================================
// TYPES
// ============================================

export interface PlayerValuation {
  baseValue: number; // 0-100 skill rating
  basePrice: number; // Expected base price (lakhs)
  marketValue: number; // Expected sale price (lakhs)
  priceRange: {
    floor: number; // Minimum expected (base price)
    expected: number; // Median expected
    ceiling: number; // Maximum expected (bidding war)
  };
  demandScore: number; // 0-100, how many teams will bid
  multipliers: {
    role: number;
    overseas: number;
    age: number;
    tier: number;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get age bracket for a player
 */
export function getAgeBracket(age: number): AgeBracket {
  if (age < 23) return 'under23';
  if (age < 26) return 'age23to26';
  if (age < 30) return 'age26to30';
  if (age < 35) return 'age30to34';
  return 'over35';
}

/**
 * Get age factor for a player
 */
export function getAgeFactor(age: number): number {
  const bracket = getAgeBracket(age);
  return AUCTION_STATS.ageFactors[bracket];
}

/**
 * Get role multiplier for a player
 */
export function getRoleMultiplier(role: Player['role']): number {
  const roleKey = role as Role;
  return AUCTION_STATS.roleMultipliers[roleKey] ?? 1.0;
}

/**
 * Calculate base price tier from skill value
 */
export function calculateBasePrice(skillValue: number): number {
  // Map skill value (0-100) to base price tiers
  // Elite (85+): 200L base (marquee)
  // Star (75-85): 150L base
  // Good (65-75): 100L base
  // Average (55-65): 75L base
  // Below (45-55): 50L base
  // Low (<45): 30L base

  if (skillValue >= 85) return 200;
  if (skillValue >= 75) return 150;
  if (skillValue >= 65) return 100;
  if (skillValue >= 55) return 75;
  if (skillValue >= 45) return 50;
  return 30;
}

/**
 * Get price tier from base price
 */
export function getBasePriceTier(basePrice: number): PriceTier {
  if (basePrice >= 200) return 'tier200';
  if (basePrice >= 150) return 'tier150';
  if (basePrice >= 100) return 'tier100';
  if (basePrice >= 75) return 'tier75';
  return 'tier50';
}

/**
 * Calculate demand score (0-100) based on player attributes
 * Higher score = more teams will be interested
 */
export function calculateDemandScore(
  skillValue: number,
  role: Player['role'],
  isOverseas: boolean,
  age: number
): number {
  // Base demand from skill (0-60)
  let demand = Math.min(60, skillValue * 0.6);

  // Role demand bonus
  // All-rounders and fast bowlers are in high demand
  if (role === 'allrounder') demand += 15;
  if (role === 'bowler') demand += 10;
  if (role === 'batsman') demand += 5;

  // Age adjustment
  const ageFactor = getAgeFactor(age);
  demand *= ageFactor;

  // Overseas players have limited slots, but quality overseas command premium
  if (isOverseas && skillValue >= 70) {
    demand += 10; // Premium overseas players
  }

  return Math.min(100, Math.max(0, demand));
}

// ============================================
// MAIN VALUATION FUNCTION
// ============================================

/**
 * Calculate comprehensive player valuation using historical data
 */
export function calculateDataDrivenValuation(player: Player): PlayerValuation {
  // Get base skill value (0-100)
  const baseValue = calculatePlayerValue(player);

  // Calculate base price from skill
  const basePrice = calculateBasePrice(baseValue);

  // Get multipliers from auction statistics
  const roleMultiplier = getRoleMultiplier(player.role);
  const overseasMultiplier = player.contract.isOverseas
    ? AUCTION_STATS.overseasMultiplier
    : 1.0;
  const ageFactor = getAgeFactor(player.age);

  // Get price tier multipliers
  const tier = getBasePriceTier(basePrice);
  const tierMultipliers = AUCTION_STATS.basePriceMultipliers[tier];

  // Combined adjustment factor
  const combinedMultiplier = roleMultiplier * overseasMultiplier * ageFactor;

  // Calculate market value and price range
  const expectedPrice = basePrice * tierMultipliers.median * combinedMultiplier;
  const floorPrice = basePrice; // Base price is the floor
  const ceilingPrice = basePrice * tierMultipliers.p90 * combinedMultiplier;

  // Calculate demand score
  const demandScore = calculateDemandScore(
    baseValue,
    player.role,
    player.contract.isOverseas,
    player.age
  );

  return {
    baseValue,
    basePrice,
    marketValue: Math.round(expectedPrice),
    priceRange: {
      floor: floorPrice,
      expected: Math.round(basePrice * tierMultipliers.median * combinedMultiplier),
      ceiling: Math.round(ceilingPrice),
    },
    demandScore,
    multipliers: {
      role: roleMultiplier,
      overseas: overseasMultiplier,
      age: ageFactor,
      tier: tierMultipliers.median,
    },
  };
}

// ============================================
// AI PRICING HELPERS
// ============================================

/**
 * Get team profile from auction stats
 */
export function getTeamProfile(teamId: string): {
  aggression: number;
  overseasPref: number;
  marqueeBonus: number;
} {
  const normalizedId = teamId.toLowerCase() as TeamId;
  return (
    AUCTION_STATS.teamProfiles[normalizedId] ?? {
      aggression: 70,
      overseasPref: 0.75,
      marqueeBonus: 1.15,
    }
  );
}

/**
 * Calculate adjusted max bid for a team based on their profile
 */
export function calculateTeamAdjustedMaxBid(
  valuation: PlayerValuation,
  teamId: string,
  isMarqueePlayer: boolean
): number {
  const profile = getTeamProfile(teamId);

  let maxBid = valuation.priceRange.ceiling;

  // Apply aggression factor (up to +30% for aggressive teams)
  const aggressionBonus = 1 + (profile.aggression - 50) * 0.006;
  maxBid *= aggressionBonus;

  // Apply marquee bonus for star players
  if (isMarqueePlayer && valuation.baseValue >= 80) {
    maxBid *= profile.marqueeBonus;
  }

  return Math.round(maxBid);
}

/**
 * Calculate interest probability based on demand score
 * Maps demand score (0-100) to probability (0.05-0.95)
 */
export function calculateInterestFromDemand(demandScore: number): number {
  return 0.05 + (demandScore / 100) * 0.90;
}

/**
 * Estimate number of teams that will be interested in a player
 */
export function estimateInterestedTeams(demandScore: number, totalTeams: number = 10): number {
  const interestProb = calculateInterestFromDemand(demandScore);
  return Math.round(totalTeams * interestProb);
}

// ============================================
// BIDDING WAR CALCULATIONS
// ============================================

/**
 * Calculate expected price escalation based on number of interested teams
 */
export function calculateBiddingWarEscalation(
  interestedTeams: number,
  basePrice: number
): number {
  if (interestedTeams <= 1) return basePrice; // No war, base price
  if (interestedTeams === 2) return basePrice * AUCTION_STATS.biddingWar.twoTeams;
  if (interestedTeams === 3) return basePrice * AUCTION_STATS.biddingWar.threeTeams;
  if (interestedTeams >= 4) {
    const escalation = Math.min(
      AUCTION_STATS.biddingWar.maxMultiplier,
      AUCTION_STATS.biddingWar.fourPlusTeams + (interestedTeams - 4) * 0.5
    );
    return basePrice * escalation;
  }
  return basePrice;
}

/**
 * Get auction phase spending multiplier
 */
export function getPhaseMultiplier(
  playerIndex: number,
  totalPlayers: number
): number {
  const progress = playerIndex / totalPlayers;

  // Early phase (first 30%): teams spend more aggressively
  if (progress < 0.3) return 1.2;

  // Mid phase (30-70%): normal spending
  if (progress < 0.7) return 1.0;

  // Late phase (last 30%): bargain hunting
  return 0.8;
}
