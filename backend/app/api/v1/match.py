"""Match simulation API endpoints."""

import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request

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
from app.logging_config import api_logger, generate_request_id

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
    request_id = generate_request_id()
    start_time = time.time()

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

        response = SimulateBallResponse(
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

        # Log analytics data
        duration_ms = (time.time() - start_time) * 1000
        api_logger.log_analytics_event(
            event_type="ball_simulated",
            data={
                "outcome_type": outcome.type,
                "runs": outcome.runs if hasattr(outcome, "runs") else 0,
                "dismissal": outcome.dismissal_type if isinstance(outcome, WicketOutcome) else None,
                "phase": request.match_phase.value if request.match_phase else "unknown",
                "batting_approach": request.batting_tactics.approach.value if request.batting_tactics else None,
                "bowling_length": request.bowling_tactics.length.value if request.bowling_tactics else None,
                "score": f"{new_runs}/{new_wickets}",
                "overs": f"{new_overs}.{new_balls}",
                "target": request.target,
                "striker_id": request.striker.id,
                "bowler_id": request.bowler.id,
                "duration_ms": round(duration_ms, 2),
            },
            request_id=request_id,
        )

        return response

    except Exception as e:
        api_logger.log_analytics_event(
            event_type="ball_simulation_error",
            data={"error": str(e)},
            request_id=request_id,
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate/over", response_model=SimulateOverResponse)
async def simulate_over(request: SimulateOverRequest):
    """
    Simulate a complete over.

    Takes the current innings state, full team rosters, and tactics.
    Returns the over summary, updated innings state, and narratives.
    """
    engine = get_engine()
    request_id = generate_request_id()
    start_time = time.time()

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

        response = SimulateOverResponse(
            over_summary=over_summary,
            updated_innings_state=updated_state,
            innings_complete=innings_complete,
            narratives=narratives,
            recommended_next_bowler=recommended_bowler,
        )

        # Log analytics data
        duration_ms = (time.time() - start_time) * 1000
        api_logger.log_analytics_event(
            event_type="over_simulated",
            data={
                "over_number": over_summary.over_number,
                "over_runs": over_summary.runs,
                "over_wickets": over_summary.wickets,
                "bowler_id": bowler.id,
                "bowler_style": bowler.bowling_style.value if bowler.bowling_style else None,
                "batting_approach": request.batting_tactics.approach.value if request.batting_tactics else None,
                "bowling_length": request.bowling_tactics.length.value if request.bowling_tactics else None,
                "score": f"{updated_state.runs}/{updated_state.wickets}",
                "target": request.target,
                "innings_complete": innings_complete,
                "duration_ms": round(duration_ms, 2),
            },
            request_id=request_id,
        )

        return response

    except Exception as e:
        api_logger.log_analytics_event(
            event_type="over_simulation_error",
            data={"error": str(e), "bowler_id": request.bowler_id},
            request_id=request_id,
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bowler/recommend", response_model=BowlerRecommendResponse)
async def recommend_bowler(request: BowlerRecommendRequest):
    """
    Get smart bowler recommendation based on match context.

    Analyzes available bowlers and returns the best choice with reasoning.
    """
    engine = get_engine()
    request_id = generate_request_id()
    start_time = time.time()
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

    response = BowlerRecommendResponse(
        recommended_bowler_id=best[0].id,
        reasoning=best[2],
        alternatives=alternatives,
    )

    # Log analytics data
    duration_ms = (time.time() - start_time) * 1000
    api_logger.log_analytics_event(
        event_type="bowler_recommended",
        data={
            "recommended_id": best[0].id,
            "recommended_style": best[0].bowling_style.value if best[0].bowling_style else None,
            "phase": phase.value,
            "score": f"{request.innings_state.runs}/{request.innings_state.wickets}",
            "overs": request.innings_state.overs,
            "partnership_runs": request.match_context.partnership_runs if request.match_context else 0,
            "eligible_bowlers": len(eligible),
            "duration_ms": round(duration_ms, 2),
        },
        request_id=request_id,
    )

    return response


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
    """
    Simple bowler scoring for recommendations.

    Uses IPL-derived spell patterns:
    - Pace: 49.5% PP, 27.4% middle, 23.1% death
    - Spin: 22.8% PP, 65.9% middle, 11.3% death
    """
    score = 50.0
    engine = get_engine()

    # Get spell patterns from config
    spell_patterns = engine.probability_model.params.get("spell_patterns", {})
    pace_profile = spell_patterns.get("pace_profile", {
        "powerplay": 0.495, "middle": 0.274, "death": 0.231
    })
    spin_profile = spell_patterns.get("spin_profile", {
        "powerplay": 0.228, "middle": 0.659, "death": 0.113
    })

    is_pace = bowler.bowling_style and "fast" in bowler.bowling_style.value.lower()
    is_spin = bowler.bowling_style and "spin" in bowler.bowling_style.value.lower()

    # Phase matching using IPL-derived spell patterns
    # Score bonus based on how much this bowler type typically bowls in this phase
    phase_key = phase.value  # "powerplay", "middle", or "death"

    if is_pace:
        # Pace bowlers get bonus proportional to their typical phase usage
        phase_weight = pace_profile.get(phase_key, 0.33)
        # Scale: 0.495 (PP) -> +25, 0.274 (middle) -> +10, 0.231 (death) -> +15
        score += phase_weight * 50  # Max ~25 points for preferred phase
    elif is_spin:
        # Spin bowlers get bonus proportional to their typical phase usage
        phase_weight = spin_profile.get(phase_key, 0.33)
        # Scale: 0.659 (middle) -> +33, 0.228 (PP) -> +11, 0.113 (death) -> +6
        score += phase_weight * 50  # Max ~33 points for preferred phase

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
    """
    Score a bowler with detailed reasoning.

    Uses IPL-derived insights:
    - Pace bowls 50% in PP, 23% at death
    - Spin bowls 66% in middle overs
    - Partnership 30+ runs increases boundary rate by 19%
    """
    score = _simple_bowler_score(bowler, state, phase)

    reasons = []

    is_pace = bowler.bowling_style and "fast" in bowler.bowling_style.value.lower()
    is_spin = bowler.bowling_style and "spin" in bowler.bowling_style.value.lower()

    # Phase-based reasoning with IPL percentages
    if phase == MatchPhase.POWERPLAY:
        if is_pace:
            reasons.append("Pace bowlers bowl 50% of PP overs in IPL")
        elif is_spin:
            reasons.append("Spin only 23% of PP overs - use strategically")
    elif phase == MatchPhase.MIDDLE:
        if is_spin:
            reasons.append("Spin dominates middle overs (66% in IPL)")
        elif is_pace:
            reasons.append("Pace less common in middle (27%)")
    elif phase == MatchPhase.DEATH:
        if is_pace:
            reasons.append("Pace handles death overs (23% allocation)")
        elif is_spin:
            reasons.append("Spin rare at death (11%) - risky choice")

    # Bowler on a roll
    bowler_stats = state.bowler_stats.get(bowler.id)
    if bowler_stats and bowler_stats.wickets >= 2:
        reasons.append(f"On a roll with {bowler_stats.wickets} wickets")

    # Partnership breaking - data shows spin can disrupt rhythm
    if context.partnership_runs >= 50:
        if is_spin:
            reasons.append("Spin change could break 50+ partnership")
        else:
            reasons.append("Pace aggression vs settled batters")
    elif context.partnership_runs >= 30:
        reasons.append(f"Partnership at {context.partnership_runs} - change of pace needed")

    # Recent wickets - pressure situation
    recent_wickets = sum(
        1 for fow in state.fall_of_wickets
        if fow.overs >= state.overs - 3
    )
    if recent_wickets >= 2:
        reasons.append(f"Keep pressure after {recent_wickets} recent wickets")

    reasoning = "; ".join(reasons) if reasons else "Solid option for this phase"

    return score, reasoning
