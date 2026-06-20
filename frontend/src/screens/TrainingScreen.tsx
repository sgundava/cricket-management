import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { Player, TrainingFocus, TrainingIntensity } from '../types';
import { TRAINING_CONFIG } from '../config/gameConfig';

const FOCUS_OPTIONS: { value: TrainingFocus; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'power-hitting', label: 'Power Hitting' },
  { value: 'batting-technique', label: 'Batting Technique' },
  { value: 'pace-bowling', label: 'Pace Bowling' },
  { value: 'bowling-craft', label: 'Bowling Craft' },
  { value: 'fielding', label: 'Fielding' },
  { value: 'fitness', label: 'Fitness & Conditioning' },
];

const INTENSITIES: TrainingIntensity[] = ['light', 'normal', 'intensive'];

const categoryAvg = (player: Player, category: 'batting' | 'bowling' | 'fielding') => {
  const s = player[category] as unknown as Record<string, number>;
  const vals = Object.values(s);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

// Total remaining room to grow toward potential, across all three categories.
const growthHeadroom = (player: Player): number => {
  return (['batting', 'bowling', 'fielding'] as const).reduce(
    (sum, cat) => sum + Math.max(0, player.potential[cat] - categoryAvg(player, cat)),
    0
  );
};

const headroomLabel = (h: number): { text: string; color: string } => {
  if (h >= 25) return { text: 'High ceiling', color: 'text-green-400' };
  if (h >= 10) return { text: 'Some room', color: 'text-yellow-400' };
  return { text: 'Near peak', color: 'text-gray-500' };
};

const focusTargetText = (focus: TrainingFocus): string => {
  const skills = TRAINING_CONFIG.FOCUS_SKILLS[focus] || [];
  if (!skills.length) return 'No specific focus';
  return skills.map((s) => s.key).join(', ');
};

export const TrainingScreen = () => {
  const { playerTeamId, teams, players, navigateTo, setPlayerTraining } = useGameStore();

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const squad = useMemo(() => {
    const list = players.filter((p) => playerTeam?.squad.includes(p.id));
    // Youngest first — they have the most to gain from a focus.
    return [...list].sort((a, b) => a.age - b.age);
  }, [players, playerTeam]);

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      <header className="bg-gradient-to-r from-teal-900 to-emerald-900 p-4 border-b border-teal-700">
        <div className="max-w-lg md:max-w-3xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigateTo('club')}
            className="text-teal-200 hover:text-white text-xl"
            aria-label="Back"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold">Training Centre</h1>
            <p className="text-xs text-teal-300">
              Set a development focus for each player — applied at season's end
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-lg md:max-w-3xl mx-auto p-4 space-y-3">
        <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700 text-[11px] text-gray-400">
          A focus speeds up growth in its skills for players with room to grow, and
          slows decline for veterans. <span className="text-gray-300">Intensive</span>{' '}
          training develops faster but leaves players less fresh; <span className="text-gray-300">light</span>{' '}
          keeps them ready. Give your prospects game time and a focus to maximise growth.
        </div>

        {squad.length === 0 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center text-gray-500">
            No squad players to train.
          </div>
        )}

        {squad.map((player) => {
          const focus = player.trainingFocus || 'balanced';
          const intensity = player.trainingIntensity || 'normal';
          const headroom = headroomLabel(growthHeadroom(player));
          const hasFocus = focus !== 'balanced';

          return (
            <div key={player.id} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium text-sm">
                    {player.name}{' '}
                    <span className="text-xs text-gray-500">
                      {player.age}y · {player.role}
                    </span>
                  </div>
                  <div className={`text-[11px] ${headroom.color}`}>{headroom.text}</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {/* Focus */}
                <select
                  value={focus}
                  onChange={(e) =>
                    setPlayerTraining(player.id, e.target.value as TrainingFocus, intensity)
                  }
                  className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-2 py-2 border border-gray-600 focus:outline-none focus:border-teal-500"
                >
                  {FOCUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {/* Intensity */}
                <div
                  className={`flex rounded-lg overflow-hidden border border-gray-600 ${
                    hasFocus ? '' : 'opacity-40 pointer-events-none'
                  }`}
                >
                  {INTENSITIES.map((i) => (
                    <button
                      key={i}
                      onClick={() => setPlayerTraining(player.id, focus, i)}
                      className={`px-2.5 py-2 text-xs capitalize transition-colors ${
                        intensity === i
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>

              {hasFocus && (
                <div className="text-[10px] text-gray-500 mt-1.5">
                  Targets: {focusTargetText(focus)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
