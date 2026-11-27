import type { TrainingUnit, TrainingFocus, TrainingIntensity, IndividualFocus, AutoPick, Player } from '@ehm/schema';
import { INDIVIDUAL_FOCI } from '@ehm/schema';
import {
  INTENSITY, INTENSITIES, FOCUS, TRAINING_FOCUS_ORDER, AUTO_PICK, coachPlan, individualFor, gamesInWeek, nextTrainingWeek,
  weekEffect, loadLabel, formatDate, addDays, toDisplay1, overall, ageOn, formLabel,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerName } from '../ui.tsx';

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1).replace('.', ',')}`;
const INDIV_LABEL: Record<IndividualFocus, string> = { athletics: 'Athletik', offense: 'Angriff', defense: 'Defensive', mental: 'Spielverständnis', goalies: 'Torhüter' };

/** Training: Wochenplan mit drei Schwerpunkten, Einzeltraining, Rückblick auf die letzte Woche */
export function TrainingView() {
  const { world, club, players, setTraining } = useStore();
  if (!club) return null;
  const t = club.training;
  const start = nextTrainingWeek(world, club);
  const games = gamesInWeek(world, club.id, start);
  const coach = coachPlan(world, club, start);
  const manual = !!t.plan;
  const units = t.plan ?? coach;
  const load = units.reduce((s, u) => s + INTENSITY[u.intensity].load, 0);

  // Vorschau: Durchschnitt über den Kader
  const eff = players.map((p) => weekEffect(p, units, games, false));
  const avg = (k: 'fitness' | 'morale') => (eff.length ? eff.reduce((s, e) => s + e[k], 0) / eff.length : 0);
  const hard = units.filter((u) => u.intensity === 'hard').length;
  const warnings: string[] = [];
  if (hard >= 3) warnings.push('Drei harte Einheiten: Die Spieler murren – die Moral sinkt deutlich.');
  else if (hard === 2) warnings.push('Zwei harte Einheiten: Das kostet etwas Moral.');
  if (games >= 3 && hard >= 1) warnings.push(`${games} Spiele in dieser Woche – eine harte Einheit zusätzlich schlaucht.`);
  if (units.some((u) => u.focus === 'goalies') && units.filter((u) => u.focus === 'goalies').length > 1) warnings.push('Mehr als eine Torhüter-Einheit bringt den Feldspielern wenig.');

  const setUnit = (i: number, patch: Partial<TrainingUnit>) => setTraining({ plan: units.map((u, j) => (j === i ? { ...u, ...patch } : u)) });

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Training</h2>
        <span className="muted small right">Woche ab {formatDate(start, true)} · {games === 0 ? 'spielfrei' : games === 1 ? '1 Spiel' : `${games} Spiele`}</span>
      </div>

      <section className="card">
        <div className="row-between">
          <h3>Wochenplan</h3>
          <div className="segmented tr-mode">
            <button className={!manual ? 'on' : ''} onClick={() => setTraining({ plan: null })} data-tip="Der Co-Trainer stellt jede Woche einen Plan nach Spielplan, Frische und Baustellen auf.">Co-Trainer plant</button>
            <button className={manual ? 'on' : ''} onClick={() => setTraining({ plan: coach })} data-tip="Eigenen Plan festlegen – als Ausgangspunkt dient der Vorschlag des Co-Trainers.">Selbst planen</button>
          </div>
        </div>
        {!manual && <p className="muted small">Vorschlag des Co-Trainers für diese Woche. Mit „Selbst planen“ kannst du ihn anpassen.</p>}
        <div className="tr-units">
          {units.map((u, i) => (
            <div key={i} className={`tr-unit int-${u.intensity}`}>
              <div className="tr-unit-head">
                <span className="tr-no">{i + 1}</span>
                {manual ? (
                  <select className="select" value={u.focus} onChange={(e) => setUnit(i, { focus: e.target.value as TrainingFocus })} aria-label={`Schwerpunkt ${i + 1}`}>
                    {TRAINING_FOCUS_ORDER.map((f) => <option key={f} value={f}>{FOCUS[f].label}</option>)}
                  </select>
                ) : <strong>{FOCUS[u.focus].label}</strong>}
              </div>
              <div className="muted small">{u.intensity === 'recovery' ? 'Regeneration: Auslaufen, Physio, Sauna – der Schwerpunkt ruht.' : FOCUS[u.focus].text}</div>
              {manual ? (
                <div className="segmented tr-int">
                  {INTENSITIES.map((it) => (
                    <button key={it} className={u.intensity === it ? 'on' : ''} onClick={() => setUnit(i, { intensity: it })} data-tip={intensityTip(it)}>{INTENSITY[it].label}</button>
                  ))}
                </div>
              ) : <span className={`tag tr-int-tag int-${u.intensity}`} data-tip={intensityTip(u.intensity)}>{INTENSITY[u.intensity].label}</span>}
            </div>
          ))}
        </div>
        {manual && (
          <label className="check small">
            <input type="checkbox" checked={t.keep} onChange={(e) => setTraining({ keep: e.target.checked })} />
            Plan jede Woche beibehalten (sonst übernimmt nach dieser Woche wieder der Co-Trainer)
          </label>
        )}
        <div className="kpis tr-kpis">
          <div className="kpi" data-tip="Summe der Intensitäten (hart 3, mittel 2, locker 1, Regeneration 0). Hohe Belastung bremst die Erholung zwischen den Spielen."><span>Belastung</span><strong>{loadLabel(load)} ({load}/9)</strong></div>
          <div className="kpi" data-tip="Durchschnittliche Veränderung der Fitness durch das Training dieser Woche (vor Erholung und Spielen)"><span>Fitness</span><strong className={avg('fitness') < -3 ? 'down' : avg('fitness') > 0 ? 'up' : ''}>{signed(avg('fitness'))}</strong></div>
          <div className="kpi" data-tip="Durchschnittliche Veränderung der Moral durch das Training dieser Woche"><span>Moral</span><strong className={avg('morale') < -0.5 ? 'down' : avg('morale') > 0.5 ? 'up' : ''}>{signed(avg('morale'))}</strong></div>
        </div>
        {warnings.map((w) => <p key={w} className="alert small">{w}</p>)}
      </section>

      <IndividualCard start={start} />
      <LastWeek />

      <section className="card">
        <h3>So wirkt das Training</h3>
        <ul className="small muted tr-help">
          <li><b>Athletik, Angriff, Defensive, Video, Torhüter:</b> lenken die Entwicklung auf die passenden Werte. Je härter und häufiger, desto schneller entwickeln sich die Spieler (bis etwa +15 %).</li>
          <li><b>Taktik, Über-/Unterzahl:</b> verbessern die Eingespieltheit der gewählten Systeme. <b>Reihen-Zusammenspiel:</b> stärkt die Chemie der aktuellen Reihen.</li>
          <li><b>Hart</b> kostet Frische und bremst die Erholung, zwei oder drei harte Einheiten drücken auf die Moral. <b>Locker</b> und <b>Regeneration</b> geben Frische und Moral zurück.</li>
          <li><b>Einzeltraining</b> beschleunigt die Entwicklung eines Spielers (bis +22 %) in seinem Schwerpunkt und tut der Moral gut.</li>
        </ul>
      </section>
    </div>
  );
}

function intensityTip(it: TrainingIntensity): string {
  const x = INTENSITY[it];
  return `${x.label}: Entwicklung ${Math.round(x.dev * 100)} %, Fitness ${signed(x.fitness)}, Moral ${signed(x.morale)} je Einheit`;
}

function IndividualCard({ start }: { start: string }) {
  const { world, club, players, setTraining } = useStore();
  if (!club) return null;
  const t = club.training;
  const fixed = t.individual.filter((x) => players.some((p) => p.id === x.playerId));
  const picks = individualFor(world, club, start);
  const autos = picks.filter((x) => x.auto);
  const byId = new Map(players.map((p) => [p.id, p]));
  const sorted = [...players].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const setFixed = (list: typeof fixed) => setTraining({ individual: list });

  const slot = (i: number) => {
    const f = fixed[i];
    if (f) {
      const p = byId.get(f.playerId)!;
      return (
        <div key={i} className="tr-indiv">
          <span className="tr-no">{i + 1}</span>
          <div className="tr-indiv-main">
            <PlayerName p={p} /> <span className="muted small">{p.position} · {ageOn(p.birthDate, world.date)} J. · {toDisplay1(overall(p)).toFixed(1).replace('.', ',')}</span>
          </div>
          <select className="select" value={f.focus} onChange={(e) => setFixed(fixed.map((x, j) => (j === i ? { ...x, focus: e.target.value as IndividualFocus } : x)))} aria-label="Schwerpunkt">
            {INDIVIDUAL_FOCI.filter((k) => (p.position === 'G' ? k !== 'offense' && k !== 'defense' : k !== 'goalies')).map((k) => <option key={k} value={k}>{INDIV_LABEL[k]}</option>)}
          </select>
          <button className="btn ghost" onClick={() => setFixed(fixed.filter((_, j) => j !== i))} data-tip="Platz freigeben – dann wählt der Co-Trainer">✕</button>
        </div>
      );
    }
    const a = autos[i - fixed.length];
    const ap = a ? byId.get(a.playerId) : undefined;
    return (
      <div key={i} className="tr-indiv auto">
        <span className="tr-no">{i + 1}</span>
        <div className="tr-indiv-main">
          {ap ? <><PlayerName p={ap} /> <span className="muted small">{INDIV_LABEL[a!.focus]} · Co-Trainer ({formLabel(ap.condition.form)})</span></> : <span className="muted small">frei</span>}
        </div>
        <select className="select" value="" onChange={(e) => { const p = byId.get(e.target.value); if (p) setFixed([...fixed, { playerId: p.id, focus: defaultFocus(p) }]); }} aria-label="Spieler festlegen">
          <option value="">Spieler festlegen …</option>
          {sorted.filter((p) => !fixed.some((x) => x.playerId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.lastName}, {p.firstName} ({p.position})</option>)}
        </select>
      </div>
    );
  };

  return (
    <section className="card">
      <h3>Einzeltraining</h3>
      <p className="muted small">Bis zu drei Spieler bekommen Extraschichten. Freie Plätze besetzt der Co-Trainer jede Woche neu.</p>
      <div className="tr-indivs">{[0, 1, 2].map(slot)}</div>
      {fixed.length < 3 && (
        <div className="field">
          <span className="small muted">Regel des Co-Trainers für freie Plätze</span>
          <div className="segmented">
            {(Object.keys(AUTO_PICK) as AutoPick[]).map((k) => (
              <button key={k} className={t.autoPick === k ? 'on' : ''} onClick={() => setTraining({ autoPick: k })} data-tip={AUTO_PICK[k].text}>{AUTO_PICK[k].label}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const defaultFocus = (p: Player): IndividualFocus => (p.position === 'G' ? 'goalies' : p.position === 'LD' || p.position === 'RD' ? 'defense' : 'offense');

function LastWeek() {
  const { club, byId } = useStore();
  const wk = club?.training.week;
  if (!wk) return null;
  return (
    <section className="card">
      <h3>Letzte Woche <span className="muted small">ab {formatDate(wk.start)} – {formatDate(addDays(wk.start, 6))}</span></h3>
      <p className="small">
        {wk.byCoach ? 'Plan des Co-Trainers' : 'Dein Plan'}: {wk.units.map((u) => `${FOCUS[u.focus].short} (${INTENSITY[u.intensity].label.toLowerCase()})`).join(' · ')}
        <span className="muted"> · Belastung {loadLabel(wk.load)} · {wk.games} {wk.games === 1 ? 'Spiel' : 'Spiele'}</span>
      </p>
      {wk.individual.length > 0 && (
        <p className="small">Einzeltraining: {wk.individual.map((x, i) => {
          const p = byId.get(x.playerId);
          return <span key={x.playerId}>{i > 0 && ', '}{p ? <PlayerName p={p} /> : '–'} <span className="muted">({INDIV_LABEL[x.focus]}{x.auto ? ', Co-Trainer' : ''})</span></span>;
        })}</p>
      )}
    </section>
  );
}
