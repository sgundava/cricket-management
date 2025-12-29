#!/usr/bin/env python3
"""
Test Cricket Analysis Script

Analyzes 888 Test matches from Cricsheet data to extract:
1. Outcome probabilities (dots, singles, boundaries, wickets)
2. Innings-specific patterns (1st vs 2nd vs 3rd vs 4th)
3. Phase analysis (opening, middle, late)
4. Dismissal type breakdown
5. Run rate patterns

Usage:
    python analyze_test_cricket.py
"""

import os
import yaml
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Any
import json

# Path to Test cricket data
DATA_DIR = Path(__file__).parent.parent / "app" / "data" / "kaggle" / "cricsheet" / "tests"


def load_match(filepath: Path) -> Dict[str, Any]:
    """Load a single match YAML file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def analyze_delivery(delivery: Dict[str, Any]) -> Dict[str, Any]:
    """Extract outcome details from a delivery."""
    runs_data = delivery.get('runs', {})
    batsman_runs = runs_data.get('batsman', 0)
    extras = runs_data.get('extras', 0)
    total_runs = runs_data.get('total', 0)

    wicket = delivery.get('wicket')
    extras_detail = delivery.get('extras', {})

    result = {
        'batsman_runs': batsman_runs,
        'extras': extras,
        'total': total_runs,
        'is_wicket': wicket is not None,
        'dismissal_kind': wicket.get('kind') if wicket else None,
        'is_wide': 'wides' in extras_detail,
        'is_noball': 'noballs' in extras_detail,
        'is_bye': 'byes' in extras_detail,
        'is_legbye': 'legbyes' in extras_detail,
        'is_boundary': batsman_runs == 4 or batsman_runs == 6,
        'is_four': batsman_runs == 4,
        'is_six': batsman_runs == 6,
        'is_dot': batsman_runs == 0 and not extras_detail and wicket is None,
    }

    return result


def get_over_number(ball_id: str) -> float:
    """Extract over number from ball ID like '0.1' -> 0."""
    try:
        return float(ball_id)
    except:
        return 0.0


def analyze_matches():
    """Analyze all Test matches and aggregate statistics."""

    # Overall stats
    stats = {
        'total_deliveries': 0,
        'total_matches': 0,
        'outcomes': defaultdict(int),
        'dismissals': defaultdict(int),
        'runs_distribution': defaultdict(int),

        # By innings (1-4)
        'by_innings': {i: {
            'deliveries': 0,
            'runs': 0,
            'wickets': 0,
            'boundaries': 0,
            'dots': 0,
        } for i in range(1, 5)},

        # By phase (opening: 0-30 overs, middle: 30-80, late: 80+)
        'by_phase': {
            'opening': {'deliveries': 0, 'runs': 0, 'wickets': 0, 'boundaries': 0, 'dots': 0},
            'middle': {'deliveries': 0, 'runs': 0, 'wickets': 0, 'boundaries': 0, 'dots': 0},
            'late': {'deliveries': 0, 'runs': 0, 'wickets': 0, 'boundaries': 0, 'dots': 0},
        },

        # Day analysis (if we can infer from overs)
        'batting_first_wins': 0,
        'batting_second_wins': 0,
        'draws': 0,
    }

    yaml_files = list(DATA_DIR.glob("*.yaml"))
    print(f"Found {len(yaml_files)} Test match files")

    for i, filepath in enumerate(yaml_files):
        if i % 100 == 0:
            print(f"Processing match {i+1}/{len(yaml_files)}...")

        try:
            match = load_match(filepath)
            stats['total_matches'] += 1

            # Track outcome
            outcome = match.get('info', {}).get('outcome', {})
            if 'winner' in outcome:
                toss = match.get('info', {}).get('toss', {})
                toss_winner = toss.get('winner')
                toss_decision = toss.get('decision')
                match_winner = outcome.get('winner')

                # Determine if batting first team won
                batting_first = toss_winner if toss_decision == 'bat' else (
                    match.get('info', {}).get('teams', ['', ''])[0]
                    if toss_winner == match.get('info', {}).get('teams', ['', ''])[1]
                    else match.get('info', {}).get('teams', ['', ''])[1]
                )

                if match_winner == batting_first:
                    stats['batting_first_wins'] += 1
                else:
                    stats['batting_second_wins'] += 1
            elif 'result' in outcome and outcome['result'] in ['draw', 'no result']:
                stats['draws'] += 1

            # Process innings
            for innings_data in match.get('innings', []):
                for innings_label, innings in innings_data.items():
                    # Determine innings number (1-4)
                    if '1st' in innings_label:
                        innings_num = 1
                    elif '2nd' in innings_label:
                        innings_num = 2
                    elif '3rd' in innings_label:
                        innings_num = 3
                    elif '4th' in innings_label:
                        innings_num = 4
                    else:
                        continue

                    deliveries = innings.get('deliveries', [])

                    for delivery_item in deliveries:
                        for ball_id, delivery in delivery_item.items():
                            stats['total_deliveries'] += 1

                            result = analyze_delivery(delivery)
                            over_num = int(get_over_number(ball_id))

                            # Update overall outcomes
                            batsman_runs = result['batsman_runs']
                            stats['runs_distribution'][batsman_runs] += 1

                            if result['is_wicket']:
                                stats['outcomes']['wicket'] += 1
                                stats['dismissals'][result['dismissal_kind']] += 1
                            elif result['is_wide'] or result['is_noball']:
                                stats['outcomes']['extra'] += 1
                            elif batsman_runs == 0:
                                stats['outcomes']['dot'] += 1
                            elif batsman_runs == 1:
                                stats['outcomes']['single'] += 1
                            elif batsman_runs == 2:
                                stats['outcomes']['double'] += 1
                            elif batsman_runs == 3:
                                stats['outcomes']['triple'] += 1
                            elif batsman_runs == 4:
                                stats['outcomes']['four'] += 1
                            elif batsman_runs == 6:
                                stats['outcomes']['six'] += 1

                            # Update innings stats
                            innings_stats = stats['by_innings'][innings_num]
                            innings_stats['deliveries'] += 1
                            innings_stats['runs'] += result['total']
                            if result['is_wicket']:
                                innings_stats['wickets'] += 1
                            if result['is_boundary']:
                                innings_stats['boundaries'] += 1
                            if result['is_dot']:
                                innings_stats['dots'] += 1

                            # Update phase stats
                            if over_num < 30:
                                phase = 'opening'
                            elif over_num < 80:
                                phase = 'middle'
                            else:
                                phase = 'late'

                            phase_stats = stats['by_phase'][phase]
                            phase_stats['deliveries'] += 1
                            phase_stats['runs'] += result['total']
                            if result['is_wicket']:
                                phase_stats['wickets'] += 1
                            if result['is_boundary']:
                                phase_stats['boundaries'] += 1
                            if result['is_dot']:
                                phase_stats['dots'] += 1

        except Exception as e:
            print(f"Error processing {filepath}: {e}")
            continue

    return stats


def calculate_probabilities(stats: Dict) -> Dict:
    """Calculate probabilities from raw stats."""
    total = stats['total_deliveries']

    probs = {
        'sample_size': {
            'total_deliveries': total,
            'total_matches': stats['total_matches'],
        },

        'overall': {
            'dot': stats['outcomes']['dot'] / total if total else 0,
            'single': stats['outcomes']['single'] / total if total else 0,
            'double': stats['outcomes']['double'] / total if total else 0,
            'triple': stats['outcomes']['triple'] / total if total else 0,
            'four': stats['outcomes']['four'] / total if total else 0,
            'six': stats['outcomes']['six'] / total if total else 0,
            'wicket': stats['outcomes']['wicket'] / total if total else 0,
            'extra': stats['outcomes']['extra'] / total if total else 0,
        },

        'dismissal_breakdown': {},
        'by_innings': {},
        'by_phase': {},

        'match_outcomes': {
            'batting_first_wins': stats['batting_first_wins'],
            'batting_second_wins': stats['batting_second_wins'],
            'draws': stats['draws'],
        }
    }

    # Dismissal breakdown
    total_wickets = stats['outcomes']['wicket']
    for kind, count in stats['dismissals'].items():
        probs['dismissal_breakdown'][kind] = count / total_wickets if total_wickets else 0

    # By innings
    for innings_num, innings_stats in stats['by_innings'].items():
        d = innings_stats['deliveries']
        if d > 0:
            probs['by_innings'][f'innings_{innings_num}'] = {
                'deliveries': d,
                'run_rate': innings_stats['runs'] / d * 6 if d else 0,
                'wicket_rate': innings_stats['wickets'] / d if d else 0,
                'boundary_rate': innings_stats['boundaries'] / d if d else 0,
                'dot_rate': innings_stats['dots'] / d if d else 0,
                'avg_runs_per_innings': innings_stats['runs'] / (stats['total_matches'] if innings_num <= 2 else stats['total_matches'] * 0.7),
            }

    # By phase
    for phase, phase_stats in stats['by_phase'].items():
        d = phase_stats['deliveries']
        if d > 0:
            probs['by_phase'][phase] = {
                'deliveries': d,
                'run_rate': phase_stats['runs'] / d * 6 if d else 0,
                'wicket_rate': phase_stats['wickets'] / d if d else 0,
                'boundary_rate': phase_stats['boundaries'] / d if d else 0,
                'dot_rate': phase_stats['dots'] / d if d else 0,
            }

    return probs


def print_report(probs: Dict):
    """Print a formatted report of the analysis."""
    print("\n" + "="*60)
    print("TEST CRICKET ANALYSIS REPORT")
    print("="*60)

    print(f"\n📊 SAMPLE SIZE")
    print(f"   Matches analyzed: {probs['sample_size']['total_matches']}")
    print(f"   Total deliveries: {probs['sample_size']['total_deliveries']:,}")

    print(f"\n🎯 OVERALL PROBABILITIES")
    print(f"   {'Outcome':<12} {'Probability':>12} {'Per 100 balls':>15}")
    print(f"   {'-'*40}")
    for outcome in ['dot', 'single', 'double', 'triple', 'four', 'six', 'wicket', 'extra']:
        prob = probs['overall'].get(outcome, 0)
        print(f"   {outcome.capitalize():<12} {prob*100:>11.2f}% {prob*100:>14.1f}")

    print(f"\n⚡ COMPARISON WITH CURRENT CONFIG")
    print(f"   Current Test config: dot=45%, four=7.5%, six=1.5%, wicket=3.7%")
    print(f"   Actual data:         dot={probs['overall']['dot']*100:.1f}%, "
          f"four={probs['overall']['four']*100:.1f}%, "
          f"six={probs['overall']['six']*100:.1f}%, "
          f"wicket={probs['overall']['wicket']*100:.1f}%")

    print(f"\n📈 BY INNINGS")
    for innings_key in sorted(probs['by_innings'].keys()):
        innings = probs['by_innings'][innings_key]
        print(f"\n   {innings_key.replace('_', ' ').title()}")
        print(f"   Deliveries: {innings['deliveries']:,}")
        print(f"   Run Rate: {innings['run_rate']:.2f}")
        print(f"   Wicket Rate: {innings['wicket_rate']*100:.2f}%")
        print(f"   Boundary Rate: {innings['boundary_rate']*100:.2f}%")
        print(f"   Dot Ball Rate: {innings['dot_rate']*100:.2f}%")

    print(f"\n🏟️ BY PHASE")
    for phase in ['opening', 'middle', 'late']:
        if phase in probs['by_phase']:
            p = probs['by_phase'][phase]
            print(f"\n   {phase.title()} Phase (overs {0 if phase=='opening' else 30 if phase=='middle' else 80}+)")
            print(f"   Deliveries: {p['deliveries']:,}")
            print(f"   Run Rate: {p['run_rate']:.2f}")
            print(f"   Wicket Rate: {p['wicket_rate']*100:.2f}%")
            print(f"   Boundary Rate: {p['boundary_rate']*100:.2f}%")

    print(f"\n🏏 DISMISSAL TYPES")
    sorted_dismissals = sorted(probs['dismissal_breakdown'].items(), key=lambda x: -x[1])
    for kind, rate in sorted_dismissals[:8]:
        print(f"   {kind or 'unknown':<15} {rate*100:>6.1f}%")

    print(f"\n🏆 MATCH OUTCOMES")
    total_matches = probs['match_outcomes']['batting_first_wins'] + \
                    probs['match_outcomes']['batting_second_wins'] + \
                    probs['match_outcomes']['draws']
    if total_matches > 0:
        print(f"   Batting first wins: {probs['match_outcomes']['batting_first_wins']} "
              f"({probs['match_outcomes']['batting_first_wins']/total_matches*100:.1f}%)")
        print(f"   Batting second wins: {probs['match_outcomes']['batting_second_wins']} "
              f"({probs['match_outcomes']['batting_second_wins']/total_matches*100:.1f}%)")
        print(f"   Draws: {probs['match_outcomes']['draws']} "
              f"({probs['match_outcomes']['draws']/total_matches*100:.1f}%)")

    print("\n" + "="*60)


def main():
    """Main entry point."""
    print("🏏 Starting Test Cricket Analysis...")
    print(f"📂 Data directory: {DATA_DIR}")

    if not DATA_DIR.exists():
        print(f"❌ Data directory not found: {DATA_DIR}")
        return

    # Analyze matches
    stats = analyze_matches()

    # Calculate probabilities
    probs = calculate_probabilities(stats)

    # Print report
    print_report(probs)

    # Save results to JSON
    output_path = Path(__file__).parent / "test_cricket_analysis_results.json"
    with open(output_path, 'w') as f:
        json.dump(probs, f, indent=2)
    print(f"\n💾 Results saved to: {output_path}")

    # Print recommended config values
    print("\n📝 RECOMMENDED CONFIG VALUES FOR matchEngine.ts:")
    print("```typescript")
    print("test: {")
    print(f"  dot: {probs['overall']['dot']:.3f},")
    print(f"  single: {probs['overall']['single']:.3f},")
    print(f"  two: {probs['overall']['double']:.3f},")
    print(f"  three: {probs['overall']['triple']:.3f},")
    print(f"  four: {probs['overall']['four']:.3f},")
    print(f"  six: {probs['overall']['six']:.3f},")
    print(f"  wicket: {probs['overall']['wicket']:.3f},")
    print("}")
    print("```")


if __name__ == "__main__":
    main()
