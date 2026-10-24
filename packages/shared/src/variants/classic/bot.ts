import { ALL_COLORS, colorsForSide, type Action, type Card, type CardFace, type Color, type GameState } from '../../types.js';
import { deckFor } from '../decks.js';
import type { BotDifficulty } from '../Variant.js';
import { canChallenge } from './engine.js';
import { lookaheadSupported, rateCandidates, searchFor, type Candidate } from './lookahead.js';
import { drawAmount, isWildDraw, jumpInCards, playableCards, seatAfter } from './rules.js';

/**
 * Bots at four levels, modelled on how real people play UNO:
 *
 * - Easy: a casual player. Plays whatever matches first, wastes wilds, picks colors at
 *   random, sometimes draws without noticing a playable card, and often forgets UNO.
 * - Normal: a typical family player. Saves wilds, names the color they hold most of,
 *   attacks a player who's about to win, usually remembers UNO.
 * - Hard: an experienced player. Plans the next turn (keeps cards that follow on), saves
 *   Skips and Draws for when they matter, keeps a wild to finish on, switches to colors the
 *   next player was seen drawing on, defends points, and challenges only when it pays.
 * - Expert: a card counter who thinks ahead. Everything Hard does, plus it tracks every card
 *   played, remembers the colors opponents named with wilds (they hold those), and before
 *   each choice imagines how the game could play out from there (see lookahead.ts). In UNO
 *   Flip it reads everyone's visible card backs before deciding to flip.
 *
 * Bots only use what a player at the table could know: their own hand, cards played so far,
 * hand sizes, who drew on which color, what colors were named with wilds, and (in Flip) the
 * backs of other players' cards.
 */

export const BOT_LEVELS: BotDifficulty[] = ['easy', 'normal', 'hard', 'expert'];

interface Profile {
  /** Chance of remembering to call UNO. */
  callUno: number;
  /** Chance of noticing a player who forgot to call UNO. */
  catchUno: number;
  /** Chance of noticing a jump-in chance. */
  jumpIn: number;
  /** How fast they react to catches and jump-ins (1 = normal, lower = quicker). */
  reaction: number;
  /** Chance of drawing despite holding a playable card. */
  absentMinded: number;
  /** Chance of keeping a playable card they just drew. */
  keepsDrawn: number;
  /** Chance of taking stacked cards instead of stacking back. */
  missesStack: number;
}

const PROFILES: Record<BotDifficulty, Profile> = {
  easy: { callUno: 0.65, catchUno: 0.15, jumpIn: 0.15, reaction: 1.4, absentMinded: 0.08, keepsDrawn: 0.2, missesStack: 0.3 },
  normal: { callUno: 0.9, catchUno: 0.5, jumpIn: 0.4, reaction: 1, absentMinded: 0.03, keepsDrawn: 0.05, missesStack: 0.1 },
  hard: { callUno: 1, catchUno: 0.8, jumpIn: 0.65, reaction: 0.8, absentMinded: 0, keepsDrawn: 0, missesStack: 0 },
  expert: { callUno: 1, catchUno: 0.95, jumpIn: 0.85, reaction: 0.6, absentMinded: 0, keepsDrawn: 0, missesStack: 0 },
};

const byLevel = <T>(pick: (p: Profile) => T) =>
  Object.fromEntries(BOT_LEVELS.map((l) => [l, pick(PROFILES[l])])) as Record<BotDifficulty, T>;

/** Chance a bot catches a player who forgot to call UNO. */
export const BOT_CATCH_CHANCE = byLevel((p) => p.catchUno);
/** Chance a bot notices it can jump in. */
export const BOT_JUMP_IN_CHANCE = byLevel((p) => p.jumpIn);
/** Multiplier for how long a bot takes to react to catches and jump-ins. */
export const BOT_REACTION = byLevel((p) => p.reaction);

/**
 * Actions the bot in `seat` takes on its turn, in order
 * (e.g. call UNO, then play). `random` returns numbers in [0, 1).
 */
