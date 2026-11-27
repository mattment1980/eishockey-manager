import { useState } from 'react';
import type { Staff, StaffRole } from '@ehm/schema';
import {
  REGIONS, REGION_LABEL, regionOf, toDisplay, ageOn, type Region, STAFF_ROLE_LABEL as ROLE_LABEL, ROLE_LIMIT, ROLE_MAIN,
  askingSalary, severance, medicalFactors,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { TRAIT_LABEL, NATION_LABEL, euro } from '../labels.ts';

const ORDER: StaffRole[] = ['headCoach', 'assistantCoach', 'goalieCoach', 'youthCoach', 'scout', 'doctor', 'physio', 'athleticsCoach', 'manager'];
const MARKET: StaffRole[] = ['headCoach', 'assistantCoach', 'goalieCoach', 'youthCoach', 'scout', 'doctor', 'physio', 'athleticsCoach'];

const RATINGS: { key: keyof Staff['ratings']; label: string; effect: string }[] = [
  { key: 'tactics', label: 'Taktik', effect: 'Coaching-Regeln und Einüben neuer Systeme' },
  { key: 'motivation', label: 'Motivation', effect: 'Moral und Teamklima' },
  { key: 'discipline', label: 'Disziplin', effect: 'weniger Strafen' },
  { key: 'development', label: 'Entwicklung', effect: 'Fortschritt der Spieler' },
  { key: 'scouting', label: 'Scouting', effect: 'Tempo und Genauigkeit der Berichte' },
  { key: 'medical', label: 'Medizin', effect: '' },
];

const MEDICAL_EFFECT: Partial<Record<StaffRole, string>> = {
  doctor: 'genauere Prognosen, weniger Rückfälle',
  physio: 'kürzere Ausfallzeiten',
  athleticsCoach: 'weniger Verletzungen (Prävention)',
};

/** Welche Werte für die jeweilige Rolle zählen */
const RELEVANT: Record<StaffRole, (keyof Staff['ratings'])[]> = {
  headCoach: ['tactics', 'motivation', 'discipline', 'development'],
  assistantCoach: ['tactics', 'development', 'discipline'],
  goalieCoach: ['development'],
  youthCoach: ['development'],
  scout: ['scouting'],
  manager: [],
  doctor: ['medical'],
  physio: ['medical'],
  athleticsCoach: ['medical'],
};

function Bar({ label, value, note }: { label: string; value: number; note: string }) {
  const d = toDisplay(value);
  const tone = d >= 15 ? 'hi' : d >= 11 ? 'mid' : d >= 7 ? 'lo' : 'bad';
  return (
    <div className="attr staff-attr">
      <span>{label}<small className="muted">{note}</small></span>
      <div className="attr-bar"><div className={tone} style={{ width: `${d * 5}%` }} /></div>
      <b className={tone}>{d}</b>
    </div>
  );
}

const pctChange = (f: number) => { const v = Math.round(Math.abs(1 - f) * 100); return v === 0 ? '±0 %' : `${f < 1 ? '−' : '+'}${v} %`; };

export function StaffView() {
  const { world, club, setScoutRegion, releaseStaff } = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!club) return null;
  const staff = world.staff.filter((s) => s.contract?.clubId === club.id).sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));
  const total = staff.reduce((s, x) => s + (x.contract?.salary ?? 0), 0);
  const regionCount = (r: Region) => world.players.filter((p) => p.contract?.clubId !== club.id && regionOf(p) === r).length;
  const med = medicalFactors(world, club.id);
  const vacant = (['doctor', 'physio', 'athleticsCoach'] as StaffRole[]).filter((r) => !staff.some((s) => s.role === r));

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Staff</h2>
        <span className="muted small">{staff.length} Personen · {euro(total)} / Jahr</span>
      </div>

      <section className="card med-summary">
        <h3>Medizinische Abteilung</h3>
        <div className="kpis">
          <div className="kpi" data-tip="Athletiktrainer: Vorbeugung gegen Verletzungen im Spiel und durch Überlastung"><span>Verletzungsrisiko</span><strong className={med.risk <= 1 ? 'up' : 'down'}>{pctChange(med.risk)}</strong></div>
          <div className="kpi" data-tip="Physiotherapeut: wie schnell verletzte Spieler zurückkommen"><span>Ausfallzeiten</span><strong className={med.duration <= 1 ? 'up' : 'down'}>{pctChange(med.duration)}</strong></div>
          <div className="kpi" data-tip="Mannschaftsarzt: Rückfallrisiko angeschlagener Spieler und Genauigkeit der Prognose"><span>Rückfälle</span><strong className={med.relapse <= 1 ? 'up' : 'down'}>{pctChange(med.relapse)}</strong></div>
        </div>
        {vacant.length > 0 && <p className="alert small">Unbesetzt: {vacant.map((r) => ROLE_LABEL[r]).join(', ')} – das erhöht Risiko und Ausfallzeiten. Unten auf dem Staff-Markt findest du Kandidaten.</p>}
      </section>

      {staff.map((s) => {
        const relevant = RELEVANT[s.role];
        const cost = severance(world, s);
        return (
          <section key={s.id} className="card">
            <div className="row-between">
              <div>
                <div className="muted small">{ROLE_LABEL[s.role]}</div>
                <h3 className="staff-name">{s.firstName} {s.lastName}</h3>
                <div className="muted small">
                  {ageOn(s.birthDate, world.date)} J · {NATION_LABEL[s.nationalities[0]] ?? s.nationalities[0]}
                  {s.contract && ` · ${euro(s.contract.salary)} · bis ${s.contract.untilSeason + 1}`}
                </div>
              </div>
              {confirm === s.id ? (
                <div className="btn-row">
                  <button className="btn small danger" onClick={() => { releaseStaff(s.id); setConfirm(null); }}>Entlassen ({euro(cost)})</button>
                  <button className="btn small" onClick={() => setConfirm(null)}>Abbrechen</button>
                </div>
              ) : (
                <button className="btn ghost small" onClick={() => setConfirm(s.id)} data-tip={`Abfindung: halbes Restgehalt, hier ${euro(cost)}`}>Entlassen …</button>
              )}
            </div>
            {s.traits.length > 0 && (
              <div className="traits">
                {s.traits.map((t) => <span key={t.id} className={`trait ${TRAIT_LABEL[t.id].tone}`} data-tip={TRAIT_LABEL[t.id].text}>{TRAIT_LABEL[t.id].name}</span>)}
              </div>
            )}
            {s.traits.map((t) => <p key={t.id} className="muted small trait-text">{TRAIT_LABEL[t.id].name}: {TRAIT_LABEL[t.id].text}</p>)}
            {RATINGS.filter((r) => relevant.includes(r.key)).map((r) => (
              <Bar key={r.key} label={r.label} value={s.ratings[r.key]} note={r.key === 'medical' ? MEDICAL_EFFECT[s.role] ?? '' : r.effect} />
            ))}
            {s.role === 'scout' && (
              <div className="scout-assign">
                <label className="field">
                  <span className="small">Einsatzregion</span>
                  <select className="select" value={s.region ?? 'DE'} onChange={(e) => setScoutRegion(s.id, e.target.value)}>
                    {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]} ({regionCount(r)} Spieler)</option>)}
                  </select>
                </label>
                <p className="muted small">Schafft ca. {Math.round((110 + 0.6 * s.ratings.scouting) / 60)} Spieler pro Woche. Beobachtete Spieler (Kader → Scouting) haben Vorrang.</p>
              </div>
            )}
          </section>
        );
      })}

      <StaffMarket />
    </div>
  );
}

