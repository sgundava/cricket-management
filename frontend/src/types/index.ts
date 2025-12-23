// ============================================
// PLAYER TYPES
// ============================================

export type PlayerRole = 'batsman' | 'bowler' | 'allrounder' | 'keeper';
export type BattingStyle = 'right' | 'left';
export type BowlingStyle =
  | 'right-arm-fast'
  | 'right-arm-medium'
  | 'left-arm-fast'
  | 'left-arm-medium'
  | 'off-spin'
  | 'leg-spin'
  | 'left-arm-spin'
  | null;

export interface BattingSkills {
  technique: number;    // 0-100: Ability to survive, play proper shots
  power: number;        // 0-100: Boundary hitting ability
  timing: number;       // 0-100: Finding gaps, placement
  temperament: number;  // 0-100: Performance under pressure
}

export interface BowlingSkills {
  speed: number;        // 0-100: Pace or spin sharpness
  accuracy: number;     // 0-100: Line and length consistency
  variation: number;    // 0-100: Different deliveries in arsenal
  stamina: number;      // 0-100: Maintain quality over overs
}

export interface FieldingSkills {
  catching: number;     // 0-100: Catching ability
  ground: number;       // 0-100: Ground fielding
  throwing: number;     // 0-100: Arm strength and accuracy
  athleticism: number;  // 0-100: Range, diving, speed
}

export interface Personality {
  temperament: 'fiery' | 'calm' | 'moody';
  professionalism: number;  // 0-100
  ambition: number;         // 0-100: High = demands playing time
  leadership: number;       // 0-100: Captain material
}

export interface Contract {
  salary: number;           // In lakhs per season
  yearsRemaining: number;
  releaseClause: number | null;
  isOverseas: boolean;
}

// Specific playing roles for tactical depth
export type PlayingRole =
  | 'opening-batter'
  | 'top-order-batter'
  | 'middle-order-batter'
  | 'finisher'
  | 'wicketkeeper-batter'
  | 'batting-allrounder'
  | 'bowling-allrounder'
  | 'spin-bowling-allrounder'
  | 'opening-bowler'
  | 'pace-bowler'
  | 'spin-bowler'
  | 'death-bowler'
  | null;

export interface Player {
  id: string;
  name: string;
  shortName: string;        // For UI display
  age: number;
  nationality: string;
  role: PlayerRole;
  playingRole?: PlayingRole; // Specific tactical role
  imageUrl?: string;         // Player photo URL
  battingStyle: BattingStyle;
  bowlingStyle: BowlingStyle;

  // Skills
  batting: BattingSkills;
  bowling: BowlingSkills;
  fielding: FieldingSkills;

  // Potential ceiling (0-100 for each category)
  potential: {
    batting: number;
    bowling: number;
    fielding: number;
  };

  // Dynamic state (changes frequently)
  form: number;           // -20 to +20
  fitness: number;        // 0-100
  morale: number;         // 0-100
  fatigue: number;        // 0-100

  personality: Personality;
  contract: Contract;

  // Track when player was last talked to (for cooldown)
  lastTalkedMatchDay?: number;
}

// ============================================
// TEAM TYPES
// ============================================

export interface TeamColors {
  primary: string;
  secondary: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;      // "MI", "CSK", etc.
  colors: TeamColors;
  homeCity: string;
  homeVenue: string;

  // Resources
  budget: number;         // Available funds in crores
  salaryCap: number;      // Max total salary
  currentSalary: number;  // Sum of player salaries

  // Squad
  squad: string[];        // Player IDs
  captain: string | null;
  viceCaptain: string | null;

  // Meta
  reputation: number;     // 0-100: Affects player attraction
  fanBase: number;        // 0-100: Affects pressure

  // For player's team only
  boardPatience?: number; // 0-100: Too low = fired
  boardExpectations?: 'rebuild' | 'compete' | 'win';
}

// ============================================
// MATCH TYPES
// ============================================

export type MatchPhase = 'powerplay' | 'middle' | 'death';
export type TacticalApproach = 'aggressive' | 'balanced' | 'cautious';

// Bowling length options (line/length)
export type BowlingLength = 'good-length' | 'short' | 'yorkers' | 'full-pitched';

// Field setting options (phase-aware)
export type FieldSetting = 'attacking' | 'balanced' | 'defensive' | 'death-field';

