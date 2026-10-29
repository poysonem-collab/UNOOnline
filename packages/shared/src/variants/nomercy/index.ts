import { DEFAULT_RULES } from '../../types.js';
import { classic } from '../classic/index.js';
import { createGame } from '../classic/engine.js';
import type { Variant } from '../Variant.js';

/**
 * UNO Show 'Em No Mercy: a 168-card deck of brutal draw cards. Stacking, 7-0 and
 * draw-until-playable are always on, and anyone holding 25+ cards is knocked out.
 */
export const noMercy: Variant = {
  ...classic,
  id: 'no-mercy',
  name: "UNO Show 'Em No Mercy",
  defaultRules: { ...DEFAULT_RULES, stackDraws: true, sevenZero: true, drawUntilPlayable: true },
  // Stacking, 7-0 and draw-until-playable are part of the game, so the host can't turn them off.
  availableRules: [
    'handSize',
    'turnTimerSeconds',
    'deckCount',
    'winCondition',
    'mercyLimit',
    'noMercyExpansion',
    'stackSameNumber',
    'jumpIn',
    'noActionFinish',
  ],
  createGame: (players, rules, seed) => createGame(players, rules, seed, 'no-mercy'),
};
