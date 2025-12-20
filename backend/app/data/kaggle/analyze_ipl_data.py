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

    # Run analyses
    base_outcomes = compute_base_outcomes(df)
    phase_stats = compute_phase_modifiers(df, base_outcomes)
    batsman_stats = compute_batsman_state_modifiers(df, base_outcomes)
    dismissal_stats = compute_dismissal_distributions(df)
    extras_stats = compute_extras(df)
    rrr_stats = compute_pressure_analysis(df, base_outcomes)

    # Generate YAML output
    yaml_output = generate_yaml_output(
        base_outcomes, phase_stats, batsman_stats,
        dismissal_stats, extras_stats, rrr_stats
    )
    print(yaml_output)

    print("\n" + "=" * 50)
    print("ANALYSIS COMPLETE")
    print("=" * 50)
    print("\nCopy the suggested YAML values above to update probability_params.yaml")


if __name__ == "__main__":
    main()
