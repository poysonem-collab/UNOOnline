import { DEFAULT_RULES } from '../../types.js';
import { classic } from '../classic/index.js';
import { createGame } from '../classic/engine.js';
import type { Variant } from '../Variant.js';
import { GIANT_CUSTOM_WILDS } from './customWilds.js';

/** Giant UNO: the classic game with supersized cards, plus two blank wilds the host writes rules for. */
export const giant: Variant = {
  ...classic,
  id: 'giant',
  name: 'Giant UNO',
  defaultRules: { ...DEFAULT_RULES, customWilds: GIANT_CUSTOM_WILDS },
  availableRules: [...classic.availableRules, 'customWilds'],
  createGame: (players, rules, seed) => createGame(players, rules, seed, 'giant'),
};
