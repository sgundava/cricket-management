import { League, Country } from '../types';

export interface LeagueTeam {
  id: string;
  name: string;
  shortName: string;
  homeCity: string;
  homeVenue: string;
  colors: { primary: string; secondary: string };
}

export interface LeagueConfig {
  id: League;
  name: string;
  shortName: string;
  country: Country;
  format: 't20';
  teams: LeagueTeam[];
  seasonMonths: [number, number];  // [start, end] months (1-12)
  matchesPerTeam: number;
  playoffTeams: number;
  overseasLimit: number;  // Max overseas players in XI
  squadSize: { min: number; max: number };
  salaryCap: number;  // In lakhs
}

export const LEAGUES: Record<League, LeagueConfig> = {
  ipl: {
    id: 'ipl',
    name: 'Indian Premier League',
    shortName: 'IPL',
    country: 'IND',
    format: 't20',
    teams: [
      { id: 'mi', name: 'Mumbai', shortName: 'MUM', homeCity: 'Mumbai', homeVenue: 'Wankhede Stadium', colors: { primary: '#004BA0', secondary: '#D1AB3E' } },
      { id: 'csk', name: 'Chennai', shortName: 'CHE', homeCity: 'Chennai', homeVenue: 'MA Chidambaram Stadium', colors: { primary: '#FFCC00', secondary: '#0066B3' } },
      { id: 'rcb', name: 'Bengaluru', shortName: 'BLR', homeCity: 'Bengaluru', homeVenue: 'M. Chinnaswamy Stadium', colors: { primary: '#EC1C24', secondary: '#000000' } },
      { id: 'kkr', name: 'Kolkata', shortName: 'KOL', homeCity: 'Kolkata', homeVenue: 'Eden Gardens', colors: { primary: '#3A225D', secondary: '#D4AF37' } },
      { id: 'dc', name: 'Delhi', shortName: 'DEL', homeCity: 'Delhi', homeVenue: 'Arun Jaitley Stadium', colors: { primary: '#0078BC', secondary: '#EF1B23' } },
      { id: 'rr', name: 'Rajasthan', shortName: 'RAJ', homeCity: 'Jaipur', homeVenue: 'Sawai Mansingh Stadium', colors: { primary: '#EA1A85', secondary: '#254AA5' } },
      { id: 'pbks', name: 'Punjab', shortName: 'PUN', homeCity: 'Mohali', homeVenue: 'PCA Stadium', colors: { primary: '#ED1B24', secondary: '#A7A9AC' } },
      { id: 'srh', name: 'Hyderabad', shortName: 'HYD', homeCity: 'Hyderabad', homeVenue: 'Rajiv Gandhi Stadium', colors: { primary: '#FF822A', secondary: '#000000' } },
      { id: 'gt', name: 'Gujarat', shortName: 'GUJ', homeCity: 'Ahmedabad', homeVenue: 'Narendra Modi Stadium', colors: { primary: '#1C1C1C', secondary: '#B87333' } },
      { id: 'lsg', name: 'Lucknow', shortName: 'LKN', homeCity: 'Lucknow', homeVenue: 'BRSABV Ekana Stadium', colors: { primary: '#A72056', secondary: '#FFCC00' } },
    ],
    seasonMonths: [3, 5],
    matchesPerTeam: 14,
    playoffTeams: 4,
    overseasLimit: 4,
    squadSize: { min: 18, max: 25 },
    salaryCap: 12000, // 120 crores
  },

  bbl: {
    id: 'bbl',
    name: 'Big Bash League',
    shortName: 'BBL',
    country: 'AUS',
    format: 't20',
    teams: [
      { id: 'stars', name: 'Melbourne Stars', shortName: 'STA', homeCity: 'Melbourne', homeVenue: 'MCG', colors: { primary: '#00A651', secondary: '#000000' } },
      { id: 'renegades', name: 'Melbourne Renegades', shortName: 'REN', homeCity: 'Melbourne', homeVenue: 'Marvel Stadium', colors: { primary: '#EF3E42', secondary: '#000000' } },
      { id: 'sixers', name: 'Sydney Sixers', shortName: 'SIX', homeCity: 'Sydney', homeVenue: 'SCG', colors: { primary: '#FF00FF', secondary: '#000000' } },
      { id: 'thunder', name: 'Sydney Thunder', shortName: 'THU', homeCity: 'Sydney', homeVenue: 'Sydney Showground', colors: { primary: '#00FF00', secondary: '#000000' } },
      { id: 'heat', name: 'Brisbane Heat', shortName: 'HEA', homeCity: 'Brisbane', homeVenue: 'The Gabba', colors: { primary: '#00BFFF', secondary: '#FF6600' } },
      { id: 'strikers', name: 'Adelaide Strikers', shortName: 'STR', homeCity: 'Adelaide', homeVenue: 'Adelaide Oval', colors: { primary: '#0066CC', secondary: '#FFCC00' } },
      { id: 'scorchers', name: 'Perth Scorchers', shortName: 'SCO', homeCity: 'Perth', homeVenue: 'Optus Stadium', colors: { primary: '#FF6600', secondary: '#000000' } },
      { id: 'hurricanes', name: 'Hobart Hurricanes', shortName: 'HUR', homeCity: 'Hobart', homeVenue: 'Blundstone Arena', colors: { primary: '#7B2D8E', secondary: '#00A651' } },
    ],
    seasonMonths: [12, 2],
    matchesPerTeam: 14,
    playoffTeams: 5,
    overseasLimit: 2,
    squadSize: { min: 13, max: 18 },
    salaryCap: 2000, // AUD in thousands equivalent
  },

  cpl: {
    id: 'cpl',
    name: 'Caribbean Premier League',
    shortName: 'CPL',
    country: 'WI',
    format: 't20',
    teams: [
      { id: 'tkr', name: 'Trinbago Knight Riders', shortName: 'TKR', homeCity: 'Trinidad', homeVenue: 'Queen\'s Park Oval', colors: { primary: '#3A225D', secondary: '#D4AF37' } },
      { id: 'gaw', name: 'Guyana Amazon Warriors', shortName: 'GAW', homeCity: 'Guyana', homeVenue: 'Providence Stadium', colors: { primary: '#00A651', secondary: '#FFCC00' } },
      { id: 'jt', name: 'Jamaica Tallawahs', shortName: 'JT', homeCity: 'Jamaica', homeVenue: 'Sabina Park', colors: { primary: '#FFD700', secondary: '#00A651' } },
      { id: 'brv', name: 'Barbados Royals', shortName: 'BR', homeCity: 'Barbados', homeVenue: 'Kensington Oval', colors: { primary: '#EA1A85', secondary: '#254AA5' } },
      { id: 'slk', name: 'Saint Lucia Kings', shortName: 'SLK', homeCity: 'Saint Lucia', homeVenue: 'Daren Sammy Stadium', colors: { primary: '#00BFFF', secondary: '#FFD700' } },
      { id: 'snp', name: 'St Kitts and Nevis Patriots', shortName: 'SNP', homeCity: 'St Kitts', homeVenue: 'Warner Park', colors: { primary: '#FF0000', secondary: '#00A651' } },
    ],
    seasonMonths: [8, 10],
    matchesPerTeam: 10,
    playoffTeams: 4,
    overseasLimit: 5,
    squadSize: { min: 15, max: 18 },
    salaryCap: 1500,
  },

  psl: {
    id: 'psl',
    name: 'Pakistan Super League',
    shortName: 'PSL',
    country: 'PAK',
    format: 't20',
    teams: [
      { id: 'kk', name: 'Karachi Kings', shortName: 'KK', homeCity: 'Karachi', homeVenue: 'National Stadium', colors: { primary: '#0066CC', secondary: '#FFFFFF' } },
      { id: 'lq', name: 'Lahore Qalandars', shortName: 'LQ', homeCity: 'Lahore', homeVenue: 'Gaddafi Stadium', colors: { primary: '#00A651', secondary: '#FF0000' } },
      { id: 'iu', name: 'Islamabad United', shortName: 'IU', homeCity: 'Islamabad', homeVenue: 'Rawalpindi Cricket Stadium', colors: { primary: '#FF0000', secondary: '#000000' } },
      { id: 'pz', name: 'Peshawar Zalmi', shortName: 'PZ', homeCity: 'Peshawar', homeVenue: 'Arbab Niaz Stadium', colors: { primary: '#FFCC00', secondary: '#000000' } },
      { id: 'mq', name: 'Multan Sultans', shortName: 'MS', homeCity: 'Multan', homeVenue: 'Multan Cricket Stadium', colors: { primary: '#00BFFF', secondary: '#FFD700' } },
      { id: 'qg', name: 'Quetta Gladiators', shortName: 'QG', homeCity: 'Quetta', homeVenue: 'Quetta Cricket Stadium', colors: { primary: '#7B2D8E', secondary: '#FFD700' } },
    ],
    seasonMonths: [2, 3],
    matchesPerTeam: 10,
    playoffTeams: 4,
    overseasLimit: 4,
    squadSize: { min: 15, max: 18 },
    salaryCap: 1500,
  },

  t20_blast: {
    id: 't20_blast',
    name: 'T20 Blast',
    shortName: 'Blast',
    country: 'ENG',
    format: 't20',
    teams: [
      { id: 'bir', name: 'Birmingham Bears', shortName: 'BIR', homeCity: 'Birmingham', homeVenue: 'Edgbaston', colors: { primary: '#00247D', secondary: '#CF142B' } },
      { id: 'der', name: 'Derbyshire Falcons', shortName: 'DER', homeCity: 'Derby', homeVenue: 'County Ground', colors: { primary: '#0066CC', secondary: '#FFD700' } },
      { id: 'dur', name: 'Durham', shortName: 'DUR', homeCity: 'Durham', homeVenue: 'Riverside Ground', colors: { primary: '#FFD700', secondary: '#00247D' } },
      { id: 'ess', name: 'Essex Eagles', shortName: 'ESS', homeCity: 'Chelmsford', homeVenue: 'County Ground', colors: { primary: '#0066CC', secondary: '#FF0000' } },
      { id: 'gla', name: 'Glamorgan', shortName: 'GLA', homeCity: 'Cardiff', homeVenue: 'Sophia Gardens', colors: { primary: '#00247D', secondary: '#FFD700' } },
      { id: 'glo', name: 'Gloucestershire', shortName: 'GLO', homeCity: 'Bristol', homeVenue: 'County Ground', colors: { primary: '#1C1C1C', secondary: '#FFCC00' } },
      { id: 'ham', name: 'Hampshire Hawks', shortName: 'HAM', homeCity: 'Southampton', homeVenue: 'The Rose Bowl', colors: { primary: '#FFD700', secondary: '#00247D' } },
      { id: 'ken', name: 'Kent Spitfires', shortName: 'KEN', homeCity: 'Canterbury', homeVenue: 'St Lawrence Ground', colors: { primary: '#0066CC', secondary: '#FFFFFF' } },
      { id: 'lan', name: 'Lancashire Lightning', shortName: 'LAN', homeCity: 'Manchester', homeVenue: 'Old Trafford', colors: { primary: '#FF0000', secondary: '#00247D' } },
      { id: 'lei', name: 'Leicestershire Foxes', shortName: 'LEI', homeCity: 'Leicester', homeVenue: 'Grace Road', colors: { primary: '#00A651', secondary: '#FF0000' } },
      { id: 'mid', name: 'Middlesex', shortName: 'MID', homeCity: 'London', homeVenue: "Lord's", colors: { primary: '#00247D', secondary: '#CF142B' } },
      { id: 'nor', name: 'Northamptonshire Steelbacks', shortName: 'NOR', homeCity: 'Northampton', homeVenue: 'County Ground', colors: { primary: '#1C1C1C', secondary: '#FF6600' } },
      { id: 'not', name: 'Nottinghamshire Outlaws', shortName: 'NOT', homeCity: 'Nottingham', homeVenue: 'Trent Bridge', colors: { primary: '#00A651', secondary: '#FFD700' } },
      { id: 'som', name: 'Somerset', shortName: 'SOM', homeCity: 'Taunton', homeVenue: 'County Ground', colors: { primary: '#1C1C1C', secondary: '#CF142B' } },
      { id: 'sur', name: 'Surrey', shortName: 'SUR', homeCity: 'London', homeVenue: 'The Oval', colors: { primary: '#1C1C1C', secondary: '#7B2D8E' } },
      { id: 'sus', name: 'Sussex Sharks', shortName: 'SUS', homeCity: 'Hove', homeVenue: 'County Ground', colors: { primary: '#00247D', secondary: '#FFFFFF' } },
      { id: 'war', name: 'Warwickshire', shortName: 'WAR', homeCity: 'Birmingham', homeVenue: 'Edgbaston', colors: { primary: '#00247D', secondary: '#FFD700' } },
      { id: 'wor', name: 'Worcestershire Rapids', shortName: 'WOR', homeCity: 'Worcester', homeVenue: 'New Road', colors: { primary: '#00A651', secondary: '#000000' } },
    ],
    seasonMonths: [6, 9],
    matchesPerTeam: 14,
    playoffTeams: 4,
    overseasLimit: 2,
    squadSize: { min: 15, max: 18 },
    salaryCap: 1000,
  },
};

export const getLeague = (leagueId: League): LeagueConfig => LEAGUES[leagueId];

export const getAllLeagues = (): LeagueConfig[] => Object.values(LEAGUES);

export const getLeagueTeams = (leagueId: League): LeagueTeam[] => LEAGUES[leagueId].teams;