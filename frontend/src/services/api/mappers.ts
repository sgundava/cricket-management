/**
 * Type Mappers - Convert between frontend (camelCase) and backend (snake_case) types
 */

import type {
  Player,
  InningsState,
  MatchTactics,
  PitchConditions,
  BallOutcome,
  BallEvent,
  OverSummary,
  MatchPhase,
  TacticalApproach,
  BowlingLength,
  FieldSetting,
  GameEvent,
  EventOption,
  EventEffect,
} from '../../types';

import type {
  ApiPlayerStats,
  ApiInningsState,
  ApiBattingTactics,
  ApiBowlingTactics,
  ApiPitchConditions,
  ApiBallOutcome,
  ApiBallEvent,
  ApiOverSummary,
  ApiMatchPhase,
  ApiSimulateBallResponse,
  ApiSimulateOverResponse,
  ApiGeneratedEvent,
  ApiEventOption,
  ApiEventEffect,
  ApiBatterStats,
  ApiBowlerStats,
  ApiPlayerInfo,
} from './types';

// ============================================
// FRONTEND -> BACKEND MAPPERS
// ============================================

/**
 * Convert frontend Player to backend PlayerStats
 */
export function toApiPlayerStats(player: Player): ApiPlayerStats {
  return {
    id: player.id,
    name: player.name,
    short_name: player.shortName,
    role: player.role,
    playing_role: player.playingRole ?? null,
    batting_style: player.battingStyle,
    bowling_style: player.bowlingStyle ?? null,

    batting: {
      technique: player.batting.technique,
      power: player.batting.power,
      timing: player.batting.timing,
      temperament: player.batting.temperament,
    },
    bowling: {
      speed: player.bowling.speed,
      accuracy: player.bowling.accuracy,
      variation: player.bowling.variation,
      stamina: player.bowling.stamina,
    },
    fielding: {
      catching: player.fielding.catching,
      ground: player.fielding.ground,
      throwing: player.fielding.throwing,
      athleticism: player.fielding.athleticism,
    },

    form: player.form,
    fitness: player.fitness,
    morale: player.morale,
    fatigue: player.fatigue,

    personality: player.personality
      ? {
          temperament: player.personality.temperament,
          professionalism: player.personality.professionalism,
          ambition: player.personality.ambition,
          leadership: player.personality.leadership,
        }
      : null,
  };
}

/**
 * Convert frontend InningsState to backend InningsState
 * Note: Maps are converted to plain objects
 */
export function toApiInningsState(state: InningsState): ApiInningsState {
  // Convert Map to Record
  const batterStats: Record<string, ApiBatterStats> = {};
  state.batterStats.forEach((stats, playerId) => {
    batterStats[playerId] = {
      runs: stats.runs,
      balls: stats.balls,
      fours: stats.fours,
      sixes: stats.sixes,
    };
  });

  const bowlerStats: Record<string, ApiBowlerStats> = {};
  state.bowlerStats.forEach((stats, playerId) => {
    bowlerStats[playerId] = {
      overs: stats.overs,
      runs: stats.runs,
      wickets: stats.wickets,
      dots: stats.dots,
    };
  });

  return {
    batting_team: state.battingTeam,
    bowling_team: state.bowlingTeam,
    runs: state.runs,
    wickets: state.wickets,
    overs: Math.floor(state.overs), // Backend expects complete overs as int
    balls: state.balls % 6, // Balls in current over (0-5)
    current_batters: state.currentBatters,
    current_bowler: state.currentBowler,
    over_summaries: state.overSummaries.map(toApiOverSummary),
    fall_of_wickets: state.fallOfWickets.map((fow) => ({
      player: fow.player,
      runs: fow.runs,
      overs: fow.overs,
    })),
    batter_stats: batterStats,
    bowler_stats: bowlerStats,
    recent_balls: [], // Will be populated from overSummaries if needed
  };
}

/**
 * Convert frontend OverSummary to backend
 */
export function toApiOverSummary(summary: OverSummary): ApiOverSummary {
  return {
    over_number: summary.overNumber,
    bowler: summary.bowler,
    runs: summary.runs,
    wickets: summary.wickets,
    balls: summary.balls.map(toApiBallEvent),
  };
}

/**
 * Convert frontend BallEvent to backend
 */
