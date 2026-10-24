import { shuffle } from '../../rng.js';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Action,
  type ActionResult,
  type Card,
  type Color,
  type GameEvent,
  type GameState,
  type PlayerInfo,
  type PlayerView,
  type RuleSet,
} from '../../types.js';
import { buildDecks, cardPoints } from './deck.js';
import { isPlayable, seatAfter, topCard } from './rules.js';

const DECK_SIZE = 108;
const POINTS_TO_WIN = 500;

export function createGame(players: PlayerInfo[], rules: RuleSet, seed: number): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Need ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  if (players.length * rules.handSize >= rules.deckCount * DECK_SIZE - 10) {
    throw new Error('Not enough cards for this hand size; use more decks');
  }
  const state: GameState = {
    variantId: 'classic',
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
    dealer: 0,
    roundWinner: null,
    gameWinner: null,
    scores: players.map(() => 0),
    round: 1,
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

  const state = structuredClone(prev);
  const events: GameEvent[] = [];
  const error = dispatch(state, seat, action, events);
  return error ? fail(error) : { ok: true, state, events };
}

export function getPlayerView(state: GameState, seat: number): PlayerView {
  return {
    you: seat,
    hand: state.players[seat]?.hand ?? [],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      handCount: p.hand.length,
      calledUno: p.calledUno,
    })),
    topCard: topCard(state),
    currentColor: state.currentColor,
    currentPlayer: state.currentPlayer,
    direction: state.direction,
    phase: state.phase,
    drawPileCount: state.drawPile.length,
    drawnCardId: state.currentPlayer === seat ? state.drawnCardId : null,
    unoVulnerable: state.unoVulnerable,
    roundWinner: state.roundWinner,
    gameWinner: state.gameWinner,
    scores: state.scores,
    round: state.round,
    rules: state.rules,
  };
}

// ---------------------------------------------------------------------------

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Mutates `state`. Returns an error message, or null on success. */
function dispatch(state: GameState, seat: number, action: Action, events: GameEvent[]): string | null {
  switch (action.type) {
    case 'play':
      return play(state, seat, action.cardIds, action.color, events);
    case 'draw':
      return draw(state, seat, events);
    case 'pass':
      return pass(state, seat, events);
    case 'callUno':
      return callUno(state, seat, events);
    case 'catchUno':
      return catchUno(state, seat, action.target, events);
  }
}

function play(
  state: GameState,
  seat: number,
  cardIds: string[],
  chosenColor: Color | undefined,
  events: GameEvent[],
): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (cardIds.length !== 1) return 'Play exactly one card';
  const player = state.players[seat]!;
  const index = player.hand.findIndex((c) => c.id === cardIds[0]);
  const card = player.hand[index];
  if (!card) return 'You do not have that card';
  if (state.phase === 'playDrawn' && card.id !== state.drawnCardId) {
    return 'After drawing you may only play the drawn card';
  }
  if (!isPlayable(state, card)) return 'That card cannot be played';
  if (card.color === 'wild' && !chosenColor) return 'Choose a color for the wild card';

  state.unoVulnerable = null;
  player.hand.splice(index, 1);
  state.discardPile.push(card);
  state.currentColor = card.color === 'wild' ? chosenColor! : card.color;
  state.phase = 'playing';
  state.drawnCardId = null;
  events.push({ type: 'played', seat, cards: [card], color: state.currentColor });

  if (player.hand.length === 1 && !player.calledUno) state.unoVulnerable = seat;

  applyEffect(state, seat, card, events);
  if (player.hand.length === 0) endRound(state, seat, events);
  return null;
}

/** Applies the card's effect and moves the turn on. */
function applyEffect(state: GameState, seat: number, card: Card, events: GameEvent[]): void {
  const next = seatAfter(state, seat);
  switch (card.value) {
    case 'skip':
      events.push({ type: 'skipped', seat: next });
      state.currentPlayer = seatAfter(state, seat, 2);
      return;
    case 'reverse':
      state.direction = state.direction === 1 ? -1 : 1;
      events.push({ type: 'reversed', direction: state.direction });
      if (state.players.length === 2) {
        // With two players a reverse acts as a skip: the same player goes again.
        events.push({ type: 'skipped', seat: next });
        state.currentPlayer = seat;
      } else {
        state.currentPlayer = seatAfter(state, seat);
      }
      return;
    case 'draw2':
    case 'wild4':
      drawCards(state, next, card.value === 'draw2' ? 2 : 4, events);
      events.push({ type: 'skipped', seat: next });
      state.currentPlayer = seatAfter(state, seat, 2);
      return;
    default:
      state.currentPlayer = next;
  }
}

function draw(state: GameState, seat: number, events: GameEvent[]): string | null {
  if (seat !== state.currentPlayer) return 'It is not your turn';
  if (state.phase !== 'playing') return 'You already drew this turn';

  state.unoVulnerable = null;
  const [card] = drawCards(state, seat, 1, events);
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

function callUno(state: GameState, seat: number, events: GameEvent[]): string | null {
  const player = state.players[seat]!;
  if (player.hand.length > 2) return 'You can only call UNO with two cards or fewer';
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

/** Draws up to `count` cards, reshuffling the discard pile when needed. */
function drawCards(state: GameState, seat: number, count: number, events: GameEvent[]): Card[] {
  const player = state.players[seat]!;
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) reshuffle(state, events);
    const card = state.drawPile.pop();
    if (!card) break;
    drawn.push(card);
  }
  if (drawn.length > 0) {
    player.hand.push(...drawn);
    player.calledUno = false;
    events.push({ type: 'drew', seat, count: drawn.length });
  }
  return drawn;
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
  const points = state.players.reduce(
    (sum, p) => sum + p.hand.reduce((s, c) => s + cardPoints(c), 0),
    0,
  );
  state.scores[winner]! += points;
  state.roundWinner = winner;
  state.unoVulnerable = null;
  events.push({ type: 'roundOver', winner, points });

  const gameWon = state.rules.winCondition === 'firstOut' || state.scores[winner]! >= POINTS_TO_WIN;
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
  const deck = buildDecks(state.rules.deckCount);
  state.rng = shuffle(deck, state.rng);
  state.drawPile = deck;
  state.discardPile = [];
  state.direction = 1;
  state.phase = 'playing';
  state.drawnCardId = null;
  state.unoVulnerable = null;
  state.roundWinner = null;
  for (const p of state.players) {
    p.hand = [];
    p.calledUno = false;
  }

  for (let round = 0; round < state.rules.handSize; round++) {
    for (let i = 1; i <= state.players.length; i++) {
      state.players[(state.dealer + i) % state.players.length]!.hand.push(state.drawPile.pop()!);
    }
  }

  // Wild cards can't start the round: put them back and reshuffle.
  let start = state.drawPile.pop()!;
  while (start.color === 'wild') {
    state.drawPile.unshift(start);
    state.rng = shuffle(state.drawPile, state.rng);
    start = state.drawPile.pop()!;
  }
  state.discardPile.push(start);
  state.currentColor = start.color;

  // The starting card acts as if the dealer had played it.
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
    case 'draw2':
      drawCards(state, first, 2, events);
      events.push({ type: 'skipped', seat: first });
      state.currentPlayer = seatAfter(state, state.dealer, 2);
      break;
    default:
      state.currentPlayer = first;
  }
}
