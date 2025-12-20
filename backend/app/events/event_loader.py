"""Event template loader for YAML-based event definitions.

Loads and validates event templates from YAML files, supporting
hot-reload in development and caching in production.
"""

import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from functools import lru_cache

from app.config import get_settings


@dataclass
class EventEffect:
    """Effect of choosing an event option."""
    target: str  # "player", "team", "manager"
    attribute: str  # e.g., "morale", "form", "press_heat"
    change: int  # Delta value
    target_id: Optional[str] = None  # For player-specific effects


@dataclass
class EventOption:
    """An option for responding to an event."""
    id: str
    label: str
    description: str
    effects: List[EventEffect]
    risk_level: str = "moderate"  # "safe", "moderate", "risky"
    success_text: str = ""
    failure_text: str = ""
    success_chance: float = 1.0  # Probability of positive outcome


@dataclass
class EventTemplate:
    """A template for generating events."""
    id: str
    category: str  # "player", "media", "board", "season"
    title: str
    description_template: str  # Supports {player.name}, {team.name}, etc.

    # Conditions for when this event can trigger
    conditions: List[Dict[str, Any]]

    # Options available to the player
    options: List[EventOption]

    # Weighting for random selection
    weight: int = 10

    # Optional player targeting
    target_player_conditions: List[Dict[str, Any]] = field(default_factory=list)

    # Prevents repeat triggering
    cooldown_days: int = 7

    # Tags for filtering
    tags: List[str] = field(default_factory=list)

    # Urgency level
    urgency: str = "end-of-day"  # "immediate", "end-of-day", "this-week"


class EventLoader:
    """Loads and manages event templates from YAML files."""

    def __init__(self, templates_dir: Optional[Path] = None):
        settings = get_settings()
        self.templates_dir = templates_dir or settings.event_templates_dir
        self._templates: Dict[str, EventTemplate] = {}
        self._templates_by_category: Dict[str, List[EventTemplate]] = {
            "player": [],
            "media": [],
            "board": [],
            "season": [],
        }
        self._loaded = False

    def load_all(self, force_reload: bool = False) -> None:
        """Load all event templates from YAML files."""
        if self._loaded and not force_reload:
            return

        self._templates.clear()
        for category in self._templates_by_category:
            self._templates_by_category[category].clear()

        # Load each category file
        template_files = [
            "player_events.yaml",
            "media_events.yaml",
            "board_events.yaml",
            "season_events.yaml",
        ]

        for filename in template_files:
            filepath = self.templates_dir / filename
            if filepath.exists():
                self._load_file(filepath)

        self._loaded = True

    def _load_file(self, filepath: Path) -> None:
        """Load templates from a single YAML file."""
        with open(filepath, "r") as f:
            data = yaml.safe_load(f)

        if not data or "templates" not in data:
            return

        for template_data in data["templates"]:
            template = self._parse_template(template_data)
            self._templates[template.id] = template
            self._templates_by_category[template.category].append(template)

    def _parse_template(self, data: Dict) -> EventTemplate:
        """Parse a template dictionary into an EventTemplate."""
        options = []
        for opt_data in data.get("options", []):
            effects = [
                EventEffect(
                    target=eff.get("target", "player"),
                    attribute=eff.get("attribute"),
                    change=eff.get("change", 0),
                    target_id=eff.get("target_id"),
                )
                for eff in opt_data.get("effects", [])
            ]
            options.append(EventOption(
                id=opt_data["id"],
                label=opt_data["label"],
                description=opt_data.get("description", ""),
                effects=effects,
                risk_level=opt_data.get("risk_level", "moderate"),
                success_text=opt_data.get("success_text", ""),
                failure_text=opt_data.get("failure_text", ""),
                success_chance=opt_data.get("success_chance", 1.0),
            ))

        return EventTemplate(
            id=data["id"],
            category=data.get("category", "player"),
            title=data["title"],
            description_template=data.get("description_template", data.get("description", "")),
            conditions=data.get("conditions", []),
            options=options,
            weight=data.get("weight", 10),
            target_player_conditions=data.get("target_player_conditions", []),
            cooldown_days=data.get("cooldown_days", 7),
            tags=data.get("tags", []),
            urgency=data.get("urgency", "end-of-day"),
        )

    def get_template(self, template_id: str) -> Optional[EventTemplate]:
        """Get a specific template by ID."""
        if not self._loaded:
            self.load_all()
        return self._templates.get(template_id)

    def get_templates_by_category(self, category: str) -> List[EventTemplate]:
        """Get all templates for a category."""
        if not self._loaded:
            self.load_all()
        return self._templates_by_category.get(category, [])

    def get_all_templates(self) -> List[EventTemplate]:
        """Get all loaded templates."""
        if not self._loaded:
            self.load_all()
        return list(self._templates.values())

    def get_template_count(self) -> Dict[str, int]:
        """Get count of templates per category."""
        if not self._loaded:
            self.load_all()
        return {
            category: len(templates)
            for category, templates in self._templates_by_category.items()
        }


# Singleton instance
_loader: Optional[EventLoader] = None


def get_event_loader() -> EventLoader:
    """Get the singleton event loader instance."""
    global _loader
    if _loader is None:
        _loader = EventLoader()
        _loader.load_all()
    return _loader
