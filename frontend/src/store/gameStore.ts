import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  GameState,
  UIState,
  Screen,
  Player,
  Team,
  Match,
  GameEvent,
  PointsTableEntry,
  MatchTactics,
  EventOption,
  MatchType,
  InteractionOption,
  InteractionResult,
  GameStartMode,
  TeamMeetingOption,
  TeamMeetingResult,
  AuctionState,
  InningsState,
  AuctionType,
  AuctionPlayer,
  AuctionPlayerMode,
  SaveSlot,
  LiveMatchState,
  SerializedInningsState,
} from '../types';
import {
  getSaveSlots,
  saveGame as saveGameToSlot,
  loadGame as loadGameFromSlot,
  deleteSave as deleteSaveSlot,
} from '../utils/saveManager';
import { generatePlayoffMatch } from '../data/fixtures';
import { generateRandomEvent } from '../data/events';
import {
  generateAuctionPool,
  createAuctionSettings,
  createTeamAuctionState,
  createAIStrategies,
  getNextBidAmount,
  canTeamAffordBid,
  canTeamAddOverseas,
  isSquadFull,
  hasMinSquad,
  getTotalRetentionCost,
  formatAmount,
  getSquadFillPool,
  canPickSquadFillPlayer,
  autoFillTeamSquad,
  calculateBasePrice,
} from '../data/auction';
import {
  getTeamsWillingToBid,
  selectNextBidder,
  simulatePlayerAuction,
} from '../engine/auctionAI';
import { AUCTION_CONFIG } from '../config/gameConfig';

// ============================================
// STORE INTERFACE
// ============================================

interface GameStore extends GameState, UIState {
  // Initialization
  initializeGame: (playerTeamId: string, managerName: string, startMode: GameStartMode) => void;
  resetGame: () => void;

  // Navigation
  navigateTo: (screen: Screen) => void;
  selectPlayer: (playerId: string | null) => void;
  selectMatch: (matchId: string | null) => void;
  selectEvent: (eventId: string | null) => void;
  setSimulationSpeed: (speed: UIState['simulationSpeed']) => void;

  // Modal management
  openPlayerModal: (playerId: string, allowStacking?: boolean) => void;
  openTeamModal: (teamId: string, allowStacking?: boolean) => void;
  closeModal: () => void;
  closeAllModals: () => void;

  // Player management
  updatePlayer: (playerId: string, updates: Partial<Player>) => void;
  updatePlayerState: (playerId: string, updates: Partial<Pick<Player, 'form' | 'fitness' | 'morale' | 'fatigue'>>) => void;

  // Team management
  updateTeam: (teamId: string, updates: Partial<Team>) => void;
  setCaptain: (teamId: string, playerId: string) => void;
  setViceCaptain: (teamId: string, playerId: string) => void;

  // Match management
  setMatchTactics: (matchId: string, teamId: string, tactics: MatchTactics) => void;
  updateMatch: (matchId: string, updates: Partial<Match>) => void;
  updatePointsTable: (entries: PointsTableEntry[]) => void;
  simulateBackgroundMatches: () => void;

  // Season progression
  checkAndStartPlayoffs: () => boolean;
  progressPlayoffs: (completedMatchId: string, winnerId: string, loserId: string) => void;
  isSeasonComplete: () => boolean;
  getSeasonResult: () => { champion: string | null; runnerUp: string | null; playerFinish: number } | null;

  // Multi-season progression
  startNextSeason: () => void;
  processSeasonEnd: () => void;
  releasePlayer: (playerId: string) => void;
  confirmReleases: () => void;
  resetForNewSeason: () => void;
  isMegaAuctionYear: (season: number) => boolean;

  // Event management
  addEvent: (event: GameEvent) => void;
  resolveEvent: (eventId: string, optionId: string) => void;
  applyEventEffects: (option: EventOption) => void;
  generatePostMatchEvent: (wasWin: boolean) => void;

  // Game progression
  advanceDay: () => void;
  advanceToNextMatch: () => void;

  // Data loading
  loadInitialData: (players: Player[], teams: Team[], fixtures: Match[]) => void;

  // Player Interactions
  canTalkToPlayer: (playerId: string) => boolean;
  talkToPlayer: (playerId: string, option: InteractionOption) => InteractionResult;
  getInteractionOptions: (playerId: string) => InteractionOption[];

  // Team Meetings
  canHoldTeamMeeting: () => boolean;
  getTeamMeetingOptions: () => TeamMeetingOption[];
  holdTeamMeeting: (option: TeamMeetingOption) => TeamMeetingResult;

  // Auction
  auctionState: AuctionState | null;
  initializeAuction: (type: AuctionType, startStatus?: 'release_phase' | 'bidding') => void;
  setRetention: (playerId: string, slot: 1 | 2 | 3 | 4) => void;
  removeRetention: (slot: 1 | 2 | 3 | 4) => void;
  confirmRetentions: () => void;
  startBidding: () => void;
  placeBid: () => void;
  passBid: () => void;
  processAIBidRound: () => boolean;
  nextPlayer: () => void;
  markPlayerSold: () => void;
  markPlayerUnsold: () => void;
  setAuctionMode: (mode: AuctionPlayerMode) => void;
  simRestOfAuction: () => void;
  completeAuction: () => void;
  canPlayerBid: () => boolean;
  getNextBidAmountForPlayer: () => number;
  shouldTriggerAuction: () => { trigger: boolean; type: AuctionType };

  // Squad Fill (post-auction)
  pickSquadFillPlayer: (playerId: string) => void;
  autoFillPlayerSquad: () => void;
  completeSquadFill: () => void;

  // Save/Load
  getSaveSlots: () => SaveSlot[];
  saveToSlot: (slotId: 1 | 2 | 3, name?: string) => boolean;
  loadFromSlot: (slotId: 1 | 2 | 3) => boolean;
  deleteSlot: (slotId: 1 | 2 | 3) => boolean;
  exportForBugReport: () => string;

  // Live Match State
  liveMatchState: LiveMatchState | null;
  saveLiveMatchState: (state: LiveMatchState) => void;
  clearLiveMatchState: () => void;