export function toApiBallEvent(event: BallEvent): ApiBallEvent {
  return {
    over: event.over,
    ball: event.ball,
    batter: event.batter,
    bowler: event.bowler,
    outcome: toApiBallOutcome(event.outcome),
    narrative: event.narrative,
  };
}

/**
 * Convert frontend BallOutcome to backend
 */
export function toApiBallOutcome(outcome: BallOutcome): ApiBallOutcome {
  if (outcome.type === 'runs') {
    return {
      type: 'runs',
      runs: outcome.runs,
      boundary_saved: false,
    };
  } else if (outcome.type === 'wicket') {
    return {
      type: 'wicket',
      dismissal_type: outcome.dismissal,
      runs: outcome.runs,
    };
  } else {
    return {
      type: 'extra',
      extra_type: outcome.extraType,
      runs: outcome.runs,
    };
  }
}

/**
 * Get batting tactics for a specific phase
 */
export function toApiBattingTactics(
  tactics: MatchTactics,
  phase: MatchPhase
): ApiBattingTactics {
  return {
    approach: tactics.battingApproach[phase],
    striker_instruction: 'default',
  };
}

/**
 * Get bowling tactics for a specific phase
 */
export function toApiBowlingTactics(
  tactics: MatchTactics,
  phase: MatchPhase
): ApiBowlingTactics {
  const approach = tactics.bowlingPlan.bowlingApproach[phase];
  return {
    length: approach.length,
    field_setting: approach.field,
  };
}

/**
 * Convert raw bowling tactics to API format
 */
export function toApiBowlingTacticsRaw(
  length: BowlingLength,
  field: FieldSetting
): ApiBowlingTactics {
  return {
    length,
    field_setting: field,
  };
}

/**
 * Convert frontend PitchConditions to backend
 */
export function toApiPitchConditions(pitch: PitchConditions): ApiPitchConditions {
  return {
    pace: pitch.pace,
    spin: pitch.spin,
    bounce: pitch.bounce,
    deterioration: pitch.deterioration,
  };
}

/**
 * Get API match phase from over number
 */
export function getApiMatchPhase(over: number): ApiMatchPhase {
  if (over < 6) return 'powerplay';
  if (over < 16) return 'middle';
  return 'death';
}

/**
 * Convert Player to minimal PlayerInfo for events
 */
export function toApiPlayerInfo(player: Player): ApiPlayerInfo {
  return {
    id: player.id,
    name: player.name,
    short_name: player.shortName,
    role: player.role,
    form: player.form,
    morale: player.morale,
    contract_years: player.contract.yearsRemaining,
    is_overseas: player.contract.isOverseas,
  };
}

// ============================================
// BACKEND -> FRONTEND MAPPERS
// ============================================

/**
 * Convert backend BallOutcome to frontend
 */
export function fromApiBallOutcome(outcome: ApiBallOutcome): BallOutcome {
  if (outcome.type === 'runs') {
    return {
      type: 'runs',
      runs: outcome.runs,
    };
  } else if (outcome.type === 'wicket') {
    return {
      type: 'wicket',
      dismissal: outcome.dismissal_type,
      runs: outcome.runs ?? 0,
    };
  } else {
    return {
      type: 'extra',
      extraType: outcome.extra_type,
      runs: outcome.runs,
    };
  }
}

/**
 * Convert backend BallEvent to frontend
 */
export function fromApiBallEvent(event: ApiBallEvent): BallEvent {
  return {
    over: event.over,
    ball: event.ball,
    batter: event.batter,
    bowler: event.bowler,
    outcome: fromApiBallOutcome(event.outcome),
    narrative: event.narrative,
  };
}

/**
 * Convert backend OverSummary to frontend
 */
export function fromApiOverSummary(summary: ApiOverSummary): OverSummary {
  return {
    overNumber: summary.over_number,
    bowler: summary.bowler,
    runs: summary.runs,
    wickets: summary.wickets,
    balls: summary.balls.map(fromApiBallEvent),
  };
}

/**
 * Convert backend InningsState to frontend
 * Note: Plain objects are converted to Maps
 */
