import { useState } from 'react';
import type { CoachingRule, RuleCondition, RuleAction, Tactics } from '@ehm/schema';
import {
  RULE_TEMPLATES, coachingCapacity, describeCondition, describeAction, TACTIC_KEY_LABEL, tacticValueLabel,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { TACTIC_OPTIONS } from '../labels.ts';

const newId = () => `r${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export function RulesEditor() {
  const { world, club, setMatchplan } = useStore();
  const [edit, setEdit] = useState<CoachingRule | null>(null);
  const plan = club?.matchplan;
  if (!club || !plan) return null;
  const cap = coachingCapacity(world, club.id);
  const rules = plan.rules;
  const enabled = rules.filter((r) => r.enabled);
  const save = (list: CoachingRule[]) => setMatchplan({ ...plan, rules: list });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const list = [...rules];
    [list[i], list[j]] = [list[j], list[i]];
    save(list);
  };
  let activeIndex = 0;

  return (
    <>
      <section className="card">
        <div className="row-between">
          <h3>Regelplätze</h3>
          <b className={enabled.length > cap.slots ? 'loss' : ''}>{Math.min(enabled.length, cap.slots)} / {cap.slots}</b>
        </div>
        <p className="muted small">{cap.explanation.join(' · ')}. {cap.fastReaction ? 'Der Trainer reagiert bei der nächsten Unterbrechung.' : 'Der Trainer reagiert eine Unterbrechung später.'}</p>
        {enabled.length > cap.slots && <p className="small loss">Mehr aktive Regeln als Plätze – nur die obersten {cap.slots} werden genutzt.</p>}
        <p className="muted small">Regeln werden bei Unterbrechungen geprüft. Gelten mehrere gleichzeitig, gewinnt die weiter oben stehende. Ist eine Bedingung nicht mehr erfüllt, gilt wieder die Grundtaktik.</p>
      </section>

      {rules.map((r, i) => {
        const inSlot = r.enabled && activeIndex++ < cap.slots;
        return (
          <section key={r.id} className={`card rule ${r.enabled ? '' : 'off'} ${r.enabled && !inSlot ? 'overflow' : ''}`}>
            <div className="row-between">
              <label className="check rule-title">
                <input type="checkbox" checked={r.enabled} onChange={(e) => save(rules.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)))} />
                <strong>{r.name}</strong>
              </label>
              <div className="rule-tools">
                <button className="btn ghost" onClick={() => move(i, -1)} aria-label="nach oben">↑</button>
                <button className="btn ghost" onClick={() => move(i, 1)} aria-label="nach unten">↓</button>
              </div>
            </div>
            <p className="small"><span className="muted">Wenn</span> {r.conditions.map(describeCondition).join(' und ')}</p>
            <p className="small"><span className="muted">dann</span> {r.actions.map(describeAction).join(', ')}</p>
            <div className="btn-row">
              <button className="btn" onClick={() => setEdit(structuredClone(r))}>Bearbeiten</button>
              <button className="btn ghost" onClick={() => save(rules.filter((x) => x.id !== r.id))}>Löschen</button>
            </div>
          </section>
        );
      })}

      <section className="card">
        <h3>Regel hinzufügen</h3>
        <div className="template-list">
          {RULE_TEMPLATES.map((t) => (
            <button key={t.id} className="btn" onClick={() => save([...rules, { ...structuredClone(t), id: newId(), enabled: true }])}>+ {t.name}</button>
          ))}
          <button className="btn primary" onClick={() => setEdit({ id: newId(), name: 'Eigene Regel', enabled: true, conditions: [{ type: 'score', state: 'trailing', min: 1, max: 1 }], actions: [{ type: 'tactic', key: 'tempo', value: 'high' }] })}>+ Eigene Regel</button>
        </div>
      </section>

      {edit && (
        <RuleSheet
          rule={edit}
          onCancel={() => setEdit(null)}
          onSave={(r) => {
            save(rules.some((x) => x.id === r.id) ? rules.map((x) => (x.id === r.id ? r : x)) : [...rules, r]);
            setEdit(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Regel-Editor

const CONDITION_TYPES: { type: RuleCondition['type']; label: string; make: () => RuleCondition }[] = [
  { type: 'score', label: 'Spielstand', make: () => ({ type: 'score', state: 'trailing', min: 1, max: 1 }) },
  { type: 'time', label: 'ab Spielminute', make: () => ({ type: 'time', fromMinute: 50 }) },
  { type: 'lastMinutes', label: 'letzte Minuten des Drittels', make: () => ({ type: 'lastMinutes', minutes: 2 }) },
  { type: 'period', label: 'Drittel', make: () => ({ type: 'period', period: '3' }) },
  { type: 'situation', label: 'Spielsituation', make: () => ({ type: 'situation', situation: 'EV' }) },
  { type: 'shots', label: 'Schussbilanz', make: () => ({ type: 'shots', state: 'behind', diff: 8 }) },
  { type: 'goalieSave', label: 'Fangquote Torhüter', make: () => ({ type: 'goalieSave', below: 85, minShots: 12 }) },
  { type: 'goalsAgainst', label: 'Gegentore in kurzer Zeit', make: () => ({ type: 'goalsAgainst', goals: 2, withinMinutes: 5 }) },
  { type: 'playerPenalties', label: 'Strafen eines Spielers', make: () => ({ type: 'playerPenalties', count: 2 }) },
  { type: 'playoffs', label: 'Playoffs', make: () => ({ type: 'playoffs' }) },
];

const ACTION_TYPES: { type: RuleAction['type']; label: string; make: () => RuleAction }[] = [
  { type: 'tactic', label: 'Taktik ändern', make: () => ({ type: 'tactic', key: 'tempo', value: 'high' }) },
  { type: 'topLines', label: 'Topreihen öfter', make: () => ({ type: 'topLines' }) },
  { type: 'shortBench', label: 'Nur 3 Sturmreihen', make: () => ({ type: 'shortBench' }) },
  { type: 'pullGoalie', label: 'Torhüter raus', make: () => ({ type: 'pullGoalie' }) },
  { type: 'switchGoalie', label: 'Torhüter wechseln', make: () => ({ type: 'switchGoalie' }) },
  { type: 'timeout', label: 'Auszeit', make: () => ({ type: 'timeout' }) },
  { type: 'benchPenalized', label: 'Spieler mit Strafen auf die Bank', make: () => ({ type: 'benchPenalized' }) },
  { type: 'matchups', label: 'Matchups an/aus', make: () => ({ type: 'matchups', on: true }) },
];

function num(v: string) { return Number(v.replace(',', '.')); }

function ConditionEditor({ c, onChange }: { c: RuleCondition; onChange: (c: RuleCondition) => void }) {
  const sel = (value: string | number, opts: [string | number, string][], f: (v: string) => void) => (
    <select className="select" value={value} onChange={(e) => f(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );
  const nums = (a: number, b: number, step = 1) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step).map((v) => [v, String(v).replace('.', ',')] as [number, string]);
  switch (c.type) {
    case 'score': return (
      <div className="param-row">
        {sel(c.state, [['leading', 'Führung'], ['trailing', 'Rückstand'], ['tied', 'Gleichstand']], (v) => onChange({ ...c, state: v as typeof c.state }))}
        {c.state !== 'tied' && <>{sel(c.min, nums(1, 5), (v) => onChange({ ...c, min: num(v), max: Math.max(num(v), c.max) }))}<span>bis</span>{sel(c.max, nums(1, 9), (v) => onChange({ ...c, max: Math.max(num(v), c.min) }))}<span>Tore</span></>}
      </div>
    );
    case 'time': return <div className="param-row"><span>ab Minute</span>{sel(c.fromMinute, nums(0, 60, 5), (v) => onChange({ ...c, fromMinute: num(v) }))}</div>;
    case 'lastMinutes': return <div className="param-row"><span>letzte</span>{sel(c.minutes, [[0.5, '0,5'], [1, '1'], [1.5, '1,5'], [2, '2'], [3, '3'], [5, '5'], [10, '10']], (v) => onChange({ ...c, minutes: num(v) }))}<span>Minuten</span></div>;
    case 'period': return <div className="param-row">{sel(c.period, [['1', '1. Drittel'], ['2', '2. Drittel'], ['3', '3. Drittel'], ['OT', 'Verlängerung']], (v) => onChange({ ...c, period: v as typeof c.period }))}</div>;
    case 'situation': return <div className="param-row">{sel(c.situation, [['EV', 'gleiche Anzahl'], ['PP', 'Überzahl'], ['PK', 'Unterzahl']], (v) => onChange({ ...c, situation: v as typeof c.situation }))}</div>;
    case 'shots': return <div className="param-row">{sel(c.state, [['behind', 'Schüsse hinten'], ['ahead', 'Schüsse vorne']], (v) => onChange({ ...c, state: v as typeof c.state }))}<span>mind.</span>{sel(c.diff, nums(3, 20), (v) => onChange({ ...c, diff: num(v) }))}</div>;
    case 'goalieSave': return <div className="param-row"><span>unter</span>{sel(c.below, nums(75, 92), (v) => onChange({ ...c, below: num(v) }))}<span>% ab</span>{sel(c.minShots, nums(5, 25, 5), (v) => onChange({ ...c, minShots: num(v) }))}<span>Schüssen</span></div>;
    case 'goalsAgainst': return <div className="param-row">{sel(c.goals, nums(2, 4), (v) => onChange({ ...c, goals: num(v) }))}<span>Gegentore in</span>{sel(c.withinMinutes, nums(3, 10), (v) => onChange({ ...c, withinMinutes: num(v) }))}<span>Min.</span></div>;
    case 'playerPenalties': return <div className="param-row"><span>mind.</span>{sel(c.count, nums(1, 3), (v) => onChange({ ...c, count: num(v) }))}<span>Strafen</span></div>;
    case 'playoffs': return null;
  }
}

function ActionEditor({ a, onChange }: { a: RuleAction; onChange: (a: RuleAction) => void }) {
  if (a.type === 'tactic') {
    const key = a.key as keyof Tactics;
    const opts = TACTIC_OPTIONS[key].options;
    return (
      <div className="param-row">
        <select className="select" value={a.key} onChange={(e) => {
          const k = e.target.value as keyof Tactics;
          onChange({ ...a, key: k, value: String(TACTIC_OPTIONS[k].options[0].value) });
        }}>
          {(Object.keys(TACTIC_KEY_LABEL) as (keyof Tactics)[]).map((k) => <option key={k} value={k}>{TACTIC_KEY_LABEL[k]}</option>)}
        </select>
        <select className="select" value={a.value} onChange={(e) => onChange({ ...a, value: e.target.value })}>
          {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{tacticValueLabel(String(o.value))}</option>)}
        </select>
      </div>
    );
  }
  if (a.type === 'matchups') {
    return <div className="param-row"><select className="select" value={a.on ? '1' : '0'} onChange={(e) => onChange({ ...a, on: e.target.value === '1' })}><option value="1">aktivieren</option><option value="0">aussetzen</option></select></div>;
  }
  return null;
}

function RuleSheet({ rule, onSave, onCancel }: { rule: CoachingRule; onSave: (r: CoachingRule) => void; onCancel: () => void }) {
  const [r, setR] = useState<CoachingRule>(rule);
  return (
    <Sheet onClose={onCancel} label="Regel bearbeiten">
        <div className="muted small">Coaching-Regel</div>
        <input className="name-input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} aria-label="Name der Regel" />

        <h4>Wenn (alle Bedingungen)</h4>
        {r.conditions.map((c, i) => (
          <div key={i} className="rule-part">
            <div className="param-row">
              <select className="select" value={c.type} onChange={(e) => setR({ ...r, conditions: r.conditions.map((x, j) => (j === i ? CONDITION_TYPES.find((t) => t.type === e.target.value)!.make() : x)) })}>
                {CONDITION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
              {r.conditions.length > 1 && <button className="btn ghost" onClick={() => setR({ ...r, conditions: r.conditions.filter((_, j) => j !== i) })}>✕</button>}
            </div>
            <ConditionEditor c={c} onChange={(nc) => setR({ ...r, conditions: r.conditions.map((x, j) => (j === i ? nc : x)) })} />
          </div>
        ))}
        {r.conditions.length < 4 && <button className="btn" onClick={() => setR({ ...r, conditions: [...r.conditions, CONDITION_TYPES[1].make()] })}>+ Bedingung</button>}

        <h4>Dann</h4>
        {r.actions.map((a, i) => (
          <div key={i} className="rule-part">
            <div className="param-row">
              <select className="select" value={a.type} onChange={(e) => setR({ ...r, actions: r.actions.map((x, j) => (j === i ? ACTION_TYPES.find((t) => t.type === e.target.value)!.make() : x)) })}>
                {ACTION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
              {r.actions.length > 1 && <button className="btn ghost" onClick={() => setR({ ...r, actions: r.actions.filter((_, j) => j !== i) })}>✕</button>}
            </div>
            <ActionEditor a={a} onChange={(na) => setR({ ...r, actions: r.actions.map((x, j) => (j === i ? na : x)) })} />
          </div>
        ))}
        {r.actions.length < 5 && <button className="btn" onClick={() => setR({ ...r, actions: [...r.actions, ACTION_TYPES[0].make()] })}>+ Aktion</button>}

        <div className="nego-summary small">
          <span><span className="muted">Wenn</span> {r.conditions.map(describeCondition).join(' und ')}</span>
          <span><span className="muted">dann</span> {r.actions.map(describeAction).join(', ')}</span>
        </div>
        <div className="btn-row">
          <button className="btn primary big" onClick={() => onSave(r)}>Speichern</button>
          <button className="btn big" onClick={onCancel}>Abbrechen</button>
        </div>
    </Sheet>
  );
}
