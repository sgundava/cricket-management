import {
  Player,
  Match,
  MatchTactics,
  PitchConditions,
  BallOutcome,
  BallEvent,
  OverSummary,
  InningsState,
  MatchResult,
  MatchPhase,
  TacticalApproach,
  DismissalType,
  BowlingLength,
  FieldSetting,
  BowlingApproach,
} from '../types';

// ============================================
// CONSTANTS
// ============================================

const TOTAL_OVERS = 20;
const BALLS_PER_OVER = 6;
const MAX_OVERS_PER_BOWLER = 4; // T20 rule: overs / 5 = max per bowler

// Base outcome probabilities (will be modified by skills, form, etc.)
const BASE_OUTCOMES = {
  dot: 0.35,
  single: 0.28,
  two: 0.08,
  three: 0.02,
  four: 0.12,
  six: 0.06,
  wicket: 0.09,
};

// Phase modifiers
const PHASE_MODIFIERS: Record<MatchPhase, { boundaryMod: number; wicketMod: number; runRate: number }> = {
  powerplay: { boundaryMod: 1.2, wicketMod: 1.1, runRate: 8.5 },
  middle: { boundaryMod: 0.9, wicketMod: 0.85, runRate: 7.5 },
  death: { boundaryMod: 1.4, wicketMod: 1.25, runRate: 11 },
};

// Tactical approach modifiers
const TACTICAL_MODIFIERS: Record<TacticalApproach, { boundaryMod: number; wicketMod: number }> = {
  aggressive: { boundaryMod: 1.25, wicketMod: 1.3 },
  balanced: { boundaryMod: 1.0, wicketMod: 1.0 },
  cautious: { boundaryMod: 0.75, wicketMod: 0.7 },
};

// Bowling length modifiers
const BOWLING_LENGTH_MODIFIERS: Record<BowlingLength, {
  boundaryMod: number;
  wicketMod: number;
  dotMod: number;
  skillType: 'speed' | 'accuracy' | 'variation';
  minSkill: number;
}> = {
  'good-length': {
    boundaryMod: 1.0,
    wicketMod: 1.0,
    dotMod: 1.0,
    skillType: 'accuracy',
    minSkill: 0, // Always works
  },
  'short': {
    boundaryMod: 1.3,   // More pull shots = more boundaries
    wicketMod: 1.25,    // Top edge catches
    dotMod: 0.85,
    skillType: 'speed',
    minSkill: 65,       // Needs pace to be effective
  },
  'yorkers': {
    boundaryMod: 0.7,   // Hard to hit for boundaries
    wicketMod: 1.15,    // LBW, bowled risk
    dotMod: 1.3,        // Lots of dots
    skillType: 'accuracy',
    minSkill: 70,       // Needs accuracy to land yorkers
  },
  'full-pitched': {
    boundaryMod: 1.15,  // Driving opportunities
    wicketMod: 1.35,    // Early swing wickets
    dotMod: 0.95,
    skillType: 'accuracy',
    minSkill: 50,
  },
};

// Field setting modifiers
const FIELD_SETTING_MODIFIERS: Record<FieldSetting, {
  boundaryMod: number;
  wicketMod: number;
  catchMod: number;     // Affects catch dismissal probability
  runOutMod: number;    // Affects run-out chances
}> = {
  'attacking': {
    boundaryMod: 1.25,      // Gaps in boundary
    wicketMod: 1.35,        // More close catchers
    catchMod: 1.3,          // Better catching positions
    runOutMod: 0.9,         // Less ground coverage
  },
  'balanced': {
    boundaryMod: 1.0,
    wicketMod: 1.0,
    catchMod: 1.0,
    runOutMod: 1.0,
  },
  'defensive': {
    boundaryMod: 0.7,       // Boundary riders save 4s
    wicketMod: 0.8,         // Fewer catching positions
    catchMod: 0.75,
    runOutMod: 1.15,        // More ground cover = more pressure
  },
  'death-field': {
    boundaryMod: 0.6,       // Long boundaries covered
    wicketMod: 0.9,
    catchMod: 1.1,          // Deep catches possible
    runOutMod: 1.2,         // Boundary sweepers create pressure
  },
};

// Fielding skill baseline (60 is considered average)
const FIELDING_BASELINE = 60;

// ============================================
// HELPER FUNCTIONS
// ============================================

const getPhase = (over: number): MatchPhase => {
  if (over < 6) return 'powerplay';
  if (over < 16) return 'middle';
  return 'death';
};

const getOverallBattingSkill = (player: Player): number => {
  const { technique, power, timing, temperament } = player.batting;
  return (technique * 0.25 + power * 0.25 + timing * 0.3 + temperament * 0.2);
};

const getOverallBowlingSkill = (player: Player): number => {
  const { speed, accuracy, variation, stamina } = player.bowling;
  return (speed * 0.2 + accuracy * 0.35 + variation * 0.25 + stamina * 0.2);
};