export function chooseBotMove(
  state: GameState,
  seat: number,
  difficulty: BotDifficulty,
  random: () => number,
): Action[] {
  const profile = PROFILES[difficulty];
  const k = know(state, seat);

  if (state.phase === 'chooseColor') return [{ type: 'chooseColor', color: chooseColor(k, k.hand, difficulty, random) }];
  if (state.phase === 'roulette') return [{ type: 'chooseColor', color: rouletteColor(k, difficulty, random) }];

  const playable = playableCards(state, seat);
  const takeOrDraw: Action = state.phase === 'playDrawn' ? { type: 'pass' } : { type: 'draw' };

  if (playable.length === 0) {
    if (state.pendingDraw > 0 && canChallenge(state) && shouldChallenge(state, k, difficulty, random)) {
      return [{ type: 'challenge' }];
    }
    return [takeOrDraw];
  }

  // Human slips: not noticing a playable card, keeping a drawn one, or forgetting to stack back
  // (nobody forgets to stack when taking the cards would knock them out).
  const wouldBeKnockedOut = k.mercyLimit !== null && k.hand.length + state.pendingDraw >= k.mercyLimit;
  if (state.phase === 'playing' && state.pendingDraw === 0 && random() < profile.absentMinded) return [{ type: 'draw' }];
  if (state.phase === 'playDrawn' && random() < profile.keepsDrawn) return [{ type: 'pass' }];
  if (state.pendingDraw > 0 && !wouldBeKnockedOut && random() < profile.missesStack) return [{ type: 'draw' }];

  let cards: Card[];
  if (difficulty === 'easy') {
    cards = [pickRandom(playable, random)];
  } else if (difficulty === 'normal') {
    cards = withSameNumbers(state, k.hand, pickNormal(state, k, playable));
  } else {
    const best = pickStrong(state, k, playable, difficulty, random);
    // A strong player keeps a freshly drawn wild for later instead of spending it now.
    if (!best) return [takeOrDraw];
    cards = best;
  }
  const action = playAction(state, k, cards, difficulty, random);
  return withUnoCall(state, seat, handAfterPlay(k.hand, cards, action), profile, random, action);
}

/** Cards left after a play, counting the extra cards a Discard All throws away. */
function handAfterPlay(hand: Card[], cards: Card[], action: Action): number {
  const last = cards[cards.length - 1]!;
  const rest = hand.filter((c) => !cards.includes(c));
  const discards = last.value === 'discardAll' ? last.color : action.type === 'play' ? action.discardColor : undefined;
  return discards ? rest.filter((c) => c.color !== discards).length : rest.length;
}

/** A bot's out-of-turn jump-in, if it has an identical card. */
export function chooseBotJumpIn(state: GameState, seat: number, difficulty: BotDifficulty, random: () => number): Action[] | null {
  const card = jumpInCards(state, seat)[0];
  if (!card) return null;
  const k = know(state, seat);
  const cards = difficulty === 'easy' ? [card] : withSameNumbers(state, k.hand, card);
  const action = playAction(state, k, cards, difficulty, random);
  return withUnoCall(state, seat, handAfterPlay(k.hand, cards, action), PROFILES[difficulty], random, action);
}

// ---------------------------------------------------------------------------
// What a player at the table knows

interface Knowledge {
  seat: number;
  hand: Card[];
  sizes: number[];
  next: number;
  prev: number;
  voids: Color[][];
  named: (Color | null)[];
  colors: readonly Color[];
  /** Cards of each face not yet seen (not played, not in our hand), keyed `color:value`. */
  unseen: Map<string, number>;
  unseenTotal: number;
  /** The same unseen cards as a list of faces, for imagining other players' hands. */
  unseenFaces: CardFace[];
  /** UNO Flip: the backs of other players' cards (null for ourselves and in classic games). */
  backs: (CardFace[] | null)[];
  pointsMode: boolean;
  points: (card: CardFace) => number;
  /** No Mercy: a hand this big is knocked out. */
  mercyLimit: number | null;
}

const faceKey = (card: CardFace) => `${card.color}:${String(card.value)}`;

