import { useState, useMemo, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerCard } from '../components/PlayerCard';
import { Player, MatchTactics, TacticalApproach, PlayerInstruction, BattingInstruction, BowlingInstruction, BowlingLength, FieldSetting, BowlingApproach } from '../types';

type Step = 'select' | 'tactics' | 'review';

const BATTING_INSTRUCTIONS: { value: BattingInstruction; label: string; desc: string }[] = [
  { value: 'default', label: 'Default', desc: 'Bat in assigned order' },
  { value: 'promote', label: 'Promote', desc: 'Send up the order when needed' },
  { value: 'finisher', label: 'Finisher', desc: 'Save for death overs' },
  { value: 'anchor', label: 'Anchor', desc: 'Play steady, rotate strike' },
];

const BOWLING_INSTRUCTIONS: { value: BowlingInstruction; label: string; desc: string }[] = [
  { value: 'default', label: 'Default', desc: 'Bowl full quota if needed' },
  { value: 'max-2-overs', label: 'Max 2 Overs', desc: 'Limit to 2 overs' },
  { value: 'max-3-overs', label: 'Max 3 Overs', desc: 'Limit to 3 overs' },
  { value: 'death-specialist', label: 'Death Overs', desc: 'Save for overs 16-20' },
  { value: 'powerplay-only', label: 'Powerplay Only', desc: 'Bowl in overs 1-6' },
];

const BOWLING_LENGTH_OPTIONS: { value: BowlingLength; label: string; desc: string }[] = [
  { value: 'good-length', label: 'Good Length', desc: 'Balanced, default approach' },
  { value: 'short', label: 'Short', desc: 'Bouncers, needs pace' },
  { value: 'yorkers', label: 'Yorkers', desc: 'Death specialty, needs accuracy' },
  { value: 'full-pitched', label: 'Full', desc: 'Swing bowling, wicket-taking' },
];

const FIELD_SETTING_OPTIONS: { value: FieldSetting; label: string; desc: string }[] = [
  { value: 'attacking', label: 'Attacking', desc: 'More catchers, wicket-focused' },
  { value: 'balanced', label: 'Balanced', desc: 'Standard field' },
  { value: 'defensive', label: 'Defensive', desc: 'Boundary protection' },
  { value: 'death-field', label: 'Death Field', desc: 'Long boundaries covered' },
];

