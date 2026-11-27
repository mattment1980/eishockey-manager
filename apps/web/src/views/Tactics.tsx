import { useState } from 'react';
import type { Tactics, Matchplan, Matchup, SpecialTeams } from '@ehm/schema';
import { DEFAULT_TACTICS } from '@ehm/schema';
import { useStore } from '../store.tsx';
import { TACTIC_OPTIONS } from '../labels.ts';
import { RulesEditor } from './Rules.tsx';
import { familiarityValue, familiarityLabel, teamFamiliarity, familiarityEffect, ENGINE_CONSTANTS } from '@ehm/core';

/** Eingespieltheit eines Systems als kleiner Balken im Auswahlknopf */
function Fam({ rec, k }: { rec: Record<string, number>; k: string }) {
  const v = familiarityValue(rec, k);
  return <span className="fam" data-tip={`Eingespieltheit ${Math.round(v)}/100 (${familiarityLabel(v)}) – wächst mit jedem Spiel und im Trainingslager, verblasst langsam, wenn das System nicht gespielt wird`}><i style={{ width: `${v}%` }} /></span>;
}

/** Gesamte Taktik-Eingespieltheit der aktuellen Systeme */
export function FamiliaritySummary() {
  const { club } = useStore();
  const plan = club?.matchplan;
  if (!club || !plan) return null;
  const avg = teamFamiliarity(club.familiarity, plan.tactics, plan);
  const eff = familiarityEffect(avg, ENGINE_CONSTANTS.FAMILIARITY_EFFECT) * 100;
  return (
    <section className="card">
      <div className="row-between"><h3>Taktische Eingespieltheit</h3><b className="rating" data-tip="Durchschnitt über alle gewählten Systeme (5-gegen-5 und Special Teams)">{Math.round(avg)}</b></div>
      <div className="meter big"><div style={{ width: `${avg}%` }} /></div>
      <p className="muted small">{familiarityLabel(avg)} · Wirkung im Spiel: {eff >= 0 ? '+' : ''}{eff.toFixed(1).replace('.', ',')} % für alle Spieler. Neue Systeme müssen erst einstudiert werden – häufige Wechsel kosten Leistung. Ein starker Taktiker als Cheftrainer und der „Taktikfuchs“ beschleunigen das Lernen.</p>
    </section>
  );
}

type Mode = 'ev' | 'special' | 'matchups' | 'rules';

export function TacticsView() {
  const [mode, setMode] = useState<Mode>('ev');
  return (
    <div className="stack">
      <div className="tabs">
        <button className={mode === 'ev' ? 'on' : ''} onClick={() => setMode('ev')}>5-gegen-5</button>
        <button className={mode === 'special' ? 'on' : ''} onClick={() => setMode('special')}>Special Teams</button>
        <button className={mode === 'matchups' ? 'on' : ''} onClick={() => setMode('matchups')}>Matchups</button>
        <button className={mode === 'rules' ? 'on' : ''} onClick={() => setMode('rules')}>Regeln</button>
      </div>
      {mode === 'ev' && <EvenStrength />}
      {mode === 'special' && <SpecialTeamsView />}
      {mode === 'matchups' && <Matchups />}
      {mode === 'rules' && <RulesEditor />}
    </div>
  );
}

function EvenStrength() {
  const { club, setMatchplan } = useStore();
  const plan = club?.matchplan;
  if (!plan || !club) return null;
  const fam = club.familiarity;
  const t = plan.tactics;
  const update = <K extends keyof Tactics>(k: K, v: Tactics[K]) => setMatchplan({ ...plan, tactics: { ...t, [k]: v } });
  return (
    <>
      <div className="row-between">
        <p className="muted small">Grundtaktik. Coaching-Regeln können sie im Spiel situativ ändern.</p>
        <button className="btn ghost" onClick={() => setMatchplan({ ...plan, tactics: { ...DEFAULT_TACTICS } })}>Zurücksetzen</button>
      </div>
      <FamiliaritySummary />
      {(Object.keys(TACTIC_OPTIONS) as (keyof Tactics)[]).map((k) => {
        const def = TACTIC_OPTIONS[k];
        const current = def.options.find((o) => o.value === t[k]);
        return (
          <section key={k} className="card">
            <h3>{def.title}</h3>
            <div className="segmented">
              {def.options.map((o) => (
                <button key={String(o.value)} className={`fam-btn ${t[k] === o.value ? 'on' : ''}`} onClick={() => update(k, o.value as Tactics[typeof k])}>
                  {o.label}
                  <Fam rec={fam} k={`${k}:${o.value}`} />
                </button>
              ))}
            </div>
            {current && <p className="muted small hint">{current.hint}</p>}
          </section>
        );
      })}
    </>
  );
}

const PP_OPTIONS: { value: SpecialTeams['ppFormation']; label: string; hint: string }[] = [
  { value: 'umbrella', label: '1-3-1 Umbrella', hint: 'Viele Schüsse, oft von der Blauen Linie und aus dem Bullykreis. Solide Standardvariante.' },
  { value: 'overload', label: 'Overload', hint: 'Überzahl auf einer Seite: sicherer Puckbesitz, mehr Abschlüsse aus dem Slot.' },
  { value: 'spread', label: 'Spread', hint: 'Breites Passspiel: bessere Chancen durch Querpässe, aber mehr Puckverluste.' },
];
const PK_OPTIONS: { value: SpecialTeams['pkFormation']; label: string; hint: string }[] = [
  { value: 'box', label: 'Box', hint: 'Slot dicht machen: weniger gefährliche Chancen, Schüsse von außen erlaubt.' },
  { value: 'diamond', label: 'Diamant', hint: 'Druck auf die Blaue Linie: weniger Distanzschüsse, Slot etwas offener.' },
  { value: 'aggressive', label: 'Aggressiv', hint: 'Jagd auf den Puckführer: viele Befreiungen und Konter in Unterzahl – wird es durchgespielt, wird es gefährlich.' },
];

