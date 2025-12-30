import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { allPlayers, teams } from '../data';
import { generateFixtures } from '../data/fixtures';
import { GameStartMode, GameMode, League, Country, InternationalCalendar } from '../types';
import { formatSaveDate } from '../utils/saveManager';
import { LEAGUES, LeagueTeam, getAllLeagues } from '../data/leagues';
import { COUNTRIES, getAllCountries } from '../data/countries';
import { generateInternationalCalendar } from '../data/internationalCalendar';

// Feature flags - International mode enabled as BETA
const ENABLE_INTERNATIONAL_MODE = true;

type SetupStep = 'welcome' | 'mode-select' | 'league-select' | 'country-select' | 'team-select' | 'final-setup';

export const StartScreen = () => {
  const { loadInitialData, initializeGame, navigateTo, getSaveSlots, loadFromSlot, deleteSlot } = useGameStore();
  const [step, setStep] = useState<SetupStep>('welcome');
  const [gameMode, setGameMode] = useState<GameMode>('franchise');
  const [selectedLeague, setSelectedLeague] = useState<League>('ipl');
  const [selectedCountry, setSelectedCountry] = useState<Country>('IND');
  const [startMode, setStartMode] = useState<GameStartMode>('real-squads');
  const [managerName, setManagerName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('mi');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<1 | 2 | 3 | null>(null);

  const saveSlots = getSaveSlots();

  // Get teams based on selected league
  const leagueTeams = LEAGUES[selectedLeague]?.teams || [];
  const selectedTeamData = leagueTeams.find((t: LeagueTeam) => t.id === selectedTeam);
  const selectedCountryData = COUNTRIES[selectedCountry];

  const handleStartGame = () => {
    if (!managerName.trim()) return;

    if (gameMode === 'franchise') {
      // For now, only IPL has full player/team data
      // Other leagues will use IPL data with different team names
      const fixtures = generateFixtures(selectedTeam);
      loadInitialData(allPlayers, teams, fixtures);
      initializeGame(selectedTeam, managerName, startMode, 'franchise', selectedLeague);
    } else {
      // International mode - generate international calendar
      const intlCalendar = generateInternationalCalendar(selectedCountry, 2025);

      // Convert to the types/index.ts InternationalCalendar format
      const calendar: InternationalCalendar = {
        year: intlCalendar.year,
        series: intlCalendar.series.map(s => ({
          id: s.id,
          name: s.name,
          opponent: s.opponent,
          venue: s.venue,
          format: s.format,
          matches: s.matches,
          startMonth: s.startMonth,
          year: s.year,
          trophy: s.trophy,
          status: 'upcoming' as const,
        })),
        iccEvents: intlCalendar.iccEvents.map(e => ({
          id: e.id,
          name: e.name,
          format: e.format,
          year: e.year,
          month: e.month,
          hostCountries: e.hostCountries,
          participatingTeams: e.participatingTeams,
          stages: e.stages,
          status: 'upcoming' as const,
        })),
      };

      // For international mode, we still use a placeholder team but the UI will focus on calendar
      // Players will represent the national pool
      loadInitialData(allPlayers, teams, []);  // Empty fixtures - international uses calendar
      initializeGame(selectedTeam, managerName, 'real-squads', 'international', undefined, selectedCountry, calendar);
    }

    // Navigate based on mode
    if (startMode === 'mini-auction' && gameMode === 'franchise') {
      navigateTo('release-phase');
    } else if (startMode === 'mega-auction' && gameMode === 'franchise') {
      navigateTo('auction');
    } else {
      navigateTo('home');
    }
  };

  const handleLoadGame = (slotId: 1 | 2 | 3) => {
    const success = loadFromSlot(slotId);
    if (success) {
      // Navigation is handled by the store based on game phase
    }
  };

  const handleDeleteSave = (slotId: 1 | 2 | 3) => {
    deleteSlot(slotId);
    setShowDeleteConfirm(null);
  };

  const handleModeSelect = (mode: GameMode) => {
    setGameMode(mode);
    if (mode === 'franchise') {
      setStep('league-select');
    } else {
      setStep('country-select');
    }
  };

  const handleLeagueSelect = (league: League) => {
    setSelectedLeague(league);
    // Set first team as default
    const firstTeam = LEAGUES[league]?.teams[0];
    if (firstTeam) {
      setSelectedTeam(firstTeam.id);
    }
    setStep('team-select');
  };

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setStep('final-setup');
  };

  const handleTeamSelect = () => {
    setStep('final-setup');
  };

  const goBack = () => {
    switch (step) {
      case 'mode-select':
        setStep('welcome');
        break;
      case 'league-select':
      case 'country-select':
        setStep('mode-select');
        break;
      case 'team-select':
        setStep('league-select');
        break;
      case 'final-setup':
        if (gameMode === 'franchise') {
          setStep('team-select');
        } else {
          setStep('country-select');
        }
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Cricket Manager</h1>
          <p className="text-gray-400">Build your dynasty. Make tough calls. Win trophies.</p>
        </div>

        {/* Welcome Screen */}
        {step === 'welcome' && (
          <div className="space-y-4">
            {/* New Game Button */}
            <button
              onClick={() => setStep('mode-select')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              New Game
            </button>

            {/* Saved Games */}
            {saveSlots.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">Continue</h3>
                <div className="space-y-2">
                  {saveSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="bg-gray-700/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <button
                        onClick={() => handleLoadGame(slot.id)}
                        className="flex-1 text-left hover:text-blue-400 transition-colors"
                      >
                        <div className="font-medium">{slot.name}</div>
                        <div className="text-xs text-gray-400">
                          {slot.teamName} • Season {slot.season} • {slot.phase === 'auction' ? 'Auction' : `Match ${slot.matchDay}`}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatSaveDate(slot.savedAt)}
                        </div>
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(slot.id)}
                        className="ml-2 p-2 text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete save"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6">
                  <h3 className="font-bold mb-2">Delete Save?</h3>
                  <p className="text-sm text-gray-400 mb-4">
                    This cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(null)}
                      className="flex-1 bg-gray-700 text-white py-2 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteSave(showDeleteConfirm)}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode Selection */}
        {step === 'mode-select' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={goBack} className="text-blue-400 hover:text-blue-300">
                <span className="text-xl">&#8592;</span>
              </button>
              <h2 className="text-lg font-semibold">Select Game Mode</h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => handleModeSelect('franchise')}
                className="p-6 rounded-xl border-2 border-gray-700 hover:border-blue-500 bg-gray-700/30 hover:bg-blue-900/30 transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">&#127942;</div>
                  <div>
                    <div className="font-bold text-xl mb-1">Franchise Mode</div>
                    <div className="text-sm text-gray-400">
                      Manage a T20 league team. Build squads through auctions, compete for the title.
                    </div>
                    <div className="text-xs text-blue-400 mt-2">
                      IPL, BBL, CPL, PSL, T20 Blast
                    </div>
                  </div>
                </div>
              </button>

              {ENABLE_INTERNATIONAL_MODE ? (
                <button
                  onClick={() => handleModeSelect('international')}
                  className="p-6 rounded-xl border-2 border-gray-600 hover:border-green-500 bg-gray-700/20 text-left transition-all w-full relative"
                >
                  <div className="absolute top-2 right-2 bg-green-600 text-green-100 text-xs px-2 py-1 rounded-full font-bold">
                    BETA
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">&#127759;</div>
                    <div>
                      <div className="font-bold text-xl mb-1">International Mode</div>
                      <div className="text-sm text-gray-400">
                        Lead a national team across all formats. T20I, ODI, and Test cricket.
                      </div>
                      <div className="text-xs text-green-400 mt-2">
                        12 Full Member nations
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
                <div
                  className="p-6 rounded-xl border-2 border-gray-600 bg-gray-700/20 text-left opacity-60 cursor-not-allowed relative"
                >
                  <div className="absolute top-2 right-2 bg-yellow-600 text-yellow-100 text-xs px-2 py-1 rounded-full font-bold">
                    COMING SOON
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-4xl grayscale">&#127759;</div>
                    <div>
                      <div className="font-bold text-xl mb-1 text-gray-400">International Mode</div>
                      <div className="text-sm text-gray-500">
                        Lead a national team across all formats. T20I, ODI, and Test cricket.
                      </div>
                      <div className="text-xs text-gray-600 mt-2">
                        12 Full Member nations
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* League Selection (Franchise Mode) */}
        {step === 'league-select' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={goBack} className="text-blue-400 hover:text-blue-300">
                <span className="text-xl">&#8592;</span>
              </button>
              <h2 className="text-lg font-semibold">Select League</h2>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {getAllLeagues().map((league) => (
                <button
                  key={league.id}
                  onClick={() => handleLeagueSelect(league.id)}
                  className={`p-4 rounded-lg border-2 transition-all text-left flex items-center justify-between ${
                    league.id === 'ipl'
                      ? 'border-gray-600 hover:border-blue-500 bg-gray-700/50'
                      : 'border-gray-700 hover:border-gray-500 bg-gray-700/30 opacity-60'
                  }`}
                  disabled={league.id !== 'ipl'}
                >
                  <div>
                    <div className="font-semibold">{league.name}</div>
                    <div className="text-xs text-gray-400">
                      {league.teams.length} teams • {league.matchesPerTeam} matches/team
                    </div>
                  </div>
                  {league.id !== 'ipl' && (
                    <span className="text-xs bg-gray-600 px-2 py-1 rounded">Coming Soon</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Country Selection (International Mode) */}
        {step === 'country-select' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={goBack} className="text-blue-400 hover:text-blue-300">
                <span className="text-xl">&#8592;</span>
              </button>
              <h2 className="text-lg font-semibold">Select Country</h2>
            </div>

            <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto">
              {getAllCountries().map((country) => {
                // With the feature flag, all countries are enabled
                const isEnabled = ENABLE_INTERNATIONAL_MODE || country.id === 'IND';
                return (
                  <button
                    key={country.id}
                    onClick={() => handleCountrySelect(country.id)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      isEnabled
                        ? 'border-gray-600 hover:border-green-500 bg-gray-700/50'
                        : 'border-gray-700 hover:border-gray-500 bg-gray-700/30 opacity-60'
                    }`}
                    disabled={!isEnabled}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{country.flag}</span>
                      <div>
                        <div className="font-semibold text-sm">{country.name}</div>
                        {!isEnabled && (
                          <div className="text-xs text-gray-500">Coming Soon</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Team Selection (Franchise Mode) */}
        {step === 'team-select' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={goBack} className="text-blue-400 hover:text-blue-300">
                <span className="text-xl">&#8592;</span>
              </button>
              <h2 className="text-lg font-semibold">Select Team - {LEAGUES[selectedLeague].shortName}</h2>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {leagueTeams.map((team: LeagueTeam) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team.id)}
                  className={`p-2 rounded-lg border-2 transition-all ${
                    selectedTeam === team.id
                      ? 'border-blue-500 bg-blue-900/30'
                      : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full mx-auto mb-1 flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: team.colors.primary }}
                  >
                    {team.shortName}
                  </div>
                  <div className="text-xs text-center truncate">{team.shortName}</div>
                </button>
              ))}
            </div>

            {selectedTeamData && (
              <div className="text-sm text-gray-400 text-center">
                {selectedTeamData.name} • {selectedTeamData.homeCity}
              </div>
            )}

            <button
              onClick={handleTeamSelect}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* Final Setup */}
        {step === 'final-setup' && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={goBack} className="text-blue-400 hover:text-blue-300">
                <span className="text-xl">&#8592;</span>
              </button>
              <h2 className="text-lg font-semibold">
                {gameMode === 'franchise'
                  ? `${selectedTeamData?.name || 'Team'} - Setup`
                  : `${selectedCountryData?.name || 'Country'} - Setup`
                }
              </h2>
            </div>

            {/* Manager Name */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Manager Name</label>
              <input
                type="text"
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Auction Type Selection (Franchise Mode Only) */}
            {gameMode === 'franchise' && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">Starting Auction</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setStartMode('real-squads')}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      startMode === 'real-squads'
                        ? 'border-green-500 bg-green-900/30'
                        : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-semibold text-sm">No Auction</div>
                    <div className="text-xs text-gray-400 mt-1">Real squads</div>
                  </button>
                  <button
                    onClick={() => setStartMode('mini-auction')}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      startMode === 'mini-auction'
                        ? 'border-blue-500 bg-blue-900/30'
                        : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-semibold text-sm">Mini</div>
                    <div className="text-xs text-gray-400 mt-1">Tune squad</div>
                  </button>
                  <button
                    onClick={() => setStartMode('mega-auction')}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      startMode === 'mega-auction'
                        ? 'border-yellow-500 bg-yellow-900/30'
                        : 'border-gray-700 bg-gray-700/30 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-semibold text-sm">Mega</div>
                    <div className="text-xs text-gray-400 mt-1">Full rebuild</div>
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500 text-center">
                  {startMode === 'real-squads' && 'Start Season 1 with current rosters. First auction after the season.'}
                  {startMode === 'mini-auction' && 'Release players and bid on free agents before Season 1.'}
                  {startMode === 'mega-auction' && 'Retain up to 4 players, then rebuild your squad from scratch.'}
                </div>
              </div>
            )}

            {/* International Mode Info */}
            {gameMode === 'international' && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm text-gray-300 mb-2">You will manage:</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{selectedCountryData?.flag}</span>
                  <span className="font-semibold">{selectedCountryData?.name}</span>
                </div>
                <div className="text-xs text-gray-400">
                  All formats: T20I, ODI, and Test matches
                </div>
              </div>
            )}

            {/* Start Button */}
            <button
              onClick={handleStartGame}
              disabled={!managerName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-lg font-semibold text-lg transition-colors"
            >
              {gameMode === 'franchise'
                ? (startMode === 'real-squads'
                    ? 'Start Career'
                    : startMode === 'mini-auction'
                      ? 'Enter Mini Auction'
                      : 'Enter Mega Auction')
                : 'Start International Career'
              }
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-500">
          v0.9 Beta - Multi-Mode Update
        </p>
      </div>
    </div>
  );
};