import { useState } from 'react';
import type { Club, ClubProfile } from '@ehm/schema';
import { useStore } from '../../store.tsx';
import { Crest } from '../../components/Crest.tsx';
import { PROFILE_LABEL, euro } from '../../labels.ts';
import type { WorkshopMode } from './Workshop.tsx';

const PROFILES: ClubProfile[] = ['tradition', 'corporate', 'patron', 'development', 'promoted'];

/** Vereine bearbeiten: Namen, Kürzel, Farben, Halle; vor Spielbeginn auch Profil und Etat */
export function ClubEditor({ mode }: { mode: WorkshopMode }) {
  const { world, editWorld } = useStore();
  const [selId, setSelId] = useState(world.clubs[0]?.id);
  const club = world.clubs.find((c) => c.id === selId);
  const [draft, setDraft] = useState<Club | null>(club ? structuredClone(club) : null);
  const [msg, setMsg] = useState<string | null>(null);
  const select = (c: Club) => { setSelId(c.id); setDraft(structuredClone(c)); setMsg(null); };
  const set = (patch: Partial<Club>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const save = () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.shortName.trim()) return setMsg('Name und Kürzel dürfen nicht leer sein.');
    if (world.clubs.some((c) => c.id !== draft.id && c.shortName.toUpperCase() === draft.shortName.toUpperCase())) return setMsg(`Das Kürzel ${draft.shortName} ist schon vergeben.`);
    const d = { ...draft, shortName: draft.shortName.toUpperCase().slice(0, 4) };
    editWorld((w) => ({ ...w, clubs: w.clubs.map((c) => (c.id === d.id ? (mode === 'setup' ? d : { ...c, name: d.name, shortName: d.shortName, city: d.city, nickname: d.nickname, colors: d.colors, arena: { ...c.arena, name: d.arena.name } }) : c)) }));
    setMsg('Gespeichert.');
  };
  return (
    <div className="editor-layout">
      <ul className="plain editor-list">
        {world.clubs.map((c) => (
          <li key={c.id}><button className={`editor-item ${c.id === selId ? 'on' : ''}`} onClick={() => select(c)}><Crest club={c} size={22} />{c.name}</button></li>
        ))}
      </ul>
      {draft && (
        <section className="card editor-form">
          <div className="row-gap"><Crest club={draft} size={56} /><h3>{draft.name || '–'}</h3></div>
          <div className="form-grid">
            <label>Name<input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label>Kürzel (max. 4)<input value={draft.shortName} maxLength={4} onChange={(e) => set({ shortName: e.target.value.toUpperCase() })} /></label>
            <label>Stadt<input value={draft.city} onChange={(e) => set({ city: e.target.value })} /></label>
            <label>Spitzname<input value={draft.nickname} onChange={(e) => set({ nickname: e.target.value })} /></label>
            <label>Farbe 1<input type="color" value={draft.colors.primary} onChange={(e) => set({ colors: { ...draft.colors, primary: e.target.value } })} /></label>
            <label>Farbe 2<input type="color" value={draft.colors.secondary} onChange={(e) => set({ colors: { ...draft.colors, secondary: e.target.value } })} /></label>
            <label>Halle<input value={draft.arena.name} onChange={(e) => set({ arena: { ...draft.arena, name: e.target.value } })} /></label>
            {mode === 'setup' ? (
              <>
                <label>Plätze<input type="number" min={500} max={20000} step={100} value={draft.arena.capacity} onChange={(e) => set({ arena: { ...draft.arena, capacity: Math.max(500, Number(e.target.value) || 500) } })} /></label>
                <label>Profil<select value={draft.profile} onChange={(e) => set({ profile: e.target.value as ClubProfile })}>{PROFILES.map((p) => <option key={p} value={p}>{PROFILE_LABEL[p]}</option>)}</select></label>
                <label>Etat (€)<input type="number" min={500000} step={50000} value={draft.finances.budget} onChange={(e) => set({ finances: { ...draft.finances, budget: Math.max(500_000, Number(e.target.value) || 0) } })} /></label>
              </>
            ) : (
              <p className="muted small">Plätze {draft.arena.capacity.toLocaleString('de-DE')} · Etat {euro(draft.finances.budget)} · {PROFILE_LABEL[draft.profile]} (nur vor Spielbeginn änderbar)</p>
            )}
          </div>
          <div className="row-gap"><button className="btn primary" onClick={save}>Speichern</button>{msg && <span className="small">{msg}</span>}</div>
        </section>
      )}
    </div>
  );
}
