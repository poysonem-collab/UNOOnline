import { CUSTOM_EFFECTS, type CardValue, type CustomEffect, type CustomWild, type RuleSet } from '../../types.js';

/** Longest name the host can write on a blank card. */
export const MAX_CUSTOM_NAME = 20;

/** What each effect does, for the rules panel and the game log. */
export const CUSTOM_EFFECT_INFO: Record<CustomEffect, { label: string; hint: string }> = {
  wild: { label: 'Plain wild', hint: 'Just a wild: pick the next color.' },
  everyoneDraws2: { label: 'Everyone else draws 2', hint: 'Every other player takes 2 cards.' },
  shuffleHands: { label: 'Shuffle hands', hint: "Everyone's cards are shuffled together and dealt back out evenly." },
  swapHands: { label: 'Swap hands', hint: 'Trade hands with any player you choose.' },
  skipTwo: { label: 'Skip two players', hint: 'The next two players miss their turn.' },
  playAgain: { label: 'Play again', hint: 'Pick a color, then take another turn.' },
  discardColor: { label: 'Discard a color', hint: 'Throw away every card of a color you pick from your hand.' },
};

/** Giant UNO comes with two blank wild cards. */
export const GIANT_CUSTOM_WILDS: CustomWild[] = [
  { name: '', effect: 'shuffleHands' },
  { name: '', effect: 'everyoneDraws2' },
];

const SLOTS: Partial<Record<CardValue, number>> = { custom1: 0, custom2: 1 };

/** The blank card this value stands for in these rules, or null if it isn't one. */
export function customWildFor(rules: Pick<RuleSet, 'customWilds'>, value: CardValue): CustomWild | null {
  const slot = SLOTS[value];
  if (slot === undefined) return null;
  return rules.customWilds[slot] ?? { name: '', effect: 'wild' };
}

/** What's written on a blank card: the host's name for it, or what it does. */
export function customWildTitle(custom: CustomWild): string {
  return custom.name || CUSTOM_EFFECT_INFO[custom.effect].label;
}

/** Tidies untrusted input into exactly as many blank cards as `fallback`, with short, plain names. */
export function sanitizeCustomWilds(input: unknown, fallback: CustomWild[]): CustomWild[] {
  const raw = Array.isArray(input) ? input : [];
  return fallback.map((def, i) => {
    const card = raw[i] as Partial<CustomWild> | undefined;
    const effect = CUSTOM_EFFECTS.includes(card?.effect as CustomEffect) ? (card!.effect as CustomEffect) : def.effect;
    const name = typeof card?.name === 'string' ? cleanName(card.name) : def.name;
    return { name, effect };
  });
}

function cleanName(name: string): string {
  // No control characters, no runs of spaces.
  return name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CUSTOM_NAME).trim();
}
