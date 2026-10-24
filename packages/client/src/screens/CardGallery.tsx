import { buildClassicDeck, buildFlipDecks, type CardFace } from '@uno/shared';
import { Card, CardBack } from '../components/Card';

/** One of each distinct card face. */
function unique(faces: CardFace[]): CardFace[] {
  const seen = new Set<string>();
  return faces.filter((face) => {
    const key = `${face.color}-${face.value}-${face.dark ? 'd' : 'l'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every distinct card design, for checking the art. Open the app with `?cards`. */
export function CardGallery() {
  const [flipDeck] = buildFlipDecks(1, 1);
  const sections: [string, CardFace[]][] = [
    ['UNO', unique(buildClassicDeck())],
    ['UNO Flip: light side', unique(flipDeck)],
    ['UNO Flip: dark side', unique(flipDeck.map((c) => c.other!))],
  ];
  return (
    <main className="gallery">
      <CardBack />
      {sections.map(([title, faces]) => (
        <section key={title} className="gallery__section">
          <h2>{title}</h2>
          <div className="gallery__cards">
            {faces.map((face, i) => <Card key={i} card={face} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