// Bowling approach per phase (mirrors batting approach structure)
export interface BowlingApproach {
  powerplay: { length: BowlingLength; field: FieldSetting };
  middle: { length: BowlingLength; field: FieldSetting };
  death: { length: BowlingLength; field: FieldSetting };
}

// Player-level tactical instructions
export type BattingInstruction = 'default' | 'promote' | 'finisher' | 'anchor';
export type BowlingInstruction = 'default' | 'max-2-overs' | 'max-3-overs' | 'death-specialist' | 'powerplay-only';

export interface PlayerInstruction {
  playerId: string;
  batting?: BattingInstruction;
  bowling?: BowlingInstruction;
}

export interface PitchConditions {
  pace: number;           // 0-100: Helps fast bowlers
  spin: number;           // 0-100: Helps spinners
  bounce: number;         // 0-100: True bounce
  deterioration: number;  // 0-100: How much it changes
}

export interface MatchTactics {
  playingXI: string[];    // 11 Player IDs in batting order
  captain: string;
  wicketkeeper: string;

  battingApproach: {
    powerplay: TacticalApproach;
    middle: TacticalApproach;
    death: TacticalApproach;
  };

  bowlingPlan: {
    openingBowlers: [string, string];
    deathBowler: string;
    spinStrategy: 'early' | 'middle' | 'matchup-based';
    bowlingApproach: BowlingApproach;
  };

  // Player-specific instructions
  playerInstructions: PlayerInstruction[];
}

export type BallOutcome =
  | { type: 'runs'; runs: 0 | 1 | 2 | 3 | 4 | 6 }
  | { type: 'wicket'; dismissal: DismissalType; runs: number }
  | { type: 'extra'; extraType: 'wide' | 'noball' | 'bye' | 'legbye'; runs: number };

export type DismissalType =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'runout'
  | 'stumped'
  | 'hitwicket';

export interface BallEvent {
  over: number;
  ball: number;
  batter: string;         // Player ID
  bowler: string;         // Player ID
  outcome: BallOutcome;
  narrative: string;      // "SKY drives through covers for FOUR"
}

export interface OverSummary {
  overNumber: number;
  bowler: string;
  runs: number;
  wickets: number;
  balls: BallEvent[];
}

export interface InningsState {
  battingTeam: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  overs: number;          // e.g., 14.3 = 14 overs 3 balls
  balls: number;          // Total balls bowled
  currentBatters: [string, string];  // [striker, non-striker]
  currentBowler: string;
  overSummaries: OverSummary[];
  fallOfWickets: { player: string; runs: number; overs: number }[];
  batterStats: Map<string, { runs: number; balls: number; fours: number; sixes: number }>;
  bowlerStats: Map<string, { overs: number; runs: number; wickets: number; dots: number }>;
}

export interface MatchResult {
  winner: string | null;  // Team ID, null for tie
  winMargin: { type: 'runs' | 'wickets'; value: number } | null;
  playerOfMatch: string;
  firstInnings: InningsState;
  secondInnings: InningsState;
}

// Serializable version of InningsState (Maps converted to plain objects)
export interface SerializedInningsState {
  battingTeam: string;
  bowlingTeam: string;
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
  currentBatters: [string, string];
  currentBowler: string;
  overSummaries: OverSummary[];
  fallOfWickets: { player: string; runs: number; overs: number }[];
  batterStats: Record<string, { runs: number; balls: number; fours: number; sixes: number }>;
  bowlerStats: Record<string, { overs: number; runs: number; wickets: number; dots: number }>;
}

// Live match state for persistence
export interface LiveMatchState {
  matchId: string;
  currentInnings: 1 | 2;
  inningsState: SerializedInningsState;
  firstInningsTotal: number;
  recentBalls: BallEvent[];
}

export type MatchType = 'league' | 'qualifier1' | 'eliminator' | 'qualifier2' | 'final';

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  matchNumber: number;    // In the season
  matchType: MatchType;   // League or playoff match

  pitch: PitchConditions;
  weather: 'clear' | 'cloudy' | 'humid';

  // Set before match
  homeTactics: MatchTactics | null;
  awayTactics: MatchTactics | null;

  // Match state
  status: 'upcoming' | 'in_progress' | 'completed';
  tossWinner: string | null;
  tossDecision: 'bat' | 'bowl' | null;
  currentInnings: 1 | 2 | null;
  innings1: InningsState | null;
  innings2: InningsState | null;

  // Final result
  result: MatchResult | null;
}

