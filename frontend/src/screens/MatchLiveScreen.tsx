import { useState, useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { simulateOver, simulateSingleBall, generateDefaultTactics } from '../engine/matchEngine';
import { InningsState, OverSummary, Player, MatchTactics, BallEvent, SerializedInningsState, BowlingLength, FieldSetting } from '../types';

// Bowling length options for live override
const BOWLING_LENGTH_OPTIONS: { value: BowlingLength; label: string }[] = [
  { value: 'good-length', label: 'Good' },
  { value: 'short', label: 'Short' },
  { value: 'yorkers', label: 'Yorker' },
  { value: 'full-pitched', label: 'Full' },
];

// Field setting options for live override
const FIELD_SETTING_OPTIONS: { value: FieldSetting; label: string }[] = [
  { value: 'attacking', label: 'Attack' },
  { value: 'balanced', label: 'Balance' },
  { value: 'defensive', label: 'Defend' },
  { value: 'death-field', label: 'Death' },
];

// Helper to serialize InningsState (convert Maps to objects)
const serializeInningsState = (state: InningsState): SerializedInningsState => ({
  ...state,
  batterStats: Object.fromEntries(state.batterStats),
  bowlerStats: Object.fromEntries(state.bowlerStats),
});

// Helper to deserialize InningsState (convert objects back to Maps)
const deserializeInningsState = (state: SerializedInningsState): InningsState => ({
  ...state,
  batterStats: new Map(Object.entries(state.batterStats)),
  bowlerStats: new Map(Object.entries(state.bowlerStats)),
});

export const MatchLiveScreen = () => {
  const {
    selectedMatchId,
    playerTeamId,
    teams,
    players,
    fixtures,
    updateMatch,
    updatePointsTable,
    pointsTable,
    navigateTo,
    updatePlayerState,
    simulateBackgroundMatches,
    advanceToNextMatch,
    progressPlayoffs,
    checkAndStartPlayoffs,
    generatePostMatchEvent,
    activeEvents,
    liveMatchState,
    saveLiveMatchState,
    clearLiveMatchState,
  } = useGameStore();

  const [isSimulating, setIsSimulating] = useState(false);
  const [currentInnings, setCurrentInnings] = useState<1 | 2>(1);
  const [inningsState, setInningsState] = useState<InningsState | null>(null);
  const [lastOver, setLastOver] = useState<OverSummary | null>(null);
  const [matchEnded, setMatchEnded] = useState(false);
  const [firstInningsTotal, setFirstInningsTotal] = useState<number>(0);
  const [result, setResult] = useState<{ winner: string; margin: string } | null>(null);

  // Ball-by-ball state
  const [recentBalls, setRecentBalls] = useState<BallEvent[]>([]);
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [simMode, setSimMode] = useState<'ball' | 'over' | 'wicket' | 'auto'>('over');

  // In-match tactical controls
  const [showTacticsPanel, setShowTacticsPanel] = useState(false);
  const [strikerApproach, setStrikerApproach] = useState<'aggressive' | 'balanced' | 'defensive'>('balanced');
  const [nonStrikerApproach, setNonStrikerApproach] = useState<'aggressive' | 'balanced' | 'defensive'>('balanced');
  const [selectedNextBowler, setSelectedNextBowler] = useState<string | null>(null);
  const [liveBowlingLength, setLiveBowlingLength] = useState<BowlingLength | null>(null);
  const [liveFieldSetting, setLiveFieldSetting] = useState<FieldSetting | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);

  const match = fixtures.find((m) => m.id === selectedMatchId);

  // Prevent accessing completed matches
  useEffect(() => {
    if (match && match.status === 'completed' && !matchEnded) {
      navigateTo('home');
    }
  }, [match?.status]);

  const homeTeam = teams.find((t) => t.id === match?.homeTeam);
  const awayTeam = teams.find((t) => t.id === match?.awayTeam);

  const homePlayers = players.filter((p) => homeTeam?.squad.includes(p.id));
  const awayPlayers = players.filter((p) => awayTeam?.squad.includes(p.id));

  const isPlayerHome = playerTeamId === match?.homeTeam;
  const playerTactics = isPlayerHome ? match?.homeTactics : match?.awayTactics;
  const opponentTactics = isPlayerHome ? match?.awayTactics : match?.homeTactics;

  // Generate AI tactics if not set
  const getAITactics = useCallback(
    (teamId: string): MatchTactics => {
      const team = teams.find((t) => t.id === teamId);
      const teamPlayersList = players.filter((p) => team?.squad.includes(p.id));
      return generateDefaultTactics(teamPlayersList, team?.captain || '');
    },
    [teams, players]
  );

  // Track if we've initialized (to avoid re-init on re-renders)
  const hasInitialized = useRef(false);

  // Initialize innings or restore from saved state
  useEffect(() => {
    if (!match || !playerTactics) return;
    if (hasInitialized.current) return;

    // Check if we have saved live match state to restore
    if (liveMatchState && liveMatchState.matchId === match.id) {
      // Restore from saved state
      const restoredInningsState = deserializeInningsState(liveMatchState.inningsState);
      setInningsState(restoredInningsState);
      setCurrentInnings(liveMatchState.currentInnings);
      setFirstInningsTotal(liveMatchState.firstInningsTotal);
      setRecentBalls(liveMatchState.recentBalls);
      hasInitialized.current = true;

      // Mark match as in progress
      updateMatch(match.id, { status: 'in_progress' });
      return;
    }

    // Generate opponent tactics if needed
    if (!opponentTactics) {
      const opponentId = isPlayerHome ? match.awayTeam : match.homeTeam;
      const aiTactics = getAITactics(opponentId);
      if (isPlayerHome) {
        updateMatch(match.id, { awayTactics: aiTactics });
      } else {
        updateMatch(match.id, { homeTactics: aiTactics });
      }
    }

    // Toss
    const tossWinner = Math.random() < 0.5 ? match.homeTeam : match.awayTeam;
    const tossDecision: 'bat' | 'bowl' = Math.random() < 0.6 ? 'bat' : 'bowl';

    const battingFirst =
      (tossWinner === match.homeTeam && tossDecision === 'bat') ||
      (tossWinner === match.awayTeam && tossDecision === 'bowl')
        ? match.homeTeam
        : match.awayTeam;

    const battingTactics =
      battingFirst === match.homeTeam
        ? match.homeTactics || getAITactics(match.homeTeam)
        : match.awayTactics || getAITactics(match.awayTeam);

    // Initialize first innings
    const initialState: InningsState = {
      battingTeam: battingFirst,
      bowlingTeam: battingFirst === match.homeTeam ? match.awayTeam : match.homeTeam,
      runs: 0,
      wickets: 0,
      overs: 0,
      balls: 0,
      currentBatters: [battingTactics.playingXI[0], battingTactics.playingXI[1]],
      currentBowler: '',
      overSummaries: [],
      fallOfWickets: [],
      batterStats: new Map(),
      bowlerStats: new Map(),
    };

    setInningsState(initialState);
    setCurrentInnings(1);

    // Mark match as in progress
    hasInitialized.current = true;
    updateMatch(match.id, {
      status: 'in_progress',
      tossWinner,
      tossDecision,
      currentInnings: 1,
    });
  }, [match?.id]);

  // Save live match state whenever it changes (for persistence across refreshes)
  useEffect(() => {
    if (!match || !inningsState || matchEnded) return;

    saveLiveMatchState({
      matchId: match.id,
      currentInnings,
      inningsState: serializeInningsState(inningsState),
      firstInningsTotal,
      recentBalls,
    });
  }, [inningsState, currentInnings, firstInningsTotal, recentBalls, match?.id, matchEnded]);

  // Simulate next over
  const simulateNextOver = useCallback(() => {
    if (!match || !inningsState || matchEnded) return;

    const battingTeamId = inningsState.battingTeam;
    const bowlingTeamId = inningsState.bowlingTeam;

    const battingTeamPlayers =
      battingTeamId === match.homeTeam ? homePlayers : awayPlayers;
    const bowlingTeamPlayers =
      bowlingTeamId === match.homeTeam ? homePlayers : awayPlayers;

    const battingTactics =
      battingTeamId === match.homeTeam
        ? match.homeTactics || getAITactics(match.homeTeam)
        : match.awayTactics || getAITactics(match.awayTeam);

    const bowlingTactics =
      bowlingTeamId === match.homeTeam
        ? match.homeTactics || getAITactics(match.homeTeam)
        : match.awayTactics || getAITactics(match.awayTeam);

    // Select bowler (with 4-over limit enforcement)
    const MAX_OVERS_PER_BOWLER = 4;
    const bowlers = bowlingTeamPlayers.filter(
      (p) =>
        (p.role === 'bowler' || p.role === 'allrounder') &&
        bowlingTactics.playingXI.includes(p.id)
    );

    // Get overs bowled for each bowler
    const getBowlerOvers = (bowlerId: string): number => {
      if (!(inningsState.bowlerStats instanceof Map)) return 0;
      return inningsState.bowlerStats.get(bowlerId)?.overs ?? 0;
    };

    const lastBowlerId = inningsState.overSummaries.at(-1)?.bowler;
    let bowler;

    // Use player-selected bowler if available (and valid)
    if (selectedNextBowler && bowlingTeamId === playerTeamId) {
      const selectedOvers = getBowlerOvers(selectedNextBowler);
      const isValid = selectedNextBowler !== lastBowlerId && selectedOvers < MAX_OVERS_PER_BOWLER;
      if (isValid) {
        bowler = bowlers.find((b) => b.id === selectedNextBowler);
      }
      setSelectedNextBowler(null); // Reset selection after use
    }

    // Fallback to automatic selection (respecting limits)
    if (!bowler) {
      const availableBowlers = bowlers.filter((b) => {
        const overs = getBowlerOvers(b.id);
        return b.id !== lastBowlerId && overs < MAX_OVERS_PER_BOWLER;
      });

      if (availableBowlers.length > 0) {
        bowler = availableBowlers[Math.floor(Math.random() * availableBowlers.length)];
      } else {
        // Edge case: only last bowler hasn't maxed out
        const stillAvailable = bowlers.filter(b => getBowlerOvers(b.id) < MAX_OVERS_PER_BOWLER);
        bowler = stillAvailable[0] || bowlers[0];
      }
    }

    if (!bowler) return;

    const target = currentInnings === 2 ? firstInningsTotal + 1 : null;

    // Get batting team in correct batting order (as per playingXI)
    const battingTeamInOrder = battingTactics.playingXI
      .map(id => battingTeamPlayers.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);

    const { overSummary, updatedInnings } = simulateOver(
      battingTeamInOrder,
      bowler,
      inningsState,
      battingTactics,
      match.pitch,
      target
    );

    setLastOver(overSummary);
    setInningsState(updatedInnings);

    // Check innings end conditions
    const inningsEnded =
      updatedInnings.overs >= 20 ||
      updatedInnings.wickets >= 10 ||
      (currentInnings === 2 && updatedInnings.runs >= (firstInningsTotal + 1));

    if (inningsEnded) {
      if (currentInnings === 1) {
        // Start second innings
        setFirstInningsTotal(updatedInnings.runs);
        setCurrentInnings(2);

        const newBattingTeam = bowlingTeamId;
        const newBowlingTeam = battingTeamId;
        const newBattingTactics =
          newBattingTeam === match.homeTeam
            ? match.homeTactics || getAITactics(match.homeTeam)
            : match.awayTactics || getAITactics(match.awayTeam);

        setInningsState({
          battingTeam: newBattingTeam,
          bowlingTeam: newBowlingTeam,
          runs: 0,
          wickets: 0,
          overs: 0,
          balls: 0,
          currentBatters: [newBattingTactics.playingXI[0], newBattingTactics.playingXI[1]],
          currentBowler: '',
          overSummaries: [],
          fallOfWickets: [],
          batterStats: new Map(),
          bowlerStats: new Map(),
        });

        updateMatch(match.id, {
          currentInnings: 2,
          innings1: updatedInnings,
        });
      } else {
        // Match ended
        setMatchEnded(true);
        setIsSimulating(false);
        clearLiveMatchState(); // Clear persisted state

        const team1 = teams.find((t) => t.id === match.innings1?.battingTeam);
        const team2 = teams.find((t) => t.id === updatedInnings.battingTeam);

        let winnerTeam: typeof team1 | typeof team2;
        let margin: string;

        if (updatedInnings.runs >= firstInningsTotal + 1) {
          winnerTeam = team2;
          margin = `${10 - updatedInnings.wickets} wickets`;
        } else if (updatedInnings.runs < firstInningsTotal) {
          winnerTeam = team1;
          margin = `${firstInningsTotal - updatedInnings.runs} runs`;
        } else {
          winnerTeam = undefined;
          margin = 'Tie';
        }

        setResult({
          winner: winnerTeam?.name || 'Tie',
          margin: winnerTeam ? margin : 'Match Tied',
        });

        // Only update points table for league matches (not playoffs)
        if (match.matchType === 'league') {
        // Update points table with NRR
        const newPointsTable = [...pointsTable];

        // Get first innings data from match
        const firstInningsData = match.innings1;
        const secondInningsData = updatedInnings;

        // Calculate NRR for both teams
        // Team batting first
        const team1Id = firstInningsData?.battingTeam || inningsState.bowlingTeam;
        const team1Runs = firstInningsTotal;
        const team1Overs = 20; // Assuming full innings for simplicity
        const team1RunsConceded = secondInningsData.runs;
        const team1OversBowled = Math.min(20, secondInningsData.overs + (secondInningsData.balls > 0 ? secondInningsData.balls / 6 : 0));

        // Team batting second
        const team2Id = secondInningsData.battingTeam;
        const team2Runs = secondInningsData.runs;
        const team2Overs = Math.min(20, secondInningsData.overs + (secondInningsData.balls > 0 ? secondInningsData.balls / 6 : 0));
        const team2RunsConceded = firstInningsTotal;
        const team2OversBowled = 20;

        // Calculate NRR contribution for this match
        // NRR = (runs scored / overs faced) - (runs conceded / overs bowled)
        const team1NrrContribution = team1Overs > 0 && team1OversBowled > 0
          ? (team1Runs / team1Overs) - (team1RunsConceded / team1OversBowled)
          : 0;
        const team2NrrContribution = team2Overs > 0 && team2OversBowled > 0
          ? (team2Runs / team2Overs) - (team2RunsConceded / team2OversBowled)
          : 0;

        const winnerEntry = newPointsTable.find((e) => e.teamId === winnerTeam?.id);
        const loserEntry = newPointsTable.find(
          (e) => e.teamId === (winnerTeam?.id === match.homeTeam ? match.awayTeam : match.homeTeam)
        );

        if (winnerEntry) {
          winnerEntry.played += 1;
          winnerEntry.won += 1;
          winnerEntry.points += 2;
          // Update NRR (simplified: add this match's contribution)
          const winnerNrrContrib = winnerTeam?.id === team1Id ? team1NrrContribution : team2NrrContribution;
          winnerEntry.netRunRate = Math.round(((winnerEntry.netRunRate * (winnerEntry.played - 1)) + winnerNrrContrib) / winnerEntry.played * 1000) / 1000;
        }
        if (loserEntry) {
          loserEntry.played += 1;
          loserEntry.lost += 1;
          // Update NRR
          const loserNrrContrib = loserEntry.teamId === team1Id ? team1NrrContribution : team2NrrContribution;
          loserEntry.netRunRate = Math.round(((loserEntry.netRunRate * (loserEntry.played - 1)) + loserNrrContrib) / loserEntry.played * 1000) / 1000;
        }

        updatePointsTable(newPointsTable);
        } // End of league-only points table update

        updateMatch(match.id, {
          status: 'completed',
          innings2: updatedInnings,
        });

        // Update player fatigue based on actual participation
        // Combine both innings stats for fatigue calculation
        // Note: Maps don't serialize to JSON properly, so we need to handle both Map and plain object cases
        type BatterStatsType = { runs: number; balls: number; fours: number; sixes: number };
        type BowlerStatsType = { overs: number; runs: number; wickets: number; dots: number };

        const safeMapToArray = <T,>(mapOrObj: Map<string, T> | Record<string, T> | null | undefined): [string, T][] => {
          if (!mapOrObj) return [];
          if (mapOrObj instanceof Map) return Array.from(mapOrObj) as [string, T][];
          // If it's a plain object (from JSON deserialization), convert entries
          return Object.entries(mapOrObj) as [string, T][];
        };

        const allInningsStats = {
          batterStats: new Map<string, BatterStatsType>([
            ...safeMapToArray<BatterStatsType>(match.innings1?.batterStats as Map<string, BatterStatsType> | undefined),
            ...safeMapToArray<BatterStatsType>(updatedInnings.batterStats as Map<string, BatterStatsType>),
          ]),
          bowlerStats: new Map<string, BowlerStatsType>([
            ...safeMapToArray<BowlerStatsType>(match.innings1?.bowlerStats as Map<string, BowlerStatsType> | undefined),
            ...safeMapToArray<BowlerStatsType>(updatedInnings.bowlerStats as Map<string, BowlerStatsType>),
          ]),
        };

        const allPlayingIds = [
          ...(match.homeTactics?.playingXI || []),
          ...(match.awayTactics?.playingXI || []),
        ];

        allPlayingIds.forEach((playerId) => {
          const player = players.find((p) => p.id === playerId);
          if (!player) return;

          // Base fatigue for playing (being in XI)
          let fatigueGain = 5;

          // Additional fatigue for batting (based on balls faced)
          const batterStats = allInningsStats.batterStats.get(playerId);
          if (batterStats && batterStats.balls > 0) {
            // +1 fatigue per 10 balls faced, max +5
            fatigueGain += Math.min(5, Math.floor(batterStats.balls / 10));
          }

          // Additional fatigue for bowling (based on overs bowled)
          const bowlerStats = allInningsStats.bowlerStats.get(playerId);
          if (bowlerStats && bowlerStats.overs > 0) {
            // +2 fatigue per over bowled, max +8
            fatigueGain += Math.min(8, bowlerStats.overs * 2);
          }

          // Calculate form change based on performance
          let formChange = 0;

          // Batting form
          if (batterStats && batterStats.balls > 0) {
            const strikeRate = (batterStats.runs / batterStats.balls) * 100;
            const runs = batterStats.runs;

            // Good performance: 30+ runs OR SR > 130 with 10+ balls
            if (runs >= 50) {
              formChange += 5; // Fifty = big form boost
            } else if (runs >= 30) {
              formChange += 3; // Good contribution
            } else if (runs >= 15 && strikeRate >= 130) {
              formChange += 2; // Quick cameo
            } else if (runs < 10 && batterStats.balls >= 10) {
              formChange -= 2; // Struggled
            } else if (runs === 0 && batterStats.balls >= 5) {
              formChange -= 3; // Duck (faced deliveries)
            }
          }

          // Bowling form
          if (bowlerStats && bowlerStats.overs > 0) {
            const economy = bowlerStats.runs / bowlerStats.overs;
            const wickets = bowlerStats.wickets;

            // Good performance: wickets or economy < 7
            if (wickets >= 3) {
              formChange += 5; // 3+ wickets = big form boost
            } else if (wickets >= 2) {
              formChange += 3; // 2 wickets = good
            } else if (wickets >= 1 && economy < 8) {
              formChange += 2; // Wicket with decent economy
            } else if (economy < 7 && bowlerStats.overs >= 2) {
              formChange += 1; // Economical spell
            } else if (economy > 10 && bowlerStats.overs >= 2) {
              formChange -= 2; // Expensive spell
            } else if (economy > 12 && bowlerStats.overs >= 2) {
              formChange -= 3; // Very expensive
            }
          }

          // Apply updates
          updatePlayerState(playerId, {
            fatigue: Math.min(100, player.fatigue + fatigueGain),
            form: Math.max(-20, Math.min(20, player.form + formChange)),
          });
        });
      }
    }
  }, [match, inningsState, currentInnings, firstInningsTotal, matchEnded, homePlayers, awayPlayers, selectedNextBowler, playerTeamId]);

  // Simulate next ball
  const simulateNextBall = useCallback(() => {
    if (!match || !inningsState || matchEnded || showNewBatsmanModal) return;

    const battingTeamId = inningsState.battingTeam;
    const bowlingTeamId = inningsState.bowlingTeam;

    const battingTeamPlayers =
      battingTeamId === match.homeTeam ? homePlayers : awayPlayers;
    const bowlingTeamPlayers =
      bowlingTeamId === match.homeTeam ? homePlayers : awayPlayers;

    const battingTactics =
      battingTeamId === match.homeTeam
        ? match.homeTactics || getAITactics(match.homeTeam)
        : match.awayTactics || getAITactics(match.awayTeam);

    const bowlingTactics =
      bowlingTeamId === match.homeTeam
        ? match.homeTactics || getAITactics(match.homeTeam)
        : match.awayTactics || getAITactics(match.awayTeam);

    // Get or select bowler
    const MAX_OVERS_PER_BOWLER = 4;
    const bowlers = bowlingTeamPlayers.filter(
      (p) =>
        (p.role === 'bowler' || p.role === 'allrounder') &&
        bowlingTactics.playingXI.includes(p.id)
    );

    const getBowlerOvers = (bowlerId: string): number => {
      if (!(inningsState.bowlerStats instanceof Map)) return 0;
      return inningsState.bowlerStats.get(bowlerId)?.overs ?? 0;
    };

    // Current bowler continues unless over just ended
    let bowler = inningsState.currentBowler
      ? bowlers.find((b) => b.id === inningsState.currentBowler)
      : null;

    // If at start of over (balls = 0), need to select new bowler
    if (inningsState.balls === 0 || !bowler) {
      const lastBowlerId = inningsState.overSummaries.at(-1)?.bowler;

      if (selectedNextBowler && bowlingTeamId === playerTeamId) {
        const selectedOvers = getBowlerOvers(selectedNextBowler);
        const isValid = selectedNextBowler !== lastBowlerId && selectedOvers < MAX_OVERS_PER_BOWLER;
        if (isValid) {
          bowler = bowlers.find((b) => b.id === selectedNextBowler);
        }
        setSelectedNextBowler(null);
      }

      if (!bowler) {
        const availableBowlers = bowlers.filter((b) => {
          const overs = getBowlerOvers(b.id);
          return b.id !== lastBowlerId && overs < MAX_OVERS_PER_BOWLER;
        });

        if (availableBowlers.length > 0) {
          bowler = availableBowlers[Math.floor(Math.random() * availableBowlers.length)];
        } else {
          const stillAvailable = bowlers.filter(b => getBowlerOvers(b.id) < MAX_OVERS_PER_BOWLER);
          bowler = stillAvailable[0] || bowlers[0];
        }
      }
    }

    if (!bowler) return;

    const target = currentInnings === 2 ? firstInningsTotal + 1 : null;

    // Get batting team in correct batting order (as per playingXI)
    const battingTeamInOrder = battingTactics.playingXI
      .map(id => battingTeamPlayers.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);

    const { ballEvent, updatedInnings, newBatsmanNeeded, inningsComplete } = simulateSingleBall(
      battingTeamInOrder,
      bowler,
      inningsState,
      battingTactics,
      match.pitch,
      target
    );

    // Add to recent balls
    setRecentBalls(prev => [...prev.slice(-11), ballEvent]);
    setInningsState(updatedInnings);

    // Check if new batsman needed (pause for player tactics)
    if (newBatsmanNeeded && updatedInnings.battingTeam === playerTeamId) {
      setShowNewBatsmanModal(true);
      setIsSimulating(false);
    }

    // Handle innings end
    if (inningsComplete) {
      if (currentInnings === 1) {
        // Start second innings
        setFirstInningsTotal(updatedInnings.runs);
        setCurrentInnings(2);
        setRecentBalls([]);

        const newBattingTeam = bowlingTeamId;
        const newBattingTactics =
          newBattingTeam === match.homeTeam
            ? match.homeTactics || getAITactics(match.homeTeam)
            : match.awayTactics || getAITactics(match.awayTeam);

        setInningsState({
          battingTeam: newBattingTeam,
          bowlingTeam: battingTeamId,
          runs: 0,
          wickets: 0,
          overs: 0,
          balls: 0,
          currentBatters: [newBattingTactics.playingXI[0], newBattingTactics.playingXI[1]],
          currentBowler: '',
          overSummaries: [],
          fallOfWickets: [],
          batterStats: new Map(),
          bowlerStats: new Map(),
        });

        updateMatch(match.id, {
          currentInnings: 2,
          innings1: updatedInnings,
        });
      } else {
        // Match ended - handle like simulateNextOver does
        handleMatchEnd(updatedInnings);
      }
    }

    return { newBatsmanNeeded, inningsComplete };
  }, [match, inningsState, currentInnings, firstInningsTotal, matchEnded, showNewBatsmanModal, homePlayers, awayPlayers, selectedNextBowler, playerTeamId]);

  // Sim to next wicket
  const simToNextWicket = useCallback(() => {
    if (!match || !inningsState || matchEnded) return;

    setIsSimulating(true);
    setSimMode('wicket');
  }, [match, inningsState, matchEnded]);

  // Handle match end (extracted for reuse)
  const handleMatchEnd = useCallback((updatedInnings: InningsState) => {
    if (!match) return;

    setMatchEnded(true);
    setIsSimulating(false);
    clearLiveMatchState(); // Clear persisted state

    const team1 = teams.find((t) => t.id === match.innings1?.battingTeam);
    const team2 = teams.find((t) => t.id === updatedInnings.battingTeam);

    let winnerTeam: typeof team1 | typeof team2;
    let margin: string;

    if (updatedInnings.runs >= firstInningsTotal + 1) {
      winnerTeam = team2;
      margin = `${10 - updatedInnings.wickets} wickets`;
    } else if (updatedInnings.runs < firstInningsTotal) {
      winnerTeam = team1;
      margin = `${firstInningsTotal - updatedInnings.runs} runs`;
    } else {
      winnerTeam = undefined;
      margin = 'Tie';
    }

    setResult({
      winner: winnerTeam?.name || 'Tie',
      margin: winnerTeam ? margin : 'Match Tied',
    });

    // Update points table for league matches only
    if (match.matchType === 'league') {
      const newPointsTable = [...pointsTable];
      const firstInningsData = match.innings1;
      const team1Id = firstInningsData?.battingTeam || inningsState?.bowlingTeam;
      const team2Id = updatedInnings.battingTeam;

      const team1Runs = firstInningsTotal;
      const team1Overs = 20;
      const team1RunsConceded = updatedInnings.runs;
      const team1OversBowled = Math.min(20, updatedInnings.overs + (updatedInnings.balls > 0 ? updatedInnings.balls / 6 : 0));

      const team2Runs = updatedInnings.runs;
      const team2Overs = Math.min(20, updatedInnings.overs + (updatedInnings.balls > 0 ? updatedInnings.balls / 6 : 0));
      const team2RunsConceded = firstInningsTotal;
      const team2OversBowled = 20;

      const team1NrrContribution = team1Overs > 0 && team1OversBowled > 0
        ? (team1Runs / team1Overs) - (team1RunsConceded / team1OversBowled)
        : 0;
      const team2NrrContribution = team2Overs > 0 && team2OversBowled > 0
        ? (team2Runs / team2Overs) - (team2RunsConceded / team2OversBowled)
        : 0;

      const winnerEntry = newPointsTable.find((e) => e.teamId === winnerTeam?.id);
      const loserEntry = newPointsTable.find(
        (e) => e.teamId === (winnerTeam?.id === match.homeTeam ? match.awayTeam : match.homeTeam)
      );

      if (winnerEntry) {
        winnerEntry.played += 1;
        winnerEntry.won += 1;
        winnerEntry.points += 2;
        const winnerNrrContrib = winnerTeam?.id === team1Id ? team1NrrContribution : team2NrrContribution;
        winnerEntry.netRunRate = Math.round(((winnerEntry.netRunRate * (winnerEntry.played - 1)) + winnerNrrContrib) / winnerEntry.played * 1000) / 1000;
      }
      if (loserEntry) {
        loserEntry.played += 1;
        loserEntry.lost += 1;
        const loserNrrContrib = loserEntry.teamId === team1Id ? team1NrrContribution : team2NrrContribution;
        loserEntry.netRunRate = Math.round(((loserEntry.netRunRate * (loserEntry.played - 1)) + loserNrrContrib) / loserEntry.played * 1000) / 1000;
      }

      updatePointsTable(newPointsTable);
    }

    updateMatch(match.id, {
      status: 'completed',
      innings2: updatedInnings,
    });

    // Update player fatigue/form (same logic as simulateNextOver)
    updatePlayerStats(updatedInnings);
  }, [match, firstInningsTotal, pointsTable, teams, inningsState]);

  // Update player stats after match
  const updatePlayerStats = useCallback((updatedInnings: InningsState) => {
    if (!match) return;

    type BatterStatsType = { runs: number; balls: number; fours: number; sixes: number };
    type BowlerStatsType = { overs: number; runs: number; wickets: number; dots: number };

    const safeMapToArray = <T,>(mapOrObj: Map<string, T> | Record<string, T> | null | undefined): [string, T][] => {
      if (!mapOrObj) return [];
      if (mapOrObj instanceof Map) return Array.from(mapOrObj) as [string, T][];
      return Object.entries(mapOrObj) as [string, T][];
    };

    const allInningsStats = {
      batterStats: new Map<string, BatterStatsType>([
        ...safeMapToArray<BatterStatsType>(match.innings1?.batterStats as Map<string, BatterStatsType> | undefined),
        ...safeMapToArray<BatterStatsType>(updatedInnings.batterStats as Map<string, BatterStatsType>),
      ]),
      bowlerStats: new Map<string, BowlerStatsType>([
        ...safeMapToArray<BowlerStatsType>(match.innings1?.bowlerStats as Map<string, BowlerStatsType> | undefined),
        ...safeMapToArray<BowlerStatsType>(updatedInnings.bowlerStats as Map<string, BowlerStatsType>),
      ]),
    };

    const allPlayingIds = [
      ...(match.homeTactics?.playingXI || []),
      ...(match.awayTactics?.playingXI || []),
    ];

    allPlayingIds.forEach((playerId) => {
      const player = players.find((p) => p.id === playerId);
      if (!player) return;

      let fatigueGain = 5;
      const batterStats = allInningsStats.batterStats.get(playerId);
      if (batterStats && batterStats.balls > 0) {
        fatigueGain += Math.min(5, Math.floor(batterStats.balls / 10));
      }

      const bowlerStats = allInningsStats.bowlerStats.get(playerId);
      if (bowlerStats && bowlerStats.overs > 0) {
        fatigueGain += Math.min(8, bowlerStats.overs * 2);
      }

      let formChange = 0;
      if (batterStats && batterStats.balls > 0) {
        const strikeRate = (batterStats.runs / batterStats.balls) * 100;
        const runs = batterStats.runs;
        if (runs >= 50) formChange += 5;
        else if (runs >= 30) formChange += 3;
        else if (runs >= 15 && strikeRate >= 130) formChange += 2;
        else if (runs < 10 && batterStats.balls >= 10) formChange -= 2;
        else if (runs === 0 && batterStats.balls >= 5) formChange -= 3;
      }

      if (bowlerStats && bowlerStats.overs > 0) {
        const economy = bowlerStats.runs / bowlerStats.overs;
        const wickets = bowlerStats.wickets;
        if (wickets >= 3) formChange += 5;
        else if (wickets >= 2) formChange += 3;
        else if (wickets >= 1 && economy < 8) formChange += 2;
        else if (economy < 7 && bowlerStats.overs >= 2) formChange += 1;
        else if (economy > 10 && bowlerStats.overs >= 2) formChange -= 2;
        else if (economy > 12 && bowlerStats.overs >= 2) formChange -= 3;
      }

      updatePlayerState(playerId, {
        fatigue: Math.min(100, player.fatigue + fatigueGain),
        form: Math.max(-20, Math.min(20, player.form + formChange)),
      });
    });
  }, [match, players, updatePlayerState]);

  // Auto-simulate with mode support
  useEffect(() => {
    if (!isSimulating || matchEnded || showNewBatsmanModal) return;

    const timer = setTimeout(() => {
      if (simMode === 'auto' || simMode === 'over') {
        simulateNextOver();
      } else if (simMode === 'ball' || simMode === 'wicket') {
        const result = simulateNextBall();
        // For wicket mode, stop if wicket fell or innings ended
        if (result && (result.newBatsmanNeeded || result.inningsComplete)) {
          if (simMode === 'wicket') {
            setIsSimulating(false);
            setSimMode('over');
          }
        }
      }
    }, simMode === 'ball' ? 500 : simMode === 'wicket' ? 300 : 1500);

    return () => clearTimeout(timer);
  }, [isSimulating, simulateNextOver, simulateNextBall, matchEnded, showNewBatsmanModal, simMode]);

  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Match not found</p>
      </div>
    );
  }

  const battingTeam = inningsState
    ? teams.find((t) => t.id === inningsState.battingTeam)
    : null;
  const bowlingTeam = inningsState
    ? teams.find((t) => t.id === inningsState.bowlingTeam)
    : null;

  // Get current batters
  const striker = inningsState
    ? players.find((p) => p.id === inningsState.currentBatters[0])
    : null;
  const nonStriker = inningsState
    ? players.find((p) => p.id === inningsState.currentBatters[1])
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="animate-pulse bg-red-600 text-xs px-2 py-1 rounded">LIVE</span>
            <span className="text-sm text-gray-400">
              {homeTeam.shortName} vs {awayTeam.shortName}
            </span>
          </div>
          <span className="text-sm text-gray-400">
            {currentInnings === 1 ? '1st Innings' : '2nd Innings'}
          </span>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Score Card */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <h2 className="text-lg text-gray-400 mb-2">
            {battingTeam?.name || 'Team'} Batting
          </h2>

          <div className="text-5xl font-bold mb-2">
            {inningsState?.runs || 0}-{inningsState?.wickets || 0}
          </div>

          <div className="text-xl text-gray-400 mb-4">
            {Math.floor(inningsState?.overs || 0)}.
            {((inningsState?.balls || 0) % 6)} overs
          </div>

          {currentInnings === 2 && (
            <div className="text-lg">
              {inningsState && inningsState.runs >= firstInningsTotal + 1 ? (
                <span className="text-green-400">Target reached!</span>
              ) : (
                <span className="text-blue-400">
                  Need {firstInningsTotal + 1 - (inningsState?.runs || 0)} runs from{' '}
                  {120 - (Math.floor(inningsState?.overs || 0) * 6 + (inningsState?.balls || 0))} balls
                </span>
              )}
            </div>
          )}

          {currentInnings === 2 && (
            <div className="mt-2 text-sm text-gray-500">
              Target: {firstInningsTotal + 1}
            </div>
          )}
        </div>

        {/* Current Batters */}
        {striker && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm text-gray-400 mb-3">AT THE CREASE</h3>
            <div className="space-y-2">
              {(() => {
                // Safely get batter stats (batterStats might be a Map or plain object after JSON deserialization)
                const batterStatsMap = inningsState?.batterStats;
                const strikerStats = batterStatsMap instanceof Map
                  ? batterStatsMap.get(striker.id)
                  : undefined;
                const runs = strikerStats?.runs ?? 0;
                const balls = strikerStats?.balls ?? 0;
                const fours = strikerStats?.fours ?? 0;
                const sixes = strikerStats?.sixes ?? 0;
                const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';
                return (
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{striker.shortName}*</span>
                    <div className="text-right">
                      <span className="font-bold text-lg">{runs}</span>
                      <span className="text-gray-400 text-sm"> ({balls})</span>
                      <span className="text-gray-500 text-xs ml-2">SR: {sr}</span>
                      {(fours > 0 || sixes > 0) && (
                        <span className="text-gray-500 text-xs ml-2">
                          {fours > 0 && <span className="text-blue-400">{fours}×4</span>}
                          {fours > 0 && sixes > 0 && ' '}
                          {sixes > 0 && <span className="text-green-400">{sixes}×6</span>}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
              {nonStriker && (() => {
                const batterStatsMap = inningsState?.batterStats;
                const nonStrikerStats = batterStatsMap instanceof Map
                  ? batterStatsMap.get(nonStriker.id)
                  : undefined;
                const runs = nonStrikerStats?.runs ?? 0;
                const balls = nonStrikerStats?.balls ?? 0;
                const fours = nonStrikerStats?.fours ?? 0;
                const sixes = nonStrikerStats?.sixes ?? 0;
                const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';
                return (
                  <div className="flex justify-between items-center text-gray-400">
                    <span>{nonStriker.shortName}</span>
                    <div className="text-right">
                      <span className="font-medium">{runs}</span>
                      <span className="text-gray-500 text-sm"> ({balls})</span>
                      <span className="text-gray-600 text-xs ml-2">SR: {sr}</span>
                      {(fours > 0 || sixes > 0) && (
                        <span className="text-gray-600 text-xs ml-2">
                          {fours > 0 && <span className="text-blue-400/70">{fours}×4</span>}
                          {fours > 0 && sixes > 0 && ' '}
                          {sixes > 0 && <span className="text-green-400/70">{sixes}×6</span>}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Current Bowler */}
        {inningsState?.currentBowler && (() => {
          const currentBowler = players.find((p) => p.id === inningsState.currentBowler);
          // Safely get bowler stats (bowlerStats might be a Map or plain object after JSON deserialization)
          const bowlerStatsMap = inningsState.bowlerStats;
          const bowlerStats = bowlerStatsMap instanceof Map
            ? bowlerStatsMap.get(inningsState.currentBowler)
            : undefined;
          if (!currentBowler) return null;
          const overs = bowlerStats?.overs ?? 0;
          const runsGiven = bowlerStats?.runs ?? 0;
          const wicketsTaken = bowlerStats?.wickets ?? 0;
          const dots = bowlerStats?.dots ?? 0;
          const economy = overs > 0 ? (runsGiven / overs).toFixed(2) : '0.00';
          return (
            <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-400">BOWLING: </span>
                  <span className="font-medium">{currentBowler.shortName}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold">{wicketsTaken}-{runsGiven}</span>
                  <span className="text-gray-400 text-sm"> ({overs}/4 ov)</span>
                  <span className="text-gray-500 text-xs ml-2">Econ: {economy}</span>
                  <span className="text-gray-500 text-xs ml-2">Dots: {dots}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Scorecard Toggle */}
        <button
          onClick={() => setShowScorecard(!showScorecard)}
          className="w-full py-2 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700 border border-gray-700"
        >
          {showScorecard ? 'Hide Scorecard' : 'View Scorecard'}
        </button>

        {/* Full Scorecard */}
        {showScorecard && inningsState && (() => {
          const battingTactics =
            inningsState.battingTeam === match?.homeTeam
              ? match?.homeTactics
              : match?.awayTactics;
          const bowlingTeamPlayers =
            inningsState.bowlingTeam === match?.homeTeam ? homePlayers : awayPlayers;
          const bowlingTactics =
            inningsState.bowlingTeam === match?.homeTeam
              ? match?.homeTactics
              : match?.awayTactics;

          // Get all batting entries
          const battingOrder = battingTactics?.playingXI || [];

          // Handle both Map and plain object (after JSON deserialization)
          const getBatterStats = (playerId: string) => {
            if (inningsState.batterStats instanceof Map) {
              return inningsState.batterStats.get(playerId);
            } else if (inningsState.batterStats && typeof inningsState.batterStats === 'object') {
              return (inningsState.batterStats as Record<string, { runs: number; balls: number; fours: number; sixes: number }>)[playerId];
            }
            return undefined;
          };

          // Get dismissed batters in order of dismissal
          const dismissedBatters = inningsState.fallOfWickets.map(fow => fow.player);

          // Handle both Map and plain object for bowler stats
          const getBowlerStats = (bowlerId: string) => {
            if (inningsState.bowlerStats instanceof Map) {
              return inningsState.bowlerStats.get(bowlerId);
            } else if (inningsState.bowlerStats && typeof inningsState.bowlerStats === 'object') {
              return (inningsState.bowlerStats as Record<string, { overs: number; runs: number; wickets: number; dots: number }>)[bowlerId];
            }
            return undefined;
          };
          const allBowlers = bowlingTeamPlayers.filter(p =>
            (p.role === 'bowler' || p.role === 'allrounder') &&
            bowlingTactics?.playingXI.includes(p.id)
          );

          return (
            <div className="space-y-4">
              {/* Batting Scorecard */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-blue-400 mb-3">BATTING</h3>
                <div className="space-y-2 text-sm">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 border-b border-gray-700 pb-1">
                    <div className="col-span-4">Batter</div>
                    <div className="col-span-2 text-right">R</div>
                    <div className="col-span-2 text-right">B</div>
                    <div className="col-span-2 text-right">4s</div>
                    <div className="col-span-2 text-right">6s</div>
                  </div>
                  {/* All batters in order */}
                  {battingOrder.map((playerId, idx) => {
                    const player = players.find(p => p.id === playerId);
                    const stats = getBatterStats(playerId);
                    const isDismissed = dismissedBatters.includes(playerId);
                    const isCurrentBatter = inningsState.currentBatters.includes(playerId);
                    const isStriker = playerId === inningsState.currentBatters[0];
                    const hasBatted = stats || isCurrentBatter || isDismissed;

                    const runs = stats?.runs ?? 0;
                    const balls = stats?.balls ?? 0;
                    const fours = stats?.fours ?? 0;
                    const sixes = stats?.sixes ?? 0;

                    return (
                      <div
                        key={playerId}
                        className={`grid grid-cols-12 gap-1 ${
                          !hasBatted ? 'text-gray-600' :
                          isDismissed ? 'text-gray-500' :
                          isCurrentBatter ? 'text-white' : 'text-gray-400'
                        }`}
                      >
                        <div className="col-span-4 truncate">
                          {player?.shortName}
                          {isStriker && '*'}
                          {isDismissed && <span className="text-red-400 ml-1">✕</span>}
                        </div>
                        {hasBatted ? (
                          <>
                            <div className="col-span-2 text-right font-medium">{runs}</div>
                            <div className="col-span-2 text-right">{balls}</div>
                            <div className="col-span-2 text-right text-blue-400">{fours || '-'}</div>
                            <div className="col-span-2 text-right text-green-400">{sixes || '-'}</div>
                          </>
                        ) : (
                          <div className="col-span-8 text-right text-xs italic">yet to bat</div>
                        )}
                      </div>
                    );
                  })}
                  {/* Extras */}
                  <div className="grid grid-cols-12 gap-1 text-gray-400 border-t border-gray-700 pt-1 mt-2">
                    <div className="col-span-4">Extras</div>
                    <div className="col-span-8 text-right">
                      {/* Calculate extras from total - sum of batter runs */}
                      {(() => {
                        let batterRuns = 0;
                        battingOrder.forEach(playerId => {
                          const stats = getBatterStats(playerId);
                          if (stats) batterRuns += stats.runs;
                        });
                        return inningsState.runs - batterRuns;
                      })()}
                    </div>
                  </div>
                  {/* Total */}
                  <div className="grid grid-cols-12 gap-1 font-bold border-t border-gray-700 pt-1">
                    <div className="col-span-4">Total</div>
                    <div className="col-span-8 text-right">
                      {inningsState.runs}/{inningsState.wickets} ({inningsState.overs} ov)
                    </div>
                  </div>
                </div>
              </div>

              {/* Bowling Scorecard */}
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-purple-400 mb-3">BOWLING</h3>
                <div className="space-y-2 text-sm">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 border-b border-gray-700 pb-1">
                    <div className="col-span-4">Bowler</div>
                    <div className="col-span-2 text-right">O</div>
                    <div className="col-span-2 text-right">R</div>
                    <div className="col-span-2 text-right">W</div>
                    <div className="col-span-2 text-right">Econ</div>
                  </div>
                  {/* Bowlers who have bowled */}
                  {allBowlers.map((bowler) => {
                    const stats = getBowlerStats(bowler.id);
                    if (!stats || stats.overs === 0) return null;

                    const economy = stats.overs > 0 ? (stats.runs / stats.overs).toFixed(1) : '-';
                    const isMaxedOut = stats.overs >= 4;

                    return (
                      <div
                        key={bowler.id}
                        className={`grid grid-cols-12 gap-1 ${isMaxedOut ? 'text-gray-500' : 'text-gray-300'}`}
                      >
                        <div className="col-span-4 truncate">
                          {bowler.shortName}
                          {isMaxedOut && <span className="text-xs text-red-400 ml-1">✓</span>}
                        </div>
                        <div className="col-span-2 text-right">{stats.overs}</div>
                        <div className="col-span-2 text-right">{stats.runs}</div>
                        <div className="col-span-2 text-right font-medium text-green-400">
                          {stats.wickets || '-'}
                        </div>
                        <div className="col-span-2 text-right">
                          <span className={
                            parseFloat(economy) < 6 ? 'text-green-400' :
                            parseFloat(economy) > 10 ? 'text-red-400' : ''
                          }>
                            {economy}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* This Over - Ball by Ball Display */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 min-h-[120px]">
          <h3 className="text-sm text-gray-400 mb-3">
            {recentBalls.length > 0 ? (
              <>THIS OVER • {recentBalls.filter(b => b.over === (inningsState?.overs || 0)).reduce((sum, b) => sum + (b.outcome.runs || 0), 0)} runs</>
            ) : lastOver ? (
              <>OVER {lastOver.overNumber + 1} • {lastOver.runs} runs, {lastOver.wickets} wickets</>
            ) : (
              <>WAITING FOR FIRST BALL</>
            )}
          </h3>

          {/* Ball indicators */}
          <div className="flex gap-2 mb-3 flex-wrap min-h-[36px]">
            {recentBalls.length > 0 ? (
              recentBalls.filter(b => b.over === (inningsState?.overs || 0)).map((ball, i) => {
                const isWicket = ball.outcome.type === 'wicket';
                const isExtra = ball.outcome.type === 'extra';
                const runs = ball.outcome.runs || 0;
                const isBoundary = runs === 4 || runs === 6;
                const isDot = runs === 0 && !isWicket && !isExtra;

                return (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isWicket ? 'bg-red-600 text-white' :
                      runs === 6 ? 'bg-green-600 text-white' :
                      runs === 4 ? 'bg-blue-600 text-white' :
                      isDot ? 'bg-gray-600 text-gray-300' :
                      'bg-gray-700 text-white'
                    }`}
                  >
                    {isWicket ? 'W' : runs === 0 ? '•' : runs}
                  </div>
                );
              })
            ) : lastOver ? (
              lastOver.balls.slice(-6).map((ball, i) => {
                const isWicket = ball.outcome.type === 'wicket';
                const runs = ball.outcome.runs || 0;

                return (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isWicket ? 'bg-red-600 text-white' :
                      runs === 6 ? 'bg-green-600 text-white' :
                      runs === 4 ? 'bg-blue-600 text-white' :
                      runs === 0 ? 'bg-gray-600 text-gray-300' :
                      'bg-gray-700 text-white'
                    }`}
                  >
                    {isWicket ? 'W' : runs === 0 ? '•' : runs}
                  </div>
                );
              })
            ) : (
              <div className="text-gray-500 text-sm">Press Next Ball or Next Over to start</div>
            )}
          </div>

          {/* Latest ball narrative */}
          {recentBalls.length > 0 && (
            <div className="text-sm border-t border-gray-700 pt-2 min-h-[24px]">
              <span className="text-gray-500">
                {recentBalls[recentBalls.length - 1].over}.{recentBalls[recentBalls.length - 1].ball}
              </span>
              {' - '}
              <span
                className={
                  recentBalls[recentBalls.length - 1].outcome.type === 'wicket'
                    ? 'text-red-400'
                    : (recentBalls[recentBalls.length - 1].outcome.runs === 4 || recentBalls[recentBalls.length - 1].outcome.runs === 6)
                    ? 'text-green-400'
                    : 'text-gray-300'
                }
              >
                {recentBalls[recentBalls.length - 1].narrative}
              </span>
            </div>
          )}
        </div>

        {/* Tactical Controls Panel */}
        {!matchEnded && showTacticsPanel && (
          <div className="bg-gray-800 rounded-xl p-4 border border-blue-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-blue-400">TACTICAL ADJUSTMENTS</h3>
              <button
                onClick={() => setShowTacticsPanel(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            {/* Batting Approach - Only show when your team is batting */}
            {inningsState?.battingTeam === playerTeamId && (
              <div className="mb-4">
                <h4 className="text-xs text-gray-400 mb-2">BATTING APPROACH</h4>
                <div className="space-y-2">
                  {/* Striker */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {striker?.shortName}* <span className="text-gray-500">(striker)</span>
                    </span>
                    <div className="flex gap-1">
                      {(['aggressive', 'balanced', 'defensive'] as const).map((approach) => (
                        <button
                          key={approach}
                          onClick={() => setStrikerApproach(approach)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            strikerApproach === approach
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {approach === 'aggressive' ? 'Attack' : approach === 'balanced' ? 'Normal' : 'Defend'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Non-striker */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      {nonStriker?.shortName} <span className="text-gray-500">(non-striker)</span>
                    </span>
                    <div className="flex gap-1">
                      {(['aggressive', 'balanced', 'defensive'] as const).map((approach) => (
                        <button
                          key={approach}
                          onClick={() => setNonStrikerApproach(approach)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            nonStrikerApproach === approach
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {approach === 'aggressive' ? 'Attack' : approach === 'balanced' ? 'Normal' : 'Defend'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bowler Selection - Only show when your team is bowling */}
            {inningsState?.bowlingTeam === playerTeamId && (() => {
              const bowlingTactics = isPlayerHome ? match?.homeTactics : match?.awayTactics;
              const allBowlers = (isPlayerHome ? homePlayers : awayPlayers)
                .filter((p) =>
                  (p.role === 'bowler' || p.role === 'allrounder') &&
                  bowlingTactics?.playingXI.includes(p.id)
                );
              const lastBowlerId = inningsState?.overSummaries.at(-1)?.bowler;
              const MAX_OVERS = 4; // T20 rule

              return (
                <div>
                  <h4 className="text-xs text-gray-400 mb-2">SELECT NEXT BOWLER</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {allBowlers.map((bowler) => {
                      const stats = inningsState?.bowlerStats instanceof Map
                        ? inningsState.bowlerStats.get(bowler.id)
                        : undefined;
                      const oversUsed = stats?.overs ?? 0;
                      const isMaxedOut = oversUsed >= MAX_OVERS;
                      const isLastBowler = bowler.id === lastBowlerId;
                      const isDisabled = isLastBowler || isMaxedOut;
                      const isSelected = selectedNextBowler === bowler.id;

                      return (
                        <button
                          key={bowler.id}
                          onClick={() => !isDisabled && setSelectedNextBowler(isSelected ? null : bowler.id)}
                          disabled={isDisabled}
                          className={`p-2 rounded-lg text-left text-sm transition-colors ${
                            isSelected
                              ? 'bg-purple-600 border border-purple-500'
                              : isDisabled
                              ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                        >
                          <div className="font-medium flex justify-between">
                            <span>{bowler.shortName}</span>
                            <span className={`text-xs ${isMaxedOut ? 'text-red-400' : 'text-gray-500'}`}>
                              {oversUsed}/{MAX_OVERS}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400">
                            {stats ? `${stats.wickets}-${stats.runs}` : '0-0'}
                            {isLastBowler && ' • Just bowled'}
                            {isMaxedOut && ' • Maxed out'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedNextBowler && (
                    <p className="text-xs text-purple-400 mt-2">
                      {players.find((p) => p.id === selectedNextBowler)?.shortName} will bowl next over
                    </p>
                  )}

                  {/* Bowling Length Override */}
                  <div className="mt-4">
                    <h4 className="text-xs text-gray-400 mb-2">BOWLING LENGTH (this over)</h4>
                    <div className="flex gap-1">
                      {BOWLING_LENGTH_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setLiveBowlingLength(liveBowlingLength === opt.value ? null : opt.value)}
                          className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
                            liveBowlingLength === opt.value
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {liveBowlingLength && (
                      <p className="text-xs text-purple-400 mt-1">
                        Override: {liveBowlingLength} (tap to clear)
                      </p>
                    )}
                  </div>

                  {/* Field Setting Override */}
                  <div className="mt-3">
                    <h4 className="text-xs text-gray-400 mb-2">FIELD SETTING (this over)</h4>
                    <div className="flex gap-1">
                      {FIELD_SETTING_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setLiveFieldSetting(liveFieldSetting === opt.value ? null : opt.value)}
                          className={`flex-1 px-2 py-2 text-xs rounded-lg transition-colors ${
                            liveFieldSetting === opt.value
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {liveFieldSetting && (
                      <p className="text-xs text-green-400 mt-1">
                        Override: {liveFieldSetting} (tap to clear)
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* New Batsman Modal */}
        {showNewBatsmanModal && (
          <div className="bg-blue-900/50 rounded-xl p-4 border border-blue-700">
            <h3 className="font-semibold text-blue-300 mb-2">New Batsman</h3>
            <p className="text-sm text-gray-300 mb-3">
              A wicket has fallen. The new batsman is coming to the crease.
            </p>
            {inningsState && (() => {
              const newBatter = players.find(p => p.id === inningsState.currentBatters[0]);
              return newBatter && (
                <div className="bg-gray-800 rounded-lg p-3 mb-3">
                  <div className="font-medium">{newBatter.name}</div>
                  <div className="text-sm text-gray-400">
                    {newBatter.role} • Form: {newBatter.form > 0 ? '+' : ''}{newBatter.form}
                  </div>
                </div>
              );
            })()}
            <button
              onClick={() => setShowNewBatsmanModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-medium"
            >
              Continue
            </button>
          </div>
        )}

        {/* Controls - Fixed at bottom of content area */}
        {!matchEnded && !showNewBatsmanModal && (
          <div className="space-y-2 bg-gray-900 sticky bottom-0 pt-2 pb-4 -mx-4 px-4 border-t border-gray-800">
            {/* Tactics toggle */}
            <button
              onClick={() => setShowTacticsPanel(!showTacticsPanel)}
              className={`w-full py-2 rounded-lg font-medium transition-colors text-sm ${
                showTacticsPanel
                  ? 'bg-blue-900 text-blue-300 border border-blue-700'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {showTacticsPanel ? 'Hide Tactics' : 'Adjust Tactics'}
            </button>

            {/* Ball-by-ball controls */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSimMode('ball');
                  simulateNextBall();
                }}
                disabled={isSimulating}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-3 rounded-lg font-medium text-sm"
              >
                Next Ball
              </button>
              <button
                onClick={() => {
                  setSimMode('wicket');
                  setIsSimulating(true);
                }}
                disabled={isSimulating}
                className="flex-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 py-3 rounded-lg font-medium text-sm"
              >
                Sim to Wicket
              </button>
            </div>

            {/* Sim controls */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSimMode('auto');
                  setIsSimulating(!isSimulating);
                }}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors
                  ${isSimulating
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                  }`}
              >
                {isSimulating ? 'Pause' : 'Auto Simulate'}
              </button>
              <button
                onClick={() => {
                  setSimMode('over');
                  simulateNextOver();
                }}
                disabled={isSimulating}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 py-3 rounded-lg font-medium"
              >
                Next Over
              </button>
            </div>
          </div>
        )}

        {/* Match Result */}
        {matchEnded && result && (
          <div className={`border rounded-xl p-6 text-center ${
            match?.matchType !== 'league'
              ? 'bg-purple-900/30 border-purple-700'
              : 'bg-green-900/30 border-green-700'
          }`}>
            {match?.matchType === 'final' && result.winner === teams.find(t =>
              t.id === (inningsState?.battingTeam === match.homeTeam ? match.homeTeam : match.awayTeam) &&
              inningsState && inningsState.runs >= firstInningsTotal + 1
            )?.name && (
              <div className="text-3xl mb-2">🏆</div>
            )}
            <h2 className="text-2xl font-bold mb-2">{result.winner}</h2>
            <p className="text-lg text-gray-300">won by {result.margin}</p>
            {match?.matchType !== 'league' && (
              <p className="text-sm text-purple-400 mt-2">
                {match?.matchType === 'final' ? 'IPL CHAMPIONS!' : match?.matchType?.replace(/([A-Z])/g, ' $1').replace('qualifier', 'Qualifier ').toUpperCase()}
              </p>
            )}

            <button
              onClick={() => {
                // Determine winner and loser for playoff progression
                const winnerId = inningsState && inningsState.runs >= firstInningsTotal + 1
                  ? inningsState.battingTeam
                  : match?.innings1?.battingTeam || match?.homeTeam;
                const loserId = winnerId === match?.homeTeam ? match?.awayTeam : match?.homeTeam;
                const playerWon = winnerId === playerTeamId;

                // Generate random event after match (35% chance)
                generatePostMatchEvent(playerWon);

                // Handle based on match type
                if (match?.matchType === 'league') {
                  // Simulate background AI matches and advance to next match day
                  simulateBackgroundMatches();
                  advanceToNextMatch();
                  // Check if league phase is complete
                  checkAndStartPlayoffs();
                } else if (match && winnerId && loserId) {
                  // Progress playoffs
                  progressPlayoffs(match.id, winnerId, loserId);
                  advanceToNextMatch();
                }

                navigateTo('home');
              }}
              className={`mt-4 px-6 py-2 rounded-lg font-medium ${
                match?.matchType !== 'league'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
