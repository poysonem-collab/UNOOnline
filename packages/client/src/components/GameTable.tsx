import { useEffect, useMemo, useRef, useState } from 'react';
import { colorName, describeCard, type Action, type Card as CardData, type Color, type PlayerView } from '@uno/shared';
import { Card, CardBack, CARD_COLORS } from './Card';
import { ColorPicker } from './ColorPicker';
import { Confetti } from './Confetti';
import { Flights, type Flight } from './Flights';
import { Opponent } from './Opponent';
import { RevealedHands, ScoreboardModal, Standings } from './Scoreboard';
import { SwapPicker } from './SwapPicker';
import { burstFor, soundsFor, type Burst, type EventBatch } from '../effects/eventEffects';
import { playSound, playSounds } from '../effects/sound';
import { useMuted } from '../effects/useMuted';
import type { LogEntry } from '../local/useLocalGame';

export interface EndAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface GameTableProps {
  view: PlayerView;
  log: LogEntry[];
  playableIds: Set<string>;
  /** Returns (or resolves to) an error message, or null on success. */
  onAction: (action: Action) => string | null | Promise<string | null>;
  /** Buttons on the round-over / game-over screen. */
  endActions: EndAction[];
  /** Extra line on that screen, e.g. "Waiting for the host". */
  endNote?: string;
  onExit: () => void;
  exitLabel?: string;
  /** Local clock time when the current turn timer runs out. */
  turnEndsAt?: number | null;
  /** Local clock time when the next round starts by itself. */
  nextRoundAt?: number | null;
  /** Players who are disconnected right now. */
  awayIds?: Set<string>;
  /** Banner across the top, e.g. connection problems. */
  notice?: string | null;
  /** The latest move's events, for sounds and animations. */
  events?: EventBatch | null;
}

const TITLE = 'UNO Online';
/** A batch older than this when the table mounts is old news: don't replay it. */
const FRESH_MS = 800;

const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Whole seconds until `deadline`, updating while it counts down. */
function useCountdown(deadline: number | null | undefined): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

const COLOR_ORDER = ['red', 'yellow', 'green', 'blue', 'wild'];
const VALUE_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'skip', 'reverse', 'draw2', 'wild', 'wild4'];

function sortHand(hand: CardData[]): CardData[] {
  return [...hand].sort(
    (a, b) =>
      COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color) ||
      VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value),
  );
}

/** Small stable tilt per card so the discard pile looks hand-thrown. */
function tilt(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h % 25) - 12;
}

