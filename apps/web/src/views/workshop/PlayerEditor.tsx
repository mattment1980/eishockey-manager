import { useMemo, useState } from 'react';
import type { Player, Position, TraitId } from '@ehm/schema';
import { SKATER_ATTRIBUTES, GOALIE_ATTRIBUTES, TRAIT_IDS, makeContract } from '@ehm/schema';
import { overall, ageOn, toDisplay1 } from '@ehm/core';
import { rebuildWorld, WorldGenerator } from '@ehm/data';
import { useStore } from '../../store.tsx';
import { SKATER_LABEL, GOALIE_LABEL, TRAIT_LABEL, POSITION_LABEL } from '../../labels.ts';
import { fmt1 } from '../../format.ts';
import type { WorkshopMode } from './Workshop.tsx';

const POSITIONS: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
const PLAYER_TRAITS = TRAIT_IDS.slice(0, 15) as readonly TraitId[];

/** Wert auf der Anzeigeskala (1–20, eine Nachkommastelle) ↔ intern 1–200 */
function Num({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <label className="num-field">{label}
      <input type="number" min={0.1} max={20} step={0.1} value={(value / 10).toFixed(1)} onChange={(e) => onChange(Math.max(1, Math.min(200, Math.round(Number(e.target.value) * 10) || 1)))} />
    </label>
  );
}

