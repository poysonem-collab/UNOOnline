import { useState } from 'react';
import type { LocalGameConfig } from './local/useLocalGame';
import { CardGallery } from './screens/CardGallery';
import { Home } from './screens/Home';
import { LocalGame } from './screens/LocalGame';
import { Setup } from './screens/Setup';

type Screen =
  | { name: 'home' }
  | { name: 'setup'; variantId: string }
  | { name: 'game'; config: LocalGameConfig };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  if (new URLSearchParams(location.search).has('cards')) return <CardGallery />;

  switch (screen.name) {
    case 'home':
      return <Home onChoose={(variantId) => setScreen({ name: 'setup', variantId })} />;
    case 'setup':
      return (
        <Setup
          variantId={screen.variantId}
          onBack={() => setScreen({ name: 'home' })}
          onStart={(config) => setScreen({ name: 'game', config })}
        />
      );
    case 'game':
      return (
        <LocalGame
          config={screen.config}
          onExit={() => {
            if (confirm('Leave this game?')) setScreen({ name: 'setup', variantId: screen.config.variantId });
          }}
        />
      );
  }
}
