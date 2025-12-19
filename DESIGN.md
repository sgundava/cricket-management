# Cricket Management Game - Design Document

> A data-driven cricket management simulation inspired by Football Manager. You're the owner/coach of an IPL franchise navigating auctions, match tactics, player management, and media drama.

---

## Table of Contents
1. [Core Concept](#core-concept)
2. [Technical Decisions](#technical-decisions)
3. [Data Models](#data-models)
4. [UI/UX Flow](#uiux-flow)
5. [Match Engine](#match-engine)
6. [Event System](#event-system)
7. [Open Questions](#open-questions)
8. [Current State & Backlog](#current-state--backlog)
9. [Future Vision: Player Career Mode](#future-vision-player-career-mode)
10. [Future Considerations: Marketing & Monetization](#future-considerations-marketing--monetization)

> For version history and session notes, see [CHANGELOG.md](./CHANGELOG.md)

---

## Core Concept

### The Fantasy
You are the owner/head coach of an IPL cricket franchise. You don't play the cricket - you manage everything around it:
- **Squad building**: Auctions, retentions, scouting
- **Tactics**: How aggressive? Who opens? Bowling changes?
- **People management**: Morale, drama, press, egos
- **Resource management**: Budget, salary cap, overseas slots

### Core Loop
```
Auction/Retention → Season (14 matches) → Playoffs → Off-season → Repeat
                         ↓
              [Match Day] → Tactics → Simulation → Results
                         ↓
              [Between Matches] → Events → Decisions → Consequences
```

### What Makes It Fun
1. **Meaningful choices**: Drop the senior player in bad form? Risk the board's wrath?
2. **Emergent narratives**: Your decisions create stories (the underdog rise, the locker room mutiny)
3. **Uncertainty**: Good decisions can still fail. Bad decisions can luck out. Just like real sport.
4. **The drama**: Press conferences, social media controversies, player egos

---

## Technical Decisions

### Platform: Progressive Web App (PWA)
**Decision**: Start with React web app, add PWA features later

**Rationale**:
- Data-driven game doesn't need native performance
- Faster iteration without app store review cycles
- Share via link for early testing
- No 30% app store cut for potential monetization
- Can wrap in Capacitor later if app store presence needed

### Tech Stack (Proposed)
```
Frontend: React + TypeScript
State: Zustand or Redux Toolkit (game state is complex)
Styling: Tailwind CSS (rapid prototyping)
Storage: IndexedDB (local saves) + optional cloud sync later
Backend: None initially (single-player, all client-side)
```

### Why No Backend Initially?
- Single-player game can run entirely client-side
- Reduces complexity for MVP
- Add backend later for: cloud saves, leaderboards, multiplayer leagues

---

## Data Models

### Player
```typescript
interface Player {
  // Identity (static)
  id: string;
  name: string;
  age: number;
  nationality: string;
  role: 'batsman' | 'bowler' | 'allrounder' | 'keeper';
  battingStyle: 'right' | 'left';
  bowlingStyle: 'right-arm-fast' | 'right-arm-medium' | 'left-arm-fast' | 'off-spin' | 'leg-spin' | 'left-arm-spin' | null;

  // Skills (0-100, evolve slowly)
  batting: {
    technique: number;    // Ability to survive, play proper shots
    power: number;        // Boundary hitting
    timing: number;       // Finding gaps, placement
    temperament: number;  // Performance under pressure
  };
  bowling: {
    speed: number;        // Pace (or spin sharpness)
    accuracy: number;     // Line and length consistency
    variation: number;    // Different deliveries
    stamina: number;      // Maintain quality over overs
  };
  fielding: {
    catching: number;
    ground: number;       // Ground fielding
    throwing: number;     // Arm strength/accuracy
    athleticism: number;  // Range, diving, speed
  };

  // Potential (hidden ceiling for each skill)
  potential: {
    batting: number;      // Max batting average potential
    bowling: number;      // Max bowling potential
    fielding: number;     // Max fielding potential
  };

  // Dynamic State (changes frequently)
  form: number;           // -20 to +20, affects performance variance
  fitness: number;        // 0-100, degrades with play
  morale: number;         // 0-100, affected by events/selection
  fatigue: number;        // 0-100, mental + physical exhaustion

  // Personality (affects event responses)
  personality: {
    temperament: 'fiery' | 'calm' | 'moody';
    professionalism: number;  // 0-100
    ambition: number;         // 0-100, high = demands playing time
    leadership: number;       // 0-100, captain material
  };

  // Contract
  contract: {
    salary: number;           // In lakhs per season
    yearsRemaining: number;
    releaseClause: number | null;
    isOverseas: boolean;
  };
}
```

### Team
```typescript
interface Team {
  id: string;
  name: string;
  shortName: string;       // "MI", "CSK", etc.
  colors: { primary: string; secondary: string };
  homeCity: string;

  // Resources
  budget: number;          // Available for auction
  salaryCap: number;       // Max total salary
  currentSalary: number;   // Sum of player salaries

  // Squad
  squad: string[];         // Player IDs
  captain: string | null;
  viceCaptain: string | null;

  // Staff
  staff: {
    headCoach: Staff | null;
    battingCoach: Staff | null;
    bowlingCoach: Staff | null;
    physio: Staff | null;
  };

  // Meta
  reputation: number;      // 0-100, affects player attraction
  fanBase: number;         // Affects revenue, pressure
  facilities: number;      // Affects training effectiveness

  // Your relationship with the board
  boardPatience: number;   // 0-100, too low = fired
  boardExpectations: 'rebuild' | 'compete' | 'win';
}
```

### Manager (You)
```typescript
interface Manager {
  name: string;

  reputation: number;      // 0-100, affects job offers, player attraction

  // Built through your decisions
  identity: {
    tacticalStyle: 'aggressive' | 'balanced' | 'defensive';
    youthFocus: number;    // 0-100
    manManagement: number; // 0-100, affects morale impacts
    mediaHandling: number; // 0-100, affects press interactions
  };

  // Track record
  history: {
    seasonsManaged: number;
    titlesWon: number;
    playoffAppearances: number;
    playersDeveloped: string[];  // Players who improved significantly under you
    notableDecisions: string[];  // "Backed youth over experience in 2024 final"
  };
}
```

### Match
```typescript
interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  date: string;

  // Conditions
  pitch: {
    pace: number;          // 0-100, helps fast bowlers
    spin: number;          // 0-100, helps spinners
    bounce: number;        // 0-100
    deterioration: number; // How much it changes during match
  };
  weather: 'clear' | 'cloudy' | 'humid';

  // Your tactical setup
  tactics: MatchTactics;

  // Results (filled after simulation)
  result: MatchResult | null;
  ballByBall: BallEvent[] | null;  // Full record
}

interface MatchTactics {
  playingXI: string[];     // 11 Player IDs in batting order
  captain: string;
  wicketkeeper: string;

  battingApproach: {
    powerplay: 'aggressive' | 'balanced' | 'cautious';
    middle: 'aggressive' | 'balanced' | 'cautious';
    death: 'aggressive' | 'balanced' | 'cautious';
  };

  bowlingPlan: {
    openingBowlers: [string, string];
    deathBowler: string;
    spinStrategy: 'early' | 'middle' | 'matchup-based';
  };

  // Specific instructions per player
  playerInstructions: Map<string, PlayerInstruction>;
}
```

### Event
```typescript
interface GameEvent {
  id: string;
  type: 'triggered' | 'random' | 'scheduled';
  category: 'personal' | 'media' | 'team' | 'board' | 'external';

  // Display
  title: string;
  description: string;
  imageType: string;       // For UI illustration

  // Context
  involvedPlayers: string[];
  urgency: 'immediate' | 'end-of-day' | 'this-week';

  // Choices
  options: EventOption[];

  // For triggered events
  trigger?: {
    condition: string;     // e.g., "player.form < -10 && player.gamesDropped >= 3"
    probability: number;   // 0-1, chance of firing when condition met
  };

  // Chain events
  followUp?: {
    eventId: string;
    delay: number;         // Days until next event
    condition?: string;    // Only if this is true
  };
}

interface EventOption {
  id: string;
  label: string;
  description: string;

  // Consequences
  effects: EventEffect[];

  // What this says about you
  managerIdentityShift?: Partial<Manager['identity']>;
}

interface EventEffect {
  target: 'player' | 'team' | 'manager' | 'board';
  targetId?: string;
  attribute: string;
  change: number;

  // Delayed effects
  delay?: number;
  duration?: number;       // For temporary effects
}
```

### Game State
```typescript
interface GameState {
  // Time
  currentDate: string;
  season: number;
  phase: 'pre-season' | 'auction' | 'season' | 'playoffs' | 'off-season';

  // Your stuff
  manager: Manager;
  myTeam: Team;

  // League
  teams: Team[];
  players: Map<string, Player>;
  fixtures: Match[];
  pointsTable: PointsTableEntry[];

  // Active stuff
  activeEvents: GameEvent[];
  notifications: Notification[];

  // Meta
  pressHeat: number;       // 0-100, how much media scrutiny

  // History
  pastSeasons: SeasonSummary[];
}
```

---

## Player Database

### Data Source
Player data sourced from ESPNcricinfo API, providing authentic IPL 2025 auction data.

### Player Distribution
```
Total: 503 players

By Team (224 rostered):
  MI: 24    CSK: 22   RCB: 14   KKR: 20   DC: 22
  RR: 25    PBKS: 26  GT: 25    SRH: 23   LSG: 23

Free Agents: 279 (available for auctions)
```

### Enhanced Player Model Fields

```typescript
interface Player {
  // ... existing fields ...

  // NEW: Tactical role for squad building
  playingRole?: PlayingRole;

  // NEW: Player photo URL
  imageUrl?: string;
}

type PlayingRole =
  | 'opening-batter'        // Rohit, Warner, Rahul
  | 'top-order-batter'      // Kohli, SKY
  | 'middle-order-batter'   // Shreyas, Samson
  | 'finisher'              // Hardik, Russell
  | 'wicketkeeper-batter'   // Pant, Ishan
  | 'batting-allrounder'    // Jadeja, Axar
  | 'bowling-allrounder'    // Shardul, Washington
  | 'spin-bowling-allrounder' // Ashwin, Narine
  | 'opening-bowler'        // Bumrah, Starc
  | 'pace-bowler'           // Shami, Siraj
  | 'spin-bowler'           // Chahal, Rashid
  | 'death-bowler'          // Arshdeep, Harshal
  | null;
```

### Skill Generation from API Data

Skills are calculated from auction price as a proxy for player quality:
- `priceScore = 40 + (priceInCr * 3)` capped at 100
- Age factor applied (peak 25-30, decline after 32)
- Role-based skill distribution (batsmen high batting, bowlers high bowling)
- Random variance (±7) for realistic variation

---

## Auction System

### Pool Size Management

```typescript
// Config: src/config/gameConfig.ts
AUCTION_CONFIG = {
  MEGA_AUCTION_POOL_SIZE: 250,  // Top 250 by value
  MINI_AUCTION_POOL_SIZE: 100,  // Top 100 from released/unsold
}
```

**Why 250?**
- 9 teams × 25 max = 225 players needed
- 250 provides ~10% buffer for unsold players
- Prevents 500+ player marathon auctions

### Player Value Calculation

```typescript
function calculatePlayerValue(player: Player): number {
  // Role-weighted skill average
  const battingAvg = (technique + power + timing + temperament) / 4;
  const bowlingAvg = (speed + accuracy + variation + stamina) / 4;

  // Role-based weighting
  skillScore = {
    batsman:    batting * 0.85 + bowling * 0.05 + fielding * 0.10,
    bowler:     bowling * 0.85 + batting * 0.05 + fielding * 0.10,
    allrounder: (batting + bowling) / 2 * 0.9 + fielding * 0.10,
    keeper:     batting * 0.70 + fielding * 0.30,
  };

  // Modifiers
  ageFactor = (age < 23) ? 1.3 : (age < 26) ? 1.2 : (age < 30) ? 1.0 : (age < 34) ? 0.85 : 0.7;
  formFactor = 1 + (form / 50);  // -20 to +20 maps to 0.6 to 1.4
  overseasFactor = isOverseas ? 1.1 : 1.0;

  return skillScore * ageFactor * formFactor * overseasFactor;
}
```

### AI Bidding Engine

**Core Principle**: HIGH-VALUE PLAYERS attract MORE TEAMS

```typescript
// Quality-based interest (primary factor)
function calculateQualityInterest(playerValue: number): number {
  if (value >= 80) return 0.85 + (value - 80) * 0.005;  // 85-95%
  if (value >= 70) return 0.70 + (value - 70) * 0.015;  // 70-85%
  if (value >= 60) return 0.50 + (value - 60) * 0.020;  // 50-70%
  if (value >= 50) return 0.30 + (value - 50) * 0.020;  // 30-50%
  if (value >= 40) return 0.15 + (value - 40) * 0.015;  // 15-30%
  return 0.05 + value * 0.0025;                         // 5-15%
}
```

**Max Bid Tiers** (realistic IPL pricing):

| Player Value | Max Bid Range | Examples |
|--------------|---------------|----------|
| 85+ (Elite)  | ₹15-24 Cr     | Bumrah, Kohli, Pant |
| 75-85 (Star) | ₹8-15 Cr      | Hardik, Jadeja, Archer |
| 65-75        | ₹4-8 Cr       | Chahal, Siraj, Iyer |
| 55-65        | ₹2-4 Cr       | Arshdeep, Washington |
| 45-55        | ₹75L-2 Cr     | Domestic performers |
| <45          | ₹50-75L       | Uncapped youngsters |

**Bidding Behavior**:
- `progressPenalty`: AI interest drops as price approaches their max
- `bidWarFatigue`: Interest drops 5% per bid in long wars
- `aggressionBonus`: Team-specific modifier (-25% to +25%)
- Team strategies still apply (RCB aggressive, CSK conservative)

---

## Season Progression

### Multi-Season Loop

```
Season End
    ↓
Season Summary Screen
    ↓ [Continue to Next Season]
processSeasonEnd()
    ├── Age all players +1 year
    ├── Decrement contracts -1 year
    ├── Apply partial stat carryover (30% form)
    └── Update manager history
    ↓
Check: isMegaAuctionYear(season)?
    ↓
┌───────────────┬───────────────┐
│ MEGA (1,4,7)  │ MINI (2,3,5,6)│
├───────────────┼───────────────┤
│ Retention     │ Release Phase │
│ Phase         │ Screen        │
└───────┬───────┴───────┬───────┘
        ↓               ↓
        └───── Auction ─┘
               ↓
        completeAuction()
               ↓
        resetForNewSeason()
        ├── Generate new fixtures
        ├── Reset points table
        └── Apply stat carryover
               ↓
        New Season Begins!
```

### Release Phase (Mini Auction Years)

For seasons 2, 3, 5, 6, etc:
1. Show current squad with contract status
2. Auto-mark players with `yearsRemaining <= 0`
3. Allow manual release selection
4. Show purse refund impact
5. "Confirm Releases" → Mini Auction

### Partial Stat Carryover

```typescript
function resetForNewSeason() {
  players.forEach(player => {
    // Good form carries over partially
    player.form = Math.round(player.form * 0.3);

    // Fitness/morale reset with slight variation
    player.fitness = 70 + Math.floor(Math.random() * 10);
    player.morale = 60 + Math.floor(Math.random() * 10);
    player.fatigue = 0;

    // Reset interaction cooldowns
    player.lastTalkedMatchDay = 0;
  });
}
```

---

## UI/UX Flow

### Information Architecture

```
[Home Dashboard]
    │
    ├── [Squad Hub]
    │   ├── Squad Overview (list view)
    │   ├── Player Detail (individual)
    │   ├── Tactics Builder
    │   └── Training
    │
    ├── [Match Center]
    │   ├── Upcoming Match
    │   ├── Match Day (live sim)
    │   ├── Match Review
    │   └── Season Fixtures
    │
    ├── [Transfers]
    │   ├── Auction Room (during auction phase)
    │   ├── Contract Negotiations
    │   └── Scout Reports
    │
    ├── [Club]
    │   ├── Finances
    │   ├── Staff
    │   ├── Facilities
    │   └── Board Room
    │
    └── [News & Events]
        ├── Inbox (events requiring response)
        ├── News Feed
        └── Press Conference
```

### Screen Wireframes

#### 1. Home Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] Cricket Manager              [Settings] [Profile]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NEXT MATCH                              IN 2 DAYS  │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │  [MI Logo]  Mumbai Indians                          │   │
│  │       vs                                            │   │
│  │  [CSK Logo] Chennai Super Kings                     │   │
│  │                                                     │   │
│  │  Wankhede Stadium • 7:30 PM                        │   │
│  │                                         [Prepare →] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │  🔴 ATTENTION (2)    │  │  POINTS TABLE            │   │
│  │  ──────────────────  │  │  ─────────────────────   │   │
│  │  • Rohit wants to    │  │  1. GT    8-4  16 pts   │   │
│  │    discuss his role  │  │  2. MI    7-5  14 pts ← │   │
│  │                      │  │  3. CSK   6-5  12 pts   │   │
│  │  • Press asking      │  │  4. RCB   6-6  12 pts   │   │
│  │    about Bumrah's    │  │  ...                     │   │
│  │    workload          │  │                          │   │
│  │         [View All →] │  │         [Full Table →]  │   │
│  └──────────────────────┘  └──────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  SQUAD SNAPSHOT                                     │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │                                                     │   │
│  │  [Morale: 72 ████████░░]  [Fitness: 81 █████████░] │   │
│  │                                                     │   │
│  │  ⚠️ Concerns:                                       │   │
│  │  • Hardik Pandya - Fatigue 78 (needs rest)         │   │
│  │  • Ishan Kishan - Form -12 (struggling)            │   │
│  │                                        [Squad →]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [🏠 Home]  [👥 Squad]  [🏏 Match]  [💰 Transfers]  [📰 News] │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Squad Overview
```
┌─────────────────────────────────────────────────────────────┐
│  ← Squad                              [Filter ▼] [Sort ▼]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Budget: ₹12.5 Cr remaining    Overseas: 6/8 slots used    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BATSMEN                                            │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  [📷] Rohit Sharma (C)           Form  Fitness Mor  │   │
│  │       34y • Right-hand • ₹16 Cr  [+8]  [85]   [71] │   │
│  │       ──────────────────────────────────────────    │   │
│  │  [📷] Ishan Kishan               [-12] [90]   [58] │   │
│  │       25y • Left-hand • ₹15.2 Cr  ⚠️ Poor form     │   │
│  │       ──────────────────────────────────────────    │   │
│  │  [📷] Suryakumar Yadav           [+15] [78]   [82] │   │
│  │       33y • Right-hand • ₹8 Cr    🔥 Hot streak    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ALL-ROUNDERS                                       │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  [📷] Hardik Pandya 🌍           [+3]  [62]   [75] │   │
│  │       30y • ₹15 Cr                ⚠️ Fatigue high  │   │
│  │       ──────────────────────────────────────────    │   │
│  │  [📷] Cameron Green 🌍           [+5]  [88]   [80] │   │
│  │       25y • ₹17.5 Cr                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BOWLERS                                            │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  [📷] Jasprit Bumrah             [+11] [80]   [85] │   │
│  │       30y • Right-arm fast • ₹12 Cr                │   │
│  │  ...                                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [🏠 Home]  [👥 Squad]  [🏏 Match]  [💰 Transfers]  [📰 News] │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Player Detail
```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         ┌──────────┐                                        │
│         │          │   ROHIT SHARMA                         │
│         │  [Photo] │   Captain • Right-hand Batsman         │
│         │          │   34 years • India 🇮🇳                  │
│         └──────────┘                                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  CURRENT STATE                                      │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  Form      [████████░░░░░░░░░░░░]  +8 (Good)       │   │
│  │  Fitness   [█████████████████░░░]  85%             │   │
│  │  Morale    [██████████████░░░░░░]  71%             │   │
│  │  Fatigue   [████████░░░░░░░░░░░░]  42%             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Skills]  [Stats]  [History]  [Contract]                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BATTING                          Potential: 92     │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  Technique    [██████████████████░░]  88           │   │
│  │  Power        [████████████████░░░░]  82           │   │
│  │  Timing       [███████████████████░]  91           │   │
│  │  Temperament  [██████████████░░░░░░]  72           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PERSONALITY                                        │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  Temperament: Calm                                  │   │
│  │  Professionalism: 85                                │   │
│  │  Ambition: 78                                       │   │
│  │  Leadership: 91                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  💭 "Happy with the team direction. Wants to       │   │
│  │      mentor young players this season."            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [🏠 Home]  [👥 Squad]  [🏏 Match]  [💰 Transfers]  [📰 News] │
└─────────────────────────────────────────────────────────────┘
```

#### 4. Match Day - Team Selection
```
┌─────────────────────────────────────────────────────────────┐
│  Match Preparation                    vs Chennai Super Kings│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [1. Select XI]  [2. Tactics]  [3. Review]                 │
│  ━━━━━━━━━━━━━━                                            │
│                                                             │
│  Playing XI (11/11)              Overseas: 4/4 ✓           │
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────┐   │
│  │  SELECTED           │    │  AVAILABLE              │   │
│  │  ─────────────────  │    │  ─────────────────────  │   │
│  │  1. Rohit (C)       │    │  Nehal Wadhera          │   │
│  │  2. Ishan (WK)      │    │  Arjun Tendulkar        │   │
│  │  3. SKY             │    │  Kumar Kartikeya        │   │
│  │  4. Tilak           │    │  Jason Behrendorff 🌍   │   │
│  │  5. Hardik ⚠️       │    │  Shams Mulani           │   │
│  │  6. Tim David 🌍    │    │                         │   │
│  │  7. Cameron Green 🌍│    │                         │   │
│  │  8. Piyush Chawla   │    │                         │   │
│  │  9. Jasprit Bumrah  │    │                         │   │
│  │  10. Akash Madhwal  │    │                         │   │
│  │  11. Gerald Coetzee🌍│   │                         │   │
│  │                     │    │                         │   │
│  │  [↑↓ Reorder]       │    │                         │   │
│  └─────────────────────┘    └─────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⚠️ WARNINGS                                        │   │
│  │  • Hardik's fatigue is 78 - consider resting       │   │
│  │  • Ishan's form is -12 - may struggle              │   │
│  │  • No left-arm option selected                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                      [Continue to Tactics →]│
├─────────────────────────────────────────────────────────────┤
│  [🏠 Home]  [👥 Squad]  [🏏 Match]  [💰 Transfers]  [📰 News] │
└─────────────────────────────────────────────────────────────┘
```

#### 5. Match Day - Tactics
```
┌─────────────────────────────────────────────────────────────┐
│  Match Preparation                    vs Chennai Super Kings│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [1. Select XI]  [2. Tactics]  [3. Review]                 │
│                  ━━━━━━━━━━━━                               │
│                                                             │
│  BATTING APPROACH                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  Powerplay (1-6)                                    │   │
│  │  [Aggressive ●]  [Balanced ○]  [Cautious ○]        │   │
│  │  "Attack from ball one. Accept risks."             │   │
│  │                                                     │   │
│  │  Middle Overs (7-15)                                │   │
│  │  [Aggressive ○]  [Balanced ●]  [Cautious ○]        │   │
│  │  "Rotate strike, punish bad balls."                │   │
│  │                                                     │   │
│  │  Death (16-20)                                      │   │
│  │  [Aggressive ●]  [Balanced ○]  [Cautious ○]        │   │
│  │  "Maximize runs. High risk acceptable."            │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  BOWLING PLAN                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  Opening pair:   [Bumrah ▼]  +  [Coetzee ▼]        │   │
│  │                                                     │   │
│  │  Death specialist: [Bumrah ▼]                       │   │
│  │                                                     │   │
│  │  Spin usage:                                        │   │
│  │  [Early ○]  [Middle ●]  [Matchup-based ○]          │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  SPECIFIC INSTRUCTIONS (tap player to set)                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Hardik: "Bowl only 2 overs max" ✏️                 │   │
│  │  Tim David: "Come in at death only" ✏️              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [← Back]                                [Start Match →]   │
├─────────────────────────────────────────────────────────────┤
│  [🏠 Home]  [👥 Squad]  [🏏 Match]  [💰 Transfers]  [📰 News] │
└─────────────────────────────────────────────────────────────┘
```

#### 6. Match Simulation (Ball-by-Ball View)
```
┌─────────────────────────────────────────────────────────────┐
│  LIVE   MI vs CSK                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          MUMBAI INDIANS BATTING                     │   │
│  │                                                     │   │
│  │              127 - 3                                │   │
│  │            ━━━━━━━━━━━                              │   │
│  │          14.3 overs • RRR: 8.2                     │   │
│  │                                                     │   │
│  │  Suryakumar Yadav*     54 (32)    SR: 168.75      │   │
│  │  Hardik Pandya         12 (8)     SR: 150.00      │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  LAST BALL                                         │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │                                                     │   │
│  │  Ravindra Jadeja → Suryakumar Yadav               │   │
│  │                                                     │   │
│  │  ┌───────────────────────────────────────┐        │   │
│  │  │                  🔴                    │        │   │
│  │  │                 FOUR                   │        │   │
│  │  │                                        │        │   │
│  │  │  "SKY dances down the track and       │        │   │
│  │  │   lofts it over extra cover.          │        │   │
│  │  │   Brilliant timing!"                   │        │   │
│  │  └───────────────────────────────────────┘        │   │
│  │                                                     │   │
│  │  This over: 1 • 4 • 0 • 1 • 4 • ○                 │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [⏸️ Pause]   [⏩ Faster]   [🔀 Sim to End]         │   │
│  │                                                     │   │
│  │  Speed: [●○○○] Ball-by-ball                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  MAKE A CHANGE                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [🔄 Change Bowler]  [📋 Adjust Field]  [💬 Message]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                      [Commentary ▼]                         │
└─────────────────────────────────────────────────────────────┘
```

#### 7. Event/Decision Screen
```
┌─────────────────────────────────────────────────────────────┐
│                                              [X Close Later]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    ┌────────────────┐                       │
│                    │   [Ishan's     │                       │
│                    │    Photo]      │                       │
│                    └────────────────┘                       │
│                                                             │
│                  PLAYER UNHAPPY                             │
│                  ━━━━━━━━━━━━━━━                            │
│                                                             │
│    "Ishan Kishan requests meeting after being dropped       │
│     for the third consecutive match"                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📊 CONTEXT                                         │   │
│  │                                                     │   │
│  │  • Form: -12 (Poor)                                │   │
│  │  • Dropped: 3 matches                               │   │
│  │  • Contract: ₹15.2 Cr (2 years left)               │   │
│  │  • Personality: High ambition (85)                  │   │
│  │  • Team standing: 2nd most expensive player         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  YOUR OPTIONS                                       │   │
│  │                                                     │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │ 💪 "You'll get your chance when form returns" │ │   │
│  │  │ Firm but fair. He may accept or sulk.         │ │   │
│  │  │ → Morale: -5 to -15 depending on personality  │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │                                                     │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │ 🤝 "I'll give you the next game, prove me     │ │   │
│  │  │     wrong"                                     │ │   │
│  │  │ Commits you to selecting him.                  │ │   │
│  │  │ → Morale: +10, but you MUST select him        │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │                                                     │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │ 🔥 "Performance earns spots. No exceptions."  │ │   │
│  │  │ Assert authority. Risk confrontation.          │ │   │
│  │  │ → Morale: -20, Authority +5, Media may hear   │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│               [Decide Later - 2 days left]                  │
└─────────────────────────────────────────────────────────────┘
```

#### 8. Auction Room
```
┌─────────────────────────────────────────────────────────────┐
│  IPL AUCTION 2025                         Your purse: ₹42 Cr│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 NOW BIDDING                         │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │   │
│  │                                                     │   │
│  │    ┌────────┐    MITCHELL STARC                    │   │
│  │    │ [Photo]│    Left-arm Fast • Australia 🇦🇺      │   │
│  │    └────────┘    33 years                          │   │
│  │                                                     │   │
│  │    Base: ₹2 Cr       Current: ₹18.5 Cr            │   │
│  │                                                     │   │
│  │    Highest bidder: [KKR Logo] Kolkata Knight Riders│   │
│  │                                                     │   │
│  │    ⏱️ Going once... going twice...                 │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  YOUR ASSESSMENT                                    │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  True value (your scouts): ~₹14 Cr                 │   │
│  │  Overseas slots available: 2                        │   │
│  │  Squad need for pacers: HIGH                        │   │
│  │                                                     │   │
│  │  💭 "Elite pacer but aging. Price is inflated."   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │   [₹19 Cr]    [₹20 Cr]    [₹22 Cr]    [Pass]     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AUCTION LOG                                        │   │
│  │  • Pat Cummins → SRH (₹20.5 Cr)                   │   │
│  │  • Rishabh Pant → LSG (₹27 Cr) 🔥                 │   │
│  │  • KL Rahul → DC (₹14 Cr)                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [Your Squad: 18/25]  [Budget Log]  [Other Teams]          │
└─────────────────────────────────────────────────────────────┘
```

---

## Match Engine

### Core Algorithm
```typescript
function simulateBall(
  batter: Player,
  bowler: Player,
  matchState: MatchState,
  tactics: MatchTactics,
  pitch: PitchConditions
): BallOutcome {

  // 1. Calculate base probabilities
  const baseProbs = calculateBaseOutcomeProbabilities(batter, bowler, pitch);

  // 2. Apply form modifiers
  const formAdjusted = applyFormModifiers(baseProbs, batter.form, bowler.form);

  // 3. Apply fatigue penalties
  const fatigueAdjusted = applyFatiguePenalties(formAdjusted, batter.fatigue, bowler.fatigue);

  // 4. Apply match situation pressure
  const pressureAdjusted = applyPressure(fatigueAdjusted, matchState);

  // 5. Apply tactical instructions
  const tacticsAdjusted = applyTactics(pressureAdjusted, tactics, batter, bowler);

  // 6. Apply phase-specific modifiers
  const phaseAdjusted = applyPhaseModifiers(tacticsAdjusted, matchState.currentOver);

  // 7. Roll the dice
  const outcome = rollOutcome(phaseAdjusted);

  // 8. Generate narrative
  const narrative = generateNarrative(outcome, batter, bowler, matchState);

  return { outcome, narrative };
}
```

### Outcome Probabilities (example baseline)
```typescript
// For an average batter vs average bowler on neutral pitch
const baseOutcomes = {
  dot: 0.35,
  single: 0.30,
  two: 0.08,
  three: 0.02,
  four: 0.12,
  six: 0.05,
  wicket: 0.08
};

// Modified by skills - e.g., high power batter:
// four: +5%, six: +3%, dot: -4%, single: -4%
```

### Phase Modifiers
```typescript
const phaseModifiers = {
  powerplay: {
    boundary_boost: 1.2,     // More boundaries
    wicket_risk: 1.15,       // Slightly more wickets
    run_rate_expectation: 8.5
  },
  middle: {
    boundary_boost: 0.9,
    wicket_risk: 0.85,       // Safer accumulation phase
    run_rate_expectation: 7.5
  },
  death: {
    boundary_boost: 1.4,     // Much more boundaries
    wicket_risk: 1.3,        // Much more wickets
    run_rate_expectation: 11
  }
};
```

---

## Event System

### Event Categories
1. **Player Events**: Form slumps, injuries, personal issues, contract demands
2. **Media Events**: Press conferences, controversy, social media
3. **Team Events**: Dressing room dynamics, captain issues, celebrations
4. **Board Events**: Budget changes, expectations, facility upgrades
5. **External Events**: Weather, venue changes, league rule changes

### Trigger System
```typescript
interface EventTrigger {
  id: string;
  condition: (state: GameState) => boolean;
  probability: number;  // Chance of firing when condition is true
  cooldown: number;     // Days before can fire again

  // Example conditions:
  // - player.form < -10 && player.gamesDropped >= 3
  // - team.winStreak >= 5
  // - manager.pressHeat > 80 && recentControversy
}
```

### Event Chains
```typescript
interface EventChain {
  id: string;
  name: string;
  stages: ChainStage[];
}

// Example: "The Succession Crisis"
const successionCrisis: EventChain = {
  id: 'succession_crisis',
  name: 'The Succession Crisis',
  stages: [
    {
      event: 'vice_captain_interview',
      delay: 0,
      nextStageCondition: 'always'
    },
    {
      event: 'media_leadership_speculation',
      delay: 2,
      nextStageCondition: 'captain.morale < 70'
    },
    {
      event: 'captain_confrontation',
      delay: 3,
      nextStageCondition: 'didnt_back_captain'
    },
    {
      event: 'dressing_room_split',
      delay: 5,
      nextStageCondition: 'conflict_unresolved'
    }
  ]
};
```

---

## Open Questions

### Gameplay
- [x] **Single format (T20) or multiple (T20 + ODI + Test)?**
  - **Decision**: Support all formats. This is "Cricket Manager", not "IPL Manager".
  - MVP starts with T20/IPL, but architecture should support ODI and Test formats.
  - Different formats = different tactics, player value, match pacing.

- [x] **Real player names/teams or fictional?**
  - **Decision**: Start with real players and teams.
  - As players age out and retire, procedurally generated players fill the gaps.
  - Users can create hypothetical IPL teams and build them to glory.
  - Long-term saves will naturally blend real + generated players.

- [x] **Multiplayer leagues (future feature)?**
  - **Decision**: Maybe. Peer-to-peer competitions could increase engagement.
  - Deferred to post-launch. Would require significant backend work.
  - Could be async (submit team, results calculated) or real-time leagues.

- [x] **How detailed should press conferences be?**
  - **Decision**: Situational depth. Context determines complexity.
  - High stakes = detailed conferences (Ashes, knockout games, rivalry matches, controversies)
  - Routine matches = lighter touch or skip entirely
  - The drama IS the feature—lean into tension moments

### Technical
- [x] **Save system: local only or cloud sync?**
  - **Decision**: Local for MVP, cloud sync as paid feature later.
  - See [Marketing & Monetization](#future-considerations-marketing--monetization) section.

- [ ] **How to handle game balance testing?**
  - Approach TBD. Options to consider:
  - **Simulation testing**: Run thousands of AI vs AI matches, check stat distributions
  - **Community beta**: Let players find broken strategies
  - **Telemetry**: Track win rates, player usage, common exploits (requires backend)
  - **Key balance areas**: Auction values, player skill curves, form impact, tactics effectiveness

- [ ] **Performance budget for match simulation?**
  - Approach TBD. Considerations:
  - **Ball-by-ball**: ~120-150 balls per T20 innings, 240-300 per match
  - **Target**: Full match simulation should complete in <500ms for "instant result"
  - **Live simulation**: Each ball should render in <16ms (60fps) with commentary
  - **Memory**: Full match history (ball-by-ball) for ~50 matches ≈ 15,000 balls, keep under 5MB
  - **Mobile constraint**: Must run smoothly on mid-range Android devices

### Monetization (Future)
- [x] **Monetization model?**
  - **Decision**: Lifetime + Subscription hybrid with free tier. See [Marketing & Monetization](#future-considerations-marketing--monetization) section for full details.
  - No ads in core gameplay (ads feel extractive for premium experience)
  - Cosmetic IAPs possible but not core model

---

## Current State & Backlog

> See [CHANGELOG.md](./CHANGELOG.md) for detailed version history and session notes.

### Completed (v0.6) - Full IPL Auction System

**Auction System**
- [x] Full IPL-style auction with turn-based bidding against 8 AI teams
- [x] Retention phase: Choose up to 4 players with IPL cost structure
- [x] AI bidding engine with team-specific strategies (RCB aggressive, CSK conservative)
- [x] Role-based need assessment for balanced squads
- [x] Squad rules: 18 min, 25 max, 8 overseas limit
- [x] Spectate & Sim modes when you have 18+ players
- [x] "Jump Back In" to re-enter bidding after passing

**Auction UI**
- [x] Current player card with full stats on tap
- [x] Bid history and team status grid
- [x] SOLD/UNSOLD banners with "Next Player" flow
- [x] Squad modal showing composition and priority needs
- [x] Auction log modal with all sold/unsold players
- [x] Upcoming players preview for budget planning

**Save Game System**
- [x] 3 manual save slots (separate from auto-save)
- [x] Save & Exit from retention/auction screens
- [x] Load/delete saves from main menu
- [x] Shows team, season, match day, and save date

**Match Simulation UI**
- [x] Ball-by-ball visual display with colored indicators
- [x] Current over summary with run count
- [x] Latest ball narrative after each delivery
- [x] Sticky control buttons to prevent UI bouncing
- [x] All 11 batsmen shown in scorecard ("yet to bat" / "did not bat")

**Configuration**
- [x] Game constants in `/src/config/gameConfig.ts`
- [x] IPL 2025 purse size (120 Cr)
- [x] Configurable retention costs, squad limits, bid increments

### Completed (v0.5/v0.5.1) - Navigation & Season

**Navigation**
- [x] 5-tab bottom navigation: Home, Squad, Stats, Schedule, Club
- [x] Schedule screen with fixture list, opponent scouting, filter tabs
- [x] Stats screen with season leaderboards
- [x] Club screen with finances, board confidence, fan support

**Player Management**
- [x] "Talk to Player" system with personality-based responses
- [x] Praise, correct, or motivate players
- [x] Team meetings with cooldown

**Match Engine**
- [x] Full 14-match IPL season
- [x] Next Ball, Sim to Wicket, Auto Simulate controls
- [x] Game ends immediately when target reached
- [x] View completed match scorecards from Schedule

**Season Flow**
- [x] IPL playoff format: Q1 → Eliminator → Q2 → Final
- [x] Proper elimination handling with finish positions
- [x] Season Complete screen for all outcomes

### Completed (v0.4) - Events & Tactics

- [x] Random event system (~35% after matches)
- [x] Player/media/board events with consequences
- [x] In-match tactical controls (per-batter approach, bowler selection)

### Completed (v0.3 and earlier)

- [x] 9 IPL teams with 117 real players
- [x] Match engine with over-by-over simulation
- [x] Tactics system (aggressive/balanced/defensive per phase)
- [x] Player-level instructions (batting roles, bowling limits)
- [x] Points table with NRR
- [x] Form/fatigue system with recovery
- [x] Local save (Zustand persist)

---

### Completed (v0.7) - Multi-Season Loop & Player Data

**ESPNcricinfo Player Database**
- [x] 503 real IPL players parsed from ESPNcricinfo API
- [x] Players by team: MI(24), CSK(22), RCB(14), KKR(20), DC(22), RR(25), PBKS(26), GT(25), SRH(23), LSG(23)
- [x] 279 free agents available for auctions
- [x] Enhanced player model with `imageUrl` and `playingRole` fields
- [x] 12 specific tactical roles (opening-batter, death-bowler, etc.)
- [x] Player photos displayed in detail screen

**Multi-Season Progression**
- [x] Season transitions with off-season phase
- [x] "Continue to Next Season" button on Season Summary
- [x] Player aging (+1 year per season)
- [x] Contract expiry (-1 year per season)
- [x] Partial stat carryover (30% form retention)
- [x] Manager history tracking (seasons, titles, playoffs)

**Auction Cycle**
- [x] Mega auction every 3 years (Season 1, 4, 7...)
- [x] Mini auction for other seasons (2, 3, 5, 6...)
- [x] Release Phase screen for mini auction years
- [x] Auto-release of expired contracts
- [x] Manual release selection with purse impact

**Auction Pool Optimization**
- [x] Mega auction pool limited to 250 top players (by value)
- [x] Mini auction pool limited to 100 players
- [x] Prevents 500+ player auctions

**AI Bidding Engine Overhaul**
- [x] Quality-based interest system (stars attract more bidders)
- [x] Realistic max bid tiers matching IPL prices
- [x] Bid fatigue in long bidding wars
- [x] Price-based dropout logic

---

### v0.8 Backlog - Next Steps

**Player Development**
- [ ] Training system between seasons
- [ ] Skill improvement based on playing time and form
- [ ] Youth development pathway
- [ ] Player retirement system (currently deferred - unsold = out)

**Staff Management**
- [ ] Head coach, batting coach, bowling coach, physio
- [ ] Staff affects training effectiveness and recovery
- [ ] Hiring/firing with budget implications

**Enhanced Match Experience**
- [ ] Commentary system with contextual narratives
- [ ] Key moment highlights (big wickets, milestones)
- [ ] Match momentum indicator

### Future Versions

- [ ] Multiple tournaments (IPL + domestic cups)
- [ ] International call-ups affecting availability
- [ ] Procedural player generation for retirements
- [ ] Cloud sync (paid feature)
- [ ] Multiplayer leagues

---

## Future Vision: Player Career Mode

> **Status**: Deferred to V2 / Post-Launch Expansion
> **Documented**: Dec 18, 2024

### The Concept

Alongside Manager Career, offer a **Player Career Mode** where you play as a cricketer working your way from obscurity to legend:

- **Start as an amateur**: Begin in domestic cricket (Ranji Trophy / state-level)
- **Get noticed**: Performance attracts IPL scouts
- **IPL career**: Navigate auctions from the other side—hoping to get picked, negotiating contracts
- **International call-up**: Represent India based on form and selectors' preferences
- **Career arc**: Experience the full journey—peak years, decline, retirement, and potentially transition to coaching/management

### Why It's Compelling

1. **Personal stakes**: Unlike manager mode where you're omniscient, player mode is intimate. *Your* form slump. *Your* injury. *Your* feud with the captain.
2. **Different gameplay loop**: More narrative/RPG-like, less spreadsheet-strategic
3. **Emotional investment**: The rags-to-riches arc (domestic grind → IPL stardom → World Cup glory) is deeply satisfying
4. **Unique progression**: Player → Captain → Manager could be a selling point no cricket game offers

### What It Shares With Manager Mode

The two modes share significant infrastructure:
- Match engine (same simulation, different perspective)
- Player attribute system (same skills, form, fitness mechanics)
- Team dynamics and relationships
- Event/drama system (events hit differently when you're the subject vs. the manager)
- Contract and financial systems

### Design Implications for Current Work

Even though Player Career is V2, we should **design current systems with it in mind**:

| System | Manager Mode | Player Mode (Future) | Design Consideration |
|--------|--------------|----------------------|---------------------|
| Player Personality | Affects team management | Defines *your* character | Make personality system rich enough to drive a protagonist's story |
| Form/Confidence | Statistical modifier | Core emotional arc | Should feel personal, not just numbers |
| Relationships | Manage player-to-player dynamics | *Your* relationships with teammates, captain, coach | Build relationship system that works from both perspectives |
| Events | Choose responses as manager | Experience events as subject | Event system should support player-perspective triggers |
| Match Simulation | Watch from dugout | Experience ball-by-ball as participant | Consider how to surface "player experience" data |

### Deferred Questions (For V2 Planning)

- How do we handle the "boring" parts of a player career (sitting on bench, waiting for selection)?
- What agency does the player have during matches? (Shot selection? Or just watch outcomes?)
- How do we make domestic cricket engaging before IPL/international?
- Can we support "created player" vs "play as real player" modes?
- What's the retirement/legacy system?

---

## Future Considerations: Marketing & Monetization

> **Status**: Captured for future reference. Focus is on building a great product first.
> **Documented**: Dec 18, 2024

### Target Audience

**Primary**: India + cricket-mad diaspora

Key characteristics:
- High price sensitivity (₹500 feels different than $6)
- Mobile-first, predominantly Android
- Comfortable with UPI/digital payments
- Used to both F2P mobile games AND paying for quality (Netflix, Hotstar)
- Engagement spikes during IPL season (March-May)

### Competitive Landscape

| Competitor | Model | Notes |
|-----------|-------|-------|
| Football Manager | ~$50 one-time, yearly releases | Gold standard for management sims |
| Mobile management games | Mostly F2P with aggressive IAP | Often extractive, poor UX |
| Cricket games | Mostly arcade | Few serious cricket management sims exist |

### Monetization Models Considered

#### Option 1: Time-Limited Trial (2 hrs free → pay)
**Verdict**: Not ideal for management games. Core loop is slow; 2 hours might just be auction setup. Creates anxiety about "wasting free time in menus."

#### Option 2: Per-Season Fee (Tied to real IPL calendar)
**Verdict**: Interesting but confusing. Game seasons ≠ real seasons. Creates weird "wait for next season" behavior.

#### Option 3: One-Time Purchase
**Pros**: Simple, honest, player-friendly, great for word-of-mouth
**Cons**: Need continuous new users to survive, no revenue from engaged players
**Could work as**: Yearly editions (IPL Manager 2025, 2026, etc.)

#### Option 4: Standard Subscription
**Concern**: Feels wrong at every price point. Subscriptions for single-player games feel extractive.

#### Option 5: Lifetime + Subscription Hybrid (Leading Candidate)
```
Subscription: ₹79/month or ₹599/year
  - Full access to everything
  - Cancel anytime

Lifetime: ₹1,299 one-time
  - Own it forever
  - All current + future features
  - "Founder" badge (cosmetic)
```

**Why this works**:
- Subscription is accessible ("try it for a month" money)
- Lifetime satisfies "I want to own it" players
- Lifetime buyers fund development upfront
- Can raise subscription price later without betraying early adopters
- Early lifetime becomes "early believer" reward

### Free Tier Concept

Generous free tier to fuel growth:

```
Free Tier:
  ✓ Full match engine
  ✓ One "Quick Play" season (randomized team, no persistence)
  ✓ Limited saves (3?)
  ✗ No cloud sync
  ✗ No auction mode (auto-draft only)
  ✗ No multiplayer leagues (future)

Paid (Subscription or Lifetime):
  ✓ Unlimited saves
  ✓ Full auction experience
  ✓ Cloud sync across devices
  ✓ Multiplayer leagues (future)
  ✓ Editor mode (future)
```

**Rationale**: Auction locked because it's premium AND prevents "restart until perfect team" exploit.

### Marketing Channels

| Platform | Strategy |
|----------|----------|
| Twitter/X | Cricket Twitter is massive. Share dramatic match moments, engage during live IPL |
| YouTube | Partner with cricket content creators for "let's play" videos |
| Reddit | r/Cricket, r/ipl—genuine engagement, not overt marketing |
| Instagram Reels | Short clips: auction drama, last-ball finishes, player meltdowns |
| Discord | Build community early, let them shape the game |

### Launch Timing

Ideal calendar:
- **Dec-Jan**: Beta with small community (word of mouth)
- **February**: Public launch (pre-IPL hype building)
- **March-May**: IPL season (peak engagement, peak marketing)
- **June-Sept**: Feature updates, retain players
- **Oct-Nov**: "New season" update, prep for next cycle

**Ideal launch window**: IPL auction week—everyone's thinking about squad building

### Messaging Direction

Don't say: "Cricket management simulation"

Say: "Build your IPL dynasty. Handle the drama. Lift the trophy."

Lead with emotion and fantasy:
- "What if you owned an IPL team?"
- "Your star player just criticized you in the press. What do you do?"
- "The auction is live. ₹2 crore left. One overseas slot. Choose wisely."

### Price Benchmarks (India)

| Reference | Price |
|-----------|-------|
| Hotstar Premium (year) | ₹1,499 |
| Netflix Mobile | ₹149/month |
| BGMI Battle Pass | ₹79 |
| Console game (premium) | ₹3,999 |
| Good mobile game | ₹299-599 one-time |

**Sweet spots**:
- Lifetime: ₹999-1,499 (less than Hotstar annual)
- Subscription: ₹59-99/month (Netflix tier)

### Technical Considerations

- **PWA enforcement**: Users can clear storage to bypass limits. Accept leakage OR require lightweight account system
- **Cloud sync**: Requires backend (auth, storage, conflict resolution)—Phase 2 feature
- **Payment integration**: UPI essential. Razorpay or similar handles subscriptions well

### Open Questions (Revisit Later)

- [ ] Exact free tier limits (3 saves arbitrary—needs testing)
- [ ] Keep lifetime option forever or sunset after early adopter phase?
- [ ] Referral/invite system for word-of-mouth growth?
- [ ] Regional pricing if we go native (app stores)?

---

*Last updated: Dec 19, 2024 (v0.7)*
