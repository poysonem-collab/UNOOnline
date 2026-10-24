import type { GameEvent } from '@uno/shared';
import type { SoundName } from './sound';

/** A batch of events from one move, numbered so the table can react to each batch once. */
export interface EventBatch {
  seq: number;
  events: GameEvent[];
  /** When it arrived (Date.now()), so a table that mounts later can tell fresh news from old. */
  at: number;
}

export function soundsFor(events: GameEvent[], you: number): SoundName[] {
  const sounds: SoundName[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'played':
        sounds.push('play');
        break;
      case 'drew':
        sounds.push(e.count >= 2 ? 'penalty' : 'draw');
        break;
      case 'skipped':
        sounds.push('skip');
        break;
      case 'reversed':
        sounds.push('reverse');
        break;
      case 'calledUno':
        sounds.push('uno');
        break;
      case 'caughtUno':
        sounds.push('catch');
        break;
      case 'jumpedIn':
        sounds.push('jump');
        break;
      case 'swapped':
      case 'rotated':
      case 'flipped':
        sounds.push('swap');
        break;
      case 'skippedEveryone':
        sounds.push('skip');
        break;
      case 'challenged':
        sounds.push(e.success ? 'catch' : 'penalty');
        break;
      case 'roundOver':
        sounds.push(e.winner === you ? 'win' : 'lose');
        break;
      default:
        break;
    }
  }
  // Keep the most telling sounds: drop repeats of the same one in a row.
  return sounds.filter((s, i) => s !== sounds[i - 1]);
}

export interface Burst {
  text: string;
  kind: 'action' | 'penalty' | 'uno' | 'good' | 'flip';
}

/** The big word that flashes in the middle of the table, if this batch deserves one. */
export function burstFor(events: GameEvent[], you: number, names: string[]): Burst | null {
  const name = (seat: number) => (seat === you ? 'You' : names[seat] ?? '?');
  // Later events in a batch are usually the consequence, so check the most dramatic first.
  for (const e of events) {
    if (e.type === 'flipped') return { text: e.side === 'dark' ? 'FLIP! Dark side' : 'FLIP! Light side', kind: 'flip' };
    if (e.type === 'skippedEveryone') return { text: 'Skip everyone!', kind: 'action' };
    if (e.type === 'challenged') return { text: e.success ? 'Bluff caught!' : 'Challenge failed!', kind: 'penalty' };
    if (e.type === 'caughtUno') return { text: `${name(e.target)} caught!`, kind: 'penalty' };
    if (e.type === 'jumpedIn') return { text: 'Jump-in!', kind: 'good' };
    if (e.type === 'swapped') return { text: 'Swap!', kind: 'action' };
    if (e.type === 'rotated') return { text: 'Pass hands!', kind: 'action' };
  }
  for (const e of events) {
    if (e.type === 'drawStacked') return { text: `+${e.total}`, kind: 'penalty' };
    if (e.type === 'played') {
      const card = e.cards[e.cards.length - 1]!;
      if (card.value === 'draw1') return { text: '+1', kind: 'penalty' };
      if (card.value === 'draw2' || card.value === 'wild2') return { text: '+2', kind: 'penalty' };
      if (card.value === 'wild4') return { text: '+4', kind: 'penalty' };
      if (card.value === 'draw5') return { text: '+5', kind: 'penalty' };
      if (card.value === 'wildColor') return { text: `Draw till ${e.color}!`, kind: 'penalty' };
      if (card.value === 'skip') return { text: 'Skip!', kind: 'action' };
      if (card.value === 'reverse') return { text: 'Reverse!', kind: 'action' };
      if (e.cards.length > 1) return { text: `${e.cards.length}× ${String(card.value)}!`, kind: 'good' };
    }
    if (e.type === 'calledUno') return { text: 'UNO!', kind: 'uno' };
  }
  return null;
}
