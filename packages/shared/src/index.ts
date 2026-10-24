import { classic } from './variants/classic/index.js';
import type { Variant } from './variants/Variant.js';

export * from './types.js';
export * from './rng.js';
export * from './catalog.js';
export * from './describe.js';
export * from './protocol.js';
export * from './ruleSettings.js';
export type { Variant, BotDifficulty } from './variants/Variant.js';
export { classic } from './variants/classic/index.js';
export { BOT_CATCH_CHANCE } from './variants/classic/bot.js';
export { buildClassicDeck, cardPoints } from './variants/classic/deck.js';
export { canPlayOn, playableIdsFromView } from './variants/classic/rules.js';

export const VARIANTS: Record<string, Variant> = {
  [classic.id]: classic,
};

export function getVariant(id: string): Variant {
  const variant = VARIANTS[id];
  if (!variant) throw new Error(`Unknown variant: ${id}`);
  return variant;
}
