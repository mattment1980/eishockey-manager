import { unitChemistry } from '@ehm/core';
import { chemLabel, chemClass } from './Locker.tsx';
import { useMemo, useState } from 'react';
import type { Matchplan, Player } from '@ehm/schema';
import { autoMatchplan, overall, toDisplay, isImport, offenseRating, defenseRating } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from '../components/PlayerSheet.tsx';

type Slot =
  | { k: 'F'; i: number; j: number }
  | { k: 'D'; i: number; j: number }
  | { k: 'G'; j: number }
  | { k: 'PPF' | 'PPD' | 'PKF' | 'PKD'; i: number; j: number };

const clone = (p: Matchplan): Matchplan => JSON.parse(JSON.stringify(p));

function get(plan: Matchplan, s: Slot): string {
  switch (s.k) {
    case 'F': return plan.forwardLines[s.i][s.j];
    case 'D': return plan.defensePairs[s.i][s.j];
    case 'G': return plan.goalies[s.j];
    case 'PPF': return plan.powerPlay[s.i].forwards[s.j];
    case 'PPD': return plan.powerPlay[s.i].defense[s.j];
    case 'PKF': return plan.penaltyKill[s.i].forwards[s.j];
    case 'PKD': return plan.penaltyKill[s.i].defense[s.j];
  }
}

function set(plan: Matchplan, s: Slot, id: string) {
  switch (s.k) {
    case 'F': plan.forwardLines[s.i][s.j] = id; break;
    case 'D': plan.defensePairs[s.i][s.j] = id; break;
    case 'G': plan.goalies[s.j] = id; break;
    case 'PPF': plan.powerPlay[s.i].forwards[s.j] = id; break;
    case 'PPD': plan.powerPlay[s.i].defense[s.j] = id; break;
    case 'PKF': plan.penaltyKill[s.i].forwards[s.j] = id; break;
    case 'PKD': plan.penaltyKill[s.i].defense[s.j] = id; break;
  }
}

const mainSlots = (): Slot[] => [
  ...[0, 1, 2, 3].flatMap((i) => [0, 1, 2].map((j) => ({ k: 'F', i, j }) as Slot)),
  ...[0, 1, 2].flatMap((i) => [0, 1].map((j) => ({ k: 'D', i, j }) as Slot)),
  { k: 'G', j: 0 }, { k: 'G', j: 1 },
];

/** Spieler einsetzen; ist er schon in einer anderen Position der Aufstellung, wird getauscht. */
function assign(plan: Matchplan, slot: Slot, id: string): Matchplan {
  const next = clone(plan);
  const old = get(next, slot);
  if (slot.k === 'F' || slot.k === 'D' || slot.k === 'G') {
    const from = mainSlots().find((s) => get(next, s) === id);
    if (from) set(next, from, old);
  } else {
    const unitKey = slot.k;
    const size = unitKey === 'PPF' ? 3 : 2;
    for (let j = 0; j < size; j++) {
      const s = { k: unitKey, i: slot.i, j } as Slot;
      if (get(next, s) === id) set(next, s, old);
    }
  }
  set(next, slot, id);
  return next;
}

const SHARES: Record<string, { f: number[]; d: number[] }> = {
  balanced: { f: [0.28, 0.27, 0.24, 0.21], d: [0.36, 0.33, 0.31] },
  standard: { f: [0.34, 0.3, 0.22, 0.14], d: [0.4, 0.34, 0.26] },
  top: { f: [0.4, 0.32, 0.18, 0.1], d: [0.45, 0.33, 0.22] },
};

function ChemChip({ ids }: { ids: string[] }) {
  const { world, byId } = useStore();
  const c = unitChemistry(world, ids, byId);
  return <span className={`chip ${chemClass(c)}`} title={`Chemie ${Math.round(c)}`}>{chemLabel(c)}</span>;
}

