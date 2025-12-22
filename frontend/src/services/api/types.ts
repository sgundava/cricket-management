/**
 * API Types - Mirror backend Pydantic schemas
 * Uses snake_case to match backend conventions
 */

// ============================================
// COMMON ENUMS (string literals matching backend)
// ============================================

export type ApiPlayerRole = 'batsman' | 'bowler' | 'allrounder' | 'keeper';
export type ApiBattingStyle = 'right' | 'left';
export type ApiBowlingStyle =
  | 'right-arm-fast'
  | 'right-arm-medium'
  | 'left-arm-fast'
  | 'left-arm-medium'
  | 'off-spin'
  | 'leg-spin'
  | 'left-arm-spin';

export type ApiPlayingRole =
  | 'opening-batter'
  | 'top-order-batter'
  | 'middle-order-batter'
  | 'finisher'
  | 'wicketkeeper-batter'
  | 'batting-allrounder'
  | 'bowling-allrounder'
  | 'spin-bowling-allrounder'
  | 'opening-bowler'
  | 'pace-bowler'
  | 'spin-bowler'
  | 'death-bowler';

export type ApiTemperament = 'fiery' | 'calm' | 'moody';
export type ApiMatchPhase = 'powerplay' | 'middle' | 'death';
export type ApiTacticalApproach = 'aggressive' | 'balanced' | 'cautious';
export type ApiBowlingLength = 'good-length' | 'short' | 'yorkers' | 'full-pitched';
export type ApiFieldSetting = 'attacking' | 'balanced' | 'defensive' | 'death-field';
export type ApiDismissalType = 'bowled' | 'caught' | 'lbw' | 'runout' | 'stumped' | 'hitwicket';
export type ApiExtraType = 'wide' | 'noball' | 'bye' | 'legbye';
export type ApiEventCategory = 'player' | 'media' | 'team' | 'board' | 'season';
export type ApiRiskLevel = 'safe' | 'moderate' | 'risky';

// ============================================
// PLAYER SCHEMAS
// ============================================

export interface ApiBattingSkills {
  technique: number;
  power: number;
  timing: number;
  temperament: number;
}

export interface ApiBowlingSkills {
  speed: number;
  accuracy: number;
  variation: number;
  stamina: number;
}

export interface ApiFieldingSkills {
  catching: number;
  ground: number;
  throwing: number;
  athleticism: number;
}

export interface ApiPersonality {
  temperament: ApiTemperament;
  professionalism: number;
  ambition: number;
  leadership: number;
}

export interface ApiPlayerStats {
  id: string;
  name: string;
  short_name: string;
  role: ApiPlayerRole;
  playing_role?: ApiPlayingRole | null;
  batting_style: ApiBattingStyle;
  bowling_style?: ApiBowlingStyle | null;

  batting: ApiBattingSkills;
  bowling: ApiBowlingSkills;
  fielding: ApiFieldingSkills;

  form: number;
  fitness: number;
  morale: number;
  fatigue: number;

  personality?: ApiPersonality | null;
}

export interface ApiBatterStats {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
}

export interface ApiBowlerStats {
  overs: number;
  runs: number;
  wickets: number;
  dots: number;
}

// ============================================
// MATCH SCHEMAS
// ============================================

export interface ApiBattingTactics {
  approach: ApiTacticalApproach;
  striker_instruction?: 'attack' | 'anchor' | 'default';
}

export interface ApiBowlingTactics {
  length: ApiBowlingLength;
  field_setting: ApiFieldSetting;
}

export interface ApiPitchConditions {
  pace: number;
  spin: number;
  bounce: number;
  deterioration?: number;
}

// Ball outcomes (discriminated union)
export interface ApiRunsOutcome {
  type: 'runs';
  runs: 0 | 1 | 2 | 3 | 4 | 6;
  boundary_saved?: boolean;
}

export interface ApiWicketOutcome {
  type: 'wicket';
  dismissal_type: ApiDismissalType;
  runs?: number;
}

export interface ApiExtraOutcome {
  type: 'extra';
  extra_type: ApiExtraType;
  runs: number;
}

export type ApiBallOutcome = ApiRunsOutcome | ApiWicketOutcome | ApiExtraOutcome;

export interface ApiBallEvent {
  over: number;
  ball: number;
  batter: string;
  bowler: string;
  outcome: ApiBallOutcome;
  narrative: string;
}

export interface ApiOverSummary {
  over_number: number;
  bowler: string;
  runs: number;
  wickets: number;
  balls: ApiBallEvent[];
}

export interface ApiFallOfWicket {
  player: string;
  runs: number;
  overs: number;
}

export interface ApiInningsState {
  batting_team: string;
  bowling_team: string;
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
  current_batters: [string, string];
  current_bowler: string;
  over_summaries: ApiOverSummary[];
  fall_of_wickets: ApiFallOfWicket[];
  batter_stats: Record<string, ApiBatterStats>;
  bowler_stats: Record<string, ApiBowlerStats>;
  recent_balls: ApiBallEvent[];
}

