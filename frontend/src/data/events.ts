import { GameEvent, EventOption, EventEffect, Player } from '../types';
import { v4 as uuid } from 'uuid';

// Event templates that can be instantiated with specific players/context

interface EventTemplate {
  id: string;
  category: 'player' | 'media' | 'team' | 'board';
  title: string;
  description: (context: EventContext) => string;
  condition?: (context: EventContext) => boolean;
  options: {
    id: string;
    label: string;
    description: string;
    effects: (context: EventContext) => EventEffect[];
  }[];
}

interface EventContext {
  player?: Player;
  recentResults?: ('win' | 'loss')[];
  teamMorale?: number;
  boardPatience?: number;
  pressHeat?: number;
}

// ============================================
// EVENT TEMPLATES
// ============================================

const EVENT_TEMPLATES: EventTemplate[] = [
  // Player Events
  {
    id: 'player-unhappy-playtime',
    category: 'player',
    title: 'Playing Time Complaint',
    description: (ctx) => `${ctx.player?.name} has approached you expressing frustration about lack of playing time. "I didn't join this team to sit on the bench," he says.`,
    condition: (ctx) => ctx.player !== undefined && ctx.player.morale < 70,
    options: [
      {
        id: 'promise-chances',
        label: 'Promise more chances',
        description: 'Assure him he\'ll get more opportunities soon',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: 15 },
        ],
      },
      {
        id: 'explain-competition',
        label: 'Explain the competition',
        description: 'Tell him he needs to earn his spot in training',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: -5 },
          { target: 'player', targetId: ctx.player?.id, attribute: 'form', change: 3 },
        ],
      },
      {
        id: 'dismiss-concerns',
        label: 'Dismiss his concerns',
        description: 'Tell him to focus on being ready when called upon',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: -15 },
        ],
      },
    ],
  },
  {
    id: 'player-form-slump',
    category: 'player',
    title: 'Crisis of Confidence',
    description: (ctx) => `${ctx.player?.name} is struggling with form and seems to have lost confidence. He's been seen practicing alone late into the night.`,
    condition: (ctx) => ctx.player !== undefined && ctx.player.form < -5,
    options: [
      {
        id: 'personal-coaching',
        label: 'Arrange personal coaching',
        description: 'Get specialist coaches to work with him',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'form', change: 8 },
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: 10 },
        ],
      },
      {
        id: 'rest-player',
        label: 'Give him a break',
        description: 'Rest him for a match to clear his head',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'fatigue', change: -20 },
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: 5 },
        ],
      },
      {
        id: 'tough-love',
        label: 'Tough love approach',
        description: 'Tell him to figure it out - he\'s a professional',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: -10 },
          { target: 'player', targetId: ctx.player?.id, attribute: 'form', change: -3 },
        ],
      },
    ],
  },
  {
    id: 'player-nightlife',
    category: 'player',
    title: 'Late Night Controversy',
    description: (ctx) => `Photos of ${ctx.player?.name} partying late before a match day have surfaced on social media. The press is asking questions.`,
    options: [
      {
        id: 'fine-player',
        label: 'Fine the player',
        description: 'Issue a formal fine and warning',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: -20 },
          { target: 'team', attribute: 'pressHeat', change: -10 },
        ],
      },
      {
        id: 'defend-publicly',
        label: 'Defend him publicly',
        description: 'Tell the press players have personal lives too',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: 10 },
          { target: 'team', attribute: 'pressHeat', change: 15 },
        ],
      },
      {
        id: 'no-comment',
        label: 'No comment',
        description: 'Decline to address it publicly, handle internally',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: -5 },
          { target: 'team', attribute: 'pressHeat', change: 5 },
        ],
      },
    ],
  },

  // Media Events
  {
    id: 'media-losing-streak',
    category: 'media',
    title: 'Press Conference: Losing Streak',
    description: () => `"You've lost your last few matches. Are you concerned about the team's direction?" The press room falls silent awaiting your response.`,
    // Check if the LAST 2 results are losses (actual losing streak, not just any 2 losses in history)
    condition: (ctx) => {
      const results = ctx.recentResults || [];
      if (results.length < 2) return false;
      const lastTwo = results.slice(-2);
      return lastTwo.every(r => r === 'loss');
    },
    options: [
      {
        id: 'accept-responsibility',
        label: 'Accept responsibility',
        description: '"The buck stops with me. We\'ll work harder."',
        effects: () => [
          { target: 'team', attribute: 'pressHeat', change: -15 },
          { target: 'team', attribute: 'morale', change: 5 },
        ],
      },
      {
        id: 'deflect-luck',
        label: 'Blame bad luck',
        description: '"Cricket is a game of margins. Luck hasn\'t been with us."',
        effects: () => [
          { target: 'team', attribute: 'pressHeat', change: 10 },
        ],
      },
      {
        id: 'attack-press',
        label: 'Attack the question',
        description: '"We\'re three matches in. Let\'s not overreact."',
        effects: () => [
          { target: 'team', attribute: 'pressHeat', change: 20 },
          { target: 'team', attribute: 'morale', change: -5 },
        ],
      },
    ],
  },
  {
    id: 'media-star-player',
    category: 'media',
    title: 'Star Player Speculation',
    description: (ctx) => `Reporters are asking about ${ctx.player?.name}'s future. "There are rumors other franchises are interested. Any comment?"`,
    options: [
      {
        id: 'commit-player',
        label: 'Publicly commit to player',
        description: '"He\'s central to our plans. Not going anywhere."',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: 15 },
          { target: 'team', attribute: 'pressHeat', change: -5 },
        ],
      },
      {
        id: 'diplomatic',
        label: 'Diplomatic response',
        description: '"We don\'t discuss contracts in public."',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: -5 },
        ],
      },
      {
        id: 'open-door',
        label: 'Leave door open',
        description: '"In cricket, anything can happen. We\'ll see."',
        effects: (ctx) => [
          { target: 'player', targetId: ctx.player?.id, attribute: 'morale', change: -20 },
          { target: 'team', attribute: 'pressHeat', change: 10 },
        ],
      },
    ],
  },

  // Board Events
  {
    id: 'board-expectations',
    category: 'board',
    title: 'Board Meeting: Expectations',
    description: () => `The franchise owners have called a meeting. "We need to discuss expectations for this season. The sponsors are watching."`,
    options: [
      {
        id: 'promise-playoffs',
        label: 'Promise playoff qualification',
        description: 'Commit to making the top 4',
        effects: () => [
          { target: 'manager', attribute: 'boardExpectations', change: 1 }, // Sets high expectations
          { target: 'team', attribute: 'boardPatience', change: 10 },
        ],
      },
      {
        id: 'building-phase',
        label: 'Emphasize building phase',
        description: '"We\'re building something special. Need time."',
        effects: () => [
          { target: 'team', attribute: 'boardPatience', change: 20 },
          { target: 'team', attribute: 'pressHeat', change: -10 },
        ],
      },
      {
        id: 'no-promises',
        label: 'Make no promises',
        description: '"We\'ll compete hard. That\'s all I can guarantee."',
        effects: () => [
          { target: 'team', attribute: 'boardPatience', change: 5 },
        ],
      },
    ],
  },
  {
    id: 'board-sponsor-concern',
    category: 'board',
    title: 'Sponsor Concerns',
    description: () => `The title sponsor has expressed concerns about the team's performance. The board wants to know your plan.`,
    // Check if the LAST 2 results are losses (actual poor run of form)
    condition: (ctx) => {
      const results = ctx.recentResults || [];
      if (results.length < 2) return false;
      const lastTwo = results.slice(-2);
      return lastTwo.every(r => r === 'loss');
    },
    options: [
      {
        id: 'tactical-changes',
        label: 'Promise tactical changes',
        description: '"We\'re adjusting our approach. Results will come."',
        effects: () => [
          { target: 'team', attribute: 'boardPatience', change: 10 },
          { target: 'team', attribute: 'pressHeat', change: -5 },
        ],
      },
      {
        id: 'back-players',
        label: 'Back your players',
        description: '"The squad is good enough. We need time to gel."',
        effects: () => [
          { target: 'team', attribute: 'morale', change: 10 },
          { target: 'team', attribute: 'boardPatience', change: -5 },
        ],
      },
      {
        id: 'request-patience',
        label: 'Request patience',
        description: '"Rome wasn\'t built in a day. Trust the process."',
        effects: () => [
          { target: 'team', attribute: 'boardPatience', change: 15 },
        ],
      },
    ],
  },
];

