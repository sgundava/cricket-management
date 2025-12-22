"""
IPL Data Analysis Script
Computes probability parameters from ball-by-ball Kaggle dataset
to calibrate the match engine in probability_params.yaml
"""

import pandas as pd
import numpy as np
from pathlib import Path


def load_data(filepath: str) -> pd.DataFrame:
    """Load and prepare the IPL ball-by-ball dataset."""
    print(f"Loading data from {filepath}...")
    df = pd.read_csv(filepath, index_col=0, low_memory=False)
    print(f"Loaded {len(df):,} balls")

    # Convert season to numeric, coercing errors
    df['season'] = pd.to_numeric(df['season'], errors='coerce')

    # Filter to valid balls only (excludes wides, no-balls for outcome analysis)
    # But we'll keep all balls for extras analysis
    return df


def get_phase(over: int) -> str:
    """Determine match phase from over number (1-indexed)."""
    if over <= 6:
        return "powerplay"
    elif over <= 15:
        return "middle"
    else:
        return "death"


def compute_base_outcomes(df: pd.DataFrame) -> dict:
    """
    Compute base outcome distribution from all valid balls.
    Returns: {dot: %, single: %, two: %, three: %, four: %, six: %, wicket: %}
    """
    print("\n" + "=" * 50)
    print("BASE OUTCOME DISTRIBUTIONS")
    print("=" * 50)

    # Filter to valid balls only
    valid = df[df['valid_ball'] == True].copy()
    total_balls = len(valid)

    # Count outcomes
    # Wicket takes priority - if wicket, it's a wicket ball regardless of runs
    wickets = valid['wicket_kind'].notna().sum()

    # For non-wicket balls, categorize by runs scored by batter
    non_wicket = valid[valid['wicket_kind'].isna()]

    outcomes = {
        'dot': (non_wicket['runs_batter'] == 0).sum(),
        'single': (non_wicket['runs_batter'] == 1).sum(),
        'two': (non_wicket['runs_batter'] == 2).sum(),
        'three': (non_wicket['runs_batter'] == 3).sum(),
        'four': (non_wicket['runs_batter'] == 4).sum(),
        'six': (non_wicket['runs_batter'] == 6).sum(),
        'wicket': wickets
    }

    # Convert to percentages
    percentages = {k: v / total_balls for k, v in outcomes.items()}

    print(f"\nTotal valid balls: {total_balls:,}")
    print(f"\nOutcome distribution:")
    for outcome, pct in percentages.items():
        count = outcomes[outcome]
        print(f"  {outcome:8s}: {pct:.4f} ({pct*100:5.2f}%) - {count:,} balls")

    # Verify sums to ~1.0
    total_pct = sum(percentages.values())
    print(f"\nTotal: {total_pct:.4f} (should be ~1.0)")

    return percentages


