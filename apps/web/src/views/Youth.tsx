import { useState } from 'react';
import { youthOf, academyRating, playerView, ageOn, devFactors, ovrChange, talentStars, YOUTH } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerName } from '../ui.tsx';
import { OverallBadge } from '../components/Badges.tsx';
import { Talent } from '../components/Talent.tsx';
import { DevTempo } from '../components/DevTempo.tsx';
import { DevArrow } from '../components/DevArrow.tsx';
import { RatingBadge } from '../components/Badges.tsx';
import { euro } from '../labels.ts';

/** Offener Nachwuchsjahrgang: Fördervertrag oder Freigabe */
export function YouthDecisions({ compact }: { compact?: boolean }) {
  const { world, club, signYouth, releaseYouth } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  if (!club) return null;
  const open = youthOf(world, club.id);
  if (!open.length) return compact ? null : <p className="muted small">Kein offener Jahrgang. Der nächste kommt im Sommer (Sommerpause, Phase „Sommertraining“).</p>;
  return (
    <section className="card flush">
      <h3 className="card-title">Nachwuchsjahrgang {world.season + 1} · {open.length} Talente</h3>
      <p className="muted small pad">Fördervertrag: {YOUTH.YEARS} Jahre, {euro(YOUTH.SALARY)} pro Jahr, ab der neuen Saison. Nicht übernommene Talente werden beim Saisonwechsel vereinslos – dann können andere Vereine sie holen.</p>
      <ul className="roster">
        {open.sort((a, b) => b.hidden.potential - a.hidden.potential).map((p) => {
          const v = playerView(world, club.id, p, ageOn(p.birthDate, world.date));
          return (
            <li key={p.id} className="static">
              <span className={`pos pos-${p.position}`}>{p.position}</span>
              <div className="roster-main">
                <strong><PlayerName p={p} /> <Talent view={v.talent} compact /></strong>
                <small className="muted">{ageOn(p.birthDate, world.date)} J · Entwicklung: {v.potential}</small>
              </div>
              <OverallBadge v={v} />
              <span className="row-gap">
                <button className="btn small primary" onClick={() => setMsg(signYouth(p.id))}>Fördervertrag</button>
                <button className="btn small ghost" onClick={() => releaseYouth(p.id)}>Freigeben</button>
              </span>
            </li>
          );
        })}
      </ul>
      {msg && <p className="loss small pad">{msg}</p>}
    </section>
  );
}

/** Kader › Nachwuchs: offener Jahrgang und eigene Talente unter Vertrag */
export function Youth() {
  const { world, club, players } = useStore();
  if (!club) return null;
  const academy = academyRating(world, club.id);
  const prospects = players.filter((p) => ageOn(p.birthDate, world.date) <= 21).sort((a, b) => b.hidden.potential - a.hidden.potential);
  return (
    <div className="stack">
      <div className="row-between">
        <h2>Nachwuchs</h2>
        <span className="tag" data-tip="Qualität der Nachwuchsarbeit: bester Entwicklungswert im Trainerteam. Beeinflusst Größe und Stärke des jährlichen Jahrgangs.">Nachwuchsarbeit {academy}/20</span>
      </div>
      <YouthDecisions />
      <section className="card flush">
        <h3 className="card-title">Junge Spieler im Kader (bis 21)</h3>
        {prospects.length === 0 ? <p className="muted pad">Keine jungen Spieler im Kader.</p> : (
          <ul className="roster">
            {prospects.map((p) => {
              const f = devFactors(world, p, world.date);
              return (
                <li key={p.id} className="static">
                  <span className={`pos pos-${p.position}`}>{p.position}</span>
                  <div className="roster-main">
                    <strong><PlayerName p={p} /> <Talent view={{ stars: talentStars(p.hidden.potential) }} compact /></strong>
                    <small className="muted">{f.age} J · Tempo <DevTempo f={f} /></small>
                  </div>
                  <DevArrow delta={ovrChange(p)} always />
                  <RatingBadge p={p} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="muted small">Junge Spieler entwickeln sich am schnellsten mit Eiszeit, einem guten Entwicklungstrainer und einem Mentor im Team. Auf der Tribüne geht es langsamer voran.</p>
    </div>
  );
}
