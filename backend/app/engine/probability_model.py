"""
Probability Model for Cricket Match Simulation.

Loads parameters from YAML and calculates outcome probabilities
based on player skills, tactics, and match context.
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

import yaml

from app.config import get_settings
from app.schemas.common import MatchPhase, TacticalApproach, BowlingLength, FieldSetting
from app.schemas.player import PlayerStats


@dataclass
class SimulationContext:
    """All context needed for probability calculation."""
    striker: PlayerStats
    bowler: PlayerStats
    phase: MatchPhase
    overs: float
    wickets: int
    target: Optional[int]
    current_runs: int
    balls_faced: int  # By this batter
    batting_approach: TacticalApproach
    bowling_length: BowlingLength
    field_setting: FieldSetting
    partnership_runs: int = 0
    recent_wickets: int = 0  # In last 3 overs
    bowler_wickets: int = 0  # By current bowler this innings
    recent_runs: int = 0  # Runs in last 6 balls (for momentum)
    recent_boundaries: int = 0  # Boundaries in last 6 balls
    recent_dots: int = 0  # Dots in last 6 balls


class ProbabilityModel:
    """
    Calculate outcome probabilities based on loaded YAML parameters.

    Applies modifiers in this order:
    1. Base outcomes
    2. Phase modifiers
    3. Skill differential
    4. Form modifiers
    5. Batsman state (settling in)
    6. Tactical modifiers
    7. Bowling length/field modifiers
    8. Pressure/momentum
    9. Pitch effects
    10. Chase pressure (if applicable)
    """

    def __init__(self, params_path: Optional[Path] = None):
        if params_path is None:
            params_path = get_settings().probability_params_path

        with open(params_path) as f:
            self.params = yaml.safe_load(f)

    def calculate_probabilities(self, ctx: SimulationContext) -> Dict[str, float]:
        """Calculate outcome probabilities for a single ball."""
        # Start with base probabilities
        probs = dict(self.params["base_outcomes"])

        # 1. Apply phase modifiers
        phase_mod = self.params["phase_modifiers"][ctx.phase.value]
        probs = self._apply_boundary_wicket_mods(
            probs,
            phase_mod["boundary_mod"],
            phase_mod.get("wicket_mod", 1.0),
            phase_mod.get("dot_mod", 1.0)
        )

        # 2. Calculate skill differential
        skill_diff = self._calculate_skill_differential(ctx.striker, ctx.bowler)
        probs = self._apply_skill_modifiers(probs, skill_diff)

        # 3. Apply form modifiers
        probs = self._apply_form_modifiers(probs, ctx.striker.form, ctx.bowler.form)

        # 4. Apply batsman state
        batsman_state = self._get_batsman_state(ctx.balls_faced)
        state_mod = self.params["batsman_state"]["modifiers"][batsman_state]
        probs = self._apply_boundary_wicket_mods(
            probs,
            state_mod.get("boundary_mod", 1.0),
            state_mod.get("wicket_mod", 1.0),
            state_mod.get("dot_mod", 1.0)
        )

        # 5. Apply tactical modifiers
        tactic_mod = self.params["tactical_modifiers"][ctx.batting_approach.value]
        probs = self._apply_boundary_wicket_mods(
            probs,
            tactic_mod["boundary_mod"],
            tactic_mod["wicket_mod"],
            tactic_mod.get("dot_mod", 1.0)
        )

        # 6. Apply bowling length modifiers
        length_mod = self.params["bowling_length_modifiers"][ctx.bowling_length.value]
        length_effectiveness = self._get_bowling_length_effectiveness(
            ctx.bowler, ctx.bowling_length
        )
        probs = self._apply_boundary_wicket_mods(
            probs,
            length_mod["boundary_mod"] * length_effectiveness,
            length_mod["wicket_mod"] * length_effectiveness,
            length_mod.get("dot_mod", 1.0)
        )

        # 7. Apply field setting modifiers
        field_mod = self.params["field_setting_modifiers"][ctx.field_setting.value]
        probs = self._apply_boundary_wicket_mods(
            probs,
            field_mod["boundary_mod"],
            field_mod["wicket_mod"]
        )

        # 8. Apply pressure/momentum modifiers
        probs = self._apply_pressure_modifiers(probs, ctx)

        # 9. Apply chase pressure (second innings only)
        if ctx.target is not None:
            probs = self._apply_chase_pressure(probs, ctx)

        # Normalize probabilities
        return self._normalize(probs)

    def _apply_boundary_wicket_mods(
        self,
        probs: Dict[str, float],
        boundary_mod: float = 1.0,
        wicket_mod: float = 1.0,
        dot_mod: float = 1.0
    ) -> Dict[str, float]:
        """Apply modifiers to boundaries, wickets, and dots."""
        result = dict(probs)
        result["four"] *= boundary_mod
        result["six"] *= boundary_mod
        result["wicket"] *= wicket_mod
        result["dot"] *= dot_mod
        return result

    def _calculate_skill_differential(self, striker: PlayerStats, bowler: PlayerStats) -> float:
        """Calculate skill differential between batter and bowler (-1 to 1)."""
        batting_skill = (
            striker.batting.technique * 0.25 +
            striker.batting.power * 0.25 +
            striker.batting.timing * 0.30 +
            striker.batting.temperament * 0.20
        )
        bowling_skill = (
            bowler.bowling.speed * 0.20 +
            bowler.bowling.accuracy * 0.35 +
            bowler.bowling.variation * 0.25 +
            bowler.bowling.stamina * 0.20
        )
        return (batting_skill - bowling_skill) / 100

    def _apply_skill_modifiers(self, probs: Dict[str, float], skill_diff: float) -> Dict[str, float]:
        """Apply skill differential to probabilities."""
        result = dict(probs)
        modifier = 1 + skill_diff * 0.15

        result["four"] *= modifier
        result["six"] *= modifier
        result["wicket"] *= (1 / modifier)  # Inverse for wickets

        return result

    def _apply_form_modifiers(
        self,
        probs: Dict[str, float],
        batter_form: int,
        bowler_form: int
    ) -> Dict[str, float]:
        """Apply form modifiers (-20 to +20 form)."""
        result = dict(probs)

        batter_mod = 1 + batter_form / 200  # ±10% impact
        bowler_mod = 1 + bowler_form / 200

        result["four"] *= batter_mod
        result["six"] *= batter_mod
        result["wicket"] *= bowler_mod

        return result

    def _get_batsman_state(self, balls_faced: int) -> str:
        """Get batsman state based on balls faced."""
        thresholds = self.params["batsman_state"]["thresholds"]
        if balls_faced < thresholds["new"]:
            return "new"
        if balls_faced < thresholds["settling"]:
            return "settling"
        return "set"

    def _get_bowling_length_effectiveness(
        self,
        bowler: PlayerStats,
        length: BowlingLength
    ) -> float:
        """Calculate how effective this bowler is at the chosen length."""
        length_config = self.params["bowling_length_modifiers"][length.value]
        skill_type = length_config["skill_type"]
        min_skill = length_config["min_skill"]

        # Get relevant skill
        if skill_type == "speed":
            relevant_skill = bowler.bowling.speed
        elif skill_type == "variation":
            relevant_skill = bowler.bowling.variation
        else:
            relevant_skill = bowler.bowling.accuracy

        # If below minimum, reduce effectiveness
        if relevant_skill < min_skill:
            deficit = (min_skill - relevant_skill) / 100
            return max(0.5, 1 - deficit * 2)  # 50% minimum

        # Bonus for exceeding requirement
        excess = (relevant_skill - min_skill) / 100
        return min(1.3, 1 + excess * 0.5)

    def _apply_pressure_modifiers(
        self,
        probs: Dict[str, float],
        ctx: SimulationContext
    ) -> Dict[str, float]:
        """Apply pressure/momentum modifiers based on IPL data analysis."""
        result = dict(probs)
        pressure = self.params["pressure"]

        # Recent wickets in last 3 overs - KEY FOR COLLAPSE PREVENTION
        # Data shows 3+ wickets creates 54% more wicket risk
        recent_wickets_config = pressure.get("recent_wickets", {})
        if ctx.recent_wickets >= 3:
            mods = recent_wickets_config.get(3, recent_wickets_config.get("3", {}))
        elif ctx.recent_wickets == 2:
            mods = recent_wickets_config.get(2, recent_wickets_config.get("2", {}))
        elif ctx.recent_wickets == 1:
            mods = recent_wickets_config.get(1, recent_wickets_config.get("1", {}))
        else:
            mods = recent_wickets_config.get(0, recent_wickets_config.get("0", {}))

        if mods:
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)
            result["dot"] *= mods.get("dot_mod", 1.0)

        # Bowler on a roll
        bowler_roll = pressure.get("bowler_on_roll", {})
        if ctx.bowler_wickets >= 3:
            mods = bowler_roll.get("3_wickets", {})
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)
        elif ctx.bowler_wickets >= 2:
            mods = bowler_roll.get("2_wickets", {})
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)

        # Partnership dynamics - DATA-DERIVED
        # Early partnerships are safest, then risk increases
        partnership = pressure.get("partnership", {})
        if ctx.partnership_runs >= 100:
            mods = partnership.get("100_plus", {})
        elif ctx.partnership_runs >= 75:
            mods = partnership.get("75_100", {})
        elif ctx.partnership_runs >= 50:
            mods = partnership.get("50_75", {})
        elif ctx.partnership_runs >= 30:
            mods = partnership.get("30_50", {})
        elif ctx.partnership_runs >= 20:
            mods = partnership.get("20_30", {})
        elif ctx.partnership_runs >= 10:
            mods = partnership.get("10_20", {})
        else:
            mods = partnership.get("0_10", {})

        if mods:
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)
            result["dot"] *= mods.get("dot_mod", 1.0)

        # Apply momentum modifiers
        result = self._apply_momentum_modifiers(result, ctx)

        return result

    def _apply_momentum_modifiers(
        self,
        probs: Dict[str, float],
        ctx: SimulationContext
    ) -> Dict[str, float]:
        """Apply momentum modifiers based on recent scoring patterns."""
        result = dict(probs)
        momentum = self.params.get("momentum", {})

        # By recent runs in last 6 balls
        by_recent_runs = momentum.get("by_recent_runs", {})
        if ctx.recent_runs >= 15:
            mods = by_recent_runs.get("15_24", {})
        elif ctx.recent_runs >= 8:
            mods = by_recent_runs.get("8_14", {})
        elif ctx.recent_runs >= 3:
            mods = by_recent_runs.get("3_7", {})
        else:
            mods = by_recent_runs.get("0_2", {})

        if mods:
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)

        # By recent boundaries - boundaries breed boundaries
        by_boundaries = momentum.get("by_recent_boundaries", {})
        if ctx.recent_boundaries >= 3:
            mods = by_boundaries.get("3_plus", {})
        elif ctx.recent_boundaries == 2:
            mods = by_boundaries.get("2", by_boundaries.get(2, {}))
        elif ctx.recent_boundaries == 1:
            mods = by_boundaries.get("1", by_boundaries.get(1, {}))
        else:
            mods = by_boundaries.get("0", by_boundaries.get(0, {}))

        if mods:
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)

        # By recent dots - dot pressure
        by_dots = momentum.get("by_recent_dots", {})
        if ctx.recent_dots >= 5:
            mods = by_dots.get("5_plus", {})
        elif ctx.recent_dots == 4:
            mods = by_dots.get("4", by_dots.get(4, {}))
        elif ctx.recent_dots == 3:
            mods = by_dots.get("3", by_dots.get(3, {}))
        elif ctx.recent_dots == 2:
            mods = by_dots.get("2", by_dots.get(2, {}))
        elif ctx.recent_dots == 1:
            mods = by_dots.get("1", by_dots.get(1, {}))
        else:
            mods = by_dots.get("0", by_dots.get(0, {}))

        if mods:
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)

        return result

    def _apply_chase_pressure(
        self,
        probs: Dict[str, float],
        ctx: SimulationContext
    ) -> Dict[str, float]:
        """Apply pressure from chasing a target - DATA-DERIVED from IPL 2nd innings."""
        result = dict(probs)
        pressure = self.params["pressure"].get("required_rate", {})

        balls_remaining = (20 - ctx.overs) * 6
        if balls_remaining <= 0:
            return result

        runs_needed = ctx.target - ctx.current_runs
        required_rate = (runs_needed / balls_remaining) * 6

        # Select appropriate modifiers based on required rate
        if required_rate > 12:
            mods = pressure.get("over_12", {})
        elif required_rate > 9:
            mods = pressure.get("9_to_12", {})
        elif required_rate > 6:
            mods = pressure.get("normal", {})
        else:
            mods = pressure.get("low", {})

        if mods:
            result["four"] *= mods.get("boundary_mod", 1.0)
            result["six"] *= mods.get("boundary_mod", 1.0)
            result["wicket"] *= mods.get("wicket_mod", 1.0)

        return result

    def _normalize(self, probs: Dict[str, float]) -> Dict[str, float]:
        """Normalize probabilities to sum to 1."""
        total = sum(probs.values())
        return {k: v / total for k, v in probs.items()}


@lru_cache
def get_probability_model() -> ProbabilityModel:
    """Get cached probability model instance."""
    return ProbabilityModel()
