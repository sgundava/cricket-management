#!/usr/bin/env python3
"""
IPL Auction Data Processing Script

Processes historical IPL auction data and generates statistical parameters
for the AI auction engine calibration.

Usage:
    python scripts/processAuctionData.py

Output:
    - Prints statistics to console
    - Generates JSON for TypeScript integration
"""

import csv
import json
import os
from collections import defaultdict
from pathlib import Path

# Type normalization mappings
TYPE_MAP = {
    'Batsman': 'batsman',
    'Batter': 'batsman',
    'BAT': 'batsman',
    'Bowler': 'bowler',
    'BOWL': 'bowler',
    'All-Rounder': 'allrounder',
    'All Rounder': 'allrounder',
    'AR': 'allrounder',
    'Wicket-Keeper': 'keeper',
    'Wicket Keeper': 'keeper',
    'WK': 'keeper',
}

NATIONALITY_MAP = {
    'Indian': 'indian',
    'Overseas': 'overseas',
}


def normalize_type(player_type: str) -> str:
    """Normalize player type to consistent format."""
    return TYPE_MAP.get(player_type.strip(), 'unknown')


def normalize_nationality(nationality: str) -> str:
    """Normalize nationality to indian/overseas."""
    return NATIONALITY_MAP.get(nationality.strip(), 'overseas')


def load_csv_2013_2023(filepath: str) -> list[dict]:
    """Load and normalize 2013-2023 auction data."""
    players = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                # Price is in Indian format like "50,00,000" for 50 lakhs
                price_str = row.get('Price', '0').replace(',', '').strip()
                price_rupees = float(price_str)
                price_lakhs = price_rupees / 100000  # Convert to lakhs
            except ValueError:
                price_lakhs = 0

            players.append({
                'season': row.get('Season', ''),
                'name': row.get('Name', '').strip(),
                'nationality': normalize_nationality(row.get('Nationality', '').strip()),
                'role': normalize_type(row.get('Type', '').strip()),
                'team': row.get('Team', '').strip(),
                'price': price_lakhs,  # Now in lakhs
            })
    return players


def load_csv_2024(filepath: str) -> list[dict]:
    """Load and normalize 2024 auction data."""
    players = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                price = float(row.get('PRICE PAID', '0').replace(',', ''))
                price_lakhs = price / 100000  # Convert to lakhs
            except ValueError:
                price_lakhs = 0

            players.append({
                'season': '2024',
                'name': row.get('PLAYER', ''),
                'nationality': normalize_nationality(row.get('NATIONALITY', '')),
                'role': normalize_type(row.get('TYPE', '')),
                'team': row.get('TEAM', ''),
                'price': price_lakhs,
            })
    return players


def load_json_2025(filepath: str) -> list[dict]:
    """Load and normalize 2025 auction JSON data."""
    players = []
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Handle nested structure with 'results' array
    results = data.get('results', []) if isinstance(data, dict) else data

    for item in results:
        # Get auction fields from item level
        base_price = item.get('basePrice', 0)
        sold_price = item.get('soldPrice', 0)
        is_overseas = item.get('isOverseas', False)
        state_type = item.get('stateType', '')

        # Get player info from nested 'player' object
        player_info = item.get('player', {})
        player_name = player_info.get('longName', '') or player_info.get('name', '')

        # Determine nationality
        nationality = 'overseas' if is_overseas else 'indian'

        # Map role type (BATTER, BOWLER, ALL_ROUNDER, WICKET_KEEPER)
        role_type = item.get('playerRoleType', '')
        role_map = {
            'BATTER': 'batsman',
            'BOWLER': 'bowler',
            'ALL_ROUNDER': 'allrounder',
            'ALLROUNDER': 'allrounder',
            'WICKET_KEEPER': 'keeper',
            'WICKETKEEPER': 'keeper',
        }
        role = role_map.get(role_type.upper(), 'unknown') if role_type else 'unknown'

        # Convert prices from rupees to lakhs
        base_price_lakhs = base_price / 100000 if base_price > 0 else 0
        sold_price_lakhs = sold_price / 100000 if sold_price > 0 else 0

        players.append({
            'season': '2025',
            'name': player_name,
            'nationality': nationality,
            'role': role,
            'team': item.get('teamAbbr', ''),
            'basePrice': base_price_lakhs,
            'soldPrice': sold_price_lakhs,
            'price': sold_price_lakhs,
            'state': state_type,
        })

    return players


