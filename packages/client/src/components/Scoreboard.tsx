import { deckFor, type PlayerView } from '@uno/shared';
import { Card } from './Card';

const MEDALS = ['🥇', '🥈', '🥉'];
const MAX_TINY_CARDS = 10;

const nameOf = (view: PlayerView, seat: number) => (seat === view.you ? 'You' : view.players[seat]!.name);

/** Total scores, best first, with progress toward the target in points games. */
export function Standings({ view }: { view: PlayerView }) {
  const pointsMode = view.rules.winCondition === 'points500';
  const rows = view.players
    .map((p, seat) => ({ seat, name: nameOf(view, seat), isBot: p.isBot, score: view.scores[seat]! }))
    .sort((a, b) => b.score - a.score);
  return (
    <ol className="standings">
      {rows.map((r, rank) => (
        <li key={r.seat} className={`standings__row ${r.seat === view.you ? 'is-you' : ''}`}>
          <span className="standings__rank">{r.score > 0 ? MEDALS[rank] ?? `${rank + 1}.` : `${rank + 1}.`}</span>
          <span className="standings__name">{r.name}</span>
          {pointsMode && (
            <span className="standings__bar" aria-hidden>
              <span style={{ width: `${Math.min(100, (r.score / view.pointsToWin) * 100)}%` }} />
            </span>
          )}
          <span className="standings__score">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}

/** Each player's leftover cards when a round ends, and what they're worth. */
export function RevealedHands({ view }: { view: PlayerView }) {
  const hands = view.revealedHands;
  if (!hands) return null;
  const winner = view.phase === 'gameOver' ? view.gameWinner : view.roundWinner;
  // Each version scores by its own card values (UNO Flip: for the side in play).
  const pointsOf = deckFor(view.variantId).points;
  const rows = hands
    .map((hand, seat) => ({ seat, hand, out: view.players[seat]!.out, points: hand.reduce((s, c) => s + pointsOf(c), 0) }))
    .sort((a, b) => (a.seat === winner ? -1 : b.seat === winner ? 1 : Number(a.out) - Number(b.out) || a.points - b.points));
  // The engine's total also counts the hands knocked out in No Mercy.
  const total = view.history.at(-1)?.points ?? 0;

  return (
    <ul className="revealed">
      {rows.map((r) => (
        <li key={r.seat} className={`revealed__row ${r.seat === winner ? 'is-winner' : ''}`}>
          <span className="revealed__name">{nameOf(view, r.seat)}</span>
          <span className="revealed__cards">
            {r.seat === winner && r.hand.length === 0 && <span className="revealed__out">Went out!</span>}
            {r.seat === winner && r.hand.length > 0 && <span className="revealed__out">Last one standing!</span>}
            {r.out && <span className="revealed__knocked">Knocked out</span>}
            {r.seat !== winner && r.hand.slice(0, MAX_TINY_CARDS).map((c) => <Card key={c.id} card={c} className="card--tiny" />)}
            {r.hand.length > MAX_TINY_CARDS && <span className="revealed__more">+{r.hand.length - MAX_TINY_CARDS}</span>}
          </span>
          <span className="revealed__points">{r.seat === winner ? `+${total}` : r.out ? '' : r.points}</span>
        </li>
      ))}
    </ul>
  );
}

/** Who won each round so far. */
export function RoundHistory({ view }: { view: PlayerView }) {
  if (view.history.length === 0) return <p className="hint">No rounds finished yet.</p>;
  return (
    <table className="history">
      <thead>
        <tr><th>Round</th><th>Winner</th><th>Points</th></tr>
      </thead>
      <tbody>
        {view.history.map((h) => (
          <tr key={h.round}>
            <td>{h.round}</td>
            <td>{nameOf(view, h.winner)}</td>
            <td>+{h.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ScoreboardModal({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const pointsMode = view.rules.winCondition === 'points500';
  return (
    <div className="modal" role="dialog" aria-label="Scores" onClick={onClose}>
      <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
        <h2>Scores</h2>
        <p className="hint">{pointsMode ? `First to ${view.pointsToWin} points wins.` : 'First player out wins.'}</p>
        <Standings view={view} />
        <h3 className="modal__subtitle">Rounds</h3>
        <RoundHistory view={view} />
        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
