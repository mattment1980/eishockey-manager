import type { Player } from '@ehm/schema';
import { overall, effectiveRating, toDisplay1, CATEGORY, type PlayerView } from '@ehm/core';
import { fmt1 } from '../format.ts';

/** Gesamtstärke nach Scouting-Kenntnis */
export function OverallBadge({ v }: { v: PlayerView }) {
  const o = v.overall;
  if ('exact' in o) return <span className="rating" data-tip="Gesamtstärke auf der Position (1–20)">{o.exact}</span>;
  if ('range' in o) return <span className="rating range-badge" data-tip="Gesamtstärke laut Scouts (Spanne)">{o.range[0]}–{o.range[1]}</span>;
  if ('category' in o) return <span className="rating cat-badge" data-tip="Grobe Einschätzung der Scouts">{o.category}</span>;
  return <span className="rating" data-tip="Stärke unbekannt">?</span>;
}

/** Sortierwert aus der Schätzung (exakt, Spannenmitte oder Kategorie) */
export function viewSortValue(v: PlayerView): number {
  const o = v.overall;
  if ('exact' in o) return o.exact;
  if ('range' in o) return (o.range[0] + o.range[1]) / 2;
  if ('category' in o) return 5 + CATEGORY.indexOf(o.category as (typeof CATEGORY)[number]) * 3;
  return 0;
}

/** Eigener Spieler: Grundstärke mit Nachkommastelle */
export function RatingBadge({ p, base }: { p: Player; base?: number }) {
  const b = base ?? overall(p);
  return <span className="rating" data-tip="Grundstärke auf der Position (1–20, ohne Form, Moral und Fitness)">{fmt1(toDisplay1(b))}</span>;
}

/** Aktuelle Stärke (Fitness, Form, Moral) mit Pfeil gegenüber dem Grundwert */
export function EffectiveBadge({ p, base }: { p: Player; base?: number }) {
  const b = base ?? overall(p);
  const eff = toDisplay1(effectiveRating(p, b));
  const diff = Math.round((eff - toDisplay1(b)) * 10) / 10;
  const cls = diff >= 0.2 ? 'up' : diff <= -0.2 ? 'down' : '';
  return (
    <span className={`rating eff ${cls}`} data-tip={`Aktuelle Stärke ${fmt1(eff)} – Grundwert ${fmt1(toDisplay1(b))}, angepasst um Fitness ${Math.round(p.condition.fitness)} %, Form ${Math.round(p.condition.form)} und Moral ${Math.round(p.condition.morale)}. Das bringt der Spieler zu Spielbeginn aufs Eis.`}>
      {fmt1(eff)}{cls === 'up' ? '▲' : cls === 'down' ? '▼' : ''}
    </span>
  );
}

/** Kleine Fitness-Anzeige */
export function FitnessBar({ value }: { value: number }) {
  const cls = value >= 92 ? '' : value >= 82 ? 'warn' : 'bad';
  return <span className={`fitbar ${cls}`} data-tip={`Fitness zum nächsten Spiel: ${Math.round(value)} % – sinkt mit Eiszeit und dichtem Spielplan, erholt sich an freien Tagen`}><i style={{ width: `${value}%` }} /></span>;
}
