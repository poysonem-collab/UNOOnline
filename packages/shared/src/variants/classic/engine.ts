import { shuffle } from '../../rng.js';
import {
  colorsForSide,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Action,
  type ActionResult,
  type Card,
  type CardFace,
  type Color,
  type CustomEffect,
  type GameEvent,
  type GameState,
  type PlayerInfo,
  type PlayerView,
  type RuleSet,
} from '../../types.js';
import { deckFor } from '../decks.js';
import { customWildFor } from '../giant/customWilds.js';
import { activeSeats, canJumpIn, canPlay, contextOf, drawAmount, isPlayable, isWildDraw, seatAfter, topCard } from './rules.js';

// This engine runs classic UNO, UNO Flip and UNO Show 'Em No Mercy; the deck config
// (see ../decks.ts) holds the differences.

/** Extra cards a failed +4 challenge costs the challenger. */
const CHALLENGE_PENALTY = 2;

export function createGame(players: PlayerInfo[], rules: RuleSet, seed: number, variantId = 'classic'): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Need ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  if (players.length * rules.handSize >= rules.deckCount * deckFor(variantId).size - 10) {
    throw new Error('Not enough cards for this hand size; use more decks');
  }
  const state: GameState = {
    variantId,
    rules,
    players: players.map((p) => ({ ...p, hand: [], calledUno: false })),
    drawPile: [],
    discardPile: [],
    currentColor: 'red',
    currentPlayer: 0,
    direction: 1,
    phase: 'playing',
    drawnCardId: null,
    unoVulnerable: null,
    pendingDraw: 0,
    wild4Check: null,
    dealer: 0,
    roundWinner: null,
    gameWinner: null,
    scores: players.map(() => 0),
    round: 1,
    history: [],
    voids: players.map(() => []),
    named: players.map(() => null),
    out: players.map(() => false),
    rng: seed >>> 0,
  };
  dealRound(state, []);
  return state;
}

/** After 'roundOver', deal the next round with the dealer moving one seat on. */
export function startNextRound(prev: GameState): ActionResult {
  if (prev.phase !== 'roundOver') return fail('The round is not over');
  const state = structuredClone(prev);
  state.dealer = (state.dealer + 1) % state.players.length;
  state.round++;
  const events: GameEvent[] = [];
  dealRound(state, events);
  return { ok: true, state, events };
}

export function applyAction(prev: GameState, seat: number, action: Action): ActionResult {
  if (!prev.players[seat]) return fail('No such seat');
  if (prev.phase === 'roundOver' || prev.phase === 'gameOver') return fail('The round is over');
  if (prev.out[seat]) return fail("You're out of this round");

  const state = structuredClone(prev);
  const events: GameEvent[] = [];
  const error = dispatch(state, seat, action, events);
  return error ? fail(error) : { ok: true, state, events };
}

export function getPlayerView(state: GameState, seat: number): PlayerView {
  const twoSided = state.side !== undefined;
  const deck = deckFor(state.variantId);
  return {
    variantId: state.variantId,
    you: seat,
    // You hold your cards facing you, so you can't see their backs...
    hand: (state.players[seat]?.hand ?? []).map(({ other: _other, ...card }) => card as Card),
    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      handCount: p.hand.length,
      calledUno: p.calledUno,
      out: state.out[i]!,
      // ...but everyone else's backs face you.
      ...(twoSided && i !== seat ? { otherSides: p.hand.map((c) => c.other!) } : {}),
    })),
    topCard: topCard(state),
    side: state.side ?? null,
    drawPileOther: state.drawPile[state.drawPile.length - 1]?.other ?? null,
    currentColor: state.currentColor,
    currentPlayer: state.currentPlayer,
    direction: state.direction,
    phase: state.phase,
    drawPileCount: state.drawPile.length,
    drawnCardId: state.currentPlayer === seat ? state.drawnCardId : null,
    unoVulnerable: state.unoVulnerable,
    pendingDraw: state.pendingDraw,
    canChallenge: canChallenge(state),
    roundWinner: state.roundWinner,
    gameWinner: state.gameWinner,
    scores: state.scores,
    round: state.round,
    pointsToWin: deck.pointsToWin,
    mercyLimit: deck.mercyLimit,
    history: state.history,
    revealedHands: state.phase === 'roundOver' || state.phase === 'gameOver' ? state.players.map((p) => p.hand) : null,
    rules: state.rules,
  };
}

