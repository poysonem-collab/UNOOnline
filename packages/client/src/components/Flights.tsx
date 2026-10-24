import { useLayoutEffect, useRef } from 'react';
import type { Card as CardData } from '@uno/shared';
import { Card, CardBack } from './Card';

/** A card flying across the table: from a player to the pile, or from the draw pile to a player. */
export interface Flight {
  id: number;
  from: DOMRect;
  to: DOMRect;
  /** Face-up card to show, or null for a face-down card. */
  card: CardData | null;
  /** Card width in pixels (the size of cards on the table). */
  width: number;
  delay: number;
}

export const FLIGHT_MS = 420;

export function Flights({ flights, onDone }: { flights: Flight[]; onDone: (id: number) => void }) {
  return (
    <div className="flights" aria-hidden>
      {flights.map((f) => <FlyingCard key={f.id} flight={f} onDone={() => onDone(f.id)} />)}
    </div>
  );
}

function FlyingCard({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const el = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    // Fly from the centre of one box to the centre of the other.
    const { from, to, width } = flight;
    const x0 = from.left + from.width / 2 - width / 2;
    const y0 = from.top + from.height / 2 - (width * 1.5) / 2;
    const x1 = to.left + to.width / 2 - width / 2;
    const y1 = to.top + to.height / 2 - (width * 1.5) / 2;
    node.style.width = `${width}px`;
    const spin = (Math.random() - 0.5) * 50;
    const animation = node.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) rotate(${spin}deg) scale(0.6)`, opacity: 0.9 },
        { transform: `translate(${x1}px, ${y1}px) rotate(0deg) scale(1)`, opacity: 1 },
      ],
      { duration: FLIGHT_MS, delay: flight.delay, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' },
    );
    animation.onfinish = onDone;
    return () => animation.cancel();
    // Each flight animates exactly once.
  }, []);

  return (
    <div ref={el} className="flight">
      {flight.card ? <Card card={flight.card} /> : <CardBack />}
    </div>
  );
}
