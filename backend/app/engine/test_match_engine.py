"""
Test Match Engine for Cricket Simulation.

Extends the core MatchEngine with Test-specific mechanics:
- Day/session structure (5 days, 90 overs per day, 3 sessions)
- Weather interruptions based on venue
- Declaration and follow-on logic
- Draw conditions

Based on analysis of 866 real Test matches from Cricsheet.
"""

import random
from typing import Dict, List, Optional, Tuple
from enum import Enum

from app.engine.match_engine import MatchEngine
from app.schemas.common import get_format_config
from app.schemas.match import (
    TestSession,
    WeatherCondition,
    TestMatchState,
    WeatherEvent,
    InningsState,
    PitchConditions,
    BattingTactics,
    BowlingTactics,
    TEST_OVERS_PER_DAY,
    TEST_OVERS_PER_SESSION,
    TEST_MAX_DAYS,
    FOLLOW_ON_THRESHOLD,
)
from app.schemas.player import PlayerStats


# Weather parameters by country (from analysis of 866 Test matches)
WEATHER_BY_COUNTRY: Dict[str, Dict[str, float]] = {
    "South Africa": {"rain_probability": 0.35, "avg_overs_lost_if_rain": 32},
    "West Indies": {"rain_probability": 0.32, "avg_overs_lost_if_rain": 31},
    "Bangladesh": {"rain_probability": 0.32, "avg_overs_lost_if_rain": 31},
    "England": {"rain_probability": 0.31, "avg_overs_lost_if_rain": 30},
    "Australia": {"rain_probability": 0.30, "avg_overs_lost_if_rain": 30},
    "Zimbabwe": {"rain_probability": 0.29, "avg_overs_lost_if_rain": 30},
    "India": {"rain_probability": 0.28, "avg_overs_lost_if_rain": 29},
    "New Zealand": {"rain_probability": 0.28, "avg_overs_lost_if_rain": 29},
    "Sri Lanka": {"rain_probability": 0.27, "avg_overs_lost_if_rain": 28},
    "Pakistan": {"rain_probability": 0.26, "avg_overs_lost_if_rain": 28},
    "UAE": {"rain_probability": 0.15, "avg_overs_lost_if_rain": 22},
}

# Pitch deterioration by innings (from analysis)
PITCH_DETERIORATION: Dict[int, Dict[str, float]] = {
    1: {"batting_difficulty_increase": 0.0},
    2: {"batting_difficulty_increase": 1.8},
    3: {"batting_difficulty_increase": -0.9},  # Counter-intuitive but real data shows this
    4: {"batting_difficulty_increase": -4.8},  # Aggressive chasing increases run rate
}


