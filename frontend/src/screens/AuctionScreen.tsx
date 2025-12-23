import { useState, useEffect, useRef, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import {
  formatAmount,
  formatAmountCompact,
  hasMinSquad,
  getSquadFillPool,
  canPickSquadFillPlayer,
} from '../data/auction';
import { formatSaveDate } from '../utils/saveManager';
import { AUCTION_CONFIG } from '../config/gameConfig';

const roleColors: Record<string, string> = {
  batsman: 'bg-orange-600',
  bowler: 'bg-green-600',
  allrounder: 'bg-purple-600',
  keeper: 'bg-blue-600',
};

const roleBadges: Record<string, string> = {
  batsman: 'BAT',
  bowler: 'BOWL',
  allrounder: 'AR',
  keeper: 'WK',
};

type BidPhase = 'waiting_for_player' | 'ai_bidding' | 'sold' | 'unsold';

export const AuctionScreen = () => {
  const {
    playerTeamId,
    teams,
    players,
    auctionState,
    unsoldPlayers,
    startMode,
    navigateTo,
    initializeAuction,
    setRetention,
    removeRetention,
    confirmRetentions,
    startBidding,
    placeBid,
    passBid,
    processAIBidRound,
    nextPlayer,
    markPlayerSold,
    markPlayerUnsold,
    setAuctionMode,
    simRestOfAuction,
    completeAuction,
    canPlayerBid,
    getNextBidAmountForPlayer,
    pickSquadFillPlayer,
    autoFillPlayerSquad,
    completeSquadFill,
  } = useGameStore();

  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<1 | 2 | 3 | 4 | null>(null);
  const [bidPhase, setBidPhase] = useState<BidPhase>('waiting_for_player');
  const [squadFillSearch, setSquadFillSearch] = useState('');
  const [squadFillRoleFilter, setSquadFillRoleFilter] = useState<string>('all');
  const [lastBidder, setLastBidder] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSlotSelection, setSaveSlotSelection] = useState<1 | 2 | 3 | null>(null);
  const [showPlayerDetail, setShowPlayerDetail] = useState(false);
  const [showSquadModal, setShowSquadModal] = useState(false);
  const [showAuctionLog, setShowAuctionLog] = useState(false);
  const [playerPassed, setPlayerPassed] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);

  // Ref to cancel AI bidding loop when player interrupts
  const cancelAIBiddingRef = useRef(false);

  // Ref to prevent auto-start effect from calling nextPlayer twice
  const hasAutoStartedRef = useRef(false);

  const { getSaveSlots, saveToSlot, resetGame } = useGameStore();
  const saveSlots = getSaveSlots();

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamState = auctionState?.teamStates[playerTeamId];

  // Initialize auction if not already done (fallback for loaded games or between-season auctions)
  useEffect(() => {
    if (!auctionState) {
      // For fresh game starts, auction is initialized in initializeGame
      // This is a fallback for loaded saves or between-season auctions
      const auctionType = startMode === 'mini-auction' ? 'mini' : 'mega';
      initializeAuction(auctionType);
    }
  }, [auctionState, initializeAuction, startMode]);

  // Auto-start bidding for mini auctions or when in bidding status with no current player
  useEffect(() => {
    if (
      auctionState &&
      auctionState.status === 'bidding' &&
      !auctionState.currentPlayer &&
      !hasAutoStartedRef.current &&
      auctionState.auctionPool.some((p) => p.status === 'available')
    ) {
      // Mark as started to prevent double-calling due to React StrictMode or re-renders
      hasAutoStartedRef.current = true;
      // Call nextPlayer to get the first player
      nextPlayer();
    }
  }, [auctionState, nextPlayer]);

  // Reset auto-start ref when auction status changes away from bidding
  useEffect(() => {
    if (auctionState?.status !== 'bidding') {
      hasAutoStartedRef.current = false;
    }
  }, [auctionState?.status]);

  // Get current player details
  const currentAuctionPlayer = auctionState?.currentPlayer;
  const currentPlayer = currentAuctionPlayer
    ? players.find((p) => p.id === currentAuctionPlayer.playerId)
    : null;

  // Reset phase when new player comes up
  useEffect(() => {
    if (currentAuctionPlayer) {
      setBidPhase('waiting_for_player');
      setLastBidder(null);
      setPlayerPassed(false);
      cancelAIBiddingRef.current = false;
    }
  }, [currentAuctionPlayer?.playerId]);

  // Handle player placing a bid
  const handlePlayerBid = () => {
    if (!canPlayerBid()) return;
    placeBid();
    setLastBidder(playerTeamId);

    // After player bids, let AI respond
    runAIResponse();
  };

  // Handle player passing
  const handlePlayerPass = () => {
    passBid();
    setPlayerPassed(true);
    cancelAIBiddingRef.current = false;

    // After player passes, let AI continue bidding among themselves
    runAIBiddingUntilDone();
  };

  // Handle player interrupting AI bidding to jump back in
  const handleInterrupt = () => {
    // Set the cancel flag
    cancelAIBiddingRef.current = true;

    // Reset the pass state in the store
    const state = useGameStore.getState();
    if (state.auctionState) {
      useGameStore.setState({
        auctionState: {
          ...state.auctionState,
          teamStates: {
            ...state.auctionState.teamStates,
            [playerTeamId]: {
              ...state.auctionState.teamStates[playerTeamId],
              hasPassedCurrentPlayer: false,
            },
          },
        },
      });
    }

    // Return to player's turn
    setPlayerPassed(false);
    setBidPhase('waiting_for_player');
  };

  // Run one round of AI bidding, then back to player
  const runAIResponse = () => {
    setBidPhase('ai_bidding');

    // Small delay for visual feedback
    setTimeout(() => {
      const hadBidder = processAIBidRound();

      if (hadBidder) {
        // AI bid - update last bidder and wait for player
        const newCurrentPlayer = useGameStore.getState().auctionState?.currentPlayer;
        setLastBidder(newCurrentPlayer?.currentBidder || null);
        setBidPhase('waiting_for_player');
      } else {
        // No AI wants to bid - player wins!
        resolveSale();
      }
    }, 600);
  };

  // AI teams bid among themselves until done (when player has passed)
  const runAIBiddingUntilDone = () => {
    setBidPhase('ai_bidding');

    const runRound = () => {
      setTimeout(() => {
        // Check if player interrupted
        if (cancelAIBiddingRef.current) {
          // Player interrupted - stop the loop (state already updated in handleInterrupt)
          return;
        }

        const hadBidder = processAIBidRound();

        if (hadBidder) {
          const newCurrentPlayer = useGameStore.getState().auctionState?.currentPlayer;
          setLastBidder(newCurrentPlayer?.currentBidder || null);
          // Continue AI bidding
          runRound();
        } else {
          // No more bidders - resolve
          resolveSale();
        }
      }, 500);
    };

    runRound();
  };

  // Resolve the current player sale
  const resolveSale = () => {
    const current = useGameStore.getState().auctionState?.currentPlayer;

    if (current?.currentBidder) {
      setBidPhase('sold');
      setLastBidder(current.currentBidder);
    } else {
      setBidPhase('unsold');
    }
  };

  // Handle continuing to next player after sale
  const handleNextPlayer = () => {
    if (bidPhase === 'sold') {
      markPlayerSold();
    } else {
      markPlayerUnsold();
    }
    nextPlayer();
    setBidPhase('waiting_for_player');
    setLastBidder(null);
  };

  // Start bidding after retention phase
  const handleStartBidding = () => {
    confirmRetentions();
    startBidding();
    setBidPhase('waiting_for_player');
  };

  // Complete auction and go to season
  const handleFinishAuction = () => {
    completeAuction();
    navigateTo('home');
  };

  // Sim rest of auction
  const handleSimRest = () => {
    simRestOfAuction();
  };

  // Handle save and exit
  const handleSaveAndExit = (slotId: 1 | 2 | 3) => {
    const success = saveToSlot(slotId);
    if (success) {
      setShowSaveModal(false);
      resetGame();
      navigateTo('home');
    }
  };

  if (!auctionState || !playerTeam || !teamState) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Loading auction...</p>
      </div>
    );
  }

  // Retention Phase UI
  if (auctionState.status === 'retention_phase') {
    return (
      <div className="min-h-screen bg-gray-900 text-white pb-24">
        <header className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            <button
              onClick={() => setShowSaveModal(true)}
              className="text-gray-400 hover:text-white text-sm"
            >
              Save & Exit
            </button>
            <div className="text-center flex-1">
              <h1 className="text-xl font-bold">Mega Auction - Retentions</h1>
              <p className="text-sm text-gray-400 mt-1">
                Choose up to 4 players to retain
              </p>
            </div>
            <div className="w-16"></div>
          </div>
        </header>

        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Purse Info */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: playerTeam.colors.primary }}
                >
                  {playerTeam.shortName}
                </div>
                <div>
                  <div className="font-semibold">{playerTeam.name}</div>
                  <div className="text-sm text-gray-400">Select your retentions</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-400">
                  {formatAmount(teamState.remainingPurse)}
                </div>
                <div className="text-xs text-gray-400">Remaining Purse</div>
              </div>
            </div>
          </div>

          {/* Retention Slots */}
          <div className="space-y-3">
            {teamState.retentions.map((slot) => {
              const retainedPlayer = slot.playerId
                ? players.find((p) => p.id === slot.playerId)
                : null;

              return (
                <div
                  key={slot.slotNumber}
                  className="bg-gray-800 rounded-xl p-4 border border-gray-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold">
                        {slot.slotNumber}
                      </div>
                      {retainedPlayer ? (
                        <div>
                          <div className="font-medium">{retainedPlayer.name}</div>
                          <div className="text-xs text-gray-400">
                            {retainedPlayer.role} • Cost: {formatAmount(slot.cost)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-500">
                          Empty Slot • Cost: {formatAmount(slot.cost)}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {retainedPlayer ? (
                        <button
                          onClick={() => removeRetention(slot.slotNumber)}
                          className="px-3 py-1 bg-red-900/50 text-red-400 rounded-lg text-sm"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedSlot(slot.slotNumber);
                            setShowRetentionModal(true);
                          }}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Confirm Button */}
          <button
            onClick={handleStartBidding}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-lg font-semibold text-lg"
          >
            Confirm Retentions & Start Auction
          </button>
        </div>

        {/* Retention Selection Modal */}
        {showRetentionModal && selectedSlot && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-700">
                <h3 className="font-bold">Select Player for Slot {selectedSlot}</h3>
              </div>
              <div className="p-4 space-y-2">
                {players
                  .filter((p) => playerTeam.squad.includes(p.id))
                  .filter(
                    (p) =>
                      !teamState.retentions.some((r) => r.playerId === p.id)
                  )
                  .map((player) => (
                    <button
                      key={player.id}
                      onClick={() => {
                        setRetention(player.id, selectedSlot);
                        setShowRetentionModal(false);
                        setSelectedSlot(null);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 flex items-center gap-3 text-left"
                    >
                      <div
                        className={`w-10 h-10 rounded-full ${roleColors[player.role]} flex items-center justify-center text-xs font-bold`}
                      >
                        {player.shortName.slice(0, 2)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{player.name}</div>
                        <div className="text-xs text-gray-400">
                          {player.role} • {player.nationality}
                        </div>
                      </div>
                      {player.contract.isOverseas && (
                        <span className="px-2 py-1 bg-blue-900/50 text-blue-400 text-xs rounded">
                          OS
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              <div className="p-4 border-t border-gray-700">
                <button
                  onClick={() => {
                    setShowRetentionModal(false);
                    setSelectedSlot(null);
                  }}
                  className="w-full bg-gray-700 text-white py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl max-w-md w-full">
              <div className="p-4 border-b border-gray-700">
                <h3 className="font-bold">Save Game</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Choose a save slot. This will exit to the main menu.
                </p>
              </div>
              <div className="p-4 space-y-2">
                {([1, 2, 3] as const).map((slotId) => {
                  const existingSlot = saveSlots.find((s) => s.id === slotId);
                  return (
                    <button
                      key={slotId}
                      onClick={() => handleSaveAndExit(slotId)}
                      className="w-full bg-gray-700 hover:bg-gray-600 rounded-lg p-3 text-left"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Slot {slotId}</span>
                        {existingSlot && (
                          <span className="text-xs text-yellow-500">Overwrite</span>
                        )}
                      </div>
                      {existingSlot ? (
                        <div className="text-xs text-gray-400 mt-1">
                          {existingSlot.name} • {formatSaveDate(existingSlot.savedAt)}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 mt-1">Empty</div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="p-4 border-t border-gray-700">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="w-full bg-gray-700 text-white py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Squad Fill Phase UI
  if (auctionState.status === 'squad_fill') {
    const playersNeeded = auctionState.settings.minSquadSize - teamState.squadSize;
    const squadFillPool = getSquadFillPool(players, teams, unsoldPlayers);

    // Filter pool based on search and role
    const filteredPool = squadFillPool.filter(({ player }) => {
      const matchesSearch =
        squadFillSearch === '' ||
        player.name.toLowerCase().includes(squadFillSearch.toLowerCase()) ||
        player.shortName.toLowerCase().includes(squadFillSearch.toLowerCase());
      const matchesRole = squadFillRoleFilter === 'all' || player.role === squadFillRoleFilter;
      return matchesSearch && matchesRole;
    });

    const canComplete = teamState.squadSize >= auctionState.settings.minSquadSize;

    return (
      <div className="min-h-screen bg-gray-900 text-white pb-24">
        <header className="bg-gray-800 p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-center">
            Squad Fill {playersNeeded > 0 ? `- Need ${playersNeeded} more` : '- Complete!'}
          </h1>
          <div className="flex justify-center gap-6 mt-2 text-sm">
            <span>
              Budget: <span className="text-green-400 font-medium">{formatAmount(teamState.remainingPurse)}</span>
            </span>
            <span>
              Squad: <span className="font-medium">{teamState.squadSize}/{auctionState.settings.minSquadSize}</span>
            </span>
            <span>
              Overseas: <span className="text-blue-400 font-medium">{teamState.overseasCount}/8</span>
            </span>
          </div>
        </header>

        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Search and Filter */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search players..."
              value={squadFillSearch}
              onChange={(e) => setSquadFillSearch(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={squadFillRoleFilter}
              onChange={(e) => setSquadFillRoleFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Roles</option>
              <option value="batsman">Batsman</option>
              <option value="bowler">Bowler</option>
              <option value="allrounder">All-rounder</option>
              <option value="keeper">Keeper</option>
            </select>
          </div>

          {/* Unsold Players Section */}
          {filteredPool.filter((p) => p.isUnsold).length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 border border-yellow-600/30">
              <h3 className="font-semibold mb-3 text-yellow-400">Unsold From Auction</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredPool
                  .filter((p) => p.isUnsold)
                  .map(({ player, basePrice }) => {
                    const { canPick, reason } = canPickSquadFillPlayer(
                      teamState,
                      player,
                      basePrice,
                      auctionState.settings
                    );
                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded ${roleColors[player.role]}`}>
                            {roleBadges[player.role]}
                          </span>
                          <span>{player.shortName}</span>
                          {player.contract.isOverseas && (
                            <span className="text-xs text-blue-400">OS</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm">{formatAmount(basePrice)}</span>
                          <button
                            onClick={() => pickSquadFillPlayer(player.id)}
                            disabled={!canPick}
                            className={`px-3 py-1 text-sm rounded ${
                              canPick
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-gray-600 cursor-not-allowed opacity-50'
                            }`}
                            title={reason}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Free Agents Section */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="font-semibold mb-3">Free Agents ({filteredPool.filter((p) => !p.isUnsold).length})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredPool
                .filter((p) => !p.isUnsold)
                .slice(0, 50) // Show first 50 to prevent performance issues
                .map(({ player, basePrice }) => {
                  const { canPick, reason } = canPickSquadFillPlayer(
                    teamState,
                    player,
                    basePrice,
                    auctionState.settings
                  );
                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded ${roleColors[player.role]}`}>
                          {roleBadges[player.role]}
                        </span>
                        <span>{player.shortName}</span>
                        {player.contract.isOverseas && (
                          <span className="text-xs text-blue-400">OS</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">{formatAmount(basePrice)}</span>
                        <button
                          onClick={() => pickSquadFillPlayer(player.id)}
                          disabled={!canPick}
                          className={`px-3 py-1 text-sm rounded ${
                            canPick
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-gray-600 cursor-not-allowed opacity-50'
                          }`}
                          title={reason}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              {filteredPool.filter((p) => !p.isUnsold).length > 50 && (
                <div className="text-center text-gray-400 text-sm py-2">
                  ...and {filteredPool.filter((p) => !p.isUnsold).length - 50} more (use search to find specific players)
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!canComplete && (
              <button
                onClick={autoFillPlayerSquad}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium"
              >
                Auto-Fill Cheapest
              </button>
            )}
            <button
              onClick={completeSquadFill}
              disabled={!canComplete}
              className={`flex-1 py-3 rounded-lg font-medium ${
                canComplete
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {canComplete ? 'Start Season' : `Need ${playersNeeded} more players`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Completed Phase UI
  if (auctionState.status === 'completed') {
    return (
      <div className="min-h-screen bg-gray-900 text-white pb-24">
        <header className="bg-gray-800 p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-center">Auction Complete</h1>
        </header>

        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Summary */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h2 className="font-semibold mb-3">Your Squad</h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-2xl font-bold">{teamState.squadSize}</div>
                <div className="text-xs text-gray-400">Players</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {formatAmountCompact(teamState.remainingPurse)}
                </div>
                <div className="text-xs text-gray-400">Remaining</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">
                  {teamState.overseasCount}
                </div>
                <div className="text-xs text-gray-400">Overseas</div>
              </div>
            </div>
          </div>

          {/* Bought Players */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="font-semibold mb-3">Players Bought</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {auctionState.soldPlayers
                .filter((p) => p.currentBidder === playerTeamId)
                .map((auctionPlayer) => {
                  const player = players.find((p) => p.id === auctionPlayer.playerId);
                  if (!player) return null;
                  return (
                    <div
                      key={auctionPlayer.playerId}
                      className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 text-xs rounded ${roleColors[player.role]}`}
                        >
                          {roleBadges[player.role]}
                        </span>
                        <span>{player.shortName}</span>
                        {player.contract.isOverseas && (
                          <span className="text-xs text-blue-400">OS</span>
                        )}
                      </div>
                      <span className="text-green-400 font-medium">
                        {formatAmount(auctionPlayer.currentBid)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          <button
            onClick={handleFinishAuction}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-semibold text-lg"
          >
            Start Season
          </button>
        </div>
      </div>
    );
  }

  // Bidding Phase UI
  const isPlayerTurn = bidPhase === 'waiting_for_player';
  const isAIBidding = bidPhase === 'ai_bidding';
  const isSold = bidPhase === 'sold';
  const isUnsold = bidPhase === 'unsold';
  const isResolved = isSold || isUnsold;

  // Check if player is highest bidder
  const playerIsHighestBidder = currentAuctionPlayer?.currentBidder === playerTeamId;

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-4">
      {/* Header */}
      <header className="bg-gray-800 p-3 border-b border-gray-700 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button
            onClick={() => setShowAuctionLog(true)}
            className="text-left hover:bg-gray-700/50 rounded-lg px-2 py-1 -ml-2 transition-colors"
          >
            <div className="text-sm text-gray-400">
              Player {auctionState.totalPlayersAuctioned}/{auctionState.auctionPool.length}
              <span className="text-blue-400 ml-1">↗</span>
            </div>
            <div className="text-xs text-yellow-400">
              {isPlayerTurn && 'Your turn to bid'}
              {isAIBidding && 'AI teams responding...'}
              {isSold && 'SOLD!'}
              {isUnsold && 'UNSOLD'}
            </div>
          </button>
          <button
            onClick={() => setShowSquadModal(true)}
            className="text-right hover:bg-gray-700/50 rounded-lg px-2 py-1 -mr-2 transition-colors"
          >
            <div className="text-sm font-medium text-green-400">
              {formatAmount(teamState.remainingPurse)}
            </div>
            <div className="text-xs text-gray-400">
              {teamState.squadSize}/{auctionState.settings.maxSquadSize} players
              <span className="text-blue-400 ml-1">↗</span>
            </div>
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-3 space-y-3">
        {/* Current Player Card */}
        {currentPlayer && currentAuctionPlayer ? (
          <div className={`bg-gray-800 rounded-xl p-4 border ${
            isSold ? 'border-green-500' : isUnsold ? 'border-red-500' : 'border-gray-700'
          }`}>
            {/* Clickable player info area */}
            <button
              onClick={() => setShowPlayerDetail(true)}
              className="w-full text-left"
            >
              <div className="flex items-start gap-4">
                {/* Player Avatar */}
                <div
                  className={`w-16 h-16 rounded-full ${roleColors[currentPlayer.role]} flex items-center justify-center text-lg font-bold`}
                >
                  {currentPlayer.shortName.slice(0, 2).toUpperCase()}
                </div>

                {/* Player Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{currentPlayer.name}</h2>
                    {currentPlayer.contract.isOverseas && (
                      <span className="px-2 py-0.5 bg-blue-900/50 text-blue-400 text-xs rounded">
                        OVERSEAS
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    {currentPlayer.role.charAt(0).toUpperCase() + currentPlayer.role.slice(1)} •{' '}
                    {currentPlayer.nationality} • Age {currentPlayer.age}
                  </div>

                  {/* Stats */}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      Batting:{' '}
                      <span className="text-orange-400">
                        {Math.round(
                          (currentPlayer.batting.technique +
                            currentPlayer.batting.power +
                            currentPlayer.batting.timing) /
                            3
                        )}
                      </span>
                    </div>
                    <div>
                      Bowling:{' '}
                      <span className="text-green-400">
                        {Math.round(
                          (currentPlayer.bowling.speed +
                            currentPlayer.bowling.accuracy +
                            currentPlayer.bowling.variation) /
                            3
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-blue-400">Tap for full stats</div>
                </div>
              </div>
            </button>

            {/* Price Display */}
            <div className="mt-4 flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
              <div>
                <div className="text-xs text-gray-400">Base Price</div>
                <div className="text-lg font-medium">
                  {formatAmount(currentAuctionPlayer.basePrice)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">Current Bid</div>
                <div className={`text-2xl font-bold ${isSold ? 'text-green-400' : isUnsold ? 'text-red-400' : 'text-green-400'}`}>
                  {formatAmount(currentAuctionPlayer.currentBid)}
                </div>
              </div>
            </div>

            {/* Current Highest Bidder */}
            {currentAuctionPlayer.currentBidder && (
              <div className="mt-2 text-center text-sm">
                <span className="text-gray-400">
                  {isResolved ? 'Sold to: ' : 'Highest Bidder: '}
                </span>
                <span
                  className={`font-medium ${
                    currentAuctionPlayer.currentBidder === playerTeamId
                      ? 'text-green-400'
                      : 'text-yellow-400'
                  }`}
                >
                  {teams.find((t) => t.id === currentAuctionPlayer.currentBidder)?.name}
                  {currentAuctionPlayer.currentBidder === playerTeamId && ' (You)'}
                </span>
              </div>
            )}

            {/* SOLD/UNSOLD Banner */}
            {isSold && (
              <div className="mt-3 bg-green-900/50 border border-green-600 rounded-lg p-2 text-center">
                <span className="text-green-400 font-bold text-lg">SOLD!</span>
              </div>
            )}
            {isUnsold && (
              <div className="mt-3 bg-red-900/50 border border-red-600 rounded-lg p-2 text-center">
                <span className="text-red-400 font-bold text-lg">UNSOLD</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
            <p className="text-gray-400">Preparing next player...</p>
          </div>
        )}

        {/* Bid Controls - Only show during player's turn */}
        {currentPlayer && currentAuctionPlayer && !isResolved && (
          <>
            {/* Normal bid/pass controls */}
            {!playerPassed && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handlePlayerBid}
                  disabled={!isPlayerTurn || !canPlayerBid()}
                  className={`py-4 rounded-lg font-semibold text-lg transition-colors ${
                    isPlayerTurn && canPlayerBid()
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isAIBidding ? 'Wait...' : `BID ${formatAmount(getNextBidAmountForPlayer())}`}
                </button>
                <button
                  onClick={handlePlayerPass}
                  disabled={
                    !isPlayerTurn ||
                    teamState.hasPassedCurrentPlayer ||
                    playerIsHighestBidder
                  }
                  className={`py-4 rounded-lg font-semibold text-lg transition-colors ${
                    isPlayerTurn && !teamState.hasPassedCurrentPlayer && !playerIsHighestBidder
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {teamState.hasPassedCurrentPlayer ? 'PASSED' : isAIBidding ? 'Wait...' : 'PASS'}
                </button>
              </div>
            )}

            {/* Jump back in button - shown when player passed and AI is bidding */}
            {playerPassed && isAIBidding && (
              <button
                onClick={handleInterrupt}
                className="w-full py-4 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-semibold text-lg animate-pulse"
              >
                JUMP BACK IN!
              </button>
            )}
          </>
        )}

        {/* Next Player Button - Show after resolution */}
        {isResolved && (
          <button
            onClick={handleNextPlayer}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-lg"
          >
            Next Player
          </button>
        )}

        {/* Turn Indicator */}
        {!isResolved && (
          <div className={`text-center py-2 rounded-lg ${
            isPlayerTurn ? 'bg-yellow-900/30 border border-yellow-700' :
            playerPassed && isAIBidding ? 'bg-yellow-900/20 border border-yellow-800' : 'bg-gray-700/30'
          }`}>
            {isPlayerTurn && (
              <span className="text-yellow-400 font-medium">Your turn - Analyze and decide</span>
            )}
            {isAIBidding && !playerPassed && (
              <span className="text-gray-400">AI teams are responding...</span>
            )}
            {playerPassed && isAIBidding && (
              <span className="text-yellow-500">You passed - Tap above to jump back in!</span>
            )}
          </div>
        )}

        {/* Bid History */}
        {currentAuctionPlayer && currentAuctionPlayer.bidHistory.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-2">Bid History</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {[...currentAuctionPlayer.bidHistory]
                .reverse()
                .map((bid, idx) => {
                  const bidTeam = teams.find((t) => t.id === bid.teamId);
                  return (
                    <div
                      key={idx}
                      className="flex justify-between text-sm"
                    >
                      <span
                        className={
                          bid.teamId === playerTeamId
                            ? 'text-green-400 font-medium'
                            : 'text-gray-300'
                        }
                      >
                        {bidTeam?.shortName}
                        {bid.teamId === playerTeamId && ' (You)'}
                      </span>
                      <span className="text-gray-400">{formatAmount(bid.amount)}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Upcoming Players Preview */}
        {(() => {
          const upcomingPlayers = auctionState.auctionPool
            .filter(p => p.status === 'available')
            .slice(0, 5);

          if (upcomingPlayers.length === 0) return null;

          return (
            <button
              onClick={() => setShowUpcoming(true)}
              className="w-full bg-gray-800 rounded-lg p-3 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Coming Up Next</span>
                <span className="text-xs text-blue-400">See all →</span>
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {upcomingPlayers.map((ap, idx) => {
                  const p = players.find(pl => pl.id === ap.playerId);
                  if (!p) return null;
                  return (
                    <div
                      key={ap.playerId}
                      className={`flex-shrink-0 w-16 text-center ${idx === 0 ? 'opacity-100' : 'opacity-60'}`}
                    >
                      <div
                        className={`w-10 h-10 mx-auto rounded-full ${roleColors[p.role]} flex items-center justify-center text-xs font-bold mb-1`}
                      >
                        {p.shortName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-xs truncate">{p.shortName}</div>
                      <div className="text-xs text-gray-500">{formatAmountCompact(ap.basePrice)}</div>
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })()}

        {/* All Teams Status */}
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
          <div className="text-xs text-gray-400 mb-2">Team Status</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {Object.entries(auctionState.teamStates).map(([teamId, state]) => {
              const team = teams.find((t) => t.id === teamId);
              const isHighestBidder = currentAuctionPlayer?.currentBidder === teamId;
              const hasPassed = state.hasPassedCurrentPlayer;

              return (
                <div
                  key={teamId}
                  className={`p-2 rounded-lg ${
                    isHighestBidder
                      ? 'bg-green-900/50 border border-green-700'
                      : hasPassed
                      ? 'bg-gray-700/30 opacity-50'
                      : 'bg-gray-700/50'
                  }`}
                >
                  <div
                    className={`font-medium ${
                      teamId === playerTeamId ? 'text-blue-400' : ''
                    }`}
                  >
                    {team?.shortName}
                  </div>
                  <div className="text-gray-400">
                    {formatAmountCompact(state.remainingPurse)}
                  </div>
                  <div className="text-gray-500">{state.squadSize} players</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mode Controls */}
        {hasMinSquad(teamState, auctionState.settings) && !isResolved && isPlayerTurn && (
          <div className="flex gap-2">
            <button
              onClick={() => setAuctionMode('spectate')}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
            >
              Spectate
            </button>
            <button
              onClick={handleSimRest}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm"
            >
              Sim Rest
            </button>
          </div>
        )}
      </div>

      {/* Player Detail Modal */}
      {showPlayerDetail && currentPlayer && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-lg">Player Details</h3>
              <button
                onClick={() => setShowPlayerDetail(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Player Header */}
              <div className="flex items-center gap-4">
                <div
                  className={`w-16 h-16 rounded-full ${roleColors[currentPlayer.role]} flex items-center justify-center text-lg font-bold`}
                >
                  {currentPlayer.shortName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{currentPlayer.name}</h2>
                  <div className="text-sm text-gray-400">
                    {currentPlayer.role.charAt(0).toUpperCase() + currentPlayer.role.slice(1)} •{' '}
                    {currentPlayer.nationality}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">
                      Age {currentPlayer.age}
                    </span>
                    {currentPlayer.contract.isOverseas && (
                      <span className="text-xs bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded">
                        Overseas
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Current Form & Fitness */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold ${
                    currentPlayer.form > 10 ? 'text-green-400' :
                    currentPlayer.form < -10 ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {currentPlayer.form > 0 ? '+' : ''}{currentPlayer.form}
                  </div>
                  <div className="text-xs text-gray-400">Form</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold ${
                    currentPlayer.fitness > 80 ? 'text-green-400' :
                    currentPlayer.fitness < 50 ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {currentPlayer.fitness}%
                  </div>
                  <div className="text-xs text-gray-400">Fitness</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold ${
                    currentPlayer.morale > 70 ? 'text-green-400' :
                    currentPlayer.morale < 40 ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {currentPlayer.morale}%
                  </div>
                  <div className="text-xs text-gray-400">Morale</div>
                </div>
              </div>

              {/* Batting Skills */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold text-orange-400 mb-3">Batting</h4>
                <div className="space-y-2">
                  {Object.entries(currentPlayer.batting).map(([skill, value]) => (
                    <div key={skill} className="flex items-center gap-2">
                      <div className="w-24 text-xs text-gray-400 capitalize">{skill}</div>
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <div className="w-8 text-xs text-right">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bowling Skills */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold text-green-400 mb-3">Bowling</h4>
                <div className="space-y-2">
                  {Object.entries(currentPlayer.bowling).map(([skill, value]) => (
                    <div key={skill} className="flex items-center gap-2">
                      <div className="w-24 text-xs text-gray-400 capitalize">{skill}</div>
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <div className="w-8 text-xs text-right">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fielding Skills */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold text-blue-400 mb-3">Fielding</h4>
                <div className="space-y-2">
                  {Object.entries(currentPlayer.fielding).map(([skill, value]) => (
                    <div key={skill} className="flex items-center gap-2">
                      <div className="w-24 text-xs text-gray-400 capitalize">{skill}</div>
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <div className="w-8 text-xs text-right">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Personality & Style */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold text-purple-400 mb-3">Profile</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-400">Batting Style: </span>
                    <span className="capitalize">{currentPlayer.battingStyle}-handed</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Bowling: </span>
                    <span className="capitalize">
                      {currentPlayer.bowlingStyle?.replace(/-/g, ' ') || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Temperament: </span>
                    <span className="capitalize">{currentPlayer.personality.temperament}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Leadership: </span>
                    <span>{currentPlayer.personality.leadership}/100</span>
                  </div>
                </div>
              </div>

              {/* Future: Season Stats placeholder */}
              <div className="bg-gray-700/30 rounded-lg p-4 border border-dashed border-gray-600">
                <h4 className="font-semibold text-gray-500 mb-2">Season Stats</h4>
                <p className="text-xs text-gray-500 italic">
                  Career statistics will be available once backend integration is complete.
                </p>
              </div>
            </div>

            {/* Close Button */}
            <div className="sticky bottom-0 bg-gray-800 p-4 border-t border-gray-700">
              <button
                onClick={() => setShowPlayerDetail(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
              >
                Back to Auction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Squad Modal */}
      {showSquadModal && teamState && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-lg">Your Squad</h3>
              <button
                onClick={() => setShowSquadModal(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Budget Summary */}
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Remaining Purse</span>
                  <span className="text-2xl font-bold text-green-400">
                    {formatAmount(teamState.remainingPurse)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Squad Size</span>
                  <span>{teamState.squadSize} / {auctionState.settings.maxSquadSize}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Overseas</span>
                  <span className={teamState.overseasCount >= auctionState.settings.maxOverseas ? 'text-red-400' : ''}>
                    {teamState.overseasCount} / {auctionState.settings.maxOverseas}
                  </span>
                </div>
              </div>

              {/* Role Breakdown */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold mb-3">Squad Composition</h4>
                <div className="space-y-3">
                  {[
                    { role: 'Batsmen', count: teamState.batsmen, ideal: 6, color: 'bg-orange-500' },
                    { role: 'Bowlers', count: teamState.bowlers, ideal: 6, color: 'bg-green-500' },
                    { role: 'All-rounders', count: teamState.allrounders, ideal: 4, color: 'bg-purple-500' },
                    { role: 'Keepers', count: teamState.keepers, ideal: 2, color: 'bg-blue-500' },
                  ].map(({ role, count, ideal, color }) => (
                    <div key={role}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{role}</span>
                        <span className={count < Math.ceil(ideal / 2) ? 'text-red-400' : count >= ideal ? 'text-green-400' : 'text-yellow-400'}>
                          {count} / {ideal} ideal
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {Array.from({ length: ideal }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-2 flex-1 rounded ${i < count ? color : 'bg-gray-700'}`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Needs Assessment */}
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Priority Needs</h4>
                <div className="space-y-1 text-sm">
                  {teamState.keepers < 1 && (
                    <div className="text-red-400">• Urgent: Need at least 1 keeper</div>
                  )}
                  {teamState.bowlers < 4 && (
                    <div className="text-red-400">• Urgent: Need more bowlers ({teamState.bowlers}/4 min)</div>
                  )}
                  {teamState.batsmen < 4 && (
                    <div className="text-yellow-400">• Need more batsmen ({teamState.batsmen}/4 min)</div>
                  )}
                  {teamState.allrounders < 2 && (
                    <div className="text-yellow-400">• Could use more all-rounders</div>
                  )}
                  {teamState.squadSize < 18 && (
                    <div className="text-gray-400">• {18 - teamState.squadSize} more players needed for minimum squad</div>
                  )}
                  {teamState.keepers >= 1 && teamState.bowlers >= 4 && teamState.batsmen >= 4 && teamState.squadSize >= 18 && (
                    <div className="text-green-400">• Squad looking balanced!</div>
                  )}
                </div>
              </div>

              {/* Players Bought */}
              {auctionState.soldPlayers.filter(p => p.currentBidder === playerTeamId).length > 0 && (
                <div className="bg-gray-700/30 rounded-lg p-4">
                  <h4 className="font-semibold mb-3">Players Bought</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {auctionState.soldPlayers
                      .filter(p => p.currentBidder === playerTeamId)
                      .map(ap => {
                        const p = players.find(pl => pl.id === ap.playerId);
                        if (!p) return null;
                        return (
                          <div key={ap.playerId} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${roleColors[p.role]}`} />
                              <span>{p.shortName}</span>
                              {p.contract.isOverseas && (
                                <span className="text-xs text-blue-400">OS</span>
                              )}
                            </div>
                            <span className="text-green-400">{formatAmount(ap.currentBid)}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="sticky bottom-0 bg-gray-800 p-4 border-t border-gray-700">
              <button
                onClick={() => setShowSquadModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
              >
                Back to Auction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Players Modal */}
      {showUpcoming && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-lg">Upcoming Players</h3>
              <button
                onClick={() => setShowUpcoming(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Summary by Role */}
              {(() => {
                const upcomingPlayers = auctionState.auctionPool
                  .filter(p => p.status === 'available')
                  .map(ap => ({
                    ...ap,
                    player: players.find(pl => pl.id === ap.playerId)
                  }))
                  .filter(ap => ap.player);

                const roleCount = {
                  batsman: upcomingPlayers.filter(ap => ap.player?.role === 'batsman').length,
                  bowler: upcomingPlayers.filter(ap => ap.player?.role === 'bowler').length,
                  allrounder: upcomingPlayers.filter(ap => ap.player?.role === 'allrounder').length,
                  keeper: upcomingPlayers.filter(ap => ap.player?.role === 'keeper').length,
                };

                const totalValue = upcomingPlayers.reduce((sum, ap) => sum + ap.basePrice, 0);

                return (
                  <>
                    {/* Overview Stats */}
                    <div className="bg-gray-700/50 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400">Players Remaining</span>
                        <span className="text-xl font-bold">{upcomingPlayers.length}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-400">
                        <span>Combined Base Value</span>
                        <span className="text-yellow-400">{formatAmount(totalValue)}</span>
                      </div>
                    </div>

                    {/* Role Breakdown */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { role: 'batsman', label: 'BAT', count: roleCount.batsman, color: 'bg-orange-600' },
                        { role: 'bowler', label: 'BOWL', count: roleCount.bowler, color: 'bg-green-600' },
                        { role: 'allrounder', label: 'AR', count: roleCount.allrounder, color: 'bg-purple-600' },
                        { role: 'keeper', label: 'WK', count: roleCount.keeper, color: 'bg-blue-600' },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="bg-gray-700/50 rounded-lg p-2 text-center">
                          <div className={`w-6 h-6 mx-auto rounded ${color} flex items-center justify-center text-xs font-bold mb-1`}>
                            {label}
                          </div>
                          <div className="text-sm font-bold">{count}</div>
                        </div>
                      ))}
                    </div>

                    {/* Player List by Role */}
                    {(['batsman', 'bowler', 'allrounder', 'keeper'] as const).map(role => {
                      const rolePlayers = upcomingPlayers.filter(ap => ap.player?.role === role);
                      if (rolePlayers.length === 0) return null;

                      return (
                        <div key={role} className="bg-gray-700/30 rounded-lg p-4">
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <span className={`w-3 h-3 rounded ${roleColors[role]}`} />
                            {role === 'batsman' ? 'Batsmen' :
                             role === 'bowler' ? 'Bowlers' :
                             role === 'allrounder' ? 'All-rounders' : 'Keepers'}
                            <span className="text-gray-500 font-normal">({rolePlayers.length})</span>
                          </h4>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {rolePlayers.map((ap, idx) => {
                              const p = ap.player!;
                              return (
                                <div
                                  key={ap.playerId}
                                  className={`flex items-center justify-between text-sm py-1 ${
                                    idx === 0 ? 'bg-gray-700/50 -mx-2 px-2 rounded' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-xs text-gray-500 w-5">#{idx + 1}</span>
                                    <span className="truncate">{p.name}</span>
                                    {p.contract.isOverseas && (
                                      <span className="text-xs text-blue-400">OS</span>
                                    )}
                                  </div>
                                  <span className="text-yellow-400 ml-2">
                                    {formatAmountCompact(ap.basePrice)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Budget Planning Tip */}
                    <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3">
                      <div className="text-sm text-yellow-400 font-medium mb-1">Budget Tip</div>
                      <div className="text-xs text-gray-300">
                        You have {formatAmount(teamState.remainingPurse)} remaining and need{' '}
                        {Math.max(0, auctionState.settings.minSquadSize - teamState.squadSize)} more players.
                        {teamState.squadSize < auctionState.settings.minSquadSize && (
                          <span className="text-yellow-400">
                            {' '}Reserve at least {formatAmount(
                              (auctionState.settings.minSquadSize - teamState.squadSize) * AUCTION_CONFIG.MIN_RESERVE_PER_SLOT
                            )} for minimum slots.
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Close Button */}
            <div className="sticky bottom-0 bg-gray-800 p-4 border-t border-gray-700">
              <button
                onClick={() => setShowUpcoming(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
              >
                Back to Auction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auction Log Modal */}
      {showAuctionLog && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-lg">Auction Log</h3>
              <button
                onClick={() => setShowAuctionLog(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-green-400">
                    {auctionState.soldPlayers.length}
                  </div>
                  <div className="text-xs text-gray-400">Sold</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-red-400">
                    {auctionState.unsoldPlayers.length}
                  </div>
                  <div className="text-xs text-gray-400">Unsold</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-gray-400">
                    {auctionState.auctionPool.filter(p => p.status === 'available').length}
                  </div>
                  <div className="text-xs text-gray-400">Remaining</div>
                </div>
              </div>

              {/* Sold Players List */}
              {auctionState.soldPlayers.length > 0 && (
                <div className="bg-gray-700/30 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-green-400">Sold Players</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {[...auctionState.soldPlayers].reverse().map(ap => {
                      const p = players.find(pl => pl.id === ap.playerId);
                      const buyerTeam = teams.find(t => t.id === ap.currentBidder);
                      if (!p) return null;
                      return (
                        <div key={ap.playerId} className="flex items-center justify-between text-sm py-1 border-b border-gray-700 last:border-0">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={`px-1.5 py-0.5 text-xs rounded ${roleColors[p.role]}`}>
                              {roleBadges[p.role]}
                            </span>
                            <span className="truncate">{p.shortName}</span>
                            {p.contract.isOverseas && (
                              <span className="text-xs text-blue-400">OS</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: buyerTeam?.colors.primary || '#666' }}
                            >
                              {buyerTeam?.shortName}
                            </span>
                            <span className="text-green-400 font-medium w-16 text-right">
                              {formatAmountCompact(ap.currentBid)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unsold Players List */}
              {auctionState.unsoldPlayers.length > 0 && (
                <div className="bg-gray-700/30 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-red-400">Unsold Players</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {auctionState.unsoldPlayers.map(ap => {
                      const p = players.find(pl => pl.id === ap.playerId);
                      if (!p) return null;
                      return (
                        <div key={ap.playerId} className="flex items-center gap-2 text-sm text-gray-400">
                          <span className={`px-1.5 py-0.5 text-xs rounded opacity-50 ${roleColors[p.role]}`}>
                            {roleBadges[p.role]}
                          </span>
                          <span>{p.shortName}</span>
                          <span className="text-xs">({formatAmountCompact(ap.basePrice)} base)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {auctionState.soldPlayers.length === 0 && auctionState.unsoldPlayers.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  No players have been auctioned yet.
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="sticky bottom-0 bg-gray-800 p-4 border-t border-gray-700">
              <button
                onClick={() => setShowAuctionLog(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
              >
                Back to Auction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
