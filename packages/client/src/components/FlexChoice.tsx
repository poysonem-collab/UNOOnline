import { describeCard, FLEX_SIDE_INFO, flexSide, type Card as CardData, type CustomWild } from '@uno/shared';
import { Card } from './Card';

/** UNO Flex: play a card normally, or on its flex side (which turns your Power Card red). */
export function FlexChoice({
  card, canPlayNormally, customWilds, onNormal, onFlex, onCancel,
}: {
  card: CardData;
  canPlayNormally: boolean;
  customWilds: CustomWild[];
  onNormal: () => void;
  onFlex: () => void;
  onCancel: () => void;
}) {
  const side = flexSide(card)!;
  return (
    <div className="modal" role="dialog" aria-label="Flex this card?" onClick={onCancel}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <h2>{describeCard(card, { customWilds })}</h2>
        <div className="flex-choice__card"><Card card={card} /></div>
        <div className="modal__actions">
          {canPlayNormally && <button type="button" className="btn" onClick={onNormal}>Play it normally</button>}
          <button type="button" className="btn btn--flex" onClick={onFlex}>
            <strong>Flex:</strong> {FLEX_SIDE_INFO[side].label}
          </button>
          <p className="hint">Flexing turns your Power Card red until it flips back.</p>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
