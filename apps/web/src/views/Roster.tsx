import { useMemo, useState } from 'react';
import type { Player } from '@ehm/schema';
import { overall, toDisplay, ageOn, offenseRating, defenseRating } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from '../components/PlayerSheet.tsx';
import { Scouting } from './Scouting.tsx';
import { Market } from './Market.tsx';
import { Planner } from './Planner.tsx';
import { TRAIT_LABEL, euro } from '../labels.ts';

const GROUPS: { title: string; pos: Player['position'][] }[] = [
  { title: 'Sturm', pos: ['C', 'LW', 'RW'] },
  { title: 'Verteidigung', pos: ['LD', 'RD'] },
  { title: 'Tor', pos: ['G'] },
];

type Sort = 'overall' | 'age' | 'salary' | 'off' | 'def';

export function Roster() {
  const [mode, setMode] = useState<'roster' | 'planner' | 'market' | 'scouting'>('roster');
  return (
    <div className="stack">
      <div className="tabs">
        <button className={mode === 'roster' ? 'on' : ''} onClick={() => setMode('roster')}>Kader</button>
        <button className={mode === 'planner' ? 'on' : ''} onClick={() => setMode('planner')}>Planer</button>
        <button className={mode === 'market' ? 'on' : ''} onClick={() => setMode('market')}>Markt</button>
        <button className={mode === 'scouting' ? 'on' : ''} onClick={() => setMode('scouting')}>Scouting</button>
      </div>
      {mode === 'roster' && <RosterList />}
      {mode === 'planner' && <Planner />}
      {mode === 'market' && <Market />}
      {mode === 'scouting' && <Scouting />}
    </div>
  );
}

function RosterList() {
  const { players, world, club } = useStore();
  const [sel, setSel] = useState<Player | null>(null);
  const [sort, setSort] = useState<Sort>('overall');
  const inLineup = useMemo(() => {
    const plan = club?.matchplan;
    return new Set(plan ? [...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies] : []);
  }, [club]);
  const key = (p: Player) =>
    sort === 'age' ? -ageOn(p.birthDate, world.date) : sort === 'salary' ? p.contract?.salary ?? 0 : sort === 'off' ? offenseRating(p) : sort === 'def' ? defenseRating(p) : overall(p);

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Kader <span className="muted small">{players.length}/{world.countries[0].rules.maxRoster}</span></h2>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortierung">
          <option value="overall">nach Stärke</option>
          <option value="off">nach Offensive</option>
          <option value="def">nach Defensive</option>
          <option value="age">nach Alter</option>
          <option value="salary">nach Gehalt</option>
        </select>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title} className="card flush">
          <h3 className="card-title">{g.title}</h3>
          <ul className="roster">
            {players
              .filter((p) => g.pos.includes(p.position))
              .sort((a, b) => key(b) - key(a))
              .map((p) => (
                <li key={p.id} onClick={() => setSel(p)}>
                  <span className={`pos pos-${p.position}`}>{p.position}</span>
                  <div className="roster-main">
                    <strong>{p.firstName[0]}. {p.lastName}</strong>
                    <small className="muted">
                      {ageOn(p.birthDate, world.date)} J · {p.nationalities.join('/')}
                      {!p.nationalities.includes('DE') && <span className="tag">Import</span>}
                      {!inLineup.has(p.id) && <span className="tag dim">Tribüne</span>}
                      {p.contract && p.contract.untilSeason <= world.season && !p.nextContract && <span className="tag mix">läuft aus</span>}
                      {p.nextContract && p.nextContract.clubId === club?.id && <span className="tag pos">verlängert</span>}
                      {p.nextContract && p.nextContract.clubId !== club?.id && <span className="tag neg">geht</span>}
                      {p.contract?.promises.some((x) => x.status !== 'ok') && <span className="tag neg">Versprechen</span>}
                      {p.traits.slice(0, 1).map((t) => <span key={t.id} className={`tag ${TRAIT_LABEL[t.id].tone}`}>{TRAIT_LABEL[t.id].name}</span>)}
                    </small>
                  </div>
                  <small className="muted salary">{euro(p.contract?.salary ?? 0)}</small>
                  <span className="rating">{toDisplay(overall(p))}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {sel && <PlayerSheet player={sel} date={world.date} onClose={() => setSel(null)} />}
    </div>
  );
}