const applyFormModifier = (baseValue: number, form: number): number => {
  // Form is -20 to +20, affects outcome by up to 10%
  return baseValue * (1 + form / 200);
};

const applyFatigueModifier = (baseValue: number, fatigue: number): number => {
  // High fatigue reduces performance
  return baseValue * (1 - fatigue / 200);
};

// Calculate bowling length effectiveness based on bowler's skills
const getBowlingLengthEffectiveness = (
  bowler: Player,
  length: BowlingLength
): number => {
  const modifier = BOWLING_LENGTH_MODIFIERS[length];

  // Get the relevant skill for this bowling length
  let relevantSkill: number;
  if (modifier.skillType === 'speed') {
    relevantSkill = bowler.bowling.speed;
  } else if (modifier.skillType === 'variation') {
    relevantSkill = bowler.bowling.variation;
  } else {
    relevantSkill = bowler.bowling.accuracy;
  }

  // Spinners using yorkers should use variation skill instead
  if (length === 'yorkers' && bowler.bowlingStyle?.includes('spin')) {
    relevantSkill = bowler.bowling.variation;
  }

  // If below minimum required skill, reduce effectiveness
  if (relevantSkill < modifier.minSkill) {
    const deficit = (modifier.minSkill - relevantSkill) / 100;
    return Math.max(0.5, 1 - deficit * 2); // 50% minimum effectiveness
  }

  // Bonus for exceeding requirement
  const excess = (relevantSkill - modifier.minSkill) / 100;
  return Math.min(1.3, 1 + excess * 0.5);
};

// Calculate average fielding skill for the bowling team's playing XI
const getTeamFieldingSkill = (
  bowlingTeamPlayers: Player[],
  playingXI: string[]
): {
  catching: number;
  athleticism: number;
  throwing: number;
  ground: number;
} => {
  const fieldersInXI = bowlingTeamPlayers.filter(p => playingXI.includes(p.id));

  if (fieldersInXI.length === 0) {
    return { catching: FIELDING_BASELINE, athleticism: FIELDING_BASELINE, throwing: FIELDING_BASELINE, ground: FIELDING_BASELINE };
  }

  const sum = fieldersInXI.reduce((acc, p) => ({
    catching: acc.catching + p.fielding.catching,
    athleticism: acc.athleticism + p.fielding.athleticism,
    throwing: acc.throwing + p.fielding.throwing,
    ground: acc.ground + p.fielding.ground,
  }), { catching: 0, athleticism: 0, throwing: 0, ground: 0 });

  const count = fieldersInXI.length;
  return {
    catching: sum.catching / count,
    athleticism: sum.athleticism / count,
    throwing: sum.throwing / count,
    ground: sum.ground / count,
  };
};

// Check if a boundary (4) should be saved by athletic fielding
const checkBoundarySave = (
  teamFielding: { athleticism: number; ground: number }
): { saved: boolean; savedTo: 2 | 3 } => {
  // Athleticism above baseline starts saving boundaries
  const saveChance = Math.max(0, (teamFielding.athleticism - 50) / 200);
  const groundBonus = (teamFielding.ground - 50) / 400;
  const totalSaveChance = Math.min(0.30, saveChance + groundBonus); // Max 30% save chance

  if (Math.random() < totalSaveChance) {
    // Boundary saved - convert to 2 or 3
    const savedTo = Math.random() < 0.7 ? 2 : 3;
    return { saved: true, savedTo: savedTo as 2 | 3 };
  }

  return { saved: false, savedTo: 2 };
};

// Get dismissal type, factoring in fielding skills and field setting
const getRandomDismissal = (
  fieldSetting: FieldSetting = 'balanced',
  teamFielding: { catching: number; throwing: number } = { catching: FIELDING_BASELINE, throwing: FIELDING_BASELINE }
): DismissalType => {
  // Base distribution
  let caught = 0.35;
  let bowled = 0.20;
  let lbw = 0.15;
  let runout = 0.15;
  let stumped = 0.10;
  let hitwicket = 0.05;

  // Adjust for field setting
  const fieldMod = FIELD_SETTING_MODIFIERS[fieldSetting];
  caught *= fieldMod.catchMod;
  runout *= fieldMod.runOutMod;

  // Adjust for team fielding skills (baseline is 60)
  const catchingFactor = 1 + (teamFielding.catching - FIELDING_BASELINE) / 200;
  caught *= catchingFactor;

  const throwingFactor = 1 + (teamFielding.throwing - FIELDING_BASELINE) / 200;
  runout *= throwingFactor;

  // Normalize probabilities
  const total = caught + bowled + lbw + runout + stumped + hitwicket;

  const rand = Math.random() * total;
  let cumulative = 0;

  if (rand < (cumulative += caught)) return 'caught';
  if (rand < (cumulative += bowled)) return 'bowled';
  if (rand < (cumulative += lbw)) return 'lbw';
  if (rand < (cumulative += runout)) return 'runout';
  if (rand < (cumulative += stumped)) return 'stumped';
  return 'hitwicket';
};

