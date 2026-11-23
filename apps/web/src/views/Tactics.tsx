import type { Tactics } from '@ehm/schema';
import { DEFAULT_TACTICS } from '@ehm/schema';
import { useStore } from '../store.tsx';
import { TACTIC_OPTIONS } from '../labels.ts';

export function TacticsView() {
  const { club, setMatchplan } = useStore();
  const plan = club?.matchplan;
  if (!plan) return null;
  const t = plan.tactics;
  const update = <K extends keyof Tactics>(k: K, v: Tactics[K]) => setMatchplan({ ...plan, tactics: { ...t, [k]: v } });

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Taktik</h2>
        <button className="btn ghost" onClick={() => setMatchplan({ ...plan, tactics: { ...DEFAULT_TACTICS } })}>Zurücksetzen</button>
      </div>
      <p className="muted small">Gilt für das 5-gegen-5. Coaching-Regeln und Matchups folgen in einem späteren Meilenstein.</p>
      {(Object.keys(TACTIC_OPTIONS) as (keyof Tactics)[]).map((k) => {
        const def = TACTIC_OPTIONS[k];
        const current = def.options.find((o) => o.value === t[k]);
        return (
          <section key={k} className="card">
            <h3>{def.title}</h3>
            <div className="segmented">
              {def.options.map((o) => (
                <button key={String(o.value)} className={t[k] === o.value ? 'on' : ''} onClick={() => update(k, o.value as Tactics[typeof k])}>
                  {o.label}
                </button>
              ))}
            </div>
            {current && <p className="muted small hint">{current.hint}</p>}
          </section>
        );
      })}
    </div>
  );
}