/** Spieler bearbeiten: vor Spielbeginn alles, im laufenden Spiel nur Namen */
export function PlayerEditor({ mode }: { mode: WorkshopMode }) {
  const { world, editWorld, replaceWorld, clubById } = useStore();
  const [q, setQ] = useState('');
  const [clubFilter, setClubFilter] = useState<string>('');
  const [draft, setDraft] = useState<Player | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const list = useMemo(() => world.players
    .filter((p) => (clubFilter === '' ? true : clubFilter === '-' ? !p.contract : p.contract?.clubId === clubFilter))
    .filter((p) => !q || `${p.firstName} ${p.lastName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => overall(b) - overall(a)), [world, q, clubFilter]);
  const set = (patch: Partial<Player>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setup = mode === 'setup';

  /** Vor Spielbeginn: Änderung übernehmen und Datensatz neu aufbauen (Aufstellungen, Spielplan) */
  const commit = (players: Player[], ok: string) => {
    const r = rebuildWorld({ ...world, players });
    if (r.errors.length) return setMsg(`Nicht möglich: ${r.errors.slice(0, 2).join(' ')}`);
    replaceWorld(r.world);
    setMsg(ok);
  };
  const save = () => {
    if (!draft) return;
    if (!draft.firstName.trim() || !draft.lastName.trim()) return setMsg('Vor- und Nachname dürfen nicht leer sein.');
    if (!setup) {
      editWorld((w) => ({ ...w, players: w.players.map((p) => (p.id === draft.id ? { ...p, firstName: draft.firstName.trim(), lastName: draft.lastName.trim() } : p)) }));
      return setMsg('Gespeichert.');
    }
    const fixed = { ...draft, hidden: { ...draft.hidden, potential: Math.max(draft.hidden.potential, Math.round(overall(draft))) } };
    const exists = world.players.some((p) => p.id === draft.id);
    commit(exists ? world.players.map((p) => (p.id === draft.id ? fixed : p)) : [...world.players, fixed], 'Gespeichert.');
  };
  const remove = () => {
    if (!draft) return;
    commit(world.players.filter((p) => p.id !== draft.id), 'Spieler gelöscht.');
    setDraft(null);
  };
  const add = () => {
    const gen = new WorldGenerator({ seed: world.seed + world.players.length * 7, season: world.season, idPrefix: `ed${Date.now() % 100000}-` });
    const p = gen.generatePlayer({ position: 'C', quality: 95, age: 24, nationality: 'DE', clubId: null });
    setDraft({ ...p, firstName: 'Neuer', lastName: 'Spieler' });
    setMsg('Neuer Spieler – Werte anpassen und speichern.');
  };
  const setClub = (clubId: string) => {
    if (!draft) return;
    if (!clubId) return set({ contract: null });
    set({ contract: draft.contract?.clubId === clubId ? draft.contract : makeContract({ clubId, salary: draft.contract?.salary ?? 40_000, untilSeason: draft.contract?.untilSeason ?? world.season + 1, role: 'regular' }) });
  };

  return (
    <div className="editor-layout">
      <div className="stack">
        <div className="row-gap wrap">
          <input className="search" placeholder="Name suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={clubFilter} onChange={(e) => setClubFilter(e.target.value)} aria-label="Verein">
            <option value="">Alle Vereine</option>
            {world.clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="-">Vereinslos</option>
          </select>
          {setup && <button className="btn" onClick={add}>+ Spieler</button>}
        </div>
        <ul className="plain editor-list tall">
          {list.slice(0, 200).map((p) => (
            <li key={p.id}>
              <button className={`editor-item ${draft?.id === p.id ? 'on' : ''}`} onClick={() => { setDraft(structuredClone(p)); setMsg(null); }}>
                <span className={`pos pos-${p.position}`}>{p.position}</span>
                <span className="grow">{p.firstName} {p.lastName}</span>
                <small className="muted">{p.contract ? clubById.get(p.contract.clubId)?.shortName : '–'}</small>
                <b>{fmt1(toDisplay1(overall(p)))}</b>
              </button>
            </li>
          ))}
          {list.length > 200 && <li className="muted small">… {list.length - 200} weitere – Suche nutzen.</li>}
        </ul>
      </div>
      {draft ? (
        <section className="card editor-form">
          <div className="row-between"><h3>{draft.firstName} {draft.lastName}</h3><span className="rating" data-tip="Gesamtstärke auf der Position">{fmt1(toDisplay1(overall(draft)))}</span></div>
          <div className="form-grid">
            <label>Vorname<input value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} /></label>
            <label>Nachname<input value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} /></label>
            {setup && (
              <>
                <label>Geburtsdatum<input type="date" value={draft.birthDate} onChange={(e) => e.target.value && set({ birthDate: e.target.value })} /> <small className="muted">{ageOn(draft.birthDate, world.date)} Jahre</small></label>
                <label>Nation(en)<input value={draft.nationalities.join('/')} onChange={(e) => { const n = e.target.value.toUpperCase().split('/').map((x) => x.trim()).filter((x) => x.length === 2); if (n.length) set({ nationalities: n }); }} /></label>
                <label>Position<select value={draft.position} onChange={(e) => {
                  const pos = e.target.value as Position;
                  const goalie = pos === 'G' ? draft.goalie ?? Object.fromEntries(GOALIE_ATTRIBUTES.map((k) => [k, 90])) as Player['goalie'] : undefined;
                  set({ position: pos, goalie });
                }}>{POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}</select></label>
                <label>Schusshand<select value={draft.shoots} onChange={(e) => set({ shoots: e.target.value as 'L' | 'R' })}><option value="L">links</option><option value="R">rechts</option></select></label>
                <label>Verein<select value={draft.contract?.clubId ?? ''} onChange={(e) => setClub(e.target.value)}><option value="">vereinslos</option>{world.clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                {draft.contract && (
                  <>
                    <label>Gehalt (€)<input type="number" min={5000} step={1000} value={draft.contract.salary} onChange={(e) => set({ contract: { ...draft.contract!, salary: Math.max(5000, Number(e.target.value) || 0) } })} /></label>
                    <label>Vertrag bis (Saisonende)<input type="number" min={world.season + 1} max={world.season + 6} value={draft.contract.untilSeason + 1} onChange={(e) => set({ contract: { ...draft.contract!, untilSeason: Math.max(world.season, (Number(e.target.value) || world.season + 1) - 1) } })} /></label>
                  </>
                )}
                <Num label="Potenzial (Talent-Obergrenze)" value={draft.hidden.potential} onChange={(v) => set({ hidden: { ...draft.hidden, potential: v } })} />
              </>
            )}
          </div>
          {setup && (
            <>
              <h4>Charakter</h4>
              <div className="traits">
                {PLAYER_TRAITS.map((t) => {
                  const on = draft.traits.some((x) => x.id === t);
                  return <button key={t} className={`trait ${on ? TRAIT_LABEL[t].tone : 'off'}`} data-tip={TRAIT_LABEL[t].text}
                    onClick={() => set({ traits: on ? draft.traits.filter((x) => x.id !== t) : [...draft.traits, { id: t, strength: 75 }] })}>{TRAIT_LABEL[t].name}</button>;
                })}
              </div>
              <h4>Werte (1–20)</h4>
              <div className="attr-edit">
                {draft.position === 'G' && draft.goalie
                  ? GOALIE_ATTRIBUTES.map((k) => <Num key={k} label={GOALIE_LABEL[k]} value={draft.goalie![k]} onChange={(v) => set({ goalie: { ...draft.goalie!, [k]: v } })} />)
                  : SKATER_ATTRIBUTES.map((k) => <Num key={k} label={SKATER_LABEL[k]} value={draft.skater[k]} onChange={(v) => set({ skater: { ...draft.skater, [k]: v } })} />)}
              </div>
            </>
          )}
          <div className="row-gap wrap">
            <button className="btn primary" onClick={save}>Speichern</button>
            {setup && world.players.some((p) => p.id === draft.id) && <button className="btn ghost" onClick={remove}>Löschen</button>}
            {msg && <span className="small">{msg}</span>}
          </div>
          {setup && <p className="muted small">Wechsel von Verein oder Position baut Aufstellungen und Spielplan neu auf. Jeder Verein braucht mindestens 2 Torhüter, 6 Verteidiger und 12 Stürmer.</p>}
        </section>
      ) : <p className="muted">Spieler links auswählen{setup ? ' oder „+ Spieler“ anlegen' : ''}.</p>}
    </div>
  );
}
