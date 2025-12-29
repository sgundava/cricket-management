"""Common types and enums used across schemas."""

from enum import Enum
from typing import Literal, Dict, Tuple, Optional
from pydantic import BaseModel


# ============================================
# MATCH FORMAT TYPES
# ============================================

class MatchFormat(str, Enum):
    T20 = "t20"
    ODI = "odi"
    TEST = "test"


class MatchFormatConfig(BaseModel):
    """Configuration for different cricket formats."""
    format: MatchFormat
    overs_per_innings: int  # 20, 50, or 450 (90 overs × 5 days for Test)
    innings_count: int  # 2 for T20/ODI, 4 for Test
    balls_per_over: int = 6
    max_wickets: int = 10

    # Phase definitions (over ranges)
    phases: Dict[str, Tuple[int, int]]  # e.g., {'powerplay': (0, 6), 'middle': (6, 16), 'death': (16, 20)}

    # Powerplay rules
    powerplay_overs: int  # 6 for T20, 10 for ODI, 0 for Test
    mandatory_close_fielders: int  # Field restrictions

    # Format-specific probability params file
    probability_params_file: str

    class Config:
        use_enum_values = True


# Pre-defined format configurations
MATCH_FORMATS: Dict[str, MatchFormatConfig] = {
    "t20": MatchFormatConfig(
        format=MatchFormat.T20,
        overs_per_innings=20,
        innings_count=2,
        balls_per_over=6,
        max_wickets=10,
        phases={"powerplay": (0, 6), "middle": (6, 16), "death": (16, 20)},
        powerplay_overs=6,
        mandatory_close_fielders=2,
        probability_params_file="probability_params_t20.yaml",
    ),
    "odi": MatchFormatConfig(
        format=MatchFormat.ODI,
        overs_per_innings=50,
        innings_count=2,
        balls_per_over=6,
        max_wickets=10,
        phases={"powerplay": (0, 10), "middle": (10, 40), "death": (40, 50)},
        powerplay_overs=10,
        mandatory_close_fielders=4,
        probability_params_file="probability_params_odi.yaml",
    ),
    "test": MatchFormatConfig(
        format=MatchFormat.TEST,
        overs_per_innings=450,  # 90 overs per day × 5 days max
        innings_count=4,
        balls_per_over=6,
        max_wickets=10,
        phases={"new_ball": (0, 30), "middle": (30, 80), "old_ball": (80, 450)},
        powerplay_overs=0,  # No powerplay in Tests
        mandatory_close_fielders=0,
        probability_params_file="probability_params_test.yaml",
    ),
}


def get_format_config(format_name: str) -> MatchFormatConfig:
    """Get format configuration by name."""
    return MATCH_FORMATS.get(format_name.lower(), MATCH_FORMATS["t20"])


# ============================================
# Player enums
class PlayerRole(str, Enum):
    BATSMAN = "batsman"
    BOWLER = "bowler"
    ALLROUNDER = "allrounder"
    KEEPER = "keeper"


class BattingStyle(str, Enum):
    RIGHT = "right"
    LEFT = "left"


class BowlingStyle(str, Enum):
    RIGHT_ARM_FAST = "right-arm-fast"
    RIGHT_ARM_MEDIUM = "right-arm-medium"
    LEFT_ARM_FAST = "left-arm-fast"
    LEFT_ARM_MEDIUM = "left-arm-medium"
    OFF_SPIN = "off-spin"
    LEG_SPIN = "leg-spin"
    LEFT_ARM_SPIN = "left-arm-spin"


class PlayingRole(str, Enum):
    OPENING_BATTER = "opening-batter"
    TOP_ORDER_BATTER = "top-order-batter"
    MIDDLE_ORDER_BATTER = "middle-order-batter"
    FINISHER = "finisher"
    WICKETKEEPER_BATTER = "wicketkeeper-batter"
    BATTING_ALLROUNDER = "batting-allrounder"
    BOWLING_ALLROUNDER = "bowling-allrounder"
    SPIN_BOWLING_ALLROUNDER = "spin-bowling-allrounder"
    OPENING_BOWLER = "opening-bowler"
    PACE_BOWLER = "pace-bowler"
    SPIN_BOWLER = "spin-bowler"
    DEATH_BOWLER = "death-bowler"


class Temperament(str, Enum):
    FIERY = "fiery"
    CALM = "calm"
    MOODY = "moody"


# Match enums
class MatchPhase(str, Enum):
    POWERPLAY = "powerplay"
    MIDDLE = "middle"
    DEATH = "death"


class TacticalApproach(str, Enum):
    AGGRESSIVE = "aggressive"
    BALANCED = "balanced"
    CAUTIOUS = "cautious"


class BowlingLength(str, Enum):
    GOOD_LENGTH = "good-length"
    SHORT = "short"
    YORKERS = "yorkers"
    FULL_PITCHED = "full-pitched"


class FieldSetting(str, Enum):
    ATTACKING = "attacking"
    BALANCED = "balanced"
    DEFENSIVE = "defensive"
    DEATH_FIELD = "death-field"


class DismissalType(str, Enum):
    BOWLED = "bowled"
    CAUGHT = "caught"
    LBW = "lbw"
    RUNOUT = "runout"
    STUMPED = "stumped"
    HITWICKET = "hitwicket"


class ExtraType(str, Enum):
    WIDE = "wide"
    NOBALL = "noball"
    BYE = "bye"
    LEGBYE = "legbye"


class OutcomeType(str, Enum):
    RUNS = "runs"
    WICKET = "wicket"
    EXTRA = "extra"


# Event enums
class EventCategory(str, Enum):
    PLAYER = "player"
    MEDIA = "media"
    TEAM = "team"
    BOARD = "board"
    SEASON = "season"


class RiskLevel(str, Enum):
    SAFE = "safe"
    MODERATE = "moderate"
    RISKY = "risky"


# Type aliases for clarity
Runs = Literal[0, 1, 2, 3, 4, 6]
