import type { Card, Color, GameEvent, PlayerInfo } from './types.js';

const VALUE_NAMES: Record<string, string> = {
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw Two',
  wild: 'Wild',
  wild4: 'Wild Draw Four',
};

export function colorName(color: Color): string {
  return color[0]!.toUpperCase() + color.slice(1);
}

/** "Red 5", "Blue Skip", "Wild Draw Four". */
export function describeCard(card: Card): string {
  const value = VALUE_NAMES[String(card.value)] ?? String(card.value);
  return card.color === 'wild' ? value : `${colorName(card.color)} ${value}`;
}

/** A short log line for an event, or null for events not worth showing. */
export function describeEvent(event: GameEvent, players: PlayerInfo[], you: number): string | null {
  const name = (seat: number) => (seat === you ? 'You' : players[seat]?.name ?? '?');
  switch (event.type) {
    case 'played': {
      const card = event.cards[0]!;
      const suffix = card.color === 'wild' ? ` (${colorName(event.color)})` : '';
      return `${name(event.seat)} played ${event.cards.map(describeCard).join(', ')}${suffix}`;
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
    case 'roundOver':
      return `${name(event.winner)} won the round (+${event.points} points)`;
    case 'gameOver':
      return `${name(event.winner)} won the game!`;
  }
}