export function GameTable({
  view, log, playableIds, onAction, endActions, endNote, onExit, exitLabel = '← Menu',
  turnEndsAt, nextRoundAt, awayIds, notice, events,
}: GameTableProps) {
  /** A play waiting on a choice: the wild's color, or who to swap hands with. */
  const [picker, setPicker] = useState<{ kind: 'color' | 'swap'; cardIds: string[]; color?: Color } | null>(null);
  /** Same-number stacking: cards picked so far; the first is the one that must be playable. */
  const [selection, setSelection] = useState<string[]>([]);
  const sending = useRef(false);
  const secondsLeft = useCountdown(turnEndsAt);
  const [error, setError] = useState<string | null>(null);
  const [pile, setPile] = useState<CardData[]>([view.topCard]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightId = useRef(0);
  const [burst, setBurst] = useState<(Burst & { key: number }) | null>(null);
  const [showScores, setShowScores] = useState(false);
  const [muted, setMuted] = useMuted();
  const drawPileRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const seatEls = useRef(new Map<number, HTMLElement>());
  const handledSeq = useRef(events && Date.now() - events.at > FRESH_MS ? events.seq : -1);

  // Keep the last few discards visible under the top card.
  useEffect(() => {
    setPile((prev) => (prev.at(-1)?.id === view.topCard.id ? prev : [...prev, view.topCard].slice(-4)));
  }, [view.topCard]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(t);
  }, [error]);

  const you = view.players[view.you]!;
  const yourTurn = view.currentPlayer === view.you && (view.phase === 'playing' || view.phase === 'playDrawn');

  // Each new move: sounds, a callout for big moments, and cards flying across the table.
  useEffect(() => {
    if (!events || events.seq === handledSeq.current) return;
    handledSeq.current = events.seq;
    playSounds(soundsFor(events.events, view.you));
    const callout = burstFor(events.events, view.you, view.players.map((p) => p.name));
    if (callout) setBurst({ ...callout, key: events.seq });
    if (prefersReducedMotion() || document.hidden) return;

    const placeOf = (seat: number) =>
      (seat === view.you ? handRef.current : seatEls.current.get(seat))?.getBoundingClientRect();
    const discard = discardRef.current?.getBoundingClientRect();
    const drawPile = drawPileRef.current?.getBoundingClientRect();
    const width = discard?.width ?? 80;
    const next: Flight[] = [];
    for (const e of events.events) {
      if (e.type === 'played') {
        const from = placeOf(e.seat);
        if (from && discard) next.push({ id: flightId.current++, from, to: discard, card: e.cards[e.cards.length - 1]!, width, delay: 0 });
      } else if (e.type === 'drew') {
        const to = placeOf(e.seat);
        for (let i = 0; i < Math.min(e.count, 3) && to && drawPile; i++) {
          next.push({ id: flightId.current++, from: drawPile, to, card: null, width, delay: i * 80 });
        }
      }
    }
    if (next.length) setFlights((f) => [...f, ...next]);
  }, [events, view.you, view.players]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1100);
    return () => clearTimeout(t);
  }, [burst]);

  // Your turn: a chime, a buzz on phones, and a hint in the tab title if you're looking elsewhere.
  const wasYourTurn = useRef(yourTurn);
  useEffect(() => {
    if (yourTurn && !wasYourTurn.current) {
      playSound('yourTurn');
      navigator.vibrate?.(40);
    }
    wasYourTurn.current = yourTurn;
    if (!yourTurn) {
      document.title = TITLE;
      return;
    }
    const update = () => {
      document.title = document.hidden ? `🔔 Your turn! · ${TITLE}` : TITLE;
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      document.title = TITLE;
    };
  }, [yourTurn]);

  // Tick through the last seconds of your turn timer.
  useEffect(() => {
    if (yourTurn && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5) playSound('tick');
  }, [yourTurn, secondsLeft]);
  const gameActive = view.phase === 'playing' || view.phase === 'playDrawn';
  const pointsMode = view.rules.winCondition === 'points500';
  const hand = useMemo(() => sortHand(view.hand), [view.hand]);

  // Opponents in turn order starting from your left.
  const opponents = view.players
    .map((p, seat) => ({ p, seat }))
    .slice(view.you + 1)
    .concat(view.players.map((p, seat) => ({ p, seat })).slice(0, view.you));

  // Ignore taps while a move is on its way to the server, so a double-tap can't send it twice.
  const run = (action: Action) => {
    if (sending.current) return;
    sending.current = true;
    void Promise.resolve(onAction(action)).then((err) => {
      sending.current = false;
      if (err) setError(err);
    });
  };

  // A selection only makes sense while those cards can still be played.
  useEffect(() => {
    if (selection.length && !playableIds.has(selection[0]!)) setSelection([]);
  }, [playableIds, selection]);

  const cardById = (id: string) => view.hand.find((c) => c.id === id)!;

  /** Plays the cards, first asking for a color or a swap target if the last card needs one. */
  const submitPlay = (cardIds: string[], color?: Color, swapWith?: number) => {
    const last = cardById(cardIds[cardIds.length - 1]!);
    if (last.color === 'wild' && !color) return setPicker({ kind: 'color', cardIds });
    const swaps = view.rules.sevenZero && last.value === 7 && view.hand.length > cardIds.length;
    if (swaps && swapWith === undefined) return setPicker({ kind: 'swap', cardIds, color });
    setPicker(null);
    setSelection([]);
    run({ type: 'play', cardIds, ...(color ? { color } : {}), ...(swapWith !== undefined ? { swapWith } : {}) });
  };

  const base = selection.length ? cardById(selection[0]!) : null;
  const isExtra = (card: CardData) => base !== null && card.id !== base.id && card.value === base.value;

  const tapCard = (card: CardData) => {
    if (base) {
      if (isExtra(card)) {
        setSelection((sel) => (sel.includes(card.id) ? sel.filter((id) => id !== card.id) : [...sel, card.id]));
      }
      return;
    }
    if (!playableIds.has(card.id)) return;
    // With same-number stacking, holding more of this number starts a selection.
    const more = view.rules.stackSameNumber && typeof card.value === 'number' && view.hand.some((c) => c.id !== card.id && c.value === card.value);
    if (more) setSelection([card.id]);
    else submitPlay([card.id]);
  };

  const pending = view.pendingDraw;
  const canCallUno =
    gameActive && !you.calledUno && (view.hand.length <= 2 || (selection.length > 0 && view.hand.length - selection.length === 1));
  const canJumpIn = !yourTurn && gameActive && playableIds.size > 0;
  const current = view.players[view.currentPlayer]!;
  const status =
    !gameActive ? ''
    : yourTurn && pending > 0 && view.canChallenge && playableIds.size === 0 ? `+${pending} on you! Take the cards or challenge the +4`
    : yourTurn && pending > 0 && playableIds.size === 0 ? `Take ${pending} cards`
    : yourTurn && pending > 0 ? `Stack a draw card to pass it on, or take ${pending} cards`
    : yourTurn && view.phase === 'playDrawn' ? 'Play the card you drew, or keep it'
    : yourTurn ? 'Your turn: play a card or draw'
    : awayIds?.has(current.id) ? `Waiting for ${current.name} to reconnect…`
    : current.isBot ? `${current.name} is thinking…`
    : `${current.name}'s turn`;

  return (
    <div className="table">
      <header className="table__header">
        <button type="button" className="btn btn--ghost btn--small" onClick={onExit}>{exitLabel}</button>
        <span className="table__round">{pointsMode ? `Round ${view.round} · First to 500` : 'First out wins'}</span>
        <span className="table__tools">
          {pointsMode && <span className="table__you-score">You: {view.scores[view.you]} pts</span>}
          <button type="button" className="icon-btn" onClick={() => setShowScores(true)} aria-label="Scores" title="Scores">🏆</button>
          <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute sound'} title={muted ? 'Sound off' : 'Sound on'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </span>
      </header>

      {notice && <div className="table__notice" role="status">{notice}</div>}

      <section className="opponents">
        {opponents.map(({ p, seat }) => (
          <Opponent
            key={p.id}
            player={p}
            isTurn={gameActive && view.currentPlayer === seat}
            canCatch={view.unoVulnerable === seat}
            score={pointsMode ? view.scores[seat]! : null}
            away={awayIds?.has(p.id) ?? false}
            onCatch={() => run({ type: 'catchUno', target: seat })}
            elRef={(el) => {
              if (el) seatEls.current.set(seat, el);
              else seatEls.current.delete(seat);
            }}
          />
        ))}
      </section>

      <section className="center">
        <div className={`direction direction--${view.direction === 1 ? 'cw' : 'ccw'}`} aria-label={view.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}>
          <svg viewBox="0 0 100 100"><path d="M50 8 A42 42 0 1 1 14 29" fill="none" strokeWidth="4" /><path d="M20 19 L4 27 L21 38 Z" fill="#fff" stroke="none" /></svg>
        </div>

        <button
          ref={drawPileRef}
          type="button" className="draw-pile"
          onClick={() => run({ type: 'draw' })}
          disabled={!yourTurn || view.phase !== 'playing'}
          aria-label={pending > 0 && yourTurn ? `Take ${pending} cards` : `Draw a card (${view.drawPileCount} left)`}
        >
          <CardBack className="card--table draw-pile__under" />
          <CardBack className="card--table" />
          <span className="draw-pile__count">{view.drawPileCount}</span>
        </button>

        <div ref={discardRef} className="discard" style={{ ['--glow' as string]: CARD_COLORS[view.currentColor] }} aria-label={`Top card: ${describeCard(view.topCard)}`}>
          {pile.map((card, i) => (
            <div
              key={card.id}
              className={[
                'discard__card',
                i === pile.length - 1 ? 'discard__card--top' : '',
                // Hidden until the flying copy lands on it.
                flights.some((f) => f.card?.id === card.id) ? 'discard__card--incoming' : '',
              ].join(' ')}
              style={{ ['--tilt' as string]: `${tilt(card.id)}deg` }}
            >
              <Card card={card} className="card--table" />
            </div>
          ))}
          {view.topCard.color === 'wild' && (
            <span className="discard__color" style={{ background: CARD_COLORS[view.currentColor] }}>{colorName(view.currentColor)}</span>
          )}
          {pending > 0 && <span className="discard__pending" aria-label={`${pending} cards waiting`}>+{pending}</span>}
        </div>
      </section>

      <section className="status" aria-live="polite">
        <div className={`status__turn ${yourTurn ? 'status__turn--you' : ''}`}>
          {status}
          {canJumpIn && <span className="status__jump">You can jump in!</span>}
          {gameActive && secondsLeft !== null && (
            <span className={`timer ${secondsLeft <= 5 ? 'timer--urgent' : ''}`} aria-label={`${secondsLeft} seconds left`}>{secondsLeft}s</span>
          )}
        </div>
        <ul className="log">
          {log.slice(-3).map((entry) => <li key={entry.id}>{entry.text}</li>)}
        </ul>
      </section>

      <section className="you">
        <div className="you__controls">
          <button type="button" className={`btn btn--uno ${canCallUno ? 'btn--pulse' : ''}`} onClick={() => run({ type: 'callUno' })} disabled={!canCallUno}>
            UNO!
          </button>
          {selection.length > 0 && (
            <>
              <button type="button" className="btn btn--primary" onClick={() => submitPlay(selection)}>
                Play {selection.length} card{selection.length === 1 ? '' : 's'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setSelection([])}>Cancel</button>
            </>
          )}
          {yourTurn && pending > 0 && selection.length === 0 && (
            <button type="button" className="btn" onClick={() => run({ type: 'draw' })}>Take {pending} cards</button>
          )}
          {yourTurn && view.canChallenge && selection.length === 0 && (
            <button type="button" className="btn btn--challenge" onClick={() => run({ type: 'challenge' })}>Challenge +4</button>
          )}
          {yourTurn && view.phase === 'playDrawn' && selection.length === 0 && (
            <button type="button" className="btn" onClick={() => run({ type: 'pass' })}>Keep card</button>
          )}
          {you.calledUno && view.hand.length === 1 && <span className="badge badge--uno">UNO!</span>}
        </div>
        {base && (
          <p className="you__hint">Tap your other {String(base.value)}s to play them too. The last one you pick sets the color.</p>
        )}
        <div ref={handRef} className="hand" style={{ ['--n' as string]: hand.length }}>
          {hand.map((card) => {
            const selected = selection.includes(card.id);
            const tappable = base ? selected || isExtra(card) : playableIds.has(card.id);
            const classes = [
              'card--hand',
              tappable && !base ? (yourTurn ? 'card--playable' : 'card--jumpin') : '',
              base && isExtra(card) && !selected ? 'card--selectable' : '',
              selected ? 'card--selected' : '',
              card.id === view.drawnCardId ? 'card--drawn' : '',
            ];
            return (
              <Card
                key={card.id}
                card={card}
                className={classes.join(' ')}
                onClick={() => tapCard(card)}
                disabled={!tappable}
              />
            );
          })}
        </div>
      </section>

      {error && <div className="toast" role="alert">{error}</div>}

      {burst && (
        <div key={burst.key} className={`burst burst--${burst.kind}`} aria-hidden>
          {burst.text}
        </div>
      )}
      <Flights flights={flights} onDone={(id) => setFlights((f) => f.filter((x) => x.id !== id))} />
      {showScores && <ScoreboardModal view={view} onClose={() => setShowScores(false)} />}

      {picker?.kind === 'color' && (
        <ColorPicker onCancel={() => setPicker(null)} onPick={(color) => submitPlay(picker.cardIds, color)} />
      )}
      {picker?.kind === 'swap' && (
        <SwapPicker
          view={view}
          onCancel={() => setPicker(null)}
          onPick={(seat) => submitPlay(picker.cardIds, picker.color, seat)}
        />
      )}

      {(view.phase === 'roundOver' || view.phase === 'gameOver') && (
        <RoundOver view={view} actions={endActions} note={endNote} nextRoundAt={nextRoundAt} />
      )}
    </div>
  );
}

