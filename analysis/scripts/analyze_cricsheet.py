"""
Cricsheet Data Analysis Script
Analyzes ball-by-ball data across multiple cricket formats and tournaments.

Supported tournaments:
- Test matches (628 matches)
- One-day internationals (2,033 matches)
- T20 internationals (1,432 matches)
- IPL (816 matches)
- Big Bash League (365 matches)
- Caribbean Premier League (244 matches)
- T20 Blast (815 matches)
- Pakistan Super League (146 matches)
- Women's Big Bash League (264 matches)
- And more...

Usage:
    python analyze_cricsheet.py --data-dir /path/to/cricsheet --output-dir ./output

Cricsheet data format: JSON files with nested ball-by-ball structure
"""

import json
import os
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
from datetime import datetime
import csv
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

# Try to import yaml
try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False
    print("Warning: PyYAML not available. Install with: pip install pyyaml")

# Try to import pandas/numpy, fall back to pure Python if not available
try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("Warning: pandas/numpy not available. Using pure Python (slower).")


@dataclass
class Delivery:
    """Represents a single delivery in a cricket match."""
    match_id: str
    tournament: str
    format: str  # test, odi, t20
    season: str
    date: str
    venue: str
    innings: int
    over: int
    ball: int
    batting_team: str
    bowling_team: str
    batter: str
    bowler: str
    non_striker: str
    runs_batter: int
    runs_extras: int
    runs_total: int
    extra_type: Optional[str]  # wide, noball, bye, legbye, penalty
    wicket_kind: Optional[str]  # bowled, caught, lbw, run out, stumped, etc.
    wicket_player: Optional[str]
    fielders: List[str] = field(default_factory=list)
    is_valid_ball: bool = True

    # Computed fields (filled later)
    batter_runs_so_far: int = 0
    batter_balls_so_far: int = 0
    team_runs_so_far: int = 0
    team_wickets_so_far: int = 0
    team_balls_so_far: int = 0
    partnership_runs: int = 0


@dataclass
class MatchInfo:
    """Match metadata."""
    match_id: str
    tournament: str
    format: str
    season: str
    dates: List[str]
    venue: str
    teams: List[str]
    toss_winner: Optional[str]
    toss_decision: Optional[str]
    outcome: Dict[str, Any]
    player_of_match: Optional[str]
    officials: Dict[str, Any]


@dataclass
class PlayerStats:
    """Aggregated player statistics."""
    player_name: str
    matches: int = 0

    # Batting
    innings_batted: int = 0
    runs: int = 0
    balls_faced: int = 0
    fours: int = 0
    sixes: int = 0
    not_outs: int = 0
    highest_score: int = 0

    # Bowling
    innings_bowled: int = 0
    overs_bowled: float = 0
    runs_conceded: int = 0
    wickets: int = 0
    maidens: int = 0
    best_bowling: Tuple[int, int] = (0, 999)  # wickets, runs

    # Fielding
    catches: int = 0
    stumpings: int = 0
    run_outs: int = 0

    @property
    def batting_average(self) -> float:
        dismissals = self.innings_batted - self.not_outs
        return self.runs / max(1, dismissals)

    @property
    def strike_rate(self) -> float:
        return (self.runs / max(1, self.balls_faced)) * 100

    @property
    def bowling_average(self) -> float:
        return self.runs_conceded / max(1, self.wickets)

    @property
    def economy_rate(self) -> float:
        return self.runs_conceded / max(0.1, self.overs_bowled)


def _parse_single_file(args: Tuple[Path, str, dict, dict]) -> Tuple[Optional[dict], List[dict]]:
    """
    Standalone function to parse a single match file.
    Must be at module level for multiprocessing to pickle it.
    Returns (match_info_dict, list_of_delivery_dicts) or (None, []) on error.
    """
    filepath, tournament_name, format_map, name_map = args

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            if filepath.suffix in ['.yaml', '.yml']:
                if not YAML_AVAILABLE:
                    return None, []
                data = yaml.safe_load(f)
            else:
                data = json.load(f)

        # Extract match info
        info = data.get('info', {})
        match_id = filepath.stem
        format_type = format_map.get(tournament_name, 't20')

        # Get season (year) - handle both string and datetime.date objects
        raw_dates = info.get('dates', [])
        dates = []
        for d in raw_dates:
            if hasattr(d, 'isoformat'):
                dates.append(d.isoformat())
            else:
                dates.append(str(d))
        season = dates[0][:4] if dates else 'unknown'

        teams = info.get('teams', [])

        match_info_dict = {
            'match_id': match_id,
            'tournament': tournament_name,
            'format': format_type,
            'season': season,
            'dates': dates,
            'venue': info.get('venue', 'Unknown'),
            'teams': teams,
            'toss_winner': info.get('toss', {}).get('winner'),
            'toss_decision': info.get('toss', {}).get('decision'),
            'outcome': info.get('outcome', {}),
            'player_of_match': info.get('player_of_match', [None])[0] if info.get('player_of_match') else None,
            'officials': info.get('officials', {})
        }

        # Parse deliveries
        deliveries = []
        innings_data = data.get('innings', [])

        for innings_num, innings_item in enumerate(innings_data, 1):
            if 'team' in innings_item:
                innings = innings_item
            else:
                innings = list(innings_item.values())[0]

            team = innings.get('team', 'Unknown')
            bowling_team = [t for t in teams if t != team]
            bowling_team = bowling_team[0] if bowling_team else 'Unknown'

            # Track state
            team_runs = 0
            team_wickets = 0
            team_balls = 0
            partnership_runs = 0

            def process_delivery(delivery_data, over_num, ball_num):
                nonlocal team_runs, team_wickets, team_balls, partnership_runs

                runs = delivery_data.get('runs', {})
                extras = delivery_data.get('extras', {})
                wickets = delivery_data.get('wickets', delivery_data.get('wicket', None))

                if isinstance(wickets, dict):
                    wickets = [wickets]
                elif wickets is None:
                    wickets = []

                extra_type = None
                for etype in ['wides', 'noballs', 'byes', 'legbyes', 'penalty']:
                    if etype in extras:
                        extra_type = etype
                        break

                is_valid = extra_type not in ['wides', 'noballs']
                batter_name = delivery_data.get('batter', delivery_data.get('batsman', 'Unknown'))
                runs_batter = runs.get('batter', runs.get('batsman', 0))

                delivery_dict = {
                    'match_id': match_id,
                    'tournament': tournament_name,
                    'format': format_type,
                    'season': season,
                    'date': dates[0] if dates else 'unknown',
                    'venue': match_info_dict['venue'],
                    'innings': innings_num,
                    'over': over_num,
                    'ball': ball_num,
                    'batting_team': team,
                    'bowling_team': bowling_team,
                    'batter': batter_name,
                    'bowler': delivery_data.get('bowler', 'Unknown'),
                    'non_striker': delivery_data.get('non_striker', 'Unknown'),
                    'runs_batter': runs_batter,
                    'runs_extras': runs.get('extras', 0),
                    'runs_total': runs.get('total', 0),
                    'extra_type': extra_type,
                    'wicket_kind': wickets[0].get('kind') if wickets else None,
                    'wicket_player': wickets[0].get('player_out') if wickets else None,
                    'is_valid_ball': is_valid,
                    'team_runs_so_far': team_runs,
                    'team_wickets_so_far': team_wickets,
                    'partnership_runs': partnership_runs
                }

                # Update state
                team_runs += runs.get('total', 0)
                partnership_runs += runs.get('total', 0)
                if is_valid:
                    team_balls += 1
                if wickets:
                    team_wickets += len(wickets)
                    partnership_runs = 0

                return delivery_dict

            if 'overs' in innings:
                for over_data in innings.get('overs', []):
                    over_num = over_data.get('over', 0)
                    for ball_num, delivery_data in enumerate(over_data.get('deliveries', []), 1):
                        deliveries.append(process_delivery(delivery_data, over_num + 1, ball_num))
            else:
                for delivery_item in innings.get('deliveries', []):
                    for ball_key, delivery_data in delivery_item.items():
                        if isinstance(ball_key, (int, float)):
                            over_num = int(ball_key) + 1
                            ball_in_over = int(round((ball_key % 1) * 10))
                            if ball_in_over == 0:
                                ball_in_over = int(str(ball_key).split('.')[-1]) if '.' in str(ball_key) else 1
                        else:
                            parts = str(ball_key).split('.')
                            over_num = int(parts[0]) + 1
                            ball_in_over = int(parts[1]) if len(parts) > 1 else 1
                        deliveries.append(process_delivery(delivery_data, over_num, ball_in_over))

        return match_info_dict, deliveries

    except Exception as e:
        return None, []


