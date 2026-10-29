import type { CardFace, Color, GameEvent, PlayerInfo, RuleSet } from './types.js';
import { customWildFor, customWildTitle } from './variants/giant/customWilds.js';

const VALUE_NAMES: Record<string, string> = {
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw Two',
  wild: 'Wild',
  wild4: 'Wild Draw Four',
  draw1: 'Draw One',
  draw5: 'Draw Five',
  flip: 'Flip',
  skipAll: 'Skip Everyone',
  wild2: 'Wild Draw Two',
  wildColor: 'Wild Draw Color',
  draw4: 'Draw Four',
  discardAll: 'Discard All',
  wildRev4: 'Wild Reverse Draw 4',
  wild6: 'Wild Draw 6',
  wild10: 'Wild Draw 10',
  roulette: 'Wild Color Roulette',
  wildRev8: 'Wild Reverse Draw 8',
  wildDiscardAll: 'Wild Discard All',
  wildSkip: 'Wild Skip',
  wildSkip2: 'Wild Skip Two',
  wildReverse: 'Wild Reverse',
  wildTarget2: 'Wild Targeted Draw Two',
  wildSwap: 'Wild Forced Swap',
};

export function colorName(color: Color): string {
  return color[0]!.toUpperCase() + color.slice(1);
}

/** "5", "Skip", "Wild Draw Four": a card's value without its color. */
export function valueName(value: CardFace['value']): string {
  return VALUE_NAMES[String(value)] ?? String(value);
}

/** "Red 5", "Blue Skip", "Wild Draw Four" (and with the rules, Giant UNO's blank wilds: "Wild: Shuffle hands"). */
export function describeCard(card: CardFace, rules?: Pick<RuleSet, 'customWilds'>): string {
  const custom = rules && customWildFor(rules, card.value);
  if (custom) return `Wild: ${customWildTitle(custom)}`;
  if (card.value === 'custom1' || card.value === 'custom2') return 'Blank Wild';
  const value = VALUE_NAMES[String(card.value)] ?? String(card.value);
  return card.color === 'wild' ? value : `${colorName(card.color)} ${value}`;
}

/** A short log line for an event, or null for events not worth showing. */
export function describeEvent(event: GameEvent, players: PlayerInfo[], you: number, rules?: Pick<RuleSet, 'customWilds'>): string | null {
  const name = (seat: number) => (seat === you ? 'You' : players[seat]?.name ?? '?');
  switch (event.type) {
    case 'played': {
      const card = event.cards[0]!;
      const suffix = card.color === 'wild' && event.color ? ` (${colorName(event.color)})` : '';
      return `${name(event.seat)} played ${event.cards.map((c) => describeCard(c, rules)).join(', ')}${suffix}`;
    }
    case 'drew':
      return `${name(event.seat)} drew ${event.count} card${event.count === 1 ? '' : 's'}`;
    case 'passed':
      return `${name(event.seat)} kept the card`;
    case 'skipped':
      return `${name(event.seat)} ${event.seat === you ? 'were' : 'was'} skipped`;
    case 'reversed':
      return 'Direction reversed';
    case 'reshuffled':
      return 'Discard pile reshuffled';
    case 'calledUno':
      return `${name(event.seat)} called UNO!`;
    case 'caughtUno':
      return `${name(event.by)} caught ${name(event.target)} without UNO! +2`;
    case 'jumpedIn':
      return `${name(event.seat)} jumped in!`;
    case 'drawStacked':
      return `${name(event.next)} must take ${event.total} cards`;
    case 'swapped':
      return `${name(event.seat)} swapped hands with ${event.with === you ? 'you' : name(event.with)}`;
    case 'rotated':
      return 'Everyone passed their hand along';
    case 'challenged':
      return event.success
        ? `${name(event.by)} challenged the +4: ${name(event.target)} was bluffing and takes the cards!`
        : `${name(event.by)} challenged the +4, but it was legal: +2 extra`;
    case 'flipped':
      return `${name(event.seat)} flipped everything to the ${event.side} side!`;
    case 'colorChosen':
      return `${name(event.seat)} chose ${colorName(event.color)}`;
    case 'skippedEveryone':
      return `${name(event.seat)} skipped everyone and goes again`;
    case 'shuffledHands':
      return "Everyone's hands were shuffled together and dealt back out";
    case 'targeted':
      return `${name(event.seat)} made ${event.target === you ? 'you' : name(event.target)} draw ${event.count}`;
    case 'everyoneDrew':
      return `Everyone except ${name(event.seat)} draws ${event.count}`;
    case 'playAgain':
      return `${name(event.seat)} played a 10 and ${event.seat === you ? 'go' : 'goes'} again`;
    case 'discardedAll':
      return `${name(event.seat)} discarded ${event.count} more ${event.color} card${event.count === 1 ? '' : 's'}`;
    case 'roulette':
      return `${name(event.seat)} spun the Color Roulette (${colorName(event.color)}) and drew ${event.count}`;
    case 'eliminated':
      return `${name(event.seat)} hit the Mercy limit and ${event.seat === you ? 'are' : 'is'} OUT!`;
    case 'roundOver':
      return `${name(event.winner)} won the round (+${event.points} points)`;
    case 'gameOver':
      return `${name(event.winner)} won the game!`;
  }
}
