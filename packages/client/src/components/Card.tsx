import { createContext, useContext, useId, type ReactNode } from 'react';
import { customWildFor, customWildTitle, describeCard, type CardFace, type Color, type CustomWild } from '@uno/shared';

export const CARD_COLORS: Record<Color, string> = {
  red: '#d72600',
  yellow: '#ecd407',
  green: '#379711',
  blue: '#0956bf',
  // UNO Flip's dark side
  pink: '#d6127f',
  teal: '#00999a',
  orange: '#f26b1d',
  purple: '#6c3aa0',
};
const BLACK = '#111';
const LIGHT_WILD = [CARD_COLORS.red, CARD_COLORS.blue, CARD_COLORS.yellow, CARD_COLORS.green];
const DARK_WILD = [CARD_COLORS.pink, CARD_COLORS.teal, CARD_COLORS.orange, CARD_COLORS.purple];

// Card art is drawn on a 120 x 180 grid.
const W = 120;
const H = 180;
const OVAL_TILT = 'rotate(30 60 90)';

type Value = CardFace['value'];

/** Each printed deck has its own look: UNO Show 'Em No Mercy cards have black borders, for one. */
export type CardTheme = 'classic' | 'nomercy' | 'allwild';
export const CardThemeContext = createContext<CardTheme>('classic');
export const cardThemeFor = (variantId: string): CardTheme =>
  variantId === 'no-mercy' ? 'nomercy' : variantId === 'all-wild' ? 'allwild' : 'classic';

/** Cards that only exist in UNO All Wild. */
const ALL_WILD_ONLY = new Set<Value>(['wildSkip', 'wildSkip2', 'wildReverse', 'wildTarget2', 'wildSwap']);

/** Giant UNO: what the host wrote on the blank wild cards in this game. */
export const CustomWildsContext = createContext<CustomWild[]>([]);

/** Cards that only exist in No Mercy always get its look. */
const NO_MERCY_ONLY = new Set<Value>(['draw4', 'discardAll', 'wildRev4', 'wild6', 'wild10', 'roulette', 10, 'wildRev8', 'wildDiscardAll']);

interface CardProps {
  card: CardFace;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
  className?: string;
}

export function Card({ card, onClick, disabled, highlight, className = '' }: CardProps) {
  const customWilds = useContext(CustomWildsContext);
  const classes = ['card', onClick && !disabled ? 'card--clickable' : '', disabled ? 'card--disabled' : '', highlight ? 'card--highlight' : '', className];
  const art = <CardArt card={card} />;
  const label = describeCard(card, { customWilds });
  if (!onClick) {
    return <div className={classes.join(' ')} aria-label={label}>{art}</div>;
  }
  return (
    <button type="button" className={classes.join(' ')} onClick={onClick} disabled={disabled} aria-label={label}>
      {art}
    </button>
  );
}

export function CardBack({ className = '' }: { className?: string }) {
  const noMercy = useContext(CardThemeContext) === 'nomercy';
  return (
    <div className={`card ${className}`} aria-label="Face-down card">
      <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
        {noMercy ? <rect width={W} height={H} rx="12" fill={BLACK} /> : <Frame face={BLACK} />}
        <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill={CARD_COLORS.red} />
        <text
          x="60" y="102" textAnchor="middle" transform="rotate(-20 60 90)"
          className="card__back-text" fill="#fff" stroke={BLACK} strokeWidth="4" paintOrder="stroke"
        >
          UNO
        </text>
        {noMercy && (
          <text x="60" y="160" textAnchor="middle" className="card__back-tag" fill="#ff5a1f" stroke={BLACK} strokeWidth="3" paintOrder="stroke">
            NO MERCY
          </text>
        )}
      </svg>
    </div>
  );
}

/**
 * Light-side (and classic) cards: colored face, white oval, white border.
 * UNO Flip's dark side: colored face, black oval, black border.
 */
function CardArt({ card }: { card: CardFace }) {
  const theme = useContext(CardThemeContext);
  const customWilds = useContext(CustomWildsContext);
  if (card.value === 'custom1' || card.value === 'custom2') {
    return <BlankWildArt title={customWildTitle(customWildFor({ customWilds }, card.value)!)} />;
  }
  if (theme === 'allwild' || ALL_WILD_ONLY.has(card.value)) return <AllWildArt value={card.value} />;
  if (theme === 'nomercy' || NO_MERCY_ONLY.has(card.value)) return <NoMercyArt card={card} />;
  const dark = Boolean(card.dark);
  if (card.color === 'wild') return <WildArt value={card.value} dark={dark} />;
  const color = CARD_COLORS[card.color];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={color} dark={dark} />
      <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill={dark ? '#161616' : '#fff'} />
      <Corners>
        <CornerMark value={card.value} />
      </Corners>
      <CenterMark value={card.value} color={color} />
    </svg>
  );
}

