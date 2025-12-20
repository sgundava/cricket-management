import { useGameStore } from '../store/gameStore';
import { StatBar } from './StatBar';
import { FormIndicator } from './FormIndicator';

interface TeamModalProps {
  teamId: string;
  onClose: () => void;
  allowStacking?: boolean;
}

export const TeamModal = ({ teamId, onClose, allowStacking = false }: TeamModalProps) => {
  const { teams, players, fixtures, pointsTable, openPlayerModal, navigateTo, closeAllModals, selectPlayer } = useGameStore();

  const team = teams.find((t) => t.id === teamId);
  const teamStanding = pointsTable.find((p) => p.teamId === teamId);

  if (!team) {
    return null;
  }

  // Get recent form from completed fixtures
  const getRecentForm = () => {
    const completedMatches = fixtures
      .filter(
        (m) =>
          m.status === 'completed' &&
          (m.homeTeam === teamId || m.awayTeam === teamId) &&
          m.result
      )
      .slice(-5); // Last 5 matches

    return completedMatches.map((match) => {
      const isWin = match.result?.winner === teamId;
      const isTie = match.result?.winner === null;
      return { matchId: match.id, result: isTie ? 'T' : isWin ? 'W' : 'L' };
    });
  };

  const recentForm = getRecentForm();

  // Get squad players sorted by role
  const squadPlayers = team.squad
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .sort((a, b) => {
      const roleOrder = { keeper: 0, batsman: 1, allrounder: 2, bowler: 3 };
      return roleOrder[a.role] - roleOrder[b.role];
    });

  const handlePlayerClick = (playerId: string) => {
    if (allowStacking) {
      openPlayerModal(playerId, true);
    }
  };

  const handleViewFullSquad = () => {
    closeAllModals();
    // Select first player to trigger squad navigation
    if (team.squad.length > 0) {
      selectPlayer(team.squad[0]);
    }
    navigateTo('squad');
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'batsman':
        return 'text-blue-400';
      case 'bowler':
        return 'text-green-400';
      case 'allrounder':
        return 'text-purple-400';
      case 'keeper':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'batsman':
        return 'BAT';
      case 'bowler':
        return 'BOWL';
      case 'allrounder':
        return 'AR';
      case 'keeper':
        return 'WK';
      default:
        return '';
    }
  };

  const getFormColor = (result: string) => {
    switch (result) {
      case 'W':
        return 'bg-green-500';
      case 'L':
        return 'bg-red-500';
      case 'T':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatNRR = (nrr: number) => {
    const sign = nrr >= 0 ? '+' : '';
    return `${sign}${nrr.toFixed(3)}`;
  };

  const getPosition = () => {
    if (!teamStanding) return null;
    const position = pointsTable.findIndex((p) => p.teamId === teamId) + 1;
    const suffix =
      position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
    return `${position}${suffix}`;
  };

  return (
    <div className="bg-gray-800 rounded-xl w-[400px] max-h-[85vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-start gap-3">
          {/* Team Badge */}
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: team.colors.primary }}
          >
            {team.shortName}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-white truncate">{team.name}</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">{team.homeCity}</span>
              {getPosition() && (
                <>
                  <span className="text-gray-500">·</span>
                  <span className="text-blue-400">{getPosition()} in table</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none shrink-0 w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Recent Form */}
        {recentForm.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-400">Recent:</span>
            <div className="flex gap-1">
              {recentForm.map((f, i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${getFormColor(f.result)}`}
                >
                  {f.result}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats Section */}
      {teamStanding && (
        <div className="p-4 border-b border-gray-700">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xl font-bold">{teamStanding.played}</div>
              <div className="text-xs text-gray-400">Played</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-400">{teamStanding.won}</div>
              <div className="text-xs text-gray-400">Won</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-400">{teamStanding.lost}</div>
              <div className="text-xs text-gray-400">Lost</div>
            </div>
            <div>
              <div
                className={`text-xl font-bold ${teamStanding.netRunRate >= 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                {formatNRR(teamStanding.netRunRate)}
              </div>
              <div className="text-xs text-gray-400">NRR</div>
            </div>
          </div>
          <div className="mt-2 text-center">
            <span className="text-2xl font-bold text-blue-400">{teamStanding.points}</span>
            <span className="text-sm text-gray-400 ml-1">pts</span>
          </div>
        </div>
      )}

      {/* Squad List */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">
          Squad ({squadPlayers.length})
        </h3>
        <div className="space-y-2">
          {squadPlayers.map((player) => (
            <button
              key={player.id}
              onClick={() => handlePlayerClick(player.id)}
              disabled={!allowStacking}
              className={`w-full flex items-center gap-3 p-2 rounded-lg ${
                allowStacking
                  ? 'hover:bg-gray-700/50 cursor-pointer'
                  : 'cursor-default'
              } transition-colors`}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium">
                {player.shortName.charAt(0)}
              </div>

              {/* Info */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span
                    className={`${allowStacking ? 'text-blue-400' : 'text-white'} font-medium text-sm`}
                  >
                    {player.shortName}
                  </span>
                  {player.contract.isOverseas && (
                    <span className="text-xs text-orange-400">OS</span>
                  )}
                  {team.captain === player.id && (
                    <span className="text-xs text-yellow-400">(C)</span>
                  )}
                </div>
                <span className={`text-xs ${getRoleColor(player.role)}`}>
                  {getRoleBadge(player.role)}
                </span>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-3">
                <FormIndicator form={player.form} size="sm" />
                <div className="w-16">
                  <StatBar
                    label=""
                    value={player.fitness}
                    color={player.fitness >= 70 ? 'green' : player.fitness >= 40 ? 'yellow' : 'red'}
                    size="sm"
                    showValue={false}
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-700 text-center">
        <button
          onClick={handleViewFullSquad}
          className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
        >
          View full squad →
        </button>
      </div>
    </div>
  );
};