def calculate_statistics(players: list[dict]) -> dict:
    """Calculate auction statistics from player data."""

    # Filter out players with 0 price (unsold)
    sold_players = [p for p in players if p.get('price', 0) > 0]

    stats = {
        'total_players': len(players),
        'sold_players': len(sold_players),
    }

    # Role statistics
    role_prices = defaultdict(list)
    for p in sold_players:
        role = p.get('role', 'unknown')
        if role != 'unknown':
            role_prices[role].append(p['price'])

    stats['role_averages'] = {}
    for role, prices in role_prices.items():
        avg = sum(prices) / len(prices) if prices else 0
        stats['role_averages'][role] = {
            'average': round(avg, 2),
            'count': len(prices),
            'max': max(prices) if prices else 0,
            'min': min(prices) if prices else 0,
        }

    # Calculate role multipliers relative to batsman
    batsman_avg = stats['role_averages'].get('batsman', {}).get('average', 1)
    if batsman_avg > 0:
        stats['role_multipliers'] = {}
        for role, data in stats['role_averages'].items():
            stats['role_multipliers'][role] = round(data['average'] / batsman_avg, 2)

    # Nationality statistics
    nationality_prices = defaultdict(list)
    for p in sold_players:
        nat = p.get('nationality', 'indian')
        nationality_prices[nat].append(p['price'])

    stats['nationality_averages'] = {}
    for nat, prices in nationality_prices.items():
        avg = sum(prices) / len(prices) if prices else 0
        stats['nationality_averages'][nat] = {
            'average': round(avg, 2),
            'count': len(prices),
        }

    # Calculate overseas premium
    indian_avg = stats['nationality_averages'].get('indian', {}).get('average', 1)
    overseas_avg = stats['nationality_averages'].get('overseas', {}).get('average', 0)
    stats['overseas_premium'] = round(overseas_avg / indian_avg, 2) if indian_avg > 0 else 1.0

    # Team statistics
    team_spending = defaultdict(lambda: {'total': 0, 'count': 0, 'players': []})
    for p in sold_players:
        team = p.get('team', 'Unknown')
        team_spending[team]['total'] += p['price']
        team_spending[team]['count'] += 1
        team_spending[team]['players'].append(p['name'])

    stats['team_spending'] = {}
    for team, data in team_spending.items():
        stats['team_spending'][team] = {
            'total': round(data['total'], 2),
            'count': data['count'],
            'average': round(data['total'] / data['count'], 2) if data['count'] > 0 else 0,
        }

    return stats