class CricsheetLoader:
    """Loads and parses cricsheet JSON data."""

    # Tournament to format mapping
    TOURNAMENT_FORMATS = {
        # Standard cricsheet folder names
        'tests': 'test',
        'odis': 'odi',
        'ipl': 't20',
        'bbl': 't20',
        'cpl': 't20',
        'psl': 't20',
        # Alternate folder names from Kaggle dataset
        'it20s': 't20',      # International T20s
        't20s': 't20',       # All T20s
        'mdms': 'test',      # Multi-day matches
        'ntb': 't20',        # T20 Blast / Non-official T20s
        'odms': 'odi',       # OD Matches
        'wbb': 't20',        # Women's Big Bash
        'wbbl': 't20',
        # Other tournaments
        't20_blast': 't20',
        'the_hundred': 't20',
        'sa20': 't20',
        'ilt20': 't20',
        'msl': 't20',
        'all': 't20',        # Mixed - default to T20
    }

    # Tournament display names
    TOURNAMENT_NAMES = {
        'tests': 'Test Matches',
        'odis': 'One-Day Internationals',
        'ipl': 'Indian Premier League',
        'bbl': 'Big Bash League',
        'cpl': 'Caribbean Premier League',
        'psl': 'Pakistan Super League',
        # Kaggle dataset folder names
        'it20s': 'T20 Internationals',
        't20s': 'T20 Matches',
        'mdms': 'Multi-Day Matches',
        'ntb': 'T20 Blast',
        'odms': 'One-Day Matches',
        'wbb': "Women's Big Bash League",
        'wbbl': "Women's Big Bash League",
        # Other
        't20_blast': 'T20 Blast',
        'the_hundred': 'The Hundred',
        'sa20': 'SA20',
        'ilt20': 'ILT20',
        'msl': 'Major League Cricket',
        'all': 'All Matches',
    }

    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.matches: List[MatchInfo] = []
        self.deliveries: List[Delivery] = []
        self.player_stats: Dict[str, Dict[str, PlayerStats]] = defaultdict(
            lambda: defaultdict(PlayerStats)
        )  # player -> tournament -> stats

    def discover_tournaments(self) -> Dict[str, int]:
        """Find all tournament folders and count matches."""
        tournaments = {}

        for item in self.data_dir.iterdir():
            if item.is_dir():
                # Check for both JSON and YAML files
                json_files = list(item.glob("*.json"))
                yaml_files = list(item.glob("*.yaml")) + list(item.glob("*.yml"))
                total_files = len(json_files) + len(yaml_files)
                if total_files > 0:
                    tournaments[item.name] = total_files

        return dict(sorted(tournaments.items(), key=lambda x: -x[1]))

    def load_tournament(self, tournament_name: str, limit: Optional[int] = None,
                        parallel: bool = False, workers: Optional[int] = None) -> int:
        """Load all matches from a tournament folder."""
        tournament_dir = self.data_dir / tournament_name

        if not tournament_dir.exists():
            print(f"Tournament folder not found: {tournament_dir}")
            return 0

        # Find both JSON and YAML files
        json_files = list(tournament_dir.glob("*.json"))
        yaml_files = list(tournament_dir.glob("*.yaml")) + list(tournament_dir.glob("*.yml"))
        all_files = sorted(json_files + yaml_files)

        if limit:
            all_files = all_files[:limit]

        if parallel and len(all_files) > 10:
            return self._load_parallel(all_files, tournament_name, workers)
        else:
            return self._load_sequential(all_files, tournament_name)

    def _load_sequential(self, files: List[Path], tournament_name: str) -> int:
        """Load files sequentially (original method)."""
        loaded = 0
        for match_file in files:
            try:
                match_info, deliveries = self._parse_match_file(match_file, tournament_name)
                if match_info and deliveries:
                    self.matches.append(match_info)
                    self.deliveries.extend(deliveries)
                    loaded += 1
            except Exception as e:
                if loaded < 5:
                    print(f"Error parsing {match_file.name}: {e}")
        return loaded

    def _load_parallel(self, files: List[Path], tournament_name: str,
                       workers: Optional[int] = None) -> int:
        """Load files in parallel using ProcessPoolExecutor."""
        if workers is None:
            workers = min(multiprocessing.cpu_count(), 8)

        # Prepare arguments for parallel processing
        args_list = [
            (f, tournament_name, self.TOURNAMENT_FORMATS, self.TOURNAMENT_NAMES)
            for f in files
        ]

        loaded = 0
        total = len(files)

        with ProcessPoolExecutor(max_workers=workers) as executor:
            # Submit all tasks
            futures = {executor.submit(_parse_single_file, args): args[0] for args in args_list}

            # Process results as they complete
            for i, future in enumerate(as_completed(futures)):
                try:
                    match_info_dict, delivery_dicts = future.result()
                    if match_info_dict and delivery_dicts:
                        # Convert dicts back to dataclasses
                        match_info = MatchInfo(
                            match_id=match_info_dict['match_id'],
                            tournament=match_info_dict['tournament'],
                            format=match_info_dict['format'],
                            season=match_info_dict['season'],
                            dates=match_info_dict['dates'],
                            venue=match_info_dict['venue'],
                            teams=match_info_dict['teams'],
                            toss_winner=match_info_dict['toss_winner'],
                            toss_decision=match_info_dict['toss_decision'],
                            outcome=match_info_dict['outcome'],
                            player_of_match=match_info_dict['player_of_match'],
                            officials=match_info_dict['officials']
                        )
                        self.matches.append(match_info)

                        for d in delivery_dicts:
                            delivery = Delivery(
                                match_id=d['match_id'],
                                tournament=d['tournament'],
                                format=d['format'],
                                season=d['season'],
                                date=d['date'],
                                venue=d['venue'],
                                innings=d['innings'],
                                over=d['over'],
                                ball=d['ball'],
                                batting_team=d['batting_team'],
                                bowling_team=d['bowling_team'],
                                batter=d['batter'],
                                bowler=d['bowler'],
                                non_striker=d['non_striker'],
                                runs_batter=d['runs_batter'],
                                runs_extras=d['runs_extras'],
                                runs_total=d['runs_total'],
                                extra_type=d['extra_type'],
                                wicket_kind=d['wicket_kind'],
                                wicket_player=d['wicket_player'],
                                is_valid_ball=d['is_valid_ball'],
                                team_runs_so_far=d['team_runs_so_far'],
                                team_wickets_so_far=d['team_wickets_so_far'],
                                partnership_runs=d['partnership_runs']
                            )
                            self.deliveries.append(delivery)
                        loaded += 1

                    # Progress indicator
                    if (i + 1) % 100 == 0 or (i + 1) == total:
                        print(f"    Processed {i + 1}/{total} files...", end='\r')

                except Exception as e:
                    pass  # Silently skip errors in parallel mode

        print()  # New line after progress
        return loaded

    def _parse_match_file(self, filepath: Path, tournament_name: str) -> Tuple[Optional[MatchInfo], List[Delivery]]:
        """Parse a single cricsheet JSON or YAML file."""
        with open(filepath, 'r', encoding='utf-8') as f:
            if filepath.suffix in ['.yaml', '.yml']:
                if not YAML_AVAILABLE:
                    raise ImportError("PyYAML required for YAML files")
                data = yaml.safe_load(f)
            else:
                data = json.load(f)

        # Extract match info
        info = data.get('info', {})

        match_id = filepath.stem
        format_type = self.TOURNAMENT_FORMATS.get(tournament_name, 't20')

        # Get season (year) - handle both string and datetime.date objects
        raw_dates = info.get('dates', [])
        dates = []
        for d in raw_dates:
            if hasattr(d, 'isoformat'):  # datetime.date object
                dates.append(d.isoformat())
            else:
                dates.append(str(d))
        season = dates[0][:4] if dates else 'unknown'

        match_info = MatchInfo(
            match_id=match_id,
            tournament=tournament_name,
            format=format_type,
            season=season,
            dates=dates,
            venue=info.get('venue', 'Unknown'),
            teams=info.get('teams', []),
            toss_winner=info.get('toss', {}).get('winner'),
            toss_decision=info.get('toss', {}).get('decision'),
            outcome=info.get('outcome', {}),
            player_of_match=info.get('player_of_match', [None])[0] if info.get('player_of_match') else None,
            officials=info.get('officials', {})
        )

        # Parse innings and deliveries
        deliveries = []
        innings_data = data.get('innings', [])

        for innings_num, innings_item in enumerate(innings_data, 1):
            # Handle both old and new cricsheet formats
            # Old format: {'1st innings': {'team': ..., 'deliveries': [...]}}
            # New format: {'team': ..., 'overs': [...]}
            if 'team' in innings_item:
                # New format
                innings = innings_item
            else:
                # Old format - get the first (only) value
                innings = list(innings_item.values())[0]

            team = innings.get('team', 'Unknown')
            bowling_team = [t for t in match_info.teams if t != team]
            bowling_team = bowling_team[0] if bowling_team else 'Unknown'

            # Track state for this innings
            team_runs = 0
            team_wickets = 0
            team_balls = 0
            batter_stats = defaultdict(lambda: {'runs': 0, 'balls': 0})
            partnership_runs = 0

            # Handle both old and new delivery formats
            if 'overs' in innings:
                # New format: overs -> deliveries
                for over_data in innings.get('overs', []):
                    over_num = over_data.get('over', 0)
                    for ball_num, delivery_data in enumerate(over_data.get('deliveries', []), 1):
                        delivery = self._parse_delivery(
                            delivery_data, match_id, tournament_name, format_type,
                            season, dates, match_info, innings_num, over_num + 1, ball_num,
                            team, bowling_team, batter_stats, team_runs, team_wickets,
                            team_balls, partnership_runs
                        )
                        if delivery:
                            deliveries.append(delivery)
                            team_runs, team_wickets, team_balls, partnership_runs = self._update_state(
                                delivery_data, team_runs, team_wickets, team_balls,
                                partnership_runs, batter_stats, delivery.batter
                            )
            else:
                # Old format: flat deliveries list with ball number as key
                for delivery_item in innings.get('deliveries', []):
                    # Each item is {ball_num: delivery_data}
                    for ball_key, delivery_data in delivery_item.items():
                        # Parse ball number (e.g., "0.1" -> over=1, ball=1)
                        if isinstance(ball_key, (int, float)):
                            over_num = int(ball_key) + 1
                            ball_in_over = int(round((ball_key % 1) * 10))
                            if ball_in_over == 0:
                                ball_in_over = int(str(ball_key).split('.')[-1]) if '.' in str(ball_key) else 1
                        else:
                            parts = str(ball_key).split('.')
                            over_num = int(parts[0]) + 1
                            ball_in_over = int(parts[1]) if len(parts) > 1 else 1

                        delivery = self._parse_delivery(
                            delivery_data, match_id, tournament_name, format_type,
                            season, dates, match_info, innings_num, over_num, ball_in_over,
                            team, bowling_team, batter_stats, team_runs, team_wickets,
                            team_balls, partnership_runs
                        )
                        if delivery:
                            deliveries.append(delivery)
                            team_runs, team_wickets, team_balls, partnership_runs = self._update_state(
                                delivery_data, team_runs, team_wickets, team_balls,
                                partnership_runs, batter_stats, delivery.batter
                            )

        return match_info, deliveries

    def _parse_delivery(self, delivery_data: dict, match_id: str, tournament_name: str,
                        format_type: str, season: str, dates: List[str], match_info: MatchInfo,
                        innings_num: int, over_num: int, ball_num: int,
                        team: str, bowling_team: str, batter_stats: dict,
                        team_runs: int, team_wickets: int, team_balls: int,
                        partnership_runs: int) -> Optional[Delivery]:
        """Parse a single delivery from cricsheet data."""
        runs = delivery_data.get('runs', {})
        extras = delivery_data.get('extras', {})
        wickets = delivery_data.get('wickets', delivery_data.get('wicket', None))

        # Handle wicket as dict (old format) vs list (new format)
        if isinstance(wickets, dict):
            wickets = [wickets]
        elif wickets is None:
            wickets = []

        # Determine extra type
        extra_type = None
        for etype in ['wides', 'noballs', 'byes', 'legbyes', 'penalty']:
            if etype in extras:
                extra_type = etype
                break

        # Is this a valid ball?
        is_valid = extra_type not in ['wides', 'noballs']

        # Handle both 'batter' and 'batsman' keys
        batter_name = delivery_data.get('batter', delivery_data.get('batsman', 'Unknown'))

        # Handle runs with both 'batter' and 'batsman' keys
        runs_batter = runs.get('batter', runs.get('batsman', 0))

        return Delivery(
            match_id=match_id,
            tournament=tournament_name,
            format=format_type,
            season=season,
            date=dates[0] if dates else 'unknown',
            venue=match_info.venue,
            innings=innings_num,
            over=over_num,
            ball=ball_num,
            batting_team=team,
            bowling_team=bowling_team,
            batter=batter_name,
            bowler=delivery_data.get('bowler', 'Unknown'),
            non_striker=delivery_data.get('non_striker', 'Unknown'),
            runs_batter=runs_batter,
            runs_extras=runs.get('extras', 0),
            runs_total=runs.get('total', 0),
            extra_type=extra_type,
            wicket_kind=wickets[0].get('kind') if wickets else None,
            wicket_player=wickets[0].get('player_out') if wickets else None,
            fielders=[f.get('name', f) if isinstance(f, dict) else str(f)
                      for w in wickets for f in w.get('fielders', [])],
            is_valid_ball=is_valid,
            batter_runs_so_far=batter_stats[batter_name]['runs'],
            batter_balls_so_far=batter_stats[batter_name]['balls'],
            team_runs_so_far=team_runs,
            team_wickets_so_far=team_wickets,
            team_balls_so_far=team_balls,
            partnership_runs=partnership_runs
        )

    def _update_state(self, delivery_data: dict, team_runs: int, team_wickets: int,
                      team_balls: int, partnership_runs: int, batter_stats: dict,
                      batter_name: str) -> Tuple[int, int, int, int]:
        """Update match state after a delivery."""
        runs = delivery_data.get('runs', {})
        extras = delivery_data.get('extras', {})
        wickets = delivery_data.get('wickets', delivery_data.get('wicket', None))

        if isinstance(wickets, dict):
            wickets = [wickets]
        elif wickets is None:
            wickets = []

        extra_type = None
        for etype in ['wides', 'noballs']:
            if etype in extras:
                extra_type = etype
                break

        is_valid = extra_type is None

        team_runs += runs.get('total', 0)
        partnership_runs += runs.get('total', 0)

        if is_valid:
            team_balls += 1
            batter_stats[batter_name]['balls'] += 1

        runs_batter = runs.get('batter', runs.get('batsman', 0))
        batter_stats[batter_name]['runs'] += runs_batter

        if wickets:
            team_wickets += len(wickets)
            partnership_runs = 0  # Reset partnership

        return team_runs, team_wickets, team_balls, partnership_runs


