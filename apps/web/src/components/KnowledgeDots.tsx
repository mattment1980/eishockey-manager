export function KnowledgeDots({ level }: { level: number }) {
  const text = ['', 'kaum bekannt (nur grober Eindruck)', 'grob bekannt (Kategorien)', 'gut bekannt (Wertespannen)', 'genau bekannt (exakte Werte)'][level] ?? '';
  return (
    <span className="kdots" aria-label={`Kenntnisstufe ${level} von 4`} data-tip={`Scouting-Kenntnis ${level} von 4: ${text}`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= level ? 'on' : ''} />)}
    </span>
  );
}
