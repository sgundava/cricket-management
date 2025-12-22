/**
 * Match Service - Backend API integration with client-side fallback
 */

import { apiPost, getBackendStatus } from './client';
import {
  ApiSimulateBallRequest,
  ApiSimulateBallResponse,
  ApiSimulateOverRequest,
  ApiSimulateOverResponse,
  ApiBowlerRecommendRequest,
  ApiBowlerRecommendResponse,
} from './types';
import {
  toApiPlayerStats,
  toApiInningsState,
  toApiBattingTactics,
  toApiBowlingTacticsRaw,
  toApiPitchConditions,
  getApiMatchPhase,
  parseBallResponse,
  parseOverResponse,
  ParsedBallResult,
  ParsedOverResult,
} from './mappers';
import {
  simulateBall as clientSimulateBall,
  simulateOver as clientSimulateOver,
  selectSmartBowler as clientSelectSmartBowler,
  getPhase,
} from '../../engine/matchEngine';
import type {
  Player,
  InningsState,
  MatchTactics,
  PitchConditions,
  BallOutcome,
  OverSummary,
  BowlingLength,
  FieldSetting,
  MatchPhase,
} from '../../types';

// ============================================
// SERVICE CONFIGURATION
// ============================================

let useBackendSimulation = true;

export function setUseBackend(use: boolean): void {
  useBackendSimulation = use;
}

export function isUsingBackend(): boolean {
  return useBackendSimulation && getBackendStatus().connected;
}

// ============================================
// BALL SIMULATION
// ============================================

export interface SimulateBallParams {
  striker: Player;
  nonStriker: Player;
  bowler: Player;
  fieldingTeam: Player[];
  inningsState: InningsState;
  tactics: MatchTactics;
  pitch: PitchConditions;
  target: number | null;
  bowlingLength?: BowlingLength;
  fieldSetting?: FieldSetting;
  ballsFaced?: number;
}

export interface BallSimulationResult {
  outcome: BallOutcome;
  narrative: string;
  newBatsmanNeeded: boolean;
  inningsComplete: boolean;
  strikerChanged: boolean;
  updatedRuns: number;
  updatedWickets: number;
  updatedBatters: [string, string];
  usedBackend: boolean;
}

/**
 * Simulate a single ball - tries backend first, falls back to client engine
 */
