import React from 'react';
import { useGameStore } from '../store/gameStore';
import { COUNTRIES } from '../data/countries';

const MATCH_TYPE_LABELS: Record<string, string> = {
  league: 'League Match',
  qualifier1: 'Qualifier 1',
  eliminator: 'Eliminator',
  qualifier2: 'Qualifier 2',
  final: 'FINAL',
};

const FORMAT_LABELS: Record<string, string> = {
  t20: 'T20I',
  odi: 'ODI',
  test: 'Test',
};

export const HomeScreen = () => {
  const {
    gameMode,
    country,
    manager,
    playerTeamId,
    teams,
    players,
    fixtures,
    pointsTable,
    activeEvents,
    phase,
    season,
    internationalCalendar,
    navigateTo,
    selectMatch,
    selectEvent,
    getSeasonResult,
    checkAndStartPlayoffs,
    startInternationalMatch,
  } = useGameStore();

  // International Mode Home
  if (gameMode === 'international' && country) {
    const countryConfig = COUNTRIES[country];
    const currentMonth = new Date().getMonth() + 1; // 1-12

    // Helper to check if a series has been started (has at least one match fixture)
    const getSeriesMatchCount = (seriesId: string) => {
      return fixtures.filter(f => f.id.includes(seriesId)).length;
    };

    // Get upcoming series from calendar (not yet started)
    const upcomingSeries = internationalCalendar?.series
      .filter(s => s.startMonth >= currentMonth && getSeriesMatchCount(s.id) === 0)
      .slice(0, 3) || [];

    // Find the ACTIVE series (has started but not completed)
    const currentSeries = internationalCalendar?.series
      .find(s => {
        const matchesPlayed = getSeriesMatchCount(s.id);
        // Series is "current" if it has started (matchesPlayed > 0) but not finished
        return matchesPlayed > 0 && matchesPlayed < s.matches;
      });

    // Get ICC events
    const upcomingIccEvents = internationalCalendar?.iccEvents || [];

    return (
      <div className="min-h-screen bg-gray-900 text-white pb-24 lg:pb-4">
        {/* Header */}
        <header className="bg-gradient-to-r from-blue-900 to-indigo-900 p-4 border-b border-blue-700">
          <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{countryConfig?.flag}</div>
              <div>
                <h1 className="text-xl font-bold">{countryConfig?.name} Cricket</h1>
                <p className="text-sm text-blue-300">Head Coach: {manager.name}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-300">ICC Rankings</div>
              <div className="text-xs text-gray-400">
                T20: #{countryConfig?.iccRanking.t20} • ODI: #{countryConfig?.iccRanking.odi}
                {countryConfig?.iccRanking.test && ` • Test: #${countryConfig.iccRanking.test}`}
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto p-4 md:p-6">
          {/* Responsive grid: 1 col mobile, 2 col tablet, 3 col desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">

          {/* Play Next Match - Primary Action - spans 2 cols on larger screens */}
          {(() => {
            // Find the next series that has matches remaining
            const allSeries = internationalCalendar?.series || [];

            // Helper to check if a series has matches remaining (only count completed matches)
            const getSeriesProgress = (series: typeof allSeries[0]) => {
              const matchesPlayed = fixtures.filter(f => f.id.includes(series.id) && f.status === 'completed').length;
              return { matchesPlayed, remaining: series.matches - matchesPlayed };
            };

            // Sort series by start month to play in chronological order
            const sortedSeries = [...allSeries].sort((a, b) => a.startMonth - b.startMonth);

            // Find first series (chronologically) with matches remaining
            const nextAvailableSeries = sortedSeries.find(s => getSeriesProgress(s).remaining > 0);

            if (!nextAvailableSeries) {
              // All series complete - full width
              return (
                <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-xl p-4 md:p-6 border border-green-700 text-center">
                  <div className="text-2xl mb-2">🏆</div>
                  <h3 className="text-lg font-bold text-green-400">Season Complete!</h3>
                  <p className="text-sm text-gray-400 mt-2">You've completed all scheduled series.</p>
                </div>
              );
            }

            const { matchesPlayed, remaining } = getSeriesProgress(nextAvailableSeries);
            const nextMatchNum = matchesPlayed + 1;

            return (
            <div className="lg:col-span-2 bg-gradient-to-r from-blue-900/50 to-indigo-900/50 rounded-xl p-4 md:p-6 border border-blue-700">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-blue-400">
                  MATCH {nextMatchNum} OF {nextAvailableSeries.matches}
                </span>
                <span className="text-xs bg-blue-600 px-2 py-1 rounded">
                  {FORMAT_LABELS[nextAvailableSeries.format]}
                </span>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-3xl">{countryConfig?.flag}</div>
                <div className="text-gray-500 text-lg">vs</div>
                <div className="text-3xl">
                  {COUNTRIES[nextAvailableSeries.opponent]?.flag}
                </div>
              </div>
              <div className="text-sm text-gray-400 text-center mb-3">
                {nextAvailableSeries.name}
                {nextAvailableSeries.trophy && (
                  <span className="text-yellow-400 ml-2">
                    {nextAvailableSeries.trophy}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  startInternationalMatch(nextAvailableSeries.id, nextMatchNum);
                  navigateTo('match-prep');
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition-colors"
              >
                Play Match
              </button>
            </div>
            );
          })()}

          {/* Current/Next Series Info */}
          {currentSeries ? (
            <div className="bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-xl p-4 border border-green-700">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-green-400">ONGOING SERIES</span>
                <span className="text-xs bg-green-600 px-2 py-1 rounded">{FORMAT_LABELS[currentSeries.format]}</span>
              </div>
              <h3 className="text-lg font-bold mb-2">{currentSeries.name}</h3>
              {currentSeries.trophy && (
                <div className="text-sm text-yellow-400 mb-2">{currentSeries.trophy}</div>
              )}
              <div className="flex items-center justify-between text-sm text-gray-400">
                <span>{currentSeries.matches} Matches</span>
                <span className="capitalize">{currentSeries.venue} Series</span>
              </div>
              <button
                onClick={() => navigateTo('schedule')}
                className="w-full mt-3 bg-green-600/50 hover:bg-green-600 text-white py-2 rounded-lg font-medium transition-colors"
              >
                View Full Series
              </button>
            </div>
          ) : upcomingSeries.length > 0 ? (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">UPCOMING SERIES</h3>
              {upcomingSeries.slice(0, 2).map(series => (
                <div key={series.id} className="flex items-center gap-3 mb-3 last:mb-0">
                  <div className="text-xl">{COUNTRIES[series.opponent]?.flag}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{series.name}</div>
                    <div className="text-xs text-gray-400">
                      {FORMAT_LABELS[series.format]} • {series.matches} Matches
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => navigateTo('schedule')}
                className="w-full mt-2 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium transition-colors"
              >
                View Calendar
              </button>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
              <p className="text-gray-400">No upcoming series scheduled</p>
            </div>
          )}

          {/* ICC Events */}
          {upcomingIccEvents.length > 0 && (
            <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-4 border border-purple-700">
              <h3 className="text-sm font-semibold text-purple-400 mb-3">ICC EVENTS</h3>
              {upcomingIccEvents.slice(0, 2).map(event => (
                <div key={event.id} className="flex items-center justify-between py-2 border-b border-purple-800/50 last:border-0">
                  <div>
                    <div className="font-medium text-sm">{event.name}</div>
                    <div className="text-xs text-gray-400">
                      {event.hostCountries.map(c => COUNTRIES[c]?.flag).join(' ')} • {FORMAT_LABELS[event.format]}
                    </div>
                  </div>
                  <div className="text-xs text-purple-300">
                    {event.participatingTeams} Teams
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manager Stats */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">YOUR RECORD</h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-blue-400">{manager.history.testSeriesWon}</div>
                <div className="text-xs text-gray-500">Test W</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-400">{manager.history.odiSeriesWon}</div>
                <div className="text-xs text-gray-500">ODI W</div>
              </div>
              <div>
                <div className="text-lg font-bold text-purple-400">{manager.history.t20SeriesWon}</div>
                <div className="text-xs text-gray-500">T20 W</div>
              </div>
              <div>
                <div className="text-lg font-bold text-yellow-400">{manager.history.iccEventsWon}</div>
                <div className="text-xs text-gray-500">ICC</div>
              </div>
            </div>
          </div>

          {/* Quick Links - each takes 1 col */}
          <button
            onClick={() => navigateTo('schedule')}
            className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
          >
            <div className="text-lg md:text-xl mb-1">📅</div>
            <div className="text-sm md:text-base font-medium">Calendar</div>
            <div className="text-xs text-gray-500">Series & ICC events</div>
          </button>
          <button
            onClick={() => navigateTo('squad')}
            className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
          >
            <div className="text-lg md:text-xl mb-1">👥</div>
            <div className="text-sm md:text-base font-medium">Squad</div>
            <div className="text-xs text-gray-500">National team pool</div>
          </button>

          {/* Reputation - full width on desktop */}
          <div className="lg:col-span-3 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">International Reputation</span>
              <span className="font-bold text-blue-400">{manager.reputation.international}</span>
            </div>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${manager.reputation.international}%` }}
              />
            </div>
          </div>

          </div> {/* End of grid */}
        </div>
      </div>
    );
  }

  const playerTeam = teams.find((t) => t.id === playerTeamId);
  const teamPlayers = players.filter((p) => playerTeam?.squad.includes(p.id));

  // Check if playoffs should start
  React.useEffect(() => {
    if (phase === 'season') {
      const leagueMatches = fixtures.filter(
        (m) => m.matchType === 'league' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
      );
      const allComplete = leagueMatches.every((m) => m.status === 'completed');
      if (allComplete && leagueMatches.length > 0) {
        checkAndStartPlayoffs();
      }
    }
  }, [fixtures, phase, playerTeamId, checkAndStartPlayoffs]);

  const nextMatch = fixtures.find(
    (m) => m.status === 'upcoming' && (m.homeTeam === playerTeamId || m.awayTeam === playerTeamId)
  );

  const opponent = nextMatch
    ? teams.find((t) => t.id === (nextMatch.homeTeam === playerTeamId ? nextMatch.awayTeam : nextMatch.homeTeam))
    : null;

  const seasonResult = getSeasonResult();

  // Calculate squad averages
  const avgMorale = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.morale, 0) / teamPlayers.length)
    : 0;
  const avgFitness = teamPlayers.length
    ? Math.round(teamPlayers.reduce((sum, p) => sum + p.fitness, 0) / teamPlayers.length)
    : 0;

  // Players with serious concerns (urgent only)
  const concerns = teamPlayers.filter(
    (p) => p.fatigue > 80 || p.form < -10 || p.fitness < 50 || p.morale < 40
  );

  // Unresolved events
  const unresolvedEvents = activeEvents.filter((e) => !e.resolved);

  // Get position in table
  const sortedTable = [...pointsTable].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.netRunRate - a.netRunRate;
  });
  const tablePosition = sortedTable.findIndex((e) => e.teamId === playerTeamId) + 1;
  const tableEntry = pointsTable.find((e) => e.teamId === playerTeamId);

  const handlePrepareMatch = () => {
    if (nextMatch) {
      selectMatch(nextMatch.id);
      navigateTo('match-prep');
    }
  };

  const handleEventClick = (eventId: string) => {
    selectEvent(eventId);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24 lg:pb-4">
      {/* Header */}
      <header className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">{playerTeam?.name || 'Cricket Manager'}</h1>
            <p className="text-sm text-gray-400">Season {season} • {manager.name}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl md:text-3xl font-bold">#{tablePosition}</div>
            <div className="text-xs md:text-sm text-gray-400">
              {tableEntry?.won || 0}W {tableEntry?.lost || 0}L
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto p-4 md:p-6">
        {/* Responsive grid: 1 col mobile, 2 col tablet, 3 col desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">

        {/* Season Complete Card - full width */}
        {phase === 'off-season' && (
          <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-r from-yellow-900/50 to-amber-900/50 rounded-xl p-6 border border-yellow-700">
            <h2 className="text-xl font-bold text-center mb-4">Season Complete!</h2>
            {seasonResult && (
              <div className="text-center space-y-2">
                {seasonResult.playerFinish === 1 ? (
                  <div className="text-2xl text-yellow-400 font-bold">CHAMPIONS!</div>
                ) : seasonResult.playerFinish === 2 ? (
                  <div className="text-xl text-gray-300">Runners Up</div>
                ) : seasonResult.playerFinish <= 4 ? (
                  <div className="text-lg text-gray-400">Finished #{seasonResult.playerFinish} (Playoffs)</div>
                ) : (
                  <div className="text-lg text-gray-400">Finished #{seasonResult.playerFinish} (Missed Playoffs)</div>
                )}
                {seasonResult.champion && (
                  <div className="text-sm text-gray-500 mt-2">
                    Champion: {teams.find((t) => t.id === seasonResult.champion)?.name}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => navigateTo('season-summary')}
              className="w-full mt-4 bg-yellow-600 hover:bg-yellow-700 text-white py-3 rounded-lg font-medium transition-colors"
            >
              View Season Summary
            </button>
          </div>
        )}

        {/* Next Match Card - spans 2 cols on desktop for prominence */}
        {nextMatch && opponent && phase !== 'off-season' && (
          <div className={`lg:col-span-2 rounded-xl p-4 md:p-6 border ${
            nextMatch.matchType !== 'league'
              ? 'bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-purple-700'
              : 'bg-gray-800 border-gray-700'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <span className={`text-sm font-medium ${nextMatch.matchType !== 'league' ? 'text-purple-400' : 'text-gray-400'}`}>
                {MATCH_TYPE_LABELS[nextMatch.matchType] || 'NEXT MATCH'}
              </span>
              {nextMatch.matchType === 'league' && (
                <span className="text-sm text-blue-400">Match {nextMatch.matchNumber}</span>
              )}
              {nextMatch.matchType !== 'league' && (
                <span className="text-xs bg-purple-600 px-2 py-1 rounded">PLAYOFFS</span>
              )}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="text-center flex-1">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold"
                  style={{ backgroundColor: playerTeam?.colors.primary }}
                >
                  {playerTeam?.shortName}
                </div>
                <div className="text-sm font-medium">{playerTeam?.shortName}</div>
              </div>

              <div className="text-gray-500 text-lg px-4">vs</div>

              <div className="text-center flex-1">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center text-lg font-bold"
                  style={{ backgroundColor: opponent.colors.primary }}
                >
                  {opponent.shortName}
                </div>
                <div className="text-sm">{opponent.shortName}</div>
              </div>
            </div>

            <div className="text-center text-sm text-gray-400 mb-4">{nextMatch.venue}</div>

            <button
              onClick={handlePrepareMatch}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                nextMatch.matchType !== 'league'
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white`}
            >
              Prepare for Match
            </button>
          </div>
        )}

        {/* No upcoming match but season not over - show waiting message */}
        {!nextMatch && phase === 'playoffs' && (
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
            <p className="text-gray-400">Waiting for other playoff matches to complete...</p>
          </div>
        )}

        {/* Urgent Alerts */}
        {(unresolvedEvents.length > 0 || concerns.length > 0) && (
          <div className="bg-gray-800 rounded-xl p-4 border border-red-900/50">
            <h2 className="text-sm font-semibold text-red-400 mb-3">ATTENTION NEEDED</h2>

            {unresolvedEvents.map((event) => (
              <div
                key={event.id}
                onClick={() => handleEventClick(event.id)}
                className="flex items-center gap-3 p-3 bg-red-900/20 rounded-lg mb-2 cursor-pointer hover:bg-red-900/30 transition-colors"
              >
                <span className="text-red-400 text-lg">!</span>
                <div>
                  <span className="text-sm font-medium">{event.title}</span>
                  <span className="text-xs text-gray-500 ml-2">Tap to resolve</span>
                </div>
              </div>
            ))}

            {concerns.slice(0, 2).map((player) => (
              <div
                key={player.id}
                onClick={() => navigateTo('squad')}
                className="flex items-center justify-between p-3 bg-yellow-900/20 rounded-lg mb-2 cursor-pointer hover:bg-yellow-900/30"
              >
                <span className="text-sm">{player.shortName}</span>
                <div className="flex gap-2 text-xs">
                  {player.fatigue > 80 && <span className="text-orange-400">Exhausted</span>}
                  {player.form < -10 && <span className="text-red-400">Poor form</span>}
                  {player.fitness < 50 && <span className="text-yellow-400">Injured</span>}
                  {player.morale < 40 && <span className="text-purple-400">Unhappy</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Status */}
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 hidden md:block">SQUAD STATUS</h3>
          <div className="flex items-center justify-between md:justify-around">
            <div className="flex items-center gap-6 md:gap-8">
              <div className="text-center">
                <div className={`text-lg md:text-xl font-bold ${avgMorale > 70 ? 'text-green-400' : avgMorale < 50 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {avgMorale}
                </div>
                <div className="text-xs text-gray-500">Morale</div>
              </div>
              <div className="text-center">
                <div className={`text-lg md:text-xl font-bold ${avgFitness > 70 ? 'text-green-400' : avgFitness < 50 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {avgFitness}
                </div>
                <div className="text-xs text-gray-500">Fitness</div>
              </div>
              <div className="text-center">
                <div className="text-lg md:text-xl font-bold">{teamPlayers.length}</div>
                <div className="text-xs text-gray-500">Squad</div>
              </div>
            </div>
            <button
              onClick={() => navigateTo('club')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              More →
            </button>
          </div>
        </div>

        {/* Quick Links - each takes 1 col */}
        <button
          onClick={() => navigateTo('schedule')}
          className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
        >
          <div className="text-lg md:text-xl mb-1">📅</div>
          <div className="text-sm md:text-base font-medium">Schedule</div>
          <div className="text-xs text-gray-500">View fixtures & standings</div>
        </button>
        <button
          onClick={() => navigateTo('stats')}
          className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-left hover:bg-gray-700/50 transition-colors"
        >
          <div className="text-lg md:text-xl mb-1">📊</div>
          <div className="text-sm md:text-base font-medium">Stats</div>
          <div className="text-xs text-gray-500">Season leaderboards</div>
        </button>

        </div> {/* End of grid */}
      </div>
    </div>
  );
};