/** Border with rounded corners around the face: white on the light side, black on the dark side. */
function Frame({ face, dark }: { face: string; dark?: boolean }) {
  return (
    <>
      <rect width={W} height={H} rx="12" fill={dark ? '#1b1b1b' : '#fff'} />
      <rect x="6" y="6" width={W - 12} height={H - 12} rx="8" fill={face} />
    </>
  );
}

/** Draws the corner content top-left and again upside down bottom-right. */
function Corners({ children }: { children: ReactNode }) {
  return (
    <>
      <g transform="translate(22 30)">{children}</g>
      <g transform="translate(98 150) rotate(180)">{children}</g>
    </>
  );
}

const DRAW_LABELS: Partial<Record<Value, string>> = {
  draw1: '+1', draw2: '+2', draw4: '+4', draw5: '+5', wild2: '+2', wild4: '+4', wildColor: '+?', wildRev4: '+4', wild6: '+6', wild10: '+10', wildRev8: '+8',
};

/** Where the mini cards sit in a fan of four (x, y, which color for wilds). */
const FAN_OF_FOUR = [[-30, -30, 1], [-14, -20, 3], [-10, -8, 0], [6, 2, 2]] as const;

/** Small white mark centered on (0, 0). */
function CornerMark({ value }: { value: Value }) {
  if (typeof value === 'number') return <OutlinedText size={30} fill="#fff" underline={value === 6 || value === 9}>{value}</OutlinedText>;
  const label = DRAW_LABELS[value];
  if (label) return <OutlinedText size={24} fill="#fff">{label}</OutlinedText>;
  return <g transform="scale(11)"><ActionSymbol value={value as SymbolValue} fill="#fff" /></g>;
}

/** Big mark in the oval. */
function CenterMark({ value, color }: { value: Value; color: string }) {
  if (typeof value === 'number') {
    return (
      <g transform="translate(60 90)">
        <OutlinedText size={84} fill={color} shadow underline={value === 6 || value === 9}>{value}</OutlinedText>
      </g>
    );
  }
  if (value === 'draw2' || value === 'draw1') {
    return (
      <g transform="translate(60 90)">
        {value === 'draw1' ? (
          <MiniCard x={-12} y={-16} fill={color} />
        ) : (
          <>
            <MiniCard x={-20} y={-24} fill={color} />
            <MiniCard x={-4} y={-6} fill={color} />
          </>
        )}
      </g>
    );
  }
  if (value === 'draw5') {
    return (
      <g transform="translate(60 90)">
        <OutlinedText size={56} fill={color} shadow>+5</OutlinedText>
      </g>
    );
  }
  return (
    <g transform="translate(60 90) scale(30)">
      <g transform="translate(-0.08 0.08)"><ActionSymbol value={value as SymbolValue} fill={BLACK} /></g>
      <ActionSymbol value={value as SymbolValue} fill={color} outline />
    </g>
  );
}

type SymbolValue = 'skip' | 'reverse' | 'flip' | 'skipAll';

