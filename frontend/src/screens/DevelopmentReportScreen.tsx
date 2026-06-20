import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { PlayerDevelopmentResult, DevelopmentBand, SkillChange, TrainingFocus } from '../types';

const FOCUS_LABELS: Record<TrainingFocus, string> = {
  'balanced': 'Balanced',
  'power-hitting': 'Power Hitting',
  'batting-technique': 'Batting Technique',
  'pace-bowling': 'Pace Bowling',
  'bowling-craft': 'Bowling Craft',
  'fielding': 'Fielding',
  'fitness': 'Fitness',
};

const BAND_META: Record<DevelopmentBand, { label: string; emoji: string; color: string }> = {
  youth: { label: 'Developing', emoji: '🌱', color: 'text-green-400' },
  prime: { label: 'Prime', emoji: '⭐', color: 'text-blue-400' },
  decline: { label: 'Veteran', emoji: '🕰️', color: 'text-amber-400' },
  veteran: { label: 'Twilight', emoji: '📉', color: 'text-red-400' },
};

const DeltaBadge = ({ delta }: { delta: number }) => {
  if (delta === 0) {
    return <span className="text-gray-500 text-sm font-medium">—</span>;
  }
  const up = delta > 0;
  return (
    <span className={`text-sm font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  );
};

const SkillChip = ({ change }: { change: SkillChange }) => {
  const diff = change.after - change.before;
  if (diff === 0) return null;
  const up = diff > 0;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
        up
          ? 'bg-green-900/30 border-green-800/50 text-green-300'
          : 'bg-red-900/30 border-red-800/50 text-red-300'
      }`}
    >
      {change.skill} {up ? '+' : ''}
      {diff}
    </span>
  );
};

export const DevelopmentReportScreen = () => {
  const {
    lastDevelopmentReport,
    players,
    teams,
    playerTeamId,
    season,
    continueToAuctionPhase,
  } = useGameStore();

  const playerTeam = teams.find((t) => t.id === playerTeamId);

  const reportById = useMemo(() => {
    const m = new Map<string, PlayerDevelopmentResult>();
    (lastDevelopmentReport || []).forEach((r) => m.set(r.playerId, r));
    return m;
  }, [lastDevelopmentReport]);

  // Your current squad's development, biggest movers first.
  const squadReports = useMemo(() => {
    if (!playerTeam) return [];
    return playerTeam.squad
      .map((id) => reportById.get(id))
      .filter((r): r is PlayerDevelopmentResult => !!r)
      .sort((a, b) => b.delta - a.delta);
  }, [playerTeam, reportById]);

  // Notable risers from the rest of the league (excludes your squad).
  const leagueMovers = useMemo(() => {
    const squadIds = new Set(playerTeam?.squad || []);
    return (lastDevelopmentReport || [])
      .filter((r) => !squadIds.has(r.playerId) && r.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
  }, [lastDevelopmentReport, playerTeam]);

  const improved = squadReports.filter((r) => r.delta > 0).length;
  const declined = squadReports.filter((r) => r.delta < 0).length;

  const renderRow = (r: PlayerDevelopmentResult, showTeam = false) => {
    const player = players.find((p) => p.id === r.playerId);
    if (!player) return null;
    const band = BAND_META[r.band];
    const team = showTeam ? teams.find((t) => t.squad.includes(r.playerId)) : null;
    const topChanges = r.changes.slice(0, 3);

    return (
      <div
        key={r.playerId}
        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-700/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{player.shortName}</span>
            <span className="text-[10px] text-gray-500">
              {band.emoji} {r.ageAfter}y
            </span>
            {team && <span className="text-[10px] text-gray-600">{team.shortName}</span>}
            {player.trainingFocus && player.trainingFocus !== 'balanced' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-900/40 border border-teal-800/50 text-teal-300">
                {FOCUS_LABELS[player.trainingFocus]}
              </span>
            )}
          </div>
          {topChanges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {topChanges.map((c) => (
                <SkillChip key={`${c.category}-${c.skill}`} change={c} />
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-400">
            {r.overallBefore} → <span className="text-white font-semibold">{r.overallAfter}</span>
          </div>
          <DeltaBadge delta={r.delta} />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      <header className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 border-b border-indigo-700">
        <div className="max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-bold mb-1">Off-Season Development</h1>
          <p className="text-indigo-200 text-sm">
            How your players changed over Season {season - 1}
          </p>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Summary */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-400">{improved}</div>
              <div className="text-xs text-gray-500">Improved</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{declined}</div>
              <div className="text-xs text-gray-500">Declined</div>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 text-center mt-3">
            Young players grow toward their potential; veterans lose pace and power first.
            Game time and form-season output speed up development.
          </p>
        </div>

        {/* Your squad */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">YOUR SQUAD</h3>
          {squadReports.length > 0 ? (
            <div className="space-y-1.5">{squadReports.map((r) => renderRow(r))}</div>
          ) : (
            <p className="text-sm text-gray-500">No development data available.</p>
          )}
        </div>

        {/* League movers */}
        {leagueMovers.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 mb-1">RISING AROUND THE LEAGUE</h3>
            <p className="text-[11px] text-gray-600 mb-3">Breakout players to watch at the auction.</p>
            <div className="space-y-1.5">{leagueMovers.map((r) => renderRow(r, true))}</div>
          </div>
        )}

        {/* Continue */}
        <button
          onClick={() => continueToAuctionPhase()}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-4 rounded-lg font-bold text-lg transition-colors shadow-lg"
        >
          Continue to Auction
        </button>
      </div>
    </div>
  );
};
