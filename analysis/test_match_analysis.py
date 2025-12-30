"""
Test Match Analysis for Cricket Management Game
Analyzes 888 Test matches from Cricsheet to extract realistic probabilities for:
1. Overs played per match by venue/country (weather impact)
2. Pitch deterioration patterns (runs per over by day/innings)
3. Declaration timing patterns
4. Follow-on statistics
5. Match result distributions
"""

import json
import os
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import statistics

CRICSHEET_PATH = '/Users/suryagundavarapu/Developer/Projects/cricket_management/analysis/source_data/cricsheet'

@dataclass
class TestMatchData:
    match_id: str
    venue: str
    city: str
    country: str
    dates: List[str]
    days_played: int
    teams: List[str]
    outcome: Dict
    innings_data: List[Dict]  # [{team, overs, runs, wickets, declared}]
    total_overs: float
    follow_on: bool


def get_country_from_city(city: str) -> str:
    """Map city to country for grouping"""
    city_country_map = {
        # Australia
        'Adelaide': 'Australia', 'Brisbane': 'Australia', 'Melbourne': 'Australia',
        'Perth': 'Australia', 'Sydney': 'Australia', 'Hobart': 'Australia',
        # England
        'Birmingham': 'England', 'Leeds': 'England', 'London': 'England',
        'Manchester': 'England', 'Nottingham': 'England', 'Southampton': 'England',
        'Chester-le-Street': 'England', 'The Oval': 'England', "Lord's": 'England',
        # India
        'Mumbai': 'India', 'Kolkata': 'India', 'Chennai': 'India', 'Delhi': 'India',
        'Bangalore': 'India', 'Hyderabad': 'India', 'Ahmedabad': 'India',
        'Mohali': 'India', 'Nagpur': 'India', 'Pune': 'India', 'Rajkot': 'India',
        'Ranchi': 'India', 'Indore': 'India', 'Dharamsala': 'India', 'Visakhapatnam': 'India',
        'Bengaluru': 'India',
        # South Africa
        'Cape Town': 'South Africa', 'Johannesburg': 'South Africa',
        'Durban': 'South Africa', 'Centurion': 'South Africa', 'Port Elizabeth': 'South Africa',
        'Bloemfontein': 'South Africa', 'Gqeberha': 'South Africa',
        # New Zealand
        'Wellington': 'New Zealand', 'Auckland': 'New Zealand', 'Christchurch': 'New Zealand',
        'Hamilton': 'New Zealand', 'Napier': 'New Zealand', 'Dunedin': 'New Zealand',
        'Mount Maunganui': 'New Zealand', 'Basin Reserve': 'New Zealand',
        # Pakistan
        'Karachi': 'Pakistan', 'Lahore': 'Pakistan', 'Rawalpindi': 'Pakistan',
        'Faisalabad': 'Pakistan', 'Multan': 'Pakistan',
        # Sri Lanka
        'Colombo': 'Sri Lanka', 'Galle': 'Sri Lanka', 'Kandy': 'Sri Lanka',
        'Pallekele': 'Sri Lanka', 'Dambulla': 'Sri Lanka',
        # West Indies
        'Bridgetown': 'West Indies', 'Kingston': 'West Indies', 'Port of Spain': 'West Indies',
        'St George\'s': 'West Indies', 'North Sound': 'West Indies', 'Roseau': 'West Indies',
        "St John's": 'West Indies', 'Basseterre': 'West Indies', 'Gros Islet': 'West Indies',
        # Bangladesh
        'Dhaka': 'Bangladesh', 'Chittagong': 'Bangladesh', 'Mirpur': 'Bangladesh',
        'Sylhet': 'Bangladesh',
        # Zimbabwe
        'Harare': 'Zimbabwe', 'Bulawayo': 'Zimbabwe',
        # UAE (neutral venue)
        'Dubai': 'UAE', 'Abu Dhabi': 'UAE', 'Sharjah': 'UAE',
    }
    return city_country_map.get(city, 'Other')