// ============================================
// NARRATIVE GENERATION
// ============================================

const generateNarrative = (
  outcome: BallOutcome,
  batter: Player,
  bowler: Player
): string => {
  const batterName = batter.shortName;
  const bowlerName = bowler.shortName;

  if (outcome.type === 'wicket') {
    const dismissalNarratives: Record<DismissalType, string[]> = {
      bowled: [
        `Clean bowled! ${bowlerName} beats ${batterName} all ends up!`,
        `TIMBER! ${bowlerName} crashes through the defense!`,
        `The stumps are rattled! ${batterName} has to go!`,
      ],
      caught: [
        `Caught! ${batterName} finds the fielder!`,
        `In the air and taken! ${bowlerName} gets the breakthrough!`,
        `That's a good catch! ${batterName} is gone!`,
      ],
      lbw: [
        `LBW! That looked plumb! ${batterName} departs!`,
        `Given out leg before! ${bowlerName} strikes!`,
        `Trapped in front! The umpire raises the finger!`,
      ],
      runout: [
        `Run out! Brilliant work in the field!`,
        `Direct hit! ${batterName} is short of the crease!`,
        `Terrible mix-up and ${batterName} has to go!`,
      ],
      stumped: [
        `Stumped! Lightning quick work behind the stumps!`,
        `${batterName} beaten in the flight and stumped!`,
        `Down the track and stumped! Great keeping!`,
      ],
      hitwicket: [
        `Hit wicket! ${batterName} has knocked the bails off!`,
        `Oh no! ${batterName} has hit his own stumps!`,
        `Unfortunate dismissal - hit wicket!`,
      ],
    };
    const narratives = dismissalNarratives[outcome.dismissal];
    return narratives[Math.floor(Math.random() * narratives.length)];
  }

  if (outcome.type === 'extra') {
    if (outcome.extraType === 'wide') return `Wide ball from ${bowlerName}`;
    if (outcome.extraType === 'noball') return `No ball! Free hit coming up!`;
    return `${outcome.runs} ${outcome.extraType}s`;
  }

  // Runs
  const runs = outcome.runs;
  if (runs === 0) {
    const dotNarratives = [
      `Dot ball. Good tight bowling from ${bowlerName}.`,
      `Defended back to the bowler.`,
      `${batterName} can't get it away.`,
      `Good length, no run.`,
      `Beaten outside off! Great delivery!`,
    ];
    return dotNarratives[Math.floor(Math.random() * dotNarratives.length)];
  }

  if (runs === 1) {
    return ['Single taken.', 'Pushed for one.', 'Quick single.', 'Rotates the strike.'][
      Math.floor(Math.random() * 4)
    ];
  }

  if (runs === 2) {
    return ['Two runs.', 'Good running between the wickets!', 'Pushed into the gap for two.'][
      Math.floor(Math.random() * 3)
    ];
  }

  if (runs === 3) {
    return ['Three runs! Excellent running!', 'They come back for three!'][
      Math.floor(Math.random() * 2)
    ];
  }

  if (runs === 4) {
    const fourNarratives = [
      `FOUR! ${batterName} times that beautifully!`,
      `Boundary! That raced away to the fence!`,
      `FOUR! Cracking shot through the covers!`,
      `Swept away for FOUR!`,
      `Cut away and that's FOUR!`,
    ];
    return fourNarratives[Math.floor(Math.random() * fourNarratives.length)];
  }

  // Six
  const sixNarratives = [
    `SIX! ${batterName} launches it into the stands!`,
    `HUGE SIX! That's gone miles!`,
    `Maximum! ${batterName} clears the boundary with ease!`,
    `SIX! What a strike from ${batterName}!`,
    `Into the crowd! Massive hit!`,
  ];
  return sixNarratives[Math.floor(Math.random() * sixNarratives.length)];
};

// ============================================
// CORE SIMULATION
// ============================================