/** The current player can challenge the Wild +4 (or Wild Draw Two) waiting on them. */
export function canChallenge(state: GameState): boolean {
  return state.rules.challengeWild4 && state.pendingDraw > 0 && state.wild4Check !== null;
}

// ---------------------------------------------------------------------------

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Mutates `state`. Returns an error message, or null on success. */
function dispatch(state: GameState, seat: number, action: Action, events: GameEvent[]): string | null {
  switch (action.type) {
    case 'play':
      return play(state, seat, action, events);
    case 'draw':
      return draw(state, seat, events);
    case 'pass':
      return pass(state, seat, events);
    case 'callUno':
      return callUno(state, seat, events);
    case 'catchUno':
      return catchUno(state, seat, action.target, events);
    case 'challenge':
      return challenge(state, seat, events);
    case 'chooseColor':
      return chooseColor(state, seat, action.color, events);
  }
}

function play(
  state: GameState,
  seat: number,
  { cardIds, color: chosenColor, swapWith, discardColor, target }: { cardIds: string[]; color?: Color; swapWith?: number; discardColor?: Color; target?: number },
  events: GameEvent[],
): string | null {
  const { rules } = state;
  const player = state.players[seat]!;
  const jumpingIn = seat !== state.currentPlayer;
  if (jumpingIn && !rules.jumpIn) return 'It is not your turn';
  if (state.phase === 'chooseColor' || state.phase === 'roulette') return jumpingIn ? 'It is not your turn' : 'Choose a color first';

  // Every card must be in your hand, once.
  if (cardIds.length === 0) return 'Choose a card to play';
  if (new Set(cardIds).size !== cardIds.length) return 'You chose the same card twice';
  const cards: Card[] = [];
  for (const id of cardIds) {
    const card = player.hand.find((c) => c.id === id);
    if (!card) return 'You do not have that card';
    cards.push(card);
  }
  const first = cards[0]!;
  const last = cards[cards.length - 1]!;

  // Several cards at once: all the same number.
  if (cards.length > 1) {
    if (!rules.stackSameNumber) return 'Play one card at a time';
    if (typeof first.value !== 'number' || cards.some((c) => c.value !== first.value)) {
      return 'You can only play several cards if they are the same number';
    }
  }

  const ctx = contextOf(state);
  const handAfter = player.hand.length - cards.length;
  if (jumpingIn) {
    if (!canJumpIn(first, ctx, player.hand.length - cards.length + 1)) {
      return 'You can only jump in with a card identical to the top card';
    }
  } else {
    if (state.phase === 'playDrawn' && first.id !== state.drawnCardId) {
      return 'After drawing you may only play the drawn card';
    }
    if (!canPlay(first, ctx, handAfter + 1)) {
      if (state.pendingDraw > 0) return `Stack a draw card or take ${state.pendingDraw} cards`;
      if (handAfter === 0 && rules.noActionFinish) return 'Your last card has to be a number card';
      return 'That card cannot be played';
    }
  }
  if (handAfter === 0 && rules.noActionFinish && typeof last.value !== 'number') {
    return 'Your last card has to be a number card';
  }
  // Color Roulette is the exception: the next player picks its color. (UNO All Wild has no colors at all.)
  const colorless = deckFor(state.variantId).colorless === true;
  const namesColor = !colorless && last.color === 'wild' && last.value !== 'roulette';
  if (namesColor && !chosenColor) return 'Choose a color for the wild card';
  if (namesColor && !colorsForSide(state.side).includes(chosenColor!)) return 'Choose one of the colors in play';
  // Giant UNO's blank wilds do whatever the host wrote on them.
  const custom = customWildFor(rules, last.value)?.effect;
  const discardsColor = last.value === 'wildDiscardAll' || custom === 'discardColor';
  if (discardsColor && (!discardColor || !colorsForSide(state.side).includes(discardColor))) return 'Choose a color to discard';

  const isOpponent = (other: number | undefined) => other !== undefined && other !== seat && !!state.players[other] && !state.out[other];
  const swaps = ((rules.sevenZero && last.value === 7) || custom === 'swapHands' || last.value === 'wildSwap') && handAfter > 0;
  if (swaps && !isOpponent(swapWith)) return 'Choose a player to swap hands with';
  if (last.value === 'wildTarget2' && !isOpponent(target)) return 'Choose who draws 2';

  // A +4 is only allowed with no card of the current color (checked if it can be challenged).
  const wild4Illegal = isWildDraw(last) && player.hand.some((c) => !cards.includes(c) && c.color === state.currentColor);

  // The play is legal: carry it out.
  const colorBefore = state.currentColor;
  state.unoVulnerable = null;
  player.hand = player.hand.filter((c) => !cards.includes(c));
  state.discardPile.push(...cards);
  for (const c of cards) if (c.color !== 'wild') state.voids[seat] = state.voids[seat]!.filter((v) => v !== c.color);
  // Naming a color with a wild tells everyone you probably hold it.
  if (namesColor) state.named[seat] = chosenColor!;
  if (last.color !== 'wild') state.currentColor = last.color;
  else if (namesColor) state.currentColor = chosenColor!;
  state.phase = 'playing';
  state.drawnCardId = null;
  if (jumpingIn) {
    state.currentPlayer = seat;
    events.push({ type: 'jumpedIn', seat });
  }
  events.push({ type: 'played', seat, cards, color: colorless ? null : state.currentColor });

  const handsMoved = applyEffect(state, seat, last, { swapWith, wild4Illegal, colorBefore, discardColor, target }, events);
  // An UNO call only counts for the play that brings you down to one card (a Discard All may do that too).
  if (player.hand.length > 1) player.calledUno = false;
  if (!handsMoved && player.hand.length === 1 && !player.calledUno) state.unoVulnerable = seat;
  if (player.hand.length === 0) endRound(state, seat, events);
  return null;
}