class TestMatchEngine(MatchEngine):
    """
    Test match simulation engine with full 5-day mechanics.

    Extends MatchEngine with:
    - Day and session tracking
    - Weather interruptions
    - Declaration logic
    - Follow-on enforcement
    - Draw conditions
    """

    def __init__(self, country: str = "England"):
        """Initialize Test match engine with venue-specific weather."""
        super().__init__(format_config=get_format_config("test"))

        self.country = country
        self.weather_params = WEATHER_BY_COUNTRY.get(country, WEATHER_BY_COUNTRY["England"])

    def create_initial_state(self) -> TestMatchState:
        """Create initial Test match state."""
        return TestMatchState(
            current_day=1,
            current_session=TestSession.MORNING,
            total_overs_bowled=0,
            overs_bowled_today=0,
            current_weather=WeatherCondition.CLEAR,
            total_overs_lost=0,
            overs_lost_today=0,
            current_innings=1,
            innings_runs=[0, 0, 0, 0],
            innings_wickets=[0, 0, 0, 0],
            innings_declared=[False, False, False, False],
            innings_complete=[False, False, False, False],
            follow_on_available=False,
            follow_on_enforced=False,
            match_complete=False,
            result=None,
            result_margin=None,
        )

    def advance_session(self, state: TestMatchState) -> Tuple[TestMatchState, Optional[WeatherEvent]]:
        """
        Advance to the next session, potentially with weather interruption.

        Returns:
            Updated state and optional weather event if rain occurred.
        """
        weather_event = None

        # Check for weather interruption
        if random.random() < self.weather_params["rain_probability"] / 3:  # Per session
            overs_lost = random.randint(5, int(self.weather_params["avg_overs_lost_if_rain"]))
            overs_lost = min(overs_lost, TEST_OVERS_PER_SESSION)

            state.overs_lost_today += overs_lost
            state.total_overs_lost += overs_lost

            weather_event = WeatherEvent(
                day=state.current_day,
                session=state.current_session,
                condition=WeatherCondition.HEAVY_RAIN if overs_lost > 15 else WeatherCondition.LIGHT_RAIN,
                overs_lost=overs_lost,
                description=f"Rain delay - {overs_lost} overs lost"
            )

            state.current_weather = weather_event.condition
        else:
            state.current_weather = WeatherCondition.CLEAR

        # Advance to next session
        if state.current_session == TestSession.MORNING:
            state.current_session = TestSession.AFTERNOON
        elif state.current_session == TestSession.AFTERNOON:
            state.current_session = TestSession.EVENING
        elif state.current_session == TestSession.EVENING:
            # End of day - move to next day
            state.current_day += 1
            state.current_session = TestSession.MORNING
            state.overs_bowled_today = 0
            state.overs_lost_today = 0

            if state.current_day > TEST_MAX_DAYS:
                state.match_complete = True
                if not state.result:
                    state.result = "draw"

        return state, weather_event

    def can_bowl_over(self, state: TestMatchState) -> Tuple[bool, str]:
        """
        Check if another over can be bowled today.

        Returns:
            (can_bowl, reason)
        """
        if state.match_complete:
            return False, "Match complete"

        max_overs_today = TEST_OVERS_PER_DAY - state.overs_lost_today

        if state.overs_bowled_today >= max_overs_today:
            return False, "Day's play complete"

        if state.current_weather in (WeatherCondition.HEAVY_RAIN, WeatherCondition.LIGHT_RAIN):
            return False, "Weather delay"

        return True, ""

    def get_current_session_overs_remaining(self, state: TestMatchState) -> int:
        """Get overs remaining in current session."""
        session_start_overs = {
            TestSession.MORNING: 0,
            TestSession.AFTERNOON: TEST_OVERS_PER_SESSION,
            TestSession.EVENING: TEST_OVERS_PER_SESSION * 2,
        }

        session_start = session_start_overs[state.current_session]
        session_end = session_start + TEST_OVERS_PER_SESSION

        overs_remaining_in_session = session_end - state.overs_bowled_today
        return max(0, overs_remaining_in_session)

    def check_follow_on(
        self,
        state: TestMatchState,
        team1_first_innings: int,
        team2_first_innings: int,
    ) -> bool:
        """
        Check if follow-on is available after second innings.

        Follow-on can be enforced if:
        - Team batting second trails by >= 200 runs
        - This is after the second innings
        """
        if state.current_innings != 2 or not state.innings_complete[1]:
            return False

        trail = team1_first_innings - team2_first_innings
        return trail >= FOLLOW_ON_THRESHOLD

    def enforce_follow_on(self, state: TestMatchState) -> TestMatchState:
        """
        Enforce follow-on: team batting second must bat again immediately.

        Standard innings order: Team1 (1st) -> Team2 (2nd) -> Team1 (3rd) -> Team2 (4th)
        With follow-on: Team1 (1st) -> Team2 (2nd) -> Team2 (3rd) -> Team1 (4th)
        """
        state.follow_on_enforced = True
        state.current_innings = 3
        # The team that batted second will bat third (follow-on)
        return state

    def can_declare(
        self,
        state: TestMatchState,
        batting_team_innings: int,
        batting_runs: int,
        opposition_runs: int,
        wickets: int,
    ) -> Tuple[bool, str]:
        """
        Check if declaration is advisable.

        Returns:
            (should_declare, reason)
        """
        # First innings: rarely declare unless massive lead
        if state.current_innings == 1:
            if batting_runs >= 600 and wickets >= 5:
                return True, "Massive first innings total"
            return False, "First innings - build lead"

        # Second innings: declare if big lead and want time to bowl
        if state.current_innings == 2:
            trail = opposition_runs - batting_runs
            if trail < 0:  # Actually ahead
                lead = -trail
                if lead >= 150 and state.current_day <= 3:
                    return True, f"Lead of {lead} with time to bowl"
            return False, "Still building innings"

        # Third innings (could be enforcing team or follow-on team)
        if state.current_innings == 3:
            if state.follow_on_enforced:
                # This is the team that followed on - bat to set target
                lead = batting_runs - opposition_runs
                if lead >= 250 and state.current_day >= 4:
                    return True, f"Set target of {lead + 1}"
            else:
                # Normal 3rd innings - set target
                lead = batting_runs + state.innings_runs[0] - state.innings_runs[1]
                overs_remaining = self._calculate_overs_remaining(state)
                if lead >= 300 and overs_remaining >= 90:
                    return True, f"Set target of {lead + 1} with {overs_remaining} overs remaining"
                if lead >= 200 and overs_remaining >= 60:
                    return True, f"Set target of {lead + 1}"

        return False, "Continue batting"

    def _calculate_overs_remaining(self, state: TestMatchState) -> int:
        """Calculate approximate overs remaining in match."""
        days_left = TEST_MAX_DAYS - state.current_day
        overs_remaining_today = TEST_OVERS_PER_DAY - state.overs_bowled_today - state.overs_lost_today
        return (days_left * TEST_OVERS_PER_DAY) + overs_remaining_today

    def check_draw_likelihood(self, state: TestMatchState, target: int, batting_runs: int) -> float:
        """
        Calculate likelihood of a draw in 4th innings.

        Returns probability from 0.0 to 1.0
        """
        if state.current_innings != 4:
            return 0.0

        overs_remaining = self._calculate_overs_remaining(state)
        runs_needed = target - batting_runs

        if runs_needed <= 0:
            return 0.0  # Already won

        if overs_remaining <= 0:
            return 1.0  # No time left, draw

        required_rate = runs_needed / overs_remaining

        # Based on historical data: 19.1% of Tests are draws
        # Higher RRR = more likely to draw (defend)
        if required_rate > 6:
            return 0.8  # Very likely draw
        elif required_rate > 4:
            return 0.5
        elif required_rate > 3:
            return 0.3
        else:
            return 0.1

    def determine_result(
        self,
        state: TestMatchState,
        team1_name: str,
        team2_name: str,
    ) -> Tuple[str, str]:
        """
        Determine the match result.

        Returns:
            (result, margin_description)
        """
        innings = state.innings_runs
        wickets = state.innings_wickets

        # Check if match is complete
        if not state.match_complete:
            return "", ""

        # Calculate totals
        if state.follow_on_enforced:
            # Team1: innings 0 + 3, Team2: innings 1 + 2
            team1_total = innings[0] + innings[3]
            team2_total = innings[1] + innings[2]
        else:
            # Normal: Team1: innings 0 + 2, Team2: innings 1 + 3
            team1_total = innings[0] + innings[2]
            team2_total = innings[1] + innings[3]

        # Check for draw
        if state.result == "draw":
            return "draw", "Match drawn"

        # Determine winner
        if team1_total > team2_total:
            margin = team1_total - team2_total
            # Check for innings victory
            if state.current_innings <= 3 and innings[1] + innings[2 if state.follow_on_enforced else 3] == 0:
                return f"{team1_name}", f"by an innings and {margin} runs"
            return f"{team1_name}", f"by {margin} runs"
        elif team2_total > team1_total:
            # Team 2 won chasing - wins by wickets
            wickets_remaining = 10 - wickets[3 if not state.follow_on_enforced else 2]
            return f"{team2_name}", f"by {wickets_remaining} wickets"
        else:
            return "draw", "Match tied"

    def update_pitch_conditions(
        self,
        pitch: PitchConditions,
        state: TestMatchState,
    ) -> PitchConditions:
        """
        Update pitch conditions based on day and innings.

        Pitch typically deteriorates over time:
        - More spin on days 4-5
        - More variable bounce
        """
        day_factor = state.current_day / TEST_MAX_DAYS
        innings_factor = PITCH_DETERIORATION.get(state.current_innings, {}).get("batting_difficulty_increase", 0)

        # Increase spin assistance on later days
        new_spin = min(100, pitch.spin + int(15 * day_factor))

        # Increase deterioration
        new_deterioration = min(100, pitch.deterioration + int(20 * day_factor))

        # Decrease pace on worn pitches
        new_pace = max(30, pitch.pace - int(10 * day_factor))

        return PitchConditions(
            pace=new_pace,
            spin=new_spin,
            bounce=pitch.bounce,
            deterioration=new_deterioration,
        )

    def simulate_session(
        self,
        batting_team: List[PlayerStats],
        bowling_team: List[PlayerStats],
        innings_state: InningsState,
        test_state: TestMatchState,
        batting_tactics: BattingTactics,
        bowling_tactics: BowlingTactics,
        pitch: PitchConditions,
        target: Optional[int] = None,
    ) -> Tuple[InningsState, TestMatchState, List[str]]:
        """
        Simulate one session of play (approximately 30 overs).

        Returns:
            Updated innings state, updated test state, and list of narratives
        """
        narratives = []
        overs_to_bowl = min(
            TEST_OVERS_PER_SESSION,
            self.get_current_session_overs_remaining(test_state)
        )

        overs_bowled = 0
        innings_complete = False

        while overs_bowled < overs_to_bowl and not innings_complete:
            # Select bowler (simple rotation for now)
            bowler = bowling_team[overs_bowled % len(bowling_team)]

            # Simulate over
            over_summary, innings_state, innings_complete = self.simulate_over(
                batting_team=batting_team,
                bowling_team=bowling_team,
                bowler=bowler,
                innings_state=innings_state,
                batting_tactics=batting_tactics,
                bowling_tactics=bowling_tactics,
                pitch=pitch,
                target=target,
            )

            overs_bowled += 1
            test_state.overs_bowled_today += 1
            test_state.total_overs_bowled += 1

            # Check for innings completion
            if innings_complete:
                test_state.innings_runs[test_state.current_innings - 1] = innings_state.runs
                test_state.innings_wickets[test_state.current_innings - 1] = innings_state.wickets
                test_state.innings_complete[test_state.current_innings - 1] = True

                narratives.append(
                    f"Innings complete: {innings_state.runs}/{innings_state.wickets}"
                )

        return innings_state, test_state, narratives

    def get_day_summary(self, state: TestMatchState) -> str:
        """Get a summary of the day's play."""
        return (
            f"Day {state.current_day}: "
            f"{state.overs_bowled_today} overs bowled, "
            f"{state.overs_lost_today} overs lost to weather. "
            f"Innings {state.current_innings}: {state.innings_runs[state.current_innings - 1]}/"
            f"{state.innings_wickets[state.current_innings - 1]}"
        )
