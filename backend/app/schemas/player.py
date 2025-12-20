"""Player-related schemas."""

from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.common import (
    PlayerRole,
    BattingStyle,
    BowlingStyle,
    PlayingRole,
    Temperament,
)


class BattingSkills(BaseModel):
    """Batting skill attributes (0-100 each)."""
    technique: int = Field(ge=0, le=100, description="Ability to survive, play proper shots")
    power: int = Field(ge=0, le=100, description="Boundary hitting ability")
    timing: int = Field(ge=0, le=100, description="Finding gaps, placement")
    temperament: int = Field(ge=0, le=100, description="Performance under pressure")


class BowlingSkills(BaseModel):
    """Bowling skill attributes (0-100 each)."""
    speed: int = Field(ge=0, le=100, description="Pace or spin sharpness")
    accuracy: int = Field(ge=0, le=100, description="Line and length consistency")
    variation: int = Field(ge=0, le=100, description="Different deliveries in arsenal")
    stamina: int = Field(ge=0, le=100, description="Maintain quality over overs")


class FieldingSkills(BaseModel):
    """Fielding skill attributes (0-100 each)."""
    catching: int = Field(ge=0, le=100, description="Catching ability")
    ground: int = Field(ge=0, le=100, description="Ground fielding")
    throwing: int = Field(ge=0, le=100, description="Arm strength and accuracy")
    athleticism: int = Field(ge=0, le=100, description="Range, diving, speed")


class Personality(BaseModel):
    """Player personality traits."""
    temperament: Temperament
    professionalism: int = Field(ge=0, le=100)
    ambition: int = Field(ge=0, le=100, description="High = demands playing time")
    leadership: int = Field(ge=0, le=100, description="Captain material")


class PlayerStats(BaseModel):
    """
    Player stats sent in simulation requests.
    Subset of full Player model - only what's needed for simulation.
    """
    id: str
    name: str
    short_name: str
    role: PlayerRole
    playing_role: Optional[PlayingRole] = None
    batting_style: BattingStyle
    bowling_style: Optional[BowlingStyle] = None

    # Skills
    batting: BattingSkills
    bowling: BowlingSkills
    fielding: FieldingSkills

    # Dynamic state
    form: int = Field(ge=-20, le=20, description="Current form (-20 to +20)")
    fitness: int = Field(ge=0, le=100)
    morale: int = Field(ge=0, le=100)
    fatigue: int = Field(ge=0, le=100)

    # Personality (affects event responses)
    personality: Optional[Personality] = None

    class Config:
        populate_by_name = True


class BatterStats(BaseModel):
    """Individual batter stats for an innings."""
    runs: int = 0
    balls: int = 0
    fours: int = 0
    sixes: int = 0


class BowlerStats(BaseModel):
    """Individual bowler stats for an innings."""
    overs: int = 0
    runs: int = 0
    wickets: int = 0
    dots: int = 0
