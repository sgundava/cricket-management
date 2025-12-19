import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { InteractionOption, InteractionResult } from '../types';
import { StatBar } from '../components/StatBar';

const roleColors: Record<string, string> = {
  batsman: 'bg-blue-600',
  bowler: 'bg-green-600',
  allrounder: 'bg-purple-600',
  keeper: 'bg-yellow-600',
};

const categoryLabels: Record<string, { label: string; color: string; icon: string }> = {
  praise: { label: 'Praise', color: 'text-green-400', icon: '👏' },
  correct: { label: 'Correct', color: 'text-orange-400', icon: '⚠️' },
  motivate: { label: 'Motivate', color: 'text-blue-400', icon: '🔥' },
};

export const PlayerTalkScreen = () => {
  const {
    selectedPlayerId,
    players,
    navigateTo,
    canTalkToPlayer,
    getInteractionOptions,
    talkToPlayer,
  } = useGameStore();

  const [result, setResult] = useState<InteractionResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const player = players.find((p) => p.id === selectedPlayerId);
  const options = selectedPlayerId ? getInteractionOptions(selectedPlayerId) : [];
  const canTalk = selectedPlayerId ? canTalkToPlayer(selectedPlayerId) : false;

  if (!player) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Player not found</p>
      </div>
    );
  }

  const handleSelectOption = (option: InteractionOption) => {
    if (!selectedPlayerId) return;
    const interactionResult = talkToPlayer(selectedPlayerId, option);
    setResult(interactionResult);
  };

  const handleBack = () => {
    navigateTo('player-detail');
  };

  const handleDone = () => {
    navigateTo('player-detail');
  };

  // Group options by category
  const groupedOptions = options.reduce((acc, option) => {
    if (!acc[option.category]) {
      acc[option.category] = [];
    }
    acc[option.category].push(option);
    return acc;
  }, {} as Record<string, InteractionOption[]>);

  // Filter by selected category
  const filteredOptions = selectedCategory
    ? options.filter((o) => o.category === selectedCategory)
    : options;

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <button
          onClick={handleBack}
          className="text-blue-400 hover:text-blue-300 mb-2"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold">Talk to Player</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Player Card */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-full ${roleColors[player.role]} flex items-center justify-center text-lg font-bold`}
            >
              {player.shortName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold">{player.name}</h2>
              <p className="text-sm text-gray-400">
                {player.role.charAt(0).toUpperCase() + player.role.slice(1)}
              </p>
            </div>
          </div>

          {/* Current state preview */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Morale</div>
              <StatBar
                value={player.morale}
                label=""
                color={player.morale >= 70 ? 'green' : player.morale >= 50 ? 'yellow' : 'red'}
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Form</div>
              <div className={`text-lg font-bold ${
                player.form > 5 ? 'text-green-400' :
                player.form < -5 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {player.form > 0 ? '+' : ''}{player.form}
              </div>
            </div>
          </div>

          {/* Personality hint */}
          <div className="mt-4 p-3 bg-gray-700/50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Personality</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-1 rounded ${
                player.personality.temperament === 'fiery' ? 'bg-red-900/50 text-red-400' :
                player.personality.temperament === 'calm' ? 'bg-green-900/50 text-green-400' :
                'bg-purple-900/50 text-purple-400'
              }`}>
                {player.personality.temperament.charAt(0).toUpperCase() + player.personality.temperament.slice(1)}
              </span>
              {player.personality.professionalism > 70 && (
                <span className="px-2 py-1 rounded bg-blue-900/50 text-blue-400">Professional</span>
              )}
              {player.personality.ambition > 70 && (
                <span className="px-2 py-1 rounded bg-yellow-900/50 text-yellow-400">Ambitious</span>
              )}
              {player.personality.leadership > 70 && (
                <span className="px-2 py-1 rounded bg-cyan-900/50 text-cyan-400">Leader</span>
              )}
            </div>
          </div>
        </div>

        {/* Result Display */}
        {result && (
          <div className={`rounded-xl p-4 border ${
            result.success ? 'bg-gray-800 border-gray-700' : 'bg-red-900/30 border-red-700'
          }`}>
            <h3 className="font-semibold mb-2">
              {result.success ? 'Conversation Complete' : 'That didn\'t go well...'}
            </h3>

            <div className="bg-gray-700/50 rounded-lg p-3 mb-4 italic text-gray-300">
              "{result.playerResponse}"
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              {result.effects.morale !== 0 && (
                <div className={`flex items-center gap-1 ${
                  result.effects.morale > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  <span>Morale</span>
                  <span className="font-bold">
                    {result.effects.morale > 0 ? '+' : ''}{result.effects.morale}
                  </span>
                </div>
              )}
              {result.effects.form !== 0 && (
                <div className={`flex items-center gap-1 ${
                  result.effects.form > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  <span>Form</span>
                  <span className="font-bold">
                    {result.effects.form > 0 ? '+' : ''}{result.effects.form}
                  </span>
                </div>
              )}
              {result.effects.pressHeat && (
                <div className="flex items-center gap-1 text-orange-400">
                  <span>Press Heat</span>
                  <span className="font-bold">+{result.effects.pressHeat}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleDone}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* Interaction Options */}
        {!result && canTalk && (
          <>
            {/* Category Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === null
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                All
              </button>
              {Object.entries(categoryLabels).map(([key, { label, icon }]) => (
                <button
                  key={key}
                  onClick={() => setSelectedCategory(key)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === key
                      ? 'bg-gray-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            {/* Options List */}
            <div className="space-y-3">
              {filteredOptions.map((option) => {
                const catInfo = categoryLabels[option.category];
                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelectOption(option)}
                    className="w-full bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{catInfo.icon}</span>
                      <div className="flex-1">
                        <div className="font-medium mb-1">{option.label}</div>
                        <div className="text-sm text-gray-400">{option.description}</div>

                        {/* Effect hints */}
                        <div className="flex gap-3 mt-2 text-xs">
                          {option.baseEffects.morale !== 0 && (
                            <span className={option.baseEffects.morale > 0 ? 'text-green-500' : 'text-red-500'}>
                              Morale {option.baseEffects.morale > 0 ? '+' : ''}{option.baseEffects.morale}
                            </span>
                          )}
                          {option.baseEffects.form !== 0 && (
                            <span className={option.baseEffects.form > 0 ? 'text-blue-500' : 'text-orange-500'}>
                              Form {option.baseEffects.form > 0 ? '+' : ''}{option.baseEffects.form}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Cooldown Message */}
        {!result && !canTalk && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
            <div className="text-4xl mb-3">⏳</div>
            <h3 className="font-semibold mb-2">Recently Talked</h3>
            <p className="text-gray-400 text-sm">
              You've already spoken to {player.shortName} recently.
              Give them some time before your next conversation.
            </p>
            <button
              onClick={handleBack}
              className="mt-4 text-blue-400 hover:text-blue-300"
            >
              Go Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
