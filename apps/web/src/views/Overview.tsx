import { useMemo } from 'react';
import { teamStrength, overall, toDisplay, ageOn } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';
import { PROFILE_LABEL, euro } from '../labels.ts';
import type { Tab } from '../App.tsx';

export function Overview({ go }: { go: (t: Tab) => void }) {
  const { world, club, players, byId, results, newGame } = useStore();
  const ranking = useMemo(
    () => world.clubs.map((c) => ({ c, s: teamStrength(c.matchplan!, byId) })).sort((a, b) => b.s - a.s),
    [world, byId],
  );
  if (!club) return null;
  const rank = ranking.findIndex((r) => r.c.id === club.id) + 1;
  const payroll = players.reduce((s, p) => s + (p.contract?.salary ?? 0), 0);
  const imports = players.filter((p) => !p.nationalities.includes('DE')).length;
  const avgAge = players.reduce((s, p) => s + ageOn(p.birthDate, world.date), 0) / players.length;
  const stars = [...players].sort((a, b) => overall(b) - overall(a)).slice(0, 3);
  const clubById = new Map(world.clubs.map((c) => [c.id, c]));

  return (
    <div className="stack">
      <section className="card club-hero">
        <Crest club={club} size={72} />
        <div>
          <h2>{club.name}</h2>
          <p className="muted">{PROFILE_LABEL[club.profile]} · {club.arena.name} ({club.arena.capacity.toLocaleString('de-DE')} Plätze)</p>
        </div>
      </section>

      <section className="kpis">
        <div className="kpi"><span>Kaderstärke</span><strong>{rank}. von 14</strong></div>
        <div className="kpi"><span>Etat</span><strong>{euro(club.finances.budget)}</strong></div>
        <div className="kpi"><span>Gehälter Spieler</span><strong>{euro(payroll)}</strong></div>
        <div className="kpi"><span>Kontostand</span><strong>{euro(club.finances.balance)}</strong></div>
        <div className="kpi"><span>Kader</span><strong>{players.length} Spieler</strong></div>
        <div className="kpi"><span>Ausländer</span><strong>{imports} / {world.countries[0].rules.importSlotsRoster}</strong></div>
        <div className="kpi"><span>Ø Alter</span><strong>{avgAge.toFixed(1).replace('.', ',')} Jahre</strong></div>
        <div className="kpi"><span>Vorstand</span><strong>{club.boardConfidence} % Vertrauen</strong></div>
      </section>

      <section className="card">
        <h3>Schlüsselspieler</h3>
        <ul className="plain">
          {stars.map((p) => (
            <li key={p.id} className="row-between">
              <span>{p.firstName} {p.lastName} <span className="muted">· {p.position}</span></span>
              <span className="rating">{toDisplay(overall(p))}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Letzte Spiele</h3>
          <button className="btn primary" onClick={() => go('match')}>Zum Spiel</button>
        </div>
        {results.length === 0 && <p className="muted">Noch keine Spiele. Stelle deine Reihen auf und starte ein Testspiel.</p>}
        <ul className="plain">
          {results.slice(0, 6).map((r, i) => {
            const h = clubById.get(r.homeId)!, a = clubById.get(r.awayId)!;
            const mine = r.homeId === club.id ? 0 : 1;
            const won = r.score[mine] > r.score[1 - mine];
            return (
              <li key={i} className="row-between">
                <span>{h.shortName} – {a.shortName}</span>
                <span className={won ? 'win' : 'loss'}>
                  {r.score[0]}:{r.score[1]}{r.decidedIn === 'OT' ? ' n.V.' : r.decidedIn === 'SO' ? ' n.P.' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h3>Spielstand</h3>
        <p className="muted">Wird automatisch in diesem Browser gespeichert.</p>
        <button className="btn ghost" onClick={() => { if (confirmReset()) newGame(); }}>Neues Spiel beginnen</button>
      </section>
    </div>
  );
}

function confirmReset(): boolean {
  try {
    return window.confirm('Neues Spiel beginnen? Der aktuelle Spielstand wird gelöscht.');
  } catch {
    return true;
  }
}
