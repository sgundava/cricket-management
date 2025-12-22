/**
 * Events Service - Backend API integration for context-aware events
 */

import { apiPost, getBackendStatus } from './client';
import {
  ApiGenerateEventRequest,
  ApiGenerateEventResponse,
  ApiResolveEventRequest,
  ApiResolveEventResponse,
  ApiGameContext,
  ApiPlayerInfo,
  ApiEventCategory,
} from './types';
import { toApiPlayerInfo, fromApiGeneratedEvent } from './mappers';
import type { Player, GameEvent, GamePhase } from '../../types';

// ============================================
// SERVICE CONFIGURATION
// ============================================

let useBackendEvents = true;

export function setUseBackendEvents(use: boolean): void {
  useBackendEvents = use;
}

export function isUsingBackendEvents(): boolean {
  return useBackendEvents && getBackendStatus().connected;
}

// ============================================
// EVENT GENERATION
// ============================================

export interface GenerateEventParams {
  // Game context
  matchDay: number;
  season: number;
  phase: GamePhase;
  recentResults: ('win' | 'loss')[];
  currentStreak: number;
  leaguePosition: number;

  // Team state
  teamMorale: number;
  boardPatience: number;
  pressHeat: number;
  budgetRemaining?: number;
  salaryCap?: number;

  // Squad info
  teamPlayers: Player[];
  injuredPlayerIds?: string[];
  outOfFormPlayerIds?: string[];
  unhappyPlayerIds?: string[];

  // Filters
  recentEventIds?: string[];
  categoryFilter?: 'player' | 'media' | 'team' | 'board' | 'season';
  forceTrigger?: boolean;
}

export interface GenerateEventResult {
  event: GameEvent | null;
  triggered: boolean;
  usedBackend: boolean;
}

/**
 * Generate a context-aware event using backend API
 */
export async function generateEvent(
  params: GenerateEventParams
): Promise<GenerateEventResult> {
  // Convert GamePhase to API phase format
  const apiPhase = params.phase === 'pre-season' ? 'pre-season' :
                   params.phase === 'auction' ? 'pre-season' :
                   params.phase === 'season' ? 'season' :
                   params.phase === 'playoffs' ? 'playoffs' : 'off-season';

  // Try backend if enabled
  if (useBackendEvents) {
    try {
      const gameContext: ApiGameContext = {
        match_day: params.matchDay,
        season: params.season,
        phase: apiPhase,
        recent_results: params.recentResults,
        current_streak: params.currentStreak,
        league_position: params.leaguePosition,
        team_morale: params.teamMorale,
        board_patience: params.boardPatience,
        press_heat: params.pressHeat,
        budget_remaining: params.budgetRemaining,
        salary_cap_used: params.salaryCap,
        injured_players: params.injuredPlayerIds ?? [],
        out_of_form_players: params.outOfFormPlayerIds ?? [],
        unhappy_players: params.unhappyPlayerIds ?? [],
      };

      const request: ApiGenerateEventRequest = {
        game_context: gameContext,
        team_players: params.teamPlayers.map(toApiPlayerInfo),
        recent_event_ids: params.recentEventIds ?? [],
        category_filter: params.categoryFilter as ApiEventCategory | undefined,
      };

      const endpoint = params.forceTrigger
        ? '/api/v1/events/generate?force_trigger=true'
        : '/api/v1/events/generate';

      const result = await apiPost<ApiGenerateEventRequest, ApiGenerateEventResponse>(
        endpoint,
        request
      );

      if (result.ok) {
        if (result.data.event) {
          return {
            event: fromApiGeneratedEvent(result.data.event),
            triggered: true,
            usedBackend: true,
          };
        }
        return {
          event: null,
          triggered: false,
          usedBackend: true,
        };
      }

      console.warn('Backend event generation failed:', result.error);
    } catch (error) {
      console.warn('Backend event generation error:', error);
    }
  }

  // No client-side fallback for events - return null
  // The frontend can use existing random event generation as fallback if needed
  return {
    event: null,
    triggered: false,
    usedBackend: false,
  };
}

// ============================================
// EVENT RESOLUTION
// ============================================

export interface ResolveEventParams {
  eventId: string;
  chosenOptionId: string;
  playerStates: Record<string, { morale: number; form: number; fatigue: number }>;
  teamState: { pressHeat: number; boardPatience: number };
}

export interface AppliedEffect {
  playerId: string | null;
  attribute: string;
  oldValue: number;
  newValue: number;
}

export interface ResolveEventResult {
  playerEffects: AppliedEffect[];
  teamEffects: AppliedEffect[];
  narrativeResult: string;
  followUpEventId: string | null;
  usedBackend: boolean;
}

/**
 * Resolve an event with a chosen option
 */
export async function resolveEvent(
  params: ResolveEventParams
): Promise<ResolveEventResult | null> {
  if (!useBackendEvents) {
    return null;
  }

  try {
    const request: ApiResolveEventRequest = {
      event_id: params.eventId,
      chosen_option_id: params.chosenOptionId,
      player_states: Object.fromEntries(
        Object.entries(params.playerStates).map(([id, state]) => [
          id,
          {
            morale: state.morale,
            form: state.form,
            fatigue: state.fatigue,
          },
        ])
      ),
      team_state: {
        press_heat: params.teamState.pressHeat,
        board_patience: params.teamState.boardPatience,
      },
    };

    const result = await apiPost<ApiResolveEventRequest, ApiResolveEventResponse>(
      '/api/v1/events/resolve',
      request
    );

    if (result.ok) {
      return {
        playerEffects: result.data.player_effects.map(e => ({
          playerId: e.player_id ?? null,
          attribute: e.attribute,
          oldValue: e.old_value,
          newValue: e.new_value,
        })),
        teamEffects: result.data.team_effects.map(e => ({
          playerId: null,
          attribute: e.attribute,
          oldValue: e.old_value,
          newValue: e.new_value,
        })),
        narrativeResult: result.data.narrative_result,
        followUpEventId: result.data.follow_up_event_id ?? null,
        usedBackend: true,
      };
    }

    console.warn('Backend event resolution failed:', result.error);
    return null;
  } catch (error) {
    console.warn('Backend event resolution error:', error);
    return null;
  }
}

// ============================================
// TEMPLATE INFO (DEBUG)
// ============================================

export interface TemplateCount {
  category: string;
  count: number;
}

/**
 * Get event template counts for debugging
 */
export async function getTemplateCounts(): Promise<TemplateCount[] | null> {
  try {
    const result = await apiPost<object, { counts: Record<string, number>; total: number }>(
      '/api/v1/events/templates/count',
      {}
    );

    if (result.ok) {
      return Object.entries(result.data.counts).map(([category, count]) => ({
        category,
        count,
      }));
    }
    return null;
  } catch {
    return null;
  }
}