function know(state: GameState, seat: number): Knowledge {
  const hand = state.players[seat]!.hand;
  // Which faces exist is public (it's the deck list), so count every card's face in play...
  const unseen = new Map<string, number>();
  const all = [...state.drawPile, ...state.discardPile, ...state.players.flatMap((p) => p.hand)];
  for (const card of all) unseen.set(faceKey(card), (unseen.get(faceKey(card)) ?? 0) + 1);
  // ...then take away the ones we've actually seen: played cards and our own hand.
  for (const card of [...state.discardPile, ...hand]) unseen.set(faceKey(card), (unseen.get(faceKey(card)) ?? 1) - 1);
  const remaining = new Map(unseen);
  const unseenFaces: CardFace[] = [];
  for (const card of all) {
    const key = faceKey(card);
    if ((remaining.get(key) ?? 0) > 0) {
      remaining.set(key, remaining.get(key)! - 1);
      unseenFaces.push({ color: card.color, value: card.value } as CardFace);
    }
  }
  return {
    seat,
    hand,
    sizes: state.players.map((p) => p.hand.length),
    next: seatAfter(state, seat),
    prev: seatAfter(state, seat, -1),
    voids: state.voids,
    named: state.named,
    colors: colorsForSide(state.side),
    unseen,
    unseenTotal: all.length - state.discardPile.length - hand.length,
    unseenFaces,
    backs: state.players.map((p, i) => (state.side && i !== seat ? p.hand.map((c) => c.other!) : null)),
    pointsMode: state.rules.winCondition === 'points500',
    points: deckFor(state.variantId).points,
    mercyLimit: deckFor(state.variantId).mercyLimit,
  };
}

/** How likely `seat` is to hold at least one card matching color/value (from cards not yet seen). */
function chanceToAnswer(k: Knowledge, seat: number, color: Color, value: CardFace['value'] | null): number {
  if (k.unseenTotal <= 0) return 0.5;
  const voidColor = k.voids[seat]!.includes(color);
  let matching = 0;
  for (const [key, count] of k.unseen) {
    const [c, v] = key.split(':');
    if (c === 'wild' || (!voidColor && c === color) || (value !== null && v === String(value))) matching += count;
  }
  const miss = Math.max(0, 1 - matching / k.unseenTotal);
  return 1 - miss ** k.sizes[seat]!;
}

// ---------------------------------------------------------------------------
// Choosing a card

/** Normal: the classic sensible-player rules of thumb. */
function pickNormal(state: GameState, k: Knowledge, playable: Card[]): Card {
  const nextSize = k.sizes[k.next]!;
  const counts = countColors(k.hand);
  const fewestOther = minOther(k);
  const score = (card: Card): number => {
    const attack = drawAmount(card) > 0 || ['skip', 'skipAll', 'reverse', 'wildColor', 'roulette'].includes(String(card.value));
    let s = 0;
    if (card.color === 'wild') s -= 100; // hold wilds for when nothing else works...
    if (card.value === 'discardAll') s += k.hand.filter((c) => c !== card && c.color === card.color).length * 12;
    if (card.value === 'wildDiscardAll') s += mostHeld(k.hand.filter((c) => c !== card), k.colors).count * 12;
    if (nextSize <= 2 && attack) s += 200; // ...unless the next player is about to win
    if (state.pendingDraw > 0) s += 50 - drawAmount(card) * 8;
    if (card.value === 'skipAll' || card.value === 10) s += 25; // another turn
    if (state.rules.sevenZero && card.value === 7) s += fewestOther < k.hand.length - 2 ? 150 : -30;
    if (typeof card.value === 'number') s += card.value;
    else if (card.color !== 'wild') s += 15;
    if (card.color !== 'wild') s += counts[card.color] * 2;
    if (state.rules.stackSameNumber && typeof card.value === 'number') {
      s += (k.hand.filter((c) => c.value === card.value).length - 1) * 12;
    }
    return s;
  };
  return playable.reduce((best, card) => (score(card) > score(best) ? card : best));
}

/**
 * Hard and Expert: score each possible play by what it does to our hand and to the next
 * player. Returns null when the best move is to keep a card we just drew (or take a stack).
 */
function pickStrong(state: GameState, k: Knowledge, playable: Card[], level: BotDifficulty, random: () => number): Card[] | null {
  const expert = level === 'expert';
  const moves = playable.map((card) => withSameNumbers(state, k.hand, card));
  // Expert: think a few turns ahead when there's a real choice to make (keeping a drawn card,
  // or taking the stacked cards instead of passing them on, count as choices too).
  const canHoldBack = state.phase === 'playDrawn' || state.pendingDraw > 0;
  if (expert && lookaheadSupported(state) && moves.length + (canHoldBack ? 1 : 0) >= 2) {
    return lookAhead(state, k, moves, random);
  }
  let best: Card[] = moves[0]!;
  let bestScore = -Infinity;
  for (const move of moves) {
    const s = scoreMove(state, k, move, level) + (random() - 0.5) * (expert ? 2 : 6);
    if (s > bestScore) {
      bestScore = s;
      best = move;
    }
  }
  // Just drew a wild with plenty of cards left and no one about to win? Keep it as a finisher.
  if (state.phase === 'playDrawn' && best[0]!.color === 'wild' && k.hand.length > 3 && minOther(k) > 2) return null;
  return best;
}