export function fromApiInningsState(state: ApiInningsState): InningsState {
  // Convert Record to Map
  const batterStats = new Map<
    string,
    { runs: number; balls: number; fours: number; sixes: number }
  >();
  Object.entries(state.batter_stats).forEach(([playerId, stats]) => {
    batterStats.set(playerId, {
      runs: stats.runs,
      balls: stats.balls,
      fours: stats.fours,
      sixes: stats.sixes,
    });
  });

  const bowlerStats = new Map<
    string,
    { overs: number; runs: number; wickets: number; dots: number }
  >();
  Object.entries(state.bowler_stats).forEach(([playerId, stats]) => {
    bowlerStats.set(playerId, {
      overs: stats.overs,
      runs: stats.runs,
      wickets: stats.wickets,
      dots: stats.dots,
    });
  });

  return {
    battingTeam: state.batting_team,
    bowlingTeam: state.bowling_team,
    runs: state.runs,
    wickets: state.wickets,
    overs: state.overs + state.balls / 10, // Combine to fractional overs (e.g., 14.3)
    balls: state.balls, // Balls in current over (0-5), NOT total balls
    currentBatters: state.current_batters,
    currentBowler: state.current_bowler,
    overSummaries: state.over_summaries.map(fromApiOverSummary),
    fallOfWickets: state.fall_of_wickets.map((fow) => ({
      player: fow.player,
      runs: fow.runs,
      overs: fow.overs,
    })),
    batterStats,
    bowlerStats,
  };
}

/**
 * Parse simulate ball response into usable format
 */
export interface ParsedBallResult {
  outcome: BallOutcome;
  narrative: string;
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
  currentBatters: [string, string];
  strikerChanged: boolean;
  inningsComplete: boolean;
  newBatsmanNeeded: boolean;
  context: {
    batsmanState: 'new' | 'settling' | 'set';
    pressureLevel: 'low' | 'medium' | 'high';
    momentum: 'batting' | 'neutral' | 'bowling';
  };
}

export function parseBallResponse(response: ApiSimulateBallResponse): ParsedBallResult {
  return {
    outcome: fromApiBallOutcome(response.outcome),
    narrative: response.narrative,
    runs: response.updated_state.runs,
    wickets: response.updated_state.wickets,
    overs: response.updated_state.overs,
    balls: response.updated_state.balls,
    currentBatters: response.updated_state.current_batters,
    strikerChanged: response.updated_state.striker_changed,
    inningsComplete: response.updated_state.innings_complete,
    newBatsmanNeeded: response.updated_state.new_batsman_needed,
    context: {
      batsmanState: response.context_updates.batsman_state,
      pressureLevel: response.context_updates.pressure_level,
      momentum: response.context_updates.momentum,
    },
  };
}

/**
 * Parse simulate over response into usable format
 */
export interface ParsedOverResult {
  overSummary: OverSummary;
  updatedInnings: InningsState;
  inningsComplete: boolean;
  narratives: string[];
  recommendedNextBowler: string | null;
}

export function parseOverResponse(response: ApiSimulateOverResponse): ParsedOverResult {
  return {
    overSummary: fromApiOverSummary(response.over_summary),
    updatedInnings: fromApiInningsState(response.updated_innings_state),
    inningsComplete: response.innings_complete,
    narratives: response.narratives,
    recommendedNextBowler: response.recommended_next_bowler ?? null,
  };
}

/**
 * Convert API event to frontend GameEvent
 */
export function fromApiGeneratedEvent(event: ApiGeneratedEvent): GameEvent {
  return {
    id: event.id,
    type: 'random', // Backend events are always "random" type
    category: event.category as 'player' | 'media' | 'team' | 'board',
    title: event.title,
    description: event.description,
    involvedPlayers: event.involved_players,
    urgency: event.urgency,
    options: event.options.map(fromApiEventOption),
    createdAt: new Date().toISOString(),
    resolved: false,
  };
}

/**
 * Convert API event option to frontend
 */
export function fromApiEventOption(option: ApiEventOption): EventOption {
  return {
    id: option.id,
    label: option.label,
    description: option.description,
    effects: option.effects.map(fromApiEventEffect),
  };
}

/**
 * Convert API event effect to frontend
 */
export function fromApiEventEffect(effect: ApiEventEffect): EventEffect {
  return {
    target: effect.target,
    targetId: effect.target_id ?? undefined,
    attribute: effect.attribute,
    change: effect.change,
  };
}