def parse_overs(overs_str) -> float:
    """Convert overs string (e.g., '87.4') to float"""
    if isinstance(overs_str, (int, float)):
        return float(overs_str)
    try:
        return float(overs_str)
    except:
        return 0.0


def analyze_innings(innings_list: List) -> List[Dict]:
    """Extract innings data from match"""
    innings_data = []

    for innings in innings_list:
        team = innings.get('team', 'Unknown')
        overs_data = innings.get('overs', [])

        total_runs = 0
        total_wickets = 0
        total_overs = 0
        declared = False

        for over in overs_data:
            over_num = over.get('over', 0)
            deliveries = over.get('deliveries', [])

            for delivery in deliveries:
                runs = delivery.get('runs', {})
                total_runs += runs.get('total', 0)

                if 'wickets' in delivery:
                    total_wickets += len(delivery['wickets'])

            total_overs = over_num + 1

        # Check for declaration
        if innings.get('declared', False) or 'declared' in str(innings):
            declared = True

        innings_data.append({
            'team': team,
            'overs': total_overs,
            'runs': total_runs,
            'wickets': total_wickets,
            'declared': declared,
        })

    return innings_data


def load_test_matches() -> List[TestMatchData]:
    """Load all Test matches from Cricsheet"""
    matches = []

    files = os.listdir(CRICSHEET_PATH)
    json_files = [f for f in files if f.endswith('.json')]

    print(f"Scanning {len(json_files)} match files...")

    for filename in json_files:
        try:
            with open(os.path.join(CRICSHEET_PATH, filename)) as f:
                data = json.load(f)

            info = data.get('info', {})

            if info.get('match_type') != 'Test':
                continue

            # Skip women's matches for this analysis (different dynamics)
            if info.get('gender') != 'male':
                continue

            city = info.get('city', 'Unknown')
            dates = info.get('dates', [])
            teams = list(info.get('players', {}).keys())
            outcome = info.get('outcome', {})

            # Parse innings
            innings_list = data.get('innings', [])
            innings_data = analyze_innings(innings_list)

            # Calculate total overs
            total_overs = sum(inn['overs'] for inn in innings_data)

            # Check for follow-on (team batting 3rd is same as team batting 2nd)
            follow_on = False
            if len(innings_data) >= 3:
                if innings_data[1]['team'] == innings_data[2]['team']:
                    follow_on = True

            match = TestMatchData(
                match_id=filename.replace('.json', ''),
                venue=info.get('venue', 'Unknown'),
                city=city,
                country=get_country_from_city(city),
                dates=dates,
                days_played=len(dates),
                teams=teams,
                outcome=outcome,
                innings_data=innings_data,
                total_overs=total_overs,
                follow_on=follow_on,
            )

            matches.append(match)

        except Exception as e:
            # Skip problematic files
            continue

    print(f"Loaded {len(matches)} Test matches")
    return matches


def analyze_overs_by_country(matches: List[TestMatchData]) -> Dict:
    """Analyze average overs played per match by country"""
    overs_by_country = defaultdict(list)

    for match in matches:
        overs_by_country[match.country].append(match.total_overs)

    results = {}
    for country, overs_list in overs_by_country.items():
        if len(overs_list) >= 5:  # Only include countries with enough data
            results[country] = {
                'matches': len(overs_list),
                'avg_overs': round(statistics.mean(overs_list), 1),
                'median_overs': round(statistics.median(overs_list), 1),
                'min_overs': round(min(overs_list), 1),
                'max_overs': round(max(overs_list), 1),
                'std_dev': round(statistics.stdev(overs_list), 1) if len(overs_list) > 1 else 0,
            }

    return dict(sorted(results.items(), key=lambda x: x[1]['avg_overs'], reverse=True))


