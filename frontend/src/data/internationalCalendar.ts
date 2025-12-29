import { Country, MatchFormat } from '../types';
import { v4 as uuid } from 'uuid';
import { COUNTRIES } from './countries';

// ============================================
// INTERNATIONAL CALENDAR TYPES
// ============================================

export type SeriesVenue = 'home' | 'away' | 'neutral';

export interface Series {
  id: string;
  name: string;
  opponent: Country;
  venue: SeriesVenue;
  format: MatchFormat;
  matches: number;
  startMonth: number;  // 1-12
  year: number;
  trophy?: string;  // e.g., "Border-Gavaskar Trophy"
}

export interface ICCEvent {
  id: string;
  name: string;
  format: MatchFormat;
  year: number;
  month: number;
  hostCountries: Country[];
  participatingTeams: number;
  stages: TournamentStage[];
}

export interface TournamentStage {
  name: string;  // "Group Stage", "Super 8", "Semi-Finals", "Final"
  matches: number;  // Approximate matches for the player's team
}

export interface InternationalMatch {
  id: string;
  seriesId: string;
  matchNumber: number;
  format: MatchFormat;
  opponent: Country;
  venue: string;
  venueName: string;
  isHome: boolean;
  status: 'upcoming' | 'live' | 'completed';
  result?: string;
}

export interface InternationalSeason {
  year: number;
  series: Series[];
  iccEvents: ICCEvent[];
}

// ============================================
// FAMOUS BILATERAL SERIES / TROPHIES
// ============================================

export const BILATERAL_TROPHIES: Record<string, { teams: [Country, Country]; name: string }> = {
  'border-gavaskar': { teams: ['IND', 'AUS'], name: 'Border-Gavaskar Trophy' },
  'ashes': { teams: ['ENG', 'AUS'], name: 'The Ashes' },
  'wisden': { teams: ['ENG', 'WI'], name: 'Wisden Trophy' },
  'anthony-de-mello': { teams: ['IND', 'ENG'], name: 'Anthony de Mello Trophy' },
  'freedom': { teams: ['SA', 'IND'], name: 'Freedom Trophy' },
  'chappell-hadlee': { teams: ['AUS', 'NZ'], name: 'Chappell-Hadlee Trophy' },
  'basil-d-oliveira': { teams: ['ENG', 'SA'], name: "Basil D'Oliveira Trophy" },
  'frank-worrell': { teams: ['AUS', 'WI'], name: 'Frank Worrell Trophy' },
  'warne-muralitharan': { teams: ['AUS', 'SL'], name: 'Warne-Muralitharan Trophy' },
};

// ============================================
// INTERNATIONAL VENUES BY COUNTRY
// ============================================

