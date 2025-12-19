# Cricket Management Game - Changelog

## v0.8 - Bowling Tactics & Field Settings (Dec 19, 2024)

### Bowling Length Options
- **4 bowling lengths** for strategic variety:
  - **Good Length**: Default, balanced approach
  - **Short (Bouncers)**: High risk/reward, requires speed (65+) to be effective
  - **Yorkers**: Death overs specialty, requires accuracy (70+) to be effective
  - **Full-Pitched**: Swing bowling, high wicket chance with early movement

### Field Settings
- **4 phase-aware field placements**:
  - **Attacking**: More catchers, higher wicket probability, boundaries leak
  - **Balanced**: Standard field placement
  - **Defensive**: Boundary riders, fewer wickets but stops boundaries
  - **Death Field**: Long boundaries covered, ideal for overs 16-20

### Pre-Match Bowling Tactics
- Tactics screen now has **Batting** and **Bowling** tabs
- Set bowling length and field setting per phase (Powerplay, Middle, Death)
- Purple highlight for bowling length selection
- Green highlight for field setting selection

### In-Match Bowling Controls
- When your team is bowling, tactics panel shows:
  - Bowling length override buttons (per over)
  - Field setting override buttons (per over)
  - Tap again to clear override and use default from pre-match tactics

### Fielding Skills Integration
- **Fielding skills now affect match outcomes**:
  - **Catching**: Affects catch dismissal probability (baseline 60)
  - **Athleticism**: Can save boundaries (4s become 2s/3s, up to 30% chance)
  - **Throwing**: Affects run-out conversion rate
  - **Ground Fielding**: Minor bonus to boundary saves

### Match Engine Updates
- `simulateBall()` now accepts optional bowling tactics and team fielding context
- Bowling length modifiers affect boundary, wicket, and dot ball probabilities
- Field setting modifiers affect boundary leakage and dismissal types
- Bowling length effectiveness based on bowler's relevant skill (speed/accuracy/variation)
- Spinners bowling yorkers use variation skill instead of accuracy

### AI Default Tactics
- AI teams now have smart default bowling tactics:
  - Powerplay: Full-pitched + Attacking field
  - Middle: Good length + Balanced field
  - Death: Yorkers + Death field

### Configuration
- New `BOWLING_TACTICS_CONFIG` in `gameConfig.ts`:
  - Skill thresholds for bowling lengths
  - Fielding baseline value
  - Maximum boundary save chance

### Files Modified
| File | Change |
|------|--------|
| `src/types/index.ts` | Added `BowlingLength`, `FieldSetting`, `BowlingApproach` types |
| `src/engine/matchEngine.ts` | Added modifiers, fielding integration, updated `simulateBall()` |
| `src/screens/MatchPrepScreen.tsx` | Added bowling tactics tab with UI |
| `src/screens/MatchLiveScreen.tsx` | Added live bowling override controls |
| `src/config/gameConfig.ts` | Added `BOWLING_TACTICS_CONFIG` |

---

## v0.7 - Multi-Season Loop & Player Data Overhaul (Dec 19, 2024)

### ESPNcricinfo Player Database
- **503 real IPL players** parsed from ESPNcricinfo API data
- Players organized by team: MI(24), CSK(22), RCB(14), KKR(20), DC(22), RR(25), PBKS(26), GT(25), SRH(23), LSG(23)
- **279 free agents** available for auctions
- Retired old manually-created 108-player database

**Enhanced Player Model**
- Added `imageUrl` field - player photos from ESPNcricinfo CDN
- Added `playingRole` field - 12 specific tactical roles:
  - Batters: `opening-batter`, `top-order-batter`, `middle-order-batter`, `finisher`
  - Keepers: `wicketkeeper-batter`
  - Allrounders: `batting-allrounder`, `bowling-allrounder`, `spin-bowling-allrounder`
  - Bowlers: `opening-bowler`, `pace-bowler`, `spin-bowler`, `death-bowler`
- Player detail screen now shows photo (with fallback to initials avatar)
- Displays specific playing role instead of generic role

### Multi-Season Progression
- **"Continue to Next Season"** button on Season Summary screen
- Season end processing: player aging (+1 year), contract expiry (-1 year)
- Partial stat carryover between seasons (30% form retention)
- Manager history tracking: seasons managed, titles won, playoff appearances

**Auction Cycle**
- Mega auction every 3 years (Season 1, 4, 7...)
- Mini auction for other seasons (2, 3, 5, 6...)
- `isMegaAuctionYear(season)` helper function in config

### Release Phase Screen (NEW)
- Pre-mini-auction screen for player releases
- Auto-selects players with expired contracts (`yearsRemaining <= 0`)
- Manual release selection for additional players
- Shows purse refund calculation
- "Confirm Releases & Start Mini Auction" flow

**Store Actions Added**
- `startNextSeason()` - triggers off-season processing
- `processSeasonEnd()` - ages players, decrements contracts
- `releasePlayer(playerId)` - mark player for release
- `confirmReleases()` - finalize and start mini auction
- `resetForNewSeason()` - new fixtures, reset points table

