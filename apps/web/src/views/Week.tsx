import type { Fixture } from '@ehm/schema';
import { injuryStatus, injuryLabel, prognosisText, daysBetween, weekStatus, weekEffect, rosterAverages, teamStrength, regularTable, INTENSITY, FOCUS, loadLabel, coachPlan, individualFor, formatDate, addDays } from '@ehm/core';
import { useStore } from '../store.tsx';
import { ClubName, PlayerName } from '../ui.tsx';
import { FormStrip } from '../components/FormStrip.tsx';

const d1 = (v: number) => v.toFixed(1).replace('.', ',');
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${d1(Math.abs(v))}`;

/** Wochenablauf im Reiter Spieltag: Rückblick, anstehende Spiele, Training, „Woche starten“ */
export function WeekPanel({ onTraining }: { onTraining: () => void }) {
  const { world, club, players, startWeek, simulating } = useStore();
  if (!club) return null;
  const st = weekStatus(world, club.id);
  if (!st) return null;
  const t = club.training;
  const last = t.week && t.week.start < st.start ? t.week : null;
  const now = rosterAverages(players);

  if (st.started && t.week) {
    // Woche läuft: Training ist erledigt
    const b = t.week.before;
    return (
      <>
      <section className="card week-card running">
        <div className="row-between">
          <h3>Woche ab {formatDate(st.start)}</h3>
          <span className="tag pos">Training erledigt</span>
        </div>
        <p className="small">
          {t.week.byCoach ? 'Plan des Co-Trainers' : 'Dein Plan'}: {t.week.units.map((u) => `${FOCUS[u.focus].short} (${INTENSITY[u.intensity].label.toLowerCase()})`).join(' · ')}
          <span className="muted"> · Belastung {loadLabel(t.week.load)}</span>
        </p>
        {b && <p className="small muted">Fitness Ø {d1(b.fitness)} → {d1(now.fitness)} · Moral Ø {d1(b.morale)} → {d1(now.morale)}</p>}
        <WeekGames fixtures={st.fixtures} />
      </section>
      <InjuryCard />
      </>
    );
  }

  if (!st.needsStart) return null;
  const units = t.plan ?? coachPlan(world, club, st.start);
  const games = st.fixtures.length;
  const eff = players.map((p) => weekEffect(p, units, games, false));
  const avg = (k: 'fitness' | 'morale') => (eff.length ? eff.reduce((s, e) => s + e[k], 0) / eff.length : 0);
  const load = units.reduce((s, u) => s + INTENSITY[u.intensity].load, 0);
  const indiv = individualFor(world, club, st.start);
  const byId = new Map(players.map((p) => [p.id, p]));

  return (
    <>
      {last && <WeekReview start={last.start} before={last.before} now={now} />}
      <InjuryCard />
      <section className="card week-card">
        <div className="muted small">Neue Woche</div>
        <h3>Woche ab {formatDate(st.start, true)} · {games === 1 ? '1 Spiel' : `${games} Spiele`}</h3>
        <WeekGames fixtures={st.fixtures} />
        <div className="week-training">
          <div className="row-between">
            <strong className="small">Training {t.plan ? '(dein Plan)' : '(Co-Trainer)'}</strong>
            <button className="btn ghost small" onClick={onTraining}>Training anpassen</button>
          </div>
          <div className="week-units">
            {units.map((u, i) => (
              <span key={i} className={`tag int-${u.intensity}`} data-tip={FOCUS[u.focus].text}>{FOCUS[u.focus].short} · {INTENSITY[u.intensity].label}</span>
            ))}
          </div>
          <p className="small muted">
            Belastung {loadLabel(load)} · Fitness {signed(avg('fitness'))} · Moral {signed(avg('morale'))}
            {indiv.length > 0 && <> · Einzeltraining: {indiv.map((x, i) => { const p = byId.get(x.playerId); return <span key={x.playerId}>{i > 0 && ', '}{p ? <PlayerName p={p} /> : '–'}</span>; })}</>}
          </p>
        </div>
        <button className="btn primary big block" onClick={startWeek} disabled={simulating}>Woche starten</button>
        <p className="muted small hint">Das Training der Woche wird ausgewertet, danach spielst du die Spieltage der Woche einzeln.</p>
      </section>
    </>
  );
}

/** Eigene Spiele einer Woche; bei offenen Spielen mit Tabellenplatz, Kaderstärke und Form des Gegners */
function WeekGames({ fixtures }: { fixtures: Fixture[] }) {
  const { world, club, clubById, byId } = useStore();
  if (!club || !fixtures.length) return null;
  const comp = world.competition!;
  const table = regularTable(world);
  const rank = (id: string) => table.findIndex((r) => r.clubId === id) + 1;
  const strength = (id: string) => { const c = clubById.get(id); return c?.matchplan ? teamStrength(c.matchplan, byId) : 0; };
  const mine = strength(club.id);
  return (
    <ul className="week-games">
      {fixtures.map((f) => {
        const home = f.home === club.id;
        const opp = clubById.get(home ? f.away : f.home)!;
        const r = f.result;
        const won = r ? (home ? r.score[0] > r.score[1] : r.score[1] > r.score[0]) : null;
        const s = strength(opp.id);
        const diff = (s - mine) / 10;
        return (
          <li key={f.id} className={r ? (won ? 'w' : 'l') : 'open'}>
            <span className="muted small">{formatDate(f.date, true)}</span>
            <span>{home ? 'gegen' : 'bei'} <ClubName c={opp} crest={16} /></span>
            <b>{r ? `${home ? r.score[0] : r.score[1]}:${home ? r.score[1] : r.score[0]}${r.decidedIn === 'OT' ? ' n.V.' : r.decidedIn === 'SO' ? ' n.P.' : ''}` : 'offen'}</b>
            {!r && (
              <span className="week-opp small">
                <span data-tip="Tabellenplatz nach der Hauptrunde bzw. aktuell">{rank(opp.id)}. Platz</span>
                <span className={diff >= 0.5 ? 'stronger' : diff <= -0.5 ? 'weaker' : ''} data-tip={`Kaderstärke der Aufstellung (1–20) – dein Team: ${d1(mine / 10)}`}>Stärke {d1(s / 10)}</span>
                <span className="week-form" data-tip="Die letzten 5 Spiele (ältestes links)"><FormStrip comp={comp} clubId={opp.id} /></span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Rückblick auf die abgelaufene Woche */
function WeekReview({ start, before, now }: { start: string; before?: { fitness: number; morale: number; form: number }; now: { fitness: number; morale: number; form: number } }) {
  const { world, club } = useStore();
  if (!club) return null;
  const end = addDays(start, 7);
  const games = world.competition!.fixtures.filter((f) => f.date >= start && f.date < end && (f.home === club.id || f.away === club.id) && f.result);
  const wins = games.filter((f) => (f.home === club.id ? f.result!.score[0] > f.result!.score[1] : f.result!.score[1] > f.result!.score[0])).length;
  const tone = !games.length ? '' : wins === games.length ? 'good' : wins === 0 ? 'bad' : 'mixed';
  const row = (label: string, a: number, b: number, tip: string) => (
    <div className="kpi" data-tip={tip}><span>{label}</span><strong className={b - a > 0.5 ? 'up' : b - a < -0.5 ? 'down' : ''}>{d1(a)} → {d1(b)}</strong></div>
  );
  return (
    <section className={`card week-review tone-${tone}`}>
      <div className="muted small">Rückblick · Woche ab {formatDate(start)}</div>
      <h3>{!games.length ? 'Spielfreie Woche' : wins === games.length ? `${games.length === 1 ? 'Sieg' : `${wins} Siege`} – eine perfekte Woche` : wins === 0 ? `${games.length === 1 ? 'Niederlage' : `${games.length} Niederlagen`} – eine Woche zum Abhaken` : `${wins} von ${games.length} Spielen gewonnen`}</h3>
      <WeekGames fixtures={games} />
      {before && (
        <div className="kpis">
          {row('Fitness Ø', before.fitness, now.fitness, 'Kaderschnitt zu Wochenbeginn und heute (nach Training, Spielen und Erholung)')}
          {row('Moral Ø', before.morale, now.morale, 'Kaderschnitt zu Wochenbeginn und heute')}
          {row('Form Ø', before.form, now.form, 'Kaderschnitt zu Wochenbeginn und heute')}
        </div>
      )}
    </section>
  );
}

/** Lazarett: verletzte und angeschlagene Spieler, Rückkehrer */
export function InjuryCard() {
  const { world, club, players, setInjuryPlay } = useStore();
  if (!club?.matchplan) return null;
  const date = world.date;
  const hurt = players.filter((p) => injuryStatus(p, date) !== 'fit').sort((a, b) => (a.injury!.out < b.injury!.out ? -1 : 1));
  const plan = club.matchplan;
  const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
  const back = players.filter((p) => !p.injury && !dressed.has(p.id) && p.injuries.length > 0 && daysBetween(addDays(p.injuries.at(-1)!.date, p.injuries.at(-1)!.days), date) <= 10);
  if (!hurt.length && !back.length) return null;
  return (
    <section className="card injury-card">
      <h3>Lazarett <span className="muted small">{hurt.length === 0 ? 'alle fit' : hurt.length === 1 ? '1 Ausfall' : `${hurt.length} Ausfälle`}</span></h3>
      <ul className="injury-list">
        {hurt.map((p) => {
          const st = injuryStatus(p, date);
          const inj = p.injury!;
          return (
            <li key={p.id} className={st}>
              <span><PlayerName p={p} /> <span className="muted small">{p.position}</span></span>
              <span className="small">{injuryLabel(inj.kind)}{inj.relapses ? ` (Rückfall)` : ''}</span>
              <span className="small muted">{st === 'knock' ? 'angeschlagen' : 'verletzt'} · {prognosisText(inj, date)}</span>
              <span className="segmented small-seg inj-toggle" data-tip="Angeschlagen spielen: rund 4–5 % weniger Leistung und ein Rückfallrisiko. Gilt, sobald der Spieler angeschlagen ist.">
                <button className={!inj.play ? 'on' : ''} onClick={() => setInjuryPlay(p.id, false)}>Schonen</button>
                <button className={inj.play ? 'on' : ''} onClick={() => setInjuryPlay(p.id, true)}>{st === 'knock' ? 'Einsetzen' : 'Früh einsetzen'}</button>
              </span>
            </li>
          );
        })}
      </ul>
      {hurt.length > 0 && <p className="muted small">Ausfälle ersetzt der Co-Trainer automatisch in der Aufstellung. Wer eingesetzt werden darf, holst du unter „Reihen“ selbst zurück in die Aufstellung.</p>}
      {back.length > 0 && <p className="small">Wieder fit, aber nicht aufgestellt: {back.map((p, i) => <span key={p.id}>{i > 0 && ', '}<PlayerName p={p} /></span>)} – unter „Reihen“ zurückholen.</p>}
    </section>
  );
}