def analyze_match_duration(matches: List[TestMatchData]) -> Dict:
    """Analyze match duration (days played)"""
    duration_counts = defaultdict(int)
    duration_by_country = defaultdict(lambda: defaultdict(int))

    for match in matches:
        duration_counts[match.days_played] += 1
        duration_by_country[match.country][match.days_played] += 1

    total = sum(duration_counts.values())

    return {
        'overall': {
            days: {'count': count, 'percentage': round(count/total*100, 1)}
            for days, count in sorted(duration_counts.items())
        },
        'by_country': dict(duration_by_country),
    }


def analyze_results(matches: List[TestMatchData]) -> Dict:
    """Analyze match result types"""
    results = defaultdict(int)
    innings_victories = 0
    follow_on_enforced = 0
    follow_on_won = 0

    for match in matches:
        outcome = match.outcome

        if 'winner' in outcome:
            by = outcome.get('by', {})
            if 'innings' in by:
                results['innings_victory'] += 1
                innings_victories += 1
            elif 'wickets' in by:
                results['win_by_wickets'] += 1
            elif 'runs' in by:
                results['win_by_runs'] += 1
            else:
                results['other_win'] += 1
        elif outcome.get('result') == 'draw':
            results['draw'] += 1
        elif outcome.get('result') == 'tie':
            results['tie'] += 1
        elif outcome.get('result') == 'no result':
            results['no_result'] += 1
        else:
            results['other'] += 1

        if match.follow_on:
            follow_on_enforced += 1
            # Check if team enforcing follow-on won
            if 'winner' in outcome:
                # Team batting first enforced follow-on
                if len(match.innings_data) >= 2:
                    first_batting_team = match.innings_data[0]['team']
                    if outcome['winner'] == first_batting_team:
                        follow_on_won += 1

    total = len(matches)

    return {
        'result_distribution': {
            result: {'count': count, 'percentage': round(count/total*100, 1)}
            for result, count in sorted(results.items(), key=lambda x: -x[1])
        },
        'innings_victories': innings_victories,
        'innings_victory_rate': round(innings_victories/total*100, 1),
        'follow_on_stats': {
            'total_enforced': follow_on_enforced,
            'percentage': round(follow_on_enforced/total*100, 1),
            'won_after_enforcing': follow_on_won,
            'success_rate': round(follow_on_won/follow_on_enforced*100, 1) if follow_on_enforced > 0 else 0,
        }
    }


def analyze_declarations(matches: List[TestMatchData]) -> Dict:
    """Analyze declaration patterns"""
    declarations_by_innings = defaultdict(int)
    declaration_scores = defaultdict(list)
    declaration_leads = []

    for match in matches:
        for i, innings in enumerate(match.innings_data):
            if innings.get('declared', False) or innings['wickets'] < 10:
                # Likely a declaration if wickets < 10 and not all out
                # This is a heuristic - cricsheet doesn't always mark declarations
                if innings['wickets'] < 10:
                    innings_num = i + 1
                    declarations_by_innings[innings_num] += 1
                    declaration_scores[innings_num].append(innings['runs'])

                    # Calculate lead for 3rd innings declarations
                    if innings_num == 3 and len(match.innings_data) >= 2:
                        first_total = match.innings_data[0]['runs']
                        second_total = match.innings_data[1]['runs']
                        lead = innings['runs'] + first_total - second_total
                        declaration_leads.append(lead)

    results = {
        'by_innings': {},
        'avg_declaration_scores': {},
        'third_innings_leads': {},
    }

    for innings_num, count in declarations_by_innings.items():
        results['by_innings'][f'innings_{innings_num}'] = count
        if declaration_scores[innings_num]:
            results['avg_declaration_scores'][f'innings_{innings_num}'] = round(
                statistics.mean(declaration_scores[innings_num]), 1
            )

    if declaration_leads:
        results['third_innings_leads'] = {
            'avg_lead': round(statistics.mean(declaration_leads), 1),
            'median_lead': round(statistics.median(declaration_leads), 1),
            'min_lead': min(declaration_leads),
            'max_lead': max(declaration_leads),
        }

    return results


