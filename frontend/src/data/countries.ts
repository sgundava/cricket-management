import { Country, League } from '../types';

export interface CountryConfig {
  id: Country;
  name: string;
  shortName: string;
  flag: string;  // Emoji flag
  domesticLeague?: League;  // Links to franchise mode for career progression
  testStatus: 'full' | 'associate';
  iccRanking: {
    test?: number;
    odi: number;
    t20: number;
  };
  homeVenues: string[];
  colors: { primary: string; secondary: string };
}

export const COUNTRIES: Record<Country, CountryConfig> = {
  IND: {
    id: 'IND',
    name: 'India',
    shortName: 'IND',
    flag: '\ud83c\uddee\ud83c\uddf3',
    domesticLeague: 'ipl',
    testStatus: 'full',
    iccRanking: { test: 1, odi: 1, t20: 2 },
    homeVenues: ['Wankhede Stadium', 'MA Chidambaram Stadium', 'M. Chinnaswamy Stadium', 'Eden Gardens', 'Narendra Modi Stadium'],
    colors: { primary: '#FF9933', secondary: '#138808' },
  },
  AUS: {
    id: 'AUS',
    name: 'Australia',
    shortName: 'AUS',
    flag: '\ud83c\udde6\ud83c\uddfa',
    domesticLeague: 'bbl',
    testStatus: 'full',
    iccRanking: { test: 2, odi: 2, t20: 3 },
    homeVenues: ['MCG', 'SCG', 'The Gabba', 'Adelaide Oval', 'WACA', 'Optus Stadium'],
    colors: { primary: '#FFCD00', secondary: '#00843D' },
  },
  ENG: {
    id: 'ENG',
    name: 'England',
    shortName: 'ENG',
    flag: '\ud83c\udff4\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f',
    domesticLeague: 't20_blast',
    testStatus: 'full',
    iccRanking: { test: 3, odi: 4, t20: 1 },
    homeVenues: ["Lord's", 'The Oval', 'Old Trafford', 'Edgbaston', 'Headingley', 'Trent Bridge'],
    colors: { primary: '#CF142B', secondary: '#00247D' },
  },
  PAK: {
    id: 'PAK',
    name: 'Pakistan',
    shortName: 'PAK',
    flag: '\ud83c\uddf5\ud83c\uddf0',
    domesticLeague: 'psl',
    testStatus: 'full',
    iccRanking: { test: 7, odi: 6, t20: 4 },
    homeVenues: ['National Stadium', 'Gaddafi Stadium', 'Rawalpindi Cricket Stadium'],
    colors: { primary: '#01411C', secondary: '#FFFFFF' },
  },
  WI: {
    id: 'WI',
    name: 'West Indies',
    shortName: 'WI',
    flag: '\ud83c\udde6\ud83c\uddec',
    domesticLeague: 'cpl',
    testStatus: 'full',
    iccRanking: { test: 8, odi: 9, t20: 7 },
    homeVenues: ["Queen's Park Oval", 'Kensington Oval', 'Sabina Park', 'Providence Stadium'],
    colors: { primary: '#7B0041', secondary: '#FFCD00' },
  },
  SA: {
    id: 'SA',
    name: 'South Africa',
    shortName: 'SA',
    flag: '\ud83c\uddff\ud83c\udde6',
    testStatus: 'full',
    iccRanking: { test: 4, odi: 3, t20: 5 },
    homeVenues: ['Newlands', 'The Wanderers', 'SuperSport Park', 'St George\'s Park', 'Kingsmead'],
    colors: { primary: '#007749', secondary: '#FFB612' },
  },
  NZ: {
    id: 'NZ',
    name: 'New Zealand',
    shortName: 'NZ',
    flag: '\ud83c\uddf3\ud83c\uddff',
    testStatus: 'full',
    iccRanking: { test: 5, odi: 5, t20: 6 },
    homeVenues: ['Basin Reserve', 'Eden Park', 'Hagley Oval', 'Seddon Park'],
    colors: { primary: '#000000', secondary: '#FFFFFF' },
  },
  SL: {
    id: 'SL',
    name: 'Sri Lanka',
    shortName: 'SL',
    flag: '\ud83c\uddf1\ud83c\uddf0',
    testStatus: 'full',
    iccRanking: { test: 6, odi: 7, t20: 8 },
    homeVenues: ['R. Premadasa Stadium', 'Galle International Stadium', 'Pallekele Stadium'],
    colors: { primary: '#0033A0', secondary: '#FFCD00' },
  },
  BAN: {
    id: 'BAN',
    name: 'Bangladesh',
    shortName: 'BAN',
    flag: '\ud83c\udde7\ud83c\udde9',
    testStatus: 'full',
    iccRanking: { test: 9, odi: 8, t20: 9 },
    homeVenues: ['Sher-e-Bangla Stadium', 'Zahur Ahmed Chowdhury Stadium', 'Sylhet Stadium'],
    colors: { primary: '#006A4E', secondary: '#F42A41' },
  },
  ZIM: {
    id: 'ZIM',
    name: 'Zimbabwe',
    shortName: 'ZIM',
    flag: '\ud83c\uddff\ud83c\uddfc',
    testStatus: 'full',
    iccRanking: { test: 11, odi: 11, t20: 11 },
    homeVenues: ['Harare Sports Club', 'Queens Sports Club'],
    colors: { primary: '#006400', secondary: '#FFD700' },
  },
  AFG: {
    id: 'AFG',
    name: 'Afghanistan',
    shortName: 'AFG',
    flag: '\ud83c\udde6\ud83c\uddeb',
    testStatus: 'full',
    iccRanking: { test: 10, odi: 10, t20: 10 },
    homeVenues: ['Kabul International Cricket Stadium', 'Greater Noida Stadium'],
    colors: { primary: '#0066CC', secondary: '#D32011' },
  },
  IRE: {
    id: 'IRE',
    name: 'Ireland',
    shortName: 'IRE',
    flag: '\ud83c\uddee\ud83c\uddea',
    testStatus: 'full',
    iccRanking: { test: 12, odi: 12, t20: 12 },
    homeVenues: ['Malahide Cricket Club', 'Stormont', 'The Village'],
    colors: { primary: '#169B62', secondary: '#FFFFFF' },
  },
};

export const getCountry = (countryId: Country): CountryConfig => COUNTRIES[countryId];

export const getAllCountries = (): CountryConfig[] => Object.values(COUNTRIES);

export const getFullMemberCountries = (): CountryConfig[] =>
  Object.values(COUNTRIES).filter(c => c.testStatus === 'full');

export const getCountryByLeague = (leagueId: League): CountryConfig | undefined =>
  Object.values(COUNTRIES).find(c => c.domesticLeague === leagueId);