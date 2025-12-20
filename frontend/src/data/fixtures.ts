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
    'BRSABV Ekana Cricket Stadium': { pace: 55, spin: 65, bounce: 60, deterioration: 40 },
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
const allTeamIds = ['mi', 'csk', 'rcb', 'kkr', 'dc', 'rr', 'pk', 'gt', 'srh', 'lsg'];

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
  lsg: 'BRSABV Ekana Cricket Stadium',
};

// Generate fixtures for full IPL season (14 matches per team, 70 total matches)
// With 10 teams: each team plays 9 opponents once = 45 matches, then 5 rematches each = 25 more = 70 total
export const generateFixtures = (playerTeamId: string): Match[] => {
  const fixtures: Match[] = [];

  // Step 1: Generate round-robin (each team plays every other team once) = 45 matches
  const roundRobinMatches: { home: string; away: string }[] = [];
  for (let i = 0; i < allTeamIds.length; i++) {
    for (let j = i + 1; j < allTeamIds.length; j++) {
      // Randomly decide home/away
      const isFirstHome = Math.random() < 0.5;
      roundRobinMatches.push({
        home: isFirstHome ? allTeamIds[i] : allTeamIds[j],
        away: isFirstHome ? allTeamIds[j] : allTeamIds[i],
      });
    }
  }

  // Step 2: Generate rematches (each team plays 5 more matches) = 25 more matches
  // Each team needs 5 rematches to reach 14 total matches
  const rematchCount: Record<string, number> = {};
  allTeamIds.forEach(id => rematchCount[id] = 0);

  const rematchMatches: { home: string; away: string }[] = [];

  // Shuffle round-robin for variety in rematches
  const shuffledRR = [...roundRobinMatches].sort(() => Math.random() - 0.5);

  for (const match of shuffledRR) {
    // Check if both teams need more matches
    if (rematchCount[match.home] < 5 && rematchCount[match.away] < 5) {
      // Reverse home/away for rematch
      rematchMatches.push({
        home: match.away,
        away: match.home,
      });
      rematchCount[match.home]++;
      rematchCount[match.away]++;
    }
  }

  // Combine all matches
  const allMatches = [...roundRobinMatches, ...rematchMatches];

  // Shuffle to create realistic schedule (not all rematches at end)
  const shuffledMatches = allMatches.sort(() => Math.random() - 0.5);

  // Prioritize player's matches to be spread throughout
  const playerMatches = shuffledMatches.filter(m => m.home === playerTeamId || m.away === playerTeamId);
  const aiMatches = shuffledMatches.filter(m => m.home !== playerTeamId && m.away !== playerTeamId);

  // Interleave: roughly 1 player match per 4-5 AI matches
  const interleavedMatches: { home: string; away: string }[] = [];
  let playerIdx = 0;
  let aiIdx = 0;

  while (playerIdx < playerMatches.length || aiIdx < aiMatches.length) {
    // Add 1 player match
    if (playerIdx < playerMatches.length) {
      interleavedMatches.push(playerMatches[playerIdx++]);
    }
    // Add 3-4 AI matches
    const aiCount = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < aiCount && aiIdx < aiMatches.length; i++) {
      interleavedMatches.push(aiMatches[aiIdx++]);
    }
  }

  // Create fixture objects
  interleavedMatches.forEach((matchInfo, index) => {
    const venue = venues[matchInfo.home] || 'Wankhede Stadium';

    fixtures.push({
      id: uuid(),
      homeTeam: matchInfo.home,
      awayTeam: matchInfo.away,
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
    });
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
