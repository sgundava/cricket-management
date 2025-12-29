import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerCard } from '../components/PlayerCard';
import { Player, PlayerRole } from '../types';
import { COUNTRIES } from '../data/countries';

type SortOption = 'name' | 'form' | 'fitness' | 'morale' | 'overall';
type FilterOption = 'all' | PlayerRole;
type PoolFilter = 'selected' | 'available' | 'all';

export const SquadScreen = () => {
  const { playerTeamId, teams, players, navigateTo, selectPlayer, gameMode, country } = useGameStore();
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [poolFilter, setPoolFilter] = useState<PoolFilter>('all');

  // International Mode Squad Screen
  if (gameMode === 'international' && country) {
    const countryConfig = COUNTRIES[country];
    const nationalityName = countryConfig?.name; // e.g., 'India', 'Australia'

    // Filter players by nationality matching the selected country
    const nationalPool = players.filter(p => p.nationality === nationalityName);

    // Apply role filter
    const filteredPool = filterBy === 'all'
      ? nationalPool
      : nationalPool.filter(p => p.role === filterBy);

    // Apply sort
    const sortedPool = [...filteredPool].sort((a, b) => {
      switch (sortBy) {
        case 'form':
          return b.form - a.form;
        case 'fitness':
          return b.fitness - a.fitness;
        case 'morale':
          return b.morale - a.morale;
        case 'overall':
          const aOverall = (a.batting.technique + a.batting.power + a.bowling.accuracy + a.bowling.variation) / 4;
          const bOverall = (b.batting.technique + b.batting.power + b.bowling.accuracy + b.bowling.variation) / 4;
          return bOverall - aOverall;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    // Group by role
    const groupedPlayers: Record<PlayerRole, Player[]> = {
      batsman: sortedPool.filter((p) => p.role === 'batsman'),
      keeper: sortedPool.filter((p) => p.role === 'keeper'),
      allrounder: sortedPool.filter((p) => p.role === 'allrounder'),
      bowler: sortedPool.filter((p) => p.role === 'bowler'),
    };

    const handlePlayerClick = (playerId: string) => {
      selectPlayer(playerId);
      navigateTo('player-detail');
    };

    return (
      <div className="min-h-screen bg-gray-900 text-white pb-24">
        {/* Header */}
        <header className="bg-gradient-to-r from-blue-900 to-indigo-900 p-4 border-b border-blue-700 sticky top-0 z-10">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{countryConfig?.flag}</span>
              <h1 className="text-xl font-bold">National Squad</h1>
            </div>
            <div className="flex gap-3 text-sm text-blue-300">
              <span>{nationalPool.length} players in pool</span>
            </div>
          </div>
        </header>

        {/* Squad Summary */}
        <div className="max-w-lg mx-auto p-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">SQUAD COMPOSITION</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-orange-900/30 rounded-lg p-2">
                <div className="text-lg font-bold text-orange-400">
                  {nationalPool.filter(p => p.role === 'batsman').length}
                </div>
                <div className="text-xs text-gray-500">Batters</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-2">
                <div className="text-lg font-bold text-purple-400">
                  {nationalPool.filter(p => p.role === 'bowler').length}
                </div>
                <div className="text-xs text-gray-500">Bowlers</div>
              </div>
              <div className="bg-green-900/30 rounded-lg p-2">
                <div className="text-lg font-bold text-green-400">
                  {nationalPool.filter(p => p.role === 'allrounder').length}
                </div>
                <div className="text-xs text-gray-500">All-rounders</div>
              </div>
              <div className="bg-blue-900/30 rounded-lg p-2">
                <div className="text-lg font-bold text-blue-400">
                  {nationalPool.filter(p => p.role === 'keeper').length}
                </div>
                <div className="text-xs text-gray-500">Keepers</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="max-w-lg mx-auto px-4 sticky top-[88px] bg-gray-900 z-10 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {(['all', 'batsman', 'keeper', 'allrounder', 'bowler'] as FilterOption[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setFilterBy(filter)}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors
                  ${filterBy === filter
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}s
              </button>
            ))}
          </div>

          <div className="flex justify-end mt-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="name">Sort by Name</option>
              <option value="overall">Sort by Skill</option>
              <option value="form">Sort by Form</option>
              <option value="fitness">Sort by Fitness</option>
              <option value="morale">Sort by Morale</option>
            </select>
          </div>
        </div>

        {/* Player List */}
        <div className="max-w-lg mx-auto px-4 space-y-6">
          {filterBy === 'all' ? (
            // Show grouped by role
            Object.entries(groupedPlayers).map(([role, rolePlayers]) => (
              rolePlayers.length > 0 && (
                <div key={role}>
                  <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase">
                    {role === 'keeper' ? 'Wicketkeepers' : role + 's'}
                  </h2>
                  <div className="space-y-2">
                    {rolePlayers.map((player) => (
                      <PlayerCard
                        key={player.id}
                        player={player}
                        onClick={() => handlePlayerClick(player.id)}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )
            ))
          ) : (
            // Show flat list
            <div className="space-y-2">
              {sortedPool.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onClick={() => handlePlayerClick(player.id)}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Franchise Mode Squad Screen (original code)
  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));

  // Filter
  const filteredPlayers = filterBy === 'all'
    ? teamPlayers
    : teamPlayers.filter((p) => p.role === filterBy);

  // Sort
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    switch (sortBy) {
      case 'form':
        return b.form - a.form;
      case 'fitness':
        return b.fitness - a.fitness;
      case 'morale':
        return b.morale - a.morale;
      default:
        return a.name.localeCompare(b.name);
    }
  });

  // Group by role for display
  const groupedPlayers: Record<PlayerRole, Player[]> = {
    batsman: sortedPlayers.filter((p) => p.role === 'batsman'),
    keeper: sortedPlayers.filter((p) => p.role === 'keeper'),
    allrounder: sortedPlayers.filter((p) => p.role === 'allrounder'),
    bowler: sortedPlayers.filter((p) => p.role === 'bowler'),
  };

  const handlePlayerClick = (playerId: string) => {
    selectPlayer(playerId);
    navigateTo('player-detail');
  };

  const overseasCount = teamPlayers.filter((p) => p.contract.isOverseas).length;

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold mb-2">Squad</h1>

          <div className="flex gap-2 text-sm text-gray-400">
            <span>{teamPlayers.length} players</span>
            <span>•</span>
            <span>{overseasCount}/8 overseas</span>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-lg mx-auto p-4 sticky top-[72px] bg-gray-900 z-10">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(['all', 'batsman', 'keeper', 'allrounder', 'bowler'] as FilterOption[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterBy(filter)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors
                ${filterBy === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}s
            </button>
          ))}
        </div>

        <div className="flex justify-end mt-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="name">Sort by Name</option>
            <option value="form">Sort by Form</option>
            <option value="fitness">Sort by Fitness</option>
            <option value="morale">Sort by Morale</option>
          </select>
        </div>
      </div>

      {/* Player List */}
      <div className="max-w-lg mx-auto px-4 space-y-6">
        {filterBy === 'all' ? (
          // Show grouped by role
          Object.entries(groupedPlayers).map(([role, rolePlayers]) => (
            rolePlayers.length > 0 && (
              <div key={role}>
                <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase">
                  {role === 'keeper' ? 'Wicketkeepers' : role + 's'}
                </h2>
                <div className="space-y-2">
                  {rolePlayers.map((player) => (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      onClick={() => handlePlayerClick(player.id)}
                      compact
                    />
                  ))}
                </div>
              </div>
            )
          ))
        ) : (
          // Show flat list
          <div className="space-y-2">
            {sortedPlayers.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                onClick={() => handlePlayerClick(player.id)}
                compact
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