### Auction Pool Size Limits
- **Mega auction: 250 players** (top by value score)
- **Mini auction: 100 players** (released + unsold + expired)
- Config: `AUCTION_CONFIG.MEGA_AUCTION_POOL_SIZE`, `MINI_AUCTION_POOL_SIZE`
- Prevents 500+ player auctions that were unrealistic

### AI Bidding Engine Overhaul
**Quality-Based Interest System**
- Star players (80+ value): 85-95% interest from each AI team
- Good players (60-80): 50-70% interest
- Average players (40-60): 30-50% interest
- Low value (<40): 5-15% interest
- **Result**: Bidding wars for stars, quick base-price sales for lesser players

**Realistic Max Bid Tiers (in lakhs)**
| Player Value | Max Bid Range |
|--------------|---------------|
| 85+ (Elite)  | ₹15-24 Cr     |
| 75-85 (Star) | ₹8-15 Cr      |
| 65-75        | ₹4-8 Cr       |
| 55-65        | ₹2-4 Cr       |
| 45-55        | ₹75L-2 Cr     |
| <45          | ₹50-75L       |

**AI Behavior Improvements**
- `calculateQualityInterest()` - primary factor is player quality
- `calculateMaxBid()` - tier-based pricing with team strategy modifiers
- Bid fatigue: AI interest drops in long bidding wars
- Progress penalty: AI drops out as price approaches their max
- Team aggression/conservation still factors in, but quality is primary

### Bug Fixes
- Fixed 38 wicketkeepers classified as batsmen (now correctly `role: 'keeper'`)
- Fixed `generateFixtures` signature mismatch (takes `playerTeamId`, not array)
- Fixed missing `releasedPlayers` and `unsoldPlayers` in save game state

### Files Added/Modified
| File | Change |
|------|--------|
| `src/data/players.ts` | Replaced with 503 ESPNcricinfo players |
| `src/screens/ReleasePhaseScreen.tsx` | NEW - release phase UI |
| `src/engine/auctionAI.ts` | Overhauled bidding logic |
| `src/data/auction.ts` | Pool size limits |
| `src/config/gameConfig.ts` | Pool size config |
| `src/types/index.ts` | `PlayingRole` type, `releasedPlayers`, `unsoldPlayers` |
| `src/store/gameStore.ts` | Season progression actions |
| `src/screens/PlayerDetailScreen.tsx` | Player image display |
| `src/screens/SeasonSummaryScreen.tsx` | Continue button |

### Files Retired
- `src/data/players.txt` (raw API data - 1.2MB)
- `scripts/parsePlayersData.cjs` (parser script)
- Old manually-created `players.ts`

---

## v0.6 - Full IPL Auction System (Dec 18, 2024)

**Mega Auction**
- Complete IPL-style auction with turn-based bidding against 8 AI teams
- Retention phase: Choose up to 4 players to retain before auction
- IPL retention cost structure (18 Cr, 14 Cr, 11 Cr, 18 Cr for slots 1-4)
- Mega auction triggers every 3 years (Season 1, 4, 7...)

**Turn-Based Bidding System**
- Click "BID" or "PASS" for each player - no time pressure
- "Your turn - Analyze and decide" indicator shows when it's your turn
- AI responds after you bid, then back to you
- When you pass, AI teams bid among themselves until done
- Clear SOLD/UNSOLD resolution with "Next Player" button

**AI Bidding Engine**
- Team-specific strategies (RCB aggressive, CSK conservative, etc.)
- Role-based need assessment for balanced squads
- Budget conservation and urgency mechanics
- Competitive realistic bidding wars

**Squad Rules**
- Minimum 18, maximum 25 players per squad
- Maximum 8 overseas players
- Budget reserve enforcement for minimum squad

**Spectate & Sim Modes**
- Once you have 18+ players, option to spectate remaining auction
- "Sim Rest" button to instantly complete auction
- View final squad summary with all purchases

**Auction UI**
- Current player card with stats, base price, current bid
- Bid history showing recent bids
- Team status grid showing all 9 teams' purse and squad count
- SOLD/UNSOLD banners when player is resolved
- Tap on player card to view full stats (batting, bowling, fielding, form, fitness)
- Squad modal showing composition, role breakdown, priority needs
- Auction log modal showing sold/unsold players with prices and buyers
- "Jump Back In" button to re-enter bidding after passing
- Upcoming players preview with "See All" for budget planning

**Save Game System**
- 3 save slots for manual saves
- Save & Exit from retention/auction screens
- Load saves from main menu
- Delete saves with confirmation
- Shows team, season, match day, and save date

**Configurable Settings**
- Game constants moved to `/src/config/gameConfig.ts`
- Updated to IPL 2025 purse size (120 Cr)
- Easy to update retention costs, squad limits, bid increments

**Match Simulation UI**
- Ball-by-ball visual display with colored indicators (red=wicket, green=6, blue=4, gray=dot)
- Current over summary with run count
- Latest ball narrative shown after each delivery
- Sticky control buttons at bottom to prevent UI bouncing
- Fixed height sections for stable layout during simulation