export const simulateBall = (
  batter: Player,
  bowler: Player,
  over: number,
  wickets: number,
  target: number | null,
  currentRuns: number,
  tactics: MatchTactics,
  pitch: PitchConditions,
  // New optional parameters for bowling tactics and fielding
  bowlingTactics?: { length: BowlingLength; field: FieldSetting },
  teamFielding?: { catching: number; athleticism: number; throwing: number; ground: number }
): { outcome: BallOutcome; narrative: string } => {
  const phase = getPhase(over);
  const phaseMod = PHASE_MODIFIERS[phase];

  // Get tactical approach for current phase
  const approach = tactics.battingApproach[phase];
  const tacticsMod = TACTICAL_MODIFIERS[approach];

  // Get bowling tactics for current phase (use provided override or fall back to tactics)
  const bowlingApproach = tactics.bowlingPlan?.bowlingApproach;
  const bowlingLength = bowlingTactics?.length ?? bowlingApproach?.[phase]?.length ?? 'good-length';
  const fieldSetting = bowlingTactics?.field ?? bowlingApproach?.[phase]?.field ?? 'balanced';

  // Get modifiers for bowling length and field setting
  const bowlingLengthMod = BOWLING_LENGTH_MODIFIERS[bowlingLength];
  const fieldSettingMod = FIELD_SETTING_MODIFIERS[fieldSetting];

  // Calculate bowling length effectiveness based on bowler's skill
  const lengthEffectiveness = getBowlingLengthEffectiveness(bowler, bowlingLength);

  // Calculate skill differential
  const batterSkill = getOverallBattingSkill(batter);
  const bowlerSkill = getOverallBowlingSkill(bowler);
  const skillDiff = (batterSkill - bowlerSkill) / 100; // -1 to 1 range

  // Apply form
  const batterForm = applyFormModifier(1, batter.form);
  const bowlerForm = applyFormModifier(1, -bowler.form); // Bowler form reduces batter advantage

  // Apply fatigue
  const batterFatigue = applyFatigueModifier(1, batter.fatigue);
  const bowlerFatigue = applyFatigueModifier(1, bowler.fatigue);

  // Calculate modified probabilities
  let probs = { ...BASE_OUTCOMES };

  // Skill affects all outcomes
  const skillModifier = 1 + skillDiff * 0.15;

  // Apply all modifiers to boundaries (batting approach, phase, bowling length, field setting)
  const boundaryMod = phaseMod.boundaryMod * tacticsMod.boundaryMod *
    bowlingLengthMod.boundaryMod * fieldSettingMod.boundaryMod * lengthEffectiveness;

  probs.four *= skillModifier * batterForm * batterFatigue * boundaryMod;
  probs.six *= skillModifier * batterForm * batterFatigue * boundaryMod;

  // Apply all modifiers to wickets
  const wicketMod = phaseMod.wicketMod * tacticsMod.wicketMod *
    bowlingLengthMod.wicketMod * fieldSettingMod.wicketMod * lengthEffectiveness;

  probs.wicket *= (1 / skillModifier) * bowlerForm * bowlerFatigue * wicketMod;

  // Apply dot ball modifier from bowling length
  probs.dot *= bowlingLengthMod.dotMod * lengthEffectiveness;

  // Pitch effects
  if (bowler.bowlingStyle?.includes('spin')) {
    probs.wicket *= 1 + (pitch.spin - 50) / 100;
  } else if (bowler.bowlingStyle?.includes('fast')) {
    probs.wicket *= 1 + (pitch.pace - 50) / 100;
  }

  // Pressure situation (chasing in death overs with high required rate)
  if (target !== null) {
    const ballsRemaining = (TOTAL_OVERS - over) * 6;
    const runsNeeded = target - currentRuns;
    const requiredRate = (runsNeeded / ballsRemaining) * 6;

    if (requiredRate > 12) {
      // High pressure
      probs.six *= 1.3;
      probs.four *= 1.2;
      probs.wicket *= 1.4;
    } else if (requiredRate > 9) {
      probs.six *= 1.15;
      probs.four *= 1.1;
      probs.wicket *= 1.2;
    }
  }

  // Normalize probabilities
  const total = Object.values(probs).reduce((a, b) => a + b, 0);
  Object.keys(probs).forEach((key) => {
    probs[key as keyof typeof probs] /= total;
  });

  // Roll the dice
  const rand = Math.random();
  let cumulative = 0;
  let outcome: BallOutcome;

  if (rand < (cumulative += probs.dot)) {
    outcome = { type: 'runs', runs: 0 };
  } else if (rand < (cumulative += probs.single)) {
    outcome = { type: 'runs', runs: 1 };
  } else if (rand < (cumulative += probs.two)) {
    outcome = { type: 'runs', runs: 2 };
  } else if (rand < (cumulative += probs.three)) {
    outcome = { type: 'runs', runs: 3 };
  } else if (rand < (cumulative += probs.four)) {
    // Check if boundary is saved by athletic fielding
    if (teamFielding) {
      const saveResult = checkBoundarySave(teamFielding);
      if (saveResult.saved) {
        outcome = { type: 'runs', runs: saveResult.savedTo };
      } else {
        outcome = { type: 'runs', runs: 4 };
      }
    } else {
      outcome = { type: 'runs', runs: 4 };
    }
  } else if (rand < (cumulative += probs.six)) {
    outcome = { type: 'runs', runs: 6 };
  } else {
    // Use fielding context for dismissal type
    const fielding = teamFielding ?? { catching: FIELDING_BASELINE, throwing: FIELDING_BASELINE };
    outcome = { type: 'wicket', dismissal: getRandomDismissal(fieldSetting, fielding), runs: 0 };
  }

  // Small chance of extras
  if (Math.random() < 0.03 && outcome.type === 'runs') {
    const extraType = Math.random() < 0.7 ? 'wide' : 'noball';
    outcome = { type: 'extra', extraType, runs: 1 };
  }

  const narrative = generateNarrative(outcome, batter, bowler);

  return { outcome, narrative };
};

