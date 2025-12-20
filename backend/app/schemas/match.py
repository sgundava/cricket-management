"""Match and simulation schemas."""

from typing import Dict, List, Optional, Literal, Union
from pydantic import BaseModel, Field

from app.schemas.common import (
    MatchPhase,
    TacticalApproach,
    BowlingLength,
    FieldSetting,
    DismissalType,
    ExtraType,
    OutcomeType,
)
from app.schemas.player import PlayerStats, BatterStats, BowlerStats


# ============================================
# TACTICS SCHEMAS
# ============================================

class BattingTactics(BaseModel):
    """Batting tactics for simulation."""
    approach: TacticalApproach
    striker_instruction: Optional[Literal["attack", "anchor", "default"]] = "default"


class BowlingTactics(BaseModel):
    """Bowling tactics for simulation."""
    length: BowlingLength
    field_setting: FieldSetting


class PhaseApproach(BaseModel):
    """Bowling approach for a specific phase."""
    length: BowlingLength
    field: FieldSetting


class BowlingApproach(BaseModel):
    """Complete bowling approach across all phases."""
    powerplay: PhaseApproach
    middle: PhaseApproach
    death: PhaseApproach


# ============================================
# PITCH AND CONDITIONS
# ============================================

class PitchConditions(BaseModel):
    """Pitch conditions affecting simulation."""
    pace: int = Field(ge=0, le=100, description="Helps fast bowlers")
    spin: int = Field(ge=0, le=100, description="Helps spinners")
    bounce: int = Field(ge=0, le=100, description="True bounce")
    deterioration: int = Field(ge=0, le=100, default=0, description="How much it changes")


# ============================================
# BALL OUTCOME SCHEMAS
# ============================================

class RunsOutcome(BaseModel):
    """Outcome when runs are scored."""
    type: Literal["runs"] = "runs"
    runs: Literal[0, 1, 2, 3, 4, 6]
    boundary_saved: bool = False  # If athletic fielding saved a boundary


class WicketOutcome(BaseModel):
    """Outcome when a wicket falls."""
    type: Literal["wicket"] = "wicket"
    dismissal_type: DismissalType
    runs: int = 0  # Runs scored before dismissal


class ExtraOutcome(BaseModel):
    """Outcome for extras."""
    type: Literal["extra"] = "extra"
    extra_type: ExtraType
    runs: int


BallOutcome = Union[RunsOutcome, WicketOutcome, ExtraOutcome]


class BallEvent(BaseModel):
    """Complete ball event with narrative."""
    over: int
    ball: int
    batter: str  # Player ID
    bowler: str  # Player ID
    outcome: BallOutcome
    narrative: str


class OverSummary(BaseModel):
    """Summary of an over."""
    over_number: int
    bowler: str  # Player ID
    runs: int
    wickets: int
    balls: List[BallEvent]


# ============================================
# INNINGS STATE
# ============================================

class FallOfWicket(BaseModel):
    """Record of a wicket falling."""
    player: str  # Player ID
    runs: int  # Team score when wicket fell
    overs: float  # Over when wicket fell (e.g., 14.3)


class InningsState(BaseModel):
    """Current state of an innings."""
    batting_team: str  # Team ID
    bowling_team: str  # Team ID
    runs: int = 0
    wickets: int = 0
    overs: int = 0  # Complete overs
    balls: int = 0  # Balls in current over (0-5)
    current_batters: tuple[str, str]  # [striker_id, non_striker_id]
    current_bowler: str  # Player ID
    over_summaries: List[OverSummary] = []
    fall_of_wickets: List[FallOfWicket] = []
    batter_stats: Dict[str, BatterStats] = {}
    bowler_stats: Dict[str, BowlerStats] = {}
    recent_balls: List[BallEvent] = []  # Last 6 balls for context


# ============================================
# SIMULATION REQUEST/RESPONSE SCHEMAS
# ============================================

class SimulateBallRequest(BaseModel):
    """Request to simulate a single ball."""
    # Current state
    innings_state: InningsState

    # Players involved
    striker: PlayerStats
    non_striker: PlayerStats
    bowler: PlayerStats
    fielding_team: List[PlayerStats]  # Playing XI

    # Tactics
    batting_tactics: BattingTactics
    bowling_tactics: BowlingTactics

    # Conditions
    pitch_conditions: PitchConditions
    target: Optional[int] = None  # null for first innings
    match_phase: MatchPhase

    # Options
    include_narrative: bool = True


class ContextUpdates(BaseModel):
    """Context updates after a ball."""
    batsman_state: Literal["new", "settling", "set"]
    pressure_level: Literal["low", "medium", "high"]
    momentum: Literal["batting", "neutral", "bowling"]


class UpdatedState(BaseModel):
    """Updated innings state after a ball."""
    runs: int
    wickets: int
    overs: int
    balls: int
    current_batters: tuple[str, str]
    striker_changed: bool
    innings_complete: bool
    new_batsman_needed: bool


class SimulateBallResponse(BaseModel):
    """Response from ball simulation."""
    outcome: BallOutcome
    narrative: str
    updated_state: UpdatedState
    context_updates: ContextUpdates

    # Debug info (optional)
    probabilities_used: Optional[Dict[str, float]] = None


class SimulateOverRequest(BaseModel):
    """Request to simulate a complete over."""
    innings_state: InningsState
    batting_team: List[PlayerStats]  # Full playing XI
    bowling_team: List[PlayerStats]
    bowler_id: str
    batting_tactics: BattingTactics
    bowling_tactics: BowlingTactics
    pitch_conditions: PitchConditions
    target: Optional[int] = None


class SimulateOverResponse(BaseModel):
    """Response from over simulation."""
    over_summary: OverSummary
    updated_innings_state: InningsState
    innings_complete: bool
    narratives: List[str]
    recommended_next_bowler: Optional[str] = None


# ============================================
# BOWLER RECOMMENDATION
# ============================================

class MatchContext(BaseModel):
    """Match context for bowler recommendation."""
    phase: MatchPhase
    required_rate: Optional[float] = None
    partnership_runs: int = 0
    recent_wickets: int = 0


class BowlerRecommendRequest(BaseModel):
    """Request for smart bowler recommendation."""
    available_bowlers: List[PlayerStats]
    innings_state: InningsState
    last_bowler_id: Optional[str] = None
    match_context: MatchContext


class BowlerAlternative(BaseModel):
    """Alternative bowler option."""
    bowler_id: str
    score: float
    reasoning: str


class BowlerRecommendResponse(BaseModel):
    """Response with bowler recommendation."""
    recommended_bowler_id: str
    reasoning: str
    alternatives: List[BowlerAlternative]