def analyze_innings_progression(matches: List[TestMatchData]) -> Dict:
    """Analyze run rates by innings number"""
    innings_stats = defaultdict(lambda: {'runs': [], 'overs': [], 'run_rates': []})

    for match in matches:
        for i, innings in enumerate(match.innings_data):
            innings_num = i + 1
            if innings['overs'] > 0:
                run_rate = innings['runs'] / innings['overs']
                innings_stats[innings_num]['runs'].append(innings['runs'])
                innings_stats[innings_num]['overs'].append(innings['overs'])
                innings_stats[innings_num]['run_rates'].append(run_rate)

    results = {}
    for innings_num, stats in innings_stats.items():
        if stats['runs']:
            results[f'innings_{innings_num}'] = {
                'avg_runs': round(statistics.mean(stats['runs']), 1),
                'avg_overs': round(statistics.mean(stats['overs']), 1),
                'avg_run_rate': round(statistics.mean(stats['run_rates']), 2),
                'sample_size': len(stats['runs']),
            }

    return results


def calculate_weather_impact_probability(matches: List[TestMatchData]) -> Dict:
    """Estimate weather impact probability by country"""
    # Max theoretical overs in 5-day Test: 450 (90 overs/day * 5 days)
    MAX_OVERS = 450

    weather_impact = {}

    overs_by_country = defaultdict(list)
    for match in matches:
        overs_by_country[match.country].append(match.total_overs)

    for country, overs_list in overs_by_country.items():
        if len(overs_list) >= 10:
            avg_overs = statistics.mean(overs_list)

            # Calculate what percentage of max overs were played
            overs_completion_rate = avg_overs / MAX_OVERS

            # Estimate weather loss probability
            # If avg is 350 overs, that's ~78% completion, so ~22% lost to weather/early finish
            # But we need to account for early finishes (decisive results)

            # Count matches that went less than 3 days (likely weather/early finish)
            short_matches = sum(1 for m in matches if m.country == country and m.days_played < 4)
            short_match_rate = short_matches / len(overs_list)

            weather_impact[country] = {
                'matches': len(overs_list),
                'avg_overs_played': round(avg_overs, 1),
                'completion_rate': round(overs_completion_rate * 100, 1),
                'short_match_rate': round(short_match_rate * 100, 1),
                # Estimated daily weather loss (as percentage)
                'est_daily_weather_loss': round(max(0, (1 - overs_completion_rate) * 20), 1),
            }

    return dict(sorted(weather_impact.items(), key=lambda x: x[1]['avg_overs_played']))


def generate_game_parameters(matches: List[TestMatchData]) -> Dict:
    """Generate parameters for the game engine based on analysis"""

    weather_data = calculate_weather_impact_probability(matches)
    results_data = analyze_results(matches)
    innings_data = analyze_innings_progression(matches)

    # Weather probabilities by country type
    weather_params = {}
    for country, data in weather_data.items():
        # Higher completion rate = less weather interference
        rain_prob = max(5, min(40, 100 - data['completion_rate']))
        weather_params[country] = {
            'rain_probability': round(rain_prob),
            'avg_overs_lost_if_rain': round(15 + rain_prob * 0.5),  # 15-35 overs
        }

    # Run rate by innings (for pitch deterioration modeling)
    pitch_params = {}
    for innings_key, data in innings_data.items():
        innings_num = int(innings_key.split('_')[1])
        # First innings is baseline, subsequent innings show deterioration
        baseline_rr = innings_data.get('innings_1', {}).get('avg_run_rate', 3.0)
        current_rr = data['avg_run_rate']
        deterioration = (baseline_rr - current_rr) / baseline_rr if baseline_rr > 0 else 0

        pitch_params[innings_key] = {
            'run_rate': data['avg_run_rate'],
            'batting_difficulty_increase': round(deterioration * 100, 1),
        }

    return {
        'weather_by_country': weather_params,
        'pitch_deterioration': pitch_params,
        'follow_on': {
            'threshold_runs': 200,
            'historical_enforcement_rate': results_data['follow_on_stats']['percentage'],
            'historical_success_rate': results_data['follow_on_stats']['success_rate'],
        },
        'result_probabilities': {
            'draw_rate': results_data['result_distribution'].get('draw', {}).get('percentage', 20),
            'innings_victory_rate': results_data['innings_victory_rate'],
        }
    }


