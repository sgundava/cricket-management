import { useGameStore } from '../store/gameStore';
import { StatBar } from '../components/StatBar';

export const ClubScreen = () => {
  const {
    playerTeamId,
    teams,
    players,
    manager,
    pressHeat,
    fixtures,
    pointsTable,
    navigateTo,
    canHoldTeamMeeting,
  } = useGameStore();

  const canMeet = canHoldTeamMeeting();

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));

  // Calculate team stats
  const avgMorale = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.morale, 0) / teamPlayers.length)
    : 0;
  const avgFitness = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.fitness, 0) / teamPlayers.length)
    : 0;
  const avgForm = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.form, 0) / teamPlayers.length)
    : 0;

  // Board patience (from team data or default)
  const boardPatience = playerTeam?.boardPatience ?? 50;

  // Fan support based on recent results
  const playerMatches = fixtures.filter(
    (m) => m.status === 'completed' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
  );
  const recentMatches = playerMatches.slice(-5);
  const wins = recentMatches.filter((m) => {
    if (!m.innings1 || !m.innings2) return false;
    const chaseSuccessful = m.innings2.runs >= m.innings1.runs + 1;
    if (chaseSuccessful) {
      return m.innings2.battingTeam === playerTeamId;
    } else {
      return m.innings1.battingTeam === playerTeamId;
    }
  }).length;
  const fanSupport = recentMatches.length > 0 ? Math.round((wins / recentMatches.length) * 100) : 50;

  // Points table position
  const sortedTable = [...pointsTable].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netRunRate - a.netRunRate;
  });
  const tablePosition = sortedTable.findIndex((e) => e.teamId === playerTeamId) + 1;
  const tableEntry = pointsTable.find((e) => e.teamId === playerTeamId);

  // Squad composition
  const overseas = teamPlayers.filter((p) => p.contract.isOverseas).length;
  const domestic = teamPlayers.length - overseas;

  const batsmen = teamPlayers.filter((p) => p.role === 'batsman').length;
  const bowlers = teamPlayers.filter((p) => p.role === 'bowler').length;
  const allrounders = teamPlayers.filter((p) => p.role === 'allrounder').length;
  const keepers = teamPlayers.filter((p) => p.role === 'keeper').length;

  // Total salary
  const totalSalary = teamPlayers.reduce((sum, p) => sum + p.contract.salary, 0);

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
            style={{ backgroundColor: playerTeam?.colors.primary }}
          >
            {playerTeam?.shortName}
          </div>
          <div>
            <h1 className="text-xl font-bold">{playerTeam?.name}</h1>
            <p className="text-sm text-gray-400">Manager: {manager.name}</p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Season Performance */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">SEASON PERFORMANCE</h2>

          <div className="flex items-center justify-between mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{tablePosition}</div>
              <div className="text-xs text-gray-400">Position</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-400">{tableEntry?.won || 0}</div>
              <div className="text-xs text-gray-400">Wins</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-400">{tableEntry?.lost || 0}</div>
              <div className="text-xs text-gray-400">Losses</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-bold ${(tableEntry?.netRunRate || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {tableEntry?.netRunRate !== undefined
                  ? (tableEntry.netRunRate >= 0 ? '+' : '') + tableEntry.netRunRate.toFixed(2)
                  : '-'}
              </div>
              <div className="text-xs text-gray-400">NRR</div>
            </div>
          </div>

          {tablePosition <= 4 ? (
            <div className="bg-green-900/30 rounded-lg p-2 text-center">
              <span className="text-green-400 text-sm">Playoff Position</span>
            </div>
          ) : (
            <div className="bg-red-900/30 rounded-lg p-2 text-center">
              <span className="text-red-400 text-sm">{5 - tablePosition} more wins needed for playoffs</span>
            </div>
          )}
        </div>

        {/* Club Health */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">CLUB HEALTH</h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Board Confidence</span>
                <span className={boardPatience > 60 ? 'text-green-400' : boardPatience < 40 ? 'text-red-400' : 'text-yellow-400'}>
                  {boardPatience}%
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    boardPatience > 60 ? 'bg-green-500' : boardPatience < 40 ? 'bg-red-500' : 'bg-yellow-500'
                  }`}
                  style={{ width: `${boardPatience}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Fan Support</span>
                <span className={fanSupport > 60 ? 'text-green-400' : fanSupport < 40 ? 'text-red-400' : 'text-yellow-400'}>
                  {fanSupport}%
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    fanSupport > 60 ? 'bg-green-500' : fanSupport < 40 ? 'bg-red-500' : 'bg-yellow-500'
                  }`}
                  style={{ width: `${fanSupport}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Press Heat</span>
                <span className={pressHeat < 40 ? 'text-green-400' : pressHeat > 60 ? 'text-red-400' : 'text-yellow-400'}>
                  {pressHeat}%
                </span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    pressHeat < 40 ? 'bg-green-500' : pressHeat > 60 ? 'bg-red-500' : 'bg-yellow-500'
                  }`}
                  style={{ width: `${pressHeat}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Squad Overview */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">SQUAD OVERVIEW</h2>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <StatBar value={avgMorale} label="Team Morale" color="purple" />
            </div>
            <div>
              <StatBar value={avgFitness} label="Team Fitness" color="green" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="font-bold">{teamPlayers.length}</div>
              <div className="text-xs text-gray-400">Squad Size</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="font-bold">{domestic}</div>
              <div className="text-xs text-gray-400">Domestic</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="font-bold text-blue-400">{overseas}</div>
              <div className="text-xs text-gray-400">Overseas</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-orange-900/30 rounded p-2">
              <div className="font-bold text-orange-400">{batsmen}</div>
              <div className="text-gray-500">BAT</div>
            </div>
            <div className="bg-purple-900/30 rounded p-2">
              <div className="font-bold text-purple-400">{bowlers}</div>
              <div className="text-gray-500">BOWL</div>
            </div>
            <div className="bg-green-900/30 rounded p-2">
              <div className="font-bold text-green-400">{allrounders}</div>
              <div className="text-gray-500">AR</div>
            </div>
            <div className="bg-blue-900/30 rounded p-2">
              <div className="font-bold text-blue-400">{keepers}</div>
              <div className="text-gray-500">WK</div>
            </div>
          </div>
        </div>

        {/* Finances */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">FINANCES</h2>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Budget</span>
              <span className="font-bold text-green-400">₹{(playerTeam?.budget || 0).toFixed(1)} Cr</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Total Salary</span>
              <span className="font-bold">₹{(totalSalary / 100).toFixed(1)} Cr</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Salary Cap</span>
              <span className="text-gray-500">₹{(playerTeam?.salaryCap || 0).toFixed(1)} Cr</span>
            </div>

            <div className="pt-2 border-t border-gray-700">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Cap Usage</span>
                <span>{((totalSalary / 100) / (playerTeam?.salaryCap || 100) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.min(100, (totalSalary / 100) / (playerTeam?.salaryCap || 100) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Manager Stats */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">MANAGER</h2>

          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-xl">
              👤
            </div>
            <div>
              <div className="font-bold">{manager.name}</div>
              <div className="text-sm text-gray-400">Reputation: {manager.reputation}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="font-bold">{manager.history.seasonsManaged}</div>
              <div className="text-xs text-gray-400">Seasons</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="font-bold text-yellow-400">{manager.history.titlesWon}</div>
              <div className="text-xs text-gray-400">Titles</div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2">
              <div className="font-bold">{manager.history.playoffAppearances}</div>
              <div className="text-xs text-gray-400">Playoffs</div>
            </div>
          </div>
        </div>

        {/* Team Actions */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">TEAM ACTIONS</h2>

          <button
            onClick={() => navigateTo('team-meeting')}
            className={`w-full p-4 rounded-lg flex items-center gap-3 transition-colors ${
              canMeet
                ? 'bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700'
                : 'bg-gray-700/30 border border-gray-600 opacity-50'
            }`}
          >
            <span className="text-2xl">📢</span>
            <div className="text-left flex-1">
              <div className="font-medium">Team Meeting</div>
              <div className="text-xs text-gray-400">
                {canMeet
                  ? 'Motivate or address the squad'
                  : 'Recently held a meeting'}
              </div>
            </div>
            {canMeet && (
              <span className="text-purple-400">→</span>
            )}
          </button>
        </div>

        {/* Coming Soon: Staff */}
        <div className="bg-gray-700/30 rounded-xl p-4 border border-dashed border-gray-600 text-center">
          <div className="text-gray-500 text-sm">Staff Management</div>
          <div className="text-gray-600 text-xs mt-1">Coming Soon</div>
        </div>
      </div>
    </div>
  );
};