export function Lineup() {
  const { club, players, world, setMatchplan, byId } = useStore();
  const [sheet, setSheet] = useState<Player | null>(null);
  const plan = club?.matchplan;
  const rules = world.countries[0].rules;

  const skaters = useMemo(() => players.filter((p) => p.position !== 'G').sort((a, b) => overall(b) - overall(a)), [players]);
  const goalies = useMemo(() => players.filter((p) => p.position === 'G').sort((a, b) => overall(b) - overall(a)), [players]);
  if (!club || !plan) return null;

  const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
  const imports = [...dressed].filter((id) => isImport(byId.get(id)!, 'DE')).length;
  const bench = players.filter((p) => !dressed.has(p.id));
  const preset = Object.entries(SHARES).find(([, v]) => v.f.join() === plan.forwardShares.join())?.[0] ?? 'custom';

  const pick = (slot: Slot, label: string, list: Player[], rate: (p: Player) => number = overall) => {
    const id = get(plan, slot);
    const p = byId.get(id);
    return (
      <div className="slot">
        <span className="slot-label">{label}</span>
        <select className="slot-select" value={id} onChange={(e) => setMatchplan(assign(plan, slot, e.target.value))} aria-label={label}>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.lastName} ({o.position}, {toDisplay(rate(o))}){isImport(o, 'DE') ? ' ★' : ''}
            </option>
          ))}
        </select>
        {p && <button className="slot-info" onClick={() => setSheet(p)} aria-label="Spielerdetails">{toDisplay(rate(p))}</button>}
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Reihen</h2>
        <button className="btn" onClick={() => setMatchplan(autoMatchplan(players, { countryCode: 'DE', importSlotsGame: rules.importSlotsGame, tactics: plan.tactics, keep: { specialTeams: plan.specialTeams, matchups: plan.matchups, rules: plan.rules, captain: plan.captain } }))}>
          Automatisch
        </button>
      </div>
      {imports > rules.importSlotsGame && (
        <div className="alert">Zu viele Ausländer im Spieltagskader: {imports} von maximal {rules.importSlotsGame}. ★ = Importspieler</div>
      )}

      <section className="card">
        <div className="row-between">
          <h3>Kapitän</h3>
          <select className="select" value={plan.captain ?? ''} onChange={(e) => setMatchplan({ ...clone(plan), captain: e.target.value || null })} aria-label="Kapitän">
            <option value="">Automatisch (bester Leader)</option>
            {skaters.map((p) => <option key={p.id} value={p.id}>{p.lastName} ({p.position}, Führung {toDisplay(p.skater.leadership)})</option>)}
          </select>
        </div>
        <p className="muted small">Der Kapitän zählt doppelt fürs Teamklima und verstärkt den Leader-Effekt seiner Reihe.</p>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Eiszeit</h3>
          <select className="select" value={preset} onChange={(e) => {
            const v = SHARES[e.target.value]; if (!v) return;
            setMatchplan({ ...clone(plan), forwardShares: v.f, defenseShares: v.d });
          }} aria-label="Eiszeitverteilung">
            <option value="balanced">Ausgeglichen</option>
            <option value="standard">Standard</option>
            <option value="top">Topreihen stark</option>
            {preset === 'custom' && <option value="custom">Individuell</option>}
          </select>
        </div>
        <p className="muted small">Sturm {plan.forwardShares.map((x) => Math.round(x * 100)).join(' / ')} % · Verteidigung {plan.defenseShares.map((x) => Math.round(x * 100)).join(' / ')} %</p>
      </section>

      {plan.forwardLines.map((_, i) => (
        <section key={`f${i}`} className="card line-card">
          <h3 className="row-between">{i + 1}. Sturmreihe <ChemChip ids={plan.forwardLines[i]} /></h3>
          {pick({ k: 'F', i, j: 0 }, 'LW', skaters)}
          {pick({ k: 'F', i, j: 1 }, 'C', skaters)}
          {pick({ k: 'F', i, j: 2 }, 'RW', skaters)}
        </section>
      ))}
      {plan.defensePairs.map((_, i) => (
        <section key={`d${i}`} className="card line-card">
          <h3 className="row-between">{i + 1}. Verteidigerpaar <ChemChip ids={plan.defensePairs[i]} /></h3>
          {pick({ k: 'D', i, j: 0 }, 'LD', skaters)}
          {pick({ k: 'D', i, j: 1 }, 'RD', skaters)}
        </section>
      ))}
      <section className="card line-card">
        <h3>Torhüter</h3>
        {pick({ k: 'G', j: 0 }, 'Start', goalies)}
        {pick({ k: 'G', j: 1 }, 'Backup', goalies)}
      </section>

      {[0, 1].map((i) => (
        <section key={`pp${i}`} className="card line-card special">
          <h3>Überzahl {i + 1}</h3>
          {[0, 1, 2].map((j) => <div key={j}>{pick({ k: 'PPF', i, j }, 'F', skaters.filter((p) => dressed.has(p.id)), offenseRating)}</div>)}
          {[0, 1].map((j) => <div key={j}>{pick({ k: 'PPD', i, j }, 'D', skaters.filter((p) => dressed.has(p.id)), offenseRating)}</div>)}
        </section>
      ))}
      {[0, 1].map((i) => (
        <section key={`pk${i}`} className="card line-card special">
          <h3>Unterzahl {i + 1}</h3>
          {[0, 1].map((j) => <div key={j}>{pick({ k: 'PKF', i, j }, 'F', skaters.filter((p) => dressed.has(p.id)), defenseRating)}</div>)}
          {[0, 1].map((j) => <div key={j}>{pick({ k: 'PKD', i, j }, 'D', skaters.filter((p) => dressed.has(p.id)), defenseRating)}</div>)}
        </section>
      ))}
      <p className="muted small">In Über- und Unterzahl zeigt die Zahl die Offensiv- bzw. Defensivstärke.</p>

      <section className="card">
        <h3>Tribüne</h3>
        <ul className="plain">
          {bench.map((p) => (
            <li key={p.id} className="row-between" onClick={() => setSheet(p)}>
              <span>{p.firstName[0]}. {p.lastName} <span className="muted">· {p.position}</span></span>
              <span className="rating">{toDisplay(overall(p))}</span>
            </li>
          ))}
        </ul>
      </section>
      {sheet && <PlayerSheet player={sheet} date={world.date} onClose={() => setSheet(null)} />}
    </div>
  );
}