// ============================================
// EVENT GENERATION
// ============================================

export const generateRandomEvent = (
  players: Player[],
  recentResults: ('win' | 'loss')[],
  teamMorale: number,
  boardPatience: number,
  pressHeat: number
): GameEvent | null => {
  // 35% chance of event after each match
  if (Math.random() > 0.35) return null;

  // Build context
  const context: EventContext = {
    recentResults,
    teamMorale,
    boardPatience,
    pressHeat,
  };

  // Filter templates that meet conditions
  const eligibleTemplates = EVENT_TEMPLATES.filter((template) => {
    if (template.condition && !template.condition(context)) return false;
    return true;
  });

  if (eligibleTemplates.length === 0) return null;

  // Pick random template
  const template = eligibleTemplates[Math.floor(Math.random() * eligibleTemplates.length)];

  // If template needs a player, pick one
  let selectedPlayer: Player | undefined;
  if (template.category === 'player' || template.id === 'media-star-player') {
    // For player events, pick based on conditions
    if (template.id === 'player-unhappy-playtime') {
      // Pick a player with low morale
      const unhappyPlayers = players.filter((p) => p.morale < 70);
      if (unhappyPlayers.length > 0) {
        selectedPlayer = unhappyPlayers[Math.floor(Math.random() * unhappyPlayers.length)];
      }
    } else if (template.id === 'player-form-slump') {
      // Pick a player with poor form
      const slumpingPlayers = players.filter((p) => p.form < -5);
      if (slumpingPlayers.length > 0) {
        selectedPlayer = slumpingPlayers[Math.floor(Math.random() * slumpingPlayers.length)];
      }
    } else {
      // Random player for other events
      selectedPlayer = players[Math.floor(Math.random() * players.length)];
    }

    // If we need a player but couldn't find one, skip this event
    if (!selectedPlayer && (template.category === 'player' || template.id === 'media-star-player')) {
      return null;
    }
  }

  const eventContext: EventContext = {
    ...context,
    player: selectedPlayer,
  };

  // Build the event
  const event: GameEvent = {
    id: uuid(),
    type: 'random',
    category: template.category,
    title: template.title,
    description: template.description(eventContext),
    involvedPlayers: selectedPlayer ? [selectedPlayer.id] : [],
    urgency: 'end-of-day',
    options: template.options.map((opt) => ({
      id: opt.id,
      label: opt.label,
      description: opt.description,
      effects: opt.effects(eventContext),
    })),
    createdAt: new Date().toISOString(),
    resolved: false,
  };

  return event;
};

// Helper to apply event effects
export const applyEventEffects = (
  effects: EventEffect[],
  updatePlayer: (id: string, updates: Partial<Player>) => void,
  updateTeamState: (updates: { pressHeat?: number; boardPatience?: number; morale?: number }) => void
) => {
  effects.forEach((effect) => {
    if (effect.target === 'player' && effect.targetId) {
      const update: Partial<Player> = {};
      if (effect.attribute === 'morale') {
        update.morale = effect.change; // Will be added to current value
      } else if (effect.attribute === 'form') {
        update.form = effect.change;
      } else if (effect.attribute === 'fatigue') {
        update.fatigue = effect.change;
      }
      updatePlayer(effect.targetId, update);
    } else if (effect.target === 'team') {
      const update: { pressHeat?: number; boardPatience?: number; morale?: number } = {};
      if (effect.attribute === 'pressHeat') {
        update.pressHeat = effect.change;
      } else if (effect.attribute === 'boardPatience') {
        update.boardPatience = effect.change;
      } else if (effect.attribute === 'morale') {
        update.morale = effect.change;
      }
      updateTeamState(update);
    }
  });
};
