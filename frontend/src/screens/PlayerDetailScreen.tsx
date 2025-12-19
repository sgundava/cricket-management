import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { StatBar } from '../components/StatBar';
import { FormIndicator } from '../components/FormIndicator';
import { PlayingRole } from '../types';

const roleColors: Record<string, string> = {
  batsman: 'bg-blue-600',
  bowler: 'bg-green-600',
  allrounder: 'bg-purple-600',
  keeper: 'bg-yellow-600',
};

// Format playing role for display
const formatPlayingRole = (role: PlayingRole | undefined): string | null => {
  if (!role) return null;
  const roleMap: Record<string, string> = {
    'opening-batter': 'Opening Batter',
    'top-order-batter': 'Top Order Batter',
    'middle-order-batter': 'Middle Order Batter',
    'finisher': 'Finisher',
    'wicketkeeper-batter': 'Wicketkeeper Batter',
    'batting-allrounder': 'Batting Allrounder',
    'bowling-allrounder': 'Bowling Allrounder',
    'spin-bowling-allrounder': 'Spin Bowling Allrounder',
    'opening-bowler': 'Opening Bowler',
    'pace-bowler': 'Pace Bowler',
    'spin-bowler': 'Spin Bowler',
    'death-bowler': 'Death Bowler',
  };
  return roleMap[role] || null;
};

export const PlayerDetailScreen = () => {
  const { selectedPlayerId, players, playerTeamId, teams, navigateTo, canTalkToPlayer } = useGameStore();
  const [imageError, setImageError] = useState(false);

  const player = players.find((p) => p.id === selectedPlayerId);
  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const isMyPlayer = playerTeam?.squad.includes(player?.id || '') || false;
  const canTalk = selectedPlayerId ? canTalkToPlayer(selectedPlayerId) : false;
  const playingRoleDisplay = formatPlayingRole(player?.playingRole);

  if (!player) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Player not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <button
          onClick={() => navigateTo('squad')}
          className="text-blue-400 hover:text-blue-300 mb-2"
        >
          ← Back
        </button>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Player Header */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center gap-4 mb-4">
            {/* Player Image or Fallback Avatar */}
            {player.imageUrl && !imageError ? (
              <img
                src={player.imageUrl}
                alt={player.name}
                className="w-16 h-16 rounded-full object-cover border-2 border-gray-600"
                onError={() => setImageError(true)}
              />
            ) : (
              <div
                className={`w-16 h-16 rounded-full ${roleColors[player.role]} flex items-center justify-center text-xl font-bold`}
              >
                {player.shortName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold flex items-center gap-2">
                {player.name}
                {player.contract.isOverseas && (
                  <span className="text-xs bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded">
                    Overseas
                  </span>
                )}
              </h1>
              <p className="text-gray-400">
                {player.age} years • {player.nationality}
              </p>
              <p className="text-sm text-gray-500">
                {playingRoleDisplay || (player.role.charAt(0).toUpperCase() + player.role.slice(1))}
                {' '}•{' '}
                {player.battingStyle === 'left' ? 'Left-hand bat' : 'Right-hand bat'}
                {player.bowlingStyle && ` • ${player.bowlingStyle.replace(/-/g, ' ')}`}
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <FormIndicator form={player.form} size="lg" />
            <div className="text-right">
              <div className="text-sm text-gray-400">Contract</div>
              <div className="font-bold text-green-400">₹{player.contract.salary} L</div>
              <div className="text-xs text-gray-500">{player.contract.yearsRemaining} yrs left</div>
            </div>
          </div>

          {/* Talk to Player Button */}
          {isMyPlayer && (
            <button
              onClick={() => navigateTo('player-talk')}
              className={`w-full mt-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                canTalk
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
              disabled={!canTalk}
            >
              <span>💬</span>
              <span>{canTalk ? 'Talk to Player' : 'Recently Talked'}</span>
            </button>
          )}
        </div>

        {/* Current State */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">CURRENT STATE</h2>

          <div className="space-y-3">
            <StatBar
              value={player.fitness}
              label="Fitness"
              color={player.fitness >= 80 ? 'green' : player.fitness >= 60 ? 'yellow' : 'red'}
            />
            <StatBar
              value={player.morale}
              label="Morale"
              color={player.morale >= 80 ? 'green' : player.morale >= 60 ? 'yellow' : 'red'}
            />
            <StatBar
              value={player.fatigue}
              label="Fatigue"
              color={player.fatigue <= 30 ? 'green' : player.fatigue <= 60 ? 'yellow' : 'red'}
            />
          </div>
        </div>

        {/* Batting Skills */}
        {(player.role === 'batsman' || player.role === 'allrounder' || player.role === 'keeper') && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-gray-400">BATTING</h2>
              <span className="text-sm text-blue-400">Potential: {player.potential.batting}</span>
            </div>

            <div className="space-y-3">
              <StatBar value={player.batting.technique} label="Technique" color="blue" />
              <StatBar value={player.batting.power} label="Power" color="blue" />
              <StatBar value={player.batting.timing} label="Timing" color="blue" />
              <StatBar value={player.batting.temperament} label="Temperament" color="blue" />
            </div>
          </div>
        )}

        {/* Bowling Skills */}
        {(player.role === 'bowler' || player.role === 'allrounder') && player.bowlingStyle && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-gray-400">BOWLING</h2>
              <span className="text-sm text-green-400">Potential: {player.potential.bowling}</span>
            </div>

            <div className="space-y-3">
              <StatBar value={player.bowling.speed} label="Speed/Spin" color="green" />
              <StatBar value={player.bowling.accuracy} label="Accuracy" color="green" />
              <StatBar value={player.bowling.variation} label="Variation" color="green" />
              <StatBar value={player.bowling.stamina} label="Stamina" color="green" />
            </div>
          </div>
        )}

        {/* Fielding Skills */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-400">FIELDING</h2>
            <span className="text-sm text-purple-400">Potential: {player.potential.fielding}</span>
          </div>

          <div className="space-y-3">
            <StatBar value={player.fielding.catching} label="Catching" color="purple" />
            <StatBar value={player.fielding.ground} label="Ground Fielding" color="purple" />
            <StatBar value={player.fielding.throwing} label="Throwing" color="purple" />
            <StatBar value={player.fielding.athleticism} label="Athleticism" color="purple" />
          </div>
        </div>

        {/* Personality */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">PERSONALITY</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-400">Temperament</div>
              <div className="font-medium capitalize">{player.personality.temperament}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Leadership</div>
              <div className="font-medium">{player.personality.leadership}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Professionalism</div>
              <div className="font-medium">{player.personality.professionalism}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Ambition</div>
              <div className="font-medium">{player.personality.ambition}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
