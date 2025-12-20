"""Event-related schemas."""

from typing import Dict, List, Optional, Literal
from pydantic import BaseModel, Field

from app.schemas.common import EventCategory, RiskLevel


# ============================================
# EVENT EFFECT SCHEMAS
# ============================================

class EventEffect(BaseModel):
    """Effect of choosing an event option."""
    target: Literal["player", "team", "manager"]
    target_id: Optional[str] = None  # Player ID if targeting player
    attribute: str  # e.g., 'morale', 'form', 'fitness', 'press_heat'
    change: int  # Delta value


class EventOption(BaseModel):
    """An option for responding to an event."""
    id: str
    label: str
    description: str
    effects: List[EventEffect]
    risk_level: RiskLevel = RiskLevel.MODERATE
    potential_outcomes: List[str] = []  # Descriptions of what might happen


# ============================================
# EVENT REQUEST/RESPONSE SCHEMAS
# ============================================

class PlayerInfo(BaseModel):
    """Minimal player info for event generation."""
    id: str
    name: str
    short_name: str
    role: str
    form: int
    morale: int
    contract_years: int
    is_overseas: bool


class GameContext(BaseModel):
    """Game context for event generation."""
    match_day: int
    season: int
    phase: Literal["pre-season", "season", "playoffs", "off-season"]

    # Results context
    recent_results: List[Literal["win", "loss"]]  # Last 5 matches
    current_streak: int  # Positive = wins, negative = losses
    league_position: int

    # Team state
    team_morale: int = Field(ge=0, le=100)
    board_patience: int = Field(ge=0, le=100)
    press_heat: int = Field(ge=0, le=100)

    # Financial
    budget_remaining: float = 0
    salary_cap_used: float = 0

    # Squad issues
    injured_players: List[str] = []  # Player IDs
    out_of_form_players: List[str] = []  # form < -5
    unhappy_players: List[str] = []  # morale < 60


class GenerateEventRequest(BaseModel):
    """Request to generate a context-aware event."""
    game_context: GameContext
    team_players: List[PlayerInfo]
    recent_event_ids: List[str] = []  # Prevent duplicates
    category_filter: Optional[EventCategory] = None  # Force specific category


class GeneratedEvent(BaseModel):
    """A generated event."""
    id: str
    template_id: str
    category: EventCategory

    title: str
    description: str

    involved_players: List[str]  # Player IDs
    urgency: Literal["immediate", "end-of-day", "this-week"]

    options: List[EventOption]


class GenerateEventResponse(BaseModel):
    """Response from event generation."""
    event: Optional[GeneratedEvent] = None  # null if trigger roll fails

    # Debug info
    debug: Optional[Dict] = None


class ResolveEventRequest(BaseModel):
    """Request to resolve an event with a chosen option."""
    event_id: str
    chosen_option_id: str

    # Current states for calculating effects
    player_states: Dict[str, Dict[str, int]]  # {player_id: {morale, form, fatigue}}
    team_state: Dict[str, int]  # {press_heat, board_patience}


class AppliedEffect(BaseModel):
    """An effect that was applied."""
    player_id: Optional[str]
    attribute: str
    old_value: int
    new_value: int


class ResolveEventResponse(BaseModel):
    """Response from resolving an event."""
    player_effects: List[AppliedEffect]
    team_effects: List[AppliedEffect]
    narrative_result: str  # Story outcome text
    follow_up_event_id: Optional[str] = None  # Some events chain