class TournamentAnalyzer:
    """Analyzes cricket data by tournament and format."""

    def __init__(self, deliveries: List[Delivery]):
        self.deliveries = deliveries

        if PANDAS_AVAILABLE:
            self._build_dataframe()

    def _build_dataframe(self):
        """Convert deliveries to pandas DataFrame."""
        records = []
        for d in self.deliveries:
            records.append({
                'match_id': d.match_id,
                'tournament': d.tournament,
                'format': d.format,
                'season': d.season,
                'date': d.date,
                'venue': d.venue,
                'innings': d.innings,
                'over': d.over,
                'ball': d.ball,
                'batting_team': d.batting_team,
                'bowling_team': d.bowling_team,
                'batter': d.batter,
                'bowler': d.bowler,
                'runs_batter': d.runs_batter,
                'runs_extras': d.runs_extras,
                'runs_total': d.runs_total,
                'extra_type': d.extra_type,
                'wicket_kind': d.wicket_kind,
                'wicket_player': d.wicket_player,
                'is_valid_ball': d.is_valid_ball,
                'batter_balls_so_far': d.batter_balls_so_far,
                'team_runs_so_far': d.team_runs_so_far,
                'team_wickets_so_far': d.team_wickets_so_far,
                'partnership_runs': d.partnership_runs,
            })
        self.df = pd.DataFrame(records)

    def get_summary(self) -> Dict[str, Any]:
        """Get summary statistics across all loaded data."""
        summary = {
            'total_deliveries': len(self.deliveries),
            'total_matches': len(set(d.match_id for d in self.deliveries)),
            'by_tournament': defaultdict(lambda: {'matches': 0, 'deliveries': 0}),
            'by_format': defaultdict(lambda: {'matches': 0, 'deliveries': 0}),
            'date_range': {'earliest': None, 'latest': None},
        }

        matches_by_tournament = defaultdict(set)
        matches_by_format = defaultdict(set)

        for d in self.deliveries:
            matches_by_tournament[d.tournament].add(d.match_id)
            matches_by_format[d.format].add(d.match_id)
            summary['by_tournament'][d.tournament]['deliveries'] += 1
            summary['by_format'][d.format]['deliveries'] += 1

            if d.date != 'unknown':
                if not summary['date_range']['earliest'] or d.date < summary['date_range']['earliest']:
                    summary['date_range']['earliest'] = d.date
                if not summary['date_range']['latest'] or d.date > summary['date_range']['latest']:
                    summary['date_range']['latest'] = d.date

        for tournament, matches in matches_by_tournament.items():
            summary['by_tournament'][tournament]['matches'] = len(matches)

        for format_type, matches in matches_by_format.items():
            summary['by_format'][format_type]['matches'] = len(matches)

        return summary

    def compute_base_outcomes(self, tournament: Optional[str] = None,
                               format_type: Optional[str] = None) -> Dict[str, float]:
        """Compute base outcome distribution."""
        if PANDAS_AVAILABLE:
            return self._compute_base_outcomes_pandas(tournament, format_type)
        return self._compute_base_outcomes_python(tournament, format_type)

    def _compute_base_outcomes_pandas(self, tournament: Optional[str] = None,
                                       format_type: Optional[str] = None) -> Dict[str, float]:
        """Pandas version of outcome computation."""
        df = self.df.copy()

        if tournament:
            df = df[df['tournament'] == tournament]
        if format_type:
            df = df[df['format'] == format_type]

        valid = df[df['is_valid_ball'] == True]
        total = len(valid)

        if total == 0:
            return {}

        wickets = valid['wicket_kind'].notna().sum()
        non_wicket = valid[valid['wicket_kind'].isna()]

        outcomes = {
            'dot': (non_wicket['runs_batter'] == 0).sum() / total,
            'single': (non_wicket['runs_batter'] == 1).sum() / total,
            'two': (non_wicket['runs_batter'] == 2).sum() / total,
            'three': (non_wicket['runs_batter'] == 3).sum() / total,
            'four': (non_wicket['runs_batter'] == 4).sum() / total,
            'six': (non_wicket['runs_batter'] == 6).sum() / total,
            'wicket': wickets / total,
        }

        return outcomes

    def _compute_base_outcomes_python(self, tournament: Optional[str] = None,
                                       format_type: Optional[str] = None) -> Dict[str, float]:
        """Pure Python version of outcome computation."""
        filtered = [d for d in self.deliveries
                    if d.is_valid_ball
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        total = len(filtered)
        if total == 0:
            return {}

        counts = {
            'dot': 0, 'single': 0, 'two': 0, 'three': 0,
            'four': 0, 'six': 0, 'wicket': 0
        }

        for d in filtered:
            if d.wicket_kind:
                counts['wicket'] += 1
            elif d.runs_batter == 0:
                counts['dot'] += 1
            elif d.runs_batter == 1:
                counts['single'] += 1
            elif d.runs_batter == 2:
                counts['two'] += 1
            elif d.runs_batter == 3:
                counts['three'] += 1
            elif d.runs_batter == 4:
                counts['four'] += 1
            elif d.runs_batter == 6:
                counts['six'] += 1

        return {k: v / total for k, v in counts.items()}

    def compute_phase_stats(self, tournament: Optional[str] = None,
                            format_type: Optional[str] = None) -> Dict[str, Dict[str, float]]:
        """Compute statistics by match phase."""
        if not PANDAS_AVAILABLE:
            return self._compute_phase_stats_python(tournament, format_type)

        df = self.df.copy()

        if tournament:
            df = df[df['tournament'] == tournament]
        if format_type:
            df = df[df['format'] == format_type]

        valid = df[df['is_valid_ball'] == True].copy()

        # Define phases based on format
        if format_type == 't20':
            def get_phase(over):
                if over <= 6:
                    return 'powerplay'
                elif over <= 15:
                    return 'middle'
                else:
                    return 'death'
        elif format_type == 'odi':
            def get_phase(over):
                if over <= 10:
                    return 'powerplay'
                elif over <= 40:
                    return 'middle'
                else:
                    return 'death'
        else:  # Test
            def get_phase(over):
                if over <= 30:
                    return 'new_ball'
                elif over <= 80:
                    return 'middle'
                else:
                    return 'old_ball'

        valid['phase'] = valid['over'].apply(get_phase)

        phase_stats = {}
        base_outcomes = self.compute_base_outcomes(tournament, format_type)
        base_boundary = base_outcomes.get('four', 0.1) + base_outcomes.get('six', 0.05)

        for phase in valid['phase'].unique():
            phase_df = valid[valid['phase'] == phase]
            total = len(phase_df)

            if total < 100:
                continue

            wickets = phase_df['wicket_kind'].notna().sum()
            non_wicket = phase_df[phase_df['wicket_kind'].isna()]
            boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()
            dots = (non_wicket['runs_batter'] == 0).sum()

            runs = phase_df['runs_total'].sum()
            overs = total / 6

            phase_stats[phase] = {
                'balls': total,
                'boundary_rate': boundaries / total,
                'wicket_rate': wickets / total,
                'dot_rate': dots / total,
                'run_rate': runs / overs if overs > 0 else 0,
                'boundary_mod': (boundaries / total) / base_boundary if base_boundary > 0 else 1.0,
                'wicket_mod': (wickets / total) / base_outcomes.get('wicket', 0.05),
            }

        return phase_stats

    def _compute_phase_stats_python(self, tournament: Optional[str] = None,
                                     format_type: Optional[str] = None) -> Dict[str, Dict[str, float]]:
        """Pure Python version of phase stats computation."""
        filtered = [d for d in self.deliveries
                    if d.is_valid_ball
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        # Define phase function based on format
        if format_type == 't20':
            def get_phase(over):
                if over <= 6: return 'powerplay'
                elif over <= 15: return 'middle'
                else: return 'death'
        elif format_type == 'odi':
            def get_phase(over):
                if over <= 10: return 'powerplay'
                elif over <= 40: return 'middle'
                else: return 'death'
        else:  # Test
            def get_phase(over):
                if over <= 30: return 'new_ball'
                elif over <= 80: return 'middle'
                else: return 'old_ball'

        phase_data = defaultdict(lambda: {
            'balls': 0, 'wickets': 0, 'boundaries': 0, 'dots': 0, 'runs': 0
        })

        for d in filtered:
            phase = get_phase(d.over)
            phase_data[phase]['balls'] += 1
            phase_data[phase]['runs'] += d.runs_total

            if d.wicket_kind:
                phase_data[phase]['wickets'] += 1
            elif d.runs_batter == 0:
                phase_data[phase]['dots'] += 1
            elif d.runs_batter in [4, 6]:
                phase_data[phase]['boundaries'] += 1

        base_outcomes = self.compute_base_outcomes(tournament, format_type)
        base_boundary = base_outcomes.get('four', 0.1) + base_outcomes.get('six', 0.05)

        phase_stats = {}
        for phase, data in phase_data.items():
            total = data['balls']
            if total < 100:
                continue

            phase_stats[phase] = {
                'balls': total,
                'boundary_rate': data['boundaries'] / total,
                'wicket_rate': data['wickets'] / total,
                'dot_rate': data['dots'] / total,
                'run_rate': data['runs'] / (total / 6),
                'boundary_mod': (data['boundaries'] / total) / base_boundary if base_boundary > 0 else 1.0,
                'wicket_mod': (data['wickets'] / total) / base_outcomes.get('wicket', 0.05),
            }

        return phase_stats

    def compute_dismissal_types(self, tournament: Optional[str] = None,
                                 format_type: Optional[str] = None) -> Dict[str, float]:
        """Compute dismissal type distribution."""
        filtered = [d for d in self.deliveries
                    if d.wicket_kind
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        total = len(filtered)
        if total == 0:
            return {}

        counts = defaultdict(int)
        for d in filtered:
            kind = d.wicket_kind.lower().replace(' ', '_')
            counts[kind] += 1

        return {k: v / total for k, v in sorted(counts.items(), key=lambda x: -x[1])}

    def get_top_batters(self, tournament: Optional[str] = None,
                        format_type: Optional[str] = None,
                        min_balls: int = 100) -> List[Dict[str, Any]]:
        """Get top batters by runs scored."""
        filtered = [d for d in self.deliveries
                    if d.is_valid_ball
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        batter_stats = defaultdict(lambda: {
            'runs': 0, 'balls': 0, 'fours': 0, 'sixes': 0,
            'dismissals': 0, 'innings': set()
        })

        for d in filtered:
            stats = batter_stats[d.batter]
            stats['runs'] += d.runs_batter
            stats['balls'] += 1
            stats['innings'].add((d.match_id, d.innings))

            if d.runs_batter == 4:
                stats['fours'] += 1
            elif d.runs_batter == 6:
                stats['sixes'] += 1

            if d.wicket_kind and d.wicket_player == d.batter:
                stats['dismissals'] += 1

        results = []
        for batter, stats in batter_stats.items():
            if stats['balls'] >= min_balls:
                results.append({
                    'player': batter,
                    'runs': stats['runs'],
                    'balls': stats['balls'],
                    'innings': len(stats['innings']),
                    'dismissals': stats['dismissals'],
                    'average': stats['runs'] / max(1, stats['dismissals']),
                    'strike_rate': (stats['runs'] / stats['balls']) * 100,
                    'fours': stats['fours'],
                    'sixes': stats['sixes'],
                })

        return sorted(results, key=lambda x: -x['runs'])

    def get_top_bowlers(self, tournament: Optional[str] = None,
                        format_type: Optional[str] = None,
                        min_balls: int = 60) -> List[Dict[str, Any]]:
        """Get top bowlers by wickets taken."""
        filtered = [d for d in self.deliveries
                    if d.is_valid_ball
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        bowler_stats = defaultdict(lambda: {
            'wickets': 0, 'runs': 0, 'balls': 0,
            'dots': 0, 'innings': set()
        })

        for d in filtered:
            stats = bowler_stats[d.bowler]
            stats['runs'] += d.runs_batter + d.runs_extras
            stats['balls'] += 1
            stats['innings'].add((d.match_id, d.innings))

            if d.runs_batter == 0 and not d.wicket_kind:
                stats['dots'] += 1

            if d.wicket_kind and d.wicket_kind not in ['run out', 'retired hurt', 'retired out']:
                stats['wickets'] += 1

        results = []
        for bowler, stats in bowler_stats.items():
            if stats['balls'] >= min_balls:
                overs = stats['balls'] / 6
                results.append({
                    'player': bowler,
                    'wickets': stats['wickets'],
                    'runs': stats['runs'],
                    'overs': round(overs, 1),
                    'innings': len(stats['innings']),
                    'average': stats['runs'] / max(1, stats['wickets']),
                    'economy': stats['runs'] / overs if overs > 0 else 0,
                    'strike_rate': stats['balls'] / max(1, stats['wickets']),
                    'dot_rate': stats['dots'] / stats['balls'],
                })

        return sorted(results, key=lambda x: -x['wickets'])


class PlayerProfileBuilder:
    """Builds comprehensive player profiles across tournaments."""

    def __init__(self, deliveries: List[Delivery]):
        self.deliveries = deliveries
        self.profiles: Dict[str, Dict[str, Any]] = {}

    def build_profiles(self) -> Dict[str, Dict[str, Any]]:
        """Build profiles for all players."""
        # Collect stats by player and tournament
        player_tournament_stats = defaultdict(lambda: defaultdict(lambda: {
            'batting': {'runs': 0, 'balls': 0, 'fours': 0, 'sixes': 0,
                        'dismissals': 0, 'innings': set(), 'not_outs': 0},
            'bowling': {'wickets': 0, 'runs': 0, 'balls': 0, 'dots': 0, 'innings': set()},
            'fielding': {'catches': 0, 'stumpings': 0, 'run_outs': 0}
        }))

        for d in self.deliveries:
            if d.is_valid_ball:
                # Batting stats for batter
                bat_stats = player_tournament_stats[d.batter][d.tournament]['batting']
                bat_stats['runs'] += d.runs_batter
                bat_stats['balls'] += 1
                bat_stats['innings'].add((d.match_id, d.innings))
                if d.runs_batter == 4:
                    bat_stats['fours'] += 1
                elif d.runs_batter == 6:
                    bat_stats['sixes'] += 1

                # Bowling stats
                bowl_stats = player_tournament_stats[d.bowler][d.tournament]['bowling']
                bowl_stats['runs'] += d.runs_batter + d.runs_extras
                bowl_stats['balls'] += 1
                bowl_stats['innings'].add((d.match_id, d.innings))
                if d.runs_batter == 0 and not d.wicket_kind:
                    bowl_stats['dots'] += 1

            # Wicket stats
            if d.wicket_kind:
                if d.wicket_player:
                    bat_stats = player_tournament_stats[d.wicket_player][d.tournament]['batting']
                    bat_stats['dismissals'] += 1

                if d.wicket_kind not in ['run out', 'retired hurt', 'retired out']:
                    bowl_stats = player_tournament_stats[d.bowler][d.tournament]['bowling']
                    bowl_stats['wickets'] += 1

                # Fielding stats
                for fielder in d.fielders:
                    field_stats = player_tournament_stats[fielder][d.tournament]['fielding']
                    if d.wicket_kind == 'caught':
                        field_stats['catches'] += 1
                    elif d.wicket_kind == 'stumped':
                        field_stats['stumpings'] += 1
                    elif d.wicket_kind == 'run out':
                        field_stats['run_outs'] += 1

        # Build final profiles
        for player, tournaments in player_tournament_stats.items():
            profile = {
                'name': player,
                'tournaments': {},
                'overall': {
                    'batting': {'runs': 0, 'balls': 0, 'fours': 0, 'sixes': 0,
                                'dismissals': 0, 'innings': 0},
                    'bowling': {'wickets': 0, 'runs': 0, 'balls': 0, 'dots': 0, 'innings': 0},
                    'fielding': {'catches': 0, 'stumpings': 0, 'run_outs': 0}
                }
            }

            for tournament, stats in tournaments.items():
                bat = stats['batting']
                bowl = stats['bowling']
                field = stats['fielding']

                tournament_profile = {
                    'batting': {
                        'runs': bat['runs'],
                        'balls': bat['balls'],
                        'innings': len(bat['innings']),
                        'dismissals': bat['dismissals'],
                        'average': bat['runs'] / max(1, bat['dismissals']),
                        'strike_rate': (bat['runs'] / max(1, bat['balls'])) * 100,
                        'fours': bat['fours'],
                        'sixes': bat['sixes'],
                    },
                    'bowling': {
                        'wickets': bowl['wickets'],
                        'runs': bowl['runs'],
                        'overs': round(bowl['balls'] / 6, 1),
                        'innings': len(bowl['innings']),
                        'economy': bowl['runs'] / max(0.1, bowl['balls'] / 6),
                        'strike_rate': bowl['balls'] / max(1, bowl['wickets']),
                        'dot_rate': bowl['dots'] / max(1, bowl['balls']),
                    },
                    'fielding': field
                }

                profile['tournaments'][tournament] = tournament_profile

                # Aggregate overall
                profile['overall']['batting']['runs'] += bat['runs']
                profile['overall']['batting']['balls'] += bat['balls']
                profile['overall']['batting']['fours'] += bat['fours']
                profile['overall']['batting']['sixes'] += bat['sixes']
                profile['overall']['batting']['dismissals'] += bat['dismissals']
                profile['overall']['batting']['innings'] += len(bat['innings'])

                profile['overall']['bowling']['wickets'] += bowl['wickets']
                profile['overall']['bowling']['runs'] += bowl['runs']
                profile['overall']['bowling']['balls'] += bowl['balls']
                profile['overall']['bowling']['dots'] += bowl['dots']
                profile['overall']['bowling']['innings'] += len(bowl['innings'])

                profile['overall']['fielding']['catches'] += field['catches']
                profile['overall']['fielding']['stumpings'] += field['stumpings']
                profile['overall']['fielding']['run_outs'] += field['run_outs']

            # Calculate overall averages
            overall_bat = profile['overall']['batting']
            overall_bowl = profile['overall']['bowling']

            overall_bat['average'] = overall_bat['runs'] / max(1, overall_bat['dismissals'])
            overall_bat['strike_rate'] = (overall_bat['runs'] / max(1, overall_bat['balls'])) * 100

            overall_bowl['overs'] = round(overall_bowl['balls'] / 6, 1)
            overall_bowl['economy'] = overall_bowl['runs'] / max(0.1, overall_bowl['balls'] / 6)
            overall_bowl['strike_rate'] = overall_bowl['balls'] / max(1, overall_bowl['wickets'])

            self.profiles[player] = profile

        return self.profiles

    def get_player_profile(self, player_name: str) -> Optional[Dict[str, Any]]:
        """Get profile for a specific player."""
        return self.profiles.get(player_name)

    def find_players_by_stats(self, min_runs: int = 0, min_wickets: int = 0,
                               min_innings: int = 1) -> List[Dict[str, Any]]:
        """Find players matching stat criteria."""
        results = []

        for name, profile in self.profiles.items():
            overall = profile['overall']

            if (overall['batting']['runs'] >= min_runs and
                overall['bowling']['wickets'] >= min_wickets and
                overall['batting']['innings'] >= min_innings):
                results.append({
                    'name': name,
                    'runs': overall['batting']['runs'],
                    'batting_avg': overall['batting']['average'],
                    'strike_rate': overall['batting']['strike_rate'],
                    'wickets': overall['bowling']['wickets'],
                    'bowling_avg': overall['bowling']['runs'] / max(1, overall['bowling']['wickets']),
                    'economy': overall['bowling']['economy'],
                    'catches': overall['fielding']['catches'],
                    'tournaments': list(profile['tournaments'].keys()),
                })

        return sorted(results, key=lambda x: -(x['runs'] + x['wickets'] * 20))


def print_report(loader: CricsheetLoader, analyzer: TournamentAnalyzer,
                 profile_builder: PlayerProfileBuilder, output_file: Optional[str] = None):
    """Print comprehensive analysis report."""
    lines = []

    def log(text: str = ""):
        print(text)
        lines.append(text)

    log("=" * 70)
    log("CRICSHEET DATA ANALYSIS REPORT")
    log(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log("=" * 70)

    # Summary
    summary = analyzer.get_summary()

    log("\n" + "=" * 50)
    log("DATA SUMMARY")
    log("=" * 50)
    log(f"\nTotal Deliveries: {summary['total_deliveries']:,}")
    log(f"Total Matches: {summary['total_matches']:,}")
    log(f"Date Range: {summary['date_range']['earliest']} to {summary['date_range']['latest']}")

    log("\nBy Tournament:")
    for tournament, stats in sorted(summary['by_tournament'].items(),
                                     key=lambda x: -x[1]['matches']):
        name = CricsheetLoader.TOURNAMENT_NAMES.get(tournament, tournament)
        log(f"  {name:35s}: {stats['matches']:4d} matches, {stats['deliveries']:,} balls")

    log("\nBy Format:")
    for format_type, stats in sorted(summary['by_format'].items(),
                                       key=lambda x: -x[1]['matches']):
        log(f"  {format_type.upper():10s}: {stats['matches']:4d} matches, {stats['deliveries']:,} balls")

    # Base outcomes by format
    log("\n" + "=" * 50)
    log("BASE OUTCOME DISTRIBUTIONS BY FORMAT")
    log("=" * 50)

    for format_type in ['t20', 'odi', 'test']:
        outcomes = analyzer.compute_base_outcomes(format_type=format_type)
        if outcomes:
            log(f"\n{format_type.upper()}:")
            for outcome, pct in outcomes.items():
                log(f"  {outcome:8s}: {pct:.4f} ({pct*100:5.2f}%)")

    # Phase stats by format
    log("\n" + "=" * 50)
    log("PHASE STATISTICS BY FORMAT")
    log("=" * 50)

    for format_type in ['t20', 'odi', 'test']:
        phase_stats = analyzer.compute_phase_stats(format_type=format_type)
        if phase_stats:
            log(f"\n{format_type.upper()}:")
            for phase, stats in phase_stats.items():
                log(f"  {phase}:")
                log(f"    Balls: {stats['balls']:,}")
                log(f"    Run Rate: {stats['run_rate']:.2f}")
                log(f"    Boundary Rate: {stats['boundary_rate']:.4f} (mod: {stats['boundary_mod']:.2f})")
                log(f"    Wicket Rate: {stats['wicket_rate']:.4f} (mod: {stats['wicket_mod']:.2f})")

    # Dismissal types
    log("\n" + "=" * 50)
    log("DISMISSAL TYPES BY FORMAT")
    log("=" * 50)

    for format_type in ['t20', 'odi', 'test']:
        dismissals = analyzer.compute_dismissal_types(format_type=format_type)
        if dismissals:
            log(f"\n{format_type.upper()}:")
            for kind, pct in list(dismissals.items())[:8]:
                log(f"  {kind:20s}: {pct:.4f} ({pct*100:5.2f}%)")

    # Top players
    log("\n" + "=" * 50)
    log("TOP BATTERS (Overall)")
    log("=" * 50)

    batters = analyzer.get_top_batters(min_balls=500)[:20]
    log(f"\n{'Player':30s} {'Runs':>6s} {'Balls':>6s} {'Avg':>7s} {'SR':>7s} {'4s':>5s} {'6s':>5s}")
    log("-" * 70)
    for b in batters:
        log(f"{b['player']:30s} {b['runs']:6d} {b['balls']:6d} {b['average']:7.2f} {b['strike_rate']:7.2f} {b['fours']:5d} {b['sixes']:5d}")

    log("\n" + "=" * 50)
    log("TOP BOWLERS (Overall)")
    log("=" * 50)

    bowlers = analyzer.get_top_bowlers(min_balls=300)[:20]
    log(f"\n{'Player':30s} {'Wkts':>5s} {'Overs':>7s} {'Avg':>7s} {'Econ':>6s} {'SR':>7s}")
    log("-" * 70)
    for b in bowlers:
        log(f"{b['player']:30s} {b['wickets']:5d} {b['overs']:7.1f} {b['average']:7.2f} {b['economy']:6.2f} {b['strike_rate']:7.1f}")

    # Tournament-specific analysis
    log("\n" + "=" * 50)
    log("IPL SPECIFIC ANALYSIS")
    log("=" * 50)

    ipl_outcomes = analyzer.compute_base_outcomes(tournament='ipl')
    if ipl_outcomes:
        log("\nBase Outcomes:")
        for outcome, pct in ipl_outcomes.items():
            log(f"  {outcome:8s}: {pct:.4f} ({pct*100:5.2f}%)")

        ipl_phase = analyzer.compute_phase_stats(tournament='ipl')
        if ipl_phase:
            log("\nPhase Stats:")
            for phase, stats in ipl_phase.items():
                log(f"  {phase}: RR={stats['run_rate']:.2f}, Boundary={stats['boundary_rate']:.4f}, Wicket={stats['wicket_rate']:.4f}")

    # Save report if output file specified
    if output_file:
        with open(output_file, 'w') as f:
            f.write('\n'.join(lines))
        log(f"\nReport saved to: {output_file}")


def export_probability_params(analyzer: TournamentAnalyzer, output_dir: str):
    """Export probability parameters to YAML format for each format."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    for format_type in ['t20', 'odi', 'test']:
        outcomes = analyzer.compute_base_outcomes(format_type=format_type)
        phases = analyzer.compute_phase_stats(format_type=format_type)
        dismissals = analyzer.compute_dismissal_types(format_type=format_type)

        if not outcomes:
            continue

        yaml_content = [
            f"# Probability parameters for {format_type.upper()} cricket",
            f"# Auto-generated from cricsheet data analysis",
            f"# Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "base_outcomes:",
        ]

        for outcome, pct in outcomes.items():
            yaml_content.append(f"  {outcome}: {pct:.4f}")

        yaml_content.extend(["", "phase_modifiers:"])
        for phase, stats in phases.items():
            yaml_content.append(f"  {phase}:")
            yaml_content.append(f"    boundary_mod: {stats['boundary_mod']:.2f}")
            yaml_content.append(f"    wicket_mod: {stats['wicket_mod']:.2f}")
            yaml_content.append(f"    run_rate_target: {stats['run_rate']:.1f}")

        yaml_content.extend(["", "dismissals:"])
        for kind, pct in list(dismissals.items())[:6]:
            yaml_content.append(f"  {kind}: {pct:.4f}")

        output_file = output_path / f"probability_params_{format_type}.yaml"
        with open(output_file, 'w') as f:
            f.write('\n'.join(yaml_content))

        print(f"Exported: {output_file}")


class AdvancedAnalyzer:
    """Advanced analysis: momentum, partnerships, collapse patterns, etc."""

    def __init__(self, deliveries: List[Delivery]):
        self.deliveries = deliveries

    def compute_partnership_dynamics(self, tournament: Optional[str] = None,
                                      format_type: Optional[str] = None) -> Dict[str, Dict[str, float]]:
        """Analyze how batting changes as partnership builds."""
        filtered = [d for d in self.deliveries
                    if d.is_valid_ball
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        if not filtered:
            return {}

        # Get base outcomes for modifier calculation
        total = len(filtered)
        base_boundary = sum(1 for d in filtered if d.runs_batter in [4, 6]) / total
        base_wicket = sum(1 for d in filtered if d.wicket_kind) / total

        brackets = [
            (0, 10, "0-10"),
            (10, 20, "10-20"),
            (20, 30, "20-30"),
            (30, 50, "30-50"),
            (50, 75, "50-75"),
            (75, 100, "75-100"),
            (100, 500, "100+"),
        ]

        partnership_stats = {}

        for low, high, label in brackets:
            subset = [d for d in filtered if low <= d.partnership_runs < high]
            total_subset = len(subset)

            if total_subset < 500:
                continue

            wickets = sum(1 for d in subset if d.wicket_kind)
            boundaries = sum(1 for d in subset if d.runs_batter in [4, 6])
            dots = sum(1 for d in subset if d.runs_batter == 0 and not d.wicket_kind)
            runs = sum(d.runs_batter for d in subset)

            partnership_stats[label] = {
                'balls': total_subset,
                'boundary_rate': boundaries / total_subset,
                'wicket_rate': wickets / total_subset,
                'dot_rate': dots / total_subset,
                'strike_rate': (runs / total_subset) * 100,
                'boundary_mod': (boundaries / total_subset) / base_boundary if base_boundary > 0 else 1.0,
                'wicket_mod': (wickets / total_subset) / base_wicket if base_wicket > 0 else 1.0,
            }

        return partnership_stats

    def compute_momentum_analysis(self, tournament: Optional[str] = None,
                                   format_type: Optional[str] = None) -> Dict[str, Any]:
        """Analyze momentum patterns (scoring bursts, pressure)."""
        filtered = [d for d in self.deliveries
                    if d.is_valid_ball
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        if not filtered:
            return {}

        total = len(filtered)
        base_boundary = sum(1 for d in filtered if d.runs_batter in [4, 6]) / total
        base_wicket = sum(1 for d in filtered if d.wicket_kind) / total

        # Group by match and innings to calculate rolling stats
        match_innings = defaultdict(list)
        for d in filtered:
            key = (d.match_id, d.innings)
            match_innings[key].append(d)

        # Calculate recent stats for each delivery
        deliveries_with_recent = []

        for key, balls in match_innings.items():
            balls.sort(key=lambda x: (x.over, x.ball))

            for i, d in enumerate(balls):
                recent_6 = balls[max(0, i-6):i]

                recent_runs = sum(b.runs_batter for b in recent_6)
                recent_boundaries = sum(1 for b in recent_6 if b.runs_batter in [4, 6])
                recent_dots = sum(1 for b in recent_6 if b.runs_batter == 0)

                deliveries_with_recent.append({
                    'delivery': d,
                    'recent_runs': recent_runs,
                    'recent_boundaries': recent_boundaries,
                    'recent_dots': recent_dots,
                })

        # Analyze by recent boundaries
        momentum_stats = {'by_recent_boundaries': {}, 'by_recent_dots': {}}

        for count in [0, 1, 2, 3]:
            if count == 3:
                subset = [x for x in deliveries_with_recent if x['recent_boundaries'] >= 3]
                label = "3+"
            else:
                subset = [x for x in deliveries_with_recent if x['recent_boundaries'] == count]
                label = str(count)

            total_subset = len(subset)
            if total_subset < 1000:
                continue

            wickets = sum(1 for x in subset if x['delivery'].wicket_kind)
            boundaries = sum(1 for x in subset if x['delivery'].runs_batter in [4, 6])

            momentum_stats['by_recent_boundaries'][label] = {
                'balls': total_subset,
                'boundary_mod': (boundaries / total_subset) / base_boundary if base_boundary > 0 else 1.0,
                'wicket_mod': (wickets / total_subset) / base_wicket if base_wicket > 0 else 1.0,
            }

        # Analyze by recent dots (pressure)
        for count in [0, 1, 2, 3, 4, 5]:
            if count == 5:
                subset = [x for x in deliveries_with_recent if x['recent_dots'] >= 5]
                label = "5+"
            else:
                subset = [x for x in deliveries_with_recent if x['recent_dots'] == count]
                label = str(count)

            total_subset = len(subset)
            if total_subset < 1000:
                continue

            wickets = sum(1 for x in subset if x['delivery'].wicket_kind)
            boundaries = sum(1 for x in subset if x['delivery'].runs_batter in [4, 6])

            momentum_stats['by_recent_dots'][label] = {
                'balls': total_subset,
                'boundary_mod': (boundaries / total_subset) / base_boundary if base_boundary > 0 else 1.0,
                'wicket_mod': (wickets / total_subset) / base_wicket if base_wicket > 0 else 1.0,
            }

        return momentum_stats

    def compute_wicket_clustering(self, tournament: Optional[str] = None,
                                   format_type: Optional[str] = None) -> Dict[str, Any]:
        """Analyze wicket clustering (collapse patterns)."""
        filtered = [d for d in self.deliveries
                    if d.is_valid_ball
                    and (not tournament or d.tournament == tournament)
                    and (not format_type or d.format == format_type)]

        if not filtered:
            return {}

        # Group by match and innings
        match_innings = defaultdict(list)
        for d in filtered:
            key = (d.match_id, d.innings)
            match_innings[key].append(d)

        gaps = []
        collapse_count = 0
        total_innings = len(match_innings)

        for key, balls in match_innings.items():
            balls.sort(key=lambda x: (x.over, x.ball))

            # Find wicket positions
            wicket_positions = [i for i, b in enumerate(balls) if b.wicket_kind]

            if len(wicket_positions) < 2:
                continue

            # Calculate gaps between wickets
            for i in range(1, len(wicket_positions)):
                gap = wicket_positions[i] - wicket_positions[i-1]
                gaps.append(gap)

            # Check for collapse (3+ wickets in 18 balls)
            for i in range(len(wicket_positions) - 2):
                if wicket_positions[i+2] - wicket_positions[i] <= 18:
                    collapse_count += 1
                    break

        if not gaps:
            return {}

        mean_gap = sum(gaps) / len(gaps)
        gaps_sorted = sorted(gaps)
        median_gap = gaps_sorted[len(gaps_sorted) // 2]

        return {
            'mean_gap': mean_gap,
            'median_gap': median_gap,
            'collapse_rate': collapse_count / total_innings if total_innings > 0 else 0,
            'within_6_balls': sum(1 for g in gaps if g <= 6) / len(gaps),
            'within_12_balls': sum(1 for g in gaps if g <= 12) / len(gaps),
            'within_18_balls': sum(1 for g in gaps if g <= 18) / len(gaps),
            'sample_size': len(gaps),
        }

    def compare_formats(self) -> Dict[str, Dict[str, Any]]:
        """Compare statistics across formats."""
        comparison = {}

        for format_type in ['t20', 'odi', 'test']:
            filtered = [d for d in self.deliveries
                        if d.is_valid_ball and d.format == format_type]

            if not filtered:
                continue

            total = len(filtered)
            matches = len(set(d.match_id for d in filtered))

            wickets = sum(1 for d in filtered if d.wicket_kind)
            boundaries = sum(1 for d in filtered if d.runs_batter in [4, 6])
            dots = sum(1 for d in filtered if d.runs_batter == 0 and not d.wicket_kind)
            sixes = sum(1 for d in filtered if d.runs_batter == 6)
            fours = sum(1 for d in filtered if d.runs_batter == 4)
            runs = sum(d.runs_batter for d in filtered)

            comparison[format_type] = {
                'matches': matches,
                'balls': total,
                'runs_per_over': (runs / total) * 6,
                'boundary_rate': boundaries / total,
                'six_rate': sixes / total,
                'four_rate': fours / total,
                'wicket_rate': wickets / total,
                'dot_rate': dots / total,
                'avg_balls_per_wicket': total / max(1, wickets),
            }

        return comparison

    def compare_tournaments(self, format_type: str = 't20') -> Dict[str, Dict[str, Any]]:
        """Compare T20 tournaments (leagues)."""
        comparison = {}

        # Get all tournaments of the specified format
        tournaments = set(d.tournament for d in self.deliveries if d.format == format_type)

        for tournament in tournaments:
            filtered = [d for d in self.deliveries
                        if d.is_valid_ball
                        and d.tournament == tournament]

            if len(filtered) < 1000:  # Need minimum sample
                continue

            total = len(filtered)
            matches = len(set(d.match_id for d in filtered))

            wickets = sum(1 for d in filtered if d.wicket_kind)
            boundaries = sum(1 for d in filtered if d.runs_batter in [4, 6])
            sixes = sum(1 for d in filtered if d.runs_batter == 6)
            runs = sum(d.runs_batter for d in filtered)

            comparison[tournament] = {
                'display_name': CricsheetLoader.TOURNAMENT_NAMES.get(tournament, tournament),
                'matches': matches,
                'balls': total,
                'runs_per_over': (runs / total) * 6,
                'boundary_rate': boundaries / total,
                'six_rate': sixes / total,
                'wicket_rate': wickets / total,
            }

        return dict(sorted(comparison.items(), key=lambda x: -x[1]['matches']))


def export_player_database(profile_builder: PlayerProfileBuilder, output_file: str,
                            min_balls: int = 100):
    """Export player database to CSV."""
    profiles = profile_builder.profiles

    rows = []
    for name, profile in profiles.items():
        overall = profile['overall']

        if overall['batting']['balls'] < min_balls and overall['bowling']['balls'] < min_balls:
            continue

        rows.append({
            'player_name': name,
            'tournaments': ','.join(profile['tournaments'].keys()),
            'batting_runs': overall['batting']['runs'],
            'batting_balls': overall['batting']['balls'],
            'batting_innings': overall['batting']['innings'],
            'batting_average': round(overall['batting']['average'], 2),
            'batting_strike_rate': round(overall['batting']['strike_rate'], 2),
            'batting_fours': overall['batting']['fours'],
            'batting_sixes': overall['batting']['sixes'],
            'bowling_wickets': overall['bowling']['wickets'],
            'bowling_runs': overall['bowling']['runs'],
            'bowling_overs': overall['bowling']['overs'],
            'bowling_economy': round(overall['bowling']['economy'], 2),
            'catches': overall['fielding']['catches'],
            'stumpings': overall['fielding']['stumpings'],
            'run_outs': overall['fielding']['run_outs'],
        })

    rows.sort(key=lambda x: -(x['batting_runs'] + x['bowling_wickets'] * 20))

    with open(output_file, 'w', newline='') as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

    print(f"Exported {len(rows)} players to: {output_file}")


def main():
    parser = argparse.ArgumentParser(description='Analyze cricsheet cricket data')
    parser.add_argument('--data-dir', required=True, help='Path to cricsheet data folder')
    parser.add_argument('--output-dir', default='./output', help='Output directory for reports')
    parser.add_argument('--tournaments', nargs='+', help='Specific tournaments to analyze')
    parser.add_argument('--limit', type=int, help='Limit matches per tournament (for testing)')
    parser.add_argument('--list-tournaments', action='store_true', help='List available tournaments')
    parser.add_argument('--export-params', action='store_true', help='Export probability parameters')
    parser.add_argument('--export-players', action='store_true', help='Export player database')
    parser.add_argument('--parallel', action='store_true', help='Use parallel processing for faster loading')
    parser.add_argument('--workers', type=int, help='Number of parallel workers (default: CPU count, max 8)')

    args = parser.parse_args()

    # Initialize loader
    loader = CricsheetLoader(args.data_dir)

    # List tournaments if requested
    if args.list_tournaments:
        print("\nAvailable tournaments:")
        tournaments = loader.discover_tournaments()
        for name, count in tournaments.items():
            display = CricsheetLoader.TOURNAMENT_NAMES.get(name, name)
            format_type = CricsheetLoader.TOURNAMENT_FORMATS.get(name, 'unknown')
            print(f"  {name:25s} ({format_type:5s}): {count:4d} matches - {display}")
        return

    # Load data
    tournaments = args.tournaments if args.tournaments else loader.discover_tournaments().keys()

    if args.parallel:
        workers = args.workers or min(multiprocessing.cpu_count(), 8)
        print(f"\nLoading data (parallel mode, {workers} workers)...")
    else:
        print("\nLoading data...")

    total_loaded = 0
    for tournament in tournaments:
        loaded = loader.load_tournament(
            tournament,
            limit=args.limit,
            parallel=args.parallel,
            workers=args.workers
        )
        if loaded > 0:
            print(f"  {tournament}: {loaded} matches")
            total_loaded += loaded

    print(f"\nTotal: {total_loaded} matches, {len(loader.deliveries):,} deliveries")

    if not loader.deliveries:
        print("No data loaded. Check your data directory path.")
        return

    # Create analyzer
    analyzer = TournamentAnalyzer(loader.deliveries)

    # Build player profiles
    print("\nBuilding player profiles...")
    profile_builder = PlayerProfileBuilder(loader.deliveries)
    profile_builder.build_profiles()
    print(f"  {len(profile_builder.profiles)} players profiled")

    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate report
    report_file = output_dir / "analysis_report.txt"
    print_report(loader, analyzer, profile_builder, str(report_file))

    # Advanced analysis
    print("\nRunning advanced analysis...")
    advanced = AdvancedAnalyzer(loader.deliveries)

    # Format comparison
    format_comparison = advanced.compare_formats()
    if format_comparison:
        print("\n" + "=" * 50)
        print("FORMAT COMPARISON")
        print("=" * 50)
        print(f"\n{'Format':10s} {'Matches':>8s} {'RPO':>6s} {'Bound%':>7s} {'6s%':>6s} {'Wkt%':>6s} {'Dot%':>6s}")
        print("-" * 55)
        for fmt, stats in format_comparison.items():
            print(f"{fmt.upper():10s} {stats['matches']:8d} {stats['runs_per_over']:6.2f} "
                  f"{stats['boundary_rate']*100:7.2f} {stats['six_rate']*100:6.2f} "
                  f"{stats['wicket_rate']*100:6.2f} {stats['dot_rate']*100:6.2f}")

    # T20 tournament comparison
    t20_comparison = advanced.compare_tournaments('t20')
    if t20_comparison:
        print("\n" + "=" * 50)
        print("T20 LEAGUE COMPARISON")
        print("=" * 50)
        print(f"\n{'League':25s} {'Matches':>8s} {'RPO':>6s} {'Bound%':>7s} {'6s%':>6s}")
        print("-" * 55)
        for tournament, stats in list(t20_comparison.items())[:10]:
            print(f"{stats['display_name'][:25]:25s} {stats['matches']:8d} "
                  f"{stats['runs_per_over']:6.2f} {stats['boundary_rate']*100:7.2f} "
                  f"{stats['six_rate']*100:6.2f}")

    # Wicket clustering analysis
    print("\n" + "=" * 50)
    print("WICKET CLUSTERING BY FORMAT")
    print("=" * 50)
    for fmt in ['t20', 'odi', 'test']:
        clustering = advanced.compute_wicket_clustering(format_type=fmt)
        if clustering:
            print(f"\n{fmt.upper()}:")
            print(f"  Mean gap between wickets: {clustering['mean_gap']:.1f} balls")
            print(f"  Collapse rate (3+ in 3 overs): {clustering['collapse_rate']*100:.1f}%")
            print(f"  Wickets within 6 balls: {clustering['within_6_balls']*100:.1f}%")

    # Partnership dynamics (T20)
    partnership = advanced.compute_partnership_dynamics(format_type='t20')
    if partnership:
        print("\n" + "=" * 50)
        print("PARTNERSHIP DYNAMICS (T20)")
        print("=" * 50)
        print(f"\n{'Runs':10s} {'Balls':>8s} {'SR':>7s} {'Bound Mod':>10s} {'Wkt Mod':>10s}")
        print("-" * 50)
        for bracket, stats in partnership.items():
            print(f"{bracket:10s} {stats['balls']:8d} {stats['strike_rate']:7.1f} "
                  f"{stats['boundary_mod']:10.3f} {stats['wicket_mod']:10.3f}")

    # Momentum analysis (T20)
    momentum = advanced.compute_momentum_analysis(format_type='t20')
    if momentum and 'by_recent_boundaries' in momentum:
        print("\n" + "=" * 50)
        print("MOMENTUM ANALYSIS (T20)")
        print("=" * 50)
        print("\nBoundaries in last over → next ball:")
        for count, stats in momentum['by_recent_boundaries'].items():
            print(f"  {count} boundaries: boundary_mod={stats['boundary_mod']:.3f}, "
                  f"wicket_mod={stats['wicket_mod']:.3f}")

    # Export probability parameters
    if args.export_params:
        export_probability_params(analyzer, str(output_dir))

    # Export player database
    if args.export_players:
        players_file = output_dir / "players_database.csv"
        export_player_database(profile_builder, str(players_file))

    print("\n" + "=" * 50)
    print("ANALYSIS COMPLETE")
    print("=" * 50)
    print(f"\nOutputs saved to: {output_dir}")


if __name__ == "__main__":
    main()
