"""Condition evaluator for context-aware event triggering.

Evaluates conditions from YAML templates against current game state.
Supports complex conditions with operators, player attributes, and game context.
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from app.schemas.events import GameContext, PlayerInfo


@dataclass
class EvaluationContext:
    """Context passed to condition evaluators."""
    game: GameContext
    players: List[PlayerInfo]
    player_map: Dict[str, PlayerInfo]  # id -> player
    recent_event_ids: List[str]

    @classmethod
    def from_request(cls, game: GameContext, players: List[PlayerInfo],
                     recent_event_ids: List[str]) -> "EvaluationContext":
        return cls(
            game=game,
            players=players,
            player_map={p.id: p for p in players},
            recent_event_ids=recent_event_ids
        )


class ConditionEvaluator:
    """Evaluates event conditions against game state."""

    # Operators for comparisons
    OPERATORS = {
        "eq": lambda a, b: a == b,
        "ne": lambda a, b: a != b,
        "lt": lambda a, b: a < b,
        "le": lambda a, b: a <= b,
        "gt": lambda a, b: a > b,
        "ge": lambda a, b: a >= b,
        "in": lambda a, b: a in b,
        "not_in": lambda a, b: a not in b,
        "contains": lambda a, b: b in a if isinstance(a, (list, str)) else False,
    }

    def evaluate(self, conditions: List[Dict], ctx: EvaluationContext,
                 target_player: Optional[PlayerInfo] = None) -> bool:
        """Evaluate all conditions - all must pass (AND logic)."""
        if not conditions:
            return True

        for condition in conditions:
            if not self._evaluate_single(condition, ctx, target_player):
                return False
        return True

    def _evaluate_single(self, condition: Dict, ctx: EvaluationContext,
                         target_player: Optional[PlayerInfo] = None) -> bool:
        """Evaluate a single condition."""
        cond_type = condition.get("type")

        # Dispatch to specific evaluator
        evaluator_map = {
            "game_context": self._eval_game_context,
            "player_attribute": self._eval_player_attribute,
            "team_state": self._eval_team_state,
            "results": self._eval_results,
            "streak": self._eval_streak,
            "not_recent_event": self._eval_not_recent_event,
            "has_players_with": self._eval_has_players_with,
            "player_count": self._eval_player_count,
            "phase": self._eval_phase,
            "any_of": self._eval_any_of,
            "none_of": self._eval_none_of,
        }

        evaluator = evaluator_map.get(cond_type)
        if evaluator:
            return evaluator(condition, ctx, target_player)

        # Unknown condition type - fail safe
        return False

    def _compare(self, actual: Any, operator: str, expected: Any) -> bool:
        """Compare values using operator."""
        op_func = self.OPERATORS.get(operator)
        if not op_func:
            return False
        try:
            return op_func(actual, expected)
        except (TypeError, ValueError):
            return False

    # ============================================
    # CONDITION EVALUATORS
    # ============================================

    def _eval_game_context(self, cond: Dict, ctx: EvaluationContext,
                           player: Optional[PlayerInfo]) -> bool:
        """Evaluate game context attributes (match_day, season, league_position, etc.)."""
        attr = cond.get("attribute")
        operator = cond.get("operator", "eq")
        value = cond.get("value")

        actual = getattr(ctx.game, attr, None)
        if actual is None:
            return False
        return self._compare(actual, operator, value)

    def _eval_player_attribute(self, cond: Dict, ctx: EvaluationContext,
                               player: Optional[PlayerInfo]) -> bool:
        """Evaluate player attribute (form, morale, etc.)."""
        if not player:
            return False

        attr = cond.get("attribute")
        operator = cond.get("operator", "eq")
        value = cond.get("value")

        actual = getattr(player, attr, None)
        if actual is None:
            return False
        return self._compare(actual, operator, value)

    def _eval_team_state(self, cond: Dict, ctx: EvaluationContext,
                         player: Optional[PlayerInfo]) -> bool:
        """Evaluate team state (team_morale, board_patience, press_heat)."""
        attr = cond.get("attribute")
        operator = cond.get("operator", "eq")
        value = cond.get("value")

        actual = getattr(ctx.game, attr, None)
        if actual is None:
            return False
        return self._compare(actual, operator, value)

    def _eval_results(self, cond: Dict, ctx: EvaluationContext,
                      player: Optional[PlayerInfo]) -> bool:
        """Evaluate recent results (e.g., 'last 3 were losses')."""
        count = cond.get("count", 1)
        result_type = cond.get("result")  # "win" or "loss"
        operator = cond.get("operator", "eq")  # how many match
        expected = cond.get("value", count)

        recent = ctx.game.recent_results[:count]
        actual = sum(1 for r in recent if r == result_type)

        return self._compare(actual, operator, expected)

    def _eval_streak(self, cond: Dict, ctx: EvaluationContext,
                     player: Optional[PlayerInfo]) -> bool:
        """Evaluate current streak (positive = wins, negative = losses)."""
        streak_type = cond.get("streak_type")  # "winning" or "losing"
        operator = cond.get("operator", "ge")
        value = cond.get("value")

        streak = ctx.game.current_streak

        if streak_type == "winning":
            actual = streak if streak > 0 else 0
        elif streak_type == "losing":
            actual = abs(streak) if streak < 0 else 0
        else:
            actual = abs(streak)

        return self._compare(actual, operator, value)

    def _eval_not_recent_event(self, cond: Dict, ctx: EvaluationContext,
                               player: Optional[PlayerInfo]) -> bool:
        """Check event hasn't fired recently (prevents spam)."""
        event_id = cond.get("event_id")
        # Could also support "days" but we use recent_event_ids list
        return event_id not in ctx.recent_event_ids

    def _eval_has_players_with(self, cond: Dict, ctx: EvaluationContext,
                               player: Optional[PlayerInfo]) -> bool:
        """Check if team has any players matching criteria."""
        attr = cond.get("attribute")
        operator = cond.get("operator", "lt")
        value = cond.get("value")
        min_count = cond.get("min_count", 1)

        matching = 0
        for p in ctx.players:
            actual = getattr(p, attr, None)
            if actual is not None and self._compare(actual, operator, value):
                matching += 1

        return matching >= min_count

    def _eval_player_count(self, cond: Dict, ctx: EvaluationContext,
                           player: Optional[PlayerInfo]) -> bool:
        """Evaluate count of players in specific lists (injured, unhappy, etc.)."""
        list_name = cond.get("list")  # injured_players, unhappy_players, out_of_form_players
        operator = cond.get("operator", "ge")
        value = cond.get("value")

        player_list = getattr(ctx.game, list_name, [])
        actual = len(player_list)

        return self._compare(actual, operator, value)

    def _eval_phase(self, cond: Dict, ctx: EvaluationContext,
                    player: Optional[PlayerInfo]) -> bool:
        """Check current game phase."""
        expected_phases = cond.get("phases", [])
        if isinstance(expected_phases, str):
            expected_phases = [expected_phases]
        return ctx.game.phase in expected_phases

    def _eval_any_of(self, cond: Dict, ctx: EvaluationContext,
                     player: Optional[PlayerInfo]) -> bool:
        """OR logic - any sub-condition must pass."""
        sub_conditions = cond.get("conditions", [])
        for sub_cond in sub_conditions:
            if self._evaluate_single(sub_cond, ctx, player):
                return True
        return False

    def _eval_none_of(self, cond: Dict, ctx: EvaluationContext,
                      player: Optional[PlayerInfo]) -> bool:
        """NAND logic - none of sub-conditions must pass."""
        sub_conditions = cond.get("conditions", [])
        for sub_cond in sub_conditions:
            if self._evaluate_single(sub_cond, ctx, player):
                return False
        return True

    # ============================================
    # PLAYER SELECTION
    # ============================================

    def find_matching_players(self, conditions: List[Dict],
                              ctx: EvaluationContext) -> List[PlayerInfo]:
        """Find all players that match the given conditions."""
        matching = []
        for player in ctx.players:
            if self.evaluate(conditions, ctx, player):
                matching.append(player)
        return matching
