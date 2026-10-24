import type { PlayerView } from '@uno/shared';
import { CardBack } from './Card';

interface OpponentProps {
  player: PlayerView['players'][number];
  isTurn: boolean;
  canCatch: boolean;
  score: number | null;
  /** Disconnected right now. */
  away?: boolean;
  onCatch: () => void;
}

const MAX_FAN = 8;

export function Opponent({ player, isTurn, canCatch, score, away, onCatch }: OpponentProps) {
  const fan = Math.min(player.handCount, MAX_FAN);
  return (
    <div className={`opponent ${isTurn ? 'opponent--turn' : ''} ${away ? 'opponent--away' : ''}`}>
      <div className="opponent__top">
        <span className="opponent__avatar" aria-hidden>{player.isBot ? '🤖' : player.name[0]?.toUpperCase()}</span>
        <span className="opponent__name">{player.name}</span>
      </div>
      <div className="opponent__cards" aria-label={`${player.handCount} cards`}>
        <div className="opponent__fan" style={{ ['--n' as string]: fan }}>
          {Array.from({ length: fan }, (_, i) => (
            <CardBack key={i} className="card--mini" />
          ))}
        </div>
        <span className="opponent__count">{player.handCount}</span>
      </div>
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