export async function simulateBall(
  params: SimulateBallParams
): Promise<BallSimulationResult> {
  const {
    striker,
    nonStriker,
    bowler,
    fieldingTeam,
    inningsState,
    tactics,
    pitch,
    target,
    bowlingLength,
    fieldSetting,
    ballsFaced = 0,
  } = params;

  const phase: MatchPhase = getPhase(Math.floor(inningsState.overs));

  // Try backend first if enabled
  if (useBackendSimulation) {
    try {
      const request: ApiSimulateBallRequest = {
        innings_state: toApiInningsState(inningsState),
        striker: toApiPlayerStats(striker),
        non_striker: toApiPlayerStats(nonStriker),
        bowler: toApiPlayerStats(bowler),
        fielding_team: fieldingTeam.map(toApiPlayerStats),
        batting_tactics: toApiBattingTactics(tactics, phase),
        bowling_tactics: toApiBowlingTacticsRaw(
          bowlingLength ?? tactics.bowlingPlan.bowlingApproach[phase].length,
          fieldSetting ?? tactics.bowlingPlan.bowlingApproach[phase].field
        ),
        pitch_conditions: toApiPitchConditions(pitch),
        target,
        match_phase: getApiMatchPhase(Math.floor(inningsState.overs)),
        include_narrative: true,
      };

      const result = await apiPost<ApiSimulateBallRequest, ApiSimulateBallResponse>(
        '/api/v1/match/simulate/ball',
        request
      );

      if (result.ok) {
        const parsed = parseBallResponse(result.data);
        return {
          outcome: parsed.outcome,
          narrative: parsed.narrative,
          newBatsmanNeeded: parsed.newBatsmanNeeded,
          inningsComplete: parsed.inningsComplete,
          strikerChanged: parsed.strikerChanged,
          updatedRuns: parsed.runs,
          updatedWickets: parsed.wickets,
          updatedBatters: parsed.currentBatters,
          usedBackend: true,
        };
      }

      // API call failed, fall through to client fallback
      console.warn('Backend simulation failed, using client fallback:', result.error);
    } catch (error) {
      console.warn('Backend simulation error, using client fallback:', error);
    }
  }

  // Client-side fallback
  const { outcome, narrative } = clientSimulateBall(
    striker,
    bowler,
    inningsState.overs,
    inningsState.wickets,
    target,
    inningsState.runs,
    tactics,
    pitch,
    bowlingLength && fieldSetting ? { length: bowlingLength, field: fieldSetting } : undefined,
    undefined, // teamFielding
    ballsFaced,
    undefined // matchContext - would need to calculate
  );

  // Determine state changes from outcome
  const isWicket = outcome.type === 'wicket';
  const runsScored = outcome.type === 'runs' ? outcome.runs :
                     outcome.type === 'wicket' ? outcome.runs :
                     outcome.type === 'extra' ? outcome.runs : 0;

  // Striker changes on odd runs (1, 3) - simplified logic
  const strikerChanged = outcome.type === 'runs' && (outcome.runs === 1 || outcome.runs === 3);

  return {
    outcome,
    narrative,
    newBatsmanNeeded: isWicket && inningsState.wickets < 9, // Still have batters left
    inningsComplete: isWicket && inningsState.wickets >= 9, // All out
    strikerChanged,
    updatedRuns: inningsState.runs + runsScored,
    updatedWickets: inningsState.wickets + (isWicket ? 1 : 0),
    updatedBatters: inningsState.currentBatters, // Client doesn't update this
    usedBackend: false,
  };
}

// ============================================
// OVER SIMULATION
// ============================================

export interface SimulateOverParams {
  battingTeam: Player[];
  bowlingTeam: Player[];
  bowler: Player;
  inningsState: InningsState;
  tactics: MatchTactics;
  pitch: PitchConditions;
  target: number | null;
  bowlingLength?: BowlingLength;
  fieldSetting?: FieldSetting;
}

export interface OverSimulationResult {
  overSummary: OverSummary;
  updatedInnings: InningsState;
  inningsComplete: boolean;
  narratives: string[];
  recommendedNextBowler: string | null;
  usedBackend: boolean;
}

/**
 * Simulate a complete over - tries backend first, falls back to client engine
 */
export async function simulateOver(
  params: SimulateOverParams
): Promise<OverSimulationResult> {
  const {
    battingTeam,
    bowlingTeam,
    bowler,
    inningsState,
    tactics,
    pitch,
    target,
    bowlingLength,
    fieldSetting,
  } = params;

  const phase: MatchPhase = getPhase(Math.floor(inningsState.overs));

  // Try backend first if enabled
  if (useBackendSimulation) {
    try {
      const request: ApiSimulateOverRequest = {
        innings_state: toApiInningsState(inningsState),
        batting_team: battingTeam.map(toApiPlayerStats),
        bowling_team: bowlingTeam.map(toApiPlayerStats),
        bowler_id: bowler.id,
        batting_tactics: toApiBattingTactics(tactics, phase),
        bowling_tactics: toApiBowlingTacticsRaw(
          bowlingLength ?? tactics.bowlingPlan.bowlingApproach[phase].length,
          fieldSetting ?? tactics.bowlingPlan.bowlingApproach[phase].field
        ),
        pitch_conditions: toApiPitchConditions(pitch),
        target,
      };

      const result = await apiPost<ApiSimulateOverRequest, ApiSimulateOverResponse>(
        '/api/v1/match/simulate/over',
        request
      );

      if (result.ok) {
        const parsed = parseOverResponse(result.data);
        return {
          overSummary: parsed.overSummary,
          updatedInnings: parsed.updatedInnings,
          inningsComplete: parsed.inningsComplete,
          narratives: parsed.narratives,
          recommendedNextBowler: parsed.recommendedNextBowler,
          usedBackend: true,
        };
      }

      console.warn('Backend simulation failed, using client fallback:', result.error);
    } catch (error) {
      console.warn('Backend simulation error, using client fallback:', error);
    }
  }

  // Client-side fallback
  const { overSummary, updatedInnings } = clientSimulateOver(
    battingTeam,
    bowler,
    inningsState,
    tactics,
    pitch,
    target
  );

  // Check if innings is complete
  const inningsComplete = updatedInnings.wickets >= 10 ||
                          Math.floor(updatedInnings.overs) >= 20 ||
                          (target !== null && updatedInnings.runs >= target);

  // Get recommended next bowler from client engine
  const lastBowlerId = bowler.id;
  const availableBowlers = bowlingTeam.filter(
    p => p.role === 'bowler' || p.role === 'allrounder'
  );
  const recommendedBowler = clientSelectSmartBowler(
    availableBowlers,
    updatedInnings,
    lastBowlerId
  );

  return {
    overSummary,
    updatedInnings,
    inningsComplete,
    narratives: overSummary.balls.map(b => b.narrative),
    recommendedNextBowler: recommendedBowler?.id ?? null,
    usedBackend: false,
  };
}