// ============================================
// SINGLE BALL SIMULATION (for ball-by-ball mode)
// ============================================

export const simulateSingleBall = (
  battingTeam: Player[],
  bowler: Player,
  inningsState: InningsState,
  tactics: MatchTactics,
  pitch: PitchConditions,
  target: number | null
): { ballEvent: BallEvent; updatedInnings: InningsState; newBatsmanNeeded: boolean; inningsComplete: boolean } => {
  const overNumber = inningsState.overs;
  const ballNumber = inningsState.balls;

  // Get striker
  const strikerIndex = 0; // First batter is always striker in state
  const striker = battingTeam.find((p) => p.id === inningsState.currentBatters[strikerIndex]);

  if (!striker) {
    // All out - shouldn't happen if called correctly
    return {
      ballEvent: null as unknown as BallEvent,
      updatedInnings: inningsState,
      newBatsmanNeeded: false,
      inningsComplete: true,
    };
  }

  const { outcome, narrative } = simulateBall(
    striker,
    bowler,
    overNumber + ballNumber / 6,
    inningsState.wickets,
    target,
    inningsState.runs,
    tactics,
    pitch
  );

  // Create ball event
  const ballEvent: BallEvent = {
    over: overNumber,
    ball: ballNumber + 1,
    batter: striker.id,
    bowler: bowler.id,
    outcome,
    narrative,
  };

  // Calculate new state
  let newRuns = inningsState.runs;
  let newWickets = inningsState.wickets;
  let newBalls = ballNumber;
  let newOvers = overNumber;
  let currentBatters = [...inningsState.currentBatters];
  let strikerIdx = 0;
  let newBatsmanNeeded = false;
  let isLegalDelivery = true;

  // Process outcome
  if (outcome.type === 'wicket') {
    newWickets++;
    newRuns += outcome.runs;
    newBalls++;
    newBatsmanNeeded = newWickets < 10;

    // Get next batter if available (all players in playing XI can bat)
    const availableBatters = battingTeam.filter(
      (p) =>
        !currentBatters.includes(p.id) &&
        !inningsState.fallOfWickets.some((f) => f.player === p.id)
    );

    if (availableBatters.length > 0 && newWickets < 10) {
      currentBatters[strikerIdx] = availableBatters[0].id;
    }
  } else if (outcome.type === 'extra') {
    newRuns += outcome.runs;
    if (outcome.extraType === 'wide' || outcome.extraType === 'noball') {
      isLegalDelivery = false;
    } else {
      newBalls++;
    }
  } else {
    newRuns += outcome.runs;
    newBalls++;
    // Rotate strike on odd runs
    if (outcome.runs % 2 === 1) {
      currentBatters = [currentBatters[1], currentBatters[0]];
    }
  }

  // Check if over complete
  if (newBalls >= BALLS_PER_OVER) {
    newOvers++;
    newBalls = 0;
    // Rotate strike at end of over
    currentBatters = [currentBatters[1], currentBatters[0]];
  }

  // Check if innings complete
  const inningsComplete =
    newWickets >= 10 ||
    newOvers >= TOTAL_OVERS ||
    (target !== null && newRuns >= target);

  // Create updated innings state
  const updatedInnings: InningsState = {
    ...inningsState,
    runs: newRuns,
    wickets: newWickets,
    overs: newOvers,
    balls: newBalls,
    currentBatters: currentBatters as [string, string],
    currentBowler: bowler.id,
    overSummaries: inningsState.overSummaries, // Will be updated when over completes
    fallOfWickets: outcome.type === 'wicket'
      ? [...inningsState.fallOfWickets, { player: striker.id, runs: newRuns, overs: overNumber + (ballNumber + 1) / 10 }]
      : inningsState.fallOfWickets,
    batterStats: new Map(inningsState.batterStats),
    bowlerStats: new Map(inningsState.bowlerStats),
  };

  // Update batter stats
  const existingBatterStats = updatedInnings.batterStats.get(striker.id) || {
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
  };

  if (outcome.type === 'runs') {
    existingBatterStats.runs += outcome.runs;
    existingBatterStats.balls += 1;
    if (outcome.runs === 4) existingBatterStats.fours += 1;
    if (outcome.runs === 6) existingBatterStats.sixes += 1;
  } else if (outcome.type === 'wicket') {
    existingBatterStats.runs += outcome.runs;
    existingBatterStats.balls += 1;
  }
  updatedInnings.batterStats.set(striker.id, existingBatterStats);

  // Update bowler stats
  const existingBowlerStats = updatedInnings.bowlerStats.get(bowler.id) || {
    overs: 0,
    runs: 0,
    wickets: 0,
    dots: 0,
  };

  if (outcome.type === 'runs') {
    existingBowlerStats.runs += outcome.runs;
    if (outcome.runs === 0) existingBowlerStats.dots += 1;
  } else if (outcome.type === 'wicket') {
    existingBowlerStats.wickets += 1;
    existingBowlerStats.runs += outcome.runs;
  } else if (outcome.type === 'extra') {
    existingBowlerStats.runs += outcome.runs;
  }

  // Update bowler's overs if this ball completed an over
  if (newBalls === 0 && isLegalDelivery) {
    existingBowlerStats.overs += 1;
  }
  updatedInnings.bowlerStats.set(bowler.id, existingBowlerStats);

  return { ballEvent, updatedInnings, newBatsmanNeeded, inningsComplete };
};