export const INTERNATIONAL_VENUES: Record<Country, { name: string; city: string }[]> = {
  IND: [
    { name: 'Wankhede Stadium', city: 'Mumbai' },
    { name: 'M. Chinnaswamy Stadium', city: 'Bengaluru' },
    { name: 'Eden Gardens', city: 'Kolkata' },
    { name: 'MA Chidambaram Stadium', city: 'Chennai' },
    { name: 'Narendra Modi Stadium', city: 'Ahmedabad' },
    { name: 'Arun Jaitley Stadium', city: 'Delhi' },
    { name: 'HPCA Stadium', city: 'Dharamsala' },
    { name: 'Rajiv Gandhi International Stadium', city: 'Hyderabad' },
  ],
  AUS: [
    { name: 'Melbourne Cricket Ground', city: 'Melbourne' },
    { name: 'Sydney Cricket Ground', city: 'Sydney' },
    { name: 'The Gabba', city: 'Brisbane' },
    { name: 'Adelaide Oval', city: 'Adelaide' },
    { name: 'WACA Ground', city: 'Perth' },
    { name: 'Optus Stadium', city: 'Perth' },
  ],
  ENG: [
    { name: "Lord's Cricket Ground", city: 'London' },
    { name: 'The Oval', city: 'London' },
    { name: 'Old Trafford', city: 'Manchester' },
    { name: 'Edgbaston', city: 'Birmingham' },
    { name: 'Headingley', city: 'Leeds' },
    { name: 'Trent Bridge', city: 'Nottingham' },
  ],
  PAK: [
    { name: 'National Stadium', city: 'Karachi' },
    { name: 'Gaddafi Stadium', city: 'Lahore' },
    { name: 'Rawalpindi Cricket Stadium', city: 'Rawalpindi' },
    { name: 'Multan Cricket Stadium', city: 'Multan' },
  ],
  WI: [
    { name: "Queen's Park Oval", city: 'Port of Spain' },
    { name: 'Kensington Oval', city: 'Bridgetown' },
    { name: 'Sabina Park', city: 'Kingston' },
    { name: 'Providence Stadium', city: 'Guyana' },
  ],
  SA: [
    { name: 'Newlands', city: 'Cape Town' },
    { name: 'The Wanderers', city: 'Johannesburg' },
    { name: 'SuperSport Park', city: 'Centurion' },
    { name: 'Kingsmead', city: 'Durban' },
  ],
  NZ: [
    { name: 'Basin Reserve', city: 'Wellington' },
    { name: 'Eden Park', city: 'Auckland' },
    { name: 'Hagley Oval', city: 'Christchurch' },
    { name: 'Seddon Park', city: 'Hamilton' },
  ],
  SL: [
    { name: 'R. Premadasa Stadium', city: 'Colombo' },
    { name: 'Galle International Stadium', city: 'Galle' },
    { name: 'Pallekele Stadium', city: 'Kandy' },
  ],
  BAN: [
    { name: 'Sher-e-Bangla Stadium', city: 'Dhaka' },
    { name: 'Zahur Ahmed Chowdhury Stadium', city: 'Chittagong' },
    { name: 'Sylhet International Stadium', city: 'Sylhet' },
  ],
  ZIM: [
    { name: 'Harare Sports Club', city: 'Harare' },
    { name: 'Queens Sports Club', city: 'Bulawayo' },
  ],
  AFG: [
    { name: 'Greater Noida Sports Complex', city: 'Greater Noida' },
    { name: 'Sharjah Cricket Stadium', city: 'Sharjah' },
  ],
  IRE: [
    { name: 'Malahide Cricket Club', city: 'Dublin' },
    { name: 'Stormont', city: 'Belfast' },
  ],
};

// ============================================
// ICC EVENTS TEMPLATES
// ============================================

export const ICC_EVENT_TEMPLATES = {
  t20WorldCup: {
    name: 'ICC T20 World Cup',
    format: 't20' as MatchFormat,
    participatingTeams: 20,
    stages: [
      { name: 'Group Stage', matches: 4 },
      { name: 'Super 8', matches: 3 },
      { name: 'Semi-Final', matches: 1 },
      { name: 'Final', matches: 1 },
    ],
  },
  odiWorldCup: {
    name: 'ICC Cricket World Cup',
    format: 'odi' as MatchFormat,
    participatingTeams: 10,
    stages: [
      { name: 'Round Robin', matches: 9 },
      { name: 'Semi-Final', matches: 1 },
      { name: 'Final', matches: 1 },
    ],
  },
  championsTrophy: {
    name: 'ICC Champions Trophy',
    format: 'odi' as MatchFormat,
    participatingTeams: 8,
    stages: [
      { name: 'Group Stage', matches: 3 },
      { name: 'Semi-Final', matches: 1 },
      { name: 'Final', matches: 1 },
    ],
  },
  wtc: {
    name: 'ICC World Test Championship Final',
    format: 'test' as MatchFormat,
    participatingTeams: 2,
    stages: [
      { name: 'Final', matches: 1 },
    ],
  },
};

// ============================================
// CALENDAR GENERATION
// ============================================

/**
 * Generate a realistic international calendar for a country.
 * Includes bilateral series and ICC events.
 */