// ============================================
// PLAYER INTERACTION TYPES
// ============================================

export type InteractionCategory = 'praise' | 'correct' | 'motivate';

export interface InteractionOption {
  id: string;
  category: InteractionCategory;
  label: string;
  description: string;
  // Effects can vary based on personality
  baseEffects: {
    morale: number;
    form: number;
  };
}

export interface InteractionResult {
  success: boolean;
  message: string;
  playerResponse: string;
  effects: {
    morale: number;
    form: number;
    pressHeat?: number;
  };
}

// ============================================
// TEAM MEETING TYPES
// ============================================

export type MeetingType = 'pre-match' | 'post-win' | 'post-loss' | 'crisis';

export interface TeamMeetingOption {
  id: string;
  type: MeetingType;
  label: string;
  description: string;
  baseMoraleDelta: number;
}

export interface TeamMeetingResult {
  success: boolean;
  message: string;
  avgMoraleChange: number;
  notableReactions: { playerName: string; reaction: string }[];
}

// ============================================
// EVENT TYPES
// ============================================

export type EventCategory = 'player' | 'media' | 'team' | 'board';
export type EventUrgency = 'immediate' | 'end-of-day' | 'this-week';

export interface EventEffect {
  target: 'player' | 'team' | 'manager';
  targetId?: string;      // Player ID if targeting player
  attribute: string;      // e.g., 'morale', 'form', 'fitness'
  change: number;         // Delta value
}

export interface EventOption {
  id: string;
  label: string;
  description: string;
  effects: EventEffect[];
}

export interface GameEvent {
  id: string;
  type: 'triggered' | 'random';
  category: EventCategory;

  title: string;
  description: string;

  involvedPlayers: string[];
  urgency: EventUrgency;

  options: EventOption[];

  // When this event was created
  createdAt: string;      // ISO date string

  // Has it been resolved?
  resolved: boolean;
  chosenOption?: string;
}

// ============================================
// GAME STATE
// ============================================

export type GamePhase = 'pre-season' | 'auction' | 'season' | 'playoffs' | 'off-season';
export type GameStartMode = 'real-squads' | 'mini-auction' | 'mega-auction';

export interface PointsTableEntry {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  noResult: number;
  points: number;
  netRunRate: number;
}

export interface Manager {
  name: string;
  reputation: number;     // 0-100

  // Built through decisions
  identity: {
    tacticalStyle: 'aggressive' | 'balanced' | 'defensive';
    youthFocus: number;   // 0-100
    manManagement: number; // 0-100
  };

  // Track record
  history: {
    seasonsManaged: number;
    titlesWon: number;
    playoffAppearances: number;
  };
}

export interface GameState {
  // Meta
  initialized: boolean;
  testerId: string;          // Unique ID for beta feedback tracking (e.g., "BETA-7K3X")
  startMode: GameStartMode;  // How the game was started

  // Time
  currentDate: string;    // ISO date string
  season: number;
  phase: GamePhase;
  matchDay: number;       // Which match in the season (1-14 for league)

  // You
  manager: Manager;
  playerTeamId: string;

  // World
  teams: Team[];
  players: Player[];
  fixtures: Match[];
  pointsTable: PointsTableEntry[];

  // Active events
  activeEvents: GameEvent[];

  // Meta
  pressHeat: number;      // 0-100: Media scrutiny level
  lastMeetingMatchDay: number;  // Track when last team meeting was held

  // Season Progression
  releasedPlayers: string[];  // Player IDs released for upcoming auction
  unsoldPlayers: string[];    // Player IDs unsold from previous auctions
}

// ============================================
// AUCTION TYPES
// ============================================

export type AuctionType = 'mega' | 'mini';

// Base price tiers in lakhs (IPL standard)
export type BasePrice = 50 | 75 | 100 | 150 | 200;

export type AuctionStatus =
  | 'not_started'
  | 'retention_phase'
  | 'release_phase'
  | 'bidding'
  | 'paused'
  | 'squad_fill'
  | 'completed';