// ============================================
// BOWLER RECOMMENDATION
// ============================================

export interface RecommendBowlerParams {
  availableBowlers: Player[];
  inningsState: InningsState;
  lastBowlerId: string | null;
  partnershipRuns?: number;
  recentWickets?: number;
}

export interface BowlerRecommendation {
  recommendedBowlerId: string;
  reasoning: string;
  alternatives: Array<{
    bowlerId: string;
    score: number;
    reasoning: string;
  }>;
  usedBackend: boolean;
}

/**
 * Get smart bowler recommendation - tries backend first, falls back to client
 */
export async function recommendBowler(
  params: RecommendBowlerParams
): Promise<BowlerRecommendation | null> {
  const {
    availableBowlers,
    inningsState,
    lastBowlerId,
    partnershipRuns = 0,
    recentWickets = 0,
  } = params;

  if (availableBowlers.length === 0) {
    return null;
  }

  const phase: MatchPhase = getPhase(Math.floor(inningsState.overs));

  // Try backend first if enabled
  if (useBackendSimulation) {
    try {
      const request: ApiBowlerRecommendRequest = {
        available_bowlers: availableBowlers.map(toApiPlayerStats),
        innings_state: toApiInningsState(inningsState),
        last_bowler_id: lastBowlerId,
        match_context: {
          phase: getApiMatchPhase(Math.floor(inningsState.overs)),
          required_rate: null, // Could calculate if chasing
          partnership_runs: partnershipRuns,
          recent_wickets: recentWickets,
        },
      };

      const result = await apiPost<ApiBowlerRecommendRequest, ApiBowlerRecommendResponse>(
        '/api/v1/match/bowler/recommend',
        request
      );

      if (result.ok) {
        return {
          recommendedBowlerId: result.data.recommended_bowler_id,
          reasoning: result.data.reasoning,
          alternatives: result.data.alternatives.map(alt => ({
            bowlerId: alt.bowler_id,
            score: alt.score,
            reasoning: alt.reasoning,
          })),
          usedBackend: true,
        };
      }

      console.warn('Backend bowler recommendation failed, using client fallback:', result.error);
    } catch (error) {
      console.warn('Backend bowler recommendation error, using client fallback:', error);
    }
  }

  // Client-side fallback
  const recommended = clientSelectSmartBowler(
    availableBowlers,
    inningsState,
    lastBowlerId
  );

  if (!recommended) {
    return null;
  }

  return {
    recommendedBowlerId: recommended.id,
    reasoning: `Selected based on phase (${phase}) and bowling stats`,
    alternatives: [],
    usedBackend: false,
  };
}
