#!/usr/bin/env python3
"""
Set Batter Myth Chart Generator

Visualizes the counterintuitive finding that "set" batters
in death overs are in more danger than newcomers in the Powerplay.

Data source: Cricsheet IPL ball-by-ball data
"""

import json
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from typing import Dict, List

DATA_PATH = Path(__file__).parent.parent.parent / "source_data" / "cricsheet"
OUTPUT_PATH = Path(__file__).parent.parent.parent / "charts"


def identify_tournament(event_name: str) -> str:
    if not event_name:
        return "other"
    if "indian premier league" in event_name.lower() or "ipl" in event_name.lower():
        return "ipl"
    return "other"


def get_phase(over: int) -> str:
    if over < 6:
        return "powerplay"
    elif over < 15:
        return "middle"
    else:
        return "death"


def extract_ipl_deliveries(filepath: Path) -> List[Dict]:
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
    stats = {}
    for phase in ["powerplay", "middle", "death"]:
        phase_data = df[df["phase"] == phase]
        wicket_rate = phase_data["is_wicket"].mean() * 100
        deliveries = len(phase_data)
        stats[phase] = {"wicket_rate": wicket_rate, "deliveries": deliveries}
    return stats


def create_chart(stats: Dict, output_path: Path):
    """Create the Set Batter Myth visualization."""

    pp_rate = stats["powerplay"]["wicket_rate"]
    death_rate = stats["death"]["wicket_rate"]

    # Calculate 1-in-X odds
    pp_odds = round(100 / pp_rate)
    death_odds = round(100 / death_rate)

    # LinkedIn optimized chart
    fig, ax = plt.subplots(figsize=(12, 6.5))

    # Create two scenarios side by side
    scenarios = ["New batter\n(Powerplay)", '"Set" batter\n(Death overs)']
    rates = [pp_rate, death_rate]
    colors = ["#2ECC71", "#E74C3C"]

    bars = ax.bar(scenarios, rates, color=colors, width=0.5, edgecolor="white", linewidth=3)

    # Add percentage labels
    for bar, rate, odds in zip(bars, rates, [pp_odds, death_odds]):
        height = bar.get_height()
        ax.annotate(
            f"{rate:.1f}%",
            xy=(bar.get_x() + bar.get_width() / 2, height),
            xytext=(0, 10),
            textcoords="offset points",
            ha="center",
            va="bottom",
            fontsize=30,
            fontweight="bold",
            color="#2C3E50",
        )
        # Add 1-in-X below the bar label
        ax.annotate(
            f"1 in {odds} balls",
            xy=(bar.get_x() + bar.get_width() / 2, height),
            xytext=(0, -25),
            textcoords="offset points",
            ha="center",
            va="top",
            fontsize=12,
            color="#7F8C8D",
        )

    # Add "2x" connector
    mid_x = 0.5
    mid_y = (pp_rate + death_rate) / 2

    ax.annotate(
        "2× more likely\nto get out",
        xy=(mid_x, mid_y + 0.8),
        ha="center",
        va="center",
        fontsize=16,
        fontweight="bold",
        color="#E74C3C",
        bbox=dict(
            boxstyle="round,pad=0.4",
            facecolor="white",
            edgecolor="#E74C3C",
            linewidth=2,
        ),
    )

    # Draw arrow
    ax.annotate(
        "",
        xy=(1, death_rate - 0.3),
        xytext=(0, pp_rate + 0.3),
        arrowprops=dict(
            arrowstyle="-|>",
            color="#E74C3C",
            lw=2.5,
            connectionstyle="arc3,rad=0.15",
        ),
    )

    # Styling
    ax.set_ylabel("Wicket probability per ball", fontsize=14, fontweight="bold", color="#2C3E50")
    ax.set_ylim(0, death_rate * 1.45)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#BDC3C7")
    ax.spines["bottom"].set_color("#BDC3C7")
    ax.tick_params(axis="both", colors="#2C3E50", labelsize=13)
    ax.tick_params(axis="x", labelsize=14)

    # Title
    ax.set_title(
        'The "Set Batter" Myth',
        fontsize=24,
        fontweight="bold",
        color="#2C3E50",
        pad=20,
    )

    # Subtitle
    ax.text(
        0.5,
        1.02,
        "Being set doesn't protect you. The phase does.",
        transform=ax.transAxes,
        ha="center",
        fontsize=13,
        color="#7F8C8D",
        style="italic",
    )

    # Footer
    total = stats["powerplay"]["deliveries"] + stats["death"]["deliveries"]
    ax.text(
        0.5,
        -0.12,
        f"Data: {total:,} IPL deliveries (2008-2025) | Source: Cricsheet",
        transform=ax.transAxes,
        ha="center",
        fontsize=10,
        color="#95A5A6",
    )

    plt.tight_layout()

    output_path.mkdir(parents=True, exist_ok=True)

    # Save high-res
    output_file = output_path / "set_batter_myth.png"
    plt.savefig(output_file, dpi=300, bbox_inches="tight", facecolor="white")
    print(f"\nChart saved to: {output_file}")

    # Save LinkedIn version
    linkedin_file = output_path / "set_batter_myth_linkedin.png"
    plt.savefig(linkedin_file, dpi=150, bbox_inches="tight", facecolor="white")
    print(f"LinkedIn version saved to: {linkedin_file}")

    plt.close("all")
    return output_file


def main():
    print("=" * 60)
    print("SET BATTER MYTH CHART GENERATOR")
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

    print(f"\n  1 in {100/stats['powerplay']['wicket_rate']:.0f} balls (Powerplay)")
    print(f"  1 in {100/stats['death']['wicket_rate']:.0f} balls (Death)")

    print("\nGenerating chart...")
    create_chart(stats, OUTPUT_PATH)

    print("\n" + "=" * 60)
    print("DONE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