/**
 * Applies the played card's effect and moves the turn on.
 * Returns true if hands changed owners (7-0), which resets UNO calls.
 */
function applyEffect(
  state: GameState,
  seat: number,
  card: Card,
  extra: { swapWith?: number; wild4Illegal: boolean; colorBefore: Color; discardColor?: Color; target?: number },
  events: GameEvent[],
): boolean {
  const { rules } = state;
  const next = seatAfter(state, seat);
  const player = state.players[seat]!;

  switch (card.value) {
    case 'skip':
    case 'wildSkip':
      events.push({ type: 'skipped', seat: next });
      state.currentPlayer = seatAfter(state, seat, 2);
      return false;

    case 'skipAll':
      // Everyone else is skipped: the same player goes again.
      events.push({ type: 'skippedEveryone', seat });
      state.currentPlayer = seat;
      return false;

    case 'reverse':
    case 'wildReverse':
      state.direction = state.direction === 1 ? -1 : 1;
      events.push({ type: 'reversed', direction: state.direction });
      if (activeSeats(state).length === 2) {
        // With two players a reverse acts as a skip: the same player goes again.
        events.push({ type: 'skipped', seat: next });
        state.currentPlayer = seat;
      } else {
        state.currentPlayer = seatAfter(state, seat);
      }
      return false;

    case 'wildRev4':
    case 'wildRev8':
      // No Mercy: reverse first, then the new next player takes 4 (or 8).
      state.direction = state.direction === 1 ? -1 : 1;
      events.push({ type: 'reversed', direction: state.direction });
      drawEffect(state, seat, card, extra, events);
      return false;

    case 'draw1':
    case 'draw2':
    case 'draw4':
    case 'draw5':
    case 'wild2':
    case 'wild4':
    case 'wild6':
    case 'wild10':
      drawEffect(state, seat, card, extra, events);
      return false;

    case 'wildColor': {
      // The next player draws until they get the chosen color, and loses their turn.
      const color = state.currentColor;
      const land = seatAfter(state, seat, 2);
      drawUntil(state, next, (c) => c.color === color, events);
      events.push({ type: 'skipped', seat: next });
      state.currentPlayer = land;
      return false;
    }

    case 'roulette':
      // No Mercy: the next player picks a color, then draws until they reveal it.
      state.phase = 'roulette';
      state.currentPlayer = next;
      return false;

    case 'wildSkip2':
      skipTwo(state, seat, events);
      return false;

    case 'wildTarget2':
      // All Wild: the player you pick draws 2, but keeps their turn.
      events.push({ type: 'targeted', seat, target: extra.target!, count: 2 });
      drawCards(state, extra.target!, 2, events);
      state.currentPlayer = next;
      return false;

    case 'wildSwap':
      state.currentPlayer = next;
      if (player.hand.length === 0 || extra.swapWith === undefined) return false;
      swapHands(state, seat, extra.swapWith);
      events.push({ type: 'swapped', seat, with: extra.swapWith });
      return true;

    case 'custom1':
    case 'custom2':
      return customEffect(state, seat, customWildFor(rules, card.value)!.effect, extra, events);

    case 10:
      // No Mercy Expansion: a 10 is a number card that lets you play again.
      events.push({ type: 'playAgain', seat });
      state.currentPlayer = seat;
      return false;

    case 'discardAll':
    case 'wildDiscardAll':
      // No Mercy: every other card of this color goes too.
      // The Expansion's Wild Discard All names the color to throw away (and then the color in play).
      discardColor(state, seat, card.value === 'wildDiscardAll' ? extra.discardColor! : (card.color as Color), events);
      state.currentPlayer = next;
      return false;

    case 'flip':
      flipEverything(state, seat, events);
      // If the flip turned up a wild, the flipper picks its color before play moves on.
      state.currentPlayer = state.phase === 'chooseColor' ? seat : next;
      return false;

    case 7:
      state.currentPlayer = next;
      if (!rules.sevenZero || player.hand.length === 0 || extra.swapWith === undefined) return false;
      swapHands(state, seat, extra.swapWith);
      events.push({ type: 'swapped', seat, with: extra.swapWith });
      return true;

    case 0:
      state.currentPlayer = next;
      if (!rules.sevenZero || player.hand.length === 0) return false;
      rotateHands(state);
      events.push({ type: 'rotated', direction: state.direction });
      return true;

    default:
      state.currentPlayer = next;
      return false;
  }
}

