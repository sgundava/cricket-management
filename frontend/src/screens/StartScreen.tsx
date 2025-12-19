import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { allPlayers, teams, generateFixtures } from '../data';
import { GameStartMode, SaveSlot } from '../types';
import { formatSaveDate } from '../utils/saveManager';

type SetupStep = 'welcome' | 'mode' | 'team' | 'manager';

export const StartScreen = () => {
  const { loadInitialData, initializeGame, navigateTo, getSaveSlots, loadFromSlot, deleteSlot } = useGameStore();
  const [step, setStep] = useState<SetupStep>('welcome');
  const [startMode, setStartMode] = useState<GameStartMode>('real-squads');
  const [managerName, setManagerName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('mi');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<1 | 2 | 3 | null>(null);

  const saveSlots = getSaveSlots();

  const handleSelectMode = (mode: GameStartMode) => {
    setStartMode(mode);
    setStep('team');
  };

  const handleSelectTeam = (teamId: string) => {
    setSelectedTeam(teamId);
    setStep('manager');
  };

  const handleStartGame = () => {
    if (!managerName.trim()) return;

    // Load data
    const fixtures = generateFixtures(selectedTeam);
    loadInitialData(allPlayers, teams, fixtures);

    // Initialize game with selected mode
    initializeGame(selectedTeam, managerName, startMode);

    // Navigate based on mode
    if (startMode === 'auction') {
      navigateTo('auction');
    } else {
      navigateTo('home');
    }
  };

  const handleBack = () => {
    if (step === 'manager') setStep('team');
    else if (step === 'team') setStep('mode');
    else if (step === 'mode') setStep('welcome');
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
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Cricket Manager</h1>
          <p className="text-gray-400">Build your dynasty. Make tough calls. Win trophies.</p>
        </div>

        {/* Step Indicator (hide on welcome) */}
        {step !== 'welcome' && (
          <div className="flex justify-center gap-2">
            {['mode', 'team', 'manager'].map((s, i) => (
              <div
                key={s}
                className={`w-3 h-3 rounded-full transition-colors ${
                  step === s ? 'bg-blue-500' : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
        )}

        {/* Welcome Screen */}
        {step === 'welcome' && (
          <div className="space-y-4">
            {/* New Game Button */}
            <button
              onClick={() => setStep('mode')}
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

        {/* Step 1: Mode Selection */}
        {step === 'mode' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="text-blue-400 hover:text-blue-300">
                ←
              </button>
              <h2 className="text-lg font-semibold">How do you want to start?</h2>
            </div>
            <p className="text-sm text-gray-400">Choose how to build your squad</p>

            <div className="space-y-3">
              <button
                onClick={() => handleSelectMode('real-squads')}
                className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-xl p-4 text-left transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">👥</span>
                  <div>
                    <h3 className="font-semibold">Use Real Squads</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Start with actual IPL rosters. Your first auction happens after Season 1.
                    </p>
                    <div className="mt-2 text-xs text-green-400">Recommended for first-time players</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSelectMode('auction')}
                className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-xl p-4 text-left transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏏</span>
                  <div>
                    <h3 className="font-semibold">Start with Auction</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Build your squad from scratch. All players go into the auction pool.
                    </p>
                    <div className="mt-2 text-xs text-yellow-400">Full control from day one</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Team Selection */}
        {step === 'team' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="text-blue-400 hover:text-blue-300">
                ←
              </button>
              <h2 className="text-lg font-semibold">Select Your Franchise</h2>
            </div>

            <p className="text-sm text-gray-400">
              {startMode === 'real-squads'
                ? 'Pick a team to manage with their current roster'
                : 'Pick a franchise to represent in the auction'}
            </p>

            <div className="grid grid-cols-3 gap-2">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => handleSelectTeam(team.id)}
                  className="p-3 rounded-lg border-2 border-gray-700 bg-gray-700/30 hover:border-blue-500 hover:bg-blue-900/30 transition-all"
                >
                  <div
                    className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: team.colors.primary }}
                  >
                    {team.shortName}
                  </div>
                  <div className="text-xs text-center truncate">{team.shortName}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Manager Name */}
        {step === 'manager' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={handleBack} className="text-blue-400 hover:text-blue-300">
                ←
              </button>
              <h2 className="text-lg font-semibold">Enter Your Name</h2>
            </div>

            {/* Selected Team Preview */}
            {selectedTeamData && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: selectedTeamData.colors.primary }}
                  >
                    {selectedTeamData.shortName}
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedTeamData.name}</h3>
                    <p className="text-sm text-gray-400">{selectedTeamData.homeCity}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Budget: </span>
                    <span className="text-green-400">₹{selectedTeamData.budget} Cr</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Mode: </span>
                    <span className="text-blue-400">
                      {startMode === 'real-squads' ? 'Real Squads' : 'Auction'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Manager Name Input */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Your Name</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartGame}
              disabled={!managerName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              {startMode === 'auction' ? 'Enter Auction' : 'Start Career'}
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
