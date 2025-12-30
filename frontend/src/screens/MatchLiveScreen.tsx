import { useState, useEffect, useCallback, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { simulateOver as clientSimulateOver, simulateSingleBall, generateDefaultTactics, selectSmartBowler, getFormatConfig } from '../engine/matchEngine';
import { InningsState, OverSummary, Player, MatchTactics, BallEvent, SerializedInningsState, BowlingLength, FieldSetting } from '../types';
import {
  simulateOver as backendSimulateOver,
  isUsingBackend,
} from '../services';
import { COUNTRIES } from '../data/countries';

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
    gameMode,
    country,
    internationalCalendar,
  } = useGameStore();

  const [isSimulating, setIsSimulating] = useState(false);
  const [currentInnings, setCurrentInnings] = useState<1 | 2 | 3 | 4>(1);
  const [inningsState, setInningsState] = useState<InningsState | null>(null);
  const [lastOver, setLastOver] = useState<OverSummary | null>(null);
  const [matchEnded, setMatchEnded] = useState(false);
  const [firstInningsTotal, setFirstInningsTotal] = useState<number>(0);
  const [result, setResult] = useState<{ winner: string; margin: string } | null>(null);
  // Test cricket: track all innings totals [innings1, innings2, innings3, innings4]
  const [inningsTotals, setInningsTotals] = useState<[number, number, number, number]>([0, 0, 0, 0]);

  // Test cricket: day and session tracking
  const [testDay, setTestDay] = useState(1);
  const [testSession, setTestSession] = useState<'Morning' | 'Afternoon' | 'Evening'>('Morning');
  const OVERS_PER_SESSION = 30;
  const OVERS_PER_DAY = 90;

  // Ball-by-ball state
  const [recentBalls, setRecentBalls] = useState<BallEvent[]>([]);
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [simMode, setSimMode] = useState<'ball' | 'over' | 'wicket' | 'auto'>('over');

  // Loading state for async operations
  const [isLoading, setIsLoading] = useState(false);

  // In-match tactical controls
  const [showTacticsPanel, setShowTacticsPanel] = useState(false);
  const [strikerApproach, setStrikerApproach] = useState<'aggressive' | 'balanced' | 'defensive'>('balanced');
  const [nonStrikerApproach, setNonStrikerApproach] = useState<'aggressive' | 'balanced' | 'defensive'>('balanced');
  const [selectedNextBowler, setSelectedNextBowler] = useState<string | null>(null);
  const [liveBowlingLength, setLiveBowlingLength] = useState<BowlingLength | null>(null);
  const [liveFieldSetting, setLiveFieldSetting] = useState<FieldSetting | null>(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [showManhattan, setShowManhattan] = useState(false);

  const match = fixtures.find((m) => m.id === selectedMatchId);

  // Prevent accessing completed matches
  useEffect(() => {
    if (match && match.status === 'completed' && !matchEnded) {
      navigateTo('home');
    }
  }, [match?.status]);

  // Update day/session based on total overs bowled (across all innings) for Test matches
  useEffect(() => {
    if (match?.format !== 'test' || !inningsState) return;

    // Calculate total overs across all innings
    const previousInningsOvers = inningsTotals.reduce((sum, _, idx) => {
      if (idx < currentInnings - 1) {
        // Estimate overs from previous innings (rough: runs / 3.5 run rate)
        return sum + Math.min(150, Math.floor(inningsTotals[idx] / 3.5));
      }
      return sum;
    }, 0);
    const totalOvers = previousInningsOvers + (inningsState?.overs || 0);

    // Calculate day and session from total overs
    const newDay = Math.min(5, Math.floor(totalOvers / OVERS_PER_DAY) + 1);
    const oversToday = totalOvers % OVERS_PER_DAY;
    const sessionIndex = Math.floor(oversToday / OVERS_PER_SESSION);
    const sessions: ('Morning' | 'Afternoon' | 'Evening')[] = ['Morning', 'Afternoon', 'Evening'];
    const newSession = sessions[Math.min(2, sessionIndex)];

    if (newDay !== testDay) setTestDay(newDay);
    if (newSession !== testSession) setTestSession(newSession);
  }, [match?.format, inningsState?.overs, currentInnings, inningsTotals, testDay, testSession, OVERS_PER_DAY, OVERS_PER_SESSION]);

  const homeTeam = teams.find((t) => t.id === match?.homeTeam);
  const awayTeam = teams.find((t) => t.id === match?.awayTeam);

  // International mode handling
  const isInternationalMode = gameMode === 'international' && country;
  const playerCountryName = isInternationalMode ? COUNTRIES[country]?.name : null;

  // Get opponent info from international calendar if in international mode
  const currentSeries = isInternationalMode
    ? internationalCalendar?.series.find(s => match?.id.includes(s.id))
    : null;
  const opponentCountry = currentSeries?.opponent;
  const opponentCountryName = opponentCountry ? COUNTRIES[opponentCountry]?.name : null;

  // Determine if player's country is the home team
  // Use series venue if available, otherwise fall back to checking if playerTeamId matches homeTeam
  const isPlayerCountryHome = currentSeries
    ? currentSeries.venue === 'home'
    : playerTeamId === match?.homeTeam;

  // Team display names for international mode
  const homeTeamName = isInternationalMode
    ? (isPlayerCountryHome ? playerCountryName : opponentCountryName) || 'Home'
    : homeTeam?.name;
  const awayTeamName = isInternationalMode
    ? (isPlayerCountryHome ? opponentCountryName : playerCountryName) || 'Away'
    : awayTeam?.name;
  const homeTeamShortName = isInternationalMode
    ? (isPlayerCountryHome ? country : opponentCountry) || 'HOM'
    : homeTeam?.shortName;
  const awayTeamShortName = isInternationalMode
    ? (isPlayerCountryHome ? opponentCountry : country) || 'AWY'
    : awayTeam?.shortName;

  // Player pools - use nationality for international mode
  // For international mode, determine pools based on who is home/away
  const homePlayers = isInternationalMode
    ? players.filter((p) => p.nationality === (isPlayerCountryHome ? playerCountryName : opponentCountryName))
    : players.filter((p) => homeTeam?.squad.includes(p.id));
  const awayPlayers = isInternationalMode
    ? players.filter((p) => p.nationality === (isPlayerCountryHome ? opponentCountryName : playerCountryName))
    : players.filter((p) => awayTeam?.squad.includes(p.id));

  const isPlayerHome = playerTeamId === match?.homeTeam;
  const playerTactics = isPlayerHome ? match?.homeTactics : match?.awayTactics;
  const opponentTactics = isPlayerHome ? match?.awayTactics : match?.homeTactics;

  // Generate AI tactics if not set
  const getAITactics = useCallback(
    (teamId: string): MatchTactics => {
      let teamPlayersList: Player[];
      let captain = '';

      if (isInternationalMode && currentSeries) {
        // For international mode, determine if this is the player's country or opponent
        const isPlayerTeam = teamId === playerTeamId;
        const nationalityToUse = isPlayerTeam ? playerCountryName : opponentCountryName;
        teamPlayersList = players.filter((p) => p.nationality === nationalityToUse);
        // Pick the highest rated player as captain
        captain = teamPlayersList.sort((a, b) =>
          (b.batting.technique + b.bowling.accuracy) - (a.batting.technique + a.bowling.accuracy)
        )[0]?.id || '';
      } else {
        const team = teams.find((t) => t.id === teamId);
        teamPlayersList = players.filter((p) => team?.squad.includes(p.id));
        captain = team?.captain || '';
      }

      return generateDefaultTactics(teamPlayersList, captain);
    },
    [teams, players, isInternationalMode, currentSeries, playerTeamId, playerCountryName, opponentCountryName]
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
      // Restore innings totals for Test cricket
      if (liveMatchState.inningsTotals) {
        setInningsTotals(liveMatchState.inningsTotals);
      }
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
  }, [match?.id, playerTactics]);

  // Save live match state whenever it changes (for persistence across refreshes)
  useEffect(() => {
    if (!match || !inningsState || matchEnded) return;

    saveLiveMatchState({
      matchId: match.id,
      currentInnings,
      inningsState: serializeInningsState(inningsState),
      firstInningsTotal,
      recentBalls,
      inningsTotals,  // Save Test cricket innings totals
    });
  }, [inningsState, currentInnings, firstInningsTotal, recentBalls, match?.id, matchEnded, inningsTotals]);

  // Simulate next over (async with backend fallback)
  const simulateNextOver = useCallback(async () => {
    if (!match || !inningsState || matchEnded || isLoading) return;

    setIsLoading(true);

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

    // Select bowler (with max overs limit based on format)
    const formatConfig = getFormatConfig(match.format || 't20');
    const MAX_OVERS_PER_BOWLER = formatConfig.maxOversPerBowler;
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

    // Fallback to smart automatic selection
    if (!bowler) {
      // Use smart bowler selection based on match context
      bowler = selectSmartBowler(bowlers, inningsState, lastBowlerId, MAX_OVERS_PER_BOWLER);

      // Final fallback if smart selection fails
      if (!bowler) {
        const stillAvailable = bowlers.filter(b => getBowlerOvers(b.id) < MAX_OVERS_PER_BOWLER);
        bowler = stillAvailable[0] || bowlers[0];
      }
    }

    if (!bowler) {
      setIsLoading(false);
      return;
    }

    // Target calculation:
    // - T20/ODI innings 2: chase the first innings total
    // - Test innings 1-3: no target (bat until all out)
    // - Test innings 4: chase the lead (handled separately in test4thInningsChaseComplete)
    const isTestFormat = match.format === 'test';
    const target = (!isTestFormat && currentInnings === 2) ? firstInningsTotal + 1 : null;

    // Get batting team in correct batting order (as per playingXI)
    const battingTeamInOrder = battingTactics.playingXI
      .map(id => battingTeamPlayers.find(p => p.id === id))
      .filter((p): p is Player => p !== undefined);

    // Try backend simulation, fall back to client
    let overSummary: OverSummary;
    let updatedInnings: InningsState;

    // Use the service which handles backend/client fallback internally
    try {
      const result = await backendSimulateOver({
        battingTeam: battingTeamInOrder,
        bowlingTeam: bowlingTeamPlayers.filter(p => bowlingTactics.playingXI.includes(p.id)),
        bowler,
        inningsState,
        tactics: battingTactics,
        pitch: match.pitch,
        target,
        bowlingLength: liveBowlingLength ?? undefined,
        fieldSetting: liveFieldSetting ?? undefined,
        totalOvers: formatConfig.totalOvers,
        maxOversPerBowler: formatConfig.maxOversPerBowler,
      });

      overSummary = result.overSummary;
      updatedInnings = result.updatedInnings;
    } catch (error) {
      console.error('Simulation failed:', error);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);

    // Debug: log the state update
    console.log('[DEBUG] Over simulation result:', {
      overNumber: overSummary.overNumber,
      runsScored: overSummary.runs,
      newOvers: updatedInnings.overs,
      newBalls: updatedInnings.balls,
      newRuns: updatedInnings.runs,
      newWickets: updatedInnings.wickets,
    });

    setLastOver(overSummary);
    setInningsState(updatedInnings);

    // Check innings end conditions based on format
    // isTestFormat already defined above for target calculation
    const totalInnings = isTestFormat ? 4 : 2;

    // For Test: innings ends on all out only (or declaration - not implemented yet)
    // For T20/ODI: innings ends on overs limit, all out, or target achieved
    const inningsEnded = isTestFormat
      ? updatedInnings.wickets >= 10
      : (updatedInnings.overs >= formatConfig.totalOvers ||
         updatedInnings.wickets >= 10 ||
         (currentInnings === 2 && updatedInnings.runs >= (firstInningsTotal + 1)));

    // For Test 4th innings: also check if target achieved
    const test4thInningsChaseComplete = isTestFormat && currentInnings === 4 && (() => {
      // Calculate target: Team A total (innings 1 + 3) - Team B innings 2 + 1
      const teamATotal = inningsTotals[0] + inningsTotals[2];
      const teamBInnings2 = inningsTotals[1];
      const target = teamATotal - teamBInnings2 + 1;
      return updatedInnings.runs >= target;
    })();

    if (inningsEnded || test4thInningsChaseComplete) {
      // Update innings totals for Test cricket
      if (isTestFormat) {
        const newTotals = [...inningsTotals] as [number, number, number, number];
        newTotals[currentInnings - 1] = updatedInnings.runs;
        setInningsTotals(newTotals);
      }

      if (currentInnings < totalInnings && !test4thInningsChaseComplete) {
        // Start next innings
        const nextInnings = (currentInnings + 1) as 1 | 2 | 3 | 4;

        // For T20/ODI: batting teams swap
        // For Test: innings 1&3 = same team, innings 2&4 = same team
        let newBattingTeam: string;
        let newBowlingTeam: string;

        if (isTestFormat) {
          // Test cricket: odd innings (1,3) = team that won toss, even innings (2,4) = other team
          // Get who batted first from innings 1 or current context
          const firstInningsBatter = match.innings1?.battingTeam || battingTeamId;
          const firstInningsBowler = match.innings1?.bowlingTeam || bowlingTeamId;

          if (nextInnings % 2 === 1) {
            // Odd innings (3rd) - same as 1st
            newBattingTeam = firstInningsBatter;
            newBowlingTeam = firstInningsBowler;
          } else {
            // Even innings (2nd, 4th) - opposite of 1st
            newBattingTeam = firstInningsBowler;
            newBowlingTeam = firstInningsBatter;
          }
        } else {
          // T20/ODI: just swap teams
          newBattingTeam = bowlingTeamId;
          newBowlingTeam = battingTeamId;
        }

        // For backwards compatibility with firstInningsTotal (used in 2-innings formats)
        if (currentInnings === 1) {
          setFirstInningsTotal(updatedInnings.runs);
        }

        setCurrentInnings(nextInnings);

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

        // Update match with completed innings
        const inningsKey = `innings${currentInnings}` as 'innings1' | 'innings2' | 'innings3' | 'innings4';
        updateMatch(match.id, {
          currentInnings: nextInnings,
          [inningsKey]: updatedInnings,
        });
      } else {
        // Match ended
        setMatchEnded(true);
        setIsSimulating(false);
        clearLiveMatchState(); // Clear persisted state

        // Update final innings totals for Test
        const finalInningsTotals = [...inningsTotals] as [number, number, number, number];
        finalInningsTotals[currentInnings - 1] = updatedInnings.runs;

        let winnerTeam: typeof teams[0] | undefined;
        let margin: string;

        if (isTestFormat) {
          // Test cricket: compare total runs across both innings for each team
          // Team A batted innings 1 & 3, Team B batted innings 2 & 4
          const teamAId = match.innings1?.battingTeam;
          const teamBId = match.innings1?.bowlingTeam;
          const teamA = teams.find((t) => t.id === teamAId);
          const teamB = teams.find((t) => t.id === teamBId);

          const teamATotal = finalInningsTotals[0] + finalInningsTotals[2];
          const teamBTotal = finalInningsTotals[1] + updatedInnings.runs;

          if (teamBTotal > teamATotal) {
            // Team B won in 4th innings
            winnerTeam = teamB;
            margin = `${10 - updatedInnings.wickets} wickets`;
          } else if (teamATotal > teamBTotal) {
            // Team A won
            winnerTeam = teamA;
            margin = `${teamATotal - teamBTotal} runs`;
          } else {
            // Tie (very rare in Tests, usually called a draw)
            winnerTeam = undefined;
            margin = 'Match Drawn';
          }
        } else {
          // T20/ODI: original 2-innings logic
          const team1 = teams.find((t) => t.id === match.innings1?.battingTeam);
          const team2 = teams.find((t) => t.id === updatedInnings.battingTeam);

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
        }

        // Get winner display name for international mode
        const winnerDisplayName = isInternationalMode
          ? (winnerTeam?.id === match.homeTeam ? homeTeamName : awayTeamName)
          : winnerTeam?.name;

        setResult({
          winner: winnerDisplayName || (isTestFormat ? 'Draw' : 'Tie'),
          margin: winnerTeam ? margin : (isTestFormat ? 'Match Drawn' : 'Match Tied'),
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

        // Save the final innings
        const finalInningsKey = `innings${currentInnings}` as 'innings1' | 'innings2' | 'innings3' | 'innings4';
        updateMatch(match.id, {
          status: 'completed',
          [finalInningsKey]: updatedInnings,
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
  }, [match, inningsState, currentInnings, firstInningsTotal, matchEnded, homePlayers, awayPlayers, selectedNextBowler, playerTeamId, isLoading, liveBowlingLength, liveFieldSetting, isInternationalMode, homeTeamName, awayTeamName]);

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

    // Get or select bowler (format-aware max overs per bowler)
    const formatConfig = getFormatConfig(match.format || 't20');
    const MAX_OVERS_PER_BOWLER = formatConfig.maxOversPerBowler;
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
        // Use smart bowler selection based on match context
        bowler = selectSmartBowler(bowlers, inningsState, lastBowlerId, MAX_OVERS_PER_BOWLER);

        // Final fallback if smart selection fails
        if (!bowler) {
          const stillAvailable = bowlers.filter(b => getBowlerOvers(b.id) < MAX_OVERS_PER_BOWLER);
          bowler = stillAvailable[0] || bowlers[0];
        }
      }
    }

    if (!bowler) return;

    // Calculate target based on format and innings
    const isTestFormat = match.format === 'test';
    let target: number | null = null;

    if (isTestFormat && currentInnings === 4) {
      // Test 4th innings: target = Team A total (innings 1+3) - Team B innings 2 + 1
      const teamATotal = inningsTotals[0] + inningsTotals[2];
      const teamBInnings2 = inningsTotals[1];
      target = teamATotal - teamBInnings2 + 1;
    } else if (!isTestFormat && currentInnings === 2) {
      // T20/ODI: target is first innings total + 1
      target = firstInningsTotal + 1;
    }

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
      target,
      formatConfig.totalOvers
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
      const totalInnings = isTestFormat ? 4 : 2;

      // Update innings totals for Test cricket
      if (isTestFormat) {
        const newTotals = [...inningsTotals] as [number, number, number, number];
        newTotals[currentInnings - 1] = updatedInnings.runs;
        setInningsTotals(newTotals);
      }

      // Check if 4th innings chase is complete
      const test4thInningsChaseComplete = isTestFormat && currentInnings === 4 &&
        target !== null && updatedInnings.runs >= target;

      if (currentInnings < totalInnings && !test4thInningsChaseComplete) {
        // Start next innings
        const nextInnings = (currentInnings + 1) as 1 | 2 | 3 | 4;

        // For backwards compatibility
        if (currentInnings === 1) {
          setFirstInningsTotal(updatedInnings.runs);
        }

        setCurrentInnings(nextInnings);
        setRecentBalls([]);

        // Determine batting teams based on format
        let newBattingTeam: string;
        let newBowlingTeam: string;

        if (isTestFormat) {
          // Test cricket: odd innings (1,3) = team that won toss, even innings (2,4) = other team
          const firstInningsBatter = match.innings1?.battingTeam || battingTeamId;
          const firstInningsBowler = match.innings1?.bowlingTeam || bowlingTeamId;

          if (nextInnings % 2 === 1) {
            newBattingTeam = firstInningsBatter;
            newBowlingTeam = firstInningsBowler;
          } else {
            newBattingTeam = firstInningsBowler;
            newBowlingTeam = firstInningsBatter;
          }
        } else {
          newBattingTeam = bowlingTeamId;
          newBowlingTeam = battingTeamId;
        }

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

        const inningsKey = `innings${currentInnings}` as 'innings1' | 'innings2' | 'innings3' | 'innings4';
        updateMatch(match.id, {
          currentInnings: nextInnings,
          [inningsKey]: updatedInnings,
        });
      } else {
        // Match ended - handle like simulateNextOver does
        handleMatchEnd(updatedInnings);
      }
    }

    return { newBatsmanNeeded, inningsComplete };
  }, [match, inningsState, currentInnings, firstInningsTotal, matchEnded, showNewBatsmanModal, homePlayers, awayPlayers, selectedNextBowler, playerTeamId, inningsTotals]);

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

    const isTestFormat = match.format === 'test';

    // Update final innings totals for Test
    const finalInningsTotals = [...inningsTotals] as [number, number, number, number];
    finalInningsTotals[currentInnings - 1] = updatedInnings.runs;

    let winnerTeam: typeof teams[0] | undefined;
    let margin: string;

    if (isTestFormat) {
      // Test cricket: compare total runs across both innings for each team
      const teamAId = match.innings1?.battingTeam;
      const teamBId = match.innings1?.bowlingTeam;
      const teamA = teams.find((t) => t.id === teamAId);
      const teamB = teams.find((t) => t.id === teamBId);

      const teamATotal = finalInningsTotals[0] + finalInningsTotals[2];
      const teamBTotal = finalInningsTotals[1] + updatedInnings.runs;

      if (teamBTotal > teamATotal) {
        winnerTeam = teamB;
        margin = `${10 - updatedInnings.wickets} wickets`;
      } else if (teamATotal > teamBTotal) {
        winnerTeam = teamA;
        margin = `${teamATotal - teamBTotal} runs`;
      } else {
        winnerTeam = undefined;
        margin = 'Match Drawn';
      }
    } else {
      // T20/ODI logic
      const team1 = teams.find((t) => t.id === match.innings1?.battingTeam);
      const team2 = teams.find((t) => t.id === updatedInnings.battingTeam);

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
    }

    // Get winner display name for international mode
    const winnerDisplayName = isInternationalMode
      ? (winnerTeam?.id === match.homeTeam ? homeTeamName : awayTeamName)
      : winnerTeam?.name;

    setResult({
      winner: winnerDisplayName || (isTestFormat ? 'Draw' : 'Tie'),
      margin: winnerTeam ? margin : (isTestFormat ? 'Match Drawn' : 'Match Tied'),
    });

    // Update points table for league matches only (not for Test internationals)
    if (match.matchType === 'league' && !isTestFormat) {
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

    // Save the final innings
    const finalInningsKey = `innings${currentInnings}` as 'innings1' | 'innings2' | 'innings3' | 'innings4';
    updateMatch(match.id, {
      status: 'completed',
      [finalInningsKey]: updatedInnings,
    });

    // Update player fatigue/form (same logic as simulateNextOver)
    updatePlayerStats(updatedInnings);
  }, [match, firstInningsTotal, pointsTable, teams, inningsState, isInternationalMode, homeTeamName, awayTeamName, currentInnings, inningsTotals]);

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

  // Declare innings (Test matches only)
  const declareInnings = useCallback(() => {
    if (!match || !inningsState || match.format !== 'test') return;
    if (matchEnded || currentInnings >= 4) return;

    // Only allow declaration if player's team is batting
    const isPlayerBatting = inningsState.battingTeam === playerTeamId;
    if (!isPlayerBatting) return;

    // Update innings totals
    const newTotals = [...inningsTotals] as [number, number, number, number];
    newTotals[currentInnings - 1] = inningsState.runs;
    setInningsTotals(newTotals);

    // Stop any auto simulation
    setIsSimulating(false);

    // Transition to next innings
    const nextInnings = (currentInnings + 1) as 1 | 2 | 3 | 4;

    // Get who batted first from innings 1
    const firstInningsBatter = match.innings1?.battingTeam || inningsState.battingTeam;
    const firstInningsBowler = match.innings1?.bowlingTeam || inningsState.bowlingTeam;

    let newBattingTeam: string;
    let newBowlingTeam: string;

    if (nextInnings % 2 === 1) {
      // Odd innings (3rd) - same as 1st
      newBattingTeam = firstInningsBatter;
      newBowlingTeam = firstInningsBowler;
    } else {
      // Even innings (2nd, 4th) - opposite of 1st
      newBattingTeam = firstInningsBowler;
      newBowlingTeam = firstInningsBatter;
    }

    const newBattingPlayers = newBattingTeam === match.homeTeam ? homePlayers : awayPlayers;
    const captain = newBattingPlayers.find(p => p.role === 'batsman' || p.role === 'allrounder') || newBattingPlayers[0];
    const newBattingTactics = newBattingTeam === match.homeTeam
      ? match.homeTactics || generateDefaultTactics(newBattingPlayers, captain?.id || newBattingPlayers[0]?.id)
      : match.awayTactics || generateDefaultTactics(newBattingPlayers, captain?.id || newBattingPlayers[0]?.id);

    // Initialize new innings
    const newInnings: InningsState = {
      battingTeam: newBattingTeam,
      bowlingTeam: newBowlingTeam,
      runs: 0,
      wickets: 0,
      overs: 0,
      balls: 0,
      overSummaries: [],
      fallOfWickets: [],
      batterStats: new Map(),
      bowlerStats: new Map(),
      currentBatters: [newBattingTactics.playingXI[0], newBattingTactics.playingXI[1]],
      currentBowler: '',
    };

    // Save current innings as declared
    const inningsKey = `innings${currentInnings}` as keyof typeof match;
    updateMatch(match.id, {
      [inningsKey]: {
        battingTeam: inningsState.battingTeam,
        bowlingTeam: inningsState.bowlingTeam,
        runs: inningsState.runs,
        wickets: inningsState.wickets,
        overs: inningsState.overs,
        declared: true,
      },
    });

    setCurrentInnings(nextInnings);
    setInningsState(newInnings);
    setLastOver(null);
    setRecentBalls([]);

    console.log(`[DECLARE] Innings ${currentInnings} declared at ${inningsState.runs}/${inningsState.wickets}`);
  }, [match, inningsState, currentInnings, matchEnded, playerTeamId, inningsTotals, homePlayers, awayPlayers, updateMatch]);

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

  // Display names for batting/bowling teams in international mode
  const battingTeamDisplayName = isInternationalMode
    ? (inningsState?.battingTeam === match?.homeTeam ? homeTeamName : awayTeamName)
    : battingTeam?.name;
  const bowlingTeamDisplayName = isInternationalMode
    ? (inningsState?.bowlingTeam === match?.homeTeam ? homeTeamName : awayTeamName)
    : bowlingTeam?.name;

  // Get current batters (exclude dismissed batters - defensive check)
  const dismissedPlayerIds = inningsState?.fallOfWickets.map(f => f.player) || [];
  const striker = inningsState
    ? players.find((p) => p.id === inningsState.currentBatters[0] && !dismissedPlayerIds.includes(p.id))
    : null;
  const nonStriker = inningsState
    ? players.find((p) => p.id === inningsState.currentBatters[1] && !dismissedPlayerIds.includes(p.id))
    : null;

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24 lg:pb-4">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-lg md:max-w-3xl lg:max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="animate-pulse bg-red-600 text-xs px-2 py-1 rounded">LIVE</span>
            <span className="text-sm text-gray-400">
              {homeTeamShortName} vs {awayTeamShortName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Test match: Day and Session indicator */}
            {match.format === 'test' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="bg-amber-600/80 text-white px-2 py-0.5 rounded text-xs font-medium">
                  Day {testDay}
                </span>
                <span className="text-amber-400 text-xs">
                  {testSession}
                </span>
              </div>
            )}
            <span className="text-sm text-gray-400">
              {currentInnings === 1 ? '1st Innings' :
               currentInnings === 2 ? '2nd Innings' :
               currentInnings === 3 ? '3rd Innings' : '4th Innings'}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-lg md:max-w-3xl lg:max-w-6xl mx-auto p-4 md:p-6">
        {/* Desktop: 3-column grid layout */}
        <div className="lg:grid lg:grid-cols-12 lg:gap-6">

        {/* Left Column (Desktop): Batting Info - hidden on mobile, shown on lg */}
        <div className="hidden lg:block lg:col-span-3 space-y-4">
          {/* Current Batters - Desktop Sidebar */}
          {striker && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm text-gray-400 mb-3">AT THE CREASE</h3>
              <div className="space-y-3">
                {(() => {
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
                    <div className="bg-gray-700/50 rounded-lg p-3">
                      <div className="font-medium text-blue-400">{striker.shortName}*</div>
                      <div className="text-2xl font-bold">{runs}<span className="text-gray-400 text-sm"> ({balls})</span></div>
                      <div className="text-xs text-gray-500">SR: {sr}</div>
                      {(fours > 0 || sixes > 0) && (
                        <div className="text-xs mt-1">
                          {fours > 0 && <span className="text-blue-400">{fours}×4</span>}
                          {fours > 0 && sixes > 0 && ' '}
                          {sixes > 0 && <span className="text-green-400">{sixes}×6</span>}
                        </div>
                      )}
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
                  return (
                    <div className="text-gray-400 text-sm">
                      <span>{nonStriker.shortName}</span>
                      <span className="ml-2">{runs} ({balls})</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Current Bowler - Desktop Sidebar */}
          {inningsState?.currentBowler && (() => {
            const currentBowler = players.find((p) => p.id === inningsState.currentBowler);
            const bowlerStatsMap = inningsState.bowlerStats;
            const bowlerStats = bowlerStatsMap instanceof Map
              ? bowlerStatsMap.get(inningsState.currentBowler)
              : undefined;
            if (!currentBowler) return null;
            const overs = bowlerStats?.overs ?? 0;
            const runsGiven = bowlerStats?.runs ?? 0;
            const wicketsTaken = bowlerStats?.wickets ?? 0;
            const economy = overs > 0 ? (runsGiven / overs).toFixed(2) : '0.00';
            const maxOvers = getFormatConfig(match.format || 't20').maxOversPerBowler;
            return (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm text-gray-400 mb-2">BOWLING</h3>
                <div className="font-medium text-purple-400">{currentBowler.shortName}</div>
                <div className="text-xl font-bold">{wicketsTaken}-{runsGiven}</div>
                <div className="text-xs text-gray-500">{overs}/{maxOvers} ov • Econ: {economy}</div>
              </div>
            );
          })()}
        </div>

        {/* Center Column: Main Score & Controls */}
        <div className="lg:col-span-6 space-y-4">

        {/* Score Card */}
        <div className="bg-gray-800 rounded-xl p-4 md:p-6 border border-gray-700 text-center">
          <h2 className="text-lg text-gray-400 mb-2">
            {battingTeamDisplayName || 'Team'} Batting
          </h2>

          <div className="text-5xl font-bold mb-2">
            {inningsState?.runs || 0}-{inningsState?.wickets || 0}
          </div>

          <div className="text-xl text-gray-400 mb-4">
            {Math.floor(inningsState?.overs || 0)}.
            {((inningsState?.balls || 0) % 6)} overs
          </div>

          {/* Chase display for T20/ODI 2nd innings or Test 4th innings */}
          {(() => {
            const isTestFormat = match.format === 'test';
            const isChaseInnings = (!isTestFormat && currentInnings === 2) ||
                                   (isTestFormat && currentInnings === 4);

            if (!isChaseInnings) return null;

            // Calculate target
            let target: number;
            if (isTestFormat) {
              // Test 4th innings: Team A (innings 1+3) - Team B innings 2 + 1
              target = (inningsTotals[0] + inningsTotals[2]) - inningsTotals[1] + 1;
            } else {
              target = firstInningsTotal + 1;
            }

            const runsNeeded = target - (inningsState?.runs || 0);
            const targetReached = (inningsState?.runs || 0) >= target;

            return (
              <>
                <div className="text-lg">
                  {targetReached ? (
                    <span className="text-green-400">Target reached!</span>
                  ) : isTestFormat ? (
                    <span className="text-blue-400">
                      Need {runsNeeded} runs to win
                    </span>
                  ) : (
                    <span className="text-blue-400">
                      Need {runsNeeded} runs from{' '}
                      {getFormatConfig(match.format || 't20').totalOvers * 6 - (Math.floor(inningsState?.overs || 0) * 6 + (inningsState?.balls || 0))} balls
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  Target: {target}
                </div>
              </>
            );
          })()}

          {/* Test match status (lead/trail) for innings 1-3 */}
          {match.format === 'test' && currentInnings < 4 && currentInnings > 1 && (() => {
            // Calculate current team's position
            const currentRuns = inningsState?.runs || 0;
            const currentTeamId = inningsState?.battingTeam;

            // Team A batted in innings 1 & 3, Team B in innings 2 & 4
            const teamAId = match.innings1?.battingTeam;
            const teamBId = match.innings1?.bowlingTeam;
            const isCurrentTeamA = currentTeamId === teamAId;

            let teamATotal = inningsTotals[0];
            let teamBTotal = inningsTotals[1];

            // Add current innings to the appropriate team
            if (currentInnings === 2) {
              teamBTotal = currentRuns;
            } else if (currentInnings === 3) {
              teamATotal = inningsTotals[0] + currentRuns;
            }

            const diff = isCurrentTeamA ? teamATotal - teamBTotal : teamBTotal - teamATotal;

            return (
              <div className="mt-2 text-sm">
                {diff > 0 ? (
                  <span className="text-green-400">Lead by {diff} runs</span>
                ) : diff < 0 ? (
                  <span className="text-yellow-400">Trail by {Math.abs(diff)} runs</span>
                ) : (
                  <span className="text-gray-400">Scores level</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Current Batters - Mobile/Tablet only */}
        {striker && (
          <div className="lg:hidden bg-gray-800 rounded-xl p-4 border border-gray-700">
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
              {nonStriker ? (() => {
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
              })() : (
                <div className="flex justify-between items-center text-gray-500">
                  <span className="italic">Awaiting partner...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current Bowler - Mobile/Tablet only */}
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
          const maxOvers = getFormatConfig(match.format || 't20').maxOversPerBowler;
          return (
            <div className="lg:hidden bg-gray-800 rounded-xl p-3 border border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm text-gray-400">BOWLING: </span>
                  <span className="font-medium">{currentBowler.shortName}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold">{wicketsTaken}-{runsGiven}</span>
                  <span className="text-gray-400 text-sm"> ({overs}/{maxOvers} ov)</span>
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
                    const maxOversForFormat = getFormatConfig(match.format || 't20').maxOversPerBowler;
                    const isMaxedOut = stats.overs >= maxOversForFormat;

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

        {/* Manhattan Chart Toggle - Only for limited overs */}
        {match?.format !== 'test' && inningsState && inningsState.overSummaries.length > 0 && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <button
              onClick={() => setShowManhattan(!showManhattan)}
              className="w-full p-3 flex justify-between items-center text-left hover:bg-gray-700/50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-300">📊 Manhattan Chart</span>
              <span className="text-gray-500 text-xs">{showManhattan ? '▼' : '▶'}</span>
            </button>

            {showManhattan && (
              <div className="p-4 border-t border-gray-700">
                {/* Run Rate Summary */}
                <div className="flex justify-between text-xs text-gray-400 mb-3">
                  <span>Overs: {inningsState.overs}</span>
                  <span>Run Rate: {inningsState.overs > 0 ? (inningsState.runs / inningsState.overs).toFixed(2) : '0.00'}</span>
                  {match?.format === 't20' && inningsState.overs > 0 && (
                    <span>Proj: {Math.round((inningsState.runs / inningsState.overs) * 20)}</span>
                  )}
                  {match?.format === 'odi' && inningsState.overs > 0 && (
                    <span>Proj: {Math.round((inningsState.runs / inningsState.overs) * 50)}</span>
                  )}
                </div>

                {/* Manhattan Bars */}
                <div className="flex items-end gap-0.5 h-24 overflow-x-auto pb-2">
                  {inningsState.overSummaries.map((over, idx) => {
                    const maxRuns = Math.max(...inningsState.overSummaries.map(o => o.runs), 12);
                    const height = Math.max(4, (over.runs / maxRuns) * 100);
                    const isWicket = over.wickets > 0;

                    return (
                      <div key={idx} className="flex flex-col items-center min-w-[16px]">
                        <div
                          className={`w-3 rounded-t transition-all ${
                            isWicket
                              ? 'bg-red-500'
                              : over.runs >= 10
                              ? 'bg-green-500'
                              : over.runs >= 6
                              ? 'bg-blue-500'
                              : 'bg-gray-600'
                          }`}
                          style={{ height: `${height}%` }}
                          title={`Over ${over.overNumber + 1}: ${over.runs} runs${isWicket ? `, ${over.wickets} wkt` : ''}`}
                        />
                        <span className="text-[8px] text-gray-500 mt-1">{over.overNumber + 1}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded"></span> 10+ runs
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-500 rounded"></span> 6-9 runs
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded"></span> Wicket
                  </span>
                </div>

                {/* Phase Breakdown */}
                {inningsState.overSummaries.length >= 6 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      {(() => {
                        const powerplay = inningsState.overSummaries.slice(0, 6);
                        const middle = match?.format === 't20'
                          ? inningsState.overSummaries.slice(6, 15)
                          : inningsState.overSummaries.slice(10, 40);
                        const death = match?.format === 't20'
                          ? inningsState.overSummaries.slice(15)
                          : inningsState.overSummaries.slice(40);

                        const ppRuns = powerplay.reduce((sum, o) => sum + o.runs, 0);
                        const ppWkts = powerplay.reduce((sum, o) => sum + o.wickets, 0);
                        const midRuns = middle.reduce((sum, o) => sum + o.runs, 0);
                        const midWkts = middle.reduce((sum, o) => sum + o.wickets, 0);
                        const deathRuns = death.reduce((sum, o) => sum + o.runs, 0);
                        const deathWkts = death.reduce((sum, o) => sum + o.wickets, 0);

                        return (
                          <>
                            <div className="bg-gray-700/50 rounded p-2">
                              <div className="text-gray-400 text-[10px]">Powerplay</div>
                              <div className="font-medium">{ppRuns}/{ppWkts}</div>
                              <div className="text-gray-500 text-[10px]">RR: {powerplay.length > 0 ? (ppRuns / powerplay.length).toFixed(1) : '-'}</div>
                            </div>
                            <div className="bg-gray-700/50 rounded p-2">
                              <div className="text-gray-400 text-[10px]">Middle</div>
                              <div className="font-medium">{midRuns}/{midWkts}</div>
                              <div className="text-gray-500 text-[10px]">RR: {middle.length > 0 ? (midRuns / middle.length).toFixed(1) : '-'}</div>
                            </div>
                            <div className="bg-gray-700/50 rounded p-2">
                              <div className="text-gray-400 text-[10px]">Death</div>
                              <div className="font-medium">{deathRuns}/{deathWkts}</div>
                              <div className="text-gray-500 text-[10px]">RR: {death.length > 0 ? (deathRuns / death.length).toFixed(1) : '-'}</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
              const formatConfig = getFormatConfig(match?.format || 't20');
              const MAX_OVERS = formatConfig.maxOversPerBowler;

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
                disabled={isSimulating || isLoading}
                className={`flex-1 py-3 rounded-lg font-medium text-sm disabled:opacity-50
                  ${isLoading ? 'bg-gray-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {isLoading ? 'Simulating...' : 'Next Ball'}
              </button>
              <button
                onClick={() => {
                  setSimMode('wicket');
                  setIsSimulating(true);
                }}
                disabled={isSimulating || isLoading}
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
                disabled={isLoading}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50
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
                disabled={isSimulating || isLoading}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors disabled:opacity-50
                  ${isLoading ? 'bg-gray-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {isLoading ? 'Simulating...' : 'Next Over'}
              </button>
            </div>

            {/* Declare Innings (Test only, when player's team is batting) */}
            {match.format === 'test' &&
             inningsState?.battingTeam === playerTeamId &&
             currentInnings < 4 &&
             inningsState.runs >= 100 && (
              <button
                onClick={declareInnings}
                disabled={isSimulating || isLoading}
                className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded-lg font-medium transition-colors border border-amber-500"
              >
                Declare Innings ({inningsState.runs}/{inningsState.wickets})
              </button>
            )}
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

        </div> {/* End Center Column */}

        {/* Right Column (Desktop): Scorecard always visible */}
        <div className="hidden lg:block lg:col-span-3 space-y-4">
          {/* Mini Scorecard - Always visible on desktop */}
          {inningsState && (() => {
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

            const battingOrder = battingTactics?.playingXI || [];

            const getBatterStats = (playerId: string) => {
              if (inningsState.batterStats instanceof Map) {
                return inningsState.batterStats.get(playerId);
              } else if (inningsState.batterStats && typeof inningsState.batterStats === 'object') {
                return (inningsState.batterStats as Record<string, { runs: number; balls: number; fours: number; sixes: number }>)[playerId];
              }
              return undefined;
            };

            const getBowlerStats = (bowlerId: string) => {
              if (inningsState.bowlerStats instanceof Map) {
                return inningsState.bowlerStats.get(bowlerId);
              } else if (inningsState.bowlerStats && typeof inningsState.bowlerStats === 'object') {
                return (inningsState.bowlerStats as Record<string, { overs: number; runs: number; wickets: number; dots: number }>)[bowlerId];
              }
              return undefined;
            };

            const dismissedBatters = inningsState.fallOfWickets.map(fow => fow.player);
            const allBowlers = bowlingTeamPlayers.filter(p =>
              (p.role === 'bowler' || p.role === 'allrounder') &&
              bowlingTactics?.playingXI.includes(p.id)
            );

            return (
              <>
                {/* Batting Card */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">BATTING</h3>
                  <div className="space-y-1 text-xs">
                    {battingOrder.slice(0, 7).map((playerId) => {
                      const player = players.find(p => p.id === playerId);
                      const stats = getBatterStats(playerId);
                      const isDismissed = dismissedBatters.includes(playerId);
                      const isCurrentBatter = inningsState.currentBatters.includes(playerId);
                      const isStriker = playerId === inningsState.currentBatters[0];
                      const hasBatted = stats || isCurrentBatter || isDismissed;

                      if (!hasBatted) return null;

                      const runs = stats?.runs ?? 0;
                      const balls = stats?.balls ?? 0;

                      return (
                        <div
                          key={playerId}
                          className={`flex justify-between ${
                            isDismissed ? 'text-gray-500' : isCurrentBatter ? 'text-white' : 'text-gray-400'
                          }`}
                        >
                          <span className="truncate max-w-[100px]">
                            {player?.shortName}{isStriker && '*'}
                          </span>
                          <span>{runs} ({balls})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bowling Card */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h3 className="text-sm font-semibold text-purple-400 mb-3">BOWLING</h3>
                  <div className="space-y-1 text-xs">
                    {allBowlers.map((bowler) => {
                      const stats = getBowlerStats(bowler.id);
                      if (!stats || stats.overs === 0) return null;

                      return (
                        <div key={bowler.id} className="flex justify-between text-gray-300">
                          <span className="truncate max-w-[100px]">{bowler.shortName}</span>
                          <span>{stats.wickets}-{stats.runs} ({stats.overs})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Partnerships */}
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h3 className="text-sm font-semibold text-green-400 mb-2">PARTNERSHIPS</h3>
                  <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                    {(() => {
                      const partnerships: { wicket: number; runs: number; current: boolean }[] = [];
                      const fow = inningsState.fallOfWickets;

                      // Calculate past partnerships
                      fow.forEach((f, idx) => {
                        const prevRuns = idx === 0 ? 0 : fow[idx - 1].runs;
                        partnerships.push({
                          wicket: idx + 1,
                          runs: f.runs - prevRuns,
                          current: false,
                        });
                      });

                      // Current partnership
                      const lastFowRuns = fow.length > 0 ? fow[fow.length - 1].runs : 0;
                      const currentPartnership = inningsState.runs - lastFowRuns;
                      if (currentPartnership > 0 || fow.length === 0) {
                        partnerships.push({
                          wicket: fow.length + 1,
                          runs: currentPartnership,
                          current: true,
                        });
                      }

                      return partnerships.map((p, idx) => (
                        <div
                          key={idx}
                          className={`flex justify-between ${p.current ? 'text-green-400 font-medium' : 'text-gray-400'}`}
                        >
                          <span>{p.wicket === 1 ? '1st' : p.wicket === 2 ? '2nd' : p.wicket === 3 ? '3rd' : `${p.wicket}th`} wkt</span>
                          <span>{p.runs} runs{p.current ? '*' : ''}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Fall of Wickets */}
                {inningsState.fallOfWickets.length > 0 && (
                  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                    <h3 className="text-sm font-semibold text-red-400 mb-2">FALL OF WICKETS</h3>
                    <div className="text-xs text-gray-400 space-y-1 max-h-32 overflow-y-auto">
                      {inningsState.fallOfWickets.map((fow, idx) => {
                        const player = players.find(p => p.id === fow.player);
                        return (
                          <div key={idx}>
                            {fow.runs}/{idx + 1} ({player?.shortName}, {fow.overs} ov)
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        </div> {/* End Grid */}
      </div>
    </div>
  );
};