def compute_phase_modifiers(df: pd.DataFrame, base_outcomes: dict) -> dict:
    """
    Compute outcome distributions by phase and derive modifiers.
    Modifier = phase_rate / base_rate
    """
    print("\n" + "=" * 50)
    print("PHASE MODIFIERS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()
    valid['phase'] = valid['over'].apply(get_phase)

    phase_stats = {}

    for phase in ['powerplay', 'middle', 'death']:
        phase_df = valid[valid['phase'] == phase]
        total = len(phase_df)

        wickets = phase_df['wicket_kind'].notna().sum()
        non_wicket = phase_df[phase_df['wicket_kind'].isna()]

        # Boundaries = 4s + 6s
        fours = (non_wicket['runs_batter'] == 4).sum()
        sixes = (non_wicket['runs_batter'] == 6).sum()
        boundaries = fours + sixes
        dots = (non_wicket['runs_batter'] == 0).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total
        dot_rate = dots / total

        # Calculate average run rate
        runs = phase_df['runs_total'].sum()
        overs = total / 6
        run_rate = runs / overs if overs > 0 else 0

        phase_stats[phase] = {
            'total_balls': total,
            'boundary_rate': boundary_rate,
            'wicket_rate': wicket_rate,
            'dot_rate': dot_rate,
            'run_rate': run_rate,
            # Modifiers relative to base
            'boundary_mod': boundary_rate / (base_outcomes['four'] + base_outcomes['six']),
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
            'dot_mod': dot_rate / base_outcomes['dot'],
        }

        print(f"\n{phase.upper()} (overs {1 if phase == 'powerplay' else 7 if phase == 'middle' else 16}-{6 if phase == 'powerplay' else 15 if phase == 'middle' else 20}):")
        print(f"  Balls: {total:,}")
        print(f"  Boundary rate: {boundary_rate:.4f} (mod: {phase_stats[phase]['boundary_mod']:.2f})")
        print(f"  Wicket rate:   {wicket_rate:.4f} (mod: {phase_stats[phase]['wicket_mod']:.2f})")
        print(f"  Dot rate:      {dot_rate:.4f} (mod: {phase_stats[phase]['dot_mod']:.2f})")
        print(f"  Run rate:      {run_rate:.2f}")

    return phase_stats


def compute_batsman_state_modifiers(df: pd.DataFrame, base_outcomes: dict) -> dict:
    """
    Compute outcome distributions based on balls faced by batter.
    States: new (1-6 balls), settling (7-15), set (16+)
    """
    print("\n" + "=" * 50)
    print("BATSMAN STATE MODIFIERS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    def get_batsman_state(balls_faced):
        if balls_faced <= 6:
            return "new"
        elif balls_faced <= 15:
            return "settling"
        else:
            return "set"

    valid['batsman_state'] = valid['batter_balls'].apply(get_batsman_state)

    state_stats = {}

    for state in ['new', 'settling', 'set']:
        state_df = valid[valid['batsman_state'] == state]
        total = len(state_df)

        if total == 0:
            continue

        wickets = state_df['wicket_kind'].notna().sum()
        non_wicket = state_df[state_df['wicket_kind'].isna()]

        fours = (non_wicket['runs_batter'] == 4).sum()
        sixes = (non_wicket['runs_batter'] == 6).sum()
        boundaries = fours + sixes
        dots = (non_wicket['runs_batter'] == 0).sum()
        singles = (non_wicket['runs_batter'] == 1).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total
        dot_rate = dots / total
        single_rate = singles / total

        base_boundary = base_outcomes['four'] + base_outcomes['six']

        state_stats[state] = {
            'total_balls': total,
            'boundary_rate': boundary_rate,
            'wicket_rate': wicket_rate,
            'dot_rate': dot_rate,
            'single_rate': single_rate,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
            'dot_mod': dot_rate / base_outcomes['dot'],
            'single_mod': single_rate / base_outcomes['single'],
        }

        balls_range = "1-6" if state == "new" else "7-15" if state == "settling" else "16+"
        print(f"\n{state.upper()} BATSMAN (balls {balls_range}):")
        print(f"  Balls: {total:,}")
        print(f"  Boundary rate: {boundary_rate:.4f} (mod: {state_stats[state]['boundary_mod']:.2f})")
        print(f"  Wicket rate:   {wicket_rate:.4f} (mod: {state_stats[state]['wicket_mod']:.2f})")
        print(f"  Dot rate:      {dot_rate:.4f} (mod: {state_stats[state]['dot_mod']:.2f})")
        print(f"  Single rate:   {single_rate:.4f} (mod: {state_stats[state]['single_mod']:.2f})")

    return state_stats


def compute_dismissal_distributions(df: pd.DataFrame) -> dict:
    """
    Compute distribution of dismissal types.
    """
    print("\n" + "=" * 50)
    print("DISMISSAL TYPE DISTRIBUTIONS")
    print("=" * 50)

    # Get all wickets
    wickets = df[df['wicket_kind'].notna()].copy()
    total_wickets = len(wickets)

    print(f"\nTotal wickets: {total_wickets:,}")

    # Count by type
    dismissal_counts = wickets['wicket_kind'].value_counts()

    # Map to our categories
    mapping = {
        'caught': ['caught', 'caught and bowled'],
        'bowled': ['bowled'],
        'lbw': ['lbw'],
        'runout': ['run out'],
        'stumped': ['stumped'],
        'hitwicket': ['hit wicket'],
        'other': ['retired hurt', 'retired out', 'obstructing the field', 'handled the ball']
    }

    categorized = {}
    for category, types in mapping.items():
        count = sum(dismissal_counts.get(t, 0) for t in types)
        categorized[category] = count

    # Convert to percentages
    percentages = {k: v / total_wickets for k, v in categorized.items()}

    print("\nDismissal distribution:")
    for dismissal, pct in sorted(percentages.items(), key=lambda x: -x[1]):
        count = categorized[dismissal]
        print(f"  {dismissal:12s}: {pct:.4f} ({pct*100:5.2f}%) - {count:,}")

    # Also show raw types
    print("\nRaw dismissal types:")
    for dtype, count in dismissal_counts.items():
        print(f"  {dtype:25s}: {count:,} ({count/total_wickets*100:.2f}%)")

    return percentages


def compute_extras(df: pd.DataFrame) -> dict:
    """
    Compute extras frequency (wides, no-balls).
    """
    print("\n" + "=" * 50)
    print("EXTRAS ANALYSIS")
    print("=" * 50)

    total_balls = len(df)

    # Count by extra type
    extras = df[df['extra_type'].notna()]
    extra_counts = extras['extra_type'].value_counts()

    print(f"\nTotal deliveries (including extras): {total_balls:,}")
    print(f"Valid balls: {df['valid_ball'].sum():,}")

    wide_count = extra_counts.get('wides', 0)
    noball_count = extra_counts.get('noballs', 0)

    extras_stats = {
        'wide_chance': wide_count / total_balls,
        'noball_chance': noball_count / total_balls,
    }

    print(f"\nExtras frequency:")
    print(f"  Wides:    {extras_stats['wide_chance']:.4f} ({wide_count:,} / {total_balls:,})")
    print(f"  No-balls: {extras_stats['noball_chance']:.4f} ({noball_count:,} / {total_balls:,})")

    print("\nAll extra types:")
    for etype, count in extra_counts.items():
        print(f"  {etype:15s}: {count:,} ({count/total_balls*100:.3f}%)")

    return extras_stats


def compute_pressure_analysis(df: pd.DataFrame, base_outcomes: dict) -> dict:
    """
    Analyze outcomes based on pressure situations:
    - High required run rate (chasing innings)
    - Recent wickets fallen
    """
    print("\n" + "=" * 50)
    print("PRESSURE SITUATION ANALYSIS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    # === Required Run Rate Analysis (2nd innings only) ===
    print("\n--- Required Run Rate Analysis (2nd innings) ---")

    second_innings = valid[valid['innings'] == 2].copy()

    # Calculate required run rate
    # RRR = (target - team_runs) / remaining_balls * 6
    second_innings['balls_remaining'] = 120 - second_innings['team_balls']
    second_innings['runs_needed'] = second_innings['runs_target'] - second_innings['team_runs']
    second_innings['rrr'] = (second_innings['runs_needed'] / second_innings['balls_remaining']) * 6
    second_innings['rrr'] = second_innings['rrr'].replace([np.inf, -np.inf], np.nan)

    def get_rrr_bucket(rrr):
        if pd.isna(rrr) or rrr < 0:
            return None
        elif rrr <= 6:
            return "low (<=6)"
        elif rrr <= 9:
            return "normal (6-9)"
        elif rrr <= 12:
            return "high (9-12)"
        else:
            return "very_high (>12)"

    second_innings['rrr_bucket'] = second_innings['rrr'].apply(get_rrr_bucket)

    rrr_stats = {}
    base_boundary = base_outcomes['four'] + base_outcomes['six']

    for bucket in ["low (<=6)", "normal (6-9)", "high (9-12)", "very_high (>12)"]:
        bucket_df = second_innings[second_innings['rrr_bucket'] == bucket]
        total = len(bucket_df)

        if total < 100:  # Skip if too few samples
            continue

        wickets = bucket_df['wicket_kind'].notna().sum()
        non_wicket = bucket_df[bucket_df['wicket_kind'].isna()]
        boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total

        rrr_stats[bucket] = {
            'total_balls': total,
            'boundary_rate': boundary_rate,
            'wicket_rate': wicket_rate,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
        }

        print(f"\nRRR {bucket}:")
        print(f"  Balls: {total:,}")
        print(f"  Boundary mod: {rrr_stats[bucket]['boundary_mod']:.2f}")
        print(f"  Wicket mod:   {rrr_stats[bucket]['wicket_mod']:.2f}")

    return rrr_stats


def compute_recent_wickets_impact(df: pd.DataFrame, base_outcomes: dict) -> dict:
    """
    Analyze how batting changes after recent wickets fall.
    This is crucial for preventing unrealistic collapses.

    Looks at: how does batting change when 1, 2, 3+ wickets fell in last 3 overs?
    """
    print("\n" + "=" * 50)
    print("RECENT WICKETS IMPACT ANALYSIS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    # We need to compute "wickets in last 3 overs" for each ball
    # Group by match and innings, then compute rolling wicket count

    results = []

    for (match_id, innings), group in valid.groupby(['match_id', 'innings']):
        group = group.sort_values(['over', 'ball']).copy()

        # Track wickets per over
        group['is_wicket'] = group['wicket_kind'].notna().astype(int)

        # For each ball, count wickets in the previous 18 balls (3 overs)
        # We'll use a simple approach: track wickets by over
        wickets_by_over = group.groupby('over')['is_wicket'].sum()

        # Create a column for wickets in last 3 overs
        def get_recent_wickets(row):
            current_over = row['over']
            start_over = max(1, current_over - 2)  # Last 3 overs including current
            return wickets_by_over.loc[start_over:current_over-1].sum() if current_over > 1 else 0

        group['recent_wickets'] = group.apply(get_recent_wickets, axis=1)
        results.append(group)

    combined = pd.concat(results, ignore_index=True)

    # Analyze outcomes based on recent wickets
    base_boundary = base_outcomes['four'] + base_outcomes['six']

    recent_wickets_stats = {}

    for wicket_count in [0, 1, 2, 3]:
        if wicket_count == 3:
            subset = combined[combined['recent_wickets'] >= 3]
            label = "3+"
        else:
            subset = combined[combined['recent_wickets'] == wicket_count]
            label = str(wicket_count)

        total = len(subset)
        if total < 1000:  # Need sufficient sample
            continue

        wickets = subset['wicket_kind'].notna().sum()
        non_wicket = subset[subset['wicket_kind'].isna()]
        boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()
        dots = (non_wicket['runs_batter'] == 0).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total
        dot_rate = dots / total

        recent_wickets_stats[label] = {
            'total_balls': total,
            'boundary_rate': boundary_rate,
            'wicket_rate': wicket_rate,
            'dot_rate': dot_rate,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
            'dot_mod': dot_rate / base_outcomes['dot'],
        }

        print(f"\n{label} wickets in last 3 overs:")
        print(f"  Balls: {total:,}")
        print(f"  Boundary mod: {recent_wickets_stats[label]['boundary_mod']:.3f}")
        print(f"  Wicket mod:   {recent_wickets_stats[label]['wicket_mod']:.3f}")
        print(f"  Dot mod:      {recent_wickets_stats[label]['dot_mod']:.3f}")

    return recent_wickets_stats


def compute_bowler_on_roll_impact(df: pd.DataFrame, base_outcomes: dict) -> dict:
    """
    Analyze impact when a bowler has taken wickets this innings.
    Psychological pressure on batsmen facing a bowler who's already got wickets.
    """
    print("\n" + "=" * 50)
    print("BOWLER ON A ROLL IMPACT ANALYSIS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    # bowler_wicket column should have bowler's wickets so far
    base_boundary = base_outcomes['four'] + base_outcomes['six']

    bowler_roll_stats = {}

    for wicket_count in [0, 1, 2, 3]:
        if wicket_count == 3:
            subset = valid[valid['bowler_wicket'] >= 3]
            label = "3+"
        else:
            subset = valid[valid['bowler_wicket'] == wicket_count]
            label = str(wicket_count)

        total = len(subset)
        if total < 1000:
            continue

        wickets = subset['wicket_kind'].notna().sum()
        non_wicket = subset[subset['wicket_kind'].isna()]
        boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()
        dots = (non_wicket['runs_batter'] == 0).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total
        dot_rate = dots / total

        bowler_roll_stats[label] = {
            'total_balls': total,
            'boundary_rate': boundary_rate,
            'wicket_rate': wicket_rate,
            'dot_rate': dot_rate,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
            'dot_mod': dot_rate / base_outcomes['dot'],
        }

        print(f"\nBowler has {label} wickets this innings:")
        print(f"  Balls: {total:,}")
        print(f"  Boundary mod: {bowler_roll_stats[label]['boundary_mod']:.3f}")
        print(f"  Wicket mod:   {bowler_roll_stats[label]['wicket_mod']:.3f}")
        print(f"  Dot mod:      {bowler_roll_stats[label]['dot_mod']:.3f}")

    return bowler_roll_stats


def compute_partnership_dynamics(df: pd.DataFrame, base_outcomes: dict) -> dict:
    """
    Analyze how batting changes as partnership builds.
    Key insight: established partnerships should be harder to break.
    """
    print("\n" + "=" * 50)
    print("PARTNERSHIP DYNAMICS ANALYSIS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    # We need to compute partnership runs at each ball
    # Partnership resets when a wicket falls
    results = []

    for (match_id, innings), group in valid.groupby(['match_id', 'innings']):
        group = group.sort_values(['over', 'ball']).copy()

        # Track partnership runs
        partnership_runs = 0
        partnership_list = []

        for idx, row in group.iterrows():
            partnership_list.append(partnership_runs)

            # Add runs from this ball
            if pd.isna(row['wicket_kind']):
                partnership_runs += row['runs_batter']
            else:
                # Wicket fell, reset partnership (after recording current state)
                partnership_runs = 0

        group['partnership_runs'] = partnership_list
        results.append(group)

    combined = pd.concat(results, ignore_index=True)

    # Analyze by partnership brackets
    base_boundary = base_outcomes['four'] + base_outcomes['six']

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
        subset = combined[(combined['partnership_runs'] >= low) & (combined['partnership_runs'] < high)]
        total = len(subset)

        if total < 500:
            continue

        wickets = subset['wicket_kind'].notna().sum()
        non_wicket = subset[subset['wicket_kind'].isna()]
        boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()
        dots = (non_wicket['runs_batter'] == 0).sum()
        singles = (non_wicket['runs_batter'] == 1).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total
        dot_rate = dots / total
        single_rate = singles / total

        # Calculate strike rate
        runs = non_wicket['runs_batter'].sum()
        sr = (runs / total) * 100 if total > 0 else 0

        partnership_stats[label] = {
            'total_balls': total,
            'boundary_rate': boundary_rate,
            'wicket_rate': wicket_rate,
            'dot_rate': dot_rate,
            'strike_rate': sr,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
            'dot_mod': dot_rate / base_outcomes['dot'],
        }

        print(f"\nPartnership {label} runs:")
        print(f"  Balls: {total:,}")
        print(f"  Strike rate: {sr:.1f}")
        print(f"  Boundary mod: {partnership_stats[label]['boundary_mod']:.3f}")
        print(f"  Wicket mod:   {partnership_stats[label]['wicket_mod']:.3f}")
        print(f"  Dot mod:      {partnership_stats[label]['dot_mod']:.3f}")

    return partnership_stats


def compute_spell_patterns(df: pd.DataFrame) -> dict:
    """
    Analyze bowling spell patterns - when do different bowler types bowl?
    Crucial for AI bowling selection.
    """
    print("\n" + "=" * 50)
    print("BOWLING SPELL PATTERNS ANALYSIS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    # We'll infer bowler type from their bowling patterns
    # Pace bowlers: typically bowl in PP and death
    # Spinners: typically bowl in middle overs

    # First, let's see distribution of bowlers by over
    over_distribution = valid.groupby('over').size()

    # Analyze when bowlers bowl their overs
    bowler_overs = valid.groupby(['match_id', 'innings', 'bowler', 'over']).size().reset_index()
    bowler_overs.columns = ['match_id', 'innings', 'bowler', 'over', 'balls']

    # Count how many times each bowler bowled in each phase
    def get_phase(over):
        if over <= 6:
            return 'powerplay'
        elif over <= 15:
            return 'middle'
        else:
            return 'death'

    bowler_overs['phase'] = bowler_overs['over'].apply(get_phase)

    # For each bowler in each match, count their overs by phase
    bowler_phase_counts = bowler_overs.groupby(['match_id', 'innings', 'bowler', 'phase']).size().unstack(fill_value=0)

    # Classify bowlers by their typical phase distribution
    # A bowler who bowls >60% in PP+death is likely pace
    # A bowler who bowls >50% in middle is likely spin

    bowler_profiles = bowler_phase_counts.reset_index()

    if 'powerplay' not in bowler_profiles.columns:
        bowler_profiles['powerplay'] = 0
    if 'middle' not in bowler_profiles.columns:
        bowler_profiles['middle'] = 0
    if 'death' not in bowler_profiles.columns:
        bowler_profiles['death'] = 0

    bowler_profiles['total'] = bowler_profiles['powerplay'] + bowler_profiles['middle'] + bowler_profiles['death']
    bowler_profiles['pp_death_pct'] = (bowler_profiles['powerplay'] + bowler_profiles['death']) / bowler_profiles['total']
    bowler_profiles['middle_pct'] = bowler_profiles['middle'] / bowler_profiles['total']

    # Aggregate by bowler across matches
    bowler_agg = bowler_profiles.groupby('bowler').agg({
        'powerplay': 'sum',
        'middle': 'sum',
        'death': 'sum',
        'total': 'sum'
    }).reset_index()

    bowler_agg['pp_pct'] = bowler_agg['powerplay'] / bowler_agg['total']
    bowler_agg['middle_pct'] = bowler_agg['middle'] / bowler_agg['total']
    bowler_agg['death_pct'] = bowler_agg['death'] / bowler_agg['total']

    # Filter to bowlers with significant overs
    significant_bowlers = bowler_agg[bowler_agg['total'] >= 20]

    # Classify
    pace_like = significant_bowlers[(significant_bowlers['pp_pct'] + significant_bowlers['death_pct']) > 0.55]
    spin_like = significant_bowlers[significant_bowlers['middle_pct'] > 0.45]

    print(f"\nBowlers analyzed: {len(significant_bowlers)}")
    print(f"  Pace-like pattern (PP+Death > 55%): {len(pace_like)}")
    print(f"  Spin-like pattern (Middle > 45%): {len(spin_like)}")

    # Overall phase distribution
    phase_dist = valid.groupby(valid['over'].apply(get_phase)).size()
    total_balls = len(valid)

    print(f"\nOverall phase distribution:")
    for phase in ['powerplay', 'middle', 'death']:
        count = phase_dist.get(phase, 0)
        print(f"  {phase}: {count:,} balls ({count/total_balls*100:.1f}%)")

    # Compute typical overs for "pace" vs "spin" bowlers
    spell_stats = {
        'phase_distribution': {
            'powerplay': phase_dist.get('powerplay', 0) / total_balls,
            'middle': phase_dist.get('middle', 0) / total_balls,
            'death': phase_dist.get('death', 0) / total_balls,
        },
        'pace_profile': {
            'powerplay': pace_like['pp_pct'].mean() if len(pace_like) > 0 else 0.35,
            'middle': pace_like['middle_pct'].mean() if len(pace_like) > 0 else 0.30,
            'death': pace_like['death_pct'].mean() if len(pace_like) > 0 else 0.35,
        },
        'spin_profile': {
            'powerplay': spin_like['pp_pct'].mean() if len(spin_like) > 0 else 0.15,
            'middle': spin_like['middle_pct'].mean() if len(spin_like) > 0 else 0.60,
            'death': spin_like['death_pct'].mean() if len(spin_like) > 0 else 0.25,
        }
    }

    print(f"\nTypical PACE bowler phase distribution:")
    print(f"  Powerplay: {spell_stats['pace_profile']['powerplay']*100:.1f}%")
    print(f"  Middle:    {spell_stats['pace_profile']['middle']*100:.1f}%")
    print(f"  Death:     {spell_stats['pace_profile']['death']*100:.1f}%")

    print(f"\nTypical SPIN bowler phase distribution:")
    print(f"  Powerplay: {spell_stats['spin_profile']['powerplay']*100:.1f}%")
    print(f"  Middle:    {spell_stats['spin_profile']['middle']*100:.1f}%")
    print(f"  Death:     {spell_stats['spin_profile']['death']*100:.1f}%")

    # Analyze consecutive overs
    print("\n--- Consecutive Overs Analysis ---")

    # For each bowler in each innings, find consecutive over streaks
    bowler_overs_sorted = bowler_overs.sort_values(['match_id', 'innings', 'bowler', 'over'])

    consecutive_streaks = []

    for (match_id, innings, bowler), group in bowler_overs_sorted.groupby(['match_id', 'innings', 'bowler']):
        overs = sorted(group['over'].unique())
        if len(overs) < 2:
            consecutive_streaks.append(1)
            continue

        # Find max consecutive
        max_consecutive = 1
        current_consecutive = 1

        for i in range(1, len(overs)):
            if overs[i] == overs[i-1] + 1:
                current_consecutive += 1
                max_consecutive = max(max_consecutive, current_consecutive)
            else:
                current_consecutive = 1

        consecutive_streaks.append(max_consecutive)

    streak_series = pd.Series(consecutive_streaks)

    print(f"\nConsecutive overs bowled:")
    print(f"  Mean max consecutive: {streak_series.mean():.2f}")
    print(f"  Most common max: {streak_series.mode().iloc[0] if len(streak_series.mode()) > 0 else 'N/A'}")
    print(f"  Distribution:")
    for i in range(1, 5):
        count = (streak_series == i).sum()
        print(f"    {i} consecutive: {count} ({count/len(streak_series)*100:.1f}%)")

    spell_stats['consecutive_overs'] = {
        'mean': streak_series.mean(),
        'mode': int(streak_series.mode().iloc[0]) if len(streak_series.mode()) > 0 else 2,
        'distribution': {i: (streak_series == i).sum() / len(streak_series) for i in range(1, 5)}
    }

    return spell_stats


def compute_wicket_clustering(df: pd.DataFrame) -> dict:
    """
    Analyze if wickets tend to come in clusters (collapses).
    Key for understanding and preventing unrealistic collapse patterns.
    """
    print("\n" + "=" * 50)
    print("WICKET CLUSTERING ANALYSIS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    # For each innings, compute balls between wickets
    results = []

    for (match_id, innings), group in valid.groupby(['match_id', 'innings']):
        group = group.sort_values(['over', 'ball']).copy()

        wicket_balls = group[group['wicket_kind'].notna()].index.tolist()

        if len(wicket_balls) < 2:
            continue

        # Get ball numbers (position in innings)
        group['ball_num'] = range(len(group))
        wicket_positions = group.loc[wicket_balls, 'ball_num'].tolist()

        # Calculate gaps between wickets
        for i in range(1, len(wicket_positions)):
            gap = wicket_positions[i] - wicket_positions[i-1]
            results.append({
                'gap': gap,
                'wicket_number': i + 1,  # This is the 2nd, 3rd, etc wicket
                'match_id': match_id,
                'innings': innings
            })

    gaps_df = pd.DataFrame(results)

    if len(gaps_df) == 0:
        print("Insufficient data for wicket clustering analysis")
        return {}

    # Analyze gap distribution
    print(f"\nTotal wicket gaps analyzed: {len(gaps_df):,}")
    print(f"\nBalls between wickets:")
    print(f"  Mean: {gaps_df['gap'].mean():.1f}")
    print(f"  Median: {gaps_df['gap'].median():.1f}")
    print(f"  Std Dev: {gaps_df['gap'].std():.1f}")

    # Clustering analysis: what % of wickets come within X balls of previous?
    print(f"\nWicket clustering (gap from previous wicket):")
    clustering_stats = {}

    for threshold in [6, 12, 18, 24, 30]:
        count = (gaps_df['gap'] <= threshold).sum()
        pct = count / len(gaps_df)
        print(f"  Within {threshold} balls: {pct*100:.1f}% ({count:,})")
        clustering_stats[f'within_{threshold}'] = pct

    # Expected vs actual clustering
    # If wickets were random (5.1% per ball), expected gap = ~20 balls
    expected_gap = 1 / 0.051
    print(f"\nExpected gap (if random): {expected_gap:.1f} balls")
    print(f"Actual mean gap: {gaps_df['gap'].mean():.1f} balls")

    clustering_ratio = expected_gap / gaps_df['gap'].mean()
    print(f"Clustering ratio: {clustering_ratio:.2f}x (>1 means wickets cluster)")

    # Analyze by wicket number (do later wickets cluster more?)
    print(f"\nMean gap by wicket number:")
    for wkt in range(2, 8):
        subset = gaps_df[gaps_df['wicket_number'] == wkt]
        if len(subset) >= 100:
            print(f"  Wicket {wkt}: {subset['gap'].mean():.1f} balls ({len(subset):,} samples)")

    # Collapse detection: 3+ wickets in 18 balls (3 overs)
    collapse_count = 0
    total_innings = 0

    for (match_id, innings), group in valid.groupby(['match_id', 'innings']):
        total_innings += 1
        group = group.sort_values(['over', 'ball']).copy()
        group['ball_num'] = range(len(group))

        wicket_positions = group[group['wicket_kind'].notna()]['ball_num'].tolist()

        # Check for 3 wickets within 18 balls
        for i in range(len(wicket_positions) - 2):
            if wicket_positions[i+2] - wicket_positions[i] <= 18:
                collapse_count += 1
                break  # Count each innings only once

    collapse_rate = collapse_count / total_innings if total_innings > 0 else 0
    print(f"\nCollapse rate (3+ wickets in 3 overs): {collapse_rate*100:.1f}% of innings")

    clustering_stats['mean_gap'] = gaps_df['gap'].mean()
    clustering_stats['median_gap'] = gaps_df['gap'].median()
    clustering_stats['clustering_ratio'] = clustering_ratio
    clustering_stats['collapse_rate'] = collapse_rate

    return clustering_stats


def compute_momentum_swings(df: pd.DataFrame, base_outcomes: dict) -> dict:
    """
    Analyze momentum - how does recent scoring affect upcoming balls?
    Do boundaries come in bursts? Does dot ball pressure build?
    """
    print("\n" + "=" * 50)
    print("MOMENTUM / SCORING BURSTS ANALYSIS")
    print("=" * 50)

    valid = df[df['valid_ball'] == True].copy()

    # Compute runs in last 6 balls for each delivery
    results = []

    for (match_id, innings), group in valid.groupby(['match_id', 'innings']):
        group = group.sort_values(['over', 'ball']).copy()
        group = group.reset_index(drop=True)

        # Calculate rolling sum of runs in last 6 balls
        group['recent_runs'] = group['runs_batter'].rolling(window=6, min_periods=1).sum().shift(1).fillna(0)

        # Calculate boundaries in last 6 balls
        group['is_boundary'] = ((group['runs_batter'] == 4) | (group['runs_batter'] == 6)).astype(int)
        group['recent_boundaries'] = group['is_boundary'].rolling(window=6, min_periods=1).sum().shift(1).fillna(0)

        # Calculate dots in last 6 balls
        group['is_dot'] = (group['runs_batter'] == 0).astype(int)
        group['recent_dots'] = group['is_dot'].rolling(window=6, min_periods=1).sum().shift(1).fillna(0)

        results.append(group)

    combined = pd.concat(results, ignore_index=True)

    base_boundary = base_outcomes['four'] + base_outcomes['six']

    # Analyze by recent runs (momentum)
    print("\n--- Momentum: Impact of Recent Runs ---")

    momentum_stats = {'by_recent_runs': {}, 'by_recent_boundaries': {}, 'by_recent_dots': {}}

    run_brackets = [(0, 3, "0-2"), (3, 8, "3-7"), (8, 15, "8-14"), (15, 25, "15-24"), (25, 100, "25+")]

    for low, high, label in run_brackets:
        subset = combined[(combined['recent_runs'] >= low) & (combined['recent_runs'] < high)]
        total = len(subset)

        if total < 1000:
            continue

        wickets = subset['wicket_kind'].notna().sum()
        non_wicket = subset[subset['wicket_kind'].isna()]
        boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total

        momentum_stats['by_recent_runs'][label] = {
            'total_balls': total,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
        }

        print(f"\n{label} runs in last over:")
        print(f"  Balls: {total:,}")
        print(f"  Boundary mod: {momentum_stats['by_recent_runs'][label]['boundary_mod']:.3f}")
        print(f"  Wicket mod:   {momentum_stats['by_recent_runs'][label]['wicket_mod']:.3f}")

    # Analyze by recent boundaries (boundary bursts)
    print("\n--- Boundary Bursts: Impact of Recent Boundaries ---")

    for boundary_count in [0, 1, 2, 3]:
        if boundary_count == 3:
            subset = combined[combined['recent_boundaries'] >= 3]
            label = "3+"
        else:
            subset = combined[combined['recent_boundaries'] == boundary_count]
            label = str(boundary_count)

        total = len(subset)
        if total < 1000:
            continue

        wickets = subset['wicket_kind'].notna().sum()
        non_wicket = subset[subset['wicket_kind'].isna()]
        boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total

        momentum_stats['by_recent_boundaries'][label] = {
            'total_balls': total,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
        }

        print(f"\n{label} boundaries in last over:")
        print(f"  Balls: {total:,}")
        print(f"  Boundary mod: {momentum_stats['by_recent_boundaries'][label]['boundary_mod']:.3f}")
        print(f"  Wicket mod:   {momentum_stats['by_recent_boundaries'][label]['wicket_mod']:.3f}")

    # Analyze dot ball pressure
    print("\n--- Dot Ball Pressure: Impact of Recent Dots ---")

    for dot_count in [0, 1, 2, 3, 4, 5]:
        if dot_count == 5:
            subset = combined[combined['recent_dots'] >= 5]
            label = "5+"
        else:
            subset = combined[combined['recent_dots'] == dot_count]
            label = str(dot_count)

        total = len(subset)
        if total < 1000:
            continue

        wickets = subset['wicket_kind'].notna().sum()
        non_wicket = subset[subset['wicket_kind'].isna()]
        boundaries = ((non_wicket['runs_batter'] == 4) | (non_wicket['runs_batter'] == 6)).sum()

        boundary_rate = boundaries / total
        wicket_rate = wickets / total

        momentum_stats['by_recent_dots'][label] = {
            'total_balls': total,
            'boundary_mod': boundary_rate / base_boundary,
            'wicket_mod': wicket_rate / base_outcomes['wicket'],
        }

        print(f"\n{label} dots in last over:")
        print(f"  Balls: {total:,}")
        print(f"  Boundary mod: {momentum_stats['by_recent_dots'][label]['boundary_mod']:.3f}")
        print(f"  Wicket mod:   {momentum_stats['by_recent_dots'][label]['wicket_mod']:.3f}")

    return momentum_stats


def generate_yaml_output(
    base_outcomes: dict,
    phase_stats: dict,
    batsman_stats: dict,
    dismissal_stats: dict,
    extras_stats: dict,
    rrr_stats: dict
) -> str:
    """Generate YAML-formatted output for probability_params.yaml."""

    output = []
    output.append("\n" + "=" * 50)
    output.append("SUGGESTED YAML VALUES")
    output.append("=" * 50)

    output.append("\n# Base outcomes (from IPL data):")
    output.append("base_outcomes:")
    for outcome, value in base_outcomes.items():
        output.append(f"  {outcome}: {value:.4f}")

    output.append("\n# Phase modifiers:")
    output.append("phase_modifiers:")
    for phase, stats in phase_stats.items():
        output.append(f"  {phase}:")
        output.append(f"    boundary_mod: {stats['boundary_mod']:.2f}")
        output.append(f"    wicket_mod: {stats['wicket_mod']:.2f}")
        output.append(f"    dot_mod: {stats['dot_mod']:.2f}")
        output.append(f"    run_rate_target: {stats['run_rate']:.1f}")

    output.append("\n# Batsman state modifiers:")
    output.append("batsman_state:")
    output.append("  thresholds:")
    output.append("    new: 6")
    output.append("    settling: 15")
    output.append("  modifiers:")
    for state, stats in batsman_stats.items():
        output.append(f"    {state}:")
        output.append(f"      boundary_mod: {stats['boundary_mod']:.2f}")
        output.append(f"      wicket_mod: {stats['wicket_mod']:.2f}")
        output.append(f"      dot_mod: {stats['dot_mod']:.2f}")
        output.append(f"      single_mod: {stats['single_mod']:.2f}")

    output.append("\n# Dismissal distribution:")
    output.append("dismissals:")
    output.append("  base:")
    for dismissal, value in dismissal_stats.items():
        if dismissal != 'other':
            output.append(f"    {dismissal}: {value:.2f}")

    output.append("\n# Extras:")
    output.append("extras:")
    output.append(f"  wide_chance: {extras_stats['wide_chance']:.4f}")
    output.append(f"  noball_chance: {extras_stats['noball_chance']:.4f}")

    return "\n".join(output)


def main():
    """Main analysis pipeline."""
    # Load data
    data_path = Path(__file__).parent / "data.csv"
    df = load_data(data_path)

    # Show basic info
    print(f"\nDataset info:")
    print(f"  Seasons: {df['season'].min()} - {df['season'].max()}")
    print(f"  Matches: {df['match_id'].nunique():,}")
    print(f"  Teams: {df['batting_team'].nunique()}")

    # Run original analyses
    base_outcomes = compute_base_outcomes(df)
    phase_stats = compute_phase_modifiers(df, base_outcomes)
    batsman_stats = compute_batsman_state_modifiers(df, base_outcomes)
    dismissal_stats = compute_dismissal_distributions(df)
    extras_stats = compute_extras(df)
    rrr_stats = compute_pressure_analysis(df, base_outcomes)

    # Run NEW analyses for realistic match flow
    print("\n" + "#" * 60)
    print("# NEW ANALYSES FOR MATCH REALISM")
    print("#" * 60)

    recent_wickets_stats = compute_recent_wickets_impact(df, base_outcomes)
    bowler_roll_stats = compute_bowler_on_roll_impact(df, base_outcomes)
    partnership_stats = compute_partnership_dynamics(df, base_outcomes)
    spell_stats = compute_spell_patterns(df)
    clustering_stats = compute_wicket_clustering(df)
    momentum_stats = compute_momentum_swings(df, base_outcomes)

    # Generate YAML output (original)
    yaml_output = generate_yaml_output(
        base_outcomes, phase_stats, batsman_stats,
        dismissal_stats, extras_stats, rrr_stats
    )
    print(yaml_output)

    # Generate NEW YAML suggestions
    print("\n" + "=" * 50)
    print("NEW SUGGESTED YAML VALUES (Data-Derived)")
    print("=" * 50)

    print("\n# Recent wickets impact (collapse prevention):")
    print("# These replace the hand-tuned values in pressure.recent_wickets")
    print("pressure:")
    print("  recent_wickets:")
    for label, stats in recent_wickets_stats.items():
        print(f"    {label}:")
        print(f"      boundary_mod: {stats['boundary_mod']:.3f}")
        print(f"      wicket_mod: {stats['wicket_mod']:.3f}")
        print(f"      dot_mod: {stats['dot_mod']:.3f}")

    print("\n  # Bowler on a roll:")
    print("  bowler_on_roll:")
    for label, stats in bowler_roll_stats.items():
        if label != "0":
            print(f"    {label}_wickets:")
            print(f"      boundary_mod: {stats['boundary_mod']:.3f}")
            print(f"      wicket_mod: {stats['wicket_mod']:.3f}")

    print("\n  # Partnership dynamics:")
    print("  partnership:")
    for label, stats in partnership_stats.items():
        print(f"    {label.replace('-', '_')}_runs:")
        print(f"      boundary_mod: {stats['boundary_mod']:.3f}")
        print(f"      wicket_mod: {stats['wicket_mod']:.3f}")
        print(f"      strike_rate: {stats['strike_rate']:.1f}")

    print("\n# Momentum modifiers:")
    print("momentum:")
    print("  by_recent_runs:  # Runs in last 6 balls")
    for label, stats in momentum_stats.get('by_recent_runs', {}).items():
        print(f"    {label.replace('-', '_')}:")
        print(f"      boundary_mod: {stats['boundary_mod']:.3f}")
        print(f"      wicket_mod: {stats['wicket_mod']:.3f}")

    print("\n  by_recent_boundaries:  # Boundaries in last 6 balls")
    for label, stats in momentum_stats.get('by_recent_boundaries', {}).items():
        print(f"    {label}:")
        print(f"      boundary_mod: {stats['boundary_mod']:.3f}")
        print(f"      wicket_mod: {stats['wicket_mod']:.3f}")

    print("\n  by_recent_dots:  # Dots in last 6 balls (pressure)")
    for label, stats in momentum_stats.get('by_recent_dots', {}).items():
        print(f"    {label}:")
        print(f"      boundary_mod: {stats['boundary_mod']:.3f}")
        print(f"      wicket_mod: {stats['wicket_mod']:.3f}")

    print("\n# Spell patterns (for AI bowler selection):")
    print("spell_patterns:")
    print("  pace_profile:")
    for phase, pct in spell_stats.get('pace_profile', {}).items():
        print(f"    {phase}: {pct:.3f}")
    print("  spin_profile:")
    for phase, pct in spell_stats.get('spin_profile', {}).items():
        print(f"    {phase}: {pct:.3f}")
    print("  consecutive_overs:")
    cons = spell_stats.get('consecutive_overs', {})
    print(f"    mean: {cons.get('mean', 2):.2f}")
    print(f"    mode: {cons.get('mode', 2)}")

    print("\n# Wicket clustering stats (for reference):")
    print("wicket_clustering:")
    print(f"  mean_gap: {clustering_stats.get('mean_gap', 20):.1f}")
    print(f"  median_gap: {clustering_stats.get('median_gap', 16):.1f}")
    print(f"  clustering_ratio: {clustering_stats.get('clustering_ratio', 1.0):.2f}")
    print(f"  collapse_rate: {clustering_stats.get('collapse_rate', 0.15):.3f}")

    print("\n" + "=" * 50)
    print("ANALYSIS COMPLETE")
    print("=" * 50)
    print("\nCopy the suggested YAML values above to update probability_params.yaml")


if __name__ == "__main__":
    main()
