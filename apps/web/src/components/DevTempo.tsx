import type { DevFactors } from '@ehm/core';

const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`;

export const tempoLabel = (f: DevFactors) => {
  if (f.age >= 30) return 'Abbau';
  if (f.gap < 3) return 'ausgereizt';
  const t = f.total;
  return t >= 1.3 ? 'sehr hoch' : t >= 1.1 ? 'hoch' : t >= 0.9 ? 'normal' : t >= 0.7 ? 'gebremst' : 'niedrig';
};

/** Entwicklungstempo mit Aufschlüsselung als Tooltip */
export function DevTempo({ f }: { f: DevFactors }) {
  const label = tempoLabel(f);
  const tip = label === 'ausgereizt'
    ? 'Der Spieler hat sein Potenzial ausgeschöpft – er hält sein Niveau, wächst aber kaum noch.'
    : f.age >= 30
    ? `Ab etwa 30 Jahren baut die Physis ab (Eislaufen, Beweglichkeit, Kraft, Ausdauer), später auch Technik. Mentale Werte halten am längsten. Professionalität bremst den Abbau.`
    : `Entwicklungstempo (Faktor ${f.total.toFixed(2).replace('.', ',')}): Talent ${pct(f.talent)}, Eiszeit ${pct(f.playtime)}, Trainer ${pct(f.coach)}, Mentor ${pct(f.mentor)}, Einstellung ${pct(f.personality)}. Wie schnell sich der Spieler seinem Potenzial nähert – junge Spieler entwickeln sich am stärksten.`;
  const cls = label === 'sehr hoch' || label === 'hoch' ? 'pos' : label === 'gebremst' || label === 'niedrig' || label === 'Abbau' ? 'neg' : '';
  return <span className={`tag ${cls}`} data-tip={tip}>{label}</span>;
}
