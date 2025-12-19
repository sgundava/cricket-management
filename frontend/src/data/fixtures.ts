import { Match, PitchConditions, MatchType } from '../types';
import { v4 as uuid } from 'uuid';

// Generate pitch conditions with some variance
const generatePitch = (venue: string): PitchConditions => {
  const pitchProfiles: Record<string, PitchConditions> = {
    'Wankhede Stadium': { pace: 70, spin: 45, bounce: 75, deterioration: 30 },
    'MA Chidambaram Stadium': { pace: 40, spin: 85, bounce: 55, deterioration: 50 },
    'M. Chinnaswamy Stadium': { pace: 65, spin: 50, bounce: 70, deterioration: 25 },
    'Eden Gardens': { pace: 55, spin: 70, bounce: 60, deterioration: 40 },
    'Arun Jaitley Stadium': { pace: 60, spin: 60, bounce: 65, deterioration: 35 },
    'Sawai Mansingh Stadium': { pace: 50, spin: 75, bounce: 55, deterioration: 45 },
    'Punjab Cricket Association Stadium': { pace: 75, spin: 40, bounce: 80, deterioration: 20 },
    'Narendra Modi Stadium': { pace: 60, spin: 55, bounce: 65, deterioration: 30 },
    'Rajiv Gandhi International Stadium': { pace: 65, spin: 55, bounce: 70, deterioration: 35 },
  };

  const base = pitchProfiles[venue] || { pace: 60, spin: 55, bounce: 65, deterioration: 30 };

  // Add some randomness (-5 to +5)
  return {
    pace: Math.max(30, Math.min(90, base.pace + Math.floor(Math.random() * 11) - 5)),
    spin: Math.max(30, Math.min(90, base.spin + Math.floor(Math.random() * 11) - 5)),
    bounce: Math.max(30, Math.min(90, base.bounce + Math.floor(Math.random() * 11) - 5)),
    deterioration: Math.max(10, Math.min(60, base.deterioration + Math.floor(Math.random() * 11) - 5)),
  };
};

// All team IDs
const allTeamIds = ['mi', 'csk', 'rcb', 'kkr', 'dc', 'rr', 'pk', 'gt', 'srh'];

// Venues by team
const venues: Record<string, string> = {
  mi: 'Wankhede Stadium',
  csk: 'MA Chidambaram Stadium',
  rcb: 'M. Chinnaswamy Stadium',
  kkr: 'Eden Gardens',
  dc: 'Arun Jaitley Stadium',
  rr: 'Sawai Mansingh Stadium',
  pk: 'Punjab Cricket Association Stadium',
  gt: 'Narendra Modi Stadium',
  srh: 'Rajiv Gandhi International Stadium',
};

// Generate fixtures for full IPL season (14 matches per team)
// Each team plays 8 teams once = 8 matches, then 6 teams again = 14 total
export const generateFixtures = (playerTeamId: string): Match[] => {
  const otherTeams = allTeamIds.filter(id => id !== playerTeamId);

  // Shuffle opponents
  const shuffled = [...otherTeams].sort(() => Math.random() - 0.5);

  // First 8 matches: play each opponent once
  const firstRound: { opponent: string; isHome: boolean }[] = shuffled.map((opponent, i) => ({
    opponent,
    isHome: i % 2 === 0, // Alternate home/away
  }));

  // Next 6 matches: play 6 teams again (reverse home/away)
  const secondRound = shuffled.slice(0, 6).map((opponent, i) => ({
    opponent,
    isHome: !firstRound.find(m => m.opponent === opponent)?.isHome, // Flip home/away
  }));

  // Combine and shuffle for realistic schedule
  const allMatches = [...firstRound, ...secondRound];

  // Create fixtures
  const fixtures: Match[] = allMatches.map((matchInfo, index) => {
    const homeTeam = matchInfo.isHome ? playerTeamId : matchInfo.opponent;
    const awayTeam = matchInfo.isHome ? matchInfo.opponent : playerTeamId;
    const venue = venues[homeTeam] || 'Wankhede Stadium';

    return {
      id: uuid(),
      homeTeam,
      awayTeam,
      venue,
      matchNumber: index + 1,
      matchType: 'league' as MatchType,
      pitch: generatePitch(venue),
      weather: ['clear', 'cloudy', 'humid'][Math.floor(Math.random() * 3)] as 'clear' | 'cloudy' | 'humid',
      homeTactics: null,
      awayTactics: null,
      status: 'upcoming',
      tossWinner: null,
      tossDecision: null,
      currentInnings: null,
      innings1: null,
      innings2: null,
      result: null,
    };
  });

  return fixtures;
};

// Generate a playoff match
export const generatePlayoffMatch = (
  team1Id: string,
  team2Id: string,
  matchType: MatchType,
  matchNumber: number
): Match => {
  // Playoff matches at neutral venues
  const playoffVenues = [
    'Narendra Modi Stadium',
    'MA Chidambaram Stadium',
    'Wankhede Stadium',
  ];
  const venue = playoffVenues[Math.floor(Math.random() * playoffVenues.length)];

  return {
    id: uuid(),
    homeTeam: team1Id,
    awayTeam: team2Id,
    venue,
    matchNumber,
    matchType,
    pitch: generatePitch(venue),
    weather: ['clear', 'cloudy', 'humid'][Math.floor(Math.random() * 3)] as 'clear' | 'cloudy' | 'humid',
    homeTactics: null,
    awayTactics: null,
    status: 'upcoming',
    tossWinner: null,
    tossDecision: null,
    currentInnings: null,
    innings1: null,
    innings2: null,
    result: null,
  };
};

// Default fixtures for Mumbai Indians
export const defaultFixtures = generateFixtures('mi');