/** Throws away every card of `color` from a hand, under the card just played (which stays on top). */
function discardColor(state: GameState, seat: number, color: Color, events: GameEvent[]): void {
  const player = state.players[seat]!;
  const same = player.hand.filter((c) => c.color === color);
  if (same.length === 0) return;
  player.hand = player.hand.filter((c) => c.color !== color);
  state.discardPile.splice(state.discardPile.length - 1, 0, ...same);
  events.push({ type: 'discardedAll', seat, color, count: same.length });
}

/** Giant UNO: a blank wild card does what the host wrote on it. Returns true if hands changed owners. */
function customEffect(
  state: GameState,
  seat: number,
  effect: CustomEffect,
  extra: { swapWith?: number; discardColor?: Color },
  events: GameEvent[],
): boolean {
  const next = seatAfter(state, seat);
  const others = activeSeats(state).filter((i) => i !== seat);
  // Going out on it ends the round straight away: there's nothing left to swap or shuffle.
  const out = state.players[seat]!.hand.length === 0;
  state.currentPlayer = next;
  switch (effect) {
    case 'everyoneDraws2':
      events.push({ type: 'everyoneDrew', seat, count: 2 });
      for (const other of others) drawCards(state, other, 2, events);
      return false;
    case 'shuffleHands':
      if (out) return false;
      shuffleHands(state, seat, events);
      return true;
    case 'swapHands':
      if (out || extra.swapWith === undefined) return false;
      swapHands(state, seat, extra.swapWith);
      events.push({ type: 'swapped', seat, with: extra.swapWith });
      return true;
    case 'skipTwo':
      skipTwo(state, seat, events);
      return false;
    case 'playAgain':
      events.push({ type: 'playAgain', seat });
      state.currentPlayer = seat;
      return false;
    case 'discardColor':
      discardColor(state, seat, extra.discardColor!, events);
      return false;
    case 'wild':
      return false;
  }
}

