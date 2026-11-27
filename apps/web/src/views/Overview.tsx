import { useMemo } from 'react';
import { teamStrength, overall, toDisplay, ageOn, regularTable, nextFixtureOf, GOAL_LABEL, formatDate } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerName, ClubName } from '../ui.tsx';
import { RatingBadge } from '../components/Badges.tsx';
import { SaveCard } from '../components/SaveCard.tsx';
import { Crest } from '../components/Crest.tsx';
import { PROFILE_LABEL, euro } from '../labels.ts';
import type { Tab } from '../App.tsx';
import { Finances } from './Finances.tsx';
import { useState } from 'react';

export function Overview({ go }: { go: (t: Tab) => void }) {
  const [mode, setMode] = useState<'club' | 'finances'>('club');
  return (
    <div className="stack">
      <div className="tabs">
        <button className={mode === 'club' ? 'on' : ''} onClick={() => setMode('club')}>Übersicht</button>
        <button className={mode === 'finances' ? 'on' : ''} onClick={() => setMode('finances')}>Finanzen</button>
      </div>
      {mode === 'club' ? <ClubOverview go={go} /> : <Finances />}
    </div>
  );
}

function ClubOverview({ go }: { go: (t: Tab) => void }) {
  const { world, club, players, byId, clubById } = useStore();
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
  const comp = world.competition!;
  const table = regularTable(world);
  const place = table.findIndex((r) => r.clubId === club.id) + 1;
  const row = table[place - 1];
  const next = nextFixtureOf(comp, club.id);
  const played = comp.fixtures.filter((f) => f.result && (f.home === club.id || f.away === club.id)).slice(-6).reverse();

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
        <div className="kpi"><span>Saisonziel</span><strong>{club.seasonGoal ? GOAL_LABEL[club.seasonGoal] : '–'}</strong></div>
        <div className="kpi"><span>Datum</span><strong>{formatDate(world.date)}</strong></div>
      </section>

      <section className="card">
        <h3>Schlüsselspieler</h3>
        <ul className="plain">
          {stars.map((p) => (
            <li key={p.id} className="row-between">
              <span><PlayerName p={p} full /> <span className="muted">· {p.position}</span></span>
              <RatingBadge p={p} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Saison</h3>
          <button className="btn primary" onClick={() => go('match')}>Zum Spieltag</button>
        </div>
        <div className="kpis inner">
          <div className="kpi"><span>Tabellenplatz</span><strong>{row && row.gp ? `${place}.` : '–'}</strong></div>
          <div className="kpi"><span>Punkte</span><strong>{row?.pts ?? 0} aus {row?.gp ?? 0} Spielen</strong></div>
        </div>
        {next && (
          <p className="small">Nächstes Spiel ({formatDate(next.date, true)}): <b><ClubName c={clubById.get(next.home)!} /> – <ClubName c={clubById.get(next.away)!} /></b> {next.home === club.id ? '(Heim)' : '(Auswärts)'}</p>
        )}
        {played.length === 0 && <p className="muted">Noch keine Spiele. Stelle deine Reihen auf und starte den ersten Spieltag.</p>}
        <ul className="plain">
          {played.map((f) => {
            const h = clubById.get(f.home)!, a = clubById.get(f.away)!;
            const mine = f.home === club.id ? 0 : 1;
            const won = f.result!.score[mine] > f.result!.score[1 - mine];
            const r = f.result!;
            return (
              <li key={f.id} className="row-between">
                <span><ClubName c={h} /> – <ClubName c={a} /></span>
                <span className={won ? 'win' : 'loss'}>
                  {r.score[0]}:{r.score[1]}{r.decidedIn === 'OT' ? ' n.V.' : r.decidedIn === 'SO' ? ' n.P.' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <SaveCard />
    </div>
  );
}
