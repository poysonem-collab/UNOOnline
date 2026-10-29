import { classic } from './variants/classic/index.js';
import { flip } from './variants/flip/index.js';
import { allWild } from './variants/allwild/index.js';
import { flex } from './variants/flex/index.js';
import { giant } from './variants/giant/index.js';
import { noMercy } from './variants/nomercy/index.js';
import type { Variant } from './variants/Variant.js';

export * from './types.js';
export * from './rng.js';
export * from './catalog.js';
export * from './describe.js';
export * from './protocol.js';
export * from './ruleSettings.js';
export type { Variant, BotDifficulty } from './variants/Variant.js';
export { classic } from './variants/classic/index.js';
export { flip } from './variants/flip/index.js';
export { buildFlipDecks, flipPoints } from './variants/flip/deck.js';
export { noMercy } from './variants/nomercy/index.js';
export { buildNoMercyDecks, noMercyPoints } from './variants/nomercy/deck.js';
export { giant } from './variants/giant/index.js';
export { allWild } from './variants/allwild/index.js';
export { allWildPoints, buildAllWildDecks } from './variants/allwild/deck.js';
export { flex } from './variants/flex/index.js';
export { buildFlexDecks } from './variants/flex/deck.js';
export { FLEX_SIDE_INFO, flexNeedsTarget, flexSide, type FlexSide } from './variants/flex/flex.js';
export { buildGiantDecks } from './variants/giant/deck.js';
export { CUSTOM_EFFECT_INFO, customWildFor, customWildTitle, GIANT_CUSTOM_WILDS, MAX_CUSTOM_NAME } from './variants/giant/customWilds.js';
export { deckFor } from './variants/decks.js';
export { BOT_CATCH_CHANCE, BOT_JUMP_IN_CHANCE, BOT_LEVELS, BOT_REACTION } from './variants/classic/bot.js';
export { buildClassicDeck, cardPoints } from './variants/classic/deck.js';
export { canPlayOn, canStackTogether, flexableIdsFromView, playableIdsFromView } from './variants/classic/rules.js';

export const VARIANTS: Record<string, Variant> = {
  [classic.id]: classic,
  [flip.id]: flip,
  [noMercy.id]: noMercy,
  [giant.id]: giant,
  [allWild.id]: allWild,
  [flex.id]: flex,
};

export function getVariant(id: string): Variant {
  const variant = VARIANTS[id];
  if (!variant) throw new Error(`Unknown variant: ${id}`);
  return variant;
}