/** Action symbols drawn in a unit box centered on (0, 0). */
function ActionSymbol({ value, fill, outline }: { value: SymbolValue; fill: string; outline?: boolean }) {
  const stroke = outline ? { stroke: BLACK, strokeWidth: 0.06, paintOrder: 'stroke' as const } : {};
  // Stroked shapes get their outline from a wider black copy drawn underneath.
  const twice = (draw: (color: string, width: number) => ReactNode, width: number) => (
    <>
      {outline && draw(BLACK, width + 0.12)}
      {draw(fill, width)}
    </>
  );

  if (value === 'skip') {
    return twice(
      (color, width) => (
        <g fill="none" stroke={color} strokeWidth={width}>
          <circle r="0.66" />
          <line x1="-0.47" y1="0.47" x2="0.47" y2="-0.47" />
        </g>
      ),
      0.22,
    );
  }

  if (value === 'skipAll') {
    // A small Skip inside a dashed ring of arrows going all the way round.
    return twice(
      (color, width) => (
        <g fill="none" stroke={color}>
          <g strokeWidth={width * 0.75}>
            <circle r="0.42" />
            <line x1="-0.3" y1="0.3" x2="0.3" y2="-0.3" />
          </g>
          <circle r="0.8" strokeWidth={width * 0.6} strokeDasharray="0.55 0.28" />
        </g>
      ),
      0.22,
    );
  }

  if (value === 'flip') {
    // A card between two curved arrows chasing each other.
    return (
      <>
        {twice(
          (color, width) => (
            <g fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
              <path d="M -0.66 0.1 A 0.66 0.66 0 0 1 0.3 -0.6" />
              <path d="M 0.66 -0.1 A 0.66 0.66 0 0 1 -0.3 0.6" />
            </g>
          ),
          0.14,
        )}
        <g fill={fill} {...stroke}>
          <path d="M 0.18 -0.82 L 0.58 -0.6 L 0.2 -0.38 Z" />
          <path d="M -0.18 0.82 L -0.58 0.6 L -0.2 0.38 Z" />
          <rect x="-0.2" y="-0.28" width="0.4" height="0.56" rx="0.07" />
        </g>
      </>
    );
  }

  // Reverse: two arrows pointing opposite ways, tilted like the real card.
  const arrow = 'M-0.11 0.7 L-0.11 -0.1 L-0.28 -0.1 L0 -0.62 L0.28 -0.1 L0.11 -0.1 L0.11 0.7 Z';
  return (
    <g transform="rotate(45)" {...stroke} fill={fill}>
      <path d={arrow} transform="translate(-0.3 -0.08)" />
      <path d={arrow} transform="translate(0.3 0.08) rotate(180)" />
    </g>
  );
}

function OutlinedText({
  children, size, fill, shadow, underline, upright,
}: { children: ReactNode; size: number; fill: string; shadow?: boolean; underline?: boolean; upright?: boolean }) {
  const y = size * 0.35;
  const textProps = { x: 0, y, textAnchor: 'middle' as const, fontSize: size, className: `card__number ${upright ? 'card__number--upright' : ''}` };
  const lineW = size * 0.42;
  return (
    <g>
      {shadow && <text {...textProps} x={-size * 0.05} y={y + size * 0.05} fill={BLACK}>{children}</text>}
      <text {...textProps} fill={fill} stroke={BLACK} strokeWidth={size * 0.06} paintOrder="stroke">{children}</text>
      {underline && (
        <rect x={-lineW / 2} y={y + size * 0.08} width={lineW} height={size * 0.08} fill={fill} stroke={BLACK} strokeWidth={size * 0.03} />
      )}
    </g>
  );
}

