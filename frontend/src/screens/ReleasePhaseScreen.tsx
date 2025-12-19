import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Player } from '../types';

export const ReleasePhaseScreen = () => {
  const {
    playerTeamId,
    teams,
    players,
    season,
    releasedPlayers,
    releasePlayer,
    confirmReleases,
  } = useGameStore();

  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(
    new Set(releasedPlayers)
  );

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));

  // Sort players by contract status (expiring first)
  const sortedPlayers = [...teamPlayers].sort((a, b) => {
    // Players with expiring contracts first
    if (a.contract.yearsRemaining === 0 && b.contract.yearsRemaining > 0) return -1;
    if (b.contract.yearsRemaining === 0 && a.contract.yearsRemaining > 0) return 1;
    // Then by years remaining
    return a.contract.yearsRemaining - b.contract.yearsRemaining;
  });

  // Calculate purse refund from releases
  const calculateRefund = () => {
    return teamPlayers
      .filter((p) => selectedPlayers.has(p.id))
      .reduce((sum, p) => sum + p.contract.salary, 0);
  };

  const togglePlayerSelection = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    // Auto-released players (expired contracts) cannot be unselected
    if (player.contract.yearsRemaining === 0) return;

    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(playerId)) {
      newSelected.delete(playerId);
    } else {
      newSelected.add(playerId);
    }
    setSelectedPlayers(newSelected);
  };

  const handleConfirmReleases = () => {
    // Add all selected players to the release list
    selectedPlayers.forEach((id) => {
      if (!releasedPlayers.includes(id)) {
        releasePlayer(id);
      }
    });
    confirmReleases();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'batsman': return 'text-blue-400';
      case 'bowler': return 'text-green-400';
      case 'allrounder': return 'text-purple-400';
      case 'keeper': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const formatAmount = (lakhs: number) => {
    if (lakhs >= 100) return `${(lakhs / 100).toFixed(2)} Cr`;
    return `${lakhs} L`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gradient-to-r from-orange-900 to-amber-800 p-6 border-b border-orange-700">
        <div className="max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-bold mb-1">Release Phase</h1>
          <p className="text-orange-200">Season {season} - Mini Auction Preparation</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Info Card */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">RELEASE PHASE</h3>
          <p className="text-sm text-gray-300">
            Select players to release for the upcoming mini auction. Players with expired
            contracts (0 years remaining) are automatically released.
          </p>
          <div className="mt-3 flex justify-between items-center text-sm">
            <span className="text-gray-400">Potential Purse Refund:</span>
            <span className="text-green-400 font-bold">{formatAmount(calculateRefund())}</span>
          </div>
        </div>

        {/* Player List */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-3 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-400">YOUR SQUAD</h3>
            <span className="text-xs text-gray-500">
              {selectedPlayers.size} selected for release
            </span>
          </div>

          <div className="divide-y divide-gray-700">
            {sortedPlayers.map((player) => {
              const isExpired = player.contract.yearsRemaining === 0;
              const isSelected = selectedPlayers.has(player.id);

              return (
                <div
                  key={player.id}
                  onClick={() => togglePlayerSelection(player.id)}
                  className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-red-900/30 border-l-4 border-red-500'
                      : 'hover:bg-gray-700/50'
                  } ${isExpired ? 'opacity-75' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      isSelected
                        ? 'bg-red-600 border-red-600'
                        : 'border-gray-500'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {player.shortName}
                        {player.contract.isOverseas && (
                          <span className="text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">OS</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span className={getRoleColor(player.role)}>
                          {player.role.charAt(0).toUpperCase() + player.role.slice(1)}
                        </span>
                        <span>Age {player.age}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-medium">
                      {formatAmount(player.contract.salary)}
                    </div>
                    <div className={`text-xs ${
                      isExpired
                        ? 'text-red-400 font-medium'
                        : 'text-gray-500'
                    }`}>
                      {isExpired ? 'EXPIRED' : `${player.contract.yearsRemaining}yr left`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400">Squad After Releases:</span>
            <span className={`font-bold ${
              teamPlayers.length - selectedPlayers.size < 18 ? 'text-yellow-400' : 'text-white'
            }`}>
              {teamPlayers.length - selectedPlayers.size} players
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Overseas After Releases:</span>
            <span className="font-bold">
              {teamPlayers.filter(p => !selectedPlayers.has(p.id) && p.contract.isOverseas).length} / 8
            </span>
          </div>
        </div>

        {/* Confirm Button */}
        <button
          onClick={handleConfirmReleases}
          className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white py-4 rounded-lg font-bold text-lg transition-colors shadow-lg"
        >
          Confirm Releases & Start Mini Auction
        </button>
      </div>
    </div>
  );
};
