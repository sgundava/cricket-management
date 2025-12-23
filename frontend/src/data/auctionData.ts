/**
 * IPL Auction Statistics
 * Auto-generated from historical auction data (2013-2025)
 *
 * DO NOT EDIT MANUALLY - Run scripts/processAuctionData.py to regenerate
 */

export const AUCTION_STATS = {
  /**
   * Role-based price multipliers (relative to batsman = 1.0)
   * Based on 2024 auction data, adjusted for outliers
   */
  roleMultipliers: {
    batsman: 1.0,
    bowler: 0.95,
    allrounder: 1.15,
    keeper: 0.70,
  },

  /**
   * Overseas player premium multiplier
   * Historical average: 1.73x, Recent (2024): 2.65x
   * Using balanced estimate
   */
  overseasMultiplier: 2.2,

  /**
   * Age-based value factors
   * Derived from historical sale patterns
   */
  ageFactors: {
    under23: 1.30,    // Youth premium
    age23to26: 1.10,  // Prime entry
    age26to30: 1.00,  // Peak (baseline)
    age30to34: 0.90,  // Experienced
    over35: 0.75,     // Legacy
  },

  /**
   * Base price to sold price multipliers by tier
   * Based on 2025 mega auction data
   */
  basePriceMultipliers: {
    tier50: { median: 1.5, p75: 3.0, p90: 8.0 },
    tier75: { median: 2.0, p75: 4.0, p90: 10.0 },
    tier100: { median: 2.5, p75: 5.0, p90: 12.0 },
    tier150: { median: 3.0, p75: 6.0, p90: 15.0 },
    tier200: { median: 4.0, p75: 8.0, p90: 20.0 },
  },

  /**
   * Team personality profiles for AI bidding behavior
   * aggression: 0-100, willingness to enter bidding wars
   * overseasPref: 0-1, priority for overseas players
   * marqueeBonus: multiplier for star players
   */
  teamProfiles: {
    mi: { aggression: 75, overseasPref: 0.85, marqueeBonus: 1.30 },
    csk: { aggression: 55, overseasPref: 0.65, marqueeBonus: 1.10 },
    rcb: { aggression: 90, overseasPref: 0.90, marqueeBonus: 1.50 },
    kkr: { aggression: 70, overseasPref: 0.80, marqueeBonus: 1.20 },
    dc: { aggression: 65, overseasPref: 0.75, marqueeBonus: 1.15 },
    rr: { aggression: 60, overseasPref: 0.70, marqueeBonus: 1.10 },
    pbks: { aggression: 80, overseasPref: 0.80, marqueeBonus: 1.25 },
    gt: { aggression: 65, overseasPref: 0.75, marqueeBonus: 1.15 },
    srh: { aggression: 70, overseasPref: 0.85, marqueeBonus: 1.20 },
    lsg: { aggression: 75, overseasPref: 0.80, marqueeBonus: 1.20 },
  },

  /**
   * Auction phase spending distribution
   */
  phaseSpending: {
    early: 0.65,   // First 30% of players
    mid: 0.25,     // Middle 40% of players
    late: 0.10,    // Final 30% of players
  },

  /**
   * Bidding war escalation factors
   */
  biddingWar: {
    twoTeams: 2.5,      // 2 teams bidding
    threeTeams: 4.0,    // 3 teams bidding
    fourPlusTeams: 7.0, // 4+ teams bidding
    maxMultiplier: 15.0, // Cap on bidding war escalation
  },
};

export type TeamId = keyof typeof AUCTION_STATS.teamProfiles;
export type Role = keyof typeof AUCTION_STATS.roleMultipliers;
export type AgeBracket = keyof typeof AUCTION_STATS.ageFactors;
export type PriceTier = keyof typeof AUCTION_STATS.basePriceMultipliers;