/** Expert: imagine the game playing out after each move and keep the one that wins most often. */
function lookAhead(state: GameState, k: Knowledge, moves: Card[][], random: () => number): Card[] | null {
  const candidates: Candidate[] = moves.map((cards) => {
    const last = cards[cards.length - 1]!;
    const rest = k.hand.filter((c) => !cards.includes(c));
    if (last.value === 'wildDiscardAll') return { cards, color: wildDiscardChoice(k, rest, 'expert', random).color };
    return last.color === 'wild' ? { cards, color: chooseColor(k, rest, 'expert', random) } : { cards };
  });
  if (state.phase === 'playDrawn' || state.pendingDraw > 0) candidates.push({ cards: [] });
  const rates = rateCandidates(state, k.seat, candidates, k.unseenFaces, k.colors, random, searchFor(state));
  // Close calls go to the rules of thumb.
  const scores = candidates.map((c, i) => rates[i]! * 100 + (c.cards.length ? scoreMove(state, k, c.cards, 'expert') / 40 : 0));
  const best = candidates[scores.indexOf(Math.max(...scores))]!;
  return best.cards.length ? best.cards : null;
}

function scoreMove(state: GameState, k: Knowledge, move: Card[], level: BotDifficulty): number {
  const expert = level === 'expert';
  const last = move[move.length - 1]!;
  const dumped = last.value === 'wildDiscardAll' ? wildDiscardChoice(k, k.hand.filter((c) => !move.includes(c)), level, () => 0.5) : null;
  // What's left in our hand after this play (a Wild Discard All takes a whole color with it).
  const rest = k.hand.filter((c) => !move.includes(c) && c.color !== dumped?.discardColor);
  const color = dumped ? dumped.color : last.color === 'wild' ? chooseColor(k, rest, level, () => 0.5) : last.color;
  const nextSize = k.sizes[k.next]!;
  const value = last.value;
  const multiPlayer = k.sizes.filter((size) => size > 0).length > 2;
  let s = 0;

  // Getting rid of cards is the point of the game (a Discard All takes its whole color along).
  s += 10 * move.length;
  if (value === 'discardAll') s += 10 * k.hand.filter((c) => !move.includes(c) && c.color === last.color).length;
  if (dumped) s += 10 * (k.hand.length - move.length - rest.length);

  // Plan ahead: keep cards that can follow this one if the color sticks.
  const followers = rest.filter((c) => c.color === 'wild' || c.color === color || c.value === value).length;
  s += Math.min(followers, 4) * 5;
  if (rest.length > 0 && followers === 0) s -= 12;

  // Wilds win games at the end: don't spend them early. Keep one as the last card.
  if (last.color === 'wild') s -= rest.length <= 1 ? 0 : isWildDraw(last) || value === 'wildColor' ? 45 : 35;
  if (rest.length === 1 && rest[0]!.color === 'wild') s += 30;

  // Stopping cards are worth most against someone close to going out; otherwise save them.
  // Head to head, though, stopping the only opponent is a free extra turn: chain them.
  const stops = drawAmount(last) > 0 || value === 'skip' || value === 'wildColor' || value === 'roulette' || (value === 'reverse' && !multiPlayer);
  if (stops && !multiPlayer) s += 14 + (followers > 0 ? 10 : 0) + (nextSize <= 2 ? 40 : 0);
  else if (stops) s += nextSize <= 2 ? 60 + drawAmount(last) * 4 : nextSize <= 4 ? 8 : -4;
  if (value === 'reverse' && multiPlayer) {
    // A Reverse hands the turn to the previous player instead.
    if (k.sizes[k.prev]! <= 2) s -= 50;
    if (nextSize <= 2) s += 40;
  }
  if (value === 'skipAll' || value === 10) s += 20; // another turn

  // Stacking: pass on the smallest draw card and keep the big ones, unless the next player is nearly out.
  if (state.pendingDraw > 0) s += nextSize <= 2 ? drawAmount(last) * 5 : 20 - drawAmount(last) * 4;

  // No Mercy: a big enough draw knocks the victim out; and never take a penalty that would knock us out.
  if (k.mercyLimit !== null) {
    const victim = (value === 'wildRev4' || value === 'wildRev8') && multiPlayer ? k.prev : k.next;
    const hit = state.pendingDraw + drawAmount(last);
    if (drawAmount(last) > 0 && k.sizes[victim]! + hit >= k.mercyLimit) s += 80;
    if (state.pendingDraw > 0 && k.hand.length + state.pendingDraw >= k.mercyLimit) s += 100;
  }

  // Switch to a color the next player was seen drawing on.
  if (k.voids[k.next]!.includes(color)) s += 14;

  // Expert: how likely is the next player to have an answer at all? (Matters once they're low.)
  if (expert && nextSize <= 4) s += 12 * (1 - chanceToAnswer(k, k.next, color, last.color === 'wild' ? null : value));
  // Expert: don't hand the next player the color they named with their last wild.
  if (expert && k.named[k.next] === color) s -= 14;

  // 7-0: swap with whoever has fewest cards, only if that's an upgrade; a 0 gives us the previous hand.
  if (state.rules.sevenZero && rest.length > 0) {
    if (value === 7) {
      const gain = rest.length - minOther(k);
      s += gain > 0 ? gain * 10 : -40;
    }
    if (value === 0) s += (rest.length - k.sizes[seatAfter(state, k.seat, -1)]!) * 6;
  }

  // UNO Flip: an Expert reads the backs it can see. The next player's backs become their hand.
  if (value === 'flip') s += expert ? flipValue(k) : 4;

  // Someone's about to go out in a points game: shed points while we can.
  if (k.pointsMode && minOther(k) <= 1) s += move.reduce((sum, c) => sum + k.points(c), 0) * 0.6;

  // With the challenge rule, a +4 while holding the current color is a bluff that can backfire.
  if (isWildDraw(last) && state.rules.challengeWild4 && rest.some((c) => c.color === state.currentColor)) {
    s -= nextSize <= 1 ? 0 : 60;
  }
  return s;
}

