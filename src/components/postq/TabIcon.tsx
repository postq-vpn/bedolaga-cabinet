import type { ReactNode } from 'react';

/**
 * Иконка раздела нижней панели, как в XKeenPQ-UI: контурная у обычного раздела,
 * залитая у выбранного. Обе лежат друг на друге и меняются с той же
 * длительностью и кривой, с какой едет подложка (postq.css, .rd-tab-icon), —
 * заливка «прибывает» вместе с ней.
 *
 * Формы — lucide (House, CreditCard, Headphones) с обводкой 2px; у залитой тот
 * же внешний край, вырезы — ровно пустые места контура.
 */
export type TabIconName = 'home' | 'card' | 'support';

export function TabIcon({ name, active }: { name: TabIconName; active: boolean }) {
  const { outline, filled } = ICONS[name];
  return (
    <span className="rd-tab-icon" data-active={active || undefined} aria-hidden>
      <svg className="rd-tab-icon__outline" {...SVG_PROPS}>
        <g {...STROKE}>{outline}</g>
      </svg>
      <span className="rd-tab-icon__filled">{filled}</span>
    </span>
  );
}

const SVG_PROPS = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none' } as const;
const STROKE = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Filled({ id, cutout, children }: { id: string; cutout?: ReactNode; children: ReactNode }) {
  return (
    <svg {...SVG_PROPS}>
      {cutout && (
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" />
          {cutout}
        </mask>
      )}
      <g mask={cutout ? `url(#${id})` : undefined} fill="currentColor" {...STROKE}>
        {children}
      </g>
    </svg>
  );
}

const HOUSE =
  'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const CUP_LEFT = 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
const CUP_RIGHT = 'M21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2z';

const ICONS: Record<TabIconName, { outline: ReactNode; filled: ReactNode }> = {
  home: {
    outline: (
      <>
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d={HOUSE} />
      </>
    ),
    // Проём двери со скруглённым верхом до земли, как у house.fill.
    filled: (
      <Filled
        id="rd-tab-home-cut"
        cutout={<path d="M9.5 23V14a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v9z" fill="black" />}
      >
        <path d={HOUSE} />
      </Filled>
    ),
  },
  card: {
    outline: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
    // Полоса карты внутри боковых краёв.
    filled: (
      <Filled id="rd-tab-card-cut" cutout={<rect x="3" y="9" width="18" height="2" fill="black" />}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
      </Filled>
    ),
  },
  support: {
    outline: (
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    ),
    // Залиты амбушюры, дуга остаётся линией.
    filled: (
      <Filled id="rd-tab-support">
        <path d={CUP_LEFT} />
        <path d={CUP_RIGHT} />
        <path d="M3 14v-2a9 9 0 0 1 18 0v2" fill="none" />
      </Filled>
    ),
  },
};
