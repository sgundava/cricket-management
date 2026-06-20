/**
 * Game Configuration Constants
 *
 * These values can be updated to match real IPL rules.
 * In the future, these could be fetched from a backend.
 */

export const AUCTION_CONFIG = {
  // Purse size in lakhs (140 Cr = 14000 lakhs for IPL 2026)
  TOTAL_PURSE: 14000,

  // Squad size limits
  MIN_SQUAD_SIZE: 18,
  MAX_SQUAD_SIZE: 25,

  // Overseas player limit
  MAX_OVERSEAS: 8,

  // Retention slots for mega auction
  MAX_RETENTIONS: 4,

  // RTM cards per team in mega auction
  RTM_CARDS_PER_TEAM: 2,

  // Retention costs in lakhs (IPL 2025 structure)
  RETENTION_COSTS: {
    1: 1800, // 18 Cr for 1st retention
    2: 1400, // 14 Cr for 2nd retention
    3: 1100, // 11 Cr for 3rd retention
    4: 1800, // 18 Cr for 4th retention (uncapped)
  } as Record<1 | 2 | 3 | 4, number>,

  // Bid increment tiers
  BID_INCREMENTS: [
    { upTo: 100, increment: 5 },   // Up to 1 Cr: 5L increments
    { upTo: 200, increment: 10 },  // 1-2 Cr: 10L increments
    { upTo: 500, increment: 20 },  // 2-5 Cr: 20L increments
    { upTo: 1000, increment: 25 }, // 5-10 Cr: 25L increments
    { upTo: Infinity, increment: 50 }, // 10+ Cr: 50L increments
  ],

  // Base price tiers in lakhs
  BASE_PRICE_TIERS: {
    ELITE: 200,    // 2 Cr
    STAR: 150,     // 1.5 Cr
    GOOD: 100,     // 1 Cr
    AVERAGE: 75,   // 75L
    OTHERS: 50,    // 50L
  },

  // Minimum reserve per remaining slot (50L per player)
  MIN_RESERVE_PER_SLOT: 50,

  // Auction pool size limits
  // 9 teams × 25 max = 225 players needed, ~250 gives 10% unsold buffer
  MEGA_AUCTION_POOL_SIZE: 250,
  MINI_AUCTION_POOL_SIZE: 100,  // Smaller pool for mini auctions
};

export const SEASON_CONFIG = {
  // Mega auction frequency (every N years)
  MEGA_AUCTION_FREQUENCY: 3,

  // League matches per team
  LEAGUE_MATCHES: 14,

  // Playoff format
  TOP_TEAMS_QUALIFY: 4,
};

export const MATCH_CONFIG = {
  // Overs per innings
  OVERS_PER_INNINGS: 20,

  // Maximum overseas players in XI
  MAX_OVERSEAS_IN_XI: 4,

  // Bowler over limits
  MAX_OVERS_PER_BOWLER: 4,
};

export const BOWLING_TACTICS_CONFIG = {
  // Minimum skill thresholds for bowling lengths to be effective
  SHORT_BALL_MIN_SPEED: 65,        // Bouncers need pace
  YORKER_MIN_ACCURACY: 70,         // Yorkers need accuracy
  FULL_PITCHED_MIN_ACCURACY: 50,   // Full length needs some accuracy

  // Fielding skill baseline (60 is considered average)
  FIELDING_BASELINE: 60,

  // Maximum boundary save probability (30%)
  MAX_BOUNDARY_SAVE_CHANCE: 0.30,
};

// ============================================
// PLAYER DEVELOPMENT (season-over-season skill change)
// ============================================
// Drives how player skills grow toward their `potential` ceiling when young
// and decline with age. All values are tunable — the engine reads only from here.
export const DEVELOPMENT_CONFIG = {
  // Age bands (inclusive upper bound for each band). 34+ = veteran.
  YOUTH_MAX_AGE: 23,    // strong growth toward potential
  PRIME_MAX_AGE: 29,    // plateau / mild growth
  DECLINE_MAX_AGE: 33,  // gradual decline

  // Growth: fraction of remaining headroom (potential - skill) gained per season.
  GROWTH: {
    youth: 0.16,
    prime: 0.05,
  },

  // Decline: base skill points lost per season (before the type multiplier).
  DECLINE: {
    decline: 2.0,
    veteran: 4.0,
  },

  // Physical skills (pace, stamina, athleticism) fade faster than
  // technical/mental ones (technique, temperament, accuracy) which age well.
  PHYSICAL_DECLINE_MULT: 1.5,
  TECHNICAL_DECLINE_MULT: 0.4,

  // Playing time: regulars develop, fringe players stagnate and rust.
  APPEARANCES_FOR_FULL_GROWTH: 8, // out of a 14-game league season
  REGULAR_APPEARANCES: 5,         // at/above this, no rust penalty to decline
  BENCH_GROWTH_MULT: 0.35,        // growth floor for players who barely featured
  BENCH_DECLINE_MULT: 1.2,        // extra decline for fringe players

  // A standout season accelerates growth (up to +PERFORMANCE_BONUS_MAX).
  PERFORMANCE_BONUS_MAX: 0.5,

  // Per-player, per-season luck: +/- this fraction (breakout years / setbacks).
  RANDOM_VARIATION: 0.2,
};

// Helper to check if it's a mega auction year
export function isMegaAuctionYear(season: number): boolean {
  return season === 1 || (season > 1 && (season - 1) % SEASON_CONFIG.MEGA_AUCTION_FREQUENCY === 0);
}
