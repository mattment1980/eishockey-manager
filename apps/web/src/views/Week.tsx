import type { Fixture, Club, TrainingUnit } from '@ehm/schema';
import {
  injuryStatus, injuryLabel, prognosisText, daysBetween, weekStatus, weekEffect, rosterAverages, teamStrength, regularTable,
  INTENSITY, FOCUS, loadLabel, coachPlan, individualFor, formatDate, addDays, terminDef, ACTIONS, actionBlocked, actionDef, homeGameForecast,
  type WeekStatus,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { ClubName, PlayerName } from '../ui.tsx';
import { Crest } from '../components/Crest.tsx';
import { FormStrip } from '../components/FormStrip.tsx';
import { TerminPlanner } from './Events.tsx';

const d1 = (v: number) => v.toFixed(1).replace('.', ',');
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${d1(Math.abs(v))}`;
const DAY = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
/** 23.11. */
export const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const score = (f: Fixture, clubId: string) => {
  const r = f.result!;
  const home = f.home === clubId;
  return `${home ? r.score[0] : r.score[1]}:${home ? r.score[1] : r.score[0]}${r.decidedIn === 'OT' ? ' n.V.' : r.decidedIn === 'SO' ? ' n.P.' : ''}`;
};
const won = (f: Fixture, clubId: string) => !!f.result && (f.home === clubId ? f.result.score[0] > f.result.score[1] : f.result.score[1] > f.result.score[0]);

/** Trainingseinheiten und Termine der Woche (vor dem Start: Planung, danach: was gelaufen ist) */
export function weekPlan(club: Club, st: WeekStatus, world: Parameters<typeof coachPlan>[0]): { units: TrainingUnit[]; termine: string[]; byCoach: boolean } {
  const t = club.training;
  if (st.started && t.week) {
    const end = addDays(st.start, 7);
    const termine = club.events.done.filter((d) => d.date >= st.start && d.date < end && terminDef(d.id)).map((d) => terminDef(d.id)!.label);
    return { units: t.week.units, termine, byCoach: t.week.byCoach };
  }
  const planned = club.events.plan.map((e) => terminDef(e.id)?.label ?? e.id);
  return { units: (t.plan ?? coachPlan(world, club, st.start)).slice(0, 3 - Math.min(2, planned.length)), termine: planned, byCoach: !t.plan };
}

/** Wochenstreifen Mo–So: Training, Termine, Spiele (Heimspiel mit Spieltagsaktion) */
export function WeekStrip({ st, next }: { st: WeekStatus; next: Fixture | null }) {
  const { world, club, clubById, setMatchdayAction } = useStore();
  if (!club) return null;
  const { units, termine } = weekPlan(club, st, world);
  const days = Array.from({ length: 7 }, (_, i) => addDays(st.start, i));
  const gameDay = new Map(st.fixtures.map((f) => [f.date, f]));
  // Training und Termine auf die spielfreien Tage verteilen (Reihenfolge wie im Plan)
  const items: { kind: 'unit' | 'termin'; label: string; cls: string; tip?: string }[] = [
    ...units.map((u) => ({ kind: 'unit' as const, label: FOCUS[u.focus].short, cls: `int-${u.intensity}`, tip: `${FOCUS[u.focus].label} · ${INTENSITY[u.intensity].label}` })),
    ...termine.map((l) => ({ kind: 'termin' as const, label: l, cls: 'termin' })),
  ];
  const free = days.filter((d) => !gameDay.has(d) && !gameDay.has(addDays(d, 1)));
  const slots = free.length >= items.length ? free : days.filter((d) => !gameDay.has(d));
  const onDay = new Map<string, typeof items>();
  items.forEach((it, i) => { const d = slots[Math.min(i, slots.length - 1)]; if (d) onDay.set(d, [...(onDay.get(d) ?? []), it]); });

  return (
    <div className="week-strip">
      {days.map((d, i) => {
        const f = gameDay.get(d);
        const past = d < world.date || (f && !!f.result);
        if (f) {
          const home = f.home === club.id;
          const opp = clubById.get(home ? f.away : f.home)!;
          const isNext = next?.id === f.id;
          const chosen = club.stadium.actions[f.id] ?? '';
          return (
            <div key={d} className={`wday game${isNext ? ' next' : ''}${f.result ? (won(f, club.id) ? ' w' : ' l') : ''}`}>
              <div className="wday-head"><b>{DAY[i]}</b><span className="muted">{dm(d)}</span></div>
              <div className="wday-opp">{home ? 'gegen' : 'bei'} <ClubName c={opp} crest={16} /></div>
              {f.result ? <div className="wday-res">{score(f, club.id)}</div> : isNext ? <div className="small accent">als Nächstes</div> : <div className="small muted">offen</div>}
              {home && !f.result && (
                <select className="wday-action" value={chosen} onChange={(e) => setMatchdayAction(f.id, e.target.value || null)} aria-label="Spieltagsaktion"
                  data-tip={chosen ? `${actionDef(chosen)?.pros} – Nachteil: ${actionDef(chosen)?.cons}` : 'Spieltagsaktion für dieses Heimspiel (Details unter Verein › Stadion)'}>
                  <option value="">Aktion: keine</option>
                  {ACTIONS.map((a) => { const why = actionBlocked(world, club, f, a); return <option key={a.id} value={a.id} disabled={!!why}>{a.label}{why ? ` – ${why}` : ''}</option>; })}
                </select>
              )}
              {home && f.result && (() => { const g = club.stadium.games.find((x) => x.fixtureId === f.id); return g ? <div className="small muted">{(g.attendance.standing + g.attendance.seated + g.attendance.business).toLocaleString('de-DE')} Zuschauer</div> : null; })()}
            </div>
          );
        }
        const its = onDay.get(d) ?? [];
        return (
          <div key={d} className={`wday${past ? ' past' : ''}`}>
            <div className="wday-head"><b>{DAY[i]}</b><span className="muted">{dm(d)}</span></div>
            {its.length ? its.map((it, k) => <span key={k} className={`tag ${it.cls}`} data-tip={it.tip}>{it.label}</span>) : <span className="small muted">frei</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Eine Zeile unter dem Streifen: Rückblick auf die Vorwoche bzw. Stand der laufenden Woche */
export function WeekInfo({ st }: { st: WeekStatus }) {
  const { world, club, players } = useStore();
  if (!club) return null;
  const t = club.training;
  const now = rosterAverages(players);
  if (st.started && t.week) {
    const b = t.week.before;
    return (
      <p className="week-info small">
        <span className="tag pos">Training erledigt</span> {t.week.byCoach ? 'Plan des Co-Trainers' : 'Dein Plan'} · Belastung {loadLabel(t.week.load)}
        {b && <span className="muted"> · Fitness Ø {d1(b.fitness)} → {d1(now.fitness)} · Moral Ø {d1(b.morale)} → {d1(now.morale)} · Form Ø {d1(b.form)} → {d1(now.form)}</span>}
      </p>
    );
  }
  const last = t.week && t.week.start < st.start ? t.week : null;
  if (!last) return null;
  const end = addDays(last.start, 7);
  const games = world.competition!.fixtures.filter((f) => f.date >= last.start && f.date < end && (f.home === club.id || f.away === club.id) && f.result);
  const wins = games.filter((f) => won(f, club.id)).length;
  const tone = !games.length ? '' : wins === games.length ? 'good' : wins === 0 ? 'bad' : 'mixed';
  const b = last.before;
  return (
    <p className={`week-info small tone-${tone}`}>
      <b>Vorwoche:</b> {games.length ? `${wins} von ${games.length} gewonnen (${games.map((f) => score(f, club.id)).join(', ')})` : 'spielfrei'}
      {b && <span className="muted"> · Fitness Ø {d1(b.fitness)} → {d1(now.fitness)} · Moral Ø {d1(b.morale)} → {d1(now.morale)} · Form Ø {d1(b.form)} → {d1(now.form)}</span>}
    </p>
  );
}

/** Wochenplanung vor dem Start: Training (mit Vorschau) und Termine nebeneinander */
export function WeekPlanning({ st, onTraining }: { st: WeekStatus; onTraining: () => void }) {
  const { world, club, players } = useStore();
  if (!club || !st.needsStart) return null;
  const { units, byCoach } = weekPlan(club, st, world);
  const games = st.fixtures.length;
  const eff = players.map((p) => weekEffect(p, units, games, false));
  const avg = (k: 'fitness' | 'morale') => (eff.length ? eff.reduce((s, e) => s + e[k], 0) / eff.length : 0);
  const load = units.reduce((s, u) => s + INTENSITY[u.intensity].load, 0);
  const indiv = individualFor(world, club, st.start);
  const byId = new Map(players.map((p) => [p.id, p]));
  return (
    <div className="cockpit-plan">
      <section className="card">
        <div className="row-between">
          <h3>Training <span className="muted small">{byCoach ? 'Co-Trainer' : 'dein Plan'}</span></h3>
          <button className="btn ghost small" onClick={onTraining}>Anpassen</button>
        </div>
        <div className="week-units">
          {units.map((u, i) => <span key={i} className={`tag int-${u.intensity}`} data-tip={FOCUS[u.focus].text}>{FOCUS[u.focus].short} · {INTENSITY[u.intensity].label}</span>)}
        </div>
        <p className="small muted">
          Belastung {loadLabel(load)} · Fitness {signed(avg('fitness'))} · Moral {signed(avg('morale'))}
          {indiv.length > 0 && <> · Einzeltraining: {indiv.map((x, i) => { const p = byId.get(x.playerId); return <span key={x.playerId}>{i > 0 && ', '}{p ? <PlayerName p={p} /> : '–'}</span>; })}</>}
        </p>
      </section>
      <section className="card"><TerminPlanner games={games} date={st.start} /></section>
    </div>
  );
}

/** Nächster Gegner kompakt */
export function NextGameTile({ fixture }: { fixture: Fixture | null }) {
  const { world, club, byId, clubById } = useStore();
  if (!club) return null;
  const comp = world.competition!;
  if (!fixture) return null;
  const home = clubById.get(fixture.home)!, away = clubById.get(fixture.away)!;
  const opp = home.id === club.id ? away : home;
  const sHome = teamStrength(home.matchplan!, byId), sAway = teamStrength(away.matchplan!, byId);
  const table = regularTable(world);
  const rank = (id: string) => table.findIndex((r) => r.clubId === id) + 1;
  const ser = comp.series.find((s) => s.id === fixture.seriesId);
  let head = `Spieltag ${fixture.day} · ${home.id === club.id ? 'Heimspiel' : 'Auswärts'}`;
  if (ser) {
    const [me, them] = ser.high === club.id ? [ser.winsHigh, ser.winsLow] : [ser.winsLow, ser.winsHigh];
    head = `${ser.roundName} · Spiel ${fixture.gameNo} · Serie ${me}:${them}`;
  }
  const fc = home.id === club.id ? homeGameForecast(world, fixture) : null;
  return (
    <section className="card tile">
      <h3>Nächstes Spiel</h3>
      <div className="muted small">{head} · {formatDate(fixture.date, true)}</div>
      <div className="tile-versus">
        <span className="vs-side"><Crest club={home} size={34} /><b>{home.shortName}</b><small className="muted">{rank(home.id)}.</small></span>
        <span className="vs-bars">
          <span data-tip="Kaderstärke der Aufstellung (1–20)">{d1(sHome / 10)}</span>
          <div className="duo"><div style={{ width: `${50 + (sHome - sAway) / 2}%` }} /></div>
          <span>{d1(sAway / 10)}</span>
        </span>
        <span className="vs-side"><Crest club={away} size={34} /><b>{away.shortName}</b><small className="muted">{rank(away.id)}.</small></span>
      </div>
      <div className="small row-between"><span className="muted">Form <ClubName c={opp} /></span><FormStrip comp={comp} clubId={opp.id} /></div>
      {fc && <div className="small muted">Prognose {fc.total.toLocaleString('de-DE')} Zuschauer ({Math.round(fc.fill * 100)} %){fc.derby ? ' · Derby' : ''}</div>}
    </section>
  );
}

/** Tabellenausschnitt rund um den eigenen Platz bzw. eigene Serie in der Nachsaison */
export function TableTile({ go }: { go: () => void }) {
  const { world, club, clubById } = useStore();
  if (!club) return null;
  const comp = world.competition!;
  if (comp.finalStandings) {
    const rounds = comp.series.filter((s) => !s.winner);
    const list = rounds.length ? rounds : comp.series.slice(-4);
    return (
      <section className="card tile">
        <div className="row-between"><h3>Nachsaison</h3><button className="btn ghost small" onClick={go}>Liga</button></div>
        <ul className="mini-table">
          {list.map((s) => (
            <li key={s.id} className={s.high === club.id || s.low === club.id ? 'me' : ''}>
              <span className="muted small">{s.roundName}</span>
              <span>{clubById.get(s.high)!.shortName} {s.winsHigh}:{s.winsLow} {clubById.get(s.low)!.shortName}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  const table = regularTable(world);
  const i = Math.max(0, table.findIndex((r) => r.clubId === club.id));
  const from = Math.max(0, Math.min(table.length - 5, i - 2));
  return (
    <section className="card tile">
      <div className="row-between"><h3>Tabelle</h3><button className="btn ghost small" onClick={go}>Ganze Tabelle</button></div>
      <ul className="mini-table">
        {table.slice(from, from + 5).map((r, k) => {
          const c = clubById.get(r.clubId)!;
          return (
            <li key={r.clubId} className={r.clubId === club.id ? 'me' : ''}>
              <span className="mt-rank">{from + k + 1}.</span>
              <span className="mt-club"><ClubName c={c} crest={16} /></span>
              <span className="muted small">{r.gp} Sp</span>
              <b>{r.pts}</b>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Kabine: Fitness, Moral, Form und Lazarett mit Schonen/Einsetzen */
export function SquadTile() {
  const { world, club, players, setInjuryPlay } = useStore();
  if (!club?.matchplan) return null;
  const date = world.date;
  const now = rosterAverages(players);
  const hurt = players.filter((p) => injuryStatus(p, date) !== 'fit').sort((a, b) => (a.injury!.out < b.injury!.out ? -1 : 1));
  const plan = club.matchplan;
  const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
  const back = players.filter((p) => !p.injury && !dressed.has(p.id) && p.injuries.length > 0 && daysBetween(addDays(p.injuries.at(-1)!.date, p.injuries.at(-1)!.days), date) <= 10);
  return (
    <section className={`card tile${hurt.length ? ' hurt' : ''}`}>
      <h3>Kabine</h3>
      <div className="tile-kpis small">
        <span><span className="muted">Fitness Ø</span> <b>{d1(now.fitness)}</b></span>
        <span><span className="muted">Moral Ø</span> <b>{d1(now.morale)}</b></span>
        <span><span className="muted">Form Ø</span> <b>{d1(now.form)}</b></span>
      </div>
      {hurt.length === 0 ? <p className="small muted">Lazarett leer – alle fit.</p> : (
        <ul className="mini-injuries">
          {hurt.map((p) => {
            const st = injuryStatus(p, date);
            const inj = p.injury!;
            return (
              <li key={p.id} className={st}>
                <span><PlayerName p={p} /> <span className="muted small">{injuryLabel(inj.kind)} · {prognosisText(inj, date)}</span></span>
                <span className="segmented small-seg inj-toggle" data-tip="Angeschlagen spielen: rund 4–5 % weniger Leistung und ein Rückfallrisiko. Ausfälle ersetzt der Co-Trainer automatisch.">
                  <button className={!inj.play ? 'on' : ''} onClick={() => setInjuryPlay(p.id, false)}>Schonen</button>
                  <button className={inj.play ? 'on' : ''} onClick={() => setInjuryPlay(p.id, true)}>{st === 'knock' ? 'Einsetzen' : 'Früh'}</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {back.length > 0 && <p className="small">Wieder fit, nicht aufgestellt: {back.map((p, i) => <span key={p.id}>{i > 0 && ', '}<PlayerName p={p} /></span>)}</p>}
    </section>
  );
}

export { weekStatus };
