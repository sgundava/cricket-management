import { useState, useMemo } from 'react';
import { useGameStore } from '../store/gameStore';

type StatsTab = 'batting' | 'bowling' | 'team';

interface PlayerSeasonStats {
  playerId: string;
  name: string;
  shortName: string;
  teamId: string;
  teamShortName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  fifties: number;
  wickets: number;
  oversBowled: number;
  runsConceded: number;
  dots: number;
  fourWickets: number; // 4+ wicket hauls
  matches: number;
}

export const StatsScreen = () => {
  const { fixtures, players, teams, playerTeamId } = useGameStore();
  const [tab, setTab] = useState<StatsTab>('batting');

  const playerTeam = teams.find((t) => t.id === playerTeamId);

  // Calculate season stats from completed matches
  const seasonStats = useMemo(() => {
    const stats = new Map<string, PlayerSeasonStats>();

    // Initialize stats for all players
    players.forEach((player) => {
      const team = teams.find((t) => t.squad.includes(player.id));
      stats.set(player.id, {
        playerId: player.id,
        name: player.name,
        shortName: player.shortName,
        teamId: team?.id || '',
        teamShortName: team?.shortName || '',
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        fifties: 0,
        wickets: 0,
        oversBowled: 0,
        runsConceded: 0,
        dots: 0,
        fourWickets: 0,
        matches: 0,
      });
    });

    // Type definitions for stats
    type BatterStats = { runs: number; balls: number; fours: number; sixes: number };
    type BowlerStats = { overs: number; runs: number; wickets: number; dots: number };

    // Aggregate stats from completed matches
    fixtures
      .filter((m) => m.status === 'completed')
      .forEach((match) => {
        const processInnings = (innings: typeof match.innings1) => {
          if (!innings) return;

          // Process batter stats
          const batterStats = innings.batterStats;
          if (batterStats) {
            const entries: [string, BatterStats][] = batterStats instanceof Map
              ? Array.from(batterStats.entries())
              : Object.entries(batterStats) as [string, BatterStats][];

            entries.forEach(([playerId, bStats]) => {
              const playerStat = stats.get(playerId);
              if (playerStat && bStats) {
                playerStat.runs += bStats.runs || 0;
                playerStat.balls += bStats.balls || 0;
                playerStat.fours += bStats.fours || 0;
                playerStat.sixes += bStats.sixes || 0;
                if ((bStats.runs || 0) >= 50) {
                  playerStat.fifties += 1;
                }
              }
            });
          }

          // Process bowler stats
          const bowlerStats = innings.bowlerStats;
          if (bowlerStats) {
            const entries: [string, BowlerStats][] = bowlerStats instanceof Map
              ? Array.from(bowlerStats.entries())
              : Object.entries(bowlerStats) as [string, BowlerStats][];

            entries.forEach(([playerId, bwlStats]) => {
              const playerStat = stats.get(playerId);
              if (playerStat && bwlStats) {
                playerStat.wickets += bwlStats.wickets || 0;
                playerStat.oversBowled += bwlStats.overs || 0;
                playerStat.runsConceded += bwlStats.runs || 0;
                playerStat.dots += bwlStats.dots || 0;
                if ((bwlStats.wickets || 0) >= 4) {
                  playerStat.fourWickets += 1;
                }
              }
            });
          }
        };

        processInnings(match.innings1);
        processInnings(match.innings2);

        // Track matches played (simplified: count if player was in playing XI)
        const homeTeam = teams.find((t) => t.id === match.homeTeam);
        const awayTeam = teams.find((t) => t.id === match.awayTeam);

        match.homeTactics?.playingXI.forEach((playerId) => {
          const playerStat = stats.get(playerId);
          if (playerStat) playerStat.matches += 1;
        });
        match.awayTactics?.playingXI.forEach((playerId) => {
          const playerStat = stats.get(playerId);
          if (playerStat) playerStat.matches += 1;
        });
      });

    return Array.from(stats.values());
  }, [fixtures, players, teams]);

  // Top run scorers
  const topRunScorers = useMemo(() => {
    return [...seasonStats]
      .filter((s) => s.runs > 0)
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 10);
  }, [seasonStats]);

  // Top wicket takers
  const topWicketTakers = useMemo(() => {
    return [...seasonStats]
      .filter((s) => s.wickets > 0)
      .sort((a, b) => b.wickets - a.wickets)
      .slice(0, 10);
  }, [seasonStats]);

  // Best strike rates (min 30 balls)
  const bestStrikeRates = useMemo(() => {
    return [...seasonStats]
      .filter((s) => s.balls >= 30)
      .map((s) => ({ ...s, strikeRate: (s.runs / s.balls) * 100 }))
      .sort((a, b) => b.strikeRate - a.strikeRate)
      .slice(0, 10);
  }, [seasonStats]);

  // Best economy (min 6 overs)
  const bestEconomy = useMemo(() => {
    return [...seasonStats]
      .filter((s) => s.oversBowled >= 6)
      .map((s) => ({ ...s, economy: s.runsConceded / s.oversBowled }))
      .sort((a, b) => a.economy - b.economy)
      .slice(0, 10);
  }, [seasonStats]);

  // Your team's top performers
  const yourTeamStats = useMemo(() => {
    return seasonStats.filter((s) => s.teamId === playerTeamId);
  }, [seasonStats, playerTeamId]);

  const yourTopScorer = useMemo(() => {
    return [...yourTeamStats].sort((a, b) => b.runs - a.runs)[0];
  }, [yourTeamStats]);

  const yourTopWicketTaker = useMemo(() => {
    return [...yourTeamStats].sort((a, b) => b.wickets - a.wickets)[0];
  }, [yourTeamStats]);

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold">Season Stats</h1>
          <p className="text-sm text-gray-400">Leaderboards & Records</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Tab Selector */}
        <div className="flex gap-2">
          {(['batting', 'bowling', 'team'] as StatsTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Batting Stats */}
        {tab === 'batting' && (
          <div className="space-y-4">
            {/* Top Run Scorers */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-orange-400 mb-3">TOP RUN SCORERS</h3>
              {topRunScorers.length === 0 ? (
                <p className="text-gray-500 text-sm">No data yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 border-b border-gray-700 pb-1">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">Player</div>
                    <div className="col-span-2 text-right">Runs</div>
                    <div className="col-span-2 text-right">SR</div>
                    <div className="col-span-2 text-right">50s</div>
                  </div>
                  {topRunScorers.map((s, i) => {
                    const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '-';
                    const isYourTeam = s.teamId === playerTeamId;
                    return (
                      <div
                        key={s.playerId}
                        className={`grid grid-cols-12 gap-1 text-sm ${isYourTeam ? 'text-blue-400' : ''}`}
                      >
                        <div className="col-span-1 text-gray-500">{i + 1}</div>
                        <div className="col-span-5 truncate">
                          {s.shortName}
                          <span className="text-xs text-gray-500 ml-1">({s.teamShortName})</span>
                        </div>
                        <div className="col-span-2 text-right font-medium">{s.runs}</div>
                        <div className="col-span-2 text-right text-gray-400">{sr}</div>
                        <div className="col-span-2 text-right text-yellow-400">{s.fifties || '-'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Best Strike Rates */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-green-400 mb-3">BEST STRIKE RATES (min 30 balls)</h3>
              {bestStrikeRates.length === 0 ? (
                <p className="text-gray-500 text-sm">No data yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 border-b border-gray-700 pb-1">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">Player</div>
                    <div className="col-span-2 text-right">SR</div>
                    <div className="col-span-2 text-right">Runs</div>
                    <div className="col-span-2 text-right">6s</div>
                  </div>
                  {bestStrikeRates.slice(0, 5).map((s, i) => {
                    const isYourTeam = s.teamId === playerTeamId;
                    return (
                      <div
                        key={s.playerId}
                        className={`grid grid-cols-12 gap-1 text-sm ${isYourTeam ? 'text-blue-400' : ''}`}
                      >
                        <div className="col-span-1 text-gray-500">{i + 1}</div>
                        <div className="col-span-5 truncate">
                          {s.shortName}
                          <span className="text-xs text-gray-500 ml-1">({s.teamShortName})</span>
                        </div>
                        <div className="col-span-2 text-right font-medium text-green-400">
                          {s.strikeRate.toFixed(1)}
                        </div>
                        <div className="col-span-2 text-right text-gray-400">{s.runs}</div>
                        <div className="col-span-2 text-right text-purple-400">{s.sixes || '-'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bowling Stats */}
        {tab === 'bowling' && (
          <div className="space-y-4">
            {/* Top Wicket Takers */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-purple-400 mb-3">TOP WICKET TAKERS</h3>
              {topWicketTakers.length === 0 ? (
                <p className="text-gray-500 text-sm">No data yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 border-b border-gray-700 pb-1">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">Player</div>
                    <div className="col-span-2 text-right">Wkts</div>
                    <div className="col-span-2 text-right">Econ</div>
                    <div className="col-span-2 text-right">4W</div>
                  </div>
                  {topWicketTakers.map((s, i) => {
                    const econ = s.oversBowled > 0 ? (s.runsConceded / s.oversBowled).toFixed(1) : '-';
                    const isYourTeam = s.teamId === playerTeamId;
                    return (
                      <div
                        key={s.playerId}
                        className={`grid grid-cols-12 gap-1 text-sm ${isYourTeam ? 'text-blue-400' : ''}`}
                      >
                        <div className="col-span-1 text-gray-500">{i + 1}</div>
                        <div className="col-span-5 truncate">
                          {s.shortName}
                          <span className="text-xs text-gray-500 ml-1">({s.teamShortName})</span>
                        </div>
                        <div className="col-span-2 text-right font-medium">{s.wickets}</div>
                        <div className="col-span-2 text-right text-gray-400">{econ}</div>
                        <div className="col-span-2 text-right text-yellow-400">{s.fourWickets || '-'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Best Economy */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-green-400 mb-3">BEST ECONOMY (min 6 overs)</h3>
              {bestEconomy.length === 0 ? (
                <p className="text-gray-500 text-sm">No data yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 border-b border-gray-700 pb-1">
                    <div className="col-span-1">#</div>
                    <div className="col-span-5">Player</div>
                    <div className="col-span-2 text-right">Econ</div>
                    <div className="col-span-2 text-right">Overs</div>
                    <div className="col-span-2 text-right">Wkts</div>
                  </div>
                  {bestEconomy.slice(0, 5).map((s, i) => {
                    const isYourTeam = s.teamId === playerTeamId;
                    return (
                      <div
                        key={s.playerId}
                        className={`grid grid-cols-12 gap-1 text-sm ${isYourTeam ? 'text-blue-400' : ''}`}
                      >
                        <div className="col-span-1 text-gray-500">{i + 1}</div>
                        <div className="col-span-5 truncate">
                          {s.shortName}
                          <span className="text-xs text-gray-500 ml-1">({s.teamShortName})</span>
                        </div>
                        <div className="col-span-2 text-right font-medium text-green-400">
                          {s.economy.toFixed(2)}
                        </div>
                        <div className="col-span-2 text-right text-gray-400">{s.oversBowled}</div>
                        <div className="col-span-2 text-right text-purple-400">{s.wickets}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Stats */}
        {tab === 'team' && (
          <div className="space-y-4">
            {/* Your Team Header */}
            <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-700">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">{playerTeam?.name} TOP PERFORMERS</h3>

              <div className="grid grid-cols-2 gap-4">
                {/* Top Scorer */}
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Top Scorer</div>
                  {yourTopScorer && yourTopScorer.runs > 0 ? (
                    <>
                      <div className="font-medium">{yourTopScorer.shortName}</div>
                      <div className="text-orange-400 text-lg font-bold">{yourTopScorer.runs} runs</div>
                      <div className="text-xs text-gray-500">
                        SR: {yourTopScorer.balls > 0 ? ((yourTopScorer.runs / yourTopScorer.balls) * 100).toFixed(1) : '-'}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm">No data yet</div>
                  )}
                </div>

                {/* Top Wicket Taker */}
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Top Wicket Taker</div>
                  {yourTopWicketTaker && yourTopWicketTaker.wickets > 0 ? (
                    <>
                      <div className="font-medium">{yourTopWicketTaker.shortName}</div>
                      <div className="text-purple-400 text-lg font-bold">{yourTopWicketTaker.wickets} wickets</div>
                      <div className="text-xs text-gray-500">
                        Econ: {yourTopWicketTaker.oversBowled > 0
                          ? (yourTopWicketTaker.runsConceded / yourTopWicketTaker.oversBowled).toFixed(2)
                          : '-'}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 text-sm">No data yet</div>
                  )}
                </div>
              </div>
            </div>

            {/* Your Team Full Stats */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">YOUR SQUAD STATS</h3>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1 text-xs text-gray-500 border-b border-gray-700 pb-1">
                  <div className="col-span-4">Player</div>
                  <div className="col-span-2 text-right">Runs</div>
                  <div className="col-span-2 text-right">SR</div>
                  <div className="col-span-2 text-right">Wkts</div>
                  <div className="col-span-2 text-right">Econ</div>
                </div>
                {yourTeamStats
                  .filter((s) => s.runs > 0 || s.wickets > 0)
                  .sort((a, b) => (b.runs + b.wickets * 20) - (a.runs + a.wickets * 20))
                  .map((s) => {
                    const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(0) : '-';
                    const econ = s.oversBowled > 0 ? (s.runsConceded / s.oversBowled).toFixed(1) : '-';
                    return (
                      <div key={s.playerId} className="grid grid-cols-12 gap-1 text-sm">
                        <div className="col-span-4 truncate">{s.shortName}</div>
                        <div className="col-span-2 text-right text-orange-400">{s.runs || '-'}</div>
                        <div className="col-span-2 text-right text-gray-400">{sr}</div>
                        <div className="col-span-2 text-right text-purple-400">{s.wickets || '-'}</div>
                        <div className="col-span-2 text-right text-gray-400">{econ}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
