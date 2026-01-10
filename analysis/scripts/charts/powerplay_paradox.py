#!/usr/bin/env python3
"""
Powerplay Paradox Chart Generator

Generates a LinkedIn-optimized chart showing the counterintuitive finding
that batters are safer during the Powerplay than in middle overs.

Data source: Cricsheet IPL ball-by-ball data
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
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

    # Only T20 matches
    if match_type not in ["T20", "IT20"]:
        return []

    # Check if IPL
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
    """Create the Powerplay Paradox visualization."""
    # Setup
    fig, ax = plt.subplots(figsize=(10, 8))

    # Colors - green for safer, red for dangerous
    colors = {
        "powerplay": "#2ECC71",  # Green - safer
        "middle": "#E74C3C",  # Red - more dangerous
        "death": "#95A5A6",  # Gray - context only
    }

    phases = ["powerplay", "middle", "death"]
    phase_labels = ["Powerplay\n(Overs 1-6)", "Middle\n(Overs 7-15)", "Death\n(Overs 16-20)"]
    wicket_rates = [stats[p]["wicket_rate"] for p in phases]

    # Create bars
    bars = ax.bar(
        phase_labels,
        wicket_rates,
        color=[colors[p] for p in phases],
        edgecolor="white",
        linewidth=2,
        width=0.6,
    )

    # Highlight the key comparison (powerplay vs middle)
    bars[0].set_edgecolor("#27AE60")
    bars[0].set_linewidth(3)
    bars[1].set_edgecolor("#C0392B")
    bars[1].set_linewidth(3)

    # Add value labels on bars
    for bar, rate in zip(bars, wicket_rates):
        height = bar.get_height()
        ax.annotate(
            f"{rate:.1f}%",
            xy=(bar.get_x() + bar.get_width() / 2, height),
            xytext=(0, 8),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=18,
            fontweight="bold",
            color="#2C3E50",
        )

    # Calculate the difference
    pp_rate = stats["powerplay"]["wicket_rate"]
    mid_rate = stats["middle"]["wicket_rate"]
    pct_diff = ((mid_rate - pp_rate) / pp_rate) * 100

    # Add annotation showing the difference
    ax.annotate(
        "",
        xy=(0, mid_rate),
        xytext=(1, mid_rate),
        arrowprops=dict(arrowstyle="<->", color="#E74C3C", lw=2),
    )

    ax.annotate(
        f"{pct_diff:.0f}% MORE\nwickets",
        xy=(0.5, (pp_rate + mid_rate) / 2 + 0.3),
        ha="center",
        va="bottom",
        fontsize=12,
        fontweight="bold",
        color="#E74C3C",
    )

    # Styling
    ax.set_ylabel("Wicket Rate (%)", fontsize=14, fontweight="bold", color="#2C3E50")
    ax.set_ylim(0, max(wicket_rates) * 1.3)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#BDC3C7")
    ax.spines["bottom"].set_color("#BDC3C7")
    ax.tick_params(axis="both", colors="#2C3E50", labelsize=12)

    # Title
    ax.set_title(
        "The Powerplay Paradox",
        fontsize=22,
        fontweight="bold",
        color="#2C3E50",
        pad=20,
    )

    # Subtitle
    ax.text(
        0.5,
        1.02,
        "Batters are SAFER when the field is at its most attacking",
        transform=ax.transAxes,
        ha="center",
        fontsize=13,
        color="#7F8C8D",
        style="italic",
    )

    # Footer with data source
    total_deliveries = sum(stats[p]["deliveries"] for p in phases)
    ax.text(
        0.5,
        -0.12,
        f"Data: {total_deliveries:,} IPL deliveries (2008-2025) | Source: Cricsheet",
        transform=ax.transAxes,
        ha="center",
        fontsize=10,
        color="#95A5A6",
    )

    # Legend
    safe_patch = mpatches.Patch(color="#2ECC71", label="Lower risk")
    danger_patch = mpatches.Patch(color="#E74C3C", label="Higher risk")
    ax.legend(handles=[safe_patch, danger_patch], loc="upper right", frameon=False)

    plt.tight_layout()

    # Save
    output_path.mkdir(parents=True, exist_ok=True)
    output_file = output_path / "powerplay_paradox.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight", facecolor="white")
    print(f"\nChart saved to: {output_file}")

    # Also save a version optimized for LinkedIn (1200x627 recommended)
    fig_linkedin, ax_linkedin = plt.subplots(figsize=(12, 6.27))

    # Recreate for LinkedIn dimensions
    bars = ax_linkedin.bar(
        phase_labels,
        wicket_rates,
        color=[colors[p] for p in phases],
        edgecolor="white",
        linewidth=2,
        width=0.5,
    )

    bars[0].set_edgecolor("#27AE60")
    bars[0].set_linewidth(3)
    bars[1].set_edgecolor("#C0392B")
    bars[1].set_linewidth(3)

    for bar, rate in zip(bars, wicket_rates):
        height = bar.get_height()
        ax_linkedin.annotate(
            f"{rate:.1f}%",
            xy=(bar.get_x() + bar.get_width() / 2, height),
            xytext=(0, 8),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=20,
            fontweight="bold",
            color="#2C3E50",
        )

    ax_linkedin.set_ylabel(
        "Wicket Rate (%)", fontsize=16, fontweight="bold", color="#2C3E50"
    )
    ax_linkedin.set_ylim(0, max(wicket_rates) * 1.3)
    ax_linkedin.spines["top"].set_visible(False)
    ax_linkedin.spines["right"].set_visible(False)
    ax_linkedin.spines["left"].set_color("#BDC3C7")
    ax_linkedin.spines["bottom"].set_color("#BDC3C7")
    ax_linkedin.tick_params(axis="both", colors="#2C3E50", labelsize=14)

    ax_linkedin.set_title(
        "The Powerplay Paradox: Batters are SAFER when the field attacks",
        fontsize=20,
        fontweight="bold",
        color="#2C3E50",
        pad=15,
    )

    ax_linkedin.text(
        0.5,
        -0.1,
        f"Data: {total_deliveries:,} IPL deliveries | Source: Cricsheet",
        transform=ax_linkedin.transAxes,
        ha="center",
        fontsize=11,
        color="#95A5A6",
    )

    plt.tight_layout()
    linkedin_file = output_path / "powerplay_paradox_linkedin.png"
    plt.savefig(linkedin_file, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"LinkedIn version saved to: {linkedin_file}")

    plt.close("all")

    return output_file


def main():
    """Main entry point."""
    print("=" * 60)
    print("POWERPLAY PARADOX CHART GENERATOR")
    print("=" * 60)

    # Load data
    df = load_ipl_data()

    if df.empty:
        print("Error: No IPL data found!")
        return

    # Calculate stats
    print("\nCalculating phase statistics...")
    stats = calculate_phase_stats(df)

    print("\n--- IPL Phase Wicket Rates ---")
    for phase, data in stats.items():
        print(f"  {phase.capitalize():12}: {data['wicket_rate']:.2f}% ({data['deliveries']:,} balls)")

    # Create chart
    print("\nGenerating chart...")
    output_file = create_chart(stats, OUTPUT_PATH)

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()