/** The next two players miss their turn. With three players or fewer, that's everyone else: you go again. */
function skipTwo(state: GameState, seat: number, events: GameEvent[]): void {
  const others = activeSeats(state).filter((i) => i !== seat);
  const skipped = others.length <= 2 ? others : [seatAfter(state, seat), seatAfter(state, seat, 2)];
  for (const s of skipped) events.push({ type: 'skipped', seat: s });
  state.currentPlayer = others.length <= 2 ? seat : seatAfter(state, seat, 3);
}

/** Everyone's cards are shuffled together and dealt back out one at a time, starting with the next player. */
function shuffleHands(state: GameState, seat: number, events: GameEvent[]): void {
  const seats = activeSeats(state);
  const pool = seats.flatMap((i) => state.players[i]!.hand);
  state.rng = shuffle(pool, state.rng);
  for (const i of seats) {
    state.players[i]!.hand = [];
    state.players[i]!.calledUno = false;
    state.voids[i] = [];
    state.named[i] = null;
  }
  let to = seatAfter(state, seat);
  for (const card of pool) {
    state.players[to]!.hand.push(card);
    to = seatAfter(state, to);
  }
  events.push({ type: 'shuffledHands', seat });
}

/** A draw card: the next player takes the cards and loses their turn, or (when stacking or challenging) gets to respond. */
function drawEffect(state: GameState, seat: number, card: Card, extra: { wild4Illegal: boolean; colorBefore: Color }, events: GameEvent[]): void {
  const { rules } = state;
  const next = seatAfter(state, seat);
  const amount = drawAmount(card);
  if (rules.stackDraws || (isWildDraw(card) && rules.challengeWild4)) {
    // The next player can stack, challenge, or take the cards.
    state.pendingDraw += amount;
    state.wild4Check = isWildDraw(card) ? { seat, illegal: extra.wild4Illegal, colorBefore: extra.colorBefore } : null;
    state.currentPlayer = next;
    events.push({ type: 'drawStacked', total: state.pendingDraw, next });
  } else {
    // Work out who plays next before drawing: the victim might be knocked out by the Mercy rule.
    const land = seatAfter(state, seat, 2);
    drawCards(state, next, amount, events);
    events.push({ type: 'skipped', seat: next });
    state.currentPlayer = land;
  }
}

/** UNO Flip: every card everywhere turns over, so the other side is in play. */
function flipEverything(state: GameState, seat: number, events: GameEvent[]): void {
  const turnOver = (card: Card): Card => ({ ...(card.other as CardFace), id: card.id, other: stripOther(card) }) as Card;
  for (const p of state.players) p.hand = p.hand.map(turnOver);
  state.drawPile = state.drawPile.map(turnOver);
  state.discardPile = state.discardPile.map(turnOver);
  state.side = state.side === 'dark' ? 'light' : 'dark';
  // Every face changed, so nothing noticed about colors still holds.
  state.voids = state.players.map(() => []);
  state.named = state.players.map(() => null);
  events.push({ type: 'flipped', seat, side: state.side });

  const top = topCard(state);
  if (top.color === 'wild') state.phase = 'chooseColor';
  else state.currentColor = top.color;
}

function stripOther(card: Card): CardFace {
  const { id: _id, other: _other, ...face } = card;
  return face as CardFace;
}

