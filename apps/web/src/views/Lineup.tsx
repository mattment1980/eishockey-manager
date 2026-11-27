import { useEffect, useMemo, useRef, useState } from 'react';
import type { Matchplan, Player } from '@ehm/schema';
import { autoMatchplan, overall, toDisplay, toDisplay1, effectiveRating, isImport, offenseRating, defenseRating, unitChemistry } from '@ehm/core';
import { useStore } from '../store.tsx';
import { chemLabel, chemClass, chemTip } from './Locker.tsx';
import { PlayerName, useUi } from '../ui.tsx';
import { EffectiveBadge, FitnessBar } from '../components/Badges.tsx';
import { fmt1 } from '../format.ts';

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
  return <span className={`chip ${chemClass(c)}`} data-tip={chemTip(c)}>{chemLabel(c)}</span>;
}


const slotKey = (s: Slot) => JSON.stringify(s);
const isSpecial = (s: Slot) => s.k !== 'F' && s.k !== 'D' && s.k !== 'G';

type Rate = (p: Player) => number;

/** Drag & Drop mit Zeiger (Maus und Touch über den Griff) */
function useDrag(onDrop: (id: string, slot: Slot) => void) {
  const [drag, setDrag] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const start = useRef<{ id: string; label: string; x: number; y: number; active: boolean } | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const st = start.current;
      if (!st) return;
      if (!st.active && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
      st.active = true;
      e.preventDefault();
      setDrag({ id: st.id, label: st.label, x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]') as HTMLElement | null;
      setOver(el?.dataset.slot ?? null);
    };
    const up = (e: PointerEvent) => {
      const st = start.current;
      start.current = null;
      if (!st?.active) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]') as HTMLElement | null;
      setDrag(null);
      setOver(null);
      // den Klick nach dem Ziehen nicht als Klick auf den Namen werten
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
      if (el?.dataset.slot) dropRef.current(st.id, JSON.parse(el.dataset.slot) as Slot);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const handle = (p: Player) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('select')) return;
      // Touch: nur über den Griff, damit die Seite scrollbar bleibt
      if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('.grip')) return;
      start.current = { id: p.id, label: `${p.firstName[0]}. ${p.lastName}`, x: e.clientX, y: e.clientY, active: false };
    },
  });
  return { drag, over, handle };
}

