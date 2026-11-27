import { useEffect, useMemo, useState } from 'react';
import type { TestDay } from '@ehm/schema';
import { ageOn, talentStars, playerView, youthOf, YOUTH } from '@ehm/core';
import { useStore } from '../../store.tsx';
import { Talent } from '../Talent.tsx';
import { OverallBadge } from '../Badges.tsx';
import { fmt1 } from '../../format.ts';
import { euro, POSITION_LABEL } from '../../labels.ts';
import { coachComment, youthComment, attrLabel } from './comments.ts';

type Line = TestDay['lines'][number];
type Step = { k: 'intro' } | { k: 'player'; i: number } | { k: 'summary' } | { k: 'youth'; i: number } | { k: 'end' };

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Zahl, die nach einer kurzen „Messung“ vom alten auf den neuen Wert zählt */
function Reveal({ from, to, onDone }: { from: number; to: number; onDone: () => void }) {
  const [v, setV] = useState(from);
  const [measuring, setMeasuring] = useState(!reduced());
  useEffect(() => {
    if (reduced()) { setV(to); onDone(); return; }
    let raf = 0;
    const t0 = performance.now() + 900;
    const tick = (t: number) => {
      if (t < t0) { raf = requestAnimationFrame(tick); return; }
      setMeasuring(false);
      const x = Math.min(1, (t - t0) / 1300);
      const e = 1 - Math.pow(1 - x, 3);
      setV(from + (to - from) * e);
      if (x < 1) raf = requestAnimationFrame(tick); else onDone();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);
  return (
    <div className={`td-number ${measuring ? 'measuring' : ''}`}>
      {fmt1(v / 10)}
      {measuring && <small>Messung läuft …</small>}
    </div>
  );
}

/**
 * Tag der Leistungstests: Der Trainer stellt nach dem Sommertraining Spieler für Spieler die Ergebnisse vor
 * (vom kleinsten zum größten Fortschritt), dann folgen Bilanz und die Vorstellung des Nachwuchsjahrgangs.
 */
export function TestDayShow({ onClose }: { onClose: () => void }) {
  const { world, club, byId, markTestDaySeen, signYouth, releaseYouth } = useStore();
  const td = world.offseason?.testDay;
  const [step, setStep] = useState<Step>({ k: 'intro' });
  const [revealed, setRevealed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const lines = useMemo(() => (td?.lines ?? []).filter((l) => byId.has(l.playerId)).sort((a, b) => a.after - a.before - (b.after - b.before)), [td, byId]);
  const youth = useMemo(() => (club ? youthOf(world, club.id).sort((a, b) => a.hidden.potential - b.hidden.potential) : []), [world, club]);
  const [youthIds] = useState(() => youth.map((p) => p.id));
  if (!td || !club) return null;
  const coach = world.staff.find((s) => s.contract?.clubId === club.id && s.role === 'assistantCoach') ?? world.staff.find((s) => s.contract?.clubId === club.id && s.role === 'headCoach');
  const coachName = coach ? `${coach.firstName} ${coach.lastName}` : 'Das Trainerteam';
  const season = world.offseason ? world.date.slice(0, 4) : '';
  const finish = () => { markTestDaySeen(); onClose(); };
  const go = (s: Step) => { setRevealed(false); setMsg(null); setStep(s); };
  const afterPlayers: Step = { k: 'summary' };
  const afterSummary: Step = youthIds.length ? { k: 'youth', i: 0 } : { k: 'end' };

  const top20 = (key: 'before' | 'after') => {
    const v = lines.map((l) => l[key]).sort((a, b) => b - a).slice(0, 20);
    return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  };

  let body: JSX.Element;
  if (step.k === 'intro') {
    body = (
      <div className="td-intro">
        <div className="td-kicker">Sommertraining {season}</div>
        <h2>Tag der Leistungstests</h2>
        <p>{coachName} hat den ganzen Kader durch die Tests geschickt: Eislaufen, Kraft, Technik, Spielverständnis. {lines.length} Spieler, {lines.length} Ergebnisse – wer hat im Sommer zugelegt, wer hat nachgelassen?</p>
        <p className="muted small">Die Ergebnisse kommen der Reihe nach, das Beste zum Schluss.</p>
        <div className="row-gap wrap center">
          <button className="btn primary big" onClick={() => go(lines.length ? { k: 'player', i: 0 } : afterPlayers)}>Los geht’s</button>
          <button className="btn ghost" onClick={() => go(afterPlayers)}>Gleich zur Bilanz</button>
        </div>
      </div>
    );
  } else if (step.k === 'player') {
    const l: Line = lines[step.i];
    const p = byId.get(l.playerId)!;
    const age = ageOn(p.birthDate, world.date);
    const d = (l.after - l.before) / 10;
    const ups = Object.entries(l.attrs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const downs = Object.entries(l.attrs).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 2);
    const last = step.i === lines.length - 1;
    body = (
      <div key={l.playerId} className={`td-player ${revealed ? (l.jump ? 'jump' : d >= 0.2 ? 'up' : d <= -0.2 ? 'down' : 'flat') : ''}`}>
        <div className="td-progress">{step.i + 1} / {lines.length}</div>
        <div className="td-who">
          <span className={`pos pos-${p.position}`}>{p.position}</span>
          <div>
            <h2>{p.firstName} {p.lastName}</h2>
            <div className="muted small">{POSITION_LABEL[p.position]} · {age} Jahre · Talent <Talent view={{ stars: talentStars(p.hidden.potential) }} compact /></div>
          </div>
        </div>
        <div className="td-stage">
          <div className="td-before"><small>vorher</small>{fmt1(l.before / 10)}</div>
          <Reveal from={l.before} to={l.after} onDone={() => setRevealed(true)} />
        </div>
        {revealed && (
          <div className="td-result">
            {l.jump && <div className="td-banner">Entwicklungssprung!</div>}
            <div className={`td-delta ${d >= 0.2 ? 'up' : d <= -0.2 ? 'down' : ''}`}>{d >= 0.05 ? '▲ +' : d <= -0.05 ? '▼ −' : '= '}{fmt1(Math.abs(d))}</div>
            <div className="td-chips">
              {ups.map(([k, v]) => <span key={k} className="chip top">{attrLabel(k)} +{fmt1(v / 10)}</span>)}
              {downs.map(([k, v]) => <span key={k} className="chip low">{attrLabel(k)} −{fmt1(-v / 10)}</span>)}
            </div>
            <blockquote className="td-quote">„{coachComment(p, l, age, `${l.playerId}:${season}`)}“<cite>– {coachName}</cite></blockquote>
          </div>
        )}
        <div className="row-gap wrap center">
          <button className="btn primary" disabled={!revealed} onClick={() => go(last ? afterPlayers : { k: 'player', i: step.i + 1 })}>{last ? 'Zur Bilanz' : 'Nächster Spieler'}</button>
          <button className="btn ghost" onClick={() => go(afterPlayers)}>Rest überspringen</button>
        </div>
      </div>
    );
  } else if (step.k === 'summary') {
    const delta = (l: Line) => l.after - l.before;
    const winners = [...lines].sort((a, b) => delta(b) - delta(a)).filter((l) => delta(l) > 0).slice(0, 3);
    const losers = [...lines].sort((a, b) => delta(a) - delta(b)).filter((l) => delta(l) < 0).slice(0, 3);
    const nm = (l: Line) => { const p = byId.get(l.playerId)!; return `${p.firstName[0]}. ${p.lastName}`; };
    const b = top20('before'), a = top20('after');
    body = (
      <div className="td-summary">
        <div className="td-kicker">Bilanz</div>
        <h2>So kommt der Kader aus dem Sommer</h2>
        <div className="kpis">
          <div className="kpi"><span>Kaderstärke (beste 20)</span><strong>{fmt1(b / 10)} → {fmt1(a / 10)}</strong></div>
          <div className="kpi"><span>Verbessert</span><strong>{lines.filter((l) => delta(l) >= 2).length}</strong></div>
          <div className="kpi"><span>Nachgelassen</span><strong>{lines.filter((l) => delta(l) <= -2).length}</strong></div>
        </div>
        <div className="td-columns">
          <section><h4>Gewinner</h4>{winners.length ? winners.map((l) => <div key={l.playerId} className="row-between"><span>{nm(l)}{l.jump ? ' ⚡' : ''}</span><b className="win">+{fmt1(delta(l) / 10)}</b></div>) : <p className="muted small">–</p>}</section>
          <section><h4>Verlierer</h4>{losers.length ? losers.map((l) => <div key={l.playerId} className="row-between"><span>{nm(l)}</span><b className="loss">−{fmt1(-delta(l) / 10)}</b></div>) : <p className="muted small">–</p>}</section>
        </div>
        <div className="row-gap wrap center">
          <button className="btn primary" onClick={() => go(afterSummary)}>{youthIds.length ? 'Weiter: Nachwuchsjahrgang' : 'Fertig'}</button>
        </div>
      </div>
    );
  } else if (step.k === 'youth') {
    const id = youthIds[step.i];
    const p = byId.get(id);
    const open = !!p && p.youthClub === club.id && !p.contract;
    const signed = !!p && p.contract?.clubId === club.id;
    const last = step.i === youthIds.length - 1;
    const v = p ? playerView(world, club.id, p, ageOn(p.birthDate, world.date)) : null;
    const mid = v && 'range' in v.talent ? (v.talent.range[0] + v.talent.range[1]) / 2 : v && 'stars' in v.talent ? v.talent.stars : null;
    body = p && v ? (
      <div key={id} className="td-player youth">
        <div className="td-progress">Nachwuchs {step.i + 1} / {youthIds.length}</div>
        <div className="td-who">
          <span className={`pos pos-${p.position}`}>{p.position}</span>
          <div>
            <h2>{p.firstName} {p.lastName}</h2>
            <div className="muted small">{POSITION_LABEL[p.position]} · {ageOn(p.birthDate, world.date)} Jahre · aus dem eigenen Nachwuchs</div>
          </div>
          <OverallBadge v={v} />
        </div>
        <div className="td-talent"><span className="muted small">Einschätzung Talent</span> <Talent view={v.talent} /></div>
        <blockquote className="td-quote">„{youthComment(p, mid, `${id}:${season}`)}“<cite>– {coachName}</cite></blockquote>
        {open && (
          <div className="row-gap wrap center">
            <button className="btn primary" onClick={() => setMsg(signYouth(p.id) ?? `Fördervertrag für ${p.lastName}: ${YOUTH.YEARS} Jahre, ${euro(YOUTH.SALARY)} pro Jahr.`)}>Fördervertrag geben</button>
            <button className="btn ghost" onClick={() => { releaseYouth(p.id); setMsg(`${p.lastName} wird freigegeben.`); }}>Freigeben</button>
          </div>
        )}
        {!open && <p className="center small">{signed ? `✓ ${p.lastName} bekommt einen Fördervertrag.` : `${p.lastName} wurde freigegeben.`}</p>}
        {msg && <p className="center small">{msg}</p>}
        <div className="row-gap wrap center">
          <button className="btn" onClick={() => go(last ? { k: 'end' } : { k: 'youth', i: step.i + 1 })}>{last ? 'Abschließen' : open ? 'Später entscheiden · Nächstes Talent' : 'Nächstes Talent'}</button>
        </div>
      </div>
    ) : <div className="td-intro"><p>Talent nicht mehr verfügbar.</p><button className="btn" onClick={() => go(last ? { k: 'end' } : { k: 'youth', i: step.i + 1 })}>Weiter</button></div>;
  } else {
    const open = club ? youthOf(world, club.id).length : 0;
    body = (
      <div className="td-intro">
        <h2>Das war der Tag der Leistungstests</h2>
        <p>Alle Ergebnisse stehen jetzt auch im Kader (Ansicht „Entwicklung“) und an den Pfeilen im Spielerprofil.</p>
        {open > 0 && <p className="small">{open} Talent{open === 1 ? '' : 'e'} warten noch auf deine Entscheidung (Kader › Nachwuchs) – bis zum Saisonwechsel.</p>}
        <button className="btn primary big" onClick={finish}>Zurück zur Sommerpause</button>
      </div>
    );
  }

  return (
    <div className="td-backdrop" role="dialog" aria-label="Tag der Leistungstests">
      <div className="td-sheet">
        <button className="sheet-x" onClick={finish} aria-label="Schließen" data-tip="Schließen – die Ergebnisse bleiben in der Sommerpause abrufbar">✕</button>
        {body}
      </div>
    </div>
  );
}
