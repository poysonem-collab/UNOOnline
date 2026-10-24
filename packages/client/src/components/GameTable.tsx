import { useEffect, useMemo, useRef, useState } from 'react';
import { colorName, describeCard, type Action, type Card as CardData, type PlayerView } from '@uno/shared';
import { Card, CardBack, CARD_COLORS } from './Card';
import { ColorPicker } from './ColorPicker';
import { Opponent } from './Opponent';
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
}

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
  turnEndsAt, nextRoundAt, awayIds, notice,
}: GameTableProps) {
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const sending = useRef(false);
  const secondsLeft = useCountdown(turnEndsAt);
  const [error, setError] = useState<string | null>(null);
  const [pile, setPile] = useState<CardData[]>([view.topCard]);

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

  const playCard = (card: CardData) => {
    if (card.color === 'wild') setPendingWild(card.id);
    else run({ type: 'play', cardIds: [card.id] });
  };

  const canCallUno = gameActive && view.hand.length <= 2 && !you.calledUno;
  const current = view.players[view.currentPlayer]!;
  const status =
    !gameActive ? ''
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
        <span className="table__you-score">{pointsMode ? `You: ${view.scores[view.you]} pts` : ''}</span>
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
          />
        ))}
      </section>

      <section className="center">
        <div className={`direction direction--${view.direction === 1 ? 'cw' : 'ccw'}`} aria-label={view.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}>
          <svg viewBox="0 0 100 100"><path d="M50 8 A42 42 0 1 1 14 29" fill="none" strokeWidth="4" /><path d="M20 19 L4 27 L21 38 Z" fill="#fff" stroke="none" /></svg>
        </div>

        <button
          type="button" className="draw-pile"
          onClick={() => run({ type: 'draw' })}
          disabled={!yourTurn || view.phase !== 'playing'}
          aria-label={`Draw a card (${view.drawPileCount} left)`}
        >
          <CardBack className="card--table draw-pile__under" />
          <CardBack className="card--table" />
          <span className="draw-pile__count">{view.drawPileCount}</span>
        </button>

        <div className="discard" style={{ ['--glow' as string]: CARD_COLORS[view.currentColor] }} aria-label={`Top card: ${describeCard(view.topCard)}`}>
          {pile.map((card, i) => (
            <div key={card.id} className={`discard__card ${i === pile.length - 1 ? 'discard__card--top' : ''}`} style={{ ['--tilt' as string]: `${tilt(card.id)}deg` }}>
              <Card card={card} className="card--table" />
            </div>
          ))}
          {view.topCard.color === 'wild' && (
            <span className="discard__color" style={{ background: CARD_COLORS[view.currentColor] }}>{colorName(view.currentColor)}</span>
          )}
        </div>
      </section>

      <section className="status" aria-live="polite">
        <div className={`status__turn ${yourTurn ? 'status__turn--you' : ''}`}>
          {status}
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
          <button type="button" className={`btn btn--uno ${canCallUno && view.hand.length <= 2 ? 'btn--pulse' : ''}`} onClick={() => run({ type: 'callUno' })} disabled={!canCallUno}>
            UNO!
          </button>
          {yourTurn && view.phase === 'playDrawn' && (
            <button type="button" className="btn" onClick={() => run({ type: 'pass' })}>Keep card</button>
          )}
          {you.calledUno && view.hand.length === 1 && <span className="badge badge--uno">UNO!</span>}
        </div>
        <div className="hand" style={{ ['--n' as string]: hand.length }}>
          {hand.map((card) => {
            const playable = yourTurn && playableIds.has(card.id);
            return (
              <Card
                key={card.id}
                card={card}
                className={`card--hand ${playable ? 'card--playable' : ''} ${card.id === view.drawnCardId ? 'card--drawn' : ''}`}
                onClick={() => playCard(card)}
                disabled={!playable}
              />
            );
          })}
        </div>
      </section>

      {error && <div className="toast" role="alert">{error}</div>}

      {pendingWild && (
        <ColorPicker
          onCancel={() => setPendingWild(null)}
          onPick={(color) => {
            run({ type: 'play', cardIds: [pendingWild], color });
            setPendingWild(null);
          }}
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
  const winner = winnerSeat === view.you ? 'You' : view.players[winnerSeat]!.name;
  const standings = view.players
    .map((p, seat) => ({ name: seat === view.you ? 'You' : p.name, score: view.scores[seat]!, seat }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="modal" role="dialog" aria-label={gameOver ? 'Game over' : 'Round over'}>
      <div className="modal__box">
        <h2 className="modal__title">
          {winnerSeat === view.you ? '🎉 ' : ''}
          {winner} won {gameOver ? 'the game!' : `round ${view.round}!`}
        </h2>
        <table className="scores">
          <tbody>
            {standings.map((s) => (
              <tr key={s.seat} className={s.seat === winnerSeat ? 'is-winner' : ''}>
                <td>{s.name}</td>
                <td>{s.score} pts</td>
              </tr>
            ))}
          </tbody>
        </table>
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