/** How good flipping looks, judged from the backs of the other players' cards. */
function flipValue(k: Knowledge): number {
  const strong = (face: CardFace) => face.color === 'wild' || drawAmount(face) >= 2 || face.value === 'skipAll';
  const nextBacks = k.backs[k.next] ?? [];
  const nextStrong = nextBacks.filter(strong).length;
  const othersStrong = k.backs.reduce((sum, b, i) => sum + (i === k.next || !b ? 0 : b.filter(strong).length), 0);
  return 14 - nextStrong * 8 - othersStrong * 2 - (nextBacks.length <= 2 ? 30 : 0);
}

/** Smallest hand among the other players still in the round. */
function minOther(k: Knowledge): number {
  return Math.min(...k.sizes.filter((size, i) => i !== k.seat && size > 0));
}

// ---------------------------------------------------------------------------
// Colors, challenges, and building the action

function chooseColor(k: Knowledge, hand: Card[], level: BotDifficulty, random: () => number): Color {
  if (level === 'easy') return pickRandom([...k.colors], random);
  const counts = countColors(hand);
  const score = (c: Color): number => {
    let s = counts[c] * 3;
    if (level === 'normal') return s;
    if (k.voids[k.next]!.includes(c)) s += 5;
    if (level === 'expert' && k.named[k.next] === c) s -= 6;
    return s;
  };
  const best = Math.max(...k.colors.map(score));
  if (best === 0) return pickRandom([...k.colors], random);
  return k.colors.find((c) => score(c) === best)!;
}

/** The color we hold most of (first in color order on a tie). */
function mostHeld(hand: Card[], colors: readonly Color[]): { color: Color; count: number } {
  const counts = countColors(hand);
  const color = colors.reduce((best, c) => (counts[c] > counts[best] ? c : best));
  return { color, count: counts[color] };
}