function chooseColor(state: GameState, seat: number, color: Color, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (state.phase !== 'chooseColor' && state.phase !== 'roulette') return 'There is no color to choose';
  if (!colorsForSide(state.side).includes(color)) return 'Choose one of the colors in play';
  state.currentColor = color;
  if (state.phase === 'roulette') {
    // Color Roulette: reveal cards until that color turns up; keep them all, and lose the turn.
    state.phase = 'playing';
    const land = seatAfter(state, seat);
    // The spin is announced before what it caused (the draw, maybe a knockout).
    const at = events.length;
    const drawn = drawUntil(state, seat, (c) => c.color === color, events);
    events.splice(at, 0, { type: 'roulette', seat, color, count: drawn.length });
    if (!isOver(state)) state.currentPlayer = land;
    return null;
  }
  state.phase = 'playing';
  state.currentPlayer = seatAfter(state, seat);
  events.push({ type: 'colorChosen', seat, color });
  return null;
}

function noteVoid(state: GameState, seat: number, color: Color): void {
  if (!state.voids[seat]!.includes(color)) state.voids[seat]!.push(color);
}

function swapHands(state: GameState, a: number, b: number): void {
  const pa = state.players[a]!;
  const pb = state.players[b]!;
  [pa.hand, pb.hand] = [pb.hand, pa.hand];
  [state.voids[a], state.voids[b]] = [state.voids[b]!, state.voids[a]!];
  [state.named[a], state.named[b]] = [state.named[b]!, state.named[a]!];
  pa.calledUno = false;
  pb.calledUno = false;
}

/** Every hand moves one seat along in the direction of play (among players still in). */
function rotateHands(state: GameState): void {
  const hands = state.players.map((p) => p.hand);
  const voids = [...state.voids];
  const named = [...state.named];
  state.players.forEach((p, i) => {
    if (state.out[i]) return;
    const from = seatAfter(state, i, -1);
    p.hand = hands[from]!;
    p.calledUno = false;
    state.voids[i] = voids[from]!;
    state.named[i] = named[from]!;
  });
}

function draw(state: GameState, seat: number, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (state.phase === 'chooseColor' || state.phase === 'roulette') return 'Choose a color first';
  if (state.phase !== 'playing') return 'You already drew this turn';
  state.unoVulnerable = null;

  // Drawing instead of playing tells everyone you're probably out of this color.
  if (state.pendingDraw === 0) noteVoid(state, seat, state.currentColor);

  // Taking the stacked penalty ends your turn.
  if (state.pendingDraw > 0) {
    // Cleared first: taking the cards might knock this player out and end the round.
    const penalty = state.pendingDraw;
    state.pendingDraw = 0;
    state.wild4Check = null;
    drawCards(state, seat, penalty, events);
    if (isOver(state)) return null;
    events.push({ type: 'skipped', seat });
    state.currentPlayer = seatAfter(state, seat);
    return null;
  }

  const drawn = state.rules.drawUntilPlayable
    ? drawUntil(state, seat, (c) => isPlayable(state, c), events)
    : drawCards(state, seat, 1, events);
  if (isOver(state)) return null;
  if (state.out[seat]) {
    // Drew their way past the Mercy limit.
    state.currentPlayer = seatAfter(state, seat);
    return null;
  }
  const card = drawn[drawn.length - 1];
  if (card && isPlayable(state, card)) {
    state.phase = 'playDrawn';
    state.drawnCardId = card.id;
  } else {
    state.currentPlayer = seatAfter(state, seat);
  }
  return null;
}

function pass(state: GameState, seat: number, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (state.phase !== 'playDrawn') return 'You must play or draw first';
  state.phase = 'playing';
  state.drawnCardId = null;
  state.currentPlayer = seatAfter(state, seat);
  events.push({ type: 'passed', seat });
  return null;
}

