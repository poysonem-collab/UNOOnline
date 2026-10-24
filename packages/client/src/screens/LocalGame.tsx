import { GameTable } from '../components/GameTable';
import { useLocalGame, type LocalGameConfig } from '../local/useLocalGame';

export function LocalGame({ config, onExit }: { config: LocalGameConfig; onExit: () => void }) {
  const game = useLocalGame(config);
  const menu = { label: 'Menu', onClick: onExit };
  const endActions =
    game.view.phase === 'gameOver'
      ? [{ label: 'Play again', onClick: game.restart, primary: true }, menu]
      : [{ label: 'Next round', onClick: game.nextRound, primary: true }, menu];

  return (
    <GameTable
      key={game.dealKey}
      view={game.view}
      log={game.log}
      events={game.events}
      playableIds={game.playableIds}
      onAction={game.act}
      endActions={endActions}
      onExit={onExit}
    />
  );
}
