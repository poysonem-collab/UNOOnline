import { useCallback, useState } from 'react';
import type { JoinedRoom } from '@uno/shared';
import type { LocalGameConfig } from './local/useLocalGame';
import { roomFromUrl } from './net/session';
import { CardGallery } from './screens/CardGallery';
import { Home } from './screens/Home';
import { LocalGame } from './screens/LocalGame';
import { OnlineRoom } from './screens/OnlineRoom';
import { Setup, type SetupTab } from './screens/Setup';

type Screen =
  | { name: 'home' }
  | { name: 'setup'; variantId: string; tab: SetupTab; code?: string; notice?: string }
  | { name: 'lobby'; joined: JoinedRoom }
  | { name: 'game'; config: LocalGameConfig };

/** An invite link (`?room=CODE`) opens straight onto the join form. */
function initialScreen(): Screen {
  const code = roomFromUrl();
  return code ? { name: 'setup', variantId: 'classic', tab: 'friends', code } : { name: 'home' };
}

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const leaveLobby = useCallback(
    (notice?: string) => setScreen({ name: 'setup', variantId: 'classic', tab: 'friends', notice }),
    [],
  );
  if (new URLSearchParams(location.search).has('cards')) return <CardGallery />;

  switch (screen.name) {
    case 'home':
      return (
        <Home
          onChoose={(variantId) => setScreen({ name: 'setup', variantId, tab: 'bots' })}
          onJoinFriend={() => setScreen({ name: 'setup', variantId: 'classic', tab: 'friends' })}
        />
      );
    case 'setup':
      return (
        <Setup
          key={`${screen.variantId}-${screen.tab}-${screen.notice ?? ''}`}
          variantId={screen.variantId}
          initialTab={screen.tab}
          initialCode={screen.code}
          notice={screen.notice}
          onBack={() => setScreen({ name: 'home' })}
          onStart={(config) => setScreen({ name: 'game', config })}
          onJoined={(joined) => setScreen({ name: 'lobby', joined })}
        />
      );
    case 'lobby':
      return <OnlineRoom joined={screen.joined} onExit={leaveLobby} />;
    case 'game':
      return (
        <LocalGame
          config={screen.config}
          onExit={() => {
            if (confirm('Leave this game?')) setScreen({ name: 'setup', variantId: screen.config.variantId, tab: 'bots' });
          }}
        />
      );
  }
}
