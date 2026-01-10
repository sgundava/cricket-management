#!/usr/bin/env python3
"""
T20 League Comparison Chart Generator

Compares run rates and six rates across major T20 leagues.

Data source: Cricsheet ball-by-ball data
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path
from typing import Dict, List

DATA_PATH = Path(__file__).parent.parent.parent / "source_data" / "cricsheet"
OUTPUT_PATH = Path(__file__).parent.parent.parent / "charts"

TOURNAMENT_PATTERNS = {
    "Indian Premier League": "IPL",
    "IPL": "IPL",
    "Big Bash League": "BBL",
    "BBL": "BBL",
    "Caribbean Premier League": "CPL",
    "CPL": "CPL",
    "Pakistan Super League": "PSL",
    "PSL": "PSL",
    "T20 Blast": "T20 Blast",
    "Vitality Blast": "T20 Blast",
}


def identify_tournament(event_name: str) -> str:
    if not event_name:
        return None
    for pattern, tournament in TOURNAMENT_PATTERNS.items():
        if pattern.lower() in event_name.lower():
            return tournament
    return None


def extract_deliveries(filepath: Path) -> List[Dict]:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []

    if "innings" not in data:
        return []

    info = data.get("info", {})
    match_type = info.get("match_type", "")

    if match_type not in ["T20", "IT20"]:
        return []

    event = info.get("event", {})
    event_name = event.get("name", "") if isinstance(event, dict) else str(event)
    tournament = identify_tournament(event_name)

    if not tournament:
        return []

    deliveries = []

    for innings in data["innings"]:
        for over_data in innings.get("overs", []):
            for delivery in over_data.get("deliveries", []):
                runs = delivery.get("runs", {})
                batter_runs = runs.get("batter", 0)
                total_runs = runs.get("total", 0)

                deliveries.append({
                    "tournament": tournament,
                    "total_runs": total_runs,
                    "is_six": batter_runs == 6,
                    "is_four": batter_runs == 4,
                })

    return deliveries


def load_data() -> pd.DataFrame:
    print(f"Loading T20 data from {DATA_PATH}...")
    all_deliveries = []
    files = list(DATA_PATH.glob("*.json"))

    for i, filepath in enumerate(files):
        if i % 2000 == 0 and i > 0:
            print(f"  Processed {i:,}/{len(files):,} files...")
        deliveries = extract_deliveries(filepath)
        all_deliveries.extend(deliveries)

    df = pd.DataFrame(all_deliveries)
    print(f"Loaded {len(df):,} T20 league deliveries")
    return df


def calculate_stats(df: pd.DataFrame) -> pd.DataFrame:
    stats = df.groupby("tournament").agg({
        "total_runs": ["count", "mean"],
        "is_six": "mean",
        "is_four": "mean",
    })
    stats.columns = ["deliveries", "runs_per_ball", "six_rate", "four_rate"]
    stats["rpo"] = stats["runs_per_ball"] * 6
    stats["six_pct"] = stats["six_rate"] * 100
    stats["boundary_pct"] = (stats["six_rate"] + stats["four_rate"]) * 100
    stats = stats.sort_values("rpo", ascending=False)
    return stats


def create_chart(stats: pd.DataFrame, output_path: Path):
    """Create a dual-metric comparison chart."""

    # Filter to leagues with significant data
    stats = stats[stats["deliveries"] > 50000].copy()

    leagues = stats.index.tolist()
    rpo = stats["rpo"].values
    six_pct = stats["six_pct"].values

    # Sort by RPO for the chart
    sorted_idx = np.argsort(rpo)[::-1]
    leagues = [leagues[i] for i in sorted_idx]
    rpo = rpo[sorted_idx]
    six_pct = six_pct[sorted_idx]

    # Create figure with two subplots side by side
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

    # Colors - highlight IPL differently
    colors_rpo = ["#3498DB" if l != "IPL" else "#E74C3C" for l in leagues]
    colors_six = ["#2ECC71" if l != "IPL" else "#E74C3C" for l in leagues]

    # Chart 1: Run Rate
    bars1 = ax1.barh(leagues, rpo, color=colors_rpo, edgecolor="white", linewidth=2)
    ax1.set_xlabel("Runs per Over", fontsize=12, fontweight="bold")
    ax1.set_title("Run Rate by League", fontsize=16, fontweight="bold", color="#2C3E50")
    ax1.set_xlim(7, 8.5)
    ax1.invert_yaxis()

    # Add value labels
    for bar, val in zip(bars1, rpo):
        ax1.text(val + 0.03, bar.get_y() + bar.get_height() / 2,
                 f"{val:.2f}", va="center", fontsize=11, fontweight="bold", color="#2C3E50")

    # Chart 2: Six Rate
    # Re-sort by six rate for second chart
    six_sorted_idx = np.argsort(six_pct)[::-1]
    leagues_six = [leagues[sorted_idx[i]] for i in range(len(leagues))]
    leagues_six = [stats.index.tolist()[i] for i in np.argsort(stats["six_pct"].values)[::-1]]
    six_pct_sorted = np.sort(stats["six_pct"].values)[::-1]
    colors_six_sorted = ["#2ECC71" if l != "IPL" else "#E74C3C" for l in leagues_six]

    bars2 = ax2.barh(leagues_six, six_pct_sorted, color=colors_six_sorted, edgecolor="white", linewidth=2)
    ax2.set_xlabel("Six Rate (%)", fontsize=12, fontweight="bold")
    ax2.set_title("Six Rate by League", fontsize=16, fontweight="bold", color="#2C3E50")
    ax2.set_xlim(3, 6.5)
    ax2.invert_yaxis()

    for bar, val in zip(bars2, six_pct_sorted):
        ax2.text(val + 0.05, bar.get_y() + bar.get_height() / 2,
                 f"{val:.1f}%", va="center", fontsize=11, fontweight="bold", color="#2C3E50")

    # Styling
    for ax in [ax1, ax2]:
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color("#BDC3C7")
        ax.spines["bottom"].set_color("#BDC3C7")
        ax.tick_params(axis="both", colors="#2C3E50", labelsize=11)

    # Main title
    fig.suptitle("T20 League Comparison: IPL Isn't the Most Aggressive",
                 fontsize=18, fontweight="bold", color="#2C3E50", y=1.02)

    # Footer
    total_deliveries = stats["deliveries"].sum()
    fig.text(0.5, -0.02, f"Data: {total_deliveries:,} deliveries across major T20 leagues | Source: Cricsheet",
             ha="center", fontsize=10, color="#95A5A6")

    plt.tight_layout()

    output_path.mkdir(parents=True, exist_ok=True)

    output_file = output_path / "t20_league_comparison.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight", facecolor="white")
    print(f"\nChart saved to: {output_file}")

    linkedin_file = output_path / "t20_league_comparison_linkedin.png"
    plt.savefig(linkedin_file, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"LinkedIn version saved to: {linkedin_file}")

    plt.close("all")
    return output_file


def main():
    print("=" * 60)
    print("T20 LEAGUE COMPARISON CHART GENERATOR")
    print("=" * 60)

    df = load_data()

    if df.empty:
        print("Error: No data found!")
        return

    print("\nCalculating league statistics...")
    stats = calculate_stats(df)

    print("\n--- T20 League Stats ---")
    print(f"{'League':<15} {'Deliveries':>12} {'RPO':>8} {'Six %':>8}")
    print("-" * 45)
    for league, row in stats.iterrows():
        print(f"{league:<15} {int(row['deliveries']):>12,} {row['rpo']:>8.2f} {row['six_pct']:>7.1f}%")

    print("\nGenerating chart...")
    create_chart(stats, OUTPUT_PATH)

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