/** Wild Discard All: throw away the color we hold most of, then pick the next color from what's left. */
function wildDiscardChoice(k: Knowledge, rest: Card[], level: BotDifficulty, random: () => number): { discardColor: Color; color: Color } {
  const discardColor = level === 'easy' ? pickRandom([...k.colors], random) : mostHeld(rest, k.colors).color;
  const left = rest.filter((c) => c.color !== discardColor);
  return { discardColor, color: chooseColor(k, left, level, random) };
}

/**
 * Color Roulette, picked by its victim: the color with the most cards still out there
 * should turn up soonest. (Casual players just pick one; Normal goes by their own hand.)
 */
function rouletteColor(k: Knowledge, level: BotDifficulty, random: () => number): Color {
  if (level === 'easy') return pickRandom([...k.colors], random);
  if (level === 'normal') return chooseColor(k, k.hand, 'normal', random);
  const unseenOf = (c: Color) => {
    let n = 0;
    for (const [key, count] of k.unseen) if (key.startsWith(`${c}:`)) n += count;
    return n;
  };
  return k.colors.reduce((best, c) => (unseenOf(c) > unseenOf(best) ? c : best));
}

/**
 * Challenging a wild draw: a wrong challenge costs 2 extra cards, a right one saves us the
 * whole penalty, so it pays when the chance of a bluff is above about a third.
 */
function shouldChallenge(state: GameState, k: Knowledge, level: BotDifficulty, random: () => number): boolean {
  const check = state.wild4Check;
  if (level === 'easy' || !check) return false;
  if (level === 'normal') return k.sizes[check.seat]! >= 4 && random() < 0.4;
  let chanceTheyHadIt: number;
  if (k.voids[check.seat]!.includes(check.colorBefore)) {
    chanceTheyHadIt = 0.1; // they drew on that color earlier
  } else {
    let ofColor = 0;
    for (const [key, count] of k.unseen) if (key.startsWith(`${check.colorBefore}:`)) ofColor += count;
    const share = k.unseenTotal > 0 ? ofColor / k.unseenTotal : 0;
    chanceTheyHadIt = 1 - (1 - share) ** k.sizes[check.seat]!;
  }
  return chanceTheyHadIt > (level === 'expert' ? 1 / 3 : 0.45);
}

function withUnoCall(state: GameState, seat: number, handAfter: number, profile: Profile, random: () => number, play: Action): Action[] {
  const remembers = random() < profile.callUno;
  return handAfter === 1 && !state.players[seat]!.calledUno && remembers ? [{ type: 'callUno' }, play] : [play];
}

function playAction(state: GameState, k: Knowledge, cards: Card[], level: BotDifficulty, random: () => number): Action {
  const last = cards[cards.length - 1]!;
  const action: Action = { type: 'play', cardIds: cards.map((c) => c.id) };
  if (last.value === 'wildDiscardAll') {
    Object.assign(action, wildDiscardChoice(k, k.hand.filter((c) => !cards.includes(c)), level, random));
  } else if (last.color === 'wild') {
    action.color = chooseColor(k, k.hand.filter((c) => !cards.includes(c)), level, random);
  }
  if (state.rules.sevenZero && last.value === 7 && k.hand.length > cards.length) {
    const others = k.sizes.map((_, i) => i).filter((i) => i !== k.seat && !state.out[i]);
    action.swapWith = level === 'easy' ? pickRandom(others, random) : others.reduce((a, b) => (k.sizes[b]! < k.sizes[a]! ? b : a));
  }
  return action;
}

/**
 * With same-number stacking, also plays every other card of that number,
 * ending on the color we hold most of.
 */
function withSameNumbers(state: GameState, hand: Card[], first: Card): Card[] {
  if (!state.rules.stackSameNumber || typeof first.value !== 'number') return [first];
  const extras = hand.filter((c) => c !== first && c.value === first.value);
  if (extras.length === 0) return [first];
  const counts = countColors(hand.filter((c) => c.value !== first.value));
  extras.sort((a, b) => colorCount(counts, a) - colorCount(counts, b));
  return [first, ...extras];
}

function colorCount(counts: Record<Color, number>, card: Card): number {
  return card.color === 'wild' ? 0 : counts[card.color];
}

function pickRandom<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function countColors(hand: Card[]): Record<Color, number> {
  const counts = Object.fromEntries(ALL_COLORS.map((c) => [c, 0])) as Record<Color, number>;
  for (const card of hand) if (card.color !== 'wild') counts[card.color]++;
  return counts;
}
