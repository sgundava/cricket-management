"""Event engine for generating context-aware events.

Combines event templates, condition evaluation, and weighted random selection
to generate meaningful events that fit the current game state.
"""

import random
import uuid
from typing import Dict, List, Optional, Tuple

from app.config import get_settings
from app.events.event_loader import EventLoader, EventTemplate, get_event_loader
from app.events.condition_evaluator import ConditionEvaluator, EvaluationContext
from app.schemas.events import (
    GameContext,
    PlayerInfo,
    GeneratedEvent,
    EventOption,
    EventEffect,
)
from app.schemas.common import EventCategory, RiskLevel


class EventEngine:
    """Generates context-aware events based on game state."""

    def __init__(self, loader: Optional[EventLoader] = None):
        self.loader = loader or get_event_loader()
        self.evaluator = ConditionEvaluator()
        self.settings = get_settings()

    def generate_event(
        self,
        game_context: GameContext,
        team_players: List[PlayerInfo],
        recent_event_ids: List[str],
        category_filter: Optional[str] = None,
        force_trigger: bool = False,
    ) -> Optional[GeneratedEvent]:
        """Generate a context-appropriate event.

        Args:
            game_context: Current game state
            team_players: List of players in the team
            recent_event_ids: Recently triggered event IDs (for cooldown)
            category_filter: Optional category to restrict to
            force_trigger: Skip the random trigger chance

        Returns:
            Generated event or None if trigger roll fails
        """
        # Check trigger probability (35% by default)
        if not force_trigger:
            if random.random() > self.settings.event_trigger_chance:
                return None

        # Build evaluation context
        ctx = EvaluationContext.from_request(game_context, team_players, recent_event_ids)

        # Find all valid templates
        valid_templates = self._find_valid_templates(ctx, category_filter)

        if not valid_templates:
            return None

        # Weighted random selection
        template, target_player = self._select_template(valid_templates)

        # Generate the event
        return self._create_event(template, ctx, target_player)

    def _find_valid_templates(
        self,
        ctx: EvaluationContext,
        category_filter: Optional[str] = None,
    ) -> List[Tuple[EventTemplate, Optional[PlayerInfo]]]:
        """Find all templates whose conditions are met.

        Returns list of (template, target_player) tuples.
        """
        valid: List[Tuple[EventTemplate, Optional[PlayerInfo]]] = []

        # Get templates to check
        if category_filter:
            templates = self.loader.get_templates_by_category(category_filter)
        else:
            templates = self.loader.get_all_templates()

        for template in templates:
            # Check cooldown
            if template.id in ctx.recent_event_ids:
                continue

            # Check global conditions
            if not self.evaluator.evaluate(template.conditions, ctx):
                continue

            # Check if template requires a target player
            if template.target_player_conditions:
                matching_players = self.evaluator.find_matching_players(
                    template.target_player_conditions, ctx
                )
                if not matching_players:
                    continue
                # Add entry for each matching player
                for player in matching_players:
                    valid.append((template, player))
            else:
                valid.append((template, None))

        return valid

    def _select_template(
        self,
        valid_templates: List[Tuple[EventTemplate, Optional[PlayerInfo]]]
    ) -> Tuple[EventTemplate, Optional[PlayerInfo]]:
        """Select a template using weighted random selection."""
        if not valid_templates:
            raise ValueError("No valid templates to select from")

        weights = [t[0].weight for t in valid_templates]
        selected = random.choices(valid_templates, weights=weights, k=1)[0]
        return selected

    def _create_event(
        self,
        template: EventTemplate,
        ctx: EvaluationContext,
        target_player: Optional[PlayerInfo],
    ) -> GeneratedEvent:
        """Create a GeneratedEvent from a template."""
        # Generate unique event ID
        event_id = f"{template.id}-{uuid.uuid4().hex[:8]}"

        # Process description template
        description = self._render_template(
            template.description_template,
            ctx,
            target_player,
        )

        # Convert options
        options = [
            self._convert_option(opt, target_player)
            for opt in template.options
        ]

        # Determine involved players
        involved_players = []
        if target_player:
            involved_players.append(target_player.id)

        return GeneratedEvent(
            id=event_id,
            template_id=template.id,
            category=EventCategory(template.category),
            title=template.title,
            description=description,
            involved_players=involved_players,
            urgency=template.urgency,
            options=options,
        )

    def _render_template(
        self,
        template_str: str,
        ctx: EvaluationContext,
        target_player: Optional[PlayerInfo],
    ) -> str:
        """Render a template string with context variables."""
        result = template_str

        # Player substitutions
        if target_player:
            result = result.replace("{player.name}", target_player.name)
            result = result.replace("{player.short_name}", target_player.short_name)
            result = result.replace("{player.role}", target_player.role)

        # Game context substitutions
        result = result.replace("{match_day}", str(ctx.game.match_day))
        result = result.replace("{season}", str(ctx.game.season))
        result = result.replace("{streak}", str(abs(ctx.game.current_streak)))
        result = result.replace("{position}", str(ctx.game.league_position))

        return result

    def _convert_option(
        self,
        template_option,
        target_player: Optional[PlayerInfo],
    ) -> EventOption:
        """Convert a template option to schema EventOption."""
        effects = []
        for eff in template_option.effects:
            # If targeting "player" and we have a target, use their ID
            target_id = None
            if eff.target == "player" and target_player:
                target_id = target_player.id

            effects.append(EventEffect(
                target=eff.target,
                target_id=target_id,
                attribute=eff.attribute,
                change=eff.change,
            ))

        return EventOption(
            id=template_option.id,
            label=template_option.label,
            description=template_option.description,
            effects=effects,
            risk_level=RiskLevel(template_option.risk_level),
            potential_outcomes=[
                template_option.success_text,
                template_option.failure_text,
            ] if template_option.failure_text else [],
        )

    def resolve_event(
        self,
        event_id: str,
        chosen_option_id: str,
        player_states: Dict[str, Dict[str, int]],
        team_state: Dict[str, int],
    ) -> Dict:
        """Resolve an event with the chosen option.

        Returns the effects to apply and narrative result.
        """
        # Parse template ID from event ID
        template_id = event_id.rsplit("-", 1)[0]
        template = self.loader.get_template(template_id)

        if not template:
            return {
                "player_effects": [],
                "team_effects": [],
                "narrative_result": "Event could not be resolved.",
            }

        # Find the chosen option
        chosen_option = None
        for opt in template.options:
            if opt.id == chosen_option_id:
                chosen_option = opt
                break

        if not chosen_option:
            return {
                "player_effects": [],
                "team_effects": [],
                "narrative_result": "Invalid option selected.",
            }

        # Determine success/failure based on success_chance
        is_success = random.random() < chosen_option.success_chance

        # Apply effects
        player_effects = []
        team_effects = []

        for effect in chosen_option.effects:
            if effect.target == "player" and effect.target_id:
                if effect.target_id in player_states:
                    old_val = player_states[effect.target_id].get(effect.attribute, 50)
                    # Reduce effect on failure
                    change = effect.change if is_success else effect.change // 2
                    new_val = max(0, min(100, old_val + change))
                    player_effects.append({
                        "player_id": effect.target_id,
                        "attribute": effect.attribute,
                        "old_value": old_val,
                        "new_value": new_val,
                    })
            elif effect.target == "team":
                old_val = team_state.get(effect.attribute, 50)
                change = effect.change if is_success else effect.change // 2
                new_val = max(0, min(100, old_val + change))
                team_effects.append({
                    "player_id": None,
                    "attribute": effect.attribute,
                    "old_value": old_val,
                    "new_value": new_val,
                })

        # Generate narrative
        if is_success and chosen_option.success_text:
            narrative = chosen_option.success_text
        elif not is_success and chosen_option.failure_text:
            narrative = chosen_option.failure_text
        else:
            narrative = f"You chose: {chosen_option.label}"

        return {
            "player_effects": player_effects,
            "team_effects": team_effects,
            "narrative_result": narrative,
            "is_success": is_success,
        }


# Singleton instance
_engine: Optional[EventEngine] = None


def get_event_engine() -> EventEngine:
    """Get the singleton event engine instance."""
    global _engine
    if _engine is None:
        _engine = EventEngine()
    return _engine