export function Lineup() {
  const { club, players, world, setMatchplan, byId } = useStore();
  const { openPlayer } = useUi();
  const [msg, setMsg] = useState<string | null>(null);
  const plan = club?.matchplan;
  const rules = world.countries[0].rules;

  const skaters = useMemo(() => players.filter((p) => p.position !== 'G').sort((a, b) => effectiveRating(b) - effectiveRating(a)), [players]);
  const goalies = useMemo(() => players.filter((p) => p.position === 'G').sort((a, b) => effectiveRating(b) - effectiveRating(a)), [players]);

  const dressedSet = plan ? new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]) : new Set<string>();
  const drop = (id: string, slot: Slot) => {
    if (!plan) return;
    const p = byId.get(id);
    if (!p) return;
    if ((slot.k === 'G') !== (p.position === 'G')) { setMsg(slot.k === 'G' ? 'Nur Torhüter können ins Tor.' : 'Torhüter können nur auf die Torhüter-Positionen.'); return; }
    if (isSpecial(slot) && !dressedSet.has(id)) { setMsg('Für Über- und Unterzahl nur Spieler aus dem Spieltagskader einsetzen.'); return; }
    setMsg(null);
    setMatchplan(assign(plan, slot, id));
  };
  const { drag, over, handle } = useDrag(drop);
  if (!club || !plan) return null;

  const dressed = dressedSet;
  const imports = [...dressed].filter((id) => isImport(byId.get(id)!, 'DE')).length;
  const bench = players.filter((p) => !dressed.has(p.id)).sort((a, b) => effectiveRating(b) - effectiveRating(a));
  const preset = Object.entries(SHARES).find(([, v]) => v.f.join() === plan.forwardShares.join())?.[0] ?? 'custom';

  const unitAvg = (ids: string[], rate: Rate = overall) => {
    const ps = ids.map((id) => byId.get(id)).filter((x): x is Player => !!x);
    return ps.length ? ps.reduce((s, p) => s + effectiveRating(p, rate(p)), 0) / ps.length : 0;
  };

  const pick = (slot: Slot, label: string, list: Player[], rate: Rate = overall) => {
    const id = get(plan, slot);
    const p = byId.get(id);
    const key = slotKey(slot);
    const opt = (o: Player) => `${o.lastName} (${o.position}, ${fmt1(toDisplay1(effectiveRating(o, rate(o))))} · Basis ${fmt1(toDisplay1(rate(o)))})${isImport(o, 'DE') ? ' ★' : ''}${!dressed.has(o.id) ? ' – Tribüne' : ''}`;
    return (
      <div key={key} className={`slot dnd ${over === key ? 'over' : ''} ${drag?.id === id ? 'dragging' : ''}`} data-slot={key} {...(p ? handle(p) : {})}>
        <span className="slot-label">{label}</span>
        {p ? (
          <div className="slot-player">
            <span className="grip" aria-hidden data-tip="Ziehen, um den Spieler auf eine andere Position zu setzen">⠿</span>
            <span className="slot-name">
              <PlayerName p={p} />
              {isImport(p, 'DE') && <span className="imp" data-tip="Importspieler (Ausländerlizenz)">★</span>}
              {p.position !== label && !['F', 'D', 'Start', 'Backup'].includes(label) && <span className="offpos" data-tip={`Spielt nicht auf seiner Stammposition (${p.position})`}>{p.position}</span>}
            </span>
            <FitnessBar value={p.condition.fitness} />
            <EffectiveBadge p={p} base={rate(p)} />
          </div>
        ) : <span className="muted">–</span>}
        <select className="slot-swap" value={id} onChange={(e) => drop(e.target.value, slot)} aria-label={`${label} wählen`} data-tip="Spieler aus Liste wählen">
          {list.map((o) => <option key={o.id} value={o.id}>{opt(o)}</option>)}
        </select>
      </div>
    );
  };

  const dressedSkaters = skaters.filter((p) => dressed.has(p.id));

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Reihen</h2>
        <button className="btn" onClick={() => setMatchplan(autoMatchplan(players, { countryCode: 'DE', importSlotsGame: rules.importSlotsGame, tactics: plan.tactics, keep: { specialTeams: plan.specialTeams, matchups: plan.matchups, rules: plan.rules, captain: plan.captain } }))}
          data-tip="Aufstellung nach Grundstärke automatisch bauen (Über-/Unterzahl inklusive)">
          Automatisch
        </button>
      </div>
      <p className="muted small">Spieler per Drag & Drop auf eine Position ziehen (am Handy über den Griff ⠿) – oder über ▾ aus der Liste wählen. Belegte Positionen werden getauscht. Die große Zahl ist die <b>aktuelle Stärke</b> (Fitness, Form, Moral), der Balken die Fitness.</p>
      {imports > rules.importSlotsGame && (
        <div className="alert">Zu viele Ausländer im Spieltagskader: {imports} von maximal {rules.importSlotsGame}. ★ = Importspieler</div>
      )}
      {msg && <div className="alert">{msg}</div>}

      <div className="lineup-grid">
        <div className="stack">
          {plan.forwardLines.map((_, i) => (
            <section key={`f${i}`} className="card line-card">
              <h3 className="row-between">{i + 1}. Sturmreihe <span className="row-gap"><span className="muted small" data-tip="Durchschnittliche aktuelle Stärke der Reihe">Ø {fmt1(toDisplay1(unitAvg(plan.forwardLines[i])))}</span><ChemChip ids={plan.forwardLines[i]} /></span></h3>
              {pick({ k: 'F', i, j: 0 }, 'LW', skaters)}
              {pick({ k: 'F', i, j: 1 }, 'C', skaters)}
              {pick({ k: 'F', i, j: 2 }, 'RW', skaters)}
            </section>
          ))}
          {plan.defensePairs.map((_, i) => (
            <section key={`d${i}`} className="card line-card">
              <h3 className="row-between">{i + 1}. Verteidigerpaar <span className="row-gap"><span className="muted small" data-tip="Durchschnittliche aktuelle Stärke des Paars">Ø {fmt1(toDisplay1(unitAvg(plan.defensePairs[i])))}</span><ChemChip ids={plan.defensePairs[i]} /></span></h3>
              {pick({ k: 'D', i, j: 0 }, 'LD', skaters)}
              {pick({ k: 'D', i, j: 1 }, 'RD', skaters)}
            </section>
          ))}
          <section className="card line-card">
            <h3>Torhüter</h3>
            {pick({ k: 'G', j: 0 }, 'Start', goalies)}
            {pick({ k: 'G', j: 1 }, 'Backup', goalies)}
          </section>
        </div>

        <div className="stack">
          <section className="card bench-card">
            <h3>Tribüne <span className="muted small">· ziehen zum Einsetzen</span></h3>
            <ul className="plain bench">
              {bench.length === 0 && <li className="muted small">Alle Spieler im Kader.</li>}
              {bench.map((p) => (
                <li key={p.id} className={`row-between bench-item ${drag?.id === p.id ? 'dragging' : ''}`} {...handle(p)} onClick={() => openPlayer(p.id)}>
                  <span><span className="grip" aria-hidden>⠿</span><span className={`pos pos-${p.position}`}>{p.position}</span> <PlayerName p={p} /></span>
                  <span className="row-gap"><FitnessBar value={p.condition.fitness} /><EffectiveBadge p={p} /></span>
                </li>
              ))}
            </ul>
          </section>

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
            <p className="muted small">Sturm {plan.forwardShares.map((x) => Math.round(x * 100)).join(' / ')} % · Verteidigung {plan.defenseShares.map((x) => Math.round(x * 100)).join(' / ')} %. Viel Eiszeit kostet Fitness – bei dichtem Spielplan lohnt es sich, die Last zu verteilen.</p>
          </section>

          {[0, 1].map((i) => (
            <section key={`pp${i}`} className="card line-card special">
              <h3>Überzahl {i + 1}</h3>
              {[0, 1, 2].map((j) => pick({ k: 'PPF', i, j }, 'F', dressedSkaters, offenseRating))}
              {[0, 1].map((j) => pick({ k: 'PPD', i, j }, 'D', dressedSkaters, offenseRating))}
            </section>
          ))}
          {[0, 1].map((i) => (
            <section key={`pk${i}`} className="card line-card special">
              <h3>Unterzahl {i + 1}</h3>
              {[0, 1].map((j) => pick({ k: 'PKF', i, j }, 'F', dressedSkaters, defenseRating))}
              {[0, 1].map((j) => pick({ k: 'PKD', i, j }, 'D', dressedSkaters, defenseRating))}
            </section>
          ))}
          <p className="muted small">In Über- und Unterzahl zeigt die Zahl die (aktuelle) Offensiv- bzw. Defensivstärke.</p>
        </div>
      </div>
      {drag && <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>{drag.label}</div>}
    </div>
  );
}