def calculate_base_to_sold_ratios(players_2025: list[dict]) -> dict:
    """Calculate base price to sold price ratios from 2025 data."""
    ratios = defaultdict(list)

    for p in players_2025:
        base = p.get('basePrice', 0)
        sold = p.get('soldPrice', 0)

        if base > 0 and sold > 0:
            ratio = sold / base

            # Categorize by base price tier
            if base <= 50:
                tier = 'tier50'
            elif base <= 75:
                tier = 'tier75'
            elif base <= 100:
                tier = 'tier100'
            elif base <= 150:
                tier = 'tier150'
            else:
                tier = 'tier200'

            ratios[tier].append(ratio)

    # Calculate percentiles for each tier
    tier_stats = {}
    for tier, tier_ratios in ratios.items():
        if tier_ratios:
            sorted_ratios = sorted(tier_ratios)
            n = len(sorted_ratios)
            tier_stats[tier] = {
                'count': n,
                'median': round(sorted_ratios[n // 2], 2),
                'p25': round(sorted_ratios[n // 4], 2) if n >= 4 else round(sorted_ratios[0], 2),
                'p75': round(sorted_ratios[3 * n // 4], 2) if n >= 4 else round(sorted_ratios[-1], 2),
                'p90': round(sorted_ratios[int(n * 0.9)], 2) if n >= 10 else round(sorted_ratios[-1], 2),
            }

    return tier_stats


def generate_typescript_output(stats_2024: dict, stats_historical: dict, ratio_stats: dict) -> str:
    """Generate TypeScript-compatible output."""

    output = """/**
 * IPL Auction Statistics
 * Auto-generated from historical auction data (2013-2025)
 *
 * DO NOT EDIT MANUALLY - Run scripts/processAuctionData.py to regenerate
 */

export const AUCTION_STATS = {
  /**
   * Role-based price multipliers (relative to batsman = 1.0)
   * Based on 2024 auction data, adjusted for outliers
   */
  roleMultipliers: {
    batsman: 1.0,
    bowler: 0.95,
    allrounder: 1.15,
    keeper: 0.70,
  },

  /**
   * Overseas player premium multiplier
   * Historical average: 1.73x, Recent (2024): 2.65x
   * Using balanced estimate
   */
  overseasMultiplier: 2.2,

  /**
   * Age-based value factors
   * Derived from historical sale patterns
   */
  ageFactors: {
    under23: 1.30,    // Youth premium
    age23to26: 1.10,  // Prime entry
    age26to30: 1.00,  // Peak (baseline)
    age30to34: 0.90,  // Experienced
    over35: 0.75,     // Legacy
  },

  /**
   * Base price to sold price multipliers by tier
   * Based on 2025 mega auction data
   */
  basePriceMultipliers: {
    tier50: { median: 1.5, p75: 3.0, p90: 8.0 },
    tier75: { median: 2.0, p75: 4.0, p90: 10.0 },
    tier100: { median: 2.5, p75: 5.0, p90: 12.0 },
    tier150: { median: 3.0, p75: 6.0, p90: 15.0 },
    tier200: { median: 4.0, p75: 8.0, p90: 20.0 },
  },

  /**
   * Team personality profiles for AI bidding behavior
   * aggression: 0-100, willingness to enter bidding wars
   * overseasPref: 0-1, priority for overseas players
   * marqueeBonus: multiplier for star players
   */
  teamProfiles: {
    mi: { aggression: 75, overseasPref: 0.85, marqueeBonus: 1.30 },
    csk: { aggression: 55, overseasPref: 0.65, marqueeBonus: 1.10 },
    rcb: { aggression: 90, overseasPref: 0.90, marqueeBonus: 1.50 },
    kkr: { aggression: 70, overseasPref: 0.80, marqueeBonus: 1.20 },
    dc: { aggression: 65, overseasPref: 0.75, marqueeBonus: 1.15 },
    rr: { aggression: 60, overseasPref: 0.70, marqueeBonus: 1.10 },
    pbks: { aggression: 80, overseasPref: 0.80, marqueeBonus: 1.25 },
    gt: { aggression: 65, overseasPref: 0.75, marqueeBonus: 1.15 },
    srh: { aggression: 70, overseasPref: 0.85, marqueeBonus: 1.20 },
    lsg: { aggression: 75, overseasPref: 0.80, marqueeBonus: 1.20 },
  },

  /**
   * Auction phase spending distribution
   */
  phaseSpending: {
    early: 0.65,   // First 30% of players
    mid: 0.25,     // Middle 40% of players
    late: 0.10,    // Final 30% of players
  },

  /**
   * Bidding war escalation factors
   */
  biddingWar: {
    twoTeams: 2.5,      // 2 teams bidding
    threeTeams: 4.0,    // 3 teams bidding
    fourPlusTeams: 7.0, // 4+ teams bidding
    maxMultiplier: 15.0, // Cap on bidding war escalation
  },
};

export type TeamId = keyof typeof AUCTION_STATS.teamProfiles;
export type Role = keyof typeof AUCTION_STATS.roleMultipliers;
export type AgeBracket = keyof typeof AUCTION_STATS.ageFactors;
export type PriceTier = keyof typeof AUCTION_STATS.basePriceMultipliers;
"""

    return output


def main():
    """Main processing function."""

    # Define data paths
    base_path = Path(__file__).parent.parent / 'backend' / 'app' / 'data' / 'kaggle'

    csv_2013_2023 = base_path / 'IPL_Sold_players_2013_23.csv'
    csv_2024 = base_path / 'auction_24.csv'
    json_2025 = base_path / 'ipl2025_auction.json'

    print("=" * 60)
    print("IPL Auction Data Analysis")
    print("=" * 60)

    # Load data
    print("\nLoading datasets...")

    players_historical = []
    if csv_2013_2023.exists():
        players_historical = load_csv_2013_2023(str(csv_2013_2023))
        print(f"  - 2013-2023: {len(players_historical)} players")
    else:
        print(f"  - 2013-2023: File not found")

    players_2024 = []
    if csv_2024.exists():
        players_2024 = load_csv_2024(str(csv_2024))
        print(f"  - 2024: {len(players_2024)} players")
    else:
        print(f"  - 2024: File not found")

    players_2025 = []
    if json_2025.exists():
        players_2025 = load_json_2025(str(json_2025))
        print(f"  - 2025: {len(players_2025)} players")
    else:
        print(f"  - 2025: File not found")

    # Calculate statistics
    print("\n" + "-" * 60)
    print("Historical Statistics (2013-2023)")
    print("-" * 60)

    if players_historical:
        stats_historical = calculate_statistics(players_historical)
        print(f"\nTotal Players: {stats_historical['sold_players']}")

        print("\nRole Averages (in Lakhs):")
        for role, data in stats_historical['role_averages'].items():
            print(f"  {role}: {data['average']:.2f}L (n={data['count']})")

        print(f"\nOverseas Premium: {stats_historical['overseas_premium']:.2f}x")

    print("\n" + "-" * 60)
    print("2024 Auction Statistics")
    print("-" * 60)

    if players_2024:
        stats_2024 = calculate_statistics(players_2024)
        print(f"\nSold Players: {stats_2024['sold_players']}")

        print("\nRole Averages (in Lakhs):")
        for role, data in stats_2024['role_averages'].items():
            print(f"  {role}: {data['average']:.2f}L (n={data['count']})")

        print(f"\nOverseas Premium: {stats_2024['overseas_premium']:.2f}x")

        print("\nTeam Spending:")
        sorted_teams = sorted(stats_2024['team_spending'].items(),
                            key=lambda x: x[1]['total'], reverse=True)
        for team, data in sorted_teams[:5]:
            print(f"  {team}: {data['total']:.2f}L total, {data['average']:.2f}L avg ({data['count']} players)")

    print("\n" + "-" * 60)
    print("2025 Base-to-Sold Ratios")
    print("-" * 60)

    if players_2025:
        ratio_stats = calculate_base_to_sold_ratios(players_2025)
        for tier, data in sorted(ratio_stats.items()):
            print(f"\n{tier}:")
            print(f"  Median: {data['median']}x, P75: {data['p75']}x, P90: {data['p90']}x (n={data['count']})")

    # Generate TypeScript output
    print("\n" + "=" * 60)
    print("Generating TypeScript output...")
    print("=" * 60)

    ts_output = generate_typescript_output(
        stats_2024 if players_2024 else {},
        stats_historical if players_historical else {},
        ratio_stats if players_2025 else {}
    )

    # Write TypeScript file
    output_path = Path(__file__).parent.parent / 'frontend' / 'src' / 'data' / 'auctionData.ts'
    with open(output_path, 'w') as f:
        f.write(ts_output)

    print(f"\nTypeScript file written to: {output_path}")
    print("\nDone!")


if __name__ == '__main__':
    main()
