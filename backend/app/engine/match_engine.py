"""
Core Match Engine for Cricket Simulation.

Handles ball-by-ball and over-by-over simulation using the probability model.
"""

import random
from typing import Dict, List, Optional, Tuple

from app.schemas.common import (
    MatchPhase,
    TacticalApproach,
    BowlingLength,
    FieldSetting,
    DismissalType,
)
from app.schemas.player import PlayerStats, BatterStats, BowlerStats
from app.schemas.match import (
    BallOutcome,
    RunsOutcome,
    WicketOutcome,
    ExtraOutcome,
    BallEvent,
    OverSummary,
    InningsState,
    PitchConditions,
    BattingTactics,
    BowlingTactics,
    FallOfWicket,
    ContextUpdates,
    UpdatedState,
)
from app.engine.probability_model import ProbabilityModel, SimulationContext
from app.engine.narrative_generator import NarrativeGenerator


class MatchEngine:
    """
    Cricket match simulation engine.

    Uses probability model for outcome calculation and provides
    ball-by-ball and over-by-over simulation methods.
    """

    TOTAL_OVERS = 20
    BALLS_PER_OVER = 6
    MAX_WICKETS = 10

    def __init__(self, probability_model: Optional[ProbabilityModel] = None):
        self.probability_model = probability_model or ProbabilityModel()
        self.narrative_generator = NarrativeGenerator()

    def get_phase(self, overs: float) -> MatchPhase:
        """Determine match phase based on overs."""
        if overs < 6:
            return MatchPhase.POWERPLAY
        if overs < 16:
            return MatchPhase.MIDDLE
        return MatchPhase.DEATH

    def simulate_ball(
        self,
        striker: PlayerStats,
        bowler: PlayerStats,
        innings_state: InningsState,
        batting_tactics: BattingTactics,
        bowling_tactics: BowlingTactics,
        pitch: PitchConditions,
        fielding_team: List[PlayerStats],
        target: Optional[int] = None,
        include_narrative: bool = True,
    ) -> Tuple[BallOutcome, str, Dict[str, float]]:
        """
        Simulate a single ball delivery.

        Returns:
            Tuple of (outcome, narrative, probabilities_used)
        """
        overs = innings_state.overs + innings_state.balls / 6
        phase = self.get_phase(overs)

        # Get batter's balls faced
        batter_stats = innings_state.batter_stats.get(striker.id, BatterStats())
        balls_faced = batter_stats.balls

        # Calculate partnership runs
        last_wicket = innings_state.fall_of_wickets[-1] if innings_state.fall_of_wickets else None
        partnership_runs = innings_state.runs - (last_wicket.runs if last_wicket else 0)

        # Count recent wickets (last 3 overs)
        recent_wickets = sum(
            1 for fow in innings_state.fall_of_wickets
            if fow.overs >= overs - 3
        )

        # Get bowler's wickets this innings
        bowler_stats = innings_state.bowler_stats.get(bowler.id, BowlerStats())
        bowler_wickets = bowler_stats.wickets

        # Build simulation context
        ctx = SimulationContext(
            striker=striker,
            bowler=bowler,
            phase=phase,
            overs=overs,
            wickets=innings_state.wickets,
            target=target,
            current_runs=innings_state.runs,
            balls_faced=balls_faced,
            batting_approach=batting_tactics.approach,
            bowling_length=bowling_tactics.length,
            field_setting=bowling_tactics.field_setting,
            partnership_runs=partnership_runs,
            recent_wickets=recent_wickets,
            bowler_wickets=bowler_wickets,
        )

        # Calculate probabilities
        probs = self.probability_model.calculate_probabilities(ctx)

        # Roll for outcome
        outcome = self._roll_outcome(probs, bowler, fielding_team)

        # Generate narrative
        narrative = ""
        if include_narrative:
            narrative = self.narrative_generator.generate(outcome, striker, bowler)

        return outcome, narrative, probs

    def _roll_outcome(
        self,
        probs: Dict[str, float],
        bowler: PlayerStats,
        fielding_team: List[PlayerStats],
    ) -> BallOutcome:
        """Roll for ball outcome based on probabilities."""
        rand = random.random()
        cumulative = 0.0

        # Check for extras first (small chance)
        extra_chance = self.probability_model.params.get("extras", {})
        wide_chance = extra_chance.get("wide_chance", 0.02)
        noball_chance = extra_chance.get("noball_chance", 0.01)

        if rand < wide_chance:
            return ExtraOutcome(extra_type="wide", runs=1)
        rand -= wide_chance

        if rand < noball_chance:
            return ExtraOutcome(extra_type="noball", runs=1)
        rand -= noball_chance

        # Re-normalize rand for remaining outcomes
        remaining = 1 - wide_chance - noball_chance
        rand = rand / remaining if remaining > 0 else rand

        # Roll through outcomes
        for outcome_type in ["dot", "single", "two", "three", "four", "six", "wicket"]:
            cumulative += probs.get(outcome_type, 0)
            if rand < cumulative:
                return self._create_outcome(outcome_type, bowler, fielding_team)

        # Default to dot
        return RunsOutcome(runs=0)

    def _create_outcome(
        self,
        outcome_type: str,
        bowler: PlayerStats,
        fielding_team: List[PlayerStats],
    ) -> BallOutcome:
        """Create the appropriate outcome object."""
        if outcome_type == "dot":
            return RunsOutcome(runs=0)
        elif outcome_type == "single":
            return RunsOutcome(runs=1)
        elif outcome_type == "two":
            return RunsOutcome(runs=2)
        elif outcome_type == "three":
            return RunsOutcome(runs=3)
        elif outcome_type == "four":
            # Check for boundary save
            if self._check_boundary_save(fielding_team):
                saved_runs = 2 if random.random() < 0.7 else 3
                return RunsOutcome(runs=saved_runs, boundary_saved=True)
            return RunsOutcome(runs=4)
        elif outcome_type == "six":
            return RunsOutcome(runs=6)
        elif outcome_type == "wicket":
            dismissal = self._get_dismissal_type(bowler)
            return WicketOutcome(dismissal_type=dismissal, runs=0)

        return RunsOutcome(runs=0)

    def _check_boundary_save(self, fielding_team: List[PlayerStats]) -> bool:
        """Check if athletic fielding saves a boundary."""
        if not fielding_team:
            return False

        # Calculate average fielding
        total_athleticism = sum(p.fielding.athleticism for p in fielding_team)
        total_ground = sum(p.fielding.ground for p in fielding_team)
        count = len(fielding_team)

        avg_athleticism = total_athleticism / count
        avg_ground = total_ground / count

        # Save chance based on fielding params
        fielding_config = self.probability_model.params.get("fielding", {})
        max_chance = fielding_config.get("boundary_save", {}).get("max_chance", 0.30)

        save_chance = ((avg_athleticism - 50) / 200) + ((avg_ground - 50) / 400)
        save_chance = min(max_chance, max(0, save_chance))

        return random.random() < save_chance

    def _get_dismissal_type(self, bowler: PlayerStats) -> DismissalType:
        """Get dismissal type based on bowler type."""
        dismissals = self.probability_model.params.get("dismissals", {})

        # Determine if pace or spin
        is_spin = bowler.bowling_style and "spin" in bowler.bowling_style.value.lower()

        if is_spin:
            probs = dismissals.get("spin_bowler", dismissals.get("base", {}))
        else:
            probs = dismissals.get("fast_bowler", dismissals.get("base", {}))

        # Roll for dismissal type
        rand = random.random()
        cumulative = 0.0

        for dismissal_type, prob in probs.items():
            cumulative += prob
            if rand < cumulative:
                return DismissalType(dismissal_type)

        return DismissalType.CAUGHT

    def simulate_over(
        self,
        batting_team: List[PlayerStats],
        bowling_team: List[PlayerStats],
        bowler: PlayerStats,
        innings_state: InningsState,
        batting_tactics: BattingTactics,
        bowling_tactics: BowlingTactics,
        pitch: PitchConditions,
        target: Optional[int] = None,
    ) -> Tuple[OverSummary, InningsState, bool]:
        """
        Simulate a complete over.

        Returns:
            Tuple of (over_summary, updated_innings_state, innings_complete)
        """
        over_number = innings_state.overs
        balls: List[BallEvent] = []
        runs = 0
        wickets = 0

        current_batters = list(innings_state.current_batters)
        striker_idx = 0

        # Copy innings state for updates
        updated_state = InningsState(
            batting_team=innings_state.batting_team,
            bowling_team=innings_state.bowling_team,
            runs=innings_state.runs,
            wickets=innings_state.wickets,
            overs=innings_state.overs,
            balls=innings_state.balls,
            current_batters=innings_state.current_batters,
            current_bowler=bowler.id,
            over_summaries=list(innings_state.over_summaries),
            fall_of_wickets=list(innings_state.fall_of_wickets),
            batter_stats=dict(innings_state.batter_stats),
            bowler_stats=dict(innings_state.bowler_stats),
            recent_balls=list(innings_state.recent_balls),
        )

        ball_number = 0
        innings_complete = False

        while ball_number < self.BALLS_PER_OVER and not innings_complete:
            # Get striker
            striker_id = current_batters[striker_idx]
            striker = next((p for p in batting_team if p.id == striker_id), None)

            if not striker:
                innings_complete = True
                break

            # Simulate ball
            outcome, narrative, probs = self.simulate_ball(
                striker=striker,
                bowler=bowler,
                innings_state=updated_state,
                batting_tactics=batting_tactics,
                bowling_tactics=bowling_tactics,
                pitch=pitch,
                fielding_team=bowling_team,
                target=target,
            )

            # Create ball event
            ball_event = BallEvent(
                over=over_number,
                ball=ball_number + 1,
                batter=striker_id,
                bowler=bowler.id,
                outcome=outcome,
                narrative=narrative,
            )
            balls.append(ball_event)

            # Process outcome
            is_legal = True

            if isinstance(outcome, WicketOutcome):
                wickets += 1
                runs += outcome.runs
                updated_state.wickets += 1
                updated_state.runs += outcome.runs

                # Record fall of wicket
                updated_state.fall_of_wickets.append(FallOfWicket(
                    player=striker_id,
                    runs=updated_state.runs,
                    overs=over_number + (ball_number + 1) / 10,
                ))

                # Get next batter
                used_batters = set(current_batters) | {
                    fow.player for fow in updated_state.fall_of_wickets
                }
                next_batter = next(
                    (p for p in batting_team if p.id not in used_batters),
                    None
                )

                if next_batter and updated_state.wickets < self.MAX_WICKETS:
                    current_batters[striker_idx] = next_batter.id
                else:
                    innings_complete = True

            elif isinstance(outcome, ExtraOutcome):
                runs += outcome.runs
                updated_state.runs += outcome.runs
                if outcome.extra_type in ("wide", "noball"):
                    is_legal = False

            elif isinstance(outcome, RunsOutcome):
                runs += outcome.runs
                updated_state.runs += outcome.runs

                # Update batter stats
                batter_stats = updated_state.batter_stats.get(
                    striker_id, BatterStats()
                )
                batter_stats.runs += outcome.runs
                batter_stats.balls += 1
                if outcome.runs == 4:
                    batter_stats.fours += 1
                elif outcome.runs == 6:
                    batter_stats.sixes += 1
                updated_state.batter_stats[striker_id] = batter_stats

                # Rotate strike on odd runs
                if outcome.runs % 2 == 1:
                    striker_idx = 1 - striker_idx

            # Update bowler stats
            if is_legal:
                bowler_stats = updated_state.bowler_stats.get(
                    bowler.id, BowlerStats()
                )
                if isinstance(outcome, WicketOutcome):
                    bowler_stats.wickets += 1
                    bowler_stats.runs += outcome.runs
                elif isinstance(outcome, RunsOutcome):
                    bowler_stats.runs += outcome.runs
                    if outcome.runs == 0:
                        bowler_stats.dots += 1
                elif isinstance(outcome, ExtraOutcome):
                    bowler_stats.runs += outcome.runs
                updated_state.bowler_stats[bowler.id] = bowler_stats

            # Count legal deliveries
            if is_legal:
                ball_number += 1

            # Check if target reached
            if target and updated_state.runs >= target:
                innings_complete = True
                break

        # End of over
        over_complete = ball_number >= self.BALLS_PER_OVER

        if over_complete:
            # Rotate strike at end of over
            striker_idx = 1 - striker_idx
            # Update bowler overs
            bowler_stats = updated_state.bowler_stats.get(bowler.id, BowlerStats())
            bowler_stats.overs += 1
            updated_state.bowler_stats[bowler.id] = bowler_stats

        # Update innings state
        updated_state.overs = over_number + (1 if over_complete else 0)
        updated_state.balls = 0 if over_complete else ball_number
        updated_state.current_batters = (
            current_batters[striker_idx],
            current_batters[1 - striker_idx]
        )

        # Check if innings complete
        if updated_state.overs >= self.TOTAL_OVERS:
            innings_complete = True
        if updated_state.wickets >= self.MAX_WICKETS:
            innings_complete = True

        # Create over summary
        over_summary = OverSummary(
            over_number=over_number,
            bowler=bowler.id,
            runs=runs,
            wickets=wickets,
            balls=balls,
        )

        updated_state.over_summaries.append(over_summary)
        updated_state.recent_balls = balls[-6:]

        return over_summary, updated_state, innings_complete

    def get_batsman_state(self, balls_faced: int) -> str:
        """Get batsman state for context updates."""
        thresholds = self.probability_model.params["batsman_state"]["thresholds"]
        if balls_faced < thresholds["new"]:
            return "new"
        if balls_faced < thresholds["settling"]:
            return "settling"
        return "set"

    def get_pressure_level(self, innings_state: InningsState, target: Optional[int]) -> str:
        """Determine current pressure level."""
        if target is None:
            return "low"

        balls_remaining = (self.TOTAL_OVERS - innings_state.overs) * 6 - innings_state.balls
        if balls_remaining <= 0:
            return "high"

        runs_needed = target - innings_state.runs
        required_rate = (runs_needed / balls_remaining) * 6

        if required_rate > 12:
            return "high"
        if required_rate > 9:
            return "medium"
        return "low"

    def get_momentum(self, innings_state: InningsState) -> str:
        """Determine current momentum."""
        if len(innings_state.over_summaries) < 2:
            return "neutral"

        last_two = innings_state.over_summaries[-2:]
        recent_runs = sum(o.runs for o in last_two)
        recent_wickets = sum(o.wickets for o in last_two)

        if recent_wickets >= 2:
            return "bowling"
        if recent_runs >= 20:
            return "batting"
        return "neutral"
