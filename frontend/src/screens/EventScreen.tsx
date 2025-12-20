import { useGameStore } from '../store/gameStore';

const CATEGORY_COLORS = {
  player: 'from-blue-900/50 to-blue-800/50 border-blue-700',
  media: 'from-purple-900/50 to-purple-800/50 border-purple-700',
  team: 'from-green-900/50 to-green-800/50 border-green-700',
  board: 'from-amber-900/50 to-amber-800/50 border-amber-700',
};

const CATEGORY_LABELS = {
  player: 'Player Issue',
  media: 'Media',
  team: 'Team',
  board: 'Board',
};

const CATEGORY_ICONS = {
  player: '👤',
  media: '📰',
  team: '👥',
  board: '🏢',
};

export const EventScreen = () => {
  const {
    activeEvents,
    players,
    resolveEvent,
    navigateTo,
    openPlayerModal,
  } = useGameStore();

  // Get first unresolved event
  const currentEvent = activeEvents.find((e) => !e.resolved);

  if (!currentEvent) {
    // No events to show, go back home
    navigateTo('home');
    return null;
  }

  const involvedPlayer = currentEvent.involvedPlayers.length > 0
    ? players.find((p) => p.id === currentEvent.involvedPlayers[0])
    : null;

  const handleChoice = (optionId: string) => {
    resolveEvent(currentEvent.id, optionId);

    // Check if there are more events
    const remainingEvents = activeEvents.filter((e) => !e.resolved && e.id !== currentEvent.id);
    if (remainingEvents.length === 0) {
      navigateTo('home');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className={`p-6 border-b bg-gradient-to-r ${CATEGORY_COLORS[currentEvent.category]}`}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{CATEGORY_ICONS[currentEvent.category]}</span>
            <span className="text-sm text-gray-300 uppercase tracking-wide">
              {CATEGORY_LABELS[currentEvent.category]}
            </span>
          </div>
          <h1 className="text-xl font-bold">{currentEvent.title}</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        {/* Event Description */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          {involvedPlayer && (
            <button
              onClick={() => openPlayerModal(involvedPlayer.id, false)}
              className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-700 w-full text-left hover:bg-gray-700/30 -mx-2 px-2 py-2 rounded-lg transition-colors"
            >
              <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center text-lg font-bold">
                {involvedPlayer.shortName.charAt(0)}
              </div>
              <div>
                <div className="font-medium text-blue-400 hover:text-blue-300">{involvedPlayer.name}</div>
                <div className="text-sm text-gray-400">
                  {involvedPlayer.role.charAt(0).toUpperCase() + involvedPlayer.role.slice(1)} •
                  Morale: {involvedPlayer.morale} • Form: {involvedPlayer.form > 0 ? '+' : ''}{involvedPlayer.form}
                </div>
              </div>
              <span className="ml-auto text-gray-500 text-sm">View Profile</span>
            </button>
          )}

          <p className="text-gray-200 leading-relaxed">
            {currentEvent.description}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <h3 className="text-sm text-gray-400 uppercase tracking-wide">Your Response</h3>

          {currentEvent.options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleChoice(option.id)}
              className="w-full text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-xl p-4 transition-colors group"
            >
              <div className="font-medium text-white group-hover:text-blue-400 transition-colors">
                {option.label}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {option.description}
              </div>

              {/* Effect hints */}
              <div className="flex flex-wrap gap-2 mt-3">
                {option.effects.map((effect, i) => {
                  let label = '';
                  let colorClass = '';

                  if (effect.target === 'player') {
                    if (effect.attribute === 'morale') {
                      label = effect.change > 0 ? `+${effect.change} Morale` : `${effect.change} Morale`;
                      colorClass = effect.change > 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400';
                    } else if (effect.attribute === 'form') {
                      label = effect.change > 0 ? `+${effect.change} Form` : `${effect.change} Form`;
                      colorClass = effect.change > 0 ? 'bg-blue-900/50 text-blue-400' : 'bg-orange-900/50 text-orange-400';
                    } else if (effect.attribute === 'fatigue') {
                      label = effect.change < 0 ? `${effect.change} Fatigue` : `+${effect.change} Fatigue`;
                      colorClass = effect.change < 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400';
                    }
                  } else if (effect.target === 'team') {
                    if (effect.attribute === 'pressHeat') {
                      label = effect.change > 0 ? `+${effect.change} Press Heat` : `${effect.change} Press Heat`;
                      colorClass = effect.change > 0 ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400';
                    } else if (effect.attribute === 'boardPatience') {
                      label = effect.change > 0 ? `+${effect.change} Board Patience` : `${effect.change} Board Patience`;
                      colorClass = effect.change > 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400';
                    } else if (effect.attribute === 'morale') {
                      label = effect.change > 0 ? `+${effect.change} Team Morale` : `${effect.change} Team Morale`;
                      colorClass = effect.change > 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400';
                    }
                  }

                  if (!label) return null;

                  return (
                    <span
                      key={i}
                      className={`text-xs px-2 py-1 rounded ${colorClass}`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </button>
          ))}
        </div>

        {/* Skip option for non-urgent */}
        {currentEvent.urgency !== 'immediate' && (
          <button
            onClick={() => navigateTo('home')}
            className="w-full text-center text-gray-500 hover:text-gray-400 text-sm py-2"
          >
            Deal with this later
          </button>
        )}
      </div>
    </div>
  );
};
