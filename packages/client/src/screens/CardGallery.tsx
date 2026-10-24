import { buildClassicDeck, type Card as CardData } from '@uno/shared';
import { Card, CardBack } from '../components/Card';

/** Every distinct card design, for checking the art. Open the app with `?cards`. */
export function CardGallery() {
  const seen = new Set<string>();
  const unique: CardData[] = buildClassicDeck().filter((card) => {
    const key = `${card.color}-${card.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <main className="gallery">
      <CardBack />
      {unique.map((card) => <Card key={card.id} card={card} />)}
    </main>
  );
}
