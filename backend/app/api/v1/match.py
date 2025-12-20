"""Match simulation API endpoints."""

from typing import List, Optional

from fastapi import APIRouter, HTTPException

from app.schemas.match import (
    SimulateBallRequest,
    SimulateBallResponse,
    SimulateOverRequest,
    SimulateOverResponse,
    BowlerRecommendRequest,
    BowlerRecommendResponse,
    BowlerAlternative,
    ContextUpdates,
    UpdatedState,
    RunsOutcome,
    WicketOutcome,
    ExtraOutcome,
    BatterStats,
)
from app.schemas.player import PlayerStats
from app.schemas.common import MatchPhase
from app.engine.match_engine import MatchEngine
from app.engine.probability_model import get_probability_model

router = APIRouter()

# Singleton engine instance
_engine: Optional[MatchEngine] = None


def get_engine() -> MatchEngine:
    """Get or create match engine instance."""
    global _engine
    if _engine is None:
        _engine = MatchEngine(get_probability_model())
    return _engine


@router.post("/simulate/ball", response_model=SimulateBallResponse)
async def simulate_ball(request: SimulateBallRequest):
    """
    Simulate a single ball delivery.

    Takes the current innings state, players involved, tactics, and conditions.
    Returns the outcome, narrative, and updated state information.
    """
    engine = get_engine()

    try:
        outcome, narrative, probs = engine.simulate_ball(
            striker=request.striker,
            bowler=request.bowler,
            innings_state=request.innings_state,
            batting_tactics=request.batting_tactics,
            bowling_tactics=request.bowling_tactics,
            pitch=request.pitch_conditions,
            fielding_team=request.fielding_team,
            target=request.target,
            include_narrative=request.include_narrative,
        )

        # Calculate updated state
        new_runs = request.innings_state.runs
        new_wickets = request.innings_state.wickets
        new_balls = request.innings_state.balls
        new_overs = request.innings_state.overs
        current_batters = list(request.innings_state.current_batters)
        striker_changed = False
        new_batsman_needed = False
        innings_complete = False

        if isinstance(outcome, WicketOutcome):
            new_runs += outcome.runs
            new_wickets += 1
            new_balls += 1
            new_batsman_needed = new_wickets < 10
            innings_complete = new_wickets >= 10
        elif isinstance(outcome, ExtraOutcome):
            new_runs += outcome.runs
            if outcome.extra_type not in ("wide", "noball"):
                new_balls += 1
        elif isinstance(outcome, RunsOutcome):
            new_runs += outcome.runs
            new_balls += 1
            if outcome.runs % 2 == 1:
                current_batters = [current_batters[1], current_batters[0]]
                striker_changed = True

        # Check over completion
        if new_balls >= 6:
            new_overs += 1
            new_balls = 0
            current_batters = [current_batters[1], current_batters[0]]
            striker_changed = not striker_changed

        # Check innings completion
        if new_overs >= 20:
            innings_complete = True
        if request.target and new_runs >= request.target:
            innings_complete = True

        # Get context updates
        batter_stats = request.innings_state.batter_stats.get(
            request.striker.id, BatterStats()
        )
        batsman_state = engine.get_batsman_state(batter_stats.balls + 1)
        pressure_level = engine.get_pressure_level(request.innings_state, request.target)
        momentum = engine.get_momentum(request.innings_state)

        return SimulateBallResponse(
            outcome=outcome,
            narrative=narrative,
            updated_state=UpdatedState(
                runs=new_runs,
                wickets=new_wickets,
                overs=new_overs,
                balls=new_balls,
                current_batters=tuple(current_batters),
                striker_changed=striker_changed,
                innings_complete=innings_complete,
                new_batsman_needed=new_batsman_needed,
            ),
            context_updates=ContextUpdates(
                batsman_state=batsman_state,
                pressure_level=pressure_level,
                momentum=momentum,
            ),
            probabilities_used=probs if request.include_narrative else None,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate/over", response_model=SimulateOverResponse)
async def simulate_over(request: SimulateOverRequest):
    """
    Simulate a complete over.

    Takes the current innings state, full team rosters, and tactics.
    Returns the over summary, updated innings state, and narratives.
    """
    engine = get_engine()

    # Find the bowler
    bowler = next(
        (p for p in request.bowling_team if p.id == request.bowler_id),
        None
    )
    if not bowler:
        raise HTTPException(status_code=400, detail=f"Bowler {request.bowler_id} not found")

    try:
        over_summary, updated_state, innings_complete = engine.simulate_over(
            batting_team=request.batting_team,
            bowling_team=request.bowling_team,
            bowler=bowler,
            innings_state=request.innings_state,
            batting_tactics=request.batting_tactics,
            bowling_tactics=request.bowling_tactics,
            pitch=request.pitch_conditions,
            target=request.target,
        )

        # Get recommended next bowler
        recommended_bowler = _recommend_next_bowler(
            bowling_team=request.bowling_team,
            updated_state=updated_state,
            last_bowler_id=bowler.id,
        )

        narratives = [ball.narrative for ball in over_summary.balls]

        return SimulateOverResponse(
            over_summary=over_summary,
            updated_innings_state=updated_state,
            innings_complete=innings_complete,
            narratives=narratives,
            recommended_next_bowler=recommended_bowler,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bowler/recommend", response_model=BowlerRecommendResponse)
async def recommend_bowler(request: BowlerRecommendRequest):
    """
    Get smart bowler recommendation based on match context.

    Analyzes available bowlers and returns the best choice with reasoning.
    """
    engine = get_engine()
    phase = engine.get_phase(request.innings_state.overs)

    # Filter eligible bowlers
    eligible = []
    for bowler in request.available_bowlers:
        if bowler.id == request.last_bowler_id:
            continue
        bowler_stats = request.innings_state.bowler_stats.get(bowler.id)
        overs_bowled = bowler_stats.overs if bowler_stats else 0
        if overs_bowled < 4:  # Max 4 overs per bowler
            eligible.append(bowler)

    if not eligible:
        # Fallback: anyone who hasn't maxed out
        eligible = [
            b for b in request.available_bowlers
            if (request.innings_state.bowler_stats.get(b.id) or type('', (), {'overs': 0})()).overs < 4
        ]

    if not eligible:
        raise HTTPException(status_code=400, detail="No eligible bowlers available")

    # Score each bowler
    analyses = []
    for bowler in eligible:
        score, reasoning = _score_bowler(bowler, request.innings_state, phase, request.match_context)
        analyses.append((bowler, score, reasoning))

    # Sort by score descending
    analyses.sort(key=lambda x: x[1], reverse=True)

    best = analyses[0]
    alternatives = [
        BowlerAlternative(
            bowler_id=a[0].id,
            score=a[1],
            reasoning=a[2],
        )
        for a in analyses[1:4]  # Top 3 alternatives
    ]

    return BowlerRecommendResponse(
        recommended_bowler_id=best[0].id,
        reasoning=best[2],
        alternatives=alternatives,
    )


def _recommend_next_bowler(
    bowling_team: List[PlayerStats],
    updated_state,
    last_bowler_id: str,
) -> Optional[str]:
    """Simple next bowler recommendation."""
    engine = get_engine()
    phase = engine.get_phase(updated_state.overs)

    # Get eligible bowlers
    eligible = []
    for bowler in bowling_team:
        if bowler.role.value not in ("bowler", "allrounder"):
            continue
        if bowler.id == last_bowler_id:
            continue
        bowler_stats = updated_state.bowler_stats.get(bowler.id)
        overs_bowled = bowler_stats.overs if bowler_stats else 0
        if overs_bowled < 4:
            eligible.append(bowler)

    if not eligible:
        return None

    # Simple scoring
    best_bowler = None
    best_score = -1

    for bowler in eligible:
        score = _simple_bowler_score(bowler, updated_state, phase)
        if score > best_score:
            best_score = score
            best_bowler = bowler

    return best_bowler.id if best_bowler else None


def _simple_bowler_score(bowler: PlayerStats, state, phase: MatchPhase) -> float:
    """Simple bowler scoring for recommendations."""
    score = 50.0

    is_pace = bowler.bowling_style and "fast" in bowler.bowling_style.value.lower()
    is_spin = bowler.bowling_style and "spin" in bowler.bowling_style.value.lower()

    # Phase matching
    if phase == MatchPhase.POWERPLAY and is_pace:
        score += 20
    elif phase == MatchPhase.MIDDLE and is_spin:
        score += 20
    elif phase == MatchPhase.DEATH and is_pace:
        score += 25

    # Wicket bonus
    bowler_stats = state.bowler_stats.get(bowler.id)
    if bowler_stats:
        score += bowler_stats.wickets * 10
        # Economy
        if bowler_stats.overs > 0:
            economy = bowler_stats.runs / bowler_stats.overs
            if economy < 6:
                score += 15
            elif economy > 10:
                score -= 15

    # Skill bonus
    overall_skill = (
        bowler.bowling.speed * 0.2 +
        bowler.bowling.accuracy * 0.35 +
        bowler.bowling.variation * 0.25 +
        bowler.bowling.stamina * 0.2
    )
    score += (overall_skill - 55) * 0.3

    # Form bonus
    score += bowler.form * 0.5

    return score


def _score_bowler(bowler: PlayerStats, state, phase: MatchPhase, context) -> tuple:
    """Score a bowler with detailed reasoning."""
    score = _simple_bowler_score(bowler, state, phase)

    reasons = []

    is_pace = bowler.bowling_style and "fast" in bowler.bowling_style.value.lower()
    is_spin = bowler.bowling_style and "spin" in bowler.bowling_style.value.lower()

    if phase == MatchPhase.POWERPLAY and is_pace:
        reasons.append("Pace suits powerplay")
    elif phase == MatchPhase.MIDDLE and is_spin:
        reasons.append("Spin effective in middle overs")
    elif phase == MatchPhase.DEATH and is_pace:
        reasons.append("Pace crucial at death")

    bowler_stats = state.bowler_stats.get(bowler.id)
    if bowler_stats and bowler_stats.wickets >= 2:
        reasons.append(f"On a roll with {bowler_stats.wickets} wickets")

    if context.partnership_runs >= 30:
        if is_spin:
            reasons.append("Spin could break partnership")
        else:
            reasons.append("Pace could break partnership")

    reasoning = "; ".join(reasons) if reasons else "Solid option for this phase"

    return score, reasoning
