import type { PlayerView } from '@uno/shared';

/** Choose another player: who to swap hands with (7-0, Forced Swap), or who draws (Targeted Draw Two). */
export function SwapPicker({
  view, onPick, onCancel, title = 'Swap hands with…',
}: { view: PlayerView; onPick: (seat: number) => void; onCancel: () => void; title?: string }) {
  // Knocked-out players (No Mercy) have no hand to swap.
  const others = view.players.map((p, seat) => ({ ...p, seat })).filter((p) => p.seat !== view.you && !p.out);
  return (
    <div className="modal" role="dialog" aria-label={title} onClick={onCancel}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <ul className="swap-picker">
          {others.map((p) => (
            <li key={p.id}>
              <button type="button" className="swap-picker__player" onClick={() => onPick(p.seat)}>
                <span className="seat__avatar" aria-hidden>{p.isBot ? '🤖' : p.name[0]?.toUpperCase()}</span>
                <span className="swap-picker__name">{p.name}</span>
                <span className="swap-picker__count">{p.handCount} card{p.handCount === 1 ? '' : 's'}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
