import { fmt1 } from '../format.ts';

/** Entwicklung seit Saisonbeginn als Pfeil (Wert in interner Skala; ab 0,3 Anzeigepunkten sichtbar) */
export function DevArrow({ delta, always, tip }: { delta: number | undefined; always?: boolean; tip?: string }) {
  if (delta === undefined) return null;
  const d = delta / 10;
  if (!always && Math.abs(d) < 0.3) return null;
  const cls = d >= 0.3 ? 'up' : d <= -0.3 ? 'down' : 'flat';
  return (
    <span className={`devarrow ${cls}`} data-tip={tip ?? `Seit Saisonbeginn ${d >= 0 ? '+' : ''}${fmt1(d)}`}>
      {cls === 'up' ? '▲' : cls === 'down' ? '▼' : '•'}{Math.abs(d) >= 0.05 ? fmt1(Math.abs(d)) : ''}
    </span>
  );
}

/** Kleiner Verlauf der Gesamtstärke (ein Punkt je Monat) */
export function DevSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 160, h = 34;
  const lo = Math.min(...values) - 2, hi = Math.max(...values) + 2;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - lo) / (hi - lo)) * h}`).join(' ');
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Verlauf der Gesamtstärke">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
