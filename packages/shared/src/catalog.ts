/** Every UNO version shown in the "create game" menu. Locked ones are not playable yet. */
export interface VariantListing {
  id: string;
  name: string;
  description: string;
  locked: boolean;
}

export const VARIANT_CATALOG: VariantListing[] = [
  {
    id: 'classic',
    name: 'UNO',
    description: 'The classic game. Match by color or number and be first to empty your hand.',
    locked: false,
  },
  {
    id: 'no-mercy',
    name: 'UNO Show ’Em No Mercy',
    description: 'Brutal draw cards, forced stacking, and elimination at 25 cards.',
    locked: true,
  },
  {
    id: 'flex',
    name: 'UNO Flex',
    description: 'Flex cards change their power depending on the color in play.',
    locked: true,
  },
  {
    id: 'flip',
    name: 'UNO Flip',
    description: 'Double-sided cards. A Flip card turns everything over to the harsher dark side.',
    locked: false,
  },
  {
    id: 'all-wild',
    name: 'UNO All Wild',
    description: 'Every card is wild, so there is no matching at all.',
    locked: true,
  },
  {
    id: 'giant',
    name: 'Giant UNO',
    description: 'Oversized cards with write-your-own rule cards.',
    locked: true,
  },
  {
    id: 'attack',
    name: 'UNO Attack!',
    description: 'Press the launcher instead of drawing and hope no cards fly out.',
    locked: true,
  },
  {
    id: 'dare',
    name: 'UNO Dare!',
    description: 'Dare cards make players complete challenges or draw.',
    locked: true,
  },
];