**Scorecard Improvements**
- All 11 batsmen now shown in live scorecard (was only showing batters with stats)
- "Yet to bat" displayed for batters waiting to come in
- "Did not bat" shown for batters in completed match scorecards
- Both live match and schedule screen scorecards updated

**Schedule Screen**
- Filter tabs: Your Matches (default) | All | Upcoming | Completed
- "All" filter shows all matches including AI vs AI games
- Click on completed matches to view full scorecards

**Bug Fixes**
- Fixed auction state not persisting on page refresh
- Auction screen now correctly restores when reloading during auction phase
- Fixed ball-by-ball mode not showing ball results
- Fixed control buttons bouncing during match simulation

---

## v0.5.1 - Match Engine & Season Improvements (Dec 18, 2024)

**Match Engine Improvements**
- Game ends immediately when target is reached (no more scoring past the target)
- New "Next Ball" button for ball-by-ball control
- New "Sim to Wicket" button - simulates until next wicket falls
- Pause when new batsman comes in (for player tactics)
- Partial overs tracked correctly in scorecards

**Season Expansion**
- Full 14-match IPL season (was 5-match prototype)
- Play each opponent once, then 6 teams again for variety
- Top 4 teams in points table highlighted in green/bold
- Dashed line separates playoff positions from rest

**Scorecard Retrieval**
- View full scorecards of completed matches from Schedule screen
- Batting and bowling breakdown for both innings
- Fall of wickets and detailed player stats

**Team Meetings**
- Hold team meetings to motivate the entire squad
- Available from Club screen under Team Actions
- Different meeting types: Pre-match focus, Victory celebration, Loss recovery, Crisis management
- Personality-based reactions from players
- Cooldown prevents overuse (2 match days between meetings)

**Playoff Elimination Handling**
- Proper elimination detection in Eliminator and Q2
- Season ends gracefully when player is eliminated
- Correct finish position shown (3rd if eliminated in Q2, 4th in Eliminator)
- "Season Complete" screen now shows for eliminated players

---

## v0.5 - Navigation & Player Management (Dec 18, 2024)

**Theme**: Transform from "match simulator" to "franchise management game"

**Navigation Overhaul**
- New 5-tab bottom navigation: Home, Squad, Stats, Schedule, Club
- Home screen simplified - just next match, alerts, and quick links
- Points table moved to Schedule screen
- Squad stats moved to dedicated screens

**New Screens**
- **Schedule**: Full fixture list, opponent scouting (form, top players), collapsible points table
- **Stats**: Season leaderboards - top run scorers, wicket takers, best strike rates, economies
- **Club**: Team finances, board confidence, fan support, squad composition breakdown

**Player Interactions**
- "Talk to Player" system from player detail screen
- Praise, correct, or motivate players
- Personality-based responses (fiery players may clash, calm players handle criticism well)
- Consequences: morale/form changes, potential media events
- Cooldown prevents spam (2 match days between talks)

**New Game Flow**
- Choose start mode: "Real Squads" or "Start with Auction"
- Step-by-step setup: Mode → Team → Manager name
- Auction placeholder (full implementation in v0.6)

**Deferred to v0.6**
- [ ] Full auction system with real-time AI bidding
- [ ] Retention and release mechanics

---

## v0.4 - Events & Tactical Depth (Dec 18, 2024)

**Random Events System**
- ~35% chance of event after each match
- Player events: Playing time complaints, form slumps, nightlife controversy
- Media events: Press conferences about losing streaks, transfer speculation
- Board events: Expectations meetings, sponsor concerns
- Choices have visible consequences on morale, form, press heat, board patience

**In-Match Tactical Controls**
- Per-batter approach: Attack/Normal/Defend for striker and non-striker
- Manual bowler selection with 4-over limit enforcement
- Live scorecard with full batting and bowling breakdowns

**Playoffs & Season Flow**
- Full IPL playoff format: Q1 → Eliminator → Q2 → Final
- AI playoff matches auto-simulate when player not involved
- Season summary with championship results and top performers
- Points table frozen during playoffs

---

## v0.3 - Player Instructions & Playoffs (Dec 18, 2024)

**Player-Level Tactics**
- Batting: Promote, Finisher, Anchor roles
- Bowling: Over limits, Death specialist, Powerplay only

**Season Progression**
- 5-match league phase → Top 4 qualify for playoffs
- Season-end summary with stats and standings

---

## v0.2 - Match Experience (Dec 18, 2024)

**Enhanced Match Display**
- Live player scores with runs, balls, SR, 4s, 6s
- Bowler figures with economy
- Background simulation for AI matches
- NRR tracking and playoff cutoff indicator

**Auto-Select Squad**
- Best XI selection based on fitness, form, role balance
- Overseas player limit (max 4)

---

## v0.1 - Core Prototype (Dec 17, 2024)

**Foundation**
- React + TypeScript + Vite + Zustand + Tailwind
- 117 real IPL players across 9 franchises
- Over-by-over match simulation engine

**Screens**
- Team selection and manager creation
- Home dashboard with next match and points table
- Squad management with player details
- Match preparation and live simulation

---

*Last updated: Dec 19, 2024*
