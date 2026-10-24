import { DEFAULT_RULES } from '../../types.js';
import { classic } from '../classic/index.js';
import { createGame } from '../classic/engine.js';
import type { Variant } from '../Variant.js';

/**
 * UNO All Wild: every card is wild, so any card goes on any card and there are no colors.
 * Rules about colors and numbers (7-0, same numbers, the +4 challenge...) don't apply.
 */
export const allWild: Variant = {
  ...classic,
  id: 'all-wild',
  name: 'UNO All Wild',
  defaultRules: DEFAULT_RULES,
  availableRules: ['handSize', 'turnTimerSeconds', 'deckCount', 'winCondition', 'stackDraws'],
  createGame: (players, rules, seed) => createGame(players, rules, seed, 'all-wild'),
};