function challenge(state: GameState, seat: number, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (!canChallenge(state)) return 'There is no wild draw card to challenge';
  const { seat: target, illegal } = state.wild4Check!;
  const penalty = state.pendingDraw;
  state.pendingDraw = 0;
  state.wild4Check = null;
  state.unoVulnerable = null;
  events.push({ type: 'challenged', by: seat, target, success: illegal });

  if (illegal) {
    // Caught: the +4 player takes the cards, and the challenger plays normally.
    drawCards(state, target, penalty, events);
  } else {
    drawCards(state, seat, penalty + CHALLENGE_PENALTY, events);
    events.push({ type: 'skipped', seat });
    state.currentPlayer = seatAfter(state, seat);
  }
  return null;
}

function callUno(state: GameState, seat: number, events: GameEvent[]): string | null {
  const player = state.players[seat]!;
  // Playing several cards at once (or a Discard All) can take you from many cards straight to one.
  const bigPlays =
    state.rules.stackSameNumber || state.variantId === 'no-mercy' || state.rules.customWilds.some((c) => c.effect === 'discardColor');
  if (player.hand.length > 2 && !bigPlays) return 'You can only call UNO with two cards or fewer';
  player.calledUno = true;
  if (state.unoVulnerable === seat) state.unoVulnerable = null;
  events.push({ type: 'calledUno', seat });
  return null;
}

function catchUno(state: GameState, seat: number, target: number, events: GameEvent[]): string | null {
  if (target === seat) return 'You cannot catch yourself';
  if (state.unoVulnerable !== target) return 'That player cannot be caught';
  state.unoVulnerable = null;
  drawCards(state, target, 2, events);
  events.push({ type: 'caughtUno', by: seat, target });
  return null;
}

/** Takes one card from the draw pile, reshuffling the discard pile when needed. */
function takeCard(state: GameState, events: GameEvent[]): Card | undefined {
  if (state.drawPile.length === 0) reshuffle(state, events);
  return state.drawPile.pop();
}

/** Draws up to `count` cards. */
function drawCards(state: GameState, seat: number, count: number, events: GameEvent[]): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = takeCard(state, events);
    if (!card) break;
    drawn.push(card);
  }
  giveCards(state, seat, drawn, events);
  return drawn;
}

/** Draws until a card matches `stop` (or the cards run out). */
function drawUntil(state: GameState, seat: number, stop: (card: Card) => boolean, events: GameEvent[]): Card[] {
  const drawn: Card[] = [];
  for (;;) {
    const card = takeCard(state, events);
    if (!card) break;
    drawn.push(card);
    if (stop(card)) break;
  }
  giveCards(state, seat, drawn, events);
  return drawn;
}

function giveCards(state: GameState, seat: number, cards: Card[], events: GameEvent[]): void {
  if (cards.length === 0) return;
  const player = state.players[seat]!;
  player.hand.push(...cards);
  // A handful of new cards means what we noticed about this player may no longer hold.
  if (cards.length >= 2) state.voids[seat] = [];
  const limit = deckFor(state.variantId).mercyLimit;
  player.calledUno = false;
  events.push({ type: 'drew', seat, count: cards.length });
  if (limit !== null && player.hand.length >= limit) eliminate(state, seat, events);
}

/** No Mercy's Mercy rule: a hand this big is out of the round; the cards go back into the deck. */
function eliminate(state: GameState, seat: number, events: GameEvent[]): void {
  const player = state.players[seat]!;
  // The cards still count against them: whoever wins the round scores them.
  const cardPoints = deckFor(state.variantId).points;
  state.mercyPoints = (state.mercyPoints ?? 0) + player.hand.reduce((s, c) => s + cardPoints(c), 0);
  state.drawPile.unshift(...player.hand);
  state.rng = shuffle(state.drawPile, state.rng);
  player.hand = [];
  player.calledUno = false;
  state.out[seat] = true;
  state.voids[seat] = [];
  state.named[seat] = null;
  if (state.unoVulnerable === seat) state.unoVulnerable = null;
  events.push({ type: 'eliminated', seat });
  // Last one standing wins the round.
  const left = activeSeats(state);
  if (left.length === 1 && state.roundWinner === null) endRound(state, left[0]!, events);
}

function isOver(state: GameState): boolean {
  return state.phase === 'roundOver' || state.phase === 'gameOver';
}

