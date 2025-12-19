import React from 'react';
import { useGameStore } from '../store/gameStore';

const MATCH_TYPE_LABELS: Record<string, string> = {
  league: 'League Match',
  qualifier1: 'Qualifier 1',
  eliminator: 'Eliminator',
  qualifier2: 'Qualifier 2',
  final: 'FINAL',
};

export const HomeScreen = () => {
  const {
    manager,
    playerTeamId,
    teams,
    players,
    fixtures,
    pointsTable,
    activeEvents,
    phase,
    season,
    navigateTo,
    selectMatch,
    selectEvent,
    getSeasonResult,
    checkAndStartPlayoffs,
  } = useGameStore();

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));

  // Check if playoffs should start
  React.useEffect(() => {
    if (phase === 'season') {
      const leagueMatches = fixtures.filter(
        (m) => m.matchType === 'league' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
      );
      const allComplete = leagueMatches.every((m) => m.status === 'completed');
      if (allComplete && leagueMatches.length > 0) {
        checkAndStartPlayoffs();
      }
    }
  }, [fixtures, phase, playerTeamId, checkAndStartPlayoffs]);

  const nextMatch = fixtures.find(
    (m) => m.status === 'upcoming' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
  );

  const opponent = nextMatch
    ? teams.find((t) => t.id === (nextMatch.homeTeam === playerTeamId ? nextMatch.awayTeam : nextMatch.homeTeam))
    : null;

  const seasonResult = getSeasonResult();

  // Calculate squad averages
  const avgMorale = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.morale, 0) / teamPlayers.length)
    : 0;
  const avgFitness = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.fitness, 0) / teamPlayers.length)
    : 0;

  // Players with serious concerns (urgent only)
  const concerns = teamPlayers.filter(
    (p) => p.fatigue > 80 || p.form < -10 || p.fitness < 50 || p.morale < 40
  );

  // Unresolved events
  const unresolvedEvents = activeEvents.filter((e) => !e.resolved);

  // Get position in table
  const sortedTable = [...pointsTable].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netRunRate - a.netRunRate;
  });
  const tablePosition = sortedTable.findIndex((e) => e.teamId === playerTeamId) + 1;
  const tableEntry = pointsTable.find((e) => e.teamId === playerTeamId);

  const handlePrepareMatch = () => {
    if (nextMatch) {
      selectMatch(nextMatch.id);
      navigateTo('match-prep');
    }
  };

  const handleEventClick = (eventId: string) => {
    selectEvent(eventId);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{playerTeam?.name || 'Cricket Manager'}</h1>
            <p className="text-sm text-gray-400">Season {season} • {manager.name}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">#{tablePosition}</div>
            <div className="text-xs text-gray-400">
              {tableEntry?.won || 0}W {tableEntry?.lost || 0}L
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Season Complete Card */}
        {phase === 'off-season' && (
          <div className="bg-gradient-to-r from-yellow-900/50 to-amber-900/50 rounded-xl p-6 border border-yellow-700">
            <h2 className="text-xl font-bold text-center mb-4">Season Complete!</h2>
            {seasonResult && (
              <div className="text-center space-y-2">
                {seasonResult.playerFinish === 1 ? (
                  <div className="text-2xl text-yellow-400 font-bold">CHAMPIONS!</div>
                ) : seasonResult.playerFinish === 2 ? (
                  <div className="text-xl text-gray-300">Runners Up</div>
                ) : seasonResult.playerFinish <= 4 ? (
                  <div className="text-lg text-gray-400">Finished #{seasonResult.playerFinish} (Playoffs)</div>
                ) : (
                  <div className="text-lg text-gray-400">Finished #{seasonResult.playerFinish} (Missed Playoffs)</div>
                )}
                {seasonResult.champion && (
                  <div className="text-sm text-gray-500 mt-2">
                    Champion: {teams.find((t) => t.id === seasonResult.champion)?.name}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => navigateTo('season-summary')}
              className="w-full mt-4 bg-yellow-600 hover:bg-yellow-700 text-white py-3 rounded-lg font-medium transition-colors"
            >
              View Season Summary
            </button>
          </div>
        )}

        {/* Next Match Card */}
        {nextMatch && opponent && phase !== 'off-season' && (
          <div className={`rounded-xl p-4 border ${
            nextMatch.matchType !== 'league'
              ? 'bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-purple-700'
              : 'bg-gray-800 border-gray-700'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <span className={`text-sm font-medium ${nextMatch.matchType !== 'league' ? 'text-purple-400' : 'text-gray-400'}`}>
                {MATCH_TYPE_LABELS[nextMatch.matchType] || 'NEXT MATCH'}
              </span>
              {nextMatch.matchType === 'league' && (
                <span className="text-sm text-blue-400">Match {nextMatch.matchNumber}</span>
              )}
              {nextMatch.matchType !== 'league' && (
                <span className="text-xs bg-purple-600 px-2 py-1 rounded">PLAYOFFS</span>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="text-center flex-1">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold"
                  style={{ backgroundColor: playerTeam?.colors.primary }}
                >
                  {playerTeam?.shortName}
                </div>
                <div className="text-sm font-medium">{playerTeam?.shortName}</div>
              </div>

              <div className="text-gray-500 text-lg px-4">vs</div>

              <div className="text-center flex-1">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold"
                  style={{ backgroundColor: opponent.colors.primary }}
                >
                  {opponent.shortName}
                </div>
                <div className="text-sm">{opponent.shortName}</div>
              </div>
            </div>

            <div className="text-center text-sm text-gray-400 mb-4">{nextMatch.venue}</div>

            <button
              onClick={handlePrepareMatch}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                nextMatch.matchType !== 'league'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white`}
            >
              Prepare for Match
            </button>
          </div>
        )}

        {/* No upcoming match but season not over - show waiting message */}
        {!nextMatch && phase === 'playoffs' && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
            <p className="text-gray-400">Waiting for other playoff matches to complete...</p>
          </div>
        )}

        {/* Urgent Alerts */}
        {(unresolvedEvents.length > 0 || concerns.length > 0) && (
          <div className="bg-gray-800 rounded-xl p-4 border border-red-900/50">
            <h2 className="text-sm font-semibold text-red-400 mb-3">ATTENTION NEEDED</h2>

            {unresolvedEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => handleEventClick(event.id)}
                className="flex items-center gap-3 p-3 bg-red-900/20 rounded-lg mb-2 cursor-pointer hover:bg-red-900/30 transition-colors"
              >
                <span className="text-red-400 text-lg">!</span>
                <div>
                  <span className="text-sm font-medium">{event.title}</span>
                  <span className="text-xs text-gray-500 ml-2">Tap to resolve</span>
                </div>
              </div>
            ))}

            {concerns.slice(0, 2).map((player) => (
              <div
                key={player.id}
                onClick={() => navigateTo('squad')}
                className="flex items-center justify-between p-3 bg-yellow-900/20 rounded-lg mb-2 cursor-pointer hover:bg-yellow-900/30"
              >
                <span className="text-sm">{player.shortName}</span>
                <div className="flex gap-2 text-xs">
                  {player.fatigue > 80 && <span className="text-orange-400">Exhausted</span>}
                  {player.form < -10 && <span className="text-red-400">Poor form</span>}
                  {player.fitness < 50 && <span className="text-yellow-400">Injured</span>}
                  {player.morale < 40 && <span className="text-purple-400">Unhappy</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Status */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-lg font-bold ${avgMorale > 70 ? 'text-green-400' : avgMorale < 50 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {avgMorale}
                </div>
                <div className="text-xs text-gray-500">Morale</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold ${avgFitness > 70 ? 'text-green-400' : avgFitness < 50 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {avgFitness}
                </div>
                <div className="text-xs text-gray-500">Fitness</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{teamPlayers.length}</div>
                <div className="text-xs text-gray-500">Squad</div>
              </div>
            </div>
            <button
              onClick={() => navigateTo('club')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              More →
            </button>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigateTo('schedule')}
            className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
          >
            <div className="text-lg mb-1">📅</div>
            <div className="text-sm font-medium">Schedule</div>
            <div className="text-xs text-gray-500">View fixtures & standings</div>
          </button>
          <button
            onClick={() => navigateTo('stats')}
            className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
          >
            <div className="text-lg mb-1">📊</div>
            <div className="text-sm font-medium">Stats</div>
            <div className="text-xs text-gray-500">Season leaderboards</div>
          </button>
        </div>
      </div>
    </div>
  );
};
