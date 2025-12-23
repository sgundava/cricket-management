import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { allPlayers, teams, generateFixtures } from '../data';
import { GameStartMode } from '../types';
import { formatSaveDate } from '../utils/saveManager';

type SetupStep = 'welcome' | 'setup';

export const StartScreen = () => {
  const { loadInitialData, initializeGame, navigateTo, getSaveSlots, loadFromSlot, deleteSlot } = useGameStore();
  const [step, setStep] = useState<SetupStep>('welcome');
  const [startMode, setStartMode] = useState<GameStartMode>('real-squads');
  const [managerName, setManagerName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('mi');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<1 | 2 | 3 | null>(null);

  const saveSlots = getSaveSlots();

  const handleStartGame = () => {
    if (!managerName.trim()) return;

    // Load data
    const fixtures = generateFixtures(selectedTeam);
    loadInitialData(allPlayers, teams, fixtures);

    // Initialize game with selected mode
    initializeGame(selectedTeam, managerName, startMode);

    // Navigate based on mode
    if (startMode === 'mini-auction') {
      navigateTo('release-phase');
    } else if (startMode === 'mega-auction') {
      navigateTo('auction');
    } else {
      navigateTo('home');
    }
  };

  const handleLoadGame = (slotId: 1 | 2 | 3) => {
    const success = loadFromSlot(slotId);
    if (success) {
      // Navigation is handled by the store based on game phase
    }
  };

  const handleDeleteSave = (slotId: 1 | 2 | 3) => {
    deleteSlot(slotId);
    setShowDeleteConfirm(null);
  };

  const selectedTeamData = teams.find((t) => t.id === selectedTeam);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Cricket Manager</h1>
          <p className="text-gray-400">Build your dynasty. Make tough calls. Win trophies.</p>
        </div>

        {/* Welcome Screen */}
        {step === 'welcome' && (
          <div className="space-y-4">
            {/* New Game Button */}
            <button
              onClick={() => setStep('setup')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              New Game
            </button>

            {/* Saved Games */}
            {saveSlots.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">Continue</h3>
                <div className="space-y-2">
                  {saveSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="bg-gray-700/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <button
                        onClick={() => handleLoadGame(slot.id)}
                        className="flex-1 text-left hover:text-blue-400 transition-colors"
                      >
                        <div className="font-medium">{slot.name}</div>
                        <div className="text-xs text-gray-400">
                          {slot.teamName} • Season {slot.season} • {slot.phase === 'auction' ? 'Auction' : `Match ${slot.matchDay}`}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatSaveDate(slot.savedAt)}
                        </div>
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(slot.id)}
                        className="ml-2 p-2 text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete save"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6">
                  <h3 className="font-bold mb-2">Delete Save?</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(null)}
                      className="flex-1 bg-gray-700 text-white py-2 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteSave(showDeleteConfirm)}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Unified Setup Screen */}
        {step === 'setup' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={() => setStep('welcome')} className="text-blue-400 hover:text-blue-300">
                ←
              </button>
              <h2 className="text-lg font-semibold">New Game Setup</h2>
            </div>

            {/* Manager Name */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Manager Name</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Team Selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Select Your Franchise</label>
              <div className="grid grid-cols-5 gap-2">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeam(team.id)}
                    className={`p-2 rounded-lg border-2 transition-all ${
                      selectedTeam === team.id
                        ? 'border-blue-500 bg-blue-900/30'
                        : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: team.colors.primary }}
                    >
                      {team.shortName}
                    </div>
                    <div className="text-xs text-center truncate">{team.shortName}</div>
                  </button>
                ))}
              </div>
              {selectedTeamData && (
                <div className="mt-2 text-sm text-gray-400 text-center">
                  {selectedTeamData.name} • {selectedTeamData.homeCity}
                </div>
              )}
            </div>

            {/* Auction Type Selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Starting Auction</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setStartMode('real-squads')}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    startMode === 'real-squads'
                      ? 'border-green-500 bg-green-900/30'
                      : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold text-sm">No Auction</div>
                  <div className="text-xs text-gray-400 mt-1">Real squads</div>
                </button>
                <button
                  onClick={() => setStartMode('mini-auction')}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    startMode === 'mini-auction'
                      ? 'border-blue-500 bg-blue-900/30'
                      : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold text-sm">Mini</div>
                  <div className="text-xs text-gray-400 mt-1">Tune squad</div>
                </button>
                <button
                  onClick={() => setStartMode('mega-auction')}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    startMode === 'mega-auction'
                      ? 'border-yellow-500 bg-yellow-900/30'
                      : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div className="font-semibold text-sm">Mega</div>
                  <div className="text-xs text-gray-400 mt-1">Full rebuild</div>
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500 text-center">
                {startMode === 'real-squads' && 'Start Season 1 with current IPL rosters. First auction after the season.'}
                {startMode === 'mini-auction' && 'Release players and bid on free agents before Season 1.'}
                {startMode === 'mega-auction' && 'Retain up to 4 players, then rebuild your squad from scratch.'}
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartGame}
              disabled={!managerName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              {startMode === 'real-squads'
                ? 'Start Career'
                : startMode === 'mini-auction'
                  ? 'Enter Mini Auction'
                  : 'Enter Mega Auction'}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-500">
          v0.8 Beta
        </p>
      </div>
    </div>
  );
};
