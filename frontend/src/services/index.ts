/**
 * Services - API integration layer
 */

// API Client
export {
  checkBackendHealth,
  getBackendStatus,
  shouldRefreshHealth,
  apiPost,
  apiGet,
} from './api/client';

export type { ApiError, ApiResponse, ApiErrorResponse, ApiResult } from './api/client';

// Match Service
export {
  simulateBall,
  simulateOver,
  recommendBowler,
  setUseBackend,
  isUsingBackend,
} from './api/match.service';

export type {
  SimulateBallParams,
  BallSimulationResult,
  SimulateOverParams,
  OverSimulationResult,
  RecommendBowlerParams,
  BowlerRecommendation,
} from './api/match.service';

// Events Service
export {
  generateEvent,
  resolveEvent,
  getTemplateCounts,
  setUseBackendEvents,
  isUsingBackendEvents,
} from './api/events.service';

export type {
  GenerateEventParams,
  GenerateEventResult,
  ResolveEventParams,
  ResolveEventResult,
  AppliedEffect,
  TemplateCount,
} from './api/events.service';

// Re-export useful mappers for external use
export {
  toApiPlayerStats,
  toApiInningsState,
  fromApiInningsState,
  fromApiBallOutcome,
  fromApiOverSummary,
} from './api/mappers';
