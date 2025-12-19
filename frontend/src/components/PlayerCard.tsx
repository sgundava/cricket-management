import { Player } from '../types';
import { FormIndicator } from './FormIndicator';
import { StatBar } from './StatBar';

interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}

const roleColors: Record<string, string> = {
  batsman: 'bg-blue-600',
  bowler: 'bg-green-600',
  allrounder: 'bg-purple-600',
  keeper: 'bg-yellow-600',
};

const roleLabels: Record<string, string> = {
  batsman: 'BAT',
  bowler: 'BOWL',
  allrounder: 'ALL',
  keeper: 'WK',
};

export const PlayerCard = ({ player, onClick, selected, compact }: PlayerCardProps) => {
  if (compact) {
    return (
      <div
        onClick={onClick}
        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all
          ${selected ? 'bg-blue-600/30 border-blue-500' : 'bg-gray-800 hover:bg-gray-700'}
          border ${selected ? 'border-blue-500' : 'border-gray-700'}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full ${roleColors[player.role]} flex items-center justify-center text-xs font-bold`}
          >
            {roleLabels[player.role]}
          </div>
          <div>
            <div className="font-medium text-white flex items-center gap-2">
              {player.shortName}
              {player.contract.isOverseas && (
                <span className="text-xs text-yellow-400">OS</span>
              )}
            </div>
            <div className="text-xs text-gray-400">
              {player.age}y • {player.battingStyle === 'left' ? 'LHB' : 'RHB'}
              {player.bowlingStyle && ` • ${player.bowlingStyle.split('-')[0]}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <FormIndicator form={player.form} size="sm" />
          <div className="text-right">
            <div className="text-sm text-gray-300">{player.fitness}%</div>
            <div className="text-xs text-gray-500">FIT</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl cursor-pointer transition-all
        ${selected ? 'bg-blue-600/20 border-blue-500' : 'bg-gray-800 hover:bg-gray-750'}
        border ${selected ? 'border-blue-500' : 'border-gray-700'}`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-full ${roleColors[player.role]} flex items-center justify-center text-sm font-bold`}
          >
            {roleLabels[player.role]}
          </div>
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              {player.name}
              {player.contract.isOverseas && (
                <span className="text-xs bg-yellow-600/30 text-yellow-400 px-1.5 py-0.5 rounded">
                  OS
                </span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {player.age}y • {player.nationality}
            </div>
          </div>
        </div>
        <FormIndicator form={player.form} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{player.fitness}</div>
          <div className="text-xs text-gray-500">Fitness</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">{player.morale}</div>
          <div className="text-xs text-gray-500">Morale</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">{player.fatigue}</div>
          <div className="text-xs text-gray-500">Fatigue</div>
        </div>
      </div>

      <div className="space-y-2">
        {(player.role === 'batsman' || player.role === 'allrounder' || player.role === 'keeper') && (
          <StatBar
            value={Math.round(
              (player.batting.technique + player.batting.power + player.batting.timing + player.batting.temperament) / 4
            )}
            label="Batting"
            color="blue"
            size="sm"
          />
        )}
        {(player.role === 'bowler' || player.role === 'allrounder') && (
          <StatBar
            value={Math.round(
              (player.bowling.speed + player.bowling.accuracy + player.bowling.variation + player.bowling.stamina) / 4
            )}
            label="Bowling"
            color="green"
            size="sm"
          />
        )}
      </div>
    </div>
  );
};
