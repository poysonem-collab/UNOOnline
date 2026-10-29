import { MAX_PLAYERS, type RuleSet } from './types.js';
import { deckFor } from './variants/decks.js';
import { sanitizeCustomWilds } from './variants/giant/customWilds.js';
import type { Variant } from './variants/Variant.js';

/** Fewer cards than this left after dealing means a second deck is needed. */
const MIN_DRAW_PILE = 10;

export const HAND_SIZES = [5, 6, 7, 8, 9, 10] as const;
export const TURN_TIMERS = [0, 15, 30, 60] as const;
/** No Mercy: how many cards knock you out. */
export const MERCY_LIMITS = [25, 50] as const;

export function needsTwoDecks(playerCount: number, handSize: number, variantId = 'classic'): boolean {
  return playerCount * handSize >= deckFor(variantId).size - MIN_DRAW_PILE;
}

/**
 * Builds a valid RuleSet from untrusted input (e.g. sent by a browser).
 * Only rules the variant offers can be changed; anything invalid falls back to the default.
 */
export function sanitizeRules(variant: Variant, input: unknown): RuleSet {
  const rules: RuleSet = { ...variant.defaultRules };
  if (typeof input !== 'object' || input === null) return rules;
  const raw = input as Record<string, unknown>;

  for (const key of variant.availableRules) {
    const value = raw[key];
    const fallback = rules[key];
    if (key === 'handSize') {
      if (HAND_SIZES.includes(value as 7)) rules.handSize = value as number;
    } else if (key === 'turnTimerSeconds') {
      if (TURN_TIMERS.includes(value as 0)) rules.turnTimerSeconds = value as RuleSet['turnTimerSeconds'];
    } else if (key === 'deckCount') {
      if (value === 1 || value === 2) rules.deckCount = value;
    } else if (key === 'winCondition') {
      if (value === 'firstOut' || value === 'points500') rules.winCondition = value;
    } else if (key === 'mercyLimit') {
      if (MERCY_LIMITS.includes(value as 25)) rules.mercyLimit = value as RuleSet['mercyLimit'];
    } else if (key === 'customWilds') {
      rules.customWilds = sanitizeCustomWilds(value, variant.defaultRules.customWilds);
    } else if (typeof fallback === 'boolean' && typeof value === 'boolean') {
      (rules[key] as boolean) = value;
    }
  }
  return rules;
}

/** The rules actually used to start a game with this many players. */
export function rulesForPlayerCount(rules: RuleSet, playerCount: number, variantId = 'classic'): RuleSet {
  if (playerCount > MAX_PLAYERS) throw new Error('Too many players');
  return needsTwoDecks(playerCount, rules.handSize, variantId) ? { ...rules, deckCount: 2 } : rules;
}
