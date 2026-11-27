import { useId } from 'react';
import type { Club } from '@ehm/schema';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Prozedural erzeugtes Vereinswappen aus Farben, Form und Kürzel. */
export function Crest({ club, size = 40 }: { club: Pick<Club, 'id' | 'shortName' | 'colors'>; size?: number }) {
  const h = hash(club.id);
  const shape = h % 3;
  const pattern = (h >> 3) % 4;
  const { primary, secondary } = club.colors;
  const uid = useId().replace(/:/g, '');
  const clipId = `crest-${club.id}-${uid}`;
  const outline =
    shape === 0
      ? 'M50 4 L92 16 L88 58 Q80 86 50 98 Q20 86 12 58 L8 16 Z'
      : shape === 1
        ? 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z'
        : 'M50 4 A46 46 0 1 1 49.9 4 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={`Wappen ${club.shortName}`} role="img">
      <defs>
        <clipPath id={clipId}>
          <path d={outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="100" height="100" fill={primary} />
        {pattern === 0 && <rect x="0" y="38" width="100" height="18" fill={secondary} />}
        {pattern === 1 && <path d="M0 100 L100 0 L100 22 L22 100 Z" fill={secondary} />}
        {pattern === 2 && (
          <>
            <rect x="20" y="0" width="12" height="100" fill={secondary} />
            <rect x="68" y="0" width="12" height="100" fill={secondary} />
          </>
        )}
        {pattern === 3 && <path d="M0 0 L50 30 L100 0 L100 14 L50 44 L0 14 Z" fill={secondary} />}
      </g>
      <path d={outline} fill="none" stroke={secondary} strokeWidth="5" />
      <text
        x="50" y={pattern === 0 ? 56 : 60} textAnchor="middle" fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
        fontWeight="800" fontSize="25" fill="#fff" stroke={primary} strokeWidth="3" paintOrder="stroke"
      >
        {club.shortName}
      </text>
    </svg>
  );
}
