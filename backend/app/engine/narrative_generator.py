"""
Narrative Generator for Cricket Commentary.

Generates contextual commentary for ball outcomes.
"""

import random
from typing import List

from app.schemas.common import DismissalType
from app.schemas.match import BallOutcome, RunsOutcome, WicketOutcome, ExtraOutcome
from app.schemas.player import PlayerStats


class NarrativeGenerator:
    """Generate cricket commentary narratives."""

    def __init__(self):
        self._load_templates()

    def _load_templates(self):
        """Load narrative templates."""
        self.dot_narratives = [
            "Dot ball. Good tight bowling from {bowler}.",
            "Defended back to the bowler.",
            "{batter} can't get it away.",
            "Good length, no run.",
            "Beaten outside off! Great delivery!",
            "Solid defense from {batter}.",
            "{bowler} keeps it tight.",
        ]

        self.single_narratives = [
            "Single taken.",
            "Pushed for one.",
            "Quick single.",
            "Rotates the strike.",
            "{batter} nudges it for one.",
        ]

        self.two_narratives = [
            "Two runs.",
            "Good running between the wickets!",
            "Pushed into the gap for two.",
            "They come back for the second.",
        ]

        self.three_narratives = [
            "Three runs! Excellent running!",
            "They come back for three!",
            "Worked into the gap, three taken.",
        ]

        self.four_narratives = [
            "FOUR! {batter} times that beautifully!",
            "Boundary! That raced away to the fence!",
            "FOUR! Cracking shot through the covers!",
            "Swept away for FOUR!",
            "Cut away and that's FOUR!",
            "Driven through mid-off for FOUR!",
            "Pulled away for a boundary!",
        ]

        self.six_narratives = [
            "SIX! {batter} launches it into the stands!",
            "HUGE SIX! That's gone miles!",
            "Maximum! {batter} clears the boundary with ease!",
            "SIX! What a strike from {batter}!",
            "Into the crowd! Massive hit!",
            "That's gone all the way! SIX!",
        ]

        self.boundary_saved_narratives = [
            "Great fielding! Saves the boundary, they run {runs}.",
            "Athletic stop at the boundary! {runs} runs only.",
            "Brilliant diving save! They get {runs}.",
        ]

        self.dismissal_narratives = {
            DismissalType.BOWLED: [
                "Clean bowled! {bowler} beats {batter} all ends up!",
                "TIMBER! {bowler} crashes through the defense!",
                "The stumps are rattled! {batter} has to go!",
                "Bowled him! Right through the gate!",
            ],
            DismissalType.CAUGHT: [
                "Caught! {batter} finds the fielder!",
                "In the air and taken! {bowler} gets the breakthrough!",
                "That's a good catch! {batter} is gone!",
                "Edged and caught! {bowler} strikes!",
                "Caught at {position}! {batter} departs!",
            ],
            DismissalType.LBW: [
                "LBW! That looked plumb! {batter} departs!",
                "Given out leg before! {bowler} strikes!",
                "Trapped in front! The umpire raises the finger!",
                "Huge appeal and given! LBW!",
            ],
            DismissalType.RUNOUT: [
                "Run out! Brilliant work in the field!",
                "Direct hit! {batter} is short of the crease!",
                "Terrible mix-up and {batter} has to go!",
                "Run out! Great throw from the deep!",
            ],
            DismissalType.STUMPED: [
                "Stumped! Lightning quick work behind the stumps!",
                "{batter} beaten in the flight and stumped!",
                "Down the track and stumped! Great keeping!",
            ],
            DismissalType.HITWICKET: [
                "Hit wicket! {batter} has knocked the bails off!",
                "Oh no! {batter} has hit his own stumps!",
                "Unfortunate dismissal - hit wicket!",
            ],
        }

        self.wide_narratives = [
            "Wide ball from {bowler}.",
            "Called wide, extra run.",
            "Too wide outside off.",
        ]

        self.noball_narratives = [
            "No ball! Free hit coming up!",
            "Overstepping! No ball!",
            "{bowler} oversteps, free hit next ball.",
        ]

        self.fielding_positions = [
            "slip", "mid-off", "mid-on", "point", "cover",
            "square leg", "fine leg", "third man", "deep midwicket"
        ]

    def generate(
        self,
        outcome: BallOutcome,
        batter: PlayerStats,
        bowler: PlayerStats,
    ) -> str:
        """Generate narrative for a ball outcome."""
        batter_name = batter.short_name
        bowler_name = bowler.short_name

        if isinstance(outcome, WicketOutcome):
            templates = self.dismissal_narratives.get(
                outcome.dismissal_type,
                self.dismissal_narratives[DismissalType.CAUGHT]
            )
            template = random.choice(templates)
            return template.format(
                batter=batter_name,
                bowler=bowler_name,
                position=random.choice(self.fielding_positions),
            )

        if isinstance(outcome, ExtraOutcome):
            if outcome.extra_type == "wide":
                return random.choice(self.wide_narratives).format(bowler=bowler_name)
            elif outcome.extra_type == "noball":
                return random.choice(self.noball_narratives).format(bowler=bowler_name)
            return f"{outcome.runs} {outcome.extra_type}s"

        if isinstance(outcome, RunsOutcome):
            if outcome.boundary_saved:
                template = random.choice(self.boundary_saved_narratives)
                return template.format(runs=outcome.runs)

            runs = outcome.runs
            if runs == 0:
                templates = self.dot_narratives
            elif runs == 1:
                templates = self.single_narratives
            elif runs == 2:
                templates = self.two_narratives
            elif runs == 3:
                templates = self.three_narratives
            elif runs == 4:
                templates = self.four_narratives
            else:  # 6
                templates = self.six_narratives

            template = random.choice(templates)
            return template.format(batter=batter_name, bowler=bowler_name)

        return "Ball bowled."
