import { useGameStore } from '../store/gameStore';

export const SeasonSummaryScreen = () => {
  const {
    playerTeamId,
    teams,
    players,
    fixtures,
    pointsTable,
    manager,
    season,
    navigateTo,
    resetGame,
    getSeasonResult,
    startNextSeason,
  } = useGameStore();

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));
  const seasonResult = getSeasonResult();

  // Calculate team stats for the season
  const playerMatches = fixtures.filter(
    (m) => m.status === 'completed' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
  );

  const wins = playerMatches.filter((m) => {
    if (!m.innings1 || !m.innings2) return false;
    const firstBattingTeam = m.innings1.battingTeam;
    const secondBattingTeam = m.innings2.battingTeam;
    const chaseSuccessful = m.innings2.runs >= m.innings1.runs + 1;

    if (chaseSuccessful) {
      return secondBattingTeam === playerTeamId;
    } else {
      return firstBattingTeam === playerTeamId;
    }
  }).length;

  const losses = playerMatches.length - wins;

  // Get points table entry
  const tableEntry = pointsTable.find((e) => e.teamId === playerTeamId);

  // Calculate top performers
  type PlayerStats = { runs: number; balls: number; wickets: number; overs: number };
  const playerStats = new Map<string, PlayerStats>();

  playerMatches.forEach((match) => {
    [match.innings1, match.innings2].forEach((innings) => {
      if (!innings) return;

      // Safely handle batterStats (could be Map or plain object)
      if (innings.batterStats) {
        const entries = innings.batterStats instanceof Map
          ? Array.from(innings.batterStats.entries())
          : Object.entries(innings.batterStats);

        entries.forEach(([playerId, stats]) => {
          if (!teamPlayers.some((p) => p.id === playerId)) return;
          const existing = playerStats.get(playerId) || { runs: 0, balls: 0, wickets: 0, overs: 0 };
          existing.runs += (stats as { runs: number }).runs || 0;
          existing.balls += (stats as { balls: number }).balls || 0;
          playerStats.set(playerId, existing);
        });
      }

      // Safely handle bowlerStats
      if (innings.bowlerStats) {
        const entries = innings.bowlerStats instanceof Map
          ? Array.from(innings.bowlerStats.entries())
          : Object.entries(innings.bowlerStats);

        entries.forEach(([playerId, stats]) => {
          if (!teamPlayers.some((p) => p.id === playerId)) return;
          const existing = playerStats.get(playerId) || { runs: 0, balls: 0, wickets: 0, overs: 0 };
          existing.wickets += (stats as { wickets: number }).wickets || 0;
          existing.overs += (stats as { overs: number }).overs || 0;
          playerStats.set(playerId, existing);
        });
      }
    });
  });

  // Top run scorer
  const topScorer = Array.from(playerStats.entries())
    .sort((a, b) => b[1].runs - a[1].runs)[0];
  const topScorerPlayer = topScorer ? players.find((p) => p.id === topScorer[0]) : null;

  // Top wicket taker
  const topWicketTaker = Array.from(playerStats.entries())
    .filter(([_, stats]) => stats.wickets > 0)
    .sort((a, b) => b[1].wickets - a[1].wickets)[0];
  const topWicketTakerPlayer = topWicketTaker ? players.find((p) => p.id === topWicketTaker[0]) : null;

  // Sorted final standings
  const sortedTable = [...pointsTable].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netRunRate - a.netRunRate;
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gradient-to-r from-yellow-900 to-amber-800 p-6 border-b border-yellow-700">
        <div className="max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-bold mb-1">Season {season} Complete</h1>
          <p className="text-yellow-200">{playerTeam?.name}</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Result Banner */}
        {seasonResult && (
          <div className={`rounded-xl p-6 text-center border ${
            seasonResult.playerFinish === 1
              ? 'bg-gradient-to-r from-yellow-900/50 to-amber-900/50 border-yellow-600'
              : seasonResult.playerFinish === 2
              ? 'bg-gradient-to-r from-gray-700/50 to-gray-600/50 border-gray-500'
              : 'bg-gray-800 border-gray-700'
          }`}>
            {seasonResult.playerFinish === 1 && (
              <>
                <div className="text-5xl mb-3">🏆</div>
                <h2 className="text-3xl font-bold text-yellow-400">CHAMPIONS!</h2>
                <p className="text-lg text-yellow-200 mt-2">IPL Season {season} Winners</p>
              </>
            )}
            {seasonResult.playerFinish === 2 && (
              <>
                <div className="text-4xl mb-3">🥈</div>
                <h2 className="text-2xl font-bold text-gray-300">Runners Up</h2>
                <p className="text-gray-400 mt-2">So close! Better luck next season.</p>
              </>
            )}
            {seasonResult.playerFinish > 2 && seasonResult.playerFinish <= 4 && (
              <>
                <h2 className="text-xl font-bold">Playoff Finish</h2>
                <p className="text-gray-400 mt-2">Finished #{seasonResult.playerFinish} in the playoffs.</p>
              </>
            )}
            {seasonResult.playerFinish > 4 && (
              <>
                <h2 className="text-xl font-bold text-gray-400">Season Over</h2>
                <p className="text-gray-500 mt-2">
                  Finished #{seasonResult.playerFinish} - Missed playoffs.
                </p>
              </>
            )}
          </div>
        )}

        {/* Season Stats */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">YOUR SEASON</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">{wins}</div>
              <div className="text-xs text-gray-500">Wins</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{losses}</div>
              <div className="text-xs text-gray-500">Losses</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${
                (tableEntry?.netRunRate || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {tableEntry?.netRunRate?.toFixed(2) || '0.00'}
              </div>
              <div className="text-xs text-gray-500">NRR</div>
            </div>
          </div>
        </div>

        {/* Top Performers */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">TOP PERFORMERS</h3>
          <div className="space-y-3">
            {topScorerPlayer && topScorer && (
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium">{topScorerPlayer.shortName}</div>
                  <div className="text-xs text-gray-500">Top Run Scorer</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-400">{topScorer[1].runs}</div>
                  <div className="text-xs text-gray-500">runs</div>
                </div>
              </div>
            )}
            {topWicketTakerPlayer && topWicketTaker && (
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium">{topWicketTakerPlayer.shortName}</div>
                  <div className="text-xs text-gray-500">Top Wicket Taker</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-purple-400">{topWicketTaker[1].wickets}</div>
                  <div className="text-xs text-gray-500">wickets</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Final Standings */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">FINAL STANDINGS</h3>
          <div className="space-y-1">
            {sortedTable.map((entry, index) => {
              const team = teams.find((t) => t.id === entry.teamId);
              const isPlayerTeam = entry.teamId === playerTeamId;
              const isChampion = seasonResult?.champion === entry.teamId;

              return (
                <div
                  key={entry.teamId}
                  className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                    isPlayerTeam ? 'bg-blue-900/30 border border-blue-800/50' : 'bg-gray-700/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 w-4 text-sm">{index + 1}</span>
                    <span className={`text-sm ${isPlayerTeam ? 'text-blue-400 font-medium' : ''}`}>
                      {team?.shortName}
                      {isChampion && <span className="ml-1">🏆</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">{entry.played}P</span>
                    <span className="text-green-400">{entry.won}W</span>
                    <span className="text-red-400">{entry.lost}L</span>
                    <span className="w-10 font-bold">{entry.points}pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={() => startNextSeason()}
            className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white py-4 rounded-lg font-bold text-lg transition-colors shadow-lg"
          >
            Continue to Season {season + 1}
          </button>
          <button
            onClick={() => navigateTo('home')}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors"
          >
            Back to Home
          </button>
          <button
            onClick={() => {
              if (confirm('Start a new game? This will erase your current progress.')) {
                resetGame();
                navigateTo('home');
                window.location.reload();
              }
            }}
            className="w-full bg-red-900/50 hover:bg-red-900 text-red-300 py-3 rounded-lg font-medium transition-colors border border-red-800"
          >
            New Game
          </button>
        </div>

        {/* Manager Stats */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <h3 className="text-xs font-semibold text-gray-500 mb-2">MANAGER RECORD</h3>
          <p className="text-sm text-gray-400">
            {manager.name} • {manager.history.seasonsManaged + 1} season{manager.history.seasonsManaged > 0 ? 's' : ''} managed
            {manager.history.titlesWon > 0 && ` • ${manager.history.titlesWon} title${manager.history.titlesWon > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    </div>
  );
};