  // Helpers
  getPlayer: (playerId: string) => Player | undefined;
  getTeam: (teamId: string) => Team | undefined;
  getMatch: (matchId: string) => Match | undefined;
  getPlayerTeam: () => Team | undefined;
  getNextMatch: () => Match | undefined;
  getTeamPlayers: (teamId: string) => Player[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate a short tester ID for beta feedback (e.g., "BETA-7K3X")
const generateTesterId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0/O, 1/I
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BETA-${id}`;
};

// ============================================
// INITIAL STATE
// ============================================

const initialGameState: GameState = {
  initialized: false,
  testerId: '',
  startMode: 'real-squads',
  currentDate: new Date().toISOString().split('T')[0],
  season: 1,
  phase: 'season',
  matchDay: 1,
  manager: {
    name: '',
    reputation: 50,
    identity: {
      tacticalStyle: 'balanced',
      youthFocus: 50,
      manManagement: 50,
    },
    history: {
      seasonsManaged: 0,
      titlesWon: 0,
      playoffAppearances: 0,
    },
  },
  playerTeamId: '',
  teams: [],
  players: [],
  fixtures: [],
  pointsTable: [],
  activeEvents: [],
  pressHeat: 30,
  lastMeetingMatchDay: 0,
  releasedPlayers: [],
  unsoldPlayers: [],
};

const initialUIState: UIState = {
  currentScreen: 'home',
  selectedPlayerId: null,
  selectedMatchId: null,
  selectedEventId: null,
  simulationSpeed: 'over-by-over',
  modalStack: [],
};

const initialAuctionState: AuctionState | null = null;
const initialLiveMatchState: LiveMatchState | null = null;

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialGameState,
      ...initialUIState,
      auctionState: initialAuctionState,
      liveMatchState: initialLiveMatchState,

      // ----------------------------------------
      // Initialization
      // ----------------------------------------
      initializeGame: (playerTeamId: string, managerName: string, startMode: GameStartMode) => {
        // If starting with auction (mini or mega), go to auction phase first
        // Otherwise, go directly to season
        const initialPhase = startMode === 'real-squads' ? 'season' : 'auction';

        set({
          initialized: true,
          testerId: generateTesterId(),
          startMode,
          playerTeamId,
          manager: {
            ...initialGameState.manager,
            name: managerName,
          },
          currentDate: '2025-03-22', // IPL start date
          season: 1,
          phase: initialPhase,
          matchDay: 1,
          // Clear any stale state from previous game
          liveMatchState: null,
          auctionState: null,
          selectedMatchId: null,
        });

        // Initialize points table
        const teams = get().teams;
        const pointsTable: PointsTableEntry[] = teams.map((team) => ({
          teamId: team.id,
          played: 0,
          won: 0,
          lost: 0,
          noResult: 0,
          points: 0,
          netRunRate: 0,
        }));
        set({ pointsTable });

        // Initialize auction if starting with one
        if (startMode === 'mini-auction' || startMode === 'mega-auction') {
          const auctionType = startMode === 'mini-auction' ? 'mini' : 'mega';
          get().initializeAuction(auctionType);
        }
      },

      resetGame: () => {
        set({
          ...initialGameState,
          ...initialUIState,
        });
      },

      // ----------------------------------------
      // Navigation
      // ----------------------------------------
      navigateTo: (screen: Screen) => {
        set({ currentScreen: screen });
      },

      selectPlayer: (playerId: string | null) => {
        set({
          selectedPlayerId: playerId,
          currentScreen: playerId ? 'player-detail' : get().currentScreen,
        });
      },

      selectMatch: (matchId: string | null) => {
        set({ selectedMatchId: matchId });
      },

      selectEvent: (eventId: string | null) => {
        set({
          selectedEventId: eventId,
          currentScreen: eventId ? 'event' : get().currentScreen,
        });
      },

      setSimulationSpeed: (speed: UIState['simulationSpeed']) => {
        set({ simulationSpeed: speed });
      },

      // ----------------------------------------
      // Modal Management
      // ----------------------------------------
      openPlayerModal: (playerId: string, allowStacking = false) => {
        set((state) => ({
          modalStack: allowStacking
            ? [...state.modalStack, { type: 'player' as const, id: playerId }]
            : [{ type: 'player' as const, id: playerId }],
        }));
      },

      openTeamModal: (teamId: string, allowStacking = false) => {
        set((state) => ({
          modalStack: allowStacking
            ? [...state.modalStack, { type: 'team' as const, id: teamId }]
            : [{ type: 'team' as const, id: teamId }],
        }));
      },

      closeModal: () => {
        set((state) => ({
          modalStack: state.modalStack.slice(0, -1),
        }));
      },

      closeAllModals: () => {
        set({ modalStack: [] });
      },

      // ----------------------------------------
      // Player Management
      // ----------------------------------------
      updatePlayer: (playerId: string, updates: Partial<Player>) => {
        set((state) => ({
          players: state.players.map((p) =>
            p.id === playerId ? { ...p, ...updates } : p
          ),
        }));
      },

      updatePlayerState: (
        playerId: string,
        updates: Partial<Pick<Player, 'form' | 'fitness' | 'morale' | 'fatigue'>>
      ) => {
        set((state) => ({
          players: state.players.map((p) => {
            if (p.id !== playerId) return p;
            return {
              ...p,
              form: Math.max(-20, Math.min(20, updates.form ?? p.form)),
              fitness: Math.max(0, Math.min(100, updates.fitness ?? p.fitness)),
              morale: Math.max(0, Math.min(100, updates.morale ?? p.morale)),
              fatigue: Math.max(0, Math.min(100, updates.fatigue ?? p.fatigue)),
            };
          }),
        }));
      },

      // ----------------------------------------
      // Team Management
      // ----------------------------------------
      updateTeam: (teamId: string, updates: Partial<Team>) => {
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, ...updates } : t
          ),
        }));
      },

      setCaptain: (teamId: string, playerId: string) => {
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, captain: playerId } : t
          ),
        }));
      },

      setViceCaptain: (teamId: string, playerId: string) => {
        set((state) => ({
          teams: state.teams.map((t) =>
            t.id === teamId ? { ...t, viceCaptain: playerId } : t
          ),
        }));
      },

      // ----------------------------------------
      // Match Management
      // ----------------------------------------
      setMatchTactics: (matchId: string, teamId: string, tactics: MatchTactics) => {
        set((state) => ({
          fixtures: state.fixtures.map((m) => {
            if (m.id !== matchId) return m;
            if (m.homeTeam === teamId) {
              return { ...m, homeTactics: tactics };
            } else if (m.awayTeam === teamId) {
              return { ...m, awayTactics: tactics };
            }
            return m;
          }),
        }));
      },

      updateMatch: (matchId: string, updates: Partial<Match>) => {
        set((state) => ({
          fixtures: state.fixtures.map((m) =>
            m.id === matchId ? { ...m, ...updates } : m
          ),
        }));
      },

      updatePointsTable: (entries: PointsTableEntry[]) => {
        set({ pointsTable: entries });
      },

      simulateBackgroundMatches: () => {
        // Simulate AI vs AI matches when player finishes a match
        // This now properly updates BOTH fixtures AND points table
        const { teams, playerTeamId, pointsTable, fixtures, players } = get();

        // Helper to generate batting stats for an innings
        const generateBattingStats = (
          teamId: string,
          totalRuns: number,
          totalWickets: number,
          totalOvers: number
        ) => {
          const team = teams.find(t => t.id === teamId);
          if (!team) return { batterStats: new Map(), fallOfWickets: [] };

          const squadPlayers = players.filter(p => team.squad.includes(p.id)).slice(0, 11);
          const batterStats = new Map<string, { runs: number; balls: number; fours: number; sixes: number }>();
          const fallOfWickets: { player: string; runs: number; overs: number }[] = [];

          // Number of batters who batted = wickets + 2 (not out batters), max 11
          const batterCount = Math.min(totalWickets + 2, 11);
          const batters = squadPlayers.slice(0, batterCount);

          let remainingRuns = totalRuns;
          let remainingBalls = totalOvers * 6;
          let teamRunsAtWicket = 0;

          batters.forEach((batter, index) => {
            const isLastBatter = index === batters.length - 1;
            const isNotOut = index >= totalWickets; // Last 2 batters are not out

            // Distribute runs - top order scores more
            const runShare = isLastBatter
              ? remainingRuns
              : Math.floor(remainingRuns * (0.3 - index * 0.02) * (0.8 + Math.random() * 0.4));
            const runs = Math.max(0, Math.min(runShare, remainingRuns));
            remainingRuns -= runs;

            // Distribute balls
            const ballShare = isLastBatter
              ? remainingBalls
              : Math.floor(remainingBalls * (0.25 - index * 0.015) * (0.8 + Math.random() * 0.4));
            const balls = Math.max(1, Math.min(ballShare, remainingBalls));
            remainingBalls -= balls;

            // Calculate boundaries based on runs and strike rate
            const sr = balls > 0 ? (runs / balls) * 100 : 0;
            const sixes = sr > 150 ? Math.floor(runs / 30) : Math.floor(runs / 50);
            const fours = Math.floor((runs - sixes * 6) / 10);

            batterStats.set(batter.id, { runs, balls, fours, sixes });

            // Add fall of wicket if out
            if (!isNotOut && index < totalWickets) {
              teamRunsAtWicket += runs;
              const oversAtWicket = Math.round((totalOvers * (index + 1) / batterCount) * 10) / 10;
              fallOfWickets.push({
                player: batter.id,
                runs: teamRunsAtWicket,
                overs: Math.min(oversAtWicket, totalOvers),
              });
            }
          });

          return { batterStats, fallOfWickets };
        };

        // Helper to generate bowling stats
        const generateBowlingStats = (
          teamId: string,
          runsConceded: number,
          wicketsTaken: number,
          oversBowled: number
        ) => {
          const team = teams.find(t => t.id === teamId);
          if (!team) return new Map();

          // Get bowlers from squad (bowlers and allrounders)
          const squadPlayers = players.filter(p => team.squad.includes(p.id));
          const bowlers = squadPlayers
            .filter(p => p.role === 'bowler' || p.role === 'allrounder')
            .slice(0, 5); // Max 5 bowlers

          const bowlerStats = new Map<string, { overs: number; runs: number; wickets: number; dots: number }>();

          let remainingOvers = oversBowled;
          let remainingRuns = runsConceded;
          let remainingWickets = wicketsTaken;

          bowlers.forEach((bowler, index) => {
            const isLastBowler = index === bowlers.length - 1;

            // Each bowler gets 3-4 overs, max 4
            const overs = isLastBowler
              ? Math.min(remainingOvers, 4)
              : Math.min(3 + Math.floor(Math.random() * 2), remainingOvers, 4);
            remainingOvers -= overs;

            // Distribute runs proportionally
            const runs = isLastBowler
              ? remainingRuns
              : Math.floor(remainingRuns * (overs / oversBowled) * (0.8 + Math.random() * 0.4));
            remainingRuns -= runs;

            // Distribute wickets
            const wickets = isLastBowler
              ? remainingWickets
              : Math.floor(remainingWickets * (0.3 + Math.random() * 0.2));
            remainingWickets = Math.max(0, remainingWickets - wickets);

            // Calculate dots based on economy
            const economy = overs > 0 ? runs / overs : 8;
            const dots = Math.floor(overs * 6 * (economy < 7 ? 0.4 : economy < 9 ? 0.3 : 0.2));

            if (overs > 0) {
              bowlerStats.set(bowler.id, { overs, runs, wickets, dots });
            }
          });

          return bowlerStats;
        };

        // Find upcoming AI vs AI league matches (not involving player's team)
        const upcomingAIMatches = fixtures.filter(
          (m) =>
            m.status === 'upcoming' &&
            m.matchType === 'league' &&
            m.homeTeam !== playerTeamId &&
            m.awayTeam !== playerTeamId
        );

        // Simulate 4 AI matches per player match to keep pace
        const matchesToSimulate = upcomingAIMatches.slice(0, 4);

        if (matchesToSimulate.length === 0) return;

        const newPointsTable = [...pointsTable];
        const updatedFixtures = [...fixtures];

        for (const match of matchesToSimulate) {
          const homeTeam = teams.find((t) => t.id === match.homeTeam);
          const awayTeam = teams.find((t) => t.id === match.awayTeam);

          if (!homeTeam || !awayTeam) continue;

          // Determine winner based on team reputation (with randomness)
          const homeStrength = homeTeam.reputation + Math.random() * 30 + 5; // Home advantage
          const awayStrength = awayTeam.reputation + Math.random() * 30;

          const homeWins = homeStrength > awayStrength;

          // Generate realistic scores
          const firstInningsRuns = 140 + Math.floor(Math.random() * 60); // 140-200
          const firstInningsWickets = 4 + Math.floor(Math.random() * 5); // 4-8 wickets
          const firstInningsOvers = firstInningsWickets >= 10 ? 17 + Math.floor(Math.random() * 3) : 20;

          let secondInningsRuns: number;
          let secondInningsWickets: number;
          let secondInningsOvers: number;

          if (homeWins) {
            // Chasing team (home) wins
            secondInningsRuns = firstInningsRuns + 1;
            secondInningsWickets = 2 + Math.floor(Math.random() * 6); // 2-7 wickets
            secondInningsOvers = 16 + Math.floor(Math.random() * 4); // 16-19 overs
          } else {
            // Defending team (away) wins - chase fails
            secondInningsRuns = firstInningsRuns - 5 - Math.floor(Math.random() * 35); // Fall short by 5-40
            secondInningsWickets = 7 + Math.floor(Math.random() * 4); // 7-10 wickets
            secondInningsOvers = secondInningsWickets >= 10 ? 15 + Math.floor(Math.random() * 5) : 20;
          }

          // Generate player stats for both innings
          const batting1 = generateBattingStats(match.awayTeam, firstInningsRuns, firstInningsWickets, firstInningsOvers);
          const bowling1 = generateBowlingStats(match.homeTeam, firstInningsRuns, firstInningsWickets, firstInningsOvers);
          const batting2 = generateBattingStats(match.homeTeam, secondInningsRuns, secondInningsWickets, secondInningsOvers);
          const bowling2 = generateBowlingStats(match.awayTeam, secondInningsRuns, secondInningsWickets, secondInningsOvers);

          // Create innings state with player stats
          const innings1: InningsState = {
            battingTeam: match.awayTeam, // Away bats first
            bowlingTeam: match.homeTeam,
            runs: firstInningsRuns,
            wickets: firstInningsWickets,
            overs: firstInningsOvers,
            balls: firstInningsOvers * 6,
            currentBatters: ['', ''],
            currentBowler: '',
            overSummaries: [],
            fallOfWickets: batting1.fallOfWickets,
            batterStats: batting1.batterStats,
            bowlerStats: bowling1,
          };

          const innings2: InningsState = {
            battingTeam: match.homeTeam, // Home chases
            bowlingTeam: match.awayTeam,
            runs: secondInningsRuns,
            wickets: secondInningsWickets,
            overs: secondInningsOvers,
            balls: secondInningsOvers * 6,
            currentBatters: ['', ''],
            currentBowler: '',
            overSummaries: [],
            fallOfWickets: batting2.fallOfWickets,
            batterStats: batting2.batterStats,
            bowlerStats: bowling2,
          };

          // Update the fixture
          const fixtureIndex = updatedFixtures.findIndex((f) => f.id === match.id);
          if (fixtureIndex !== -1) {
            updatedFixtures[fixtureIndex] = {
              ...updatedFixtures[fixtureIndex],
              status: 'completed',
              innings1,
              innings2,
              tossWinner: match.awayTeam,
              tossDecision: 'bat',
            };
          }

          // Update points table
          const winnerId = homeWins ? match.homeTeam : match.awayTeam;
          const loserId = homeWins ? match.awayTeam : match.homeTeam;

          const winnerEntry = newPointsTable.find((e) => e.teamId === winnerId);
          const loserEntry = newPointsTable.find((e) => e.teamId === loserId);

          // Calculate NRR impact
          const winnerOvers = homeWins ? secondInningsOvers : firstInningsOvers;
          const winnerRuns = homeWins ? secondInningsRuns : firstInningsRuns;
          const loserOvers = homeWins ? firstInningsOvers : secondInningsOvers;
          const loserRuns = homeWins ? firstInningsRuns : secondInningsRuns;

          if (winnerEntry) {
            winnerEntry.played += 1;
            winnerEntry.won += 1;
            winnerEntry.points += 2;
            // NRR = (Runs scored / Overs faced) - (Runs conceded / Overs bowled)
            const nrrDelta = (winnerRuns / winnerOvers) - (loserRuns / loserOvers);
            winnerEntry.netRunRate += nrrDelta * 0.1; // Scale down for cumulative effect
          }
          if (loserEntry) {
            loserEntry.played += 1;
            loserEntry.lost += 1;
            const nrrDelta = (loserRuns / loserOvers) - (winnerRuns / winnerOvers);
            loserEntry.netRunRate += nrrDelta * 0.1;
          }
        }

        // Round NRR to 3 decimal places
        newPointsTable.forEach((entry) => {
          entry.netRunRate = Math.round(entry.netRunRate * 1000) / 1000;
        });

        set({ fixtures: updatedFixtures, pointsTable: newPointsTable });
      },

      // ----------------------------------------
      // Season Progression
      // ----------------------------------------
      checkAndStartPlayoffs: () => {
        const { fixtures, pointsTable, playerTeamId, phase } = get();

        // Only check during league phase
        if (phase !== 'season') return false;

        // Check if all league matches are complete
        const leagueMatches = fixtures.filter((m) => m.matchType === 'league');
        const playerLeagueMatches = leagueMatches.filter(
          (m) => m.homeTeam === playerTeamId || m.awayTeam === playerTeamId
        );
        const allPlayerMatchesComplete = playerLeagueMatches.every((m) => m.status === 'completed');

        if (!allPlayerMatchesComplete) return false;

        // Get top 4 teams
        const sortedTable = [...pointsTable].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return b.netRunRate - a.netRunRate;
        });
        const top4 = sortedTable.slice(0, 4).map((e) => e.teamId);

        // Check if player's team made playoffs
        const playerPosition = sortedTable.findIndex((e) => e.teamId === playerTeamId) + 1;

        if (playerPosition > 4) {
          // Player didn't make playoffs - season over
          set({ phase: 'off-season' });
          return false;
        }

        // Generate playoff fixtures
        // Qualifier 1: 1st vs 2nd
        const q1 = generatePlayoffMatch(top4[0], top4[1], 'qualifier1', 6);
        // Eliminator: 3rd vs 4th
        const eliminator = generatePlayoffMatch(top4[2], top4[3], 'eliminator', 7);

        set({
          phase: 'playoffs',
          fixtures: [...fixtures, q1, eliminator],
        });

        return true;
      },

      progressPlayoffs: (completedMatchId: string, winnerId: string, loserId: string) => {
        const { fixtures, playerTeamId, teams } = get();
        const completedMatch = fixtures.find((m) => m.id === completedMatchId);

        if (!completedMatch) return;

        let updatedFixtures = [...fixtures];
        const existingMatchTypes = new Set(updatedFixtures.map((m) => m.matchType));

        // Helper to simulate AI playoff match
        const simulateAIPlayoffMatch = (match: Match): { winner: string; loser: string } => {
          const team1 = teams.find((t) => t.id === match.homeTeam);
          const team2 = teams.find((t) => t.id === match.awayTeam);

          // Determine winner based on reputation + randomness
          const team1Strength = (team1?.reputation || 50) + Math.random() * 30;
          const team2Strength = (team2?.reputation || 50) + Math.random() * 30;

          const winner = team1Strength > team2Strength ? match.homeTeam : match.awayTeam;
          const loser = winner === match.homeTeam ? match.awayTeam : match.homeTeam;

          // Mark match as completed
          updatedFixtures = updatedFixtures.map((m) =>
            m.id === match.id ? { ...m, status: 'completed' as const } : m
          );

          return { winner, loser };
        };

        // Helper to check if a match is AI vs AI (player not involved)
        const isAIMatch = (match: Match): boolean => {
          return match.homeTeam !== playerTeamId && match.awayTeam !== playerTeamId;
        };

        // Helper to get winner from a completed match (using innings data)
        const getMatchWinner = (match: Match): string | null => {
          if (!match.innings1 || !match.innings2) return null;
          const chaseSuccessful = match.innings2.runs >= match.innings1.runs + 1;
          if (chaseSuccessful) {
            return match.innings2.battingTeam;
          } else {
            return match.innings1.battingTeam;
          }
        };

        if (completedMatch.matchType === 'qualifier1') {
          // Q1 complete: Winner to Final, Loser to Q2 (after Eliminator)
          // Check if Eliminator is AI vs AI - if so, simulate it now
          const eliminator = updatedFixtures.find(
            (m) => m.matchType === 'eliminator' && m.status === 'upcoming'
          );

          if (eliminator && isAIMatch(eliminator)) {
            // Simulate the eliminator
            const elimResult = simulateAIPlayoffMatch(eliminator);

            // Generate Q2: Q1 Loser vs Eliminator Winner
            if (!existingMatchTypes.has('qualifier2')) {
              const q2 = generatePlayoffMatch(loserId, elimResult.winner, 'qualifier2', 8);
              // If Q2 is also AI vs AI, simulate it
              if (isAIMatch(q2)) {
                updatedFixtures = [...updatedFixtures, { ...q2, status: 'upcoming' as const }];
                // Re-check and simulate
                const q2Match = updatedFixtures.find((m) => m.matchType === 'qualifier2');
                if (q2Match) {
                  const q2Result = simulateAIPlayoffMatch(q2Match);
                  // Generate Final
                  const final = generatePlayoffMatch(winnerId, q2Result.winner, 'final', 9);
                  updatedFixtures = [...updatedFixtures, final];
                }
              } else {
                // Player is in Q2
                updatedFixtures = [...updatedFixtures, q2];
              }
            }
          } else if (eliminator) {
            // Player is in Eliminator (from 3rd or 4th place), just wait
            set({ fixtures: updatedFixtures });
            return;
          }
        } else if (completedMatch.matchType === 'eliminator') {
          // Eliminator complete: Winner to Q2, Loser OUT
          // Check if player was eliminated
          if (loserId === playerTeamId) {
            // Player eliminated in Eliminator - season over for them
            set({ fixtures: updatedFixtures, phase: 'off-season' });
            return;
          }

          // Find Q1 result to get the Q1 loser
          const q1Match = updatedFixtures.find(
            (m) => m.matchType === 'qualifier1' && m.status === 'completed'
          );

          if (q1Match) {
            // Get Q1 loser: the team that was in Q1 but isn't the winner
            const q1Winner = getMatchWinner(q1Match);
            const q1Loser = q1Winner === q1Match.homeTeam ? q1Match.awayTeam : q1Match.homeTeam;

            // Generate Q2: Q1 Loser vs Eliminator Winner
            if (!existingMatchTypes.has('qualifier2')) {
              const q2 = generatePlayoffMatch(q1Loser, winnerId, 'qualifier2', 8);
              updatedFixtures = [...updatedFixtures, q2];
            }
          }
        } else if (completedMatch.matchType === 'qualifier2') {
          // Q2 complete: Winner to Final, Loser OUT
          // Check if player was eliminated
          if (loserId === playerTeamId) {
            // Player eliminated in Q2 - season over for them
            set({ fixtures: updatedFixtures, phase: 'off-season' });
            return;
          }

          const q1Match = updatedFixtures.find(
            (m) => m.matchType === 'qualifier1' && m.status === 'completed'
          );

          if (q1Match && !existingMatchTypes.has('final')) {
            // Get Q1 winner from innings data
            const q1Winner = getMatchWinner(q1Match) || q1Match.homeTeam;

            const final = generatePlayoffMatch(q1Winner, winnerId, 'final', 9);
            updatedFixtures = [...updatedFixtures, final];
          }
        } else if (completedMatch.matchType === 'final') {
          // Season complete!
          set({ fixtures: updatedFixtures, phase: 'off-season' });
          return;
        }

        set({ fixtures: updatedFixtures });
      },

      isSeasonComplete: () => {
        const { phase, fixtures } = get();
        if (phase === 'off-season') return true;

        const finalMatch = fixtures.find((m) => m.matchType === 'final');
        return finalMatch?.status === 'completed';
      },

      getSeasonResult: () => {
        const { fixtures, pointsTable, playerTeamId, phase } = get();

        // Get player's league position
        const sortedTable = [...pointsTable].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return b.netRunRate - a.netRunRate;
        });
        const playerPosition = sortedTable.findIndex((e) => e.teamId === playerTeamId) + 1;

        // Check for final result
        const finalMatch = fixtures.find((m) => m.matchType === 'final' && m.status === 'completed');

        if (finalMatch) {
          // Determine winner
          const winnerId =
            finalMatch.innings2 && finalMatch.innings1
              ? finalMatch.innings2.runs >= finalMatch.innings1.runs + 1
                ? finalMatch.innings2.battingTeam
                : finalMatch.innings1.battingTeam
              : null;

          const loserId = winnerId === finalMatch.homeTeam ? finalMatch.awayTeam : finalMatch.homeTeam;

          return {
            champion: winnerId,
            runnerUp: loserId,
            playerFinish: winnerId === playerTeamId ? 1 : loserId === playerTeamId ? 2 : playerPosition,
          };
        }

        // Check if player was eliminated (phase is off-season but no final completed)
        if (phase === 'off-season') {
          // Find if player lost in Eliminator
          const elimMatch = fixtures.find(
            (m) => m.matchType === 'eliminator' && m.status === 'completed' &&
            (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
          );
          if (elimMatch && elimMatch.innings1 && elimMatch.innings2) {
            const elimWinnerId = elimMatch.innings2.runs >= elimMatch.innings1.runs + 1
              ? elimMatch.innings2.battingTeam
              : elimMatch.innings1.battingTeam;
            if (elimWinnerId !== playerTeamId) {
              // Eliminated in Eliminator = 4th place (3rd and 4th play Eliminator)
              return {
                champion: null,
                runnerUp: null,
                playerFinish: 4, // Eliminated in Eliminator means 4th or worse
              };
            }
          }

          // Find if player lost in Q2
          const q2Match = fixtures.find(
            (m) => m.matchType === 'qualifier2' && m.status === 'completed' &&
            (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
          );
          if (q2Match && q2Match.innings1 && q2Match.innings2) {
            const q2WinnerId = q2Match.innings2.runs >= q2Match.innings1.runs + 1
              ? q2Match.innings2.battingTeam
              : q2Match.innings1.battingTeam;
            if (q2WinnerId !== playerTeamId) {
              // Eliminated in Q2 = 3rd place
              return {
                champion: null,
                runnerUp: null,
                playerFinish: 3, // Eliminated in Q2 means 3rd
              };
            }
          }

          // Didn't make playoffs
          return {
            champion: null,
            runnerUp: null,
            playerFinish: playerPosition,
          };
        }

        // Not complete yet
        return null;
      },

      // ----------------------------------------
      // Multi-Season Progression
      // ----------------------------------------
      isMegaAuctionYear: (season: number) => {
        // Mega auction every 3 years: season 1, 4, 7, 10, etc.
        return season % 3 === 1;
      },

      processSeasonEnd: () => {
        const { players, teams, playerTeamId, getSeasonResult, manager } = get();
        const result = getSeasonResult();

        // Update manager history
        const newManagerHistory = { ...manager.history };
        newManagerHistory.seasonsManaged += 1;
        if (result?.champion === playerTeamId) {
          newManagerHistory.titlesWon += 1;
        }
        if (result && result.playerFinish <= 4) {
          newManagerHistory.playoffAppearances += 1;
        }

        // Age all players (+1 year) and decrement contracts (-1 year)
        const updatedPlayers = players.map((player) => ({
          ...player,
          age: player.age + 1,
          contract: {
            ...player.contract,
            yearsRemaining: Math.max(0, player.contract.yearsRemaining - 1),
          },
          // Apply partial stat carryover
          form: Math.round(player.form * 0.3), // 30% form carries over
          fitness: 70 + Math.floor(Math.random() * 10), // Reset with variation
          morale: 60 + Math.floor(Math.random() * 10),
          fatigue: 0,
          lastTalkedMatchDay: 0,
        }));

        // Find players with expired contracts (yearsRemaining was 1, now 0)
        const expiredContractPlayers = players
          .filter((p) => p.contract.yearsRemaining === 1)
          .map((p) => p.id);

        // Find free agent players (not on any team)
        const allTeamPlayers = teams.flatMap((t) => t.squad);
        const freeAgents = players
          .filter((p) => !allTeamPlayers.includes(p.id))
          .map((p) => p.id);

        set({
          players: updatedPlayers,
          manager: {
            ...manager,
            history: newManagerHistory,
          },
          phase: 'off-season',
          releasedPlayers: expiredContractPlayers,
          unsoldPlayers: [...get().unsoldPlayers, ...freeAgents],
        });
      },

      startNextSeason: () => {
        const { season, processSeasonEnd, isMegaAuctionYear, navigateTo } = get();

        // Process end-of-season updates (aging, contracts, stats)
        processSeasonEnd();

        const nextSeason = season + 1;
        const isMega = isMegaAuctionYear(nextSeason);

        set({ season: nextSeason });

        if (isMega) {
          // Mega auction year - go straight to retention phase
          // TODO: Navigate to retention phase when auction screen handles this
          navigateTo('auction');
          // The auction screen should detect phase === 'off-season' and show retention
        } else {
          // Mini auction year - go to release phase first
          navigateTo('release-phase');
        }
      },

      releasePlayer: (playerId: string) => {
        const { releasedPlayers } = get();
        if (!releasedPlayers.includes(playerId)) {
          set({ releasedPlayers: [...releasedPlayers, playerId] });
        }
      },

      confirmReleases: () => {
        const { releasedPlayers, teams, players, playerTeamId, unsoldPlayers } = get();

        // Remove released players from their teams
        const updatedTeams = teams.map((team) => ({
          ...team,
          squad: team.squad.filter((id) => !releasedPlayers.includes(id)),
        }));

        // Update player contracts for released players
        const updatedPlayers = players.map((player) =>
          releasedPlayers.includes(player.id)
            ? { ...player, contract: { ...player.contract, yearsRemaining: 0 } }
            : player
        );

        // Combine released players with previously unsold players for mini auction pool
        const auctionPool = [...new Set([...releasedPlayers, ...unsoldPlayers])];

        set({
          teams: updatedTeams,
          players: updatedPlayers,
          unsoldPlayers: auctionPool, // This will be used by auction pool generation
        });

        // Initialize mini auction with bidding status (release phase is complete)
        get().initializeAuction('mini', 'bidding');
        get().navigateTo('auction');
      },

      resetForNewSeason: () => {
        const { teams, players, season, playerTeamId } = get();

        // Import generateFixtures function dynamically to avoid circular deps
        import('../data/fixtures').then(({ generateFixtures }) => {
          const newFixtures = generateFixtures(playerTeamId);

          // Reset points table
          const newPointsTable = teams.map((team) => ({
            teamId: team.id,
            played: 0,
            won: 0,
            lost: 0,
            noResult: 0,
            points: 0,
            netRunRate: 0,
          }));

          set({
            fixtures: newFixtures,
            pointsTable: newPointsTable,
            matchDay: 1,
            phase: 'season',
            activeEvents: [],
            pressHeat: 30,
            lastMeetingMatchDay: 0,
            releasedPlayers: [],
          });
        });
      },

      // ----------------------------------------
      // Event Management
      // ----------------------------------------
      addEvent: (event: GameEvent) => {
        set((state) => ({
          activeEvents: [...state.activeEvents, event],
        }));
      },

      resolveEvent: (eventId: string, optionId: string) => {
        const event = get().activeEvents.find((e) => e.id === eventId);
        if (!event) return;

        const option = event.options.find((o) => o.id === optionId);
        if (!option) return;

        // Apply effects
        get().applyEventEffects(option);

        // Mark as resolved
        set((state) => ({
          activeEvents: state.activeEvents.map((e) =>
            e.id === eventId
              ? { ...e, resolved: true, chosenOption: optionId }
              : e
          ),
        }));
      },

      applyEventEffects: (option: EventOption) => {
        option.effects.forEach((effect) => {
          if (effect.target === 'player' && effect.targetId) {
            const player = get().getPlayer(effect.targetId);
            if (player) {
              const currentValue = player[effect.attribute as keyof Player] as number;
              get().updatePlayerState(effect.targetId, {
                [effect.attribute]: Math.max(0, Math.min(100, currentValue + effect.change)),
              } as Partial<Pick<Player, 'form' | 'fitness' | 'morale' | 'fatigue'>>);
            }
          } else if (effect.target === 'team') {
            if (effect.attribute === 'pressHeat') {
              set((state) => ({
                pressHeat: Math.max(0, Math.min(100, state.pressHeat + effect.change)),
              }));
            } else if (effect.attribute === 'boardPatience') {
              const { playerTeamId } = get();
              set((state) => ({
                teams: state.teams.map((t) =>
                  t.id === playerTeamId
                    ? { ...t, boardPatience: Math.max(0, Math.min(100, (t.boardPatience || 50) + effect.change)) }
                    : t
                ),
              }));
            } else if (effect.attribute === 'morale') {
              // Apply to all players on the team
              const { playerTeamId, teams } = get();
              const team = teams.find((t) => t.id === playerTeamId);
              if (team) {
                set((state) => ({
                  players: state.players.map((p) =>
                    team.squad.includes(p.id)
                      ? { ...p, morale: Math.max(0, Math.min(100, p.morale + effect.change)) }
                      : p
                  ),
                }));
              }
            }
          }
        });
      },

      generatePostMatchEvent: (wasWin: boolean) => {
        const { players, playerTeamId, teams, fixtures, pressHeat } = get();

        // Get player team's players
        const team = teams.find((t) => t.id === playerTeamId);
        if (!team) return;

        const teamPlayers = players.filter((p) => team.squad.includes(p.id));

        // Calculate recent results from completed matches
        const playerMatches = fixtures
          .filter((m) => m.status === 'completed' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId))
          .slice(-5); // Last 5 matches

        const recentResults: ('win' | 'loss')[] = playerMatches.map((m) => {
          if (!m.innings1 || !m.innings2) return 'loss';
          const firstBattingTeam = m.innings1.battingTeam;
          const chaseSuccessful = m.innings2.runs >= m.innings1.runs + 1;
          if (chaseSuccessful) {
            return m.innings2.battingTeam === playerTeamId ? 'win' : 'loss';
          } else {
            return firstBattingTeam === playerTeamId ? 'win' : 'loss';
          }
        });

        // Add current result
        recentResults.push(wasWin ? 'win' : 'loss');

        // Calculate team morale average
        const teamMorale = Math.round(teamPlayers.reduce((sum, p) => sum + p.morale, 0) / teamPlayers.length);

        // Generate event
        const event = generateRandomEvent(
          teamPlayers,
          recentResults,
          teamMorale,
          team.boardPatience || 50,
          pressHeat
        );

        if (event) {
          set((state) => ({
            activeEvents: [...state.activeEvents, event],
          }));
        }
      },

      // ----------------------------------------
      // Game Progression
      // ----------------------------------------
      advanceDay: () => {
        set((state) => {
          const currentDate = new Date(state.currentDate);
          currentDate.setDate(currentDate.getDate() + 1);

          // Recovery and form regression each day
          const updatedPlayers = state.players.map((p) => {
            // Form regresses slightly towards 0 each day
            let newForm = p.form;
            if (p.form > 0) {
              newForm = Math.max(0, p.form - 0.5);
            } else if (p.form < 0) {
              newForm = Math.min(0, p.form + 0.5);
            }

            return {
              ...p,
              // Recover 8 fatigue per day
              fatigue: Math.max(0, p.fatigue - 8),
              // Recover 3 fitness per day
              fitness: Math.min(100, p.fitness + 3),
              // Form regresses towards 0
              form: Math.round(newForm * 10) / 10, // Round to 1 decimal
            };
          });

          return {
            currentDate: currentDate.toISOString().split('T')[0],
            players: updatedPlayers,
          };
        });
      },

      advanceToNextMatch: () => {
        set((state) => ({
          matchDay: state.matchDay + 1,
        }));
        // 3 days between matches (more realistic IPL schedule)
        get().advanceDay();
        get().advanceDay();
        get().advanceDay();
      },

      // ----------------------------------------
      // Team Meetings
      // ----------------------------------------
      canHoldTeamMeeting: () => {
        const { matchDay, lastMeetingMatchDay } = get();
        // Can only hold a meeting every 3 match days
        return matchDay - lastMeetingMatchDay >= 3;
      },

      getTeamMeetingOptions: (): TeamMeetingOption[] => {
        const { fixtures, playerTeamId, matchDay } = get();

        // Check context for appropriate meeting types
        const recentMatches = fixtures
          .filter(m => m.status === 'completed' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId))
          .slice(-3);

        const hasUpcomingMatch = fixtures.some(
          m => m.status === 'upcoming' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
        );

        const recentWins = recentMatches.filter(m => {
          if (!m.innings1 || !m.innings2) return false;
          const winnerId = m.innings2.runs >= m.innings1.runs + 1 ? m.innings2.battingTeam : m.innings1.battingTeam;
          return winnerId === playerTeamId;
        }).length;

        const recentLosses = recentMatches.length - recentWins;

        const options: TeamMeetingOption[] = [];

        // Pre-match rallying cry
        if (hasUpcomingMatch) {
          options.push({
            id: 'rally',
            type: 'pre-match',
            label: '"Let\'s go out there and win this!"',
            description: 'Fire up the squad before the next match',
            baseMoraleDelta: 6,
          });

          options.push({
            id: 'focus',
            type: 'pre-match',
            label: '"Stay focused, stick to the plan"',
            description: 'Calm, tactical approach to the upcoming match',
            baseMoraleDelta: 3,
          });
        }

        // Post-win celebration
        if (recentWins > 0) {
          options.push({
            id: 'celebrate',
            type: 'post-win',
            label: '"Great work, but stay hungry"',
            description: 'Acknowledge success while maintaining focus',
            baseMoraleDelta: 5,
          });
        }

        // Post-loss or crisis
        if (recentLosses >= 2) {
          options.push({
            id: 'crisis-calm',
            type: 'crisis',
            label: '"We\'ve been through rough patches before"',
            description: 'Reassure the squad, reduce panic',
            baseMoraleDelta: 4,
          });

          options.push({
            id: 'crisis-demand',
            type: 'crisis',
            label: '"This is not good enough!"',
            description: 'Demand better from everyone (risky with some players)',
            baseMoraleDelta: -2, // Base is negative, but can boost form
          });
        } else if (recentLosses > 0) {
          options.push({
            id: 'bounce-back',
            type: 'post-loss',
            label: '"Forget that loss, we go again"',
            description: 'Move on quickly from the setback',
            baseMoraleDelta: 4,
          });
        }

        // Always available
        options.push({
          id: 'general',
          type: 'pre-match',
          label: '"I believe in every one of you"',
          description: 'General motivational address',
          baseMoraleDelta: 4,
        });

        return options;
      },

      holdTeamMeeting: (option: TeamMeetingOption): TeamMeetingResult => {
        const { playerTeamId, teams, players, matchDay } = get();

        const playerTeam = teams.find(t => t.id === playerTeamId);
        if (!playerTeam) {
          return {
            success: false,
            message: 'Team not found',
            avgMoraleChange: 0,
            notableReactions: [],
          };
        }

        const teamPlayers = players.filter(p => playerTeam.squad.includes(p.id));
        const notableReactions: { playerName: string; reaction: string }[] = [];
        let totalMoraleChange = 0;

        // Apply effects to each player based on their personality
        teamPlayers.forEach(player => {
          let moraleChange = option.baseMoraleDelta;

          // Personality modifiers
          if (option.type === 'crisis' && option.id === 'crisis-demand') {
            // Harsh criticism
            if (player.personality.temperament === 'fiery') {
              // Fiery players may rebel
              if (Math.random() < 0.3) {
                moraleChange = -8;
                notableReactions.push({
                  playerName: player.shortName,
                  reaction: 'Looked angry. May have taken it personally.',
                });
              } else {
                moraleChange = 3;
                notableReactions.push({
                  playerName: player.shortName,
                  reaction: 'Fired up! Ready to prove you wrong.',
                });
              }
            } else if (player.personality.temperament === 'calm') {
              moraleChange = 2;
            } else {
              // Moody - unpredictable
              moraleChange = Math.random() < 0.5 ? -4 : 4;
            }
          } else if (option.type === 'post-win' || option.type === 'pre-match') {
            // Positive meetings
            if (player.personality.professionalism > 70) {
              // Professionals stay grounded
              moraleChange = Math.round(moraleChange * 0.7);
            } else if (player.personality.ambition > 70) {
              // Ambitious players respond well to motivation
              moraleChange = Math.round(moraleChange * 1.2);
            }
          }

          // Clamp morale change
          moraleChange = Math.max(-10, Math.min(10, moraleChange));
          totalMoraleChange += moraleChange;

          // Update player morale
          get().updatePlayerState(player.id, {
            morale: Math.max(0, Math.min(100, player.morale + moraleChange)),
          });
        });

        const avgChange = teamPlayers.length > 0 ? Math.round(totalMoraleChange / teamPlayers.length) : 0;

        // Update last meeting match day
        set({ lastMeetingMatchDay: matchDay });

        // Generate summary message
        let message = '';
        if (avgChange > 3) {
          message = 'The squad is fired up and ready to go!';
        } else if (avgChange > 0) {
          message = 'The team seems motivated after your address.';
        } else if (avgChange < -2) {
          message = 'Some players didn\'t take that well...';
        } else {
          message = 'The team listened but reactions were mixed.';
        }

        return {
          success: avgChange >= 0,
          message,
          avgMoraleChange: avgChange,
          notableReactions: notableReactions.slice(0, 3),
        };
      },

      // ----------------------------------------
      // Auction
      // ----------------------------------------
      initializeAuction: (type: AuctionType, startStatus?: 'release_phase' | 'bidding') => {
        const { teams, players, playerTeamId, unsoldPlayers, releasedPlayers } = get();
        const settings = createAuctionSettings(type);

        // Initialize team auction states
        const teamStates: Record<string, ReturnType<typeof createTeamAuctionState>> = {};
        teams.forEach((team) => {
          teamStates[team.id] = createTeamAuctionState(team, players, type, 0);
        });

        // Generate auction pool
        // For mini auctions, pass the combined released + unsold player IDs
        const miniAuctionPoolIds = type === 'mini'
          ? [...new Set([...unsoldPlayers, ...releasedPlayers])]
          : [];
        const auctionPool = generateAuctionPool(type, players, teams, [], miniAuctionPoolIds);

        // Create AI strategies
        const aiStrategies = createAIStrategies(teams);

        // Determine initial status:
        // - Mega auction: retention_phase
        // - Mini auction: release_phase (unless explicitly starting bidding)
        let status: AuctionState['status'];
        if (startStatus) {
          status = startStatus;
        } else if (type === 'mega') {
          status = 'retention_phase';
        } else {
          status = 'release_phase';
        }

        const auctionState: AuctionState = {
          status,
          settings,
          auctionType: type,
          currentPlayer: null,
          auctionPool,
          soldPlayers: [],
          unsoldPlayers: [],
          teamStates,
          aiStrategies,
          bidTimer: 15,
          bidTimerDefault: 15,
          currentSet: 1,
          playersInCurrentSet: 0,
          totalPlayersAuctioned: 0,
          playerMode: 'active',
          rtmPhase: false,
          rtmTeamId: null,
        };

        set({ auctionState, phase: 'auction' });
      },

      setRetention: (playerId: string, slot: 1 | 2 | 3 | 4) => {
        const { auctionState, playerTeamId } = get();
        if (!auctionState || auctionState.status !== 'retention_phase') return;

        const teamState = auctionState.teamStates[playerTeamId];
        if (!teamState) return;

        // Update the retention slot
        const updatedRetentions = teamState.retentions.map((r) =>
          r.slotNumber === slot ? { ...r, playerId } : r
        );

        const updatedTeamState = {
          ...teamState,
          retentions: updatedRetentions,
        };

        set({
          auctionState: {
            ...auctionState,
            teamStates: {
              ...auctionState.teamStates,
              [playerTeamId]: updatedTeamState,
            },
          },
        });
      },

      removeRetention: (slot: 1 | 2 | 3 | 4) => {
        const { auctionState, playerTeamId } = get();
        if (!auctionState || auctionState.status !== 'retention_phase') return;

        const teamState = auctionState.teamStates[playerTeamId];
        if (!teamState) return;

        const updatedRetentions = teamState.retentions.map((r) =>
          r.slotNumber === slot ? { ...r, playerId: null } : r
        );

        set({
          auctionState: {
            ...auctionState,
            teamStates: {
              ...auctionState.teamStates,
              [playerTeamId]: {
                ...teamState,
                retentions: updatedRetentions,
              },
            },
          },
        });
      },

      confirmRetentions: () => {
        const { auctionState, playerTeamId, players, teams } = get();
        if (!auctionState || auctionState.status !== 'retention_phase') return;

        // Collect all retained player IDs across all teams
        const retainedPlayerIds: string[] = [];
        const updatedTeamStates = { ...auctionState.teamStates };

        Object.entries(updatedTeamStates).forEach(([teamId, teamState]) => {
          const retainedIds = teamState.retentions
            .filter((r) => r.playerId !== null)
            .map((r) => r.playerId as string);

          retainedPlayerIds.push(...retainedIds);

          // Calculate retention cost
          const retentionCount = retainedIds.length;
          const retentionCost = getTotalRetentionCost(retentionCount);

          // Update team state with retained players
          const retainedPlayers = players.filter((p) => retainedIds.includes(p.id));
          updatedTeamStates[teamId] = {
            ...teamState,
            remainingPurse: AUCTION_CONFIG.TOTAL_PURSE - retentionCost,
            squadSize: retainedIds.length,
            overseasCount: retainedPlayers.filter((p) => p.contract.isOverseas).length,
            batsmen: retainedPlayers.filter((p) => p.role === 'batsman').length,
            bowlers: retainedPlayers.filter((p) => p.role === 'bowler').length,
            allrounders: retainedPlayers.filter((p) => p.role === 'allrounder').length,
            keepers: retainedPlayers.filter((p) => p.role === 'keeper').length,
          };
        });

        // Regenerate auction pool excluding retained players
        const newPool = generateAuctionPool(auctionState.auctionType, players, teams, retainedPlayerIds);

        set({
          auctionState: {
            ...auctionState,
            status: 'bidding',
            auctionPool: newPool,
            teamStates: updatedTeamStates,
          },
        });
      },

      startBidding: () => {
        const { auctionState } = get();
        if (!auctionState) return;

        // Move to first player
        get().nextPlayer();
      },

      placeBid: () => {
        const { auctionState, playerTeamId } = get();
        if (!auctionState || !auctionState.currentPlayer) return;

        const teamState = auctionState.teamStates[playerTeamId];
        if (!teamState) return;

        const nextBid = getNextBidAmount(auctionState.currentPlayer.currentBid);

        // Check if can afford
        if (!canTeamAffordBid(teamState, nextBid, auctionState.settings)) return;

        // Place the bid
        const updatedCurrentPlayer: AuctionPlayer = {
          ...auctionState.currentPlayer,
          currentBid: nextBid,
          currentBidder: playerTeamId,
          bidHistory: [
            ...auctionState.currentPlayer.bidHistory,
            {
              teamId: playerTeamId,
              amount: nextBid,
              timestamp: Date.now(),
              isRTM: false,
            },
          ],
        };

        // Reset all teams' passed status
        const updatedTeamStates = { ...auctionState.teamStates };
        Object.keys(updatedTeamStates).forEach((tid) => {
          if (tid !== playerTeamId) {
            updatedTeamStates[tid] = {
              ...updatedTeamStates[tid],
              hasPassedCurrentPlayer: false,
            };
          }
        });

        set({
          auctionState: {
            ...auctionState,
            currentPlayer: updatedCurrentPlayer,
            teamStates: updatedTeamStates,
            bidTimer: auctionState.bidTimerDefault,
          },
        });
      },

      passBid: () => {
        const { auctionState, playerTeamId } = get();
        if (!auctionState || !auctionState.currentPlayer) return;

        const teamState = auctionState.teamStates[playerTeamId];
        if (!teamState) return;

        // Mark player's team as passed
        set({
          auctionState: {
            ...auctionState,
            teamStates: {
              ...auctionState.teamStates,
              [playerTeamId]: {
                ...teamState,
                hasPassedCurrentPlayer: true,
              },
            },
          },
        });
      },

      processAIBidRound: (): boolean => {
        const { auctionState, players, playerTeamId } = get();
        if (!auctionState || !auctionState.currentPlayer) return false;

        // Get teams willing to bid (excluding player's team if they're active)
        const excludeTeam = auctionState.playerMode === 'active' ? playerTeamId : undefined;
        const willingTeams = getTeamsWillingToBid(auctionState, players, excludeTeam);

        if (willingTeams.length === 0) {
          return false; // No more bidders
        }

        // Select next bidder
        const nextBidder = selectNextBidder(willingTeams);
        if (!nextBidder) return false;

        const nextBid = getNextBidAmount(auctionState.currentPlayer.currentBid);

        // Place the bid
        const updatedCurrentPlayer: AuctionPlayer = {
          ...auctionState.currentPlayer,
          currentBid: nextBid,
          currentBidder: nextBidder,
          bidHistory: [
            ...auctionState.currentPlayer.bidHistory,
            {
              teamId: nextBidder,
              amount: nextBid,
              timestamp: Date.now(),
              isRTM: false,
            },
          ],
        };

        // Reset passed status for all teams except the bidder
        const updatedTeamStates = { ...auctionState.teamStates };
        Object.keys(updatedTeamStates).forEach((tid) => {
          if (tid !== nextBidder) {
            updatedTeamStates[tid] = {
              ...updatedTeamStates[tid],
              hasPassedCurrentPlayer: false,
            };
          }
        });

        set({
          auctionState: {
            ...auctionState,
            currentPlayer: updatedCurrentPlayer,
            teamStates: updatedTeamStates,
            bidTimer: auctionState.bidTimerDefault,
          },
        });

        return true;
      },

      nextPlayer: () => {
        const { auctionState } = get();
        if (!auctionState) return;

        // Find next available player
        const nextPlayer = auctionState.auctionPool.find((p) => p.status === 'available');

        if (!nextPlayer) {
          // No more players - complete auction
          get().completeAuction();
          return;
        }

        // Mark as current
        const updatedPool = auctionState.auctionPool.map((p) =>
          p.playerId === nextPlayer.playerId ? { ...p, status: 'current' as const } : p
        );

        // Reset all teams' passed status
        const updatedTeamStates = { ...auctionState.teamStates };
        Object.keys(updatedTeamStates).forEach((tid) => {
          updatedTeamStates[tid] = {
            ...updatedTeamStates[tid],
            hasPassedCurrentPlayer: false,
          };
        });

        set({
          auctionState: {
            ...auctionState,
            currentPlayer: { ...nextPlayer, status: 'current' },
            auctionPool: updatedPool,
            teamStates: updatedTeamStates,
            bidTimer: auctionState.bidTimerDefault,
            totalPlayersAuctioned: auctionState.totalPlayersAuctioned + 1,
          },
        });
      },

      markPlayerSold: () => {
        const { auctionState, players } = get();
        if (!auctionState || !auctionState.currentPlayer) return;
        if (!auctionState.currentPlayer.currentBidder) return;

        const buyingTeamId = auctionState.currentPlayer.currentBidder;
        const soldPlayer = { ...auctionState.currentPlayer, status: 'sold' as const };
        const player = players.find((p) => p.id === soldPlayer.playerId);

        // Update buying team's state
        const buyingTeamState = auctionState.teamStates[buyingTeamId];
        const updatedBuyingTeamState = {
          ...buyingTeamState,
          remainingPurse: buyingTeamState.remainingPurse - soldPlayer.currentBid,
          squadSize: buyingTeamState.squadSize + 1,
          overseasCount: buyingTeamState.overseasCount + (player?.contract.isOverseas ? 1 : 0),
          batsmen: buyingTeamState.batsmen + (player?.role === 'batsman' ? 1 : 0),
          bowlers: buyingTeamState.bowlers + (player?.role === 'bowler' ? 1 : 0),
          allrounders: buyingTeamState.allrounders + (player?.role === 'allrounder' ? 1 : 0),
          keepers: buyingTeamState.keepers + (player?.role === 'keeper' ? 1 : 0),
        };

        // Update pool and sold list
        const updatedPool = auctionState.auctionPool.map((p) =>
          p.playerId === soldPlayer.playerId ? soldPlayer : p
        );

        set({
          auctionState: {
            ...auctionState,
            currentPlayer: null,
            auctionPool: updatedPool,
            soldPlayers: [...auctionState.soldPlayers, soldPlayer],
            teamStates: {
              ...auctionState.teamStates,
              [buyingTeamId]: updatedBuyingTeamState,
            },
          },
        });
      },

      markPlayerUnsold: () => {
        const { auctionState } = get();
        if (!auctionState || !auctionState.currentPlayer) return;

        const unsoldPlayer = { ...auctionState.currentPlayer, status: 'unsold' as const };

        const updatedPool = auctionState.auctionPool.map((p) =>
          p.playerId === unsoldPlayer.playerId ? unsoldPlayer : p
        );

        set({
          auctionState: {
            ...auctionState,
            currentPlayer: null,
            auctionPool: updatedPool,
            unsoldPlayers: [...auctionState.unsoldPlayers, unsoldPlayer],
          },
        });
      },

      setAuctionMode: (mode: AuctionPlayerMode) => {
        const { auctionState } = get();
        if (!auctionState) return;

        set({
          auctionState: {
            ...auctionState,
            playerMode: mode,
          },
        });
      },

      simRestOfAuction: () => {
        const { auctionState, players, playerTeamId } = get();
        if (!auctionState) return;

        let currentState = { ...auctionState };

        // Process all remaining players
        while (true) {
          // Find next available player
          const nextPlayer = currentState.auctionPool.find((p) => p.status === 'available');
          if (!nextPlayer) break;

          // Set as current
          const playerAuction: AuctionPlayer = { ...nextPlayer, status: 'current' };
          currentState = {
            ...currentState,
            currentPlayer: playerAuction,
          };

          // Simulate bidding
          const result = simulatePlayerAuction(currentState, players, playerTeamId);

          // Mark as sold or unsold
          const finalPlayer: AuctionPlayer = {
            ...playerAuction,
            currentBid: result.finalBid,
            currentBidder: result.soldTo,
            status: result.soldTo ? 'sold' : 'unsold',
          };

          // Update pool
          currentState.auctionPool = currentState.auctionPool.map((p) =>
            p.playerId === finalPlayer.playerId ? finalPlayer : p
          );

          if (result.soldTo) {
            currentState.soldPlayers = [...currentState.soldPlayers, finalPlayer];

            // Update team state
            const player = players.find((p) => p.id === finalPlayer.playerId);
            const teamState = currentState.teamStates[result.soldTo];
            currentState.teamStates = {
              ...currentState.teamStates,
              [result.soldTo]: {
                ...teamState,
                remainingPurse: teamState.remainingPurse - finalPlayer.currentBid,
                squadSize: teamState.squadSize + 1,
                overseasCount: teamState.overseasCount + (player?.contract.isOverseas ? 1 : 0),
                batsmen: teamState.batsmen + (player?.role === 'batsman' ? 1 : 0),
                bowlers: teamState.bowlers + (player?.role === 'bowler' ? 1 : 0),
                allrounders: teamState.allrounders + (player?.role === 'allrounder' ? 1 : 0),
                keepers: teamState.keepers + (player?.role === 'keeper' ? 1 : 0),
              },
            };
          } else {
            currentState.unsoldPlayers = [...currentState.unsoldPlayers, finalPlayer];
          }

          currentState.totalPlayersAuctioned++;
        }

        // Complete auction
        currentState.status = 'completed';
        currentState.currentPlayer = null;

        set({ auctionState: currentState });
      },

      completeAuction: () => {
        const { auctionState, teams, players, playerTeamId } = get();
        if (!auctionState) return;

        // Update team squads based on auction results
        let updatedTeams = teams.map((team) => {
          const teamState = auctionState.teamStates[team.id];

          // Get bought player IDs
          const boughtIds = auctionState.soldPlayers
            .filter((p) => p.currentBidder === team.id)
            .map((p) => p.playerId);

          let newSquad: string[];
          if (auctionState.auctionType === 'mega') {
            // Mega auction: squad = retained players + bought players
            const retainedIds = teamState.retentions
              .filter((r) => r.playerId !== null)
              .map((r) => r.playerId as string);
            newSquad = [...retainedIds, ...boughtIds];
          } else {
            // Mini auction: squad = existing players + bought players
            // (existing squad already had releases removed in confirmReleases)
            newSquad = [...team.squad, ...boughtIds];
          }

          return {
            ...team,
            squad: newSquad,
            budget: teamState.remainingPurse / 100, // Convert lakhs to crores
          };
        });

        // Update players with new contract details for sold players
        let updatedPlayers = players.map((player) => {
          const soldEntry = auctionState.soldPlayers.find((p) => p.playerId === player.id);
          if (soldEntry) {
            return {
              ...player,
              contract: {
                ...player.contract,
                salary: soldEntry.currentBid,
                yearsRemaining: 3, // Standard 3-year contract
              },
            };
          }
          return player;
        });

        // Track unsold players for future auctions
        const unsoldPlayerIds = auctionState.unsoldPlayers.map((p) => p.playerId);

        // Check which teams need squad fill (< 18 players)
        const teamsNeedingFill = updatedTeams.filter(
          (t) => t.squad.length < auctionState.settings.minSquadSize
        );

        // Auto-fill AI teams that need players
        const aiTeamsNeedingFill = teamsNeedingFill.filter((t) => t.id !== playerTeamId);
        const updatedTeamStates = { ...auctionState.teamStates };

        for (const aiTeam of aiTeamsNeedingFill) {
          const pool = getSquadFillPool(updatedPlayers, updatedTeams, unsoldPlayerIds);
          const teamState = updatedTeamStates[aiTeam.id];
          const pickedIds = autoFillTeamSquad(teamState, pool, auctionState.settings);

          if (pickedIds.length > 0) {
            // Add picked players to team squad
            const teamIndex = updatedTeams.findIndex((t) => t.id === aiTeam.id);
            updatedTeams[teamIndex] = {
              ...updatedTeams[teamIndex],
              squad: [...updatedTeams[teamIndex].squad, ...pickedIds],
            };

            // Update players with contracts
            updatedPlayers = updatedPlayers.map((p) => {
              if (pickedIds.includes(p.id)) {
                const basePrice = calculateBasePrice(p);
                return {
                  ...p,
                  contract: {
                    ...p.contract,
                    salary: basePrice,
                    yearsRemaining: 3,
                  },
                };
              }
              return p;
            });

            // Update team state
            const totalCost = pickedIds.reduce((sum, id) => {
              const player = updatedPlayers.find((p) => p.id === id);
              return sum + (player ? calculateBasePrice(player) : 0);
            }, 0);

            updatedTeamStates[aiTeam.id] = {
              ...teamState,
              squadSize: teamState.squadSize + pickedIds.length,
              remainingPurse: teamState.remainingPurse - totalCost,
              overseasCount:
                teamState.overseasCount +
                pickedIds.filter((id) => updatedPlayers.find((p) => p.id === id)?.contract.isOverseas).length,
            };
          }
        }

        // Check if player's team needs squad fill
        const playerTeam = updatedTeams.find((t) => t.id === playerTeamId);
        const playerTeamNeedsFill =
          playerTeam && playerTeam.squad.length < auctionState.settings.minSquadSize;

        if (playerTeamNeedsFill) {
          // Enter squad fill phase for player
          set({
            teams: updatedTeams,
            players: updatedPlayers,
            auctionState: {
              ...auctionState,
              status: 'squad_fill',
              teamStates: updatedTeamStates,
            },
            unsoldPlayers: unsoldPlayerIds,
          });
        } else {
          // All teams have minimum squad, complete auction
          set({
            teams: updatedTeams,
            players: updatedPlayers,
            auctionState: {
              ...auctionState,
              status: 'completed',
              teamStates: updatedTeamStates,
            },
            unsoldPlayers: unsoldPlayerIds,
          });

          // Reset for new season (generates new fixtures, etc.)
          get().resetForNewSeason();
        }
      },

      pickSquadFillPlayer: (playerId: string) => {
        const { auctionState, teams, players, playerTeamId, unsoldPlayers } = get();
        if (!auctionState || auctionState.status !== 'squad_fill') return;

        const player = players.find((p) => p.id === playerId);
        if (!player) return;

        const teamState = auctionState.teamStates[playerTeamId];
        const basePrice = calculateBasePrice(player);

        // Validate pick (may return isFreePickup for emergency fills)
        const { canPick, isFreePickup } = canPickSquadFillPlayer(teamState, player, basePrice, auctionState.settings);
        if (!canPick) return;

        const actualCost = isFreePickup ? 0 : basePrice;

        // Add player to team squad
        const updatedTeams = teams.map((t) =>
          t.id === playerTeamId ? { ...t, squad: [...t.squad, playerId] } : t
        );

        // Update player contract (free pickup = 0 salary)
        const updatedPlayers = players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                contract: {
                  ...p.contract,
                  salary: actualCost,
                  yearsRemaining: 3,
                },
              }
            : p
        );

        // Update team state
        const updatedTeamState = {
          ...teamState,
          squadSize: teamState.squadSize + 1,
          remainingPurse: teamState.remainingPurse - actualCost,
          overseasCount: teamState.overseasCount + (player.contract.isOverseas ? 1 : 0),
          batsmen: teamState.batsmen + (player.role === 'batsman' ? 1 : 0),
          bowlers: teamState.bowlers + (player.role === 'bowler' ? 1 : 0),
          allrounders: teamState.allrounders + (player.role === 'allrounder' ? 1 : 0),
          keepers: teamState.keepers + (player.role === 'keeper' ? 1 : 0),
        };

        set({
          teams: updatedTeams,
          players: updatedPlayers,
          auctionState: {
            ...auctionState,
            teamStates: {
              ...auctionState.teamStates,
              [playerTeamId]: updatedTeamState,
            },
          },
        });
      },

      autoFillPlayerSquad: () => {
        const { auctionState, teams, players, playerTeamId, unsoldPlayers } = get();
        if (!auctionState || auctionState.status !== 'squad_fill') return;

        const teamState = auctionState.teamStates[playerTeamId];
        const pool = getSquadFillPool(players, teams, unsoldPlayers);
        const pickedIds = autoFillTeamSquad(teamState, pool, auctionState.settings);

        if (pickedIds.length === 0) return;

        // Add all picked players
        const updatedTeams = teams.map((t) =>
          t.id === playerTeamId ? { ...t, squad: [...t.squad, ...pickedIds] } : t
        );

        // Calculate costs - track purse to determine free pickups
        let trackPurse = teamState.remainingPurse;
        const playerCosts: Record<string, number> = {};
        for (const id of pickedIds) {
          const player = players.find((p) => p.id === id);
          if (player) {
            const basePrice = calculateBasePrice(player);
            // Emergency free pickup if purse too low
            const cost = trackPurse < AUCTION_CONFIG.MIN_RESERVE_PER_SLOT ? 0 : basePrice;
            playerCosts[id] = cost;
            trackPurse -= cost;
          }
        }

        // Update player contracts with correct costs
        const updatedPlayers = players.map((p) => {
          if (pickedIds.includes(p.id)) {
            return {
              ...p,
              contract: {
                ...p.contract,
                salary: playerCosts[p.id] ?? 0,
                yearsRemaining: 3,
              },
            };
          }
          return p;
        });

        // Calculate updated team state
        let newSquadSize = teamState.squadSize;
        let newPurse = teamState.remainingPurse;
        let newOverseas = teamState.overseasCount;
        let newBatsmen = teamState.batsmen;
        let newBowlers = teamState.bowlers;
        let newAllrounders = teamState.allrounders;
        let newKeepers = teamState.keepers;

        for (const id of pickedIds) {
          const player = players.find((p) => p.id === id);
          if (player) {
            newSquadSize++;
            newPurse -= playerCosts[id] ?? 0;
            if (player.contract.isOverseas) newOverseas++;
            if (player.role === 'batsman') newBatsmen++;
            if (player.role === 'bowler') newBowlers++;
            if (player.role === 'allrounder') newAllrounders++;
            if (player.role === 'keeper') newKeepers++;
          }
        }

        set({
          teams: updatedTeams,
          players: updatedPlayers,
          auctionState: {
            ...auctionState,
            teamStates: {
              ...auctionState.teamStates,
              [playerTeamId]: {
                ...teamState,
                squadSize: newSquadSize,
                remainingPurse: newPurse,
                overseasCount: newOverseas,
                batsmen: newBatsmen,
                bowlers: newBowlers,
                allrounders: newAllrounders,
                keepers: newKeepers,
              },
            },
          },
        });
      },

      completeSquadFill: () => {
        const { auctionState, resetForNewSeason } = get();
        if (!auctionState || auctionState.status !== 'squad_fill') return;

        set({
          auctionState: {
            ...auctionState,
            status: 'completed',
          },
        });

        resetForNewSeason();
      },

      canPlayerBid: (): boolean => {
        const { auctionState, playerTeamId, players } = get();
        if (!auctionState || !auctionState.currentPlayer) return false;

        const teamState = auctionState.teamStates[playerTeamId];
        if (!teamState) return false;

        // Already passed
        if (teamState.hasPassedCurrentPlayer) return false;

        // Already highest bidder
        if (auctionState.currentPlayer.currentBidder === playerTeamId) return false;

        // Squad full
        if (isSquadFull(teamState, auctionState.settings)) return false;

        // Check overseas limit
        const player = players.find((p) => p.id === auctionState.currentPlayer?.playerId);
        if (player?.contract.isOverseas && !canTeamAddOverseas(teamState, auctionState.settings)) {
          return false;
        }

        // Check budget
        const nextBid = getNextBidAmount(auctionState.currentPlayer.currentBid);
        if (!canTeamAffordBid(teamState, nextBid, auctionState.settings)) return false;

        return true;
      },

      getNextBidAmountForPlayer: (): number => {
        const { auctionState } = get();
        if (!auctionState || !auctionState.currentPlayer) return 0;
        return getNextBidAmount(auctionState.currentPlayer.currentBid);
      },

      shouldTriggerAuction: (): { trigger: boolean; type: AuctionType } => {
        const { season, phase, startMode } = get();

        // First season with auction mode (mini or mega)
        if (season === 1 && phase === 'auction') {
          if (startMode === 'mini-auction') {
            return { trigger: true, type: 'mini' };
          }
          if (startMode === 'mega-auction') {
            return { trigger: true, type: 'mega' };
          }
        }

        // Between seasons
        if (phase === 'off-season') {
          // Mega auction every 3 years (season 1, 4, 7...)
          const isMegaYear = (season - 1) % 3 === 0 && season > 1;
          return { trigger: true, type: isMegaYear ? 'mega' : 'mini' };
        }

        return { trigger: false, type: 'mini' };
      },

      // ----------------------------------------
      // Data Loading
      // ----------------------------------------
      loadInitialData: (players: Player[], teams: Team[], fixtures: Match[]) => {
        set({
          players,
          teams,
          fixtures,
        });
      },

      // ----------------------------------------
      // Player Interactions
      // ----------------------------------------
      canTalkToPlayer: (playerId: string) => {
        const { matchDay } = get();
        const player = get().getPlayer(playerId);
        if (!player) return false;

        // Cooldown: can only talk every 2 match days
        const lastTalked = player.lastTalkedMatchDay ?? 0;
        return matchDay - lastTalked >= 2;
      },

      getInteractionOptions: (playerId: string): InteractionOption[] => {
        const player = get().getPlayer(playerId);
        if (!player) return [];

        // Available options based on player state
        const options: InteractionOption[] = [];

        // Praise options - always available
        options.push({
          id: 'praise-performance',
          category: 'praise',
          label: '"Great job out there"',
          description: 'Acknowledge their recent efforts',
          baseEffects: { morale: 8, form: 1 },
        });

        options.push({
          id: 'praise-key-player',
          category: 'praise',
          label: '"You\'re key to our plans"',
          description: 'Express how important they are to the team',
          baseEffects: { morale: 12, form: 0 },
        });

        // Correct options
        options.push({
          id: 'correct-improve',
          category: 'correct',
          label: '"I need more from you"',
          description: 'Push them to do better (risky with some personalities)',
          baseEffects: { morale: -5, form: 3 },
        });

        options.push({
          id: 'correct-warning',
          category: 'correct',
          label: '"This is your last chance"',
          description: 'Issue a warning (high risk, high reward)',
          baseEffects: { morale: -10, form: 5 },
        });

        // Motivate options
        options.push({
          id: 'motivate-big-match',
          category: 'motivate',
          label: '"Big match coming up, I need you"',
          description: 'Fire them up for an important game',
          baseEffects: { morale: 5, form: 2 },
        });

        options.push({
          id: 'motivate-patience',
          category: 'motivate',
          label: '"Your time will come"',
          description: 'Reassure them about future opportunities',
          baseEffects: { morale: 6, form: 0 },
        });

        return options;
      },

      talkToPlayer: (playerId: string, option: InteractionOption): InteractionResult => {
        const { matchDay, pressHeat } = get();
        const player = get().getPlayer(playerId);

        if (!player) {
          return {
            success: false,
            message: 'Player not found',
            playerResponse: '',
            effects: { morale: 0, form: 0 },
          };
        }

        // Calculate effects based on personality
        let moraleChange = option.baseEffects.morale;
        let formChange = option.baseEffects.form;
        let pressHeatChange = 0;
        let playerResponse = '';
        let success = true;

        const { temperament, professionalism, ambition } = player.personality;

        // Personality modifiers
        if (option.category === 'praise') {
          if (professionalism > 70) {
            // Professional players stay grounded, smaller morale boost
            moraleChange = Math.round(moraleChange * 0.7);
            playerResponse = `${player.shortName} nods professionally. "Thanks, but there's still work to do."`;
          } else if (ambition > 70) {
            // Ambitious players love praise
            moraleChange = Math.round(moraleChange * 1.3);
            playerResponse = `${player.shortName}'s eyes light up. "I knew you noticed! I'm ready to do even more."`;
          } else {
            playerResponse = `${player.shortName} smiles. "Appreciate the support, boss."`;
          }
        } else if (option.category === 'correct') {
          if (temperament === 'fiery') {
            // Fiery players may clash
            const clashChance = Math.random();
            if (clashChance < 0.4) {
              // Clash!
              moraleChange = -15;
              formChange = -2;
              pressHeatChange = 10;
              success = false;
              playerResponse = `${player.shortName} doesn't take it well. "Maybe look at your own decisions first!" The exchange might leak to the press.`;
            } else {
              playerResponse = `${player.shortName} takes it on the chin, barely. "Fine. I'll show you."`;
            }
          } else if (temperament === 'calm') {
            // Calm players handle criticism well
            formChange = Math.round(formChange * 1.5);
            moraleChange = Math.round(moraleChange * 0.5);
            playerResponse = `${player.shortName} listens carefully. "You're right. I'll work on it."`;
          } else if (temperament === 'moody') {
            // Moody - unpredictable
            const moodRoll = Math.random();
            if (moodRoll < 0.3) {
              moraleChange = -12;
              playerResponse = `${player.shortName} walks away silently. Not a good sign.`;
            } else {
              playerResponse = `${player.shortName} seems to accept the feedback. "Okay."`;
            }
          }
        } else if (option.category === 'motivate') {
          if (ambition > 70 && option.id === 'motivate-patience') {
            // Ambitious players don't like waiting
            moraleChange = Math.round(moraleChange * 0.3);
            playerResponse = `${player.shortName} frowns slightly. "I've been patient long enough..."`;
          } else if (temperament === 'fiery') {
            // Fiery players respond well to motivation
            moraleChange = Math.round(moraleChange * 1.3);
            formChange = Math.round(formChange * 1.3);
            playerResponse = `${player.shortName} is fired up! "I'm ready. Let's do this!"`;
          } else {
            playerResponse = `${player.shortName} nods confidently. "Count on me."`;
          }
        }

        // Apply effects
        get().updatePlayerState(playerId, {
          morale: player.morale + moraleChange,
          form: player.form + formChange,
        });

        // Update last talked
        set((state) => ({
          players: state.players.map((p) =>
            p.id === playerId ? { ...p, lastTalkedMatchDay: matchDay } : p
          ),
        }));

        // Apply press heat if clash
        if (pressHeatChange > 0) {
          set((state) => ({
            pressHeat: Math.min(100, state.pressHeat + pressHeatChange),
          }));
        }

        return {
          success,
          message: success ? 'Conversation completed' : 'The conversation didn\'t go well',
          playerResponse,
          effects: {
            morale: moraleChange,
            form: formChange,
            pressHeat: pressHeatChange > 0 ? pressHeatChange : undefined,
          },
        };
      },

      // ----------------------------------------
      // Helpers
      // ----------------------------------------
      getPlayer: (playerId: string) => {
        return get().players.find((p) => p.id === playerId);
      },

      getTeam: (teamId: string) => {
        return get().teams.find((t) => t.id === teamId);
      },

      getMatch: (matchId: string) => {
        return get().fixtures.find((m) => m.id === matchId);
      },

      getPlayerTeam: () => {
        return get().teams.find((t) => t.id === get().playerTeamId);
      },

      getNextMatch: () => {
        const { fixtures, playerTeamId, matchDay } = get();
        return fixtures.find(
          (m) =>
            m.status === 'upcoming' &&
            (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
        );
      },

      getTeamPlayers: (teamId: string) => {
        const team = get().getTeam(teamId);
        if (!team) return [];
        return get().players.filter((p) => team.squad.includes(p.id));
      },

      // ----------------------------------------
      // Save/Load
      // ----------------------------------------
      getSaveSlots: () => {
        return getSaveSlots();
      },

      saveToSlot: (slotId: 1 | 2 | 3, name?: string) => {
        const state = get();
        const team = state.teams.find((t) => t.id === state.playerTeamId);
        const teamName = team?.name || 'Unknown Team';

        // Extract game state (exclude functions and UI state)
        const gameState: GameState = {
          initialized: state.initialized,
          testerId: state.testerId,
          startMode: state.startMode,
          currentDate: state.currentDate,
          season: state.season,
          phase: state.phase,
          matchDay: state.matchDay,
          manager: state.manager,
          playerTeamId: state.playerTeamId,
          teams: state.teams,
          players: state.players,
          fixtures: state.fixtures,
          pointsTable: state.pointsTable,
          activeEvents: state.activeEvents,
          pressHeat: state.pressHeat,
          lastMeetingMatchDay: state.lastMeetingMatchDay,
          releasedPlayers: state.releasedPlayers,
          unsoldPlayers: state.unsoldPlayers,
        };

        const saveName = name || `${teamName} - S${state.season} M${state.matchDay}`;
        return saveGameToSlot(slotId, saveName, gameState, state.auctionState, state.liveMatchState, teamName);
      },

      loadFromSlot: (slotId: 1 | 2 | 3) => {
        const saveData = loadGameFromSlot(slotId);
        if (!saveData) return false;

        // Determine the correct screen to show after loading
        let currentScreen: Screen = 'home';
        if (saveData.liveMatchState) {
          currentScreen = 'match-live';
        } else if (saveData.gameState.phase === 'auction') {
          currentScreen = 'auction';
        }

        set({
          ...saveData.gameState,
          auctionState: saveData.auctionState,
          liveMatchState: saveData.liveMatchState || null,
          // Reset UI state
          currentScreen,
          selectedPlayerId: null,
          selectedMatchId: saveData.liveMatchState?.matchId || null,
          selectedEventId: null,
        });

        return true;
      },

      deleteSlot: (slotId: 1 | 2 | 3) => {
        return deleteSaveSlot(slotId);
      },

      exportForBugReport: () => {
        const state = get();
        const exportData = {
          version: '0.8',
          testerId: state.testerId,
          timestamp: new Date().toISOString(),
          gameState: {
            initialized: state.initialized,
            testerId: state.testerId,
            startMode: state.startMode,
            currentDate: state.currentDate,
            season: state.season,
            phase: state.phase,
            matchDay: state.matchDay,
            manager: state.manager,
            playerTeamId: state.playerTeamId,
            teams: state.teams,
            players: state.players,
            fixtures: state.fixtures,
            pointsTable: state.pointsTable,
            activeEvents: state.activeEvents,
            pressHeat: state.pressHeat,
            lastMeetingMatchDay: state.lastMeetingMatchDay,
            releasedPlayers: state.releasedPlayers,
            unsoldPlayers: state.unsoldPlayers,
          },
          auctionState: state.auctionState,
          liveMatchState: state.liveMatchState,
          uiState: {
            currentScreen: state.currentScreen,
            selectedMatchId: state.selectedMatchId,
            selectedPlayerId: state.selectedPlayerId,
            selectedEventId: state.selectedEventId,
          },
        };
        return JSON.stringify(exportData);
      },

      // ----------------------------------------
      // Live Match State
      // ----------------------------------------
      saveLiveMatchState: (state: LiveMatchState) => {
        set({ liveMatchState: state });
      },

      clearLiveMatchState: () => {
        set({ liveMatchState: null });
      },
    }),
    {
      name: 'cricket-manager-save',
      partialize: (state) => ({
        // Only persist game state, not UI state
        initialized: state.initialized,
        testerId: state.testerId,
        startMode: state.startMode,
        currentDate: state.currentDate,
        season: state.season,
        phase: state.phase,
        matchDay: state.matchDay,
        manager: state.manager,
        playerTeamId: state.playerTeamId,
        teams: state.teams,
        players: state.players,
        fixtures: state.fixtures,
        pointsTable: state.pointsTable,
        activeEvents: state.activeEvents,
        pressHeat: state.pressHeat,
        lastMeetingMatchDay: state.lastMeetingMatchDay,
        releasedPlayers: state.releasedPlayers,
        unsoldPlayers: state.unsoldPlayers,
        auctionState: state.auctionState,
        liveMatchState: state.liveMatchState,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Generate testerId for existing games that don't have one
        if (state.initialized && !state.testerId) {
          useGameStore.setState({ testerId: generateTesterId() });
        }

        // State migration and validation for backwards compatibility
        try {
          // Ensure modalStack exists (added in modal update)
          if (!Array.isArray(state.modalStack)) {
            useGameStore.setState({ modalStack: [] });
          }

          // Validate auctionState structure if it exists
          if (state.auctionState) {
            // Ensure required properties exist
            if (typeof state.auctionState.status !== 'string') {
              console.warn('Invalid auctionState.status, resetting auction');
              useGameStore.setState({ auctionState: null });
            }
          }

          // Validate liveMatchState structure if it exists
          if (state.liveMatchState) {
            if (!state.liveMatchState.matchId || !state.liveMatchState.inningsState) {
              console.warn('Invalid liveMatchState, clearing');
              useGameStore.setState({ liveMatchState: null });
            }
          }

          // Ensure pointsTable exists and is valid
          if (!Array.isArray(state.pointsTable)) {
            console.warn('Invalid pointsTable, regenerating');
            // Will be regenerated on next game action
          }

          // Ensure fixtures array exists
          if (!Array.isArray(state.fixtures)) {
            console.warn('Invalid fixtures, this may cause issues');
          }

        } catch (error) {
          console.error('State migration error:', error);
          // Don't crash, let ErrorBoundary handle if needed
        }
      },
    }
  )
);
