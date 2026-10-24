import { DEFAULT_RULES } from '../../types.js';
import type { Variant } from '../Variant.js';
import { chooseBotMove } from './bot.js';
import { applyAction, createGame, getPlayerView, startNextRound } from './engine.js';
import { playableCards } from './rules.js';

export const classic: Variant = {
  id: 'classic',
  name: 'UNO',
  defaultRules: DEFAULT_RULES,
  // House rules (stacking, 7-0, jump-in, draw until playable) join this list in milestone 5.
  availableRules: ['handSize', 'turnTimerSeconds', 'deckCount', 'winCondition'],
  createGame,
  applyAction,
  startNextRound,
  getPlayerView,
  playableCards,
  chooseBotMove,
};