function MiniCard({ x, y, fill, rotate = 0, plain }: { x: number; y: number; fill: string; rotate?: number; plain?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate} 12 15)`}>
      <rect width="24" height="32" rx="3" fill={fill} stroke={BLACK} strokeWidth="2.5" />
      {!plain && <rect x="3" y="3" width="18" height="26" rx="2" fill="none" stroke="#fff" strokeWidth="1.5" />}
    </g>
  );
}

/** Oval split into four colors, as on Wild cards. */
function FourColorOval({ rx, ry, border, colors }: { rx: number; ry: number; border: number; colors: string[] }) {
  const id = useId();
  const [a, b, c, d] = colors;
  return (
    <g transform="rotate(30)">
      <clipPath id={id}>
        <ellipse rx={rx} ry={ry} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={-rx} y={-ry} width={rx} height={ry} fill={a} />
        <rect x={0} y={-ry} width={rx} height={ry} fill={b} />
        <rect x={-rx} y={0} width={rx} height={ry} fill={c} />
        <rect x={0} y={0} width={rx} height={ry} fill={d} />
      </g>
      <ellipse rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth={border} />
    </g>
  );
}

function WildArt({ value, dark }: { value: Value; dark: boolean }) {
  const palette = dark ? DARK_WILD : LIGHT_WILD;
  const label = DRAW_LABELS[value];

  // Wild Draw Four / Wild Draw Two: mini cards fanned in a white oval.
  if (value === 'wild4' || value === 'wild2') {
    const fan = value === 'wild4' ? FAN_OF_FOUR : [[-20, -24, 1], [-4, -6, 3]];
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
        <Frame face={BLACK} dark={dark} />
        <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill="#fff" />
        <g transform="translate(60 90)">
          {fan.map(([x, y, i]) => <MiniCard key={i} x={x} y={y} fill={palette[i]!} />)}
        </g>
        <Corners><OutlinedText size={24} fill="#fff">{label}</OutlinedText></Corners>
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={BLACK} dark={dark} />
      <g transform="translate(60 90)"><FourColorOval rx={40} ry={64} border={4} colors={palette} /></g>
      {value === 'wildColor' ? (
        <>
          <g transform="translate(60 90)"><OutlinedText size={44} fill="#fff">+?</OutlinedText></g>
          <Corners><OutlinedText size={22} fill="#fff">+?</OutlinedText></Corners>
        </>
      ) : (
        <Corners><FourColorOval rx={7} ry={11} border={1.5} colors={palette} /></Corners>
      )}
    </svg>
  );
}


// ---------------------------------------------------------------------------
// UNO Show 'Em No Mercy: black borders, an outlined oval, white numbers and symbols.

/** The order mini cards take their colors in, on No Mercy wilds. */
const NM_WILD = [CARD_COLORS.red, CARD_COLORS.blue, CARD_COLORS.yellow, CARD_COLORS.green];

function NoMercyArt({ card }: { card: CardFace }) {
  if (card.color === 'wild') return <NoMercyWild value={card.value} />;
  const color = CARD_COLORS[card.color];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <rect width={W} height={H} rx="12" fill={BLACK} />
      <rect x="5" y="5" width={W - 10} height={H - 10} rx="9" fill={color} />
      <ellipse cx="60" cy="90" rx="41" ry="66" transform={OVAL_TILT} fill="none" stroke={BLACK} strokeWidth="3.5" />
      <Corners>
        <NoMercyCorner value={card.value} />
      </Corners>
      <NoMercyCenter value={card.value} />
    </svg>
  );
}

function NoMercyCorner({ value }: { value: Value }) {
  if (typeof value === 'number') {
    return <OutlinedText size={value === 10 ? 22 : 26} fill="#fff" upright underline={value === 6 || value === 9}>{value}</OutlinedText>;
  }
  const label = DRAW_LABELS[value];
  if (label) return <OutlinedText size={22} fill="#fff" upright>{label}</OutlinedText>;
  if (value === 'discardAll') return <g transform="scale(0.4)"><DiscardFan /></g>;
  return <g transform="scale(10)"><NoMercySymbol value={value as NoMercySymbolValue} /></g>;
}

function NoMercyCenter({ value }: { value: Value }) {
  if (typeof value === 'number') {
    return (
      <g transform="translate(60 90)">
        <OutlinedText size={value === 10 ? 56 : 72} fill="#fff" shadow upright underline={value === 6 || value === 9}>{value}</OutlinedText>
      </g>
    );
  }
  if (value === 'draw2') {
    return (
      <g transform="translate(60 90)">
        <MiniCard x={-20} y={-24} fill="#fff" plain />
        <MiniCard x={-4} y={-6} fill="#fff" plain />
      </g>
    );
  }
  if (value === 'draw4') {
    return <g transform="translate(60 90)">{FAN_OF_FOUR.map(([x, y]) => <MiniCard key={`${x}`} x={x} y={y} fill="#fff" plain />)}</g>;
  }
  if (value === 'discardAll') return <g transform="translate(60 94) scale(0.82)"><DiscardFan /></g>;
  return (
    <g transform="translate(60 90) scale(30)">
      <NoMercySymbol value={value as NoMercySymbolValue} />
    </g>
  );
}

type NoMercySymbolValue = 'skip' | 'reverse' | 'skipAll';

/** White symbols with a black outline, in a unit box centered on (0, 0). */
function NoMercySymbol({ value }: { value: NoMercySymbolValue }) {
  if (value === 'skipAll') {
    // A circular arrow going all the way round: everyone is skipped.
    const ring = (color: string, width: number) => (
      <path d="M 0.52 -0.36 A 0.62 0.62 0 1 1 -0.1 -0.62" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />
    );
    return (
      <>
        {ring(BLACK, 0.32)}
        {ring('#fff', 0.18)}
        <path d="M -0.2 -0.98 L 0.32 -0.64 L -0.2 -0.28 Z" fill="#fff" stroke={BLACK} strokeWidth="0.07" strokeLinejoin="round" />
      </>
    );
  }
  return <ActionSymbol value={value} fill="#fff" outline />;
}

/** Discard All: a hand of cards fanned out, about to be thrown down (in four colors on the wild one). */
function DiscardFan({ colors }: { colors?: string[] }) {
  return (
    <g>
      {[-42, -16, 10, 36].map((angle, i) => (
        <g key={angle} transform={`rotate(${angle} 0 30)`}>
          <rect x="-11" y="-26" width="22" height="31" rx="3" fill={colors?.[i] ?? '#fff'} stroke={BLACK} strokeWidth="2.5" />
        </g>
      ))}
    </g>
  );
}

/** Mini cards for the wild draws, as [x, y, tilt], before scaling. */
const CLUSTERS: Partial<Record<Value, { scale: number; spots: [number, number, number][] }>> = {
  wild6: {
    scale: 0.82,
    spots: [[-26, -54, -8], [2, -50, 6], [-28, -16, 4], [2, -18, -6], [-26, 22, -4], [4, 18, 8]],
  },
  wild10: {
    scale: 0.62,
    spots: [
      [-22, -74, -6], [4, -72, 6],
      [-36, -40, 4], [-10, -42, -4], [16, -38, 6],
      [-38, -4, -6], [-12, -6, 4], [14, -2, -4],
      [-22, 32, 6], [4, 30, -6],
    ],
  },
  // Color Roulette: cards tossed every which way.
  roulette: {
    scale: 0.8,
    spots: [[-34, -44, -24], [2, -56, 14], [-16, -12, 38], [10, -14, -12], [-30, 22, 10], [4, 20, -30]],
  },
};

function NoMercyWild({ value }: { value: Value }) {
  const label = DRAW_LABELS[value];
  const cluster = CLUSTERS[value];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <rect width={W} height={H} rx="12" fill={BLACK} />
      <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill="#fff" />
      <g transform="translate(60 90)">
        {cluster && (
          <g transform={`scale(${cluster.scale})`}>
            {cluster.spots.map(([x, y, tilt], i) => <MiniCard key={i} x={x} y={y} rotate={tilt} fill={NM_WILD[i % 4]!} />)}
          </g>
        )}
        {(value === 'wildRev4' || value === 'wildRev8') && <ColorReverse />}
        {value === 'wildDiscardAll' && <g transform="translate(0 6) scale(0.95)"><DiscardFan colors={NM_WILD} /></g>}
        {!cluster && !['wildRev4', 'wildRev8', 'wildDiscardAll'].includes(String(value)) && <FourColorOval rx={30} ry={48} border={3} colors={NM_WILD} />}
      </g>
      <Corners>
        {label ? (
          <OutlinedText size={value === 'wild10' ? 19 : 22} fill="#fff" upright>{label}</OutlinedText>
        ) : value === 'wildDiscardAll' ? (
          <g transform="scale(0.4)"><DiscardFan colors={NM_WILD} /></g>
        ) : (
          <g transform="scale(0.62)">{[[-10, -12, 0], [2, -12, 1], [-10, 2, 2], [2, 2, 3]].map(([x, y, i]) => <rect key={i} x={x} y={y} width="10" height="12" rx="2" fill={NM_WILD[i!]} stroke={BLACK} strokeWidth="2" />)}</g>
        )}
      </Corners>
    </svg>
  );
}

/** Wild Reverse Draw 4: the two Reverse arrows, each in two colors. */
function ColorReverse() {
  const arrow = 'M-0.11 0.7 L-0.11 -0.1 L-0.28 -0.1 L0 -0.62 L0.28 -0.1 L0.11 -0.1 L0.11 0.7 Z';
  return (
    <g transform="scale(44) rotate(45)" stroke={BLACK} strokeWidth="0.05" strokeLinejoin="round">
      <path d={arrow} transform="translate(-0.3 -0.08)" fill={CARD_COLORS.red} />
      <path d={arrow} transform="translate(0.3 0.08) rotate(180)" fill={CARD_COLORS.blue} />
      <circle cx="-0.3" cy="0.5" r="0.12" fill={CARD_COLORS.yellow} />
      <circle cx="0.3" cy="-0.5" r="0.12" fill={CARD_COLORS.green} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Giant UNO's blank wild cards, with the host's writing on them.

/** Splits writing into at most three short lines to fit the oval. */
function wrapWriting(text: string): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= 10) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length <= 3 ? lines : [...lines.slice(0, 2), lines.slice(2).join(' ')];
}

function BlankWildArt({ title }: { title: string }) {
  const lines = wrapWriting(title);
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(17, 112 / Math.max(longest, 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={BLACK} />
      <ellipse cx="60" cy="90" rx="40" ry="64" transform={OVAL_TILT} fill="#fffdf4" stroke="#fff" strokeWidth="3" />
      {/* Ruled lines, like a card made for writing on. */}
      <g stroke="#9ec5ff" strokeWidth="0.8" opacity="0.7">
        {[70, 84, 98, 112].map((y) => <line key={y} x1="30" x2="90" y1={y} y2={y} />)}
      </g>
      <g transform="translate(60 90) rotate(-8)">
        {lines.map((line, i) => (
          <text
            key={i} x="0" y={(i - (lines.length - 1) / 2) * size * 1.15 + size * 0.35}
            textAnchor="middle" fontSize={size} className="card__writing" fill="#1f3c88"
          >
            {line}
          </text>
        ))}
      </g>
      <Corners><FourColorOval rx={7} ry={11} border={1.5} colors={LIGHT_WILD} /></Corners>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// UNO All Wild: every card is a wild, with its action drawn in white on the four-color oval.

function AllWildArt({ value }: { value: Value }) {
  const label = value === 'wild2' || value === 'wildTarget2' ? '+2' : value === 'wild4' ? '+4' : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card__svg">
      <Frame face={BLACK} />
      <g transform="translate(60 90)"><FourColorOval rx={40} ry={64} border={4} colors={LIGHT_WILD} /></g>
      <AllWildCenter value={value} />
      <Corners>
        {value === 'wild' ? (
          <FourColorOval rx={7} ry={11} border={1.5} colors={LIGHT_WILD} />
        ) : label && value !== 'wildTarget2' ? (
          <OutlinedText size={22} fill="#fff">{label}</OutlinedText>
        ) : (
          <g transform="scale(10)"><AllWildSymbol value={value} /></g>
        )}
      </Corners>
    </svg>
  );
}

function AllWildCenter({ value }: { value: Value }) {
  if (value === 'wild') return null;
  if (value === 'wild2' || value === 'wild4') {
    return <g transform="translate(60 90)"><OutlinedText size={52} fill="#fff" shadow>{value === 'wild2' ? '+2' : '+4'}</OutlinedText></g>;
  }
  if (value === 'wildTarget2') {
    return (
      <>
        <g transform="translate(60 80) scale(28)"><AllWildSymbol value={value} /></g>
        <g transform="translate(60 128)"><OutlinedText size={26} fill="#fff">+2</OutlinedText></g>
      </>
    );
  }
  return <g transform="translate(60 90) scale(30)"><AllWildSymbol value={value} /></g>;
}

/** White symbols with a black outline, in a unit box centered on (0, 0). */
function AllWildSymbol({ value }: { value: Value }) {
  if (value === 'wildSkip') return <ActionSymbol value="skip" fill="#fff" outline />;
  if (value === 'wildReverse') return <ActionSymbol value="reverse" fill="#fff" outline />;
  if (value === 'wildSkip2') {
    // Two Skips, one for each player who misses out.
    return (
      <>
        <g transform="translate(-0.32 -0.3) scale(0.68)"><ActionSymbol value="skip" fill="#fff" outline /></g>
        <g transform="translate(0.32 0.3) scale(0.68)"><ActionSymbol value="skip" fill="#fff" outline /></g>
      </>
    );
  }
  if (value === 'wildTarget2') {
    // Crosshairs: you pick who it hits.
    const sight = (color: string, width: number) => (
      <g fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
        <circle r="0.58" />
        <circle r="0.2" />
        <path d="M 0 -0.92 V -0.4 M 0 0.4 V 0.92 M -0.92 0 H -0.4 M 0.4 0 H 0.92" />
      </g>
    );
    return <>{sight(BLACK, 0.3)}{sight('#fff', 0.15)}</>;
  }
  if (value === 'wildSwap') {
    // Two arrows trading places.
    const arrow = 'M -0.7 -0.42 H 0.35 V -0.62 L 0.78 -0.3 L 0.35 0.02 V -0.18 H -0.7 Z';
    return (
      <g fill="#fff" stroke={BLACK} strokeWidth="0.07" strokeLinejoin="round">
        <path d={arrow} />
        <path d={arrow} transform="rotate(180)" />
      </g>
    );
  }
  return null;
}
