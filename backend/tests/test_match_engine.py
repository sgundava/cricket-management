"""Tests for the match engine."""

import pytest
from app.engine.probability_model import ProbabilityModel, SimulationContext
from app.engine.match_engine import MatchEngine
from app.schemas.player import PlayerStats, BattingSkills, BowlingSkills, FieldingSkills
from app.schemas.common import (
    PlayerRole,
    BattingStyle,
    BowlingStyle,
    MatchPhase,
    TacticalApproach,
    BowlingLength,
    FieldSetting,
)


def create_test_batter() -> PlayerStats:
    """Create a test batter."""
    return PlayerStats(
        id="test-batter",
        name="Test Batter",
        short_name="T Batter",
        role=PlayerRole.BATSMAN,
        batting_style=BattingStyle.RIGHT,
        bowling_style=None,
        batting=BattingSkills(technique=75, power=70, timing=80, temperament=75),
        bowling=BowlingSkills(speed=30, accuracy=30, variation=20, stamina=30),
        fielding=FieldingSkills(catching=60, ground=60, throwing=55, athleticism=60),
        form=5,
        fitness=90,
        morale=75,
        fatigue=10,
    )


def create_test_bowler() -> PlayerStats:
    """Create a test bowler."""
    return PlayerStats(
        id="test-bowler",
        name="Test Bowler",
        short_name="T Bowler",
        role=PlayerRole.BOWLER,
        batting_style=BattingStyle.RIGHT,
        bowling_style=BowlingStyle.RIGHT_ARM_FAST,
        batting=BattingSkills(technique=30, power=40, timing=30, temperament=40),
        bowling=BowlingSkills(speed=80, accuracy=75, variation=65, stamina=70),
        fielding=FieldingSkills(catching=50, ground=55, throwing=60, athleticism=55),
        form=0,
        fitness=85,
        morale=70,
        fatigue=15,
    )


class TestProbabilityModel:
    """Tests for the probability model."""

    def test_load_params(self):
        """Test that probability params load correctly."""
        model = ProbabilityModel()
        assert "base_outcomes" in model.params
        assert model.params["base_outcomes"]["dot"] > 0
        assert model.params["base_outcomes"]["wicket"] > 0

    def test_probabilities_sum_to_one(self):
        """Test that calculated probabilities sum to 1."""
        model = ProbabilityModel()
        batter = create_test_batter()
        bowler = create_test_bowler()

        ctx = SimulationContext(
            striker=batter,
            bowler=bowler,
            phase=MatchPhase.MIDDLE,
            overs=10.0,
            wickets=2,
            target=None,
            current_runs=85,
            balls_faced=20,
            batting_approach=TacticalApproach.BALANCED,
            bowling_length=BowlingLength.GOOD_LENGTH,
            field_setting=FieldSetting.BALANCED,
        )

        probs = model.calculate_probabilities(ctx)
        total = sum(probs.values())

        assert abs(total - 1.0) < 0.0001, f"Probabilities sum to {total}, not 1.0"

    def test_aggressive_increases_boundaries(self):
        """Test that aggressive tactics increase boundary probability."""
        model = ProbabilityModel()
        batter = create_test_batter()
        bowler = create_test_bowler()

        base_ctx = SimulationContext(
            striker=batter,
            bowler=bowler,
            phase=MatchPhase.MIDDLE,
            overs=10.0,
            wickets=2,
            target=None,
            current_runs=85,
            balls_faced=20,
            batting_approach=TacticalApproach.BALANCED,
            bowling_length=BowlingLength.GOOD_LENGTH,
            field_setting=FieldSetting.BALANCED,
        )

        agg_ctx = SimulationContext(
            striker=batter,
            bowler=bowler,
            phase=MatchPhase.MIDDLE,
            overs=10.0,
            wickets=2,
            target=None,
            current_runs=85,
            balls_faced=20,
            batting_approach=TacticalApproach.AGGRESSIVE,
            bowling_length=BowlingLength.GOOD_LENGTH,
            field_setting=FieldSetting.BALANCED,
        )

        base_probs = model.calculate_probabilities(base_ctx)
        agg_probs = model.calculate_probabilities(agg_ctx)

        base_boundaries = base_probs["four"] + base_probs["six"]
        agg_boundaries = agg_probs["four"] + agg_probs["six"]

        assert agg_boundaries > base_boundaries, "Aggressive should increase boundaries"


class TestMatchEngine:
    """Tests for the match engine."""

    def test_get_phase(self):
        """Test phase determination."""
        engine = MatchEngine()

        assert engine.get_phase(0.0) == MatchPhase.POWERPLAY
        assert engine.get_phase(5.5) == MatchPhase.POWERPLAY
        assert engine.get_phase(6.0) == MatchPhase.MIDDLE
        assert engine.get_phase(15.5) == MatchPhase.MIDDLE
        assert engine.get_phase(16.0) == MatchPhase.DEATH
        assert engine.get_phase(19.5) == MatchPhase.DEATH

    def test_batsman_state(self):
        """Test batsman state determination."""
        engine = MatchEngine()

        assert engine.get_batsman_state(0) == "new"
        assert engine.get_batsman_state(5) == "new"
        assert engine.get_batsman_state(6) == "settling"
        assert engine.get_batsman_state(14) == "settling"
        assert engine.get_batsman_state(15) == "set"
        assert engine.get_batsman_state(50) == "set"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
