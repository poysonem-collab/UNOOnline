import { buildClassicDeck, buildFlipDecks, buildNoMercyDecks, GIANT_CUSTOM_WILDS, type CardFace } from '@uno/shared';
import { Card, CardBack, CardThemeContext, CustomWildsContext, type CardTheme } from '../components/Card';

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
  const sections: [string, CardFace[], CardTheme][] = [
    ['UNO', unique(buildClassicDeck()), 'classic'],
    ['UNO Flip: light side', unique(flipDeck), 'classic'],
    ['UNO Flip: dark side', unique(flipDeck.map((c) => c.other!)), 'classic'],
    ['UNO Show ’Em No Mercy (with the Expansion Pack)', unique(buildNoMercyDecks(1, true)), 'nomercy'],
    ['Giant UNO: blank wilds (what the host wrote, or what they do)', [
      { color: 'wild', value: 'custom1' }, { color: 'wild', value: 'custom2' },
    ], 'classic'],
  ];
  return (
    <CustomWildsContext.Provider value={[GIANT_CUSTOM_WILDS[0]!, { name: 'Everybody dance', effect: 'wild' }]}>
    <main className="gallery">
      <CardBack />
      {sections.map(([title, faces, theme]) => (
        <CardThemeContext.Provider key={title} value={theme}>
          <section className="gallery__section">
            <h2>{title}</h2>
            <div className="gallery__cards">
              {theme !== 'classic' && <CardBack />}
              {faces.map((face, i) => <Card key={i} card={face} />)}
            </div>
          </section>
        </CardThemeContext.Provider>
      ))}
    </main>
    </CustomWildsContext.Provider>
  );
}
