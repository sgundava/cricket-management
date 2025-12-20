import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { InningsState } from '../types';

type Filter = 'all' | 'your' | 'upcoming' | 'completed';

export const ScheduleScreen = () => {
  const {
    fixtures,
    teams,
    players,
    playerTeamId,
    pointsTable,
    navigateTo,
    selectMatch,
  } = useGameStore();

  const [filter, setFilter] = useState<Filter>('your');
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [showScorecard, setShowScorecard] = useState<string | null>(null);

  const playerTeam = teams.find((t) => t.id === playerTeamId);

  // Helper to get stats from Map or Object (handles JSON deserialization)
  type BatterStats = { runs: number; balls: number; fours: number; sixes: number };
  type BowlerStats = { overs: number; runs: number; wickets: number; dots: number };

  const getBatterStats = (innings: InningsState | null): [string, BatterStats][] => {
    if (!innings?.batterStats) return [];
    if (innings.batterStats instanceof Map) {
      return Array.from(innings.batterStats.entries()) as [string, BatterStats][];
    }
    return Object.entries(innings.batterStats) as [string, BatterStats][];
  };

  const getBowlerStats = (innings: InningsState | null): [string, BowlerStats][] => {
    if (!innings?.bowlerStats) return [];
    if (innings.bowlerStats instanceof Map) {
      return Array.from(innings.bowlerStats.entries()) as [string, BowlerStats][];
    }
    return Object.entries(innings.bowlerStats) as [string, BowlerStats][];
  };

  // Filter fixtures
  const filteredFixtures = fixtures.filter((m) => {
    if (filter === 'your') {
      return m.homeTeam === playerTeamId || m.awayTeam === playerTeamId;
    }
    if (filter === 'upcoming') {
      return m.status === 'upcoming';
    }
    if (filter === 'completed') {
      return m.status === 'completed';
    }
    return true;
  });

  // Sort by match number
  const sortedFixtures = [...filteredFixtures].sort((a, b) => a.matchNumber - b.matchNumber);

  // Get opponent stats for scouting
  const getOpponentStats = (opponentId: string) => {
    const opponent = teams.find((t) => t.id === opponentId);
    if (!opponent) return null;

    const opponentPlayers = players.filter((p) => opponent.squad.includes(p.id));

    // Get recent results
    const opponentMatches = fixtures
      .filter((m) => m.status === 'completed' && (m.homeTeam === opponentId || m.awayTeam === opponentId))
      .slice(-3);

    const recentResults = opponentMatches.map((m) => {
      if (!m.innings1 || !m.innings2) return 'unknown';
      const chaseSuccessful = m.innings2.runs >= m.innings1.runs + 1;
      if (chaseSuccessful) {
        return m.innings2.battingTeam === opponentId ? 'W' : 'L';
      } else {
        return m.innings1.battingTeam === opponentId ? 'W' : 'L';
      }
    });

    // Get top performer (highest form)
    const topBatter = opponentPlayers
      .filter((p) => p.role === 'batsman' || p.role === 'allrounder' || p.role === 'keeper')
      .sort((a, b) => b.form - a.form)[0];

    const topBowler = opponentPlayers
      .filter((p) => p.role === 'bowler' || p.role === 'allrounder')
      .sort((a, b) => b.form - a.form)[0];

    // Get points table entry
    const tableEntry = pointsTable.find((e) => e.teamId === opponentId);

    return {
      team: opponent,
      recentResults,
      topBatter,
      topBowler,
      tableEntry,
      avgMorale: Math.round(opponentPlayers.reduce((sum, p) => sum + p.morale, 0) / opponentPlayers.length),
    };
  };

  const handleMatchClick = (matchId: string) => {
    if (selectedFixtureId === matchId) {
      setSelectedFixtureId(null);
    } else {
      setSelectedFixtureId(matchId);
    }
  };

  const handlePrepareMatch = (matchId: string) => {
    selectMatch(matchId);
    navigateTo('match-prep');
  };

  const getMatchTypeLabel = (matchType: string) => {
    const labels: Record<string, string> = {
      league: 'League',
      qualifier1: 'Qualifier 1',
      eliminator: 'Eliminator',
      qualifier2: 'Qualifier 2',
      final: 'Final',
    };
    return labels[matchType] || matchType;
  };

  const getResultString = (match: typeof fixtures[0]) => {
    if (match.status !== 'completed' || !match.innings1 || !match.innings2) return null;

    const chaseSuccessful = match.innings2.runs >= match.innings1.runs + 1;
    const winnerId = chaseSuccessful ? match.innings2.battingTeam : match.innings1.battingTeam;
    const winner = teams.find((t) => t.id === winnerId);

    if (chaseSuccessful) {
      const wicketsLeft = 10 - match.innings2.wickets;
      return `${winner?.shortName} won by ${wicketsLeft} wickets`;
    } else {
      const runDiff = match.innings1.runs - match.innings2.runs;
      return `${winner?.shortName} won by ${runDiff} runs`;
    }
  };

  // Sorted points table
  const sortedTable = [...pointsTable].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netRunRate - a.netRunRate;
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold">Schedule</h1>
          <p className="text-sm text-gray-400">{playerTeam?.name}</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(['your', 'all', 'upcoming', 'completed'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {f === 'your' ? 'Your Matches' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Points Table (Collapsible) */}
        <details className="bg-gray-800 rounded-xl border border-gray-700">
          <summary className="p-4 cursor-pointer text-sm font-semibold text-gray-400 hover:text-gray-200">
            POINTS TABLE
          </summary>
          <div className="px-4 pb-4">
            {/* Header Row */}
            <div className="flex items-center justify-between px-2 py-1 text-xs text-gray-500 border-b border-gray-700 mb-2">
              <div className="flex items-center gap-3">
                <span className="w-4">#</span>
                <span className="w-12">Team</span>
              </div>
              <div className="flex items-center gap-2 text-right">
                <span className="w-6">P</span>
                <span className="w-6">W</span>
                <span className="w-6">L</span>
                <span className="w-12">NRR</span>
                <span className="w-8">Pts</span>
              </div>
            </div>
            <div className="space-y-1">
              {sortedTable.map((entry, index) => {
                const team = teams.find((t) => t.id === entry.teamId);
                const isPlayerTeam = entry.teamId === playerTeamId;
                const nrrDisplay = entry.netRunRate >= 0
                  ? `+${entry.netRunRate.toFixed(2)}`
                  : entry.netRunRate.toFixed(2);
                const nrrColor = entry.netRunRate >= 0 ? 'text-green-400' : 'text-red-400';

                return (
                  <div
                    key={entry.teamId}
                    className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                      isPlayerTeam ? 'bg-blue-900/30 border border-blue-800/50' : 'bg-gray-700/30'
                    } ${index === 3 ? 'border-b-2 border-dashed border-gray-600' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-4 text-sm ${index < 4 ? 'text-green-400 font-bold' : 'text-gray-500'}`}>
                        {index + 1}
                      </span>
                      <span className={`w-12 text-sm ${
                        isPlayerTeam ? 'text-blue-400 font-bold' :
                        index < 4 ? 'font-semibold' : ''
                      }`}>
                        {team?.shortName}
                      </span>
                    </div>
                    <div className={`flex items-center gap-2 text-sm text-right ${index < 4 ? 'font-medium' : ''}`}>
                      <span className="w-6 text-gray-400">{entry.played}</span>
                      <span className="w-6 text-green-400">{entry.won}</span>
                      <span className="w-6 text-red-400">{entry.lost}</span>
                      <span className={`w-12 text-xs ${nrrColor}`}>{nrrDisplay}</span>
                      <span className={`w-8 ${index < 4 ? 'font-bold text-green-400' : 'font-bold'}`}>{entry.points}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </details>

        {/* Fixtures List */}
        <div className="space-y-3">
          {sortedFixtures.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No matches found</div>
          ) : (
            sortedFixtures.map((match) => {
              const homeTeam = teams.find((t) => t.id === match.homeTeam);
              const awayTeam = teams.find((t) => t.id === match.awayTeam);
              const isPlayerMatch = match.homeTeam === playerTeamId || match.awayTeam === playerTeamId;
              const isExpanded = selectedFixtureId === match.id;
              const opponentId = match.homeTeam === playerTeamId ? match.awayTeam : match.homeTeam;
              const opponentStats = isPlayerMatch && isExpanded ? getOpponentStats(opponentId) : null;
              const isPlayoff = match.matchType !== 'league';

              return (
                <div
                  key={match.id}
                  className={`rounded-xl border overflow-hidden ${
                    isPlayoff
                      ? 'bg-purple-900/20 border-purple-700'
                      : isPlayerMatch
                      ? 'bg-gray-800 border-blue-700/50'
                      : 'bg-gray-800 border-gray-700'
                  }`}
                >
                  {/* Match Header */}
                  <button
                    onClick={() => handleMatchClick(match.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-xs ${isPlayoff ? 'text-purple-400' : 'text-gray-400'}`}>
                        {getMatchTypeLabel(match.matchType)} #{match.matchNumber}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        match.status === 'completed'
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-blue-900/50 text-blue-400'
                      }`}>
                        {match.status === 'completed' ? 'Completed' : 'Upcoming'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: homeTeam?.colors.primary }}
                        >
                          {homeTeam?.shortName}
                        </div>
                        <span className={`text-sm ${match.homeTeam === playerTeamId ? 'text-blue-400 font-medium' : ''}`}>
                          {homeTeam?.shortName}
                        </span>
                      </div>

                      <span className="text-gray-500 text-sm">vs</span>

                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${match.awayTeam === playerTeamId ? 'text-blue-400 font-medium' : ''}`}>
                          {awayTeam?.shortName}
                        </span>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: awayTeam?.colors.primary }}
                        >
                          {awayTeam?.shortName}
                        </div>
                      </div>
                    </div>

                    {/* Result if completed */}
                    {match.status === 'completed' && (
                      <div className="text-center text-sm text-gray-400 mt-2">
                        {getResultString(match)}
                      </div>
                    )}

                    {/* Scores if completed */}
                    {match.status === 'completed' && match.innings1 && match.innings2 && (
                      <div className="flex justify-between text-sm mt-2 text-gray-300">
                        <span>
                          {match.innings1.battingTeam === match.homeTeam
                            ? `${match.innings1.runs}/${match.innings1.wickets}`
                            : `${match.innings2.runs}/${match.innings2.wickets}`}
                        </span>
                        <span>
                          {match.innings1.battingTeam === match.awayTeam
                            ? `${match.innings1.runs}/${match.innings1.wickets}`
                            : `${match.innings2.runs}/${match.innings2.wickets}`}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* View Scorecard Button for completed matches */}
                  {match.status === 'completed' && match.innings1 && match.innings2 && (
                    <div className="px-4 pb-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowScorecard(match.id);
                        }}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
                      >
                        View Scorecard
                      </button>
                    </div>
                  )}

                  {/* Expanded Opponent Scouting */}
                  {isExpanded && isPlayerMatch && opponentStats && match.status === 'upcoming' && (
                    <div className="px-4 pb-4 border-t border-gray-700">
                      <h4 className="text-xs text-gray-400 mt-3 mb-2">OPPONENT SCOUTING</h4>

                      {/* Recent Form */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-gray-500">Recent:</span>
                        <div className="flex gap-1">
                          {opponentStats.recentResults.length > 0 ? (
                            opponentStats.recentResults.map((r, i) => (
                              <span
                                key={i}
                                className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                                  r === 'W' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                                }`}
                              >
                                {r}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">No matches yet</span>
                          )}
                        </div>
                        {opponentStats.tableEntry && (
                          <span className="text-xs text-gray-500 ml-auto">
                            {opponentStats.tableEntry.won}W {opponentStats.tableEntry.lost}L
                          </span>
                        )}
                      </div>

                      {/* Key Players */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {opponentStats.topBatter && (
                          <div className="bg-gray-700/50 rounded p-2">
                            <div className="text-xs text-gray-400">Top Batter</div>
                            <div className="text-sm">{opponentStats.topBatter.shortName}</div>
                            <div className={`text-xs ${opponentStats.topBatter.form > 5 ? 'text-green-400' : opponentStats.topBatter.form < -5 ? 'text-red-400' : 'text-gray-400'}`}>
                              Form: {opponentStats.topBatter.form > 0 ? '+' : ''}{opponentStats.topBatter.form}
                            </div>
                          </div>
                        )}
                        {opponentStats.topBowler && (
                          <div className="bg-gray-700/50 rounded p-2">
                            <div className="text-xs text-gray-400">Top Bowler</div>
                            <div className="text-sm">{opponentStats.topBowler.shortName}</div>
                            <div className={`text-xs ${opponentStats.topBowler.form > 5 ? 'text-green-400' : opponentStats.topBowler.form < -5 ? 'text-red-400' : 'text-gray-400'}`}>
                              Form: {opponentStats.topBowler.form > 0 ? '+' : ''}{opponentStats.topBowler.form}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Prepare Button */}
                      <button
                        onClick={() => handlePrepareMatch(match.id)}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Prepare for Match
                      </button>
                    </div>
                  )}

                  {/* Expand hint for upcoming player matches */}
                  {!isExpanded && isPlayerMatch && match.status === 'upcoming' && (
                    <div className="px-4 pb-2 text-center">
                      <span className="text-xs text-gray-500">Tap to scout opponent</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Scorecard Modal */}
        {showScorecard && (() => {
          const match = fixtures.find(m => m.id === showScorecard);
          if (!match || !match.innings1 || !match.innings2) return null;

          const homeTeam = teams.find(t => t.id === match.homeTeam);
          const awayTeam = teams.find(t => t.id === match.awayTeam);
          const innings1Team = teams.find(t => t.id === match.innings1?.battingTeam);
          const innings2Team = teams.find(t => t.id === match.innings2?.battingTeam);

          return (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center">
                  <div>
                    <h2 className="font-bold">{homeTeam?.shortName} vs {awayTeam?.shortName}</h2>
                    <p className="text-sm text-gray-400">{getResultString(match)}</p>
                  </div>
                  <button
                    onClick={() => setShowScorecard(null)}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="p-4 space-y-6">
                  {/* First Innings */}
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: innings1Team?.colors.primary }}
                      >
                        {innings1Team?.shortName?.charAt(0)}
                      </div>
                      {innings1Team?.shortName} - {match.innings1.runs}/{match.innings1.wickets}
                      <span className="text-sm text-gray-400">({match.innings1.overs} ov)</span>
                    </h3>

                    {/* Batting */}
                    <div className="bg-gray-700/50 rounded-lg p-3 mb-2">
                      <div className="text-xs text-gray-400 mb-2">BATTING</div>
                      <div className="space-y-1 text-sm">
                        {(() => {
                          const batterEntries = getBatterStats(match.innings1);
                          const battedPlayerIds = new Set(batterEntries.map(([id]) => id));
                          const battingTeamId = match.innings1?.battingTeam;

                          // Get playing XI from tactics, fall back to squad
                          const isHomeTeamBatting = battingTeamId === match.homeTeam;
                          const tactics = isHomeTeamBatting ? match.homeTactics : match.awayTactics;
                          const playingXI = tactics?.playingXI || [];

                          // Fall back to squad if no tactics
                          const battingTeam = teams.find(t => t.id === battingTeamId);
                          const xiPlayerIds = playingXI.length > 0
                            ? playingXI
                            : (battingTeam?.squad.slice(0, 11) || []);

                          // Also include players from fallOfWickets who might not have stats
                          const fallOfWickets = match.innings1?.fallOfWickets || [];
                          const outPlayerIds = new Set(fallOfWickets.map(fow => fow.player));

                          // Combine: batted + got out = all who participated
                          const participatedIds = new Set([...battedPlayerIds, ...outPlayerIds]);

                          // Players who didn't bat = in XI but didn't participate
                          const didNotBatIds = xiPlayerIds.filter(id => !participatedIds.has(id));

                          return (
                            <>
                              {batterEntries.map(([playerId, stats]) => {
                                const player = players.find(p => p.id === playerId);
                                const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(0) : '0';
                                return (
                                  <div key={playerId} className="flex justify-between">
                                    <span className="text-gray-300">{player?.shortName || 'Unknown'}</span>
                                    <span>
                                      {stats.runs} ({stats.balls})
                                      <span className="text-gray-500 text-xs ml-1">SR {sr}</span>
                                    </span>
                                  </div>
                                );
                              })}
                              {didNotBatIds.map(playerId => {
                                const player = players.find(p => p.id === playerId);
                                return (
                                  <div key={playerId} className="flex justify-between text-gray-600">
                                    <span>{player?.shortName || 'Unknown'}</span>
                                    <span className="text-xs italic">did not bat</span>
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Bowling */}
                    <div className="bg-gray-700/50 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-2">BOWLING</div>
                      <div className="space-y-1 text-sm">
                        {getBowlerStats(match.innings1).map(([playerId, stats]) => {
                          const player = players.find(p => p.id === playerId);
                          const econ = stats.overs > 0 ? (stats.runs / stats.overs).toFixed(1) : '0.0';
                          return (
                            <div key={playerId} className="flex justify-between">
                              <span className="text-gray-300">{player?.shortName || 'Unknown'}</span>
                              <span>
                                {stats.wickets}/{stats.runs} ({stats.overs} ov)
                                <span className="text-gray-500 text-xs ml-1">Econ {econ}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Second Innings */}
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: innings2Team?.colors.primary }}
                      >
                        {innings2Team?.shortName?.charAt(0)}
                      </div>
                      {innings2Team?.shortName} - {match.innings2.runs}/{match.innings2.wickets}
                      <span className="text-sm text-gray-400">
                        ({match.innings2.overs}{match.innings2.balls > 0 ? `.${match.innings2.balls}` : ''} ov)
                      </span>
                    </h3>

                    {/* Batting */}
                    <div className="bg-gray-700/50 rounded-lg p-3 mb-2">
                      <div className="text-xs text-gray-400 mb-2">BATTING</div>
                      <div className="space-y-1 text-sm">
                        {(() => {
                          const batterEntries = getBatterStats(match.innings2);
                          const battedPlayerIds = new Set(batterEntries.map(([id]) => id));
                          const battingTeamId = match.innings2?.battingTeam;

                          // Get playing XI from tactics, fall back to squad
                          const isHomeTeamBatting = battingTeamId === match.homeTeam;
                          const tactics = isHomeTeamBatting ? match.homeTactics : match.awayTactics;
                          const playingXI = tactics?.playingXI || [];

                          // Fall back to squad if no tactics
                          const battingTeam = teams.find(t => t.id === battingTeamId);
                          const xiPlayerIds = playingXI.length > 0
                            ? playingXI
                            : (battingTeam?.squad.slice(0, 11) || []);

                          // Also include players from fallOfWickets who might not have stats
                          const fallOfWickets = match.innings2?.fallOfWickets || [];
                          const outPlayerIds = new Set(fallOfWickets.map(fow => fow.player));

                          // Combine: batted + got out = all who participated
                          const participatedIds = new Set([...battedPlayerIds, ...outPlayerIds]);

                          // Players who didn't bat = in XI but didn't participate
                          const didNotBatIds = xiPlayerIds.filter(id => !participatedIds.has(id));

                          return (
                            <>
                              {batterEntries.map(([playerId, stats]) => {
                                const player = players.find(p => p.id === playerId);
                                const sr = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(0) : '0';
                                return (
                                  <div key={playerId} className="flex justify-between">
                                    <span className="text-gray-300">{player?.shortName || 'Unknown'}</span>
                                    <span>
                                      {stats.runs} ({stats.balls})
                                      <span className="text-gray-500 text-xs ml-1">SR {sr}</span>
                                    </span>
                                  </div>
                                );
                              })}
                              {didNotBatIds.map(playerId => {
                                const player = players.find(p => p.id === playerId);
                                return (
                                  <div key={playerId} className="flex justify-between text-gray-600">
                                    <span>{player?.shortName || 'Unknown'}</span>
                                    <span className="text-xs italic">did not bat</span>
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Bowling */}
                    <div className="bg-gray-700/50 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-2">BOWLING</div>
                      <div className="space-y-1 text-sm">
                        {getBowlerStats(match.innings2).map(([playerId, stats]) => {
                          const player = players.find(p => p.id === playerId);
                          const econ = stats.overs > 0 ? (stats.runs / stats.overs).toFixed(1) : '0.0';
                          return (
                            <div key={playerId} className="flex justify-between">
                              <span className="text-gray-300">{player?.shortName || 'Unknown'}</span>
                              <span>
                                {stats.wickets}/{stats.runs} ({stats.overs} ov)
                                <span className="text-gray-500 text-xs ml-1">Econ {econ}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Close Button */}
                <div className="p-4 border-t border-gray-700">
                  <button
                    onClick={() => setShowScorecard(null)}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