// ============================================
// SIMULATE BALL REQUEST/RESPONSE
// ============================================

export interface ApiSimulateBallRequest {
  innings_state: ApiInningsState;
  striker: ApiPlayerStats;
  non_striker: ApiPlayerStats;
  bowler: ApiPlayerStats;
  fielding_team: ApiPlayerStats[];
  batting_tactics: ApiBattingTactics;
  bowling_tactics: ApiBowlingTactics;
  pitch_conditions: ApiPitchConditions;
  target: number | null;
  match_phase: ApiMatchPhase;
  include_narrative?: boolean;
}

export interface ApiContextUpdates {
  batsman_state: 'new' | 'settling' | 'set';
  pressure_level: 'low' | 'medium' | 'high';
  momentum: 'batting' | 'neutral' | 'bowling';
}

export interface ApiUpdatedState {
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
  current_batters: [string, string];
  striker_changed: boolean;
  innings_complete: boolean;
  new_batsman_needed: boolean;
}

export interface ApiSimulateBallResponse {
  outcome: ApiBallOutcome;
  narrative: string;
  updated_state: ApiUpdatedState;
  context_updates: ApiContextUpdates;
  probabilities_used?: Record<string, number> | null;
}

// ============================================
// SIMULATE OVER REQUEST/RESPONSE
// ============================================

export interface ApiSimulateOverRequest {
  innings_state: ApiInningsState;
  batting_team: ApiPlayerStats[];
  bowling_team: ApiPlayerStats[];
  bowler_id: string;
  batting_tactics: ApiBattingTactics;
  bowling_tactics: ApiBowlingTactics;
  pitch_conditions: ApiPitchConditions;
  target: number | null;
}

export interface ApiSimulateOverResponse {
  over_summary: ApiOverSummary;
  updated_innings_state: ApiInningsState;
  innings_complete: boolean;
  narratives: string[];
  recommended_next_bowler?: string | null;
}

// ============================================
// BOWLER RECOMMENDATION
// ============================================

export interface ApiMatchContext {
  phase: ApiMatchPhase;
  required_rate?: number | null;
  partnership_runs?: number;
  recent_wickets?: number;
}

export interface ApiBowlerRecommendRequest {
  available_bowlers: ApiPlayerStats[];
  innings_state: ApiInningsState;
  last_bowler_id?: string | null;
  match_context: ApiMatchContext;
}

export interface ApiBowlerAlternative {
  bowler_id: string;
  score: number;
  reasoning: string;
}

export interface ApiBowlerRecommendResponse {
  recommended_bowler_id: string;
  reasoning: string;
  alternatives: ApiBowlerAlternative[];
}

// ============================================
// EVENT SCHEMAS
// ============================================

export interface ApiEventEffect {
  target: 'player' | 'team' | 'manager';
  target_id?: string | null;
  attribute: string;
  change: number;
}

export interface ApiEventOption {
  id: string;
  label: string;
  description: string;
  effects: ApiEventEffect[];
  risk_level?: ApiRiskLevel;
  potential_outcomes?: string[];
}

export interface ApiPlayerInfo {
  id: string;
  name: string;
  short_name: string;
  role: string;
  form: number;
  morale: number;
  contract_years: number;
  is_overseas: boolean;
}

export interface ApiGameContext {
  match_day: number;
  season: number;
  phase: 'pre-season' | 'season' | 'playoffs' | 'off-season';
  recent_results: ('win' | 'loss')[];
  current_streak: number;
  league_position: number;
  team_morale: number;
  board_patience: number;
  press_heat: number;
  budget_remaining?: number;
  salary_cap_used?: number;
  injured_players?: string[];
  out_of_form_players?: string[];
  unhappy_players?: string[];
}

export interface ApiGenerateEventRequest {
  game_context: ApiGameContext;
  team_players: ApiPlayerInfo[];
  recent_event_ids?: string[];
  category_filter?: ApiEventCategory | null;
}

export interface ApiGeneratedEvent {
  id: string;
  template_id: string;
  category: ApiEventCategory;
  title: string;
  description: string;
  involved_players: string[];
  urgency: 'immediate' | 'end-of-day' | 'this-week';
  options: ApiEventOption[];
}

export interface ApiGenerateEventResponse {
  event: ApiGeneratedEvent | null;
  debug?: Record<string, unknown> | null;
}

export interface ApiResolveEventRequest {
  event_id: string;
  chosen_option_id: string;
  player_states: Record<string, Record<string, number>>;
  team_state: Record<string, number>;
}

export interface ApiAppliedEffect {
  player_id?: string | null;
  attribute: string;
  old_value: number;
  new_value: number;
}

export interface ApiResolveEventResponse {
  player_effects: ApiAppliedEffect[];
  team_effects: ApiAppliedEffect[];
  narrative_result: string;
  follow_up_event_id?: string | null;
}
