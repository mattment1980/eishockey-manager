import type { PlayerView } from '@ehm/core';

function Stars({ value }: { value: number }) {
  return (
    <span className="stars" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={value >= i ? 'full' : value >= i - 0.5 ? 'half' : ''} />)}
    </span>
  );
}

const fmt = (n: number) => String(n).replace('.', ',');

/** Talent in Sternen – exakt, als Spanne oder unbekannt (je nach Scouting) */
export function Talent({ view, compact }: { view: PlayerView['talent']; compact?: boolean }) {
  const tip = 'Talent: wie weit sich der Spieler entwickeln kann (Obergrenze). Talentierte Spieler entwickeln sich zudem schneller. Je besser gescoutet, desto genauer die Einschätzung.';
  if ('stars' in view) return <span className="talent" data-tip={`${tip} Exakt bekannt: ${fmt(view.stars)} von 5 Sternen.`}><Stars value={view.stars} />{!compact && <small>{fmt(view.stars)}</small>}</span>;
  if ('range' in view) {
    const [lo, hi] = view.range;
    return <span className="talent fuzzy" data-tip={`${tip} Einschätzung der Scouts: ${fmt(lo)} bis ${fmt(hi)} Sterne.`}><Stars value={(lo + hi) / 2} /><small>{fmt(lo)}–{fmt(hi)}</small></span>;
  }
  return <span className="talent unknown" data-tip={`${tip} Noch unbekannt – Spieler scouten.`}><Stars value={0} /><small>?</small></span>;
}
