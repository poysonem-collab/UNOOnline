import { DEFAULT_RULES } from '../../types.js';
import type { Variant } from '../Variant.js';
import { chooseBotJumpIn, chooseBotMove } from './bot.js';
import { applyAction, createGame, getPlayerView, startNextRound } from './engine.js';
import { playableCards } from './rules.js';

export const classic: Variant = {
  id: 'classic',
  name: 'UNO',
  defaultRules: DEFAULT_RULES,
  availableRules: [
    'handSize',
    'turnTimerSeconds',
    'deckCount',
    'winCondition',
    'stackDraws',
    'stackPlus2OnPlus4',
    'stackSameNumber',
    'sevenZero',
    'jumpIn',
    'drawUntilPlayable',
    'challengeWild4',
    'noActionFinish',
  ],
  createGame,
  applyAction,
  startNextRound,
  getPlayerView,
  playableCards,
  chooseBotMove,
  chooseBotJumpIn,
};