// ============================================
// OVER SIMULATION
// ============================================

export const simulateOver = (
  battingTeam: Player[],
  bowler: Player,
  inningsState: InningsState,
  tactics: MatchTactics,
  pitch: PitchConditions,
  target: number | null
): { overSummary: OverSummary; updatedInnings: InningsState } => {
  const overNumber = Math.floor(inningsState.overs);
  const balls: BallEvent[] = [];
  let runs = 0;
  let wickets = 0;

  let currentBatters = [...inningsState.currentBatters];
  let strikerIndex = 0; // 0 = first batter is on strike

  // Get available batters (not out yet - all players in playing XI can bat)
  const battedPlayerIds = new Set(
    Array.from(inningsState.batterStats.keys())
  );
  const availableBatters = battingTeam.filter(
    (p) => !inningsState.fallOfWickets.some((f) => f.player === p.id)
  );

  let ballNumber = 0;
  while (ballNumber < BALLS_PER_OVER) {
    const striker = battingTeam.find((p) => p.id === currentBatters[strikerIndex])!;

    if (!striker) {
      // All out
      break;
    }

    const { outcome, narrative } = simulateBall(
      striker,
      bowler,
      inningsState.overs + ballNumber / 6,
      inningsState.wickets + wickets,
      target,
      inningsState.runs + runs,
      tactics,
      pitch
    );

    // Record ball event
    balls.push({
      over: overNumber,
      ball: ballNumber + 1,
      batter: striker.id,
      bowler: bowler.id,
      outcome,
      narrative,
    });

    // Process outcome
    if (outcome.type === 'wicket') {
      wickets++;
      runs += outcome.runs;

      // Get next batter
      const nextBatter = availableBatters.find(
        (p) => !currentBatters.includes(p.id) && !inningsState.fallOfWickets.some((f) => f.player === p.id)
      );

      if (nextBatter && inningsState.wickets + wickets < 10) {
        currentBatters[strikerIndex] = nextBatter.id;
      } else {
        // All out
        break;
      }

      ballNumber++;
    } else if (outcome.type === 'extra') {
      runs += outcome.runs;
      if (outcome.extraType === 'wide' || outcome.extraType === 'noball') {
        // Don't count the ball
        continue;
      }
      ballNumber++;
    } else {
      runs += outcome.runs;
      // Rotate strike on odd runs
      if (outcome.runs % 2 === 1) {
        strikerIndex = 1 - strikerIndex;
      }
      ballNumber++;
    }

    // Check if target reached mid-over (chase successful)
    if (target !== null && (inningsState.runs + runs) >= target) {
      break;
    }
  }

  // Rotate strike at end of over (only if full over completed)
  const overComplete = ballNumber >= BALLS_PER_OVER;
  if (overComplete) {
    strikerIndex = 1 - strikerIndex;
  }

  const overSummary: OverSummary = {
    overNumber,
    bowler: bowler.id,
    runs,
    wickets,
    balls,
  };

  // Update innings state - handle partial overs correctly
  const updatedInnings: InningsState = {
    ...inningsState,
    runs: inningsState.runs + runs,
    wickets: inningsState.wickets + wickets,
    overs: overComplete ? overNumber + 1 : overNumber,
    balls: overComplete ? 0 : ballNumber, // Reset to 0 if complete, otherwise track partial
    currentBatters: [currentBatters[strikerIndex], currentBatters[1 - strikerIndex]],
    currentBowler: bowler.id,
    overSummaries: [...inningsState.overSummaries, overSummary],
    batterStats: new Map(inningsState.batterStats),
    bowlerStats: new Map(inningsState.bowlerStats),
  };

  // Update fall of wickets and individual stats
  balls.forEach((ball) => {
    if (ball.outcome.type === 'wicket') {
      updatedInnings.fallOfWickets.push({
        player: ball.batter,
        runs: updatedInnings.runs,
        overs: ball.over + ball.ball / 10,
      });
    }

    // Update batter stats
    const batterId = ball.batter;
    const existingBatterStats = updatedInnings.batterStats.get(batterId) || {
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
    };

    if (ball.outcome.type === 'runs') {
      existingBatterStats.runs += ball.outcome.runs;
      existingBatterStats.balls += 1;
      if (ball.outcome.runs === 4) existingBatterStats.fours += 1;
      if (ball.outcome.runs === 6) existingBatterStats.sixes += 1;
    } else if (ball.outcome.type === 'wicket') {
      existingBatterStats.runs += ball.outcome.runs;
      existingBatterStats.balls += 1;
    }
    // Don't count wides/noballs as balls faced for the batter

    updatedInnings.batterStats.set(batterId, existingBatterStats);

    // Update bowler stats
    const existingBowlerStats = updatedInnings.bowlerStats.get(bowler.id) || {
      overs: 0,
      runs: 0,
      wickets: 0,
      dots: 0,
    };

    if (ball.outcome.type === 'runs') {
      existingBowlerStats.runs += ball.outcome.runs;
      if (ball.outcome.runs === 0) existingBowlerStats.dots += 1;
    } else if (ball.outcome.type === 'wicket') {
      existingBowlerStats.wickets += 1;
      existingBowlerStats.runs += ball.outcome.runs;
    } else if (ball.outcome.type === 'extra') {
      existingBowlerStats.runs += ball.outcome.runs;
    }

    updatedInnings.bowlerStats.set(bowler.id, existingBowlerStats);
  });

  // Update bowler's overs only if full over completed
  if (overComplete) {
    const bowlerStats = updatedInnings.bowlerStats.get(bowler.id);
    if (bowlerStats) {
      bowlerStats.overs += 1;
      updatedInnings.bowlerStats.set(bowler.id, bowlerStats);
    }
  }

  return { overSummary, updatedInnings };
};

