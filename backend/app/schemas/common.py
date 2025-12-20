"""Common types and enums used across schemas."""

from enum import Enum
from typing import Literal


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
