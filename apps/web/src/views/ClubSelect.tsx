import { useMemo } from 'react';
import { teamStrength } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';
import { PROFILE_LABEL, euro } from '../labels.ts';

export function ClubSelect() {
  const { world, byId, chooseClub } = useStore();
  const clubs = useMemo(
    () =>
      world.clubs
        .map((c) => ({ c, s: teamStrength(c.matchplan!, byId) }))
        .sort((a, b) => b.s - a.s),
    [world, byId],
  );
  const max = clubs[0].s, min = clubs[clubs.length - 1].s;
  return (
    <div className="select-screen">
      <div className="hero">
        <div className="hero-kicker">Eishockey-Manager · Testbuild</div>
        <h1>Wähle deinen Verein</h1>
        <p>Testliga nach DEL2-Modell: 14 Vereine, 52 Hauptrundenspiele. Der Verein bestimmt den Schwierigkeitsgrad.</p>
      </div>
      <div className="club-grid">
        {clubs.map(({ c, s }) => {
          const rel = (s - min) / Math.max(1, max - min);
          const diff = rel > 0.7 ? 'Favorit' : rel > 0.35 ? 'Mittelfeld' : 'Außenseiter';
          return (
            <button key={c.id} className="club-card" onClick={() => chooseClub(c.id)} style={{ ['--club' as string]: c.colors.primary }}>
              <Crest club={c} size={52} />
              <div className="club-card-body">
                <strong>{c.name}</strong>
                <span>{PROFILE_LABEL[c.profile]} · Etat {euro(c.finances.budget)}</span>
                <div className="meter"><div style={{ width: `${20 + rel * 80}%` }} /></div>
                <small>{diff}</small>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
