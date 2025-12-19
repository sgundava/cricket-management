import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { formatSaveDate } from '../utils/saveManager';

export const GlobalMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savingToSlot, setSavingToSlot] = useState<1 | 2 | 3 | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<1 | 2 | 3 | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const [copiedId, setCopiedId] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);

  const {
    initialized,
    testerId,
    getSaveSlots,
    saveToSlot,
    loadFromSlot,
    deleteSlot,
    resetGame,
    season,
    matchDay,
    phase,
  } = useGameStore();

  const copyTesterId = async () => {
    try {
      await navigator.clipboard.writeText(testerId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = testerId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  };

  // Don't show menu on start screen
  if (!initialized) return null;

  const slots = getSaveSlots();
  const getSlot = (id: 1 | 2 | 3) => slots.find((s) => s.id === id);

  const handleSave = (slotId: 1 | 2 | 3) => {
    const existingSlot = getSlot(slotId);
    if (existingSlot) {
      // Slot has data - ask for confirmation via save name prompt
      setSavingToSlot(slotId);
      setSaveName(`Save ${slotId}`);
    } else {
      // Empty slot - save directly
      setSavingToSlot(slotId);
      setSaveName(`Save ${slotId}`);
    }
  };

  const confirmSave = () => {
    if (savingToSlot) {
      const success = saveToSlot(savingToSlot, saveName || `Save ${savingToSlot}`);
      if (success) {
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 1500);
      }
      setSavingToSlot(null);
      setSaveName('');
    }
  };

  const handleLoad = (slotId: 1 | 2 | 3) => {
    loadFromSlot(slotId);
    setIsOpen(false);
  };

  const handleDelete = (slotId: 1 | 2 | 3) => {
    if (confirmDelete === slotId) {
      deleteSlot(slotId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(slotId);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const handleNewGame = () => {
    if (confirmNewGame) {
      resetGame();
      setIsOpen(false);
      setConfirmNewGame(false);
    } else {
      setConfirmNewGame(true);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setConfirmNewGame(false), 3000);
    }
  };

  const getPhaseLabel = (p: string) => {
    switch (p) {
      case 'auction': return 'Auction';
      case 'season': return 'Season';
      case 'playoffs': return 'Playoffs';
      case 'off-season': return 'Off-Season';
      default: return p;
    }
  };

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-50 w-10 h-10 rounded-lg bg-gray-800 border border-gray-700
          flex items-center justify-center hover:bg-gray-700 transition-colors shadow-lg"
        title="Menu"
      >
        <span className="text-xl text-gray-300">&#9776;</span>
      </button>

      {/* Overlay + Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-[100]">
          {/* Dark overlay */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setIsOpen(false);
              setSavingToSlot(null);
              setConfirmDelete(null);
            }}
          />

          {/* Slide-in panel */}
          <div className="absolute right-0 top-0 h-full w-80 max-w-[90vw] bg-gray-900 border-l border-gray-700 shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Save & Load</h2>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setSavingToSlot(null);
                  setConfirmDelete(null);
                }}
                className="text-gray-400 hover:text-white text-xl"
              >
                &times;
              </button>
            </div>

            {/* Current Status */}
            <div className="px-4 py-3 bg-gray-800/50 text-sm text-gray-400">
              <div className="flex items-center justify-between mb-1">
                <span>Season {season} &bull; Match {matchDay} &bull; {getPhaseLabel(phase)}</span>
              </div>
              <button
                onClick={copyTesterId}
                className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition-colors ${
                  copiedId
                    ? 'bg-green-900/50 text-green-400'
                    : 'bg-gray-700/50 text-gray-500 hover:text-gray-300'
                }`}
                title="Click to copy Tester ID"
              >
                <span className="font-mono">{testerId || 'No ID'}</span>
                <span>{copiedId ? '✓ Copied' : '📋'}</span>
              </button>
            </div>

            {/* Save Success Toast */}
            {showSaveSuccess && (
              <div className="mx-4 mt-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-400 text-sm text-center">
                Game saved successfully!
              </div>
            )}

            {/* Save Section */}
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">SAVE GAME</h3>
              <div className="space-y-2">
                {([1, 2, 3] as const).map((slotId) => {
                  const slot = getSlot(slotId);
                  const isSaving = savingToSlot === slotId;

                  if (isSaving) {
                    return (
                      <div key={slotId} className="bg-gray-800 rounded-lg p-3 border border-blue-600">
                        <input
                          type="text"
                          value={saveName}
                          onChange={(e) => setSaveName(e.target.value)}
                          placeholder={`Save ${slotId}`}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-2"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={confirmSave}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium"
                          >
                            {slot ? 'Overwrite' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setSavingToSlot(null);
                              setSaveName('');
                            }}
                            className="px-3 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={slotId}
                      onClick={() => handleSave(slotId)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-750 rounded-lg p-3 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">Slot {slotId}</span>
                        {slot ? (
                          <span className="text-xs text-gray-500">Overwrite</span>
                        ) : (
                          <span className="text-xs text-green-500">Empty</span>
                        )}
                      </div>
                      {slot && (
                        <div className="text-xs text-gray-500 mt-1">
                          {slot.name} &bull; {slot.teamName}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Load Section */}
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">LOAD GAME</h3>
              {slots.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No saved games</p>
              ) : (
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="bg-gray-800 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium">{slot.name}</span>
                        <span className="text-xs text-gray-500">Slot {slot.id}</span>
                      </div>
                      <div className="text-xs text-gray-400 mb-2">
                        {slot.teamName} &bull; S{slot.season} M{slot.matchDay} &bull; {getPhaseLabel(slot.phase)}
                      </div>
                      <div className="text-xs text-gray-500 mb-3">
                        {formatSaveDate(slot.savedAt)}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLoad(slot.id)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDelete(slot.id)}
                          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                            confirmDelete === slot.id
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          }`}
                        >
                          {confirmDelete === slot.id ? 'Confirm?' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* New Game Section */}
            <div className="p-4">
              <button
                onClick={handleNewGame}
                className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
                  confirmNewGame
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                }`}
              >
                {confirmNewGame ? 'Confirm? Current progress will be lost' : 'New Game'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