function RoundOver({ view, actions, note, nextRoundAt }: { view: PlayerView; actions: EndAction[]; note?: string; nextRoundAt?: number | null }) {
  const gameOver = view.phase === 'gameOver';
  const nextIn = useCountdown(gameOver ? null : nextRoundAt);
  const winnerSeat = gameOver ? view.gameWinner! : view.roundWinner!;
  const youWon = winnerSeat === view.you;
  const winner = youWon ? 'You' : view.players[winnerSeat]!.name;
  const pointsMode = view.rules.winCondition === 'points500';

  return (
    <div className="modal" role="dialog" aria-label={gameOver ? 'Game over' : 'Round over'}>
      {youWon && <Confetti />}
      <div className="modal__box modal__box--wide">
        <h2 className="modal__title">
          {youWon ? '🎉 ' : ''}
          {winner} won {gameOver ? 'the game!' : `round ${view.round}!`}
        </h2>
        <RevealedHands view={view} />
        {pointsMode && (
          <>
            <h3 className="modal__subtitle">Total scores</h3>
            <Standings view={view} />
          </>
        )}
        {nextIn !== null && <p className="modal__note">Next round starts in {nextIn}s</p>}
        {note && <p className="modal__note">{note}</p>}
        <div className="modal__actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className={`btn ${a.primary ? 'btn--primary' : 'btn--ghost'}`} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