export function generateInternationalCalendar(
  playerCountry: Country,
  startYear: number = 2025
): InternationalSeason {
  const series: Series[] = [];
  const iccEvents: ICCEvent[] = [];

  // Get other full member countries to schedule series against
  const opponents = Object.keys(COUNTRIES).filter(
    c => c !== playerCountry && COUNTRIES[c as Country].testStatus === 'full'
  ) as Country[];

  // Shuffle opponents for variety
  const shuffledOpponents = [...opponents].sort(() => Math.random() - 0.5);

  // Schedule template for a year:
  // Jan-Feb: Home Test series OR Away tour
  // Mar-May: IPL break (if India) / Domestic break
  // Jun-Jul: Away tour OR Home series
  // Aug-Sep: Home/Away bilateral
  // Oct-Nov: T20/ODI series
  // Dec: Short T20 series

  let seriesMonth = 1;

  // 1. Jan-Feb: Major Test series (home)
  const testOpponent1 = shuffledOpponents[0];
  series.push({
    id: uuid(),
    name: `${COUNTRIES[playerCountry].name} vs ${COUNTRIES[testOpponent1].name} Test Series`,
    opponent: testOpponent1,
    venue: 'home',
    format: 'test',
    matches: 3,
    startMonth: 1,
    year: startYear,
    trophy: getTrophyName(playerCountry, testOpponent1, 'test'),
  });

  // 2. Jun-Jul: Away Test tour
  const testOpponent2 = shuffledOpponents[1];
  series.push({
    id: uuid(),
    name: `${COUNTRIES[testOpponent2].name} vs ${COUNTRIES[playerCountry].name} Test Series`,
    opponent: testOpponent2,
    venue: 'away',
    format: 'test',
    matches: 3,
    startMonth: 6,
    year: startYear,
    trophy: getTrophyName(playerCountry, testOpponent2, 'test'),
  });

  // 3. Aug: Home ODI series
  const odiOpponent1 = shuffledOpponents[2];
  series.push({
    id: uuid(),
    name: `${COUNTRIES[playerCountry].name} vs ${COUNTRIES[odiOpponent1].name} ODI Series`,
    opponent: odiOpponent1,
    venue: 'home',
    format: 'odi',
    matches: 3,
    startMonth: 8,
    year: startYear,
  });

  // 4. Sep: Away ODI series
  const odiOpponent2 = shuffledOpponents[3];
  series.push({
    id: uuid(),
    name: `${COUNTRIES[odiOpponent2].name} vs ${COUNTRIES[playerCountry].name} ODI Series`,
    opponent: odiOpponent2,
    venue: 'away',
    format: 'odi',
    matches: 3,
    startMonth: 9,
    year: startYear,
  });

  // 5. Oct: Home T20I series
  const t20Opponent1 = shuffledOpponents[4];
  series.push({
    id: uuid(),
    name: `${COUNTRIES[playerCountry].name} vs ${COUNTRIES[t20Opponent1].name} T20I Series`,
    opponent: t20Opponent1,
    venue: 'home',
    format: 't20',
    matches: 3,
    startMonth: 10,
    year: startYear,
  });

  // 6. Nov: Away T20I series
  const t20Opponent2 = shuffledOpponents[5];
  series.push({
    id: uuid(),
    name: `${COUNTRIES[t20Opponent2].name} vs ${COUNTRIES[playerCountry].name} T20I Series`,
    opponent: t20Opponent2,
    venue: 'away',
    format: 't20',
    matches: 3,
    startMonth: 11,
    year: startYear,
  });

  // 7. Dec: Short home T20 series
  const t20Opponent3 = shuffledOpponents[6] || shuffledOpponents[0];
  series.push({
    id: uuid(),
    name: `${COUNTRIES[playerCountry].name} vs ${COUNTRIES[t20Opponent3].name} T20I Series`,
    opponent: t20Opponent3,
    venue: 'home',
    format: 't20',
    matches: 2,
    startMonth: 12,
    year: startYear,
  });

  // Add ICC event (every other year has a major event)
  // For demo, add a T20 World Cup in October
  if (startYear % 2 === 0) {
    iccEvents.push({
      id: uuid(),
      name: `ICC T20 World Cup ${startYear}`,
      format: 't20',
      year: startYear,
      month: 10,
      hostCountries: ['AUS', 'NZ'],
      participatingTeams: 20,
      stages: ICC_EVENT_TEMPLATES.t20WorldCup.stages,
    });
  } else {
    // Champions Trophy or ODI World Cup
    iccEvents.push({
      id: uuid(),
      name: `ICC Champions Trophy ${startYear}`,
      format: 'odi',
      year: startYear,
      month: 6,
      hostCountries: ['PAK'],
      participatingTeams: 8,
      stages: ICC_EVENT_TEMPLATES.championsTrophy.stages,
    });
  }

  // Add WTC Final
  iccEvents.push({
    id: uuid(),
    name: `ICC World Test Championship Final ${startYear}`,
    format: 'test',
    year: startYear,
    month: 6,
    hostCountries: ['ENG'],
    participatingTeams: 2,
    stages: ICC_EVENT_TEMPLATES.wtc.stages,
  });

  return {
    year: startYear,
    series: series.sort((a, b) => a.startMonth - b.startMonth),
    iccEvents: iccEvents.sort((a, b) => a.month - b.month),
  };
}