export type AuctionPlayerStatus =
  | 'available'      // In pool, not yet called
  | 'current'        // Currently being auctioned
  | 'sold'           // Purchased by a team
  | 'unsold'         // No bids received
  | 'retained'       // Retained by team (mega auction)
  | 'rtm';           // Right To Match used

export interface AuctionBid {
  teamId: string;
  amount: number;    // In lakhs
  timestamp: number;
  isRTM: boolean;
}

export interface AuctionPlayer {
  playerId: string;
  basePrice: BasePrice;
  currentBid: number;
  currentBidder: string | null;
  status: AuctionPlayerStatus;
  bidHistory: AuctionBid[];
  setNumber: number;           // Auction set (1 = marquee, 2, 3, etc.)
  previousTeamId: string | null;  // For RTM eligibility
}

export interface RetentionSlot {
  playerId: string | null;
  cost: number;                // Purse deduction
  slotNumber: 1 | 2 | 3 | 4;
}

export interface TeamAuctionState {
  teamId: string;
  remainingPurse: number;      // In lakhs
  squadSize: number;
  overseasCount: number;
  retentions: RetentionSlot[];
  rtmCardsRemaining: number;
  // Squad composition
  batsmen: number;
  bowlers: number;
  allrounders: number;
  keepers: number;
  // Tracking
  hasPassedCurrentPlayer: boolean;
}

export interface BidIncrement {
  upTo: number;      // Current bid up to this amount
  increment: number; // Increment size in lakhs
}

export interface AuctionSettings {
  auctionType: AuctionType;
  totalPurse: number;          // In lakhs (see AUCTION_CONFIG.TOTAL_PURSE)
  minSquadSize: number;        // 18
  maxSquadSize: number;        // 25
  maxOverseas: number;         // 8
  maxRetentions: number;       // 4 for mega, 0 for mini
  rtmCardsPerTeam: number;
  bidIncrements: BidIncrement[];
}

export interface AIBiddingStrategy {
  teamId: string;
  priorities: {
    batsmen: number;      // 0-100 weight
    bowlers: number;
    allrounders: number;
    keepers: number;
    overseas: number;
  };
  aggression: number;          // 0-100
  budgetConservation: number;  // 0-100
  targetPlayers: string[];     // Player IDs they want
}

export type AuctionPlayerMode = 'active' | 'spectate' | 'sim';

export interface AuctionState {
  status: AuctionStatus;
  settings: AuctionSettings;
  auctionType: AuctionType;

  // Current bidding
  currentPlayer: AuctionPlayer | null;
  auctionPool: AuctionPlayer[];
  soldPlayers: AuctionPlayer[];
  unsoldPlayers: AuctionPlayer[];

  // Team states
  teamStates: Record<string, TeamAuctionState>;
  aiStrategies: Record<string, AIBiddingStrategy>;

  // Timing
  bidTimer: number;
  bidTimerDefault: number;

  // Progress tracking
  currentSet: number;
  playersInCurrentSet: number;
  totalPlayersAuctioned: number;

  // Player interaction mode
  playerMode: AuctionPlayerMode;

  // RTM state
  rtmPhase: boolean;
  rtmTeamId: string | null;
}

// ============================================
// UI STATE TYPES
// ============================================

export type Screen =
  | 'home'
  | 'squad'
  | 'player-detail'
  | 'player-talk'
  | 'team-meeting'
  | 'stats'
  | 'schedule'
  | 'club'
  | 'match-prep'
  | 'match-live'
  | 'match-result'
  | 'event'
  | 'season-summary'
  | 'auction'
  | 'release-phase';

export interface ModalEntry {
  type: 'player' | 'team';
  id: string;
}

export interface UIState {
  currentScreen: Screen;
  selectedPlayerId: string | null;
  selectedMatchId: string | null;
  selectedEventId: string | null;
  simulationSpeed: 'ball-by-ball' | 'over-by-over' | 'instant';
  modalStack: ModalEntry[];
}

// ============================================
// SAVE GAME TYPES
// ============================================

export interface SaveSlot {
  id: 1 | 2 | 3;
  name: string;
  teamId: string;
  teamName: string;
  season: number;
  matchDay: number;
  phase: GamePhase;
  savedAt: string; // ISO date string
}

export interface SaveData {
  slot: SaveSlot;
  gameState: GameState;
  auctionState: AuctionState | null;
  liveMatchState: LiveMatchState | null;
}
