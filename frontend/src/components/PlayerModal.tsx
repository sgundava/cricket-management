import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { StatBar } from './StatBar';
import { FormIndicator } from './FormIndicator';

interface PlayerModalProps {
  playerId: string;
  onClose: () => void;
  allowStacking?: boolean;
}

type Tab = 'overview' | 'skills' | 'contract';

export const PlayerModal = ({ playerId, onClose, allowStacking = false }: PlayerModalProps) => {
  const { players, teams, openTeamModal, selectPlayer, navigateTo, closeAllModals } = useGameStore();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const player = players.find((p) => p.id === playerId);
  const playerTeam = teams.find((t) => t.squad.includes(playerId));

  if (!player) {
    return null;
  }

  const handleTeamClick = () => {
    if (playerTeam) {
      openTeamModal(playerTeam.id, allowStacking);
    }
  };

  const handleViewFullProfile = () => {
    closeAllModals();
    selectPlayer(playerId);
    navigateTo('player-detail');
  };

  const getRoleColor = () => {
    switch (player.role) {
      case 'batsman':
        return 'bg-blue-900/50 text-blue-300';
      case 'bowler':
        return 'bg-green-900/50 text-green-300';
      case 'allrounder':
        return 'bg-purple-900/50 text-purple-300';
      case 'keeper':
        return 'bg-yellow-900/50 text-yellow-300';
      default:
        return 'bg-gray-700 text-gray-300';
    }
  };

  const getStatColor = (value: number): 'green' | 'yellow' | 'red' => {
    if (value >= 70) return 'green';
    if (value >= 40) return 'yellow';
    return 'red';
  };

  const formatSalary = (salary: number) => {
    if (salary >= 100) return `${(salary / 100).toFixed(1)} Cr`;
    return `${salary} L`;
  };

  const renderOverviewTab = () => (
    <div className="space-y-4">
      {/* Current State */}
      <div className="space-y-3">
        <StatBar
          label="Fitness"
          value={player.fitness}
          color={getStatColor(player.fitness)}
        />
        <StatBar
          label="Morale"
          value={player.morale}
          color={getStatColor(player.morale)}
        />
        <StatBar
          label="Fatigue"
          value={player.fatigue}
          color={player.fatigue > 60 ? 'red' : player.fatigue > 30 ? 'yellow' : 'green'}
        />
      </div>
    </div>
  );

  const renderSkillsTab = () => {
    const showBatting = player.role !== 'bowler';
    const showBowling = player.role !== 'batsman' && player.role !== 'keeper';

    return (
      <div className="space-y-4">
        {/* Batting Skills */}
        {showBatting && (
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Batting</h4>
            <div className="space-y-2">
              <StatBar label="Technique" value={player.batting.technique} color="blue" size="sm" />
              <StatBar label="Power" value={player.batting.power} color="blue" size="sm" />
              <StatBar label="Timing" value={player.batting.timing} color="blue" size="sm" />
              <StatBar label="Temperament" value={player.batting.temperament} color="blue" size="sm" />
            </div>
          </div>
        )}

        {/* Bowling Skills */}
        {showBowling && (
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Bowling</h4>
            <div className="space-y-2">
              <StatBar label="Speed/Spin" value={player.bowling.speed} color="green" size="sm" />
              <StatBar label="Accuracy" value={player.bowling.accuracy} color="green" size="sm" />
              <StatBar label="Variation" value={player.bowling.variation} color="green" size="sm" />
              <StatBar label="Stamina" value={player.bowling.stamina} color="green" size="sm" />
            </div>
          </div>
        )}

        {/* Fielding Skills */}
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">Fielding</h4>
          <div className="space-y-2">
            <StatBar label="Catching" value={player.fielding.catching} color="purple" size="sm" />
            <StatBar label="Ground" value={player.fielding.ground} color="purple" size="sm" />
            <StatBar label="Throwing" value={player.fielding.throwing} color="purple" size="sm" />
          </div>
        </div>
      </div>
    );
  };

  const renderContractTab = () => (
    <div className="space-y-4">
      {/* Contract Info */}
      <div className="bg-gray-700/30 rounded-lg p-3 space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-400">Salary</span>
          <span className="text-white font-medium">{formatSalary(player.contract.salary)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Years Left</span>
          <span className="text-white">{player.contract.yearsRemaining}</span>
        </div>
        {player.contract.releaseClause && (
          <div className="flex justify-between">
            <span className="text-gray-400">Release Clause</span>
            <span className="text-white">{formatSalary(player.contract.releaseClause)}</span>
          </div>
        )}
      </div>

      {/* Personality */}
      <div>
        <h4 className="text-sm font-medium text-gray-400 mb-2">Personality</h4>
        <div className="bg-gray-700/30 rounded-lg p-3 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Temperament</span>
            <span className="text-white capitalize">{player.personality.temperament}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Leadership</span>
            <span className="text-white">{player.personality.leadership}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Professionalism</span>
            <span className="text-white">{player.personality.professionalism}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Ambition</span>
            <span className="text-white">{player.personality.ambition}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-gray-800 rounded-xl w-[400px] max-h-[85vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-lg font-bold shrink-0">
            {player.shortName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-white truncate">{player.name}</h2>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {playerTeam && (
                <button
                  onClick={handleTeamClick}
                  className="text-blue-400 hover:text-blue-300 hover:underline"
                >
                  {playerTeam.shortName}
                </button>
              )}
              <span className="text-gray-500">·</span>
              <span className={`px-1.5 py-0.5 rounded text-xs ${getRoleColor()}`}>
                {player.role}
              </span>
              {player.contract.isOverseas && (
                <>
                  <span className="text-gray-500">·</span>
                  <span className="text-xs text-orange-400">OS</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-400">{player.age} yrs</span>
              <span className="text-gray-500">·</span>
              <span className="text-sm text-gray-400">{player.nationality}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none shrink-0 w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Form Badge */}
        <div className="mt-3">
          <FormIndicator form={player.form} size="md" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {(['overview', 'skills', 'contract'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'skills' && renderSkillsTab()}
        {activeTab === 'contract' && renderContractTab()}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-700 text-center">
        <button
          onClick={handleViewFullProfile}
          className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
        >
          View full profile →
        </button>
      </div>
    </div>
  );
};
