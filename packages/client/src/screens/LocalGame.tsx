import { GameTable } from '../components/GameTable';
import { useLocalGame, type LocalGameConfig } from '../local/useLocalGame';

export function LocalGame({ config, onExit }: { config: LocalGameConfig; onExit: () => void }) {
  const game = useLocalGame(config);
  return (
    <GameTable
      key={game.dealKey}
      view={game.view}
      log={game.log}
      playableIds={game.playableIds}
      onAction={game.act}
      onNextRound={game.nextRound}
      onRestart={game.restart}
      onExit={onExit}
    />
  );
}
