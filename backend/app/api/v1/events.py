"""Event generation API endpoints."""

import time
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.schemas.events import (
    GenerateEventRequest,
    GenerateEventResponse,
    ResolveEventRequest,
    ResolveEventResponse,
    AppliedEffect,
)
from app.events.event_engine import get_event_engine
from app.events.event_loader import get_event_loader
from app.logging_config import api_logger, generate_request_id

router = APIRouter()


@router.post("/generate", response_model=GenerateEventResponse)
async def generate_event(
    request: GenerateEventRequest,
    force_trigger: bool = Query(False, description="Skip random trigger chance")
):
    """
    Generate a context-aware random event.

    Takes game context and team information.
    Returns an applicable event with options, or null if:
    - Trigger roll fails (35% base chance)
    - No valid events match current conditions

    The event engine evaluates:
    - Game phase (season, playoffs, off-season)
    - Recent results and streaks
    - Team morale, board patience, press heat
    - Individual player states (form, morale, contracts)
    - Recent events (cooldown prevention)
    """
    engine = get_event_engine()
    request_id = generate_request_id()
    start_time = time.time()

    # Convert category filter from enum to string if provided
    category_filter = None
    if request.category_filter:
        category_filter = request.category_filter.value

    event = engine.generate_event(
        game_context=request.game_context,
        team_players=request.team_players,
        recent_event_ids=request.recent_event_ids,
        category_filter=category_filter,
        force_trigger=force_trigger,
    )

    # Build debug info
    loader = get_event_loader()
    template_counts = loader.get_template_count()

    response = GenerateEventResponse(
        event=event,
        debug={
            "template_counts": template_counts,
            "total_templates": sum(template_counts.values()),
            "event_triggered": event is not None,
            "force_trigger": force_trigger,
            "category_filter": category_filter,
        }
    )

    # Log analytics data
    duration_ms = (time.time() - start_time) * 1000
    api_logger.log_analytics_event(
        event_type="event_generated",
        data={
            "event_triggered": event is not None,
            "event_id": event.id if event else None,
            "event_category": event.category if event else None,
            "event_title": event.title if event else None,
            "force_trigger": force_trigger,
            "category_filter": category_filter,
            "game_phase": request.game_context.phase.value if request.game_context else None,
            "team_morale": request.game_context.team_morale if request.game_context else None,
            "duration_ms": round(duration_ms, 2),
        },
        request_id=request_id,
    )

    return response


@router.post("/resolve", response_model=ResolveEventResponse)
async def resolve_event(request: ResolveEventRequest):
    """
    Resolve an event with a chosen option.

    Takes the event ID, chosen option, and current states.
    Returns:
    - Effects applied to players and team
    - Narrative result text
    - Optional follow-up event ID
    """
    engine = get_event_engine()
    request_id = generate_request_id()
    start_time = time.time()

    result = engine.resolve_event(
        event_id=request.event_id,
        chosen_option_id=request.chosen_option_id,
        player_states=request.player_states,
        team_state=request.team_state,
    )

    # Convert to response model
    player_effects = [
        AppliedEffect(
            player_id=eff.get("player_id"),
            attribute=eff["attribute"],
            old_value=eff["old_value"],
            new_value=eff["new_value"],
        )
        for eff in result["player_effects"]
    ]

    team_effects = [
        AppliedEffect(
            player_id=None,
            attribute=eff["attribute"],
            old_value=eff["old_value"],
            new_value=eff["new_value"],
        )
        for eff in result["team_effects"]
    ]

    response = ResolveEventResponse(
        player_effects=player_effects,
        team_effects=team_effects,
        narrative_result=result["narrative_result"],
        follow_up_event_id=None,  # Future: chain events
    )

    # Log analytics data
    duration_ms = (time.time() - start_time) * 1000
    api_logger.log_analytics_event(
        event_type="event_resolved",
        data={
            "event_id": request.event_id,
            "chosen_option_id": request.chosen_option_id,
            "player_effects_count": len(player_effects),
            "team_effects_count": len(team_effects),
            "duration_ms": round(duration_ms, 2),
        },
        request_id=request_id,
    )

    return response


@router.get("/templates/count")
async def get_template_counts():
    """Get count of event templates by category."""
    loader = get_event_loader()
    counts = loader.get_template_count()
    return {
        "counts": counts,
        "total": sum(counts.values()),
    }


@router.get("/templates/{template_id}")
async def get_template(template_id: str):
    """Get a specific event template by ID (for debugging)."""
    loader = get_event_loader()
    template = loader.get_template(template_id)

    if not template:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    return {
        "id": template.id,
        "category": template.category,
        "title": template.title,
        "weight": template.weight,
        "cooldown_days": template.cooldown_days,
        "conditions_count": len(template.conditions),
        "options_count": len(template.options),
        "tags": template.tags,
    }
