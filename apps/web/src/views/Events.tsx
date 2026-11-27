import { useState } from 'react';
import type { Player } from '@ehm/schema';
import { TERMINE, openSponsorTermine, eventCtx, terminBlocked, terminSlots, pendingCtx, wear, MOOD_LABEL, SPONSOR_LABEL, formatDate, type EventCategory, type TerminDef } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerName } from '../ui.tsx';
import { euro } from '../labels.ts';

const CAT_LABEL: Record<EventCategory, string> = { team: 'Mannschaft', economy: 'Wirtschaft', fans: 'Fans' };
const CAT_ORDER: EventCategory[] = ['team', 'economy', 'fans'];

/** Termine der anstehenden Woche planen – jeder ersetzt eine Trainingseinheit */
export function TerminPlanner({ games, date }: { games: number; date: string }) {
  const { world, club, players, setTermine } = useStore();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<EventCategory>('team');
  if (!club) return null;
  const plan = club.events.plan;
  const slots = terminSlots(games);
  const ctx = eventCtx(world, club.id, date);
  const remove = (i: number) => setTermine(plan.filter((_, j) => j !== i));
  const add = (def: TerminDef, extra: { option?: string; subject?: string } = {}) => { setTermine([...plan, { id: def.id, ...extra }]); setOpen(false); };
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <div className="week-termine">
      <div className="row-between">
        <strong className="small">Termine ({plan.length}/{slots})</strong>
        {plan.length < slots && <button className="btn ghost small" onClick={() => setOpen(!open)}>{open ? 'Schließen' : 'Termin planen'}</button>}
      </div>
      {plan.length === 0 && !open && <p className="muted small">Keine Termine – volle Trainingswoche. Jeder Termin ersetzt eine Trainingseinheit.</p>}
      {openSponsorTermine(club, world.season) > 0 && <p className="small">Sponsoren warten noch auf <b>{openSponsorTermine(club, world.season)} Pflichttermine</b> in dieser Saison – „Sponsorenabend“ und „Werbedreh“ zählen dafür.</p>}
      {plan.map((e, i) => {
        const def = TERMINE.find((t) => t.id === e.id);
        const subj = e.subject ? byId.get(e.subject) : undefined;
        return (
          <div key={i} className="termin-row">
            <span className={`tag cat-${def?.category}`}>{def ? CAT_LABEL[def.category] : ''}</span>
            <span><b>{def?.label}</b>{e.option ? ` (${def?.options?.find((o) => o.id === e.option)?.label})` : ''}{subj && <> mit <PlayerName p={subj} /></>}</span>
            <span className="muted small">statt einer Trainingseinheit</span>
            <button className="btn ghost small" onClick={() => remove(i)} aria-label="Termin entfernen">✕</button>
          </div>
        );
      })}
      {open && (
        <div className="termin-picker">
          <div className="segmented small-seg">
            {CAT_ORDER.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{CAT_LABEL[c]}</button>)}
          </div>
          <ul className="termin-list">
            {TERMINE.filter((t) => t.category === cat).map((t) => {
              const blocked = plan.some((p) => p.id === t.id) ? 'schon geplant' : terminBlocked(t, ctx);
              const k = wear(ctx, t.id);
              return (
                <li key={t.id} className={blocked ? 'blocked' : ''}>
                  <div>
                    <b>{t.label}</b>{t.cost ? <span className="muted small"> · {euro(t.cost)}</span> : null}
                    {k < 1 && !blocked && <span className="tag" data-tip="Kürzlich schon gemacht – die Wirkung ist geringer">abgenutzt</span>}
                    <div className="small"><span className="pro">+ {t.pros}</span></div>
                    <div className="small"><span className="con">− {t.cons}</span></div>
                    {blocked && <div className="small muted">{blocked}</div>}
                  </div>
                  <TerminAdd def={t} disabled={!!blocked} players={players} onAdd={(x) => add(t, x)} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function TerminAdd({ def, disabled, players, onAdd }: { def: TerminDef; disabled: boolean; players: Player[]; onAdd: (x: { option?: string; subject?: string }) => void }) {
  const { world, club } = useStore();
  if (disabled) return null;
  if (def.options) return <div className="btn-row">{def.options.map((o) => <button key={o.id} className="btn small primary" onClick={() => onAdd({ option: o.id })}>{o.label}</button>)}</div>;
  if (def.subject && club) {
    const ctx = eventCtx(world, club.id, world.date);
    const cands = players.filter((p) => def.subject!(p, ctx)).sort((a, b) => a.condition.morale - b.condition.morale);
    return (
      <select className="select" value="" onChange={(e) => e.target.value && onAdd({ subject: e.target.value })} aria-label="Spieler wählen">
        <option value="">Spieler wählen …</option>
        {cands.map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} (Moral {Math.round(p.condition.morale)})</option>)}
      </select>
    );
  }
  return <button className="btn small primary" onClick={() => onAdd({})}>Planen</button>;
}

/** Offenes Zufallsereignis mit Antwortmöglichkeiten */
export function PendingEventCard() {
  const { world, club, decideEvent } = useStore();
  if (!club) return null;
  const pc = pendingCtx(world, club.id);
  if (!pc) return null;
  const { def, ctx } = pc;
  return (
    <section className="card event-card">
      <div className="muted small">{CAT_LABEL[def.category]} · Entscheidung gefragt</div>
      <h3>{def.title(ctx)}</h3>
      <p>{def.text(ctx)}</p>
      {(ctx.subject || ctx.subject2) && (
        <p className="small">Betroffen: {[ctx.subject, ctx.subject2].filter(Boolean).map((p, i) => <span key={p!.id}>{i > 0 && ', '}<PlayerName p={p!} /></span>)}</p>
      )}
      <div className="event-options">
        {def.options.map((o) => (
          <button key={o.id} className="btn event-option" onClick={() => decideEvent(o.id)}>
            <b>{o.label}</b>
            <span className="small muted">{o.hint}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Ohne Entscheidung wählt der Co-Trainer: „{def.options.find((o) => o.id === def.fallback)?.label}“.</p>
    </section>
  );
}

/** Die letzten Termine und Ereignisse */
export function EventLogCard({ max = 5 }: { max?: number }) {
  const { club } = useStore();
  if (!club || !club.events.log.length) return null;
  return (
    <section className="card">
      <h3>Vereinsleben</h3>
      <ul className="event-log">
        {club.events.log.slice(0, max).map((e, i) => (
          <li key={i} className={`tone-${e.tone}`}>
            <span className="muted small">{formatDate(e.date)}</span>
            <span><b>{e.title}</b> – {e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Fanstimmung und Sponsorenzufriedenheit als Kennzahlen */
export function MoodKpis() {
  const { club } = useStore();
  if (!club) return null;
  const { fans, sponsors } = club.mood;
  return (
    <>
      <div className="kpi" data-tip="Fanstimmung (0–100): wirkt auf die Zuschauerzahl (bis ±10 % der Halle). Steigt mit Siegen und Fan-Aktionen."><span>Fans</span><strong>{MOOD_LABEL(fans)} ({Math.round(fans)})</strong></div>
      <div className="kpi" data-tip="Sponsorenzufriedenheit (0–100): wirkt auf die Sponsoreneinnahmen (bis ±8 %). Folgt der Fanstimmung, steigt mit Sponsorenterminen."><span>Sponsoren</span><strong>{SPONSOR_LABEL(sponsors)} ({Math.round(sponsors)})</strong></div>
    </>
  );
}
