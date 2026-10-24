import type { PlayerView } from '@uno/shared';
import { Card, CardBack } from './Card';

interface OpponentProps {
  player: PlayerView['players'][number];
  isTurn: boolean;
  canCatch: boolean;
  score: number | null;
  /** No Mercy: a hand this big is knocked out (null in other games). */
  mercyLimit?: number | null;
  /** Disconnected right now. */
  away?: boolean;
  onCatch: () => void;
  /** Lets the table find this player on screen, for flying-card animations. */
  elRef?: (el: HTMLDivElement | null) => void;
}

const MAX_FAN = 8;
/** No Mercy: show a hand this close to the Mercy limit in red. */
const DANGER_MARGIN = 5;

export function Opponent({ player, isTurn, canCatch, score, mercyLimit = null, away, onCatch, elRef }: OpponentProps) {
  const fan = Math.min(player.handCount, MAX_FAN);
  const danger = mercyLimit !== null && !player.out && player.handCount >= mercyLimit - DANGER_MARGIN;
  const classes = ['opponent', isTurn ? 'opponent--turn' : '', away ? 'opponent--away' : '', player.out ? 'opponent--out' : ''];
  return (
    <div ref={elRef} className={classes.join(' ')}>
      <div className="opponent__top">
        <span className="opponent__avatar" aria-hidden>{player.isBot ? '🤖' : player.name[0]?.toUpperCase()}</span>
        <span className="opponent__name">{player.name}</span>
      </div>
      <div className="opponent__cards" aria-label={`${player.handCount} cards`}>
        <div className={`opponent__fan ${player.otherSides ? 'opponent__fan--faces' : ''}`} style={{ ['--n' as string]: fan }}>
          {/* UNO Flip: you see the backs of their cards, which are real faces. */}
          {player.otherSides
            ? player.otherSides.slice(0, MAX_FAN).map((face, i) => <Card key={i} card={face} className="card--mini" />)
            : Array.from({ length: fan }, (_, i) => <CardBack key={i} className="card--mini" />)}
        </div>
        <span className={`opponent__count ${danger ? 'opponent__count--danger' : ''}`}>{player.handCount}</span>
      </div>
      {player.out && <span className="tag tag--out">Knocked out</span>}
      {score !== null && <span className="opponent__score">{score} pts</span>}
      {away && <span className="tag tag--away">Away</span>}
      {player.calledUno && player.handCount === 1 && <span className="badge badge--uno">UNO!</span>}
      {canCatch && (
        <button type="button" className="btn btn--catch" onClick={onCatch}>
          Catch! +2
        </button>
      )}
    </div>
  );
}