export const MatchPrepScreen = () => {
  const {
    selectedMatchId,
    playerTeamId,
    teams,
    players,
    fixtures,
    setMatchTactics,
    navigateTo,
  } = useGameStore();

  const [step, setStep] = useState<Step>('select');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [battingApproach, setBattingApproach] = useState({
    powerplay: 'aggressive' as TacticalApproach,
    middle: 'balanced' as TacticalApproach,
    death: 'aggressive' as TacticalApproach,
  });
  const [bowlingApproach, setBowlingApproach] = useState<BowlingApproach>({
    powerplay: { length: 'full-pitched', field: 'attacking' },
    middle: { length: 'good-length', field: 'balanced' },
    death: { length: 'yorkers', field: 'death-field' },
  });
  const [tacticsTab, setTacticsTab] = useState<'batting' | 'bowling'>('batting');
  const [playerInstructions, setPlayerInstructions] = useState<PlayerInstruction[]>([]);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);

  const match = fixtures.find((m) => m.id === selectedMatchId);
  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));

  const opponent = match
    ? teams.find((t) => t.id === (match.homeTeam === playerTeamId ? match.awayTeam : match.homeTeam))
    : null;

  // Prevent replaying completed or in-progress matches
  useEffect(() => {
    if (match && match.status !== 'upcoming') {
      navigateTo('home');
    }
  }, [match, navigateTo]);

  // Count overseas players in selection
  const overseasCount = useMemo(
    () => selectedPlayers.filter((id) => players.find((p) => p.id === id)?.contract.isOverseas).length,
    [selectedPlayers, players]
  );

  // Validation
  const hasKeeper = useMemo(
    () => selectedPlayers.some((id) => players.find((p) => p.id === id)?.role === 'keeper'),
    [selectedPlayers, players]
  );

  const bowlerCount = useMemo(
    () => selectedPlayers.filter((id) => {
      const p = players.find((pl) => pl.id === id);
      return p?.role === 'bowler' || p?.role === 'allrounder';
    }).length,
    [selectedPlayers, players]
  );

  // Helper functions for player instructions
  const getPlayerInstruction = (playerId: string): PlayerInstruction => {
    return playerInstructions.find((pi) => pi.playerId === playerId) || { playerId };
  };

  const updatePlayerInstruction = (playerId: string, updates: Partial<PlayerInstruction>) => {
    setPlayerInstructions((prev) => {
      const existing = prev.find((pi) => pi.playerId === playerId);
      if (existing) {
        return prev.map((pi) => (pi.playerId === playerId ? { ...pi, ...updates } : pi));
      }
      return [...prev, { playerId, ...updates }];
    });
  };

  const hasCustomInstruction = (playerId: string): boolean => {
    const instr = playerInstructions.find((pi) => pi.playerId === playerId);
    return !!(instr && (instr.batting !== 'default' || instr.bowling !== 'default'));
  };

  // Auto-select best XI based on fitness, form, and role balance
  const autoSelectXI = () => {
    const available = [...teamPlayers];
    const selected: Player[] = [];
    let overseasUsed = 0;

    // Helper to check if we can add a player
    const canAdd = (p: Player) => {
      if (p.contract.isOverseas && overseasUsed >= 4) return false;
      return true;
    };

    // Helper to add player to selection
    const addPlayer = (p: Player) => {
      selected.push(p);
      if (p.contract.isOverseas) overseasUsed++;
      const idx = available.findIndex((a) => a.id === p.id);
      if (idx !== -1) available.splice(idx, 1);
    };

    // Score players: prefer low fatigue, high form, high fitness
    const scorePlayer = (p: Player) => {
      let score = 100;
      score -= p.fatigue * 0.5; // Fatigue penalty
      score += p.form * 2; // Form bonus (-20 to +20 → -40 to +40)
      score += p.fitness * 0.3; // Fitness bonus
      // Skill bonus based on role
      if (p.role === 'batsman') score += (p.batting.technique + p.batting.power) / 4;
      if (p.role === 'bowler') score += (p.bowling.accuracy + p.bowling.variation) / 4;
      if (p.role === 'allrounder') score += (p.batting.technique + p.bowling.accuracy) / 4;
      if (p.role === 'keeper') score += (p.batting.technique + p.fielding.catching) / 4;
      return score;
    };

    // Sort by score
    available.sort((a, b) => scorePlayer(b) - scorePlayer(a));

    // 1. Pick best keeper
    const keepers = available.filter((p) => p.role === 'keeper' && canAdd(p));
    if (keepers.length > 0) {
      keepers.sort((a, b) => scorePlayer(b) - scorePlayer(a));
      addPlayer(keepers[0]);
    }

    // 2. Pick 4 bowlers (prefer pure bowlers)
    const bowlers = available.filter((p) => p.role === 'bowler' && canAdd(p));
    bowlers.sort((a, b) => scorePlayer(b) - scorePlayer(a));
    let bowlersAdded = 0;
    for (const b of bowlers) {
      if (bowlersAdded >= 4) break;
      if (canAdd(b)) {
        addPlayer(b);
        bowlersAdded++;
      }
    }

    // 3. Pick 2 allrounders
    const allrounders = available.filter((p) => p.role === 'allrounder' && canAdd(p));
    allrounders.sort((a, b) => scorePlayer(b) - scorePlayer(a));
    let arAdded = 0;
    for (const ar of allrounders) {
      if (arAdded >= 2) break;
      if (canAdd(ar)) {
        addPlayer(ar);
        arAdded++;
      }
    }

    // 4. Fill remaining slots with batsmen (need 11 - selected.length)
    const batsmen = available.filter((p) => p.role === 'batsman' && canAdd(p));
    batsmen.sort((a, b) => scorePlayer(b) - scorePlayer(a));
    for (const bat of batsmen) {
      if (selected.length >= 11) break;
      if (canAdd(bat)) {
        addPlayer(bat);
      }
    }

    // 5. If still not 11, fill with anyone available
    for (const p of available) {
      if (selected.length >= 11) break;
      if (canAdd(p)) {
        addPlayer(p);
      }
    }

    // Order for batting: keeper first (if opening style), then batsmen, allrounders, bowlers
    // For now: batsmen first, keeper, allrounders, bowlers
    const ordered: Player[] = [];
    const bats = selected.filter((p) => p.role === 'batsman');
    const keeper = selected.filter((p) => p.role === 'keeper');
    const ars = selected.filter((p) => p.role === 'allrounder');
    const bwls = selected.filter((p) => p.role === 'bowler');

    // Top order: best 3 batsmen
    ordered.push(...bats.slice(0, 3));
    // Keeper at 4
    ordered.push(...keeper);
    // Remaining batsmen
    ordered.push(...bats.slice(3));
    // Allrounders
    ordered.push(...ars);
    // Bowlers at the end
    ordered.push(...bwls);

    setSelectedPlayers(ordered.map((p) => p.id));
  };

  const togglePlayer = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    if (selectedPlayers.includes(playerId)) {
      setSelectedPlayers(selectedPlayers.filter((id) => id !== playerId));
    } else {
      // Check constraints
      if (selectedPlayers.length >= 11) return;
      if (player.contract.isOverseas && overseasCount >= 4) return;

      setSelectedPlayers([...selectedPlayers, playerId]);
    }
  };

  const movePlayer = (playerId: string, direction: 'up' | 'down') => {
    const index = selectedPlayers.indexOf(playerId);
    if (index === -1) return;

    const newOrder = [...selectedPlayers];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= selectedPlayers.length) return;

    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setSelectedPlayers(newOrder);
  };

  const handleConfirmTactics = () => {
    if (!match || selectedPlayers.length !== 11) return;

    // Find captain (highest leadership among selected)
    const selectedPlayerObjects = selectedPlayers
      .map((id) => players.find((p) => p.id === id)!)
      .filter(Boolean);

    const captain = selectedPlayerObjects.reduce((best, p) =>
      p.personality.leadership > (best?.personality.leadership || 0) ? p : best
    );

    // Find keeper
    const keeper = selectedPlayerObjects.find((p) => p.role === 'keeper');

    // Find bowlers for opening and death
    const bowlers = selectedPlayerObjects.filter(
      (p) => p.role === 'bowler' || p.role === 'allrounder'
    );
    const fastBowlers = bowlers.filter(
      (p) => p.bowlingStyle?.includes('fast') || p.bowlingStyle?.includes('medium')
    );

    const tactics: MatchTactics = {
      playingXI: selectedPlayers,
      captain: captain?.id || selectedPlayers[0],
      wicketkeeper: keeper?.id || selectedPlayers[0],
      battingApproach,
      bowlingPlan: {
        openingBowlers: [
          fastBowlers[0]?.id || bowlers[0]?.id || selectedPlayers[0],
          fastBowlers[1]?.id || bowlers[1]?.id || selectedPlayers[1],
        ],
        deathBowler: fastBowlers[0]?.id || bowlers[0]?.id || selectedPlayers[0],
        spinStrategy: 'middle',
        bowlingApproach,
      },
      playerInstructions: playerInstructions.filter((pi) => selectedPlayers.includes(pi.playerId)),
    };

    setMatchTactics(match.id, playerTeamId, tactics);
    navigateTo('match-live');
  };

  if (!match || !playerTeam || !opponent) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>No match selected</p>
      </div>
    );
  }

  // Warnings
  const warnings: string[] = [];
  if (selectedPlayers.length > 0 && !hasKeeper) {
    warnings.push('No wicketkeeper selected');
  }
  if (selectedPlayers.length > 0 && bowlerCount < 5) {
    warnings.push(`Only ${bowlerCount} bowling options`);
  }
  selectedPlayers.forEach((id) => {
    const p = players.find((pl) => pl.id === id);
    if (p && p.fatigue > 70) {
      warnings.push(`${p.shortName} is fatigued (${p.fatigue}%)`);
    }
    if (p && p.form < -8) {
      warnings.push(`${p.shortName} is in poor form (${p.form})`);
    }
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700 sticky top-0 z-20">
        <div className="max-w-lg mx-auto">
          <div className="flex justify-between items-center mb-2">
            <button onClick={() => navigateTo('home')} className="text-blue-400">
              ← Back
            </button>
            <span className="text-sm text-gray-400">vs {opponent.shortName}</span>
          </div>

          {/* Steps */}
          <div className="flex gap-2">
            {(['select', 'tactics', 'review'] as Step[]).map((s, i) => (
              <button
                key={s}
                onClick={() => s === 'select' || (s === 'tactics' && selectedPlayers.length === 11) ? setStep(s) : null}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
                  ${step === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                  }
                  ${s !== 'select' && selectedPlayers.length < 11 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4">
        {/* Step: Select XI */}
        {step === 'select' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                Playing XI ({selectedPlayers.length}/11)
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={autoSelectXI}
                  className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-lg transition-colors"
                >
                  Auto-Select
                </button>
                <span className={`text-sm ${overseasCount > 4 ? 'text-red-400' : 'text-gray-400'}`}>
                  Overseas: {overseasCount}/4
                </span>
              </div>
            </div>

            {/* Selected players (reorderable) */}
            {selectedPlayers.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                <h3 className="text-sm text-gray-400 mb-2">Batting Order (tap player for instructions)</h3>
                <div className="space-y-2">
                  {selectedPlayers.map((id, index) => {
                    const player = players.find((p) => p.id === id);
                    if (!player) return null;
                    const canBowl = player.role === 'bowler' || player.role === 'allrounder';
                    const instr = getPlayerInstruction(id);
                    const hasCustom = hasCustomInstruction(id);
                    const isEditing = editingPlayer === id;

                    return (
                      <div key={id} className="space-y-1">
                        <div
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
                            ${isEditing ? 'bg-blue-900/50 border border-blue-700' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                          onClick={() => setEditingPlayer(isEditing ? null : id)}
                        >
                          <span className="text-gray-500 w-6">{index + 1}.</span>
                          <span className="flex-1">
                            {player.shortName}
                            {hasCustom && <span className="ml-2 text-xs text-blue-400">*</span>}
                          </span>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => movePlayer(id, 'up')}
                              className="px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500"
                              disabled={index === 0}
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => movePlayer(id, 'down')}
                              className="px-2 py-1 text-xs bg-gray-600 rounded hover:bg-gray-500"
                              disabled={index === selectedPlayers.length - 1}
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => togglePlayer(id)}
                              className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-500"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Inline instruction editor */}
                        {isEditing && (
                          <div className="ml-6 p-3 bg-gray-900 rounded-lg border border-gray-700 space-y-3">
                            <div>
                              <label className="text-xs text-gray-400 block mb-1">Batting</label>
                              <div className="flex flex-wrap gap-1">
                                {BATTING_INSTRUCTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    onClick={() => updatePlayerInstruction(id, { batting: opt.value })}
                                    className={`px-2 py-1 text-xs rounded transition-colors
                                      ${(instr.batting || 'default') === opt.value
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {canBowl && (
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Bowling</label>
                                <div className="flex flex-wrap gap-1">
                                  {BOWLING_INSTRUCTIONS.map((opt) => (
                                    <button
                                      key={opt.value}
                                      onClick={() => updatePlayerInstruction(id, { bowling: opt.value })}
                                      className={`px-2 py-1 text-xs rounded transition-colors
                                        ${(instr.bowling || 'default') === opt.value
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-yellow-400 mb-2">Warnings</h3>
                <ul className="text-sm text-yellow-300 space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Available players */}
            <div>
              <h3 className="text-sm text-gray-400 mb-2">Available Players</h3>
              <div className="space-y-2">
                {teamPlayers
                  .filter((p) => !selectedPlayers.includes(p.id))
                  .map((player) => (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      onClick={() => togglePlayer(player.id)}
                      compact
                      selected={false}
                    />
                  ))}
              </div>
            </div>

            {selectedPlayers.length === 11 && (
              <button
                onClick={() => setStep('tactics')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
              >
                Continue to Tactics →
              </button>
            )}
          </div>
        )}

        {/* Step: Tactics */}
        {step === 'tactics' && (
          <div className="space-y-4">
            {/* Tabs for Batting/Bowling */}
            <div className="flex gap-2 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setTacticsTab('batting')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                  ${tacticsTab === 'batting' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Batting Tactics
              </button>
              <button
                onClick={() => setTacticsTab('bowling')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                  ${tacticsTab === 'bowling' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                Bowling Tactics
              </button>
            </div>

            {/* Batting Approach Tab */}
            {tacticsTab === 'batting' && (
              <>
                <h2 className="text-lg font-semibold">Batting Approach</h2>
                {(['powerplay', 'middle', 'death'] as const).map((phase) => (
                  <div key={phase} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                    <h3 className="text-sm text-gray-400 mb-3 capitalize">
                      {phase === 'powerplay' ? 'Powerplay (1-6)' : phase === 'middle' ? 'Middle Overs (7-15)' : 'Death (16-20)'}
                    </h3>
                    <div className="flex gap-2">
                      {(['aggressive', 'balanced', 'cautious'] as TacticalApproach[]).map((approach) => (
                        <button
                          key={approach}
                          onClick={() => setBattingApproach({ ...battingApproach, [phase]: approach })}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors
                            ${battingApproach[phase] === approach
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                        >
                          {approach.charAt(0).toUpperCase() + approach.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Bowling Approach Tab */}
            {tacticsTab === 'bowling' && (
              <>
                <h2 className="text-lg font-semibold">Bowling Tactics</h2>
                {(['powerplay', 'middle', 'death'] as const).map((phase) => (
                  <div key={phase} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                    <h3 className="text-sm text-gray-400 mb-3">
                      {phase === 'powerplay' ? 'Powerplay (1-6)' : phase === 'middle' ? 'Middle Overs (7-15)' : 'Death (16-20)'}
                    </h3>

                    {/* Bowling Length */}
                    <div className="mb-3">
                      <label className="text-xs text-gray-500 mb-1 block">Bowling Length</label>
                      <div className="flex gap-1">
                        {BOWLING_LENGTH_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setBowlingApproach({
                              ...bowlingApproach,
                              [phase]: { ...bowlingApproach[phase], length: opt.value }
                            })}
                            className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-colors
                              ${bowlingApproach[phase].length === opt.value
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                              }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Field Setting */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Field Setting</label>
                      <div className="flex gap-1">
                        {FIELD_SETTING_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setBowlingApproach({
                              ...bowlingApproach,
                              [phase]: { ...bowlingApproach[phase], field: opt.value }
                            })}
                            className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-colors
                              ${bowlingApproach[phase].field === opt.value
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                              }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep('select')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium"
              >
                ← Back
              </button>
              <button
                onClick={handleConfirmTactics}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-medium"
              >
                Start Match
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