// ============================================
// FULL INNINGS SIMULATION
// ============================================

export const simulateInnings = (
  battingTeamPlayers: Player[],
  bowlingTeamPlayers: Player[],
  tactics: MatchTactics,
  pitch: PitchConditions,
  target: number | null = null
): InningsState => {
  // Get players in batting order
  const battingOrder = tactics.playingXI
    .map((id) => battingTeamPlayers.find((p) => p.id === id)!)
    .filter(Boolean);

  // Get bowlers
  const bowlers = bowlingTeamPlayers.filter(
    (p) => p.role === 'bowler' || p.role === 'allrounder'
  );

  // Track overs bowled by each bowler for the 4-over limit
  const bowlerOversCount: Map<string, number> = new Map();
  bowlers.forEach(b => bowlerOversCount.set(b.id, 0));

  let inningsState: InningsState = {
    battingTeam: battingOrder[0]?.contract.isOverseas ? 'overseas' : 'domestic',
    bowlingTeam: '',
    runs: 0,
    wickets: 0,
    overs: 0,
    balls: 0,
    currentBatters: [battingOrder[0]?.id || '', battingOrder[1]?.id || ''],
    currentBowler: bowlers[0]?.id || '',
    overSummaries: [],
    fallOfWickets: [],
    batterStats: new Map(),
    bowlerStats: new Map(),
  };

  let lastBowlerId: string | null = null;

  for (let over = 0; over < TOTAL_OVERS; over++) {
    // Get available bowlers (haven't maxed out and didn't bowl last over)
    const availableBowlers = bowlers.filter(b => {
      const oversBowled = bowlerOversCount.get(b.id) || 0;
      return oversBowled < MAX_OVERS_PER_BOWLER && b.id !== lastBowlerId;
    });

    if (availableBowlers.length === 0) {
      // If no bowlers available (shouldn't happen with proper squad), allow last bowler
      const stillAvailable = bowlers.filter(b => (bowlerOversCount.get(b.id) || 0) < MAX_OVERS_PER_BOWLER);
      if (stillAvailable.length === 0) break; // All bowlers maxed out
      availableBowlers.push(stillAvailable[0]);
    }

    // Select bowler - prefer death specialist in death overs
    let bowler = availableBowlers[0];
    if (over >= 16 && tactics.bowlingPlan.deathBowler) {
      const deathBowler = availableBowlers.find((b) => b.id === tactics.bowlingPlan.deathBowler);
      if (deathBowler) {
        bowler = deathBowler;
      }
    } else {
      // Simple rotation from available bowlers
      bowler = availableBowlers[Math.floor(Math.random() * availableBowlers.length)];
    }

    lastBowlerId = bowler.id;
    // Increment this bowler's over count
    bowlerOversCount.set(bowler.id, (bowlerOversCount.get(bowler.id) || 0) + 1);

    const { updatedInnings } = simulateOver(
      battingOrder,
      bowler,
      inningsState,
      tactics,
      pitch,
      target
    );

    inningsState = updatedInnings;

    // Check if innings is over
    if (inningsState.wickets >= 10) break;
    if (target !== null && inningsState.runs >= target) break;
  }

  return inningsState;
};

