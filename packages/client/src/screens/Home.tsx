import { VARIANT_CATALOG } from '@uno/shared';
import { Card } from '../components/Card';
import { ONLINE_AVAILABLE } from '../net/socket';

const PREVIEW_CARDS = [
  { id: 'p1', color: 'red', value: 7 },
  { id: 'p2', color: 'blue', value: 'reverse' },
  { id: 'p3', color: 'wild', value: 'wild' },
  { id: 'p4', color: 'green', value: 'skip' },
  { id: 'p5', color: 'yellow', value: 'draw2' },
] as const;

export function Home({ onChoose, onJoinFriend }: { onChoose: (variantId: string) => void; onJoinFriend: () => void }) {
  return (
    <main className="home">
      <header className="home__hero">
        <div className="home__fan" aria-hidden>
          {PREVIEW_CARDS.map((card, i) => (
            <div key={card.id} className="home__fan-card" style={{ ['--i' as string]: i - 2 }}>
              <Card card={card} />
            </div>
          ))}
        </div>
        <h1>UNO Online</h1>
        <p className="home__tagline">Play with friends or bots, up to 10 players.</p>
        {ONLINE_AVAILABLE && (
          <button type="button" className="btn home__join" onClick={onJoinFriend}>Have a room code? Join a friend →</button>
        )}
      </header>

      <h2 className="home__heading">Choose a game</h2>
      <ul className="variants">
        {VARIANT_CATALOG.map((v) => (
          <li key={v.id}>
            <button
              type="button" className={`variant ${v.locked ? 'variant--locked' : ''}`}
              disabled={v.locked} onClick={() => onChoose(v.id)}
            >
              <span className="variant__name">
                {v.name}
                {v.locked && <span className="variant__lock" aria-label="Locked">🔒</span>}
              </span>
              <span className="variant__desc">{v.description}</span>
              <span className="variant__cta">{v.locked ? 'Coming soon' : 'Play →'}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