function StaffMarket() {
  const { world, club, hireStaff } = useStore();
  const [role, setRole] = useState<StaffRole>('doctor');
  const [seasons, setSeasons] = useState(2);
  if (!club) return null;
  const mine = world.staff.filter((s) => s.contract?.clubId === club.id && s.role === role).length;
  const full = mine >= ROLE_LIMIT[role];
  const free = world.staff.filter((s) => !s.contract && s.role === role).sort((a, b) => b.ratings[ROLE_MAIN[role]] - a.ratings[ROLE_MAIN[role]]);
  return (
    <section className="card">
      <h3>Staff-Markt</h3>
      <p className="muted small">Vereinslose Trainer, Scouts und medizinisches Personal. Das Gehalt läuft monatlich über „Gehälter Staff“.</p>
      <div className="segmented small-seg">
        {MARKET.map((r) => <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>)}
      </div>
      <div className="row-between small market-opts">
        <span className="muted">{mine} / {ROLE_LIMIT[role]} besetzt{full ? ' – für eine Neueinstellung erst jemanden entlassen' : ''}</span>
        <label>Laufzeit{' '}
          <select className="select" value={seasons} onChange={(e) => setSeasons(Number(e.target.value))}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'Saison' : 'Saisons'}</option>)}
          </select>
        </label>
      </div>
      {free.length === 0 ? <p className="muted small">Zurzeit niemand verfügbar.</p> : (
        <ul className="staff-market">
          {free.map((s) => (
            <li key={s.id}>
              <div>
                <b>{s.firstName} {s.lastName}</b> <span className="muted small">{ageOn(s.birthDate, world.date)} J · {NATION_LABEL[s.nationalities[0]] ?? s.nationalities[0]}</span>
                <div className="small muted">
                  {RELEVANT[role].map((k) => `${RATINGS.find((r) => r.key === k)!.label} ${toDisplay(s.ratings[k])}`).join(' · ')}
                  {s.traits.map((t) => ` · ${TRAIT_LABEL[t.id].name}`).join('')}
                </div>
              </div>
              <button className="btn small primary" disabled={full} onClick={() => hireStaff(s.id, seasons)}>Einstellen · {euro(askingSalary(s))} / Jahr</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