// ============================================
// FULL MATCH SIMULATION
// ============================================

export const simulateMatch = (
  homeTeamPlayers: Player[],
  awayTeamPlayers: Player[],
  match: Match
): MatchResult => {
  const { homeTactics, awayTactics, pitch } = match;

  if (!homeTactics || !awayTactics) {
    throw new Error('Both teams must have tactics set');
  }

  // Toss
  const tossWinner = Math.random() < 0.5 ? 'home' : 'away';
  const tossDecision: 'bat' | 'bowl' = Math.random() < 0.6 ? 'bat' : 'bowl';

  let battingFirst: Player[];
  let bowlingFirst: Player[];
  let battingFirstTactics: MatchTactics;
  let bowlingFirstTactics: MatchTactics;

  if ((tossWinner === 'home' && tossDecision === 'bat') || (tossWinner === 'away' && tossDecision === 'bowl')) {
    battingFirst = homeTeamPlayers;
    bowlingFirst = awayTeamPlayers;
    battingFirstTactics = homeTactics;
    bowlingFirstTactics = awayTactics;
  } else {
    battingFirst = awayTeamPlayers;
    bowlingFirst = homeTeamPlayers;
    battingFirstTactics = awayTactics;
    bowlingFirstTactics = homeTactics;
  }

  // First innings
  const firstInnings = simulateInnings(
    battingFirst,
    bowlingFirst,
    battingFirstTactics,
    pitch,
    null
  );

  // Second innings
  const target = firstInnings.runs + 1;
  const secondInnings = simulateInnings(
    bowlingFirst,
    battingFirst,
    bowlingFirstTactics,
    pitch,
    target
  );

  // Determine winner
  let winner: string | null;
  let winMargin: { type: 'runs' | 'wickets'; value: number } | null;

  const firstInningsTeamId = battingFirst === homeTeamPlayers ? match.homeTeam : match.awayTeam;
  const secondInningsTeamId = battingFirst === homeTeamPlayers ? match.awayTeam : match.homeTeam;

  if (secondInnings.runs >= target) {
    winner = secondInningsTeamId;
    winMargin = { type: 'wickets', value: 10 - secondInnings.wickets };
  } else if (secondInnings.runs < firstInnings.runs) {
    winner = firstInningsTeamId;
    winMargin = { type: 'runs', value: firstInnings.runs - secondInnings.runs };
  } else {
    winner = null; // Tie
    winMargin = null;
  }

  // Simple player of match selection (highest scorer or best bowler)
  const allPlayers = [...homeTeamPlayers, ...awayTeamPlayers];
  const playerOfMatch = allPlayers[Math.floor(Math.random() * allPlayers.length)]?.id || '';

  return {
    winner,
    winMargin,
    playerOfMatch,
    firstInnings,
    secondInnings,
  };
};

// ============================================
// UTILITY: Generate default tactics for AI teams
// ============================================

export const generateDefaultTactics = (teamPlayers: Player[], captain: string): MatchTactics => {
  // Sort players by role for batting order
  const batsmen = teamPlayers.filter((p) => p.role === 'batsman' || p.role === 'keeper');
  const allrounders = teamPlayers.filter((p) => p.role === 'allrounder');
  const bowlers = teamPlayers.filter((p) => p.role === 'bowler');

  // Simple batting order: openers, middle order, allrounders, bowlers
  const playingXI = [
    ...batsmen.slice(0, 4),
    ...allrounders.slice(0, 2),
    ...bowlers.slice(0, 4),
    ...batsmen.slice(4, 5),
  ]
    .slice(0, 11)
    .map((p) => p.id);

  // Find wicketkeeper
  const keeper = teamPlayers.find((p) => p.role === 'keeper');

  // Find opening bowlers and death specialist
  const fastBowlers = bowlers.filter((p) => p.bowlingStyle?.includes('fast') || p.bowlingStyle?.includes('medium'));
  const openingBowlers: [string, string] = [
    fastBowlers[0]?.id || bowlers[0]?.id || '',
    fastBowlers[1]?.id || bowlers[1]?.id || '',
  ];

  return {
    playingXI,
    captain,
    wicketkeeper: keeper?.id || playingXI[0],
    battingApproach: {
      powerplay: 'aggressive',
      middle: 'balanced',
      death: 'aggressive',
    },
    bowlingPlan: {
      openingBowlers,
      deathBowler: fastBowlers[0]?.id || bowlers[0]?.id || '',
      spinStrategy: 'middle',
      bowlingApproach: {
        powerplay: { length: 'full-pitched', field: 'attacking' },
        middle: { length: 'good-length', field: 'balanced' },
        death: { length: 'yorkers', field: 'death-field' },
      },
    },
    playerInstructions: [],
  };
};

// Export helper for use in live match UI
export { getTeamFieldingSkill };
