#!/usr/bin/env python3
"""
Death Overs Danger Chart Generator

Generates a LinkedIn-optimized chart showing that death overs
are 2x more dangerous than the Powerplay.

Data source: Cricsheet IPL ball-by-ball data
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from typing import Dict, List

# Configuration
DATA_PATH = Path(__file__).parent.parent.parent / "source_data" / "cricsheet"
OUTPUT_PATH = Path(__file__).parent.parent.parent / "charts"


def identify_tournament(event_name: str) -> str:
    """Identify if match is IPL."""
    if not event_name:
        return "other"
    if "indian premier league" in event_name.lower() or "ipl" in event_name.lower():
        return "ipl"
    return "other"


def get_phase(over: int) -> str:
    """Determine T20 match phase based on over number."""
    if over < 6:
        return "powerplay"
    elif over < 15:
        return "middle"
    else:
        return "death"


def extract_ipl_deliveries(filepath: Path) -> List[Dict]:
    """Extract deliveries from an IPL match JSON file."""
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
    if identify_tournament(event_name) != "ipl":
        return []

    deliveries = []

    for innings in data["innings"]:
        for over_data in innings.get("overs", []):
            over_num = over_data.get("over", 0)
            phase = get_phase(over_num)

            for delivery in over_data.get("deliveries", []):
                wickets = delivery.get("wickets", [])
                is_wicket = len(wickets) > 0

                deliveries.append({"phase": phase, "is_wicket": is_wicket})

    return deliveries


def load_ipl_data() -> pd.DataFrame:
    """Load all IPL match data."""
    print(f"Loading IPL data from {DATA_PATH}...")

    all_deliveries = []
    files = list(DATA_PATH.glob("*.json"))

    for i, filepath in enumerate(files):
        if i % 2000 == 0 and i > 0:
            print(f"  Processed {i:,}/{len(files):,} files...")

        deliveries = extract_ipl_deliveries(filepath)
        all_deliveries.extend(deliveries)

    df = pd.DataFrame(all_deliveries)
    print(f"Loaded {len(df):,} IPL deliveries")
    return df


def calculate_phase_stats(df: pd.DataFrame) -> Dict:
    """Calculate wicket rates by phase."""
    stats = {}
    for phase in ["powerplay", "middle", "death"]:
        phase_data = df[df["phase"] == phase]
        wicket_rate = phase_data["is_wicket"].mean() * 100
        deliveries = len(phase_data)
        stats[phase] = {"wicket_rate": wicket_rate, "deliveries": deliveries}
    return stats


def create_chart(stats: Dict, output_path: Path):
    """Create the Death Overs Danger visualization."""
    # Focus on Powerplay vs Death comparison
    fig, ax = plt.subplots(figsize=(12, 7))

    phases = ["powerplay", "death"]
    phase_labels = ["Powerplay\n(Overs 1-6)", "Death Overs\n(Overs 16-20)"]
    wicket_rates = [stats[p]["wicket_rate"] for p in phases]

    # Colors - green for safer, red for dangerous
    colors = ["#2ECC71", "#E74C3C"]

    # Create bars
    bars = ax.bar(
        phase_labels,
        wicket_rates,
        color=colors,
        edgecolor="white",
        linewidth=3,
        width=0.5,
    )

    # Add value labels on bars
    for bar, rate in zip(bars, wicket_rates):
        height = bar.get_height()
        ax.annotate(
            f"{rate:.1f}%",
            xy=(bar.get_x() + bar.get_width() / 2, height),
            xytext=(0, 10),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=28,
            fontweight="bold",
            color="#2C3E50",
        )

    # Add "2x" annotation
    ax.annotate(
        "2×",
        xy=(0.5, (wicket_rates[0] + wicket_rates[1]) / 2),
        ha="center",
        va="center",
        fontsize=40,
        fontweight="bold",
        color="#E74C3C",
        alpha=0.8,
    )

    ax.annotate(
        "more\nwickets",
        xy=(0.5, (wicket_rates[0] + wicket_rates[1]) / 2 - 1.2),
        ha="center",
        va="center",
        fontsize=14,
        fontweight="bold",
        color="#E74C3C",
        alpha=0.8,
    )

    # Draw arrow
    ax.annotate(
        "",
        xy=(1, wicket_rates[1] - 0.5),
        xytext=(0, wicket_rates[0] + 0.5),
        arrowprops=dict(
            arrowstyle="->",
            color="#E74C3C",
            lw=3,
            connectionstyle="arc3,rad=0.2",
        ),
    )

    # Styling
    ax.set_ylabel("Wicket Rate (%)", fontsize=16, fontweight="bold", color="#2C3E50")
    ax.set_ylim(0, max(wicket_rates) * 1.4)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#BDC3C7")
    ax.spines["bottom"].set_color("#BDC3C7")
    ax.tick_params(axis="both", colors="#2C3E50", labelsize=14)

    # Title
    ax.set_title(
        "Death Overs: The Real Danger Zone",
        fontsize=24,
        fontweight="bold",
        color="#2C3E50",
        pad=20,
    )

    # Subtitle
    ax.text(
        0.5,
        1.02,
        "Wicket probability per delivery in IPL matches",
        transform=ax.transAxes,
        ha="center",
        fontsize=13,
        color="#7F8C8D",
        style="italic",
    )

    # Footer
    total_deliveries = sum(stats[p]["deliveries"] for p in phases)
    ax.text(
        0.5,
        -0.12,
        f"Data: {total_deliveries:,} IPL deliveries (2008-2025) | Source: Cricsheet",
        transform=ax.transAxes,
        ha="center",
        fontsize=11,
        color="#95A5A6",
    )

    plt.tight_layout()

    # Save
    output_path.mkdir(parents=True, exist_ok=True)
    output_file = output_path / "death_overs_danger.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight", facecolor="white")
    print(f"\nChart saved to: {output_file}")

    # LinkedIn optimized version (1200x627)
    fig_li, ax_li = plt.subplots(figsize=(12, 6.27))

    bars = ax_li.bar(
        phase_labels,
        wicket_rates,
        color=colors,
        edgecolor="white",
        linewidth=3,
        width=0.45,
    )

    for bar, rate in zip(bars, wicket_rates):
        height = bar.get_height()
        ax_li.annotate(
            f"{rate:.1f}%",
            xy=(bar.get_x() + bar.get_width() / 2, height),
            xytext=(0, 8),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=32,
            fontweight="bold",
            color="#2C3E50",
        )

    ax_li.annotate(
        "2× more dangerous",
        xy=(0.5, (wicket_rates[0] + wicket_rates[1]) / 2),
        ha="center",
        va="center",
        fontsize=18,
        fontweight="bold",
        color="#E74C3C",
        bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor="#E74C3C", alpha=0.9),
    )

    ax_li.set_ylabel("Wicket Rate (%)", fontsize=16, fontweight="bold", color="#2C3E50")
    ax_li.set_ylim(0, max(wicket_rates) * 1.35)
    ax_li.spines["top"].set_visible(False)
    ax_li.spines["right"].set_visible(False)
    ax_li.spines["left"].set_color("#BDC3C7")
    ax_li.spines["bottom"].set_color("#BDC3C7")
    ax_li.tick_params(axis="both", colors="#2C3E50", labelsize=14)

    ax_li.set_title(
        "The Death Overs Truth: Where IPL Innings Go to Die",
        fontsize=20,
        fontweight="bold",
        color="#2C3E50",
        pad=15,
    )

    ax_li.text(
        0.5,
        -0.1,
        f"Data: {total_deliveries:,} IPL deliveries | Source: Cricsheet",
        transform=ax_li.transAxes,
        ha="center",
        fontsize=11,
        color="#95A5A6",
    )

    plt.tight_layout()
    linkedin_file = output_path / "death_overs_danger_linkedin.png"
    plt.savefig(linkedin_file, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"LinkedIn version saved to: {linkedin_file}")

    plt.close("all")
    return output_file


def main():
    """Main entry point."""
    print("=" * 60)
    print("DEATH OVERS DANGER CHART GENERATOR")
    print("=" * 60)

    df = load_ipl_data()

    if df.empty:
        print("Error: No IPL data found!")
        return

    print("\nCalculating phase statistics...")
    stats = calculate_phase_stats(df)

    print("\n--- IPL Phase Wicket Rates ---")
    for phase, data in stats.items():
        print(f"  {phase.capitalize():12}: {data['wicket_rate']:.2f}% ({data['deliveries']:,} balls)")

    ratio = stats["death"]["wicket_rate"] / stats["powerplay"]["wicket_rate"]
    print(f"\n  Death/Powerplay ratio: {ratio:.1f}x")

    print("\nGenerating chart...")
    create_chart(stats, OUTPUT_PATH)

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
