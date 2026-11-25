import type { Staff, StaffRole } from '@ehm/schema';
import { REGIONS, REGION_LABEL, regionOf, toDisplay, ageOn, type Region } from '@ehm/core';
import { useStore } from '../store.tsx';
import { TRAIT_LABEL, NATION_LABEL, euro } from '../labels.ts';

const ROLE_LABEL: Record<StaffRole, string> = {
  headCoach: 'Cheftrainer', assistantCoach: 'Co-Trainer', goalieCoach: 'Torwarttrainer', scout: 'Scout',
  youthCoach: 'Nachwuchstrainer', manager: 'Geschäftsführer',
};
const ORDER: StaffRole[] = ['headCoach', 'assistantCoach', 'goalieCoach', 'youthCoach', 'scout', 'manager'];

const RATINGS: { key: keyof Staff['ratings']; label: string; effect: string; active: boolean }[] = [
  { key: 'tactics', label: 'Taktik', effect: 'Coaching-Regeln und Einüben neuer Systeme', active: false },
  { key: 'motivation', label: 'Motivation', effect: 'Moral und Teamklima', active: true },
  { key: 'discipline', label: 'Disziplin', effect: 'weniger Strafen', active: true },
  { key: 'development', label: 'Entwicklung', effect: 'Fortschritt junger Spieler', active: false },
  { key: 'scouting', label: 'Scouting', effect: 'Tempo und Genauigkeit der Berichte', active: true },
];

/** Welche Werte für die jeweilige Rolle zählen */
const RELEVANT: Record<StaffRole, (keyof Staff['ratings'])[]> = {
  headCoach: ['tactics', 'motivation', 'discipline', 'development'],
  assistantCoach: ['tactics', 'development', 'discipline'],
  goalieCoach: ['development'],
  youthCoach: ['development'],
  scout: ['scouting'],
  manager: [],
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

export function StaffView() {
  const { world, club, setScoutRegion } = useStore();
  if (!club) return null;
  const staff = world.staff.filter((s) => s.contract?.clubId === club.id).sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));
  const total = staff.reduce((s, x) => s + (x.contract?.salary ?? 0), 0);
  const regionCount = (r: Region) => world.players.filter((p) => p.contract?.clubId !== club.id && regionOf(p) === r).length;

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Staff</h2>
        <span className="muted small">{staff.length} Personen · {euro(total)} / Jahr</span>
      </div>
      {staff.map((s) => {
        const relevant = RELEVANT[s.role];
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
            </div>
            {s.traits.length > 0 && (
              <div className="traits">
                {s.traits.map((t) => <span key={t.id} className={`trait ${TRAIT_LABEL[t.id].tone}`} title={TRAIT_LABEL[t.id].text}>{TRAIT_LABEL[t.id].name}</span>)}
              </div>
            )}
            {s.traits.map((t) => <p key={t.id} className="muted small trait-text">{TRAIT_LABEL[t.id].name}: {TRAIT_LABEL[t.id].text}</p>)}
            {RATINGS.filter((r) => relevant.includes(r.key)).map((r) => (
              <Bar key={r.key} label={r.label} value={s.ratings[r.key]} note={`${r.effect}${r.active ? '' : ' – wirkt ab einem späteren Meilenstein'}`} />
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
      <p className="muted small">Neue Trainer, Scouts und die medizinische Abteilung kannst du in einem späteren Meilenstein über einen Staff-Markt einstellen.</p>
    </div>
  );
}