def main():
    print("=" * 60)
    print("TEST MATCH ANALYSIS FOR CRICKET MANAGEMENT GAME")
    print("=" * 60)
    print()

    # Load matches
    matches = load_test_matches()

    if not matches:
        print("No Test matches found!")
        return

    print()
    print("=" * 60)
    print("1. OVERS PLAYED BY COUNTRY")
    print("=" * 60)
    overs_data = analyze_overs_by_country(matches)
    for country, stats in overs_data.items():
        print(f"\n{country}:")
        print(f"  Matches: {stats['matches']}")
        print(f"  Avg Overs: {stats['avg_overs']} (median: {stats['median_overs']})")
        print(f"  Range: {stats['min_overs']} - {stats['max_overs']}")

    print()
    print("=" * 60)
    print("2. MATCH DURATION (DAYS)")
    print("=" * 60)
    duration_data = analyze_match_duration(matches)
    for days, stats in duration_data['overall'].items():
        print(f"  {days} days: {stats['count']} matches ({stats['percentage']}%)")

    print()
    print("=" * 60)
    print("3. RESULT DISTRIBUTION")
    print("=" * 60)
    results_data = analyze_results(matches)
    for result, stats in results_data['result_distribution'].items():
        print(f"  {result}: {stats['count']} ({stats['percentage']}%)")
    print(f"\n  Follow-on enforced: {results_data['follow_on_stats']['total_enforced']} times")
    print(f"  Follow-on success rate: {results_data['follow_on_stats']['success_rate']}%")

    print()
    print("=" * 60)
    print("4. INNINGS PROGRESSION (Run Rates)")
    print("=" * 60)
    innings_data = analyze_innings_progression(matches)
    for innings, stats in innings_data.items():
        print(f"  {innings}: RR {stats['avg_run_rate']}, Avg {stats['avg_runs']} runs in {stats['avg_overs']} overs")

    print()
    print("=" * 60)
    print("5. WEATHER IMPACT PROBABILITY")
    print("=" * 60)
    weather_data = calculate_weather_impact_probability(matches)
    for country, stats in weather_data.items():
        print(f"\n{country}:")
        print(f"  Avg Overs: {stats['avg_overs_played']} ({stats['completion_rate']}% of max)")
        print(f"  Short matches (<4 days): {stats['short_match_rate']}%")

    print()
    print("=" * 60)
    print("6. GAME ENGINE PARAMETERS")
    print("=" * 60)
    game_params = generate_game_parameters(matches)
    print("\nWeather Parameters:")
    for country, params in game_params['weather_by_country'].items():
        print(f"  {country}: Rain prob {params['rain_probability']}%, Overs lost {params['avg_overs_lost_if_rain']}")

    print("\nPitch Deterioration:")
    for innings, params in game_params['pitch_deterioration'].items():
        print(f"  {innings}: RR {params['run_rate']}, Difficulty +{params['batting_difficulty_increase']}%")

    print("\nFollow-on Parameters:")
    print(f"  Threshold: {game_params['follow_on']['threshold_runs']} runs")
    print(f"  Historical enforcement: {game_params['follow_on']['historical_enforcement_rate']}%")
    print(f"  Historical success: {game_params['follow_on']['historical_success_rate']}%")

    # Save parameters to JSON for game engine
    output_path = '/Users/suryagundavarapu/Developer/Projects/cricket_management/analysis/test_match_params.json'
    with open(output_path, 'w') as f:
        json.dump(game_params, f, indent=2)
    print(f"\n\nGame parameters saved to: {output_path}")


if __name__ == '__main__':
    main()