/**
 * Get the trophy name for a bilateral series between two countries.
 */
function getTrophyName(country1: Country, country2: Country, format: MatchFormat): string | undefined {
  if (format !== 'test') return undefined;

  for (const trophy of Object.values(BILATERAL_TROPHIES)) {
    if (
      (trophy.teams[0] === country1 && trophy.teams[1] === country2) ||
      (trophy.teams[0] === country2 && trophy.teams[1] === country1)
    ) {
      return trophy.name;
    }
  }
  return undefined;
}

/**
 * Generate individual matches from a series.
 */
export function generateSeriesMatches(
  series: Series,
  playerCountry: Country
): InternationalMatch[] {
  const matches: InternationalMatch[] = [];
  const isHome = series.venue === 'home';
  const hostCountry = isHome ? playerCountry : series.opponent;
  const venues = INTERNATIONAL_VENUES[hostCountry] || INTERNATIONAL_VENUES.IND;

  for (let i = 0; i < series.matches; i++) {
    const venueIndex = i % venues.length;
    const venue = venues[venueIndex];

    matches.push({
      id: uuid(),
      seriesId: series.id,
      matchNumber: i + 1,
      format: series.format,
      opponent: series.opponent,
      venue: hostCountry,
      venueName: venue.name,
      isHome,
      status: 'upcoming',
    });
  }

  return matches;
}

/**
 * Get a summary of the international calendar.
 */
export function getCalendarSummary(season: InternationalSeason): {
  totalSeries: number;
  totalMatches: number;
  testMatches: number;
  odiMatches: number;
  t20Matches: number;
  iccEvents: number;
} {
  let testMatches = 0;
  let odiMatches = 0;
  let t20Matches = 0;

  for (const s of season.series) {
    switch (s.format) {
      case 'test':
        testMatches += s.matches;
        break;
      case 'odi':
        odiMatches += s.matches;
        break;
      case 't20':
        t20Matches += s.matches;
        break;
    }
  }

  // Add ICC event matches
  for (const event of season.iccEvents) {
    const eventMatches = event.stages.reduce((sum, stage) => sum + stage.matches, 0);
    switch (event.format) {
      case 'test':
        testMatches += eventMatches;
        break;
      case 'odi':
        odiMatches += eventMatches;
        break;
      case 't20':
        t20Matches += eventMatches;
        break;
    }
  }

  return {
    totalSeries: season.series.length,
    totalMatches: testMatches + odiMatches + t20Matches,
    testMatches,
    odiMatches,
    t20Matches,
    iccEvents: season.iccEvents.length,
  };
}

/**
 * Get upcoming fixtures for the current month.
 */
export function getUpcomingFixtures(
  season: InternationalSeason,
  currentMonth: number
): Series[] {
  return season.series.filter(s => s.startMonth >= currentMonth && s.startMonth <= currentMonth + 2);
}