function SpecialTeamsView() {
  const { club, setMatchplan } = useStore();
  const plan = club?.matchplan;
  if (!plan) return null;
  const st = plan.specialTeams;
  const fam = club!.familiarity;
  const set = (patch: Partial<SpecialTeams>) => setMatchplan({ ...plan, specialTeams: { ...st, ...patch } });
  const pp = PP_OPTIONS.find((o) => o.value === st.ppFormation)!;
  const pk = PK_OPTIONS.find((o) => o.value === st.pkFormation)!;
  return (
    <>
      <section className="card">
        <h3>Überzahl-Formation</h3>
        <div className="segmented">
          {PP_OPTIONS.map((o) => <button key={o.value} className={`fam-btn ${st.ppFormation === o.value ? 'on' : ''}`} onClick={() => set({ ppFormation: o.value })}>{o.label}<Fam rec={fam} k={`pp:${o.value}`} /></button>)}
        </div>
        <p className="muted small hint">{pp.hint}</p>
      </section>
      <section className="card">
        <h3>Unterzahl-Formation</h3>
        <div className="segmented">
          {PK_OPTIONS.map((o) => <button key={o.value} className={`fam-btn ${st.pkFormation === o.value ? 'on' : ''}`} onClick={() => set({ pkFormation: o.value })}>{o.label}<Fam rec={fam} k={`pk:${o.value}`} /></button>)}
        </div>
        <p className="muted small hint">{pk.hint}</p>
      </section>
      <section className="card">
        <h3>6-gegen-5 (Torhüter raus)</h3>
        <p className="muted small">Wann der Torhüter vom Eis geht, steuerst du über eine Coaching-Regel (Vorlage „Torhüter raus“). Mit sechs Feldspielern spielt die erste Überzahl-Einheit plus ein weiterer Stürmer. Gelingt dem Gegner eine Befreiung, droht ein Treffer ins leere Tor.</p>
        <p className="muted small">Die Besetzung der Über- und Unterzahl-Einheiten stellst du unter „Reihen“ ein.</p>
      </section>
    </>
  );
}

function Matchups() {
  const { club, setMatchplan, byId } = useStore();
  const plan = club?.matchplan;
  if (!plan) return null;
  const list = plan.matchups;
  const set = (m: Matchup[]) => setMatchplan({ ...plan, matchups: m } as Matchplan);
  const lineName = (i: number) => `${i + 1}. Reihe (${plan.forwardLines[i].map((id) => byId.get(id)?.lastName).join(', ')})`;
  const pairName = (i: number) => `${i + 1}. Paar (${plan.defensePairs[i].map((id) => byId.get(id)?.lastName).join(', ')})`;
  return (
    <>
      <section className="card">
        <h3>Wer spielt gegen wen?</h3>
        <p className="muted small">Bei 5-gegen-5 versucht der Trainer, deine Einheit gegen die gewählte gegnerische Sturmreihe zu schicken. Daheim gelingt das meist (letzter Wechsel bei Unterbrechungen), auswärts deutlich seltener. Ein taktisch starker Trainer erhöht die Quote. Ausgeruht muss die Einheit sein.</p>
      </section>
      {list.map((m, i) => (
        <section key={i} className="card matchup">
          <div className="segmented small-seg">
            <button className={m.unit === 'line' ? 'on' : ''} onClick={() => set(list.map((x, j) => (j === i ? { ...x, unit: 'line', mine: Math.min(x.mine, 3) } : x)))}>Sturmreihe</button>
            <button className={m.unit === 'pair' ? 'on' : ''} onClick={() => set(list.map((x, j) => (j === i ? { ...x, unit: 'pair', mine: Math.min(x.mine, 2) } : x)))}>Verteidigerpaar</button>
          </div>
          <label className="field">
            <span className="small muted">Eigene Einheit</span>
            <select className="select" value={m.mine} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, mine: Number(e.target.value) } : x)))}>
              {(m.unit === 'line' ? [0, 1, 2, 3] : [0, 1, 2]).map((k) => <option key={k} value={k}>{m.unit === 'line' ? lineName(k) : pairName(k)}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="small muted">gegen die gegnerische</span>
            <select className="select" value={m.vs} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, vs: Number(e.target.value) } : x)))}>
              {[0, 1, 2, 3].map((k) => <option key={k} value={k}>{k + 1}. Sturmreihe{k === 0 ? ' (meist die Topreihe)' : ''}</option>)}
            </select>
          </label>
          <button className="btn ghost" onClick={() => set(list.filter((_, j) => j !== i))}>Entfernen</button>
        </section>
      ))}
      <button className="btn" onClick={() => set([...list, { unit: 'line', mine: 2, vs: 0 }])}>+ Matchup hinzufügen</button>
      {list.length === 0 && <p className="muted small">Typisch: Checking-Reihe (3. Reihe) und das defensivste Verteidigerpaar gegen die gegnerische 1. Reihe.</p>}
    </>
  );
}
