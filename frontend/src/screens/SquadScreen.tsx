import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerCard } from '../components/PlayerCard';
import { Player, PlayerRole } from '../types';

type SortOption = 'name' | 'form' | 'fitness' | 'morale';
type FilterOption = 'all' | PlayerRole;

export const SquadScreen = () => {
  const { playerTeamId, teams, players, navigateTo, selectPlayer } = useGameStore();
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

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
