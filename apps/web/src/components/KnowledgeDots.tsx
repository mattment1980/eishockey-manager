export function KnowledgeDots({ level }: { level: number }) {
  return (
    <span className="kdots" aria-label={`Kenntnisstufe ${level} von 4`} title={`Kenntnisstufe ${level} von 4`}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= level ? 'on' : ''} />)}
    </span>
  );
}
