import { classic } from '../classic/index.js';
import { createGame } from '../classic/engine.js';
import type { Variant } from '../Variant.js';

/**
 * UNO Flex: Flex cards have a second side. While your Power Card is green you can play a card's
 * flex side (a second color, or a stronger action), which turns your Power Card red.
 */
export const flex: Variant = {
  ...classic,
  id: 'flex',
  name: 'UNO Flex',
  createGame: (players, rules, seed) => createGame(players, rules, seed, 'flex'),
};