function reshuffle(state: GameState, events: GameEvent[]): void {
  if (state.discardPile.length <= 1) return;
  const top = state.discardPile.pop()!;
  state.drawPile = state.discardPile;
  state.discardPile = [top];
  state.rng = shuffle(state.drawPile, state.rng);
  events.push({ type: 'reshuffled' });
}

function endRound(state: GameState, winner: number, events: GameEvent[]): void {
  // Set first: the drawing below may knock someone out, which must not end the round again.
  state.roundWinner = winner;
  // Going out on a draw card still makes the next player draw (it counts for scoring).
  if (state.pendingDraw > 0) {
    drawCards(state, state.currentPlayer, state.pendingDraw, events);
    state.pendingDraw = 0;
    state.wild4Check = null;
  }
  const { points: cardPoints, pointsToWin } = deckFor(state.variantId);
  // The winner scores the cards left in everyone else's hand (a last player standing may still hold some).
  const points = state.players.reduce(
    (sum, p, i) => (i === winner ? sum : sum + p.hand.reduce((s, c) => s + cardPoints(c), 0)),
    state.mercyPoints ?? 0,
  );
  state.scores[winner]! += points;
  state.history.push({ round: state.round, winner, points });
  state.unoVulnerable = null;
  events.push({ type: 'roundOver', winner, points });

  const gameWon = state.rules.winCondition === 'firstOut' || state.scores[winner]! >= pointsToWin;
  if (gameWon) {
    state.phase = 'gameOver';
    state.gameWinner = winner;
    events.push({ type: 'gameOver', winner });
  } else {
    state.phase = 'roundOver';
  }
}

/** Shuffles a fresh deck, deals, and flips the starting card. */
function dealRound(state: GameState, events: GameEvent[]): void {
  const config = deckFor(state.variantId);
  const [deck, rng] = config.build(state.rules.deckCount, state.rng, state.rules);
  state.rng = shuffle(deck, rng);
  // Two-sided decks are built light side up.
  if (deck[0]?.other) state.side = 'light';
  state.drawPile = deck;
  state.discardPile = [];
  state.direction = 1;
  state.phase = 'playing';
  state.drawnCardId = null;
  state.unoVulnerable = null;
  state.pendingDraw = 0;
  state.wild4Check = null;
  state.roundWinner = null;
  state.voids = state.players.map(() => []);
  state.named = state.players.map(() => null);
  state.out = state.players.map(() => false);
  state.mercyPoints = 0;
  for (const p of state.players) {
    p.hand = [];
    p.calledUno = false;
  }

  for (let round = 0; round < state.rules.handSize; round++) {
    for (let i = 1; i <= state.players.length; i++) {
      state.players[(state.dealer + i) % state.players.length]!.hand.push(state.drawPile.pop()!);
    }
  }

  // Wilds (and Flip cards...) can't start the round: put them back and reshuffle.
  let start = state.drawPile.pop()!;
  while (!config.canStart(start)) {
    state.drawPile.unshift(start);
    state.rng = shuffle(state.drawPile, state.rng);
    start = state.drawPile.pop()!;
  }
  state.discardPile.push(start);
  // (UNO All Wild starts on a Wild; it has no colors, so any color will do.)
  state.currentColor = start.color === 'wild' ? 'red' : start.color;

  // The starting card acts as if the dealer had played it (7-0 swaps don't apply).
  const first = seatAfter(state, state.dealer);
  switch (start.value) {
    case 'skip':
      events.push({ type: 'skipped', seat: first });
      state.currentPlayer = seatAfter(state, state.dealer, 2);
      break;
    case 'reverse':
      state.direction = -1;
      events.push({ type: 'reversed', direction: -1 });
      state.currentPlayer = state.dealer;
      break;
    case 'draw1':
    case 'draw2':
      drawCards(state, first, drawAmount(start), events);
      events.push({ type: 'skipped', seat: first });
      state.currentPlayer = seatAfter(state, state.dealer, 2);
      break;
    default:
      state.currentPlayer = first;
  }
}
