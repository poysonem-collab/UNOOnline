import { DEFAULT_RULES } from '../../types.js';
import { classic } from '../classic/index.js';
import { createGame } from '../classic/engine.js';
import type { Variant } from '../Variant.js';

/**
 * UNO Flip runs on the classic engine with a two-sided deck: the Flip card turns
 * every card over, swapping the light side for the darker, harsher dark side.
 */
export const flip: Variant = {
  ...classic,
  id: 'flip',
  name: 'UNO Flip',
  defaultRules: DEFAULT_RULES,
  createGame: (players, rules, seed) => createGame(players, rules, seed, 'flip'),
};
