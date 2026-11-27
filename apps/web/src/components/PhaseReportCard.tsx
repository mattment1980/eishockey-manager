import type { PhaseReport } from '@ehm/schema';
import { overall, toDisplay1 } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerName } from './Names.tsx';

const MAX_NAMES = 5;

/** Kurzbericht einer Phase der Sommerpause: Überschrift, bewertete Zeilen, Hinweise */
export function PhaseReportCard({ title, report }: { title: string; report: PhaseReport }) {
  const { byId } = useStore();
  return (
    <section className={`card phase-report tone-${report.tone}`}>
      <div className="muted small">{title}</div>
      <h3>{report.headline}</h3>
      <dl className="pr-lines">
        {report.lines.map((l) => {
          const ps = (l.players ?? []).map((id, i) => ({ p: byId.get(id), tag: l.tags?.[i] })).filter((x) => x.p);
          return (
            <div key={l.label} className="pr-line">
              <dt>{l.label}</dt>
              <dd>
                {l.value && <b className={`pr-val t-${l.tone}`}>{l.value}</b>}
                {l.note && <span className="muted small">{l.note}</span>}
                {ps.length > 0 && (
                  <span className="pr-players small">
                    {ps.slice(0, MAX_NAMES).map(({ p, tag }, i) => (
                      <span key={p!.id}>{i > 0 && ', '}<PlayerName p={p!} /> <span className="muted">{tag ?? toDisplay1(overall(p!)).toFixed(1).replace('.', ',')}</span></span>
                    ))}
                    {ps.length > MAX_NAMES && <span className="muted"> und {ps.length - MAX_NAMES} weitere</span>}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {report.notes.length > 0 && <ul className="pr-notes small">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </section>
  );
}
