/**
 * Save Manager - Handles multiple save slots
 *
 * Separate from the auto-save (Zustand persist) to allow:
 * - 3 manual save slots
 * - Named saves with metadata
 * - Load/delete saves
 */

import { SaveSlot, SaveData, GameState, AuctionState, LiveMatchState } from '../types';

const SAVE_PREFIX = 'cricket-manager-slot-';
const SLOTS_KEY = 'cricket-manager-slots';

export function getSaveSlots(): SaveSlot[] {
  try {
    const slotsJson = localStorage.getItem(SLOTS_KEY);
    if (!slotsJson) return [];
    return JSON.parse(slotsJson) as SaveSlot[];
  } catch {
    return [];
  }
}

export function getSaveSlot(slotId: 1 | 2 | 3): SaveSlot | null {
  const slots = getSaveSlots();
  return slots.find((s) => s.id === slotId) || null;
}

export function saveGame(
  slotId: 1 | 2 | 3,
  name: string,
  gameState: GameState,
  auctionState: AuctionState | null,
  liveMatchState: LiveMatchState | null,
  teamName: string
): boolean {
  try {
    // Create slot metadata
    const slot: SaveSlot = {
      id: slotId,
      name: name || `Save ${slotId}`,
      teamId: gameState.playerTeamId,
      teamName,
      season: gameState.season,
      matchDay: gameState.matchDay,
      phase: gameState.phase,
      savedAt: new Date().toISOString(),
    };

    // Create full save data
    const saveData: SaveData = {
      slot,
      gameState,
      auctionState,
      liveMatchState,
    };

    // Save the data
    localStorage.setItem(`${SAVE_PREFIX}${slotId}`, JSON.stringify(saveData));

    // Update slots index
    const slots = getSaveSlots().filter((s) => s.id !== slotId);
    slots.push(slot);
    slots.sort((a, b) => a.id - b.id);
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));

    return true;
  } catch (error) {
    console.error('Failed to save game:', error);
    return false;
  }
}

export function loadGame(slotId: 1 | 2 | 3): SaveData | null {
  try {
    const saveJson = localStorage.getItem(`${SAVE_PREFIX}${slotId}`);
    if (!saveJson) return null;
    return JSON.parse(saveJson) as SaveData;
  } catch (error) {
    console.error('Failed to load game:', error);
    return null;
  }
}

export function deleteSave(slotId: 1 | 2 | 3): boolean {
  try {
    localStorage.removeItem(`${SAVE_PREFIX}${slotId}`);

    // Update slots index
    const slots = getSaveSlots().filter((s) => s.id !== slotId);
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));

    return true;
  } catch (error) {
    console.error('Failed to delete save:', error);
    return false;
  }
}

export function formatSaveDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
