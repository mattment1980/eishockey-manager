import { useMemo, useState } from 'react';
import type { Player } from '@ehm/schema';
import { overall, toDisplay, ageOn, offenseRating, defenseRating, perkCost, ROLE_LABEL } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from '../components/PlayerSheet.tsx';
import { Scouting } from './Scouting.tsx';
import { Market } from './Market.tsx';
import { Planner } from './Planner.tsx';
import { Locker } from './Locker.tsx';
import { TRAIT_LABEL, SKATER_LABEL, GOALIE_LABEL, euro, mmss } from '../labels.ts';

const GROUPS: { title: string; pos: Player['position'][] }[] = [
  { title: 'Sturm', pos: ['C', 'LW', 'RW'] },
  { title: 'Verteidigung', pos: ['LD', 'RD'] },
  { title: 'Tor', pos: ['G'] },
];

type Sort = 'overall' | 'age' | 'salary' | 'off' | 'def' | 'points';

export function Roster() {
  const [mode, setMode] = useState<'roster' | 'locker' | 'planner' | 'market' | 'scouting'>('roster');
  return (
    <div className="stack">
      <div className="tabs">
        <button className={mode === 'roster' ? 'on' : ''} onClick={() => setMode('roster')}>Kader</button>
        <button className={mode === 'locker' ? 'on' : ''} onClick={() => setMode('locker')}>Kabine</button>
        <button className={mode === 'planner' ? 'on' : ''} onClick={() => setMode('planner')}>Planer</button>
        <button className={mode === 'market' ? 'on' : ''} onClick={() => setMode('market')}>Markt</button>
        <button className={mode === 'scouting' ? 'on' : ''} onClick={() => setMode('scouting')}>Scouting</button>
      </div>
      {mode === 'roster' && <RosterList />}
      {mode === 'locker' && <Locker />}
      {mode === 'planner' && <Planner />}
      {mode === 'market' && <Market />}
      {mode === 'scouting' && <Scouting />}
    </div>
  );
}

type View = 'overview' | 'stats' | 'skills' | 'contract';

function skillList(p: Player): { label: string; value: number }[] {
  if (p.position === 'G' && p.goalie) {
    return (Object.keys(GOALIE_LABEL) as (keyof typeof GOALIE_LABEL)[]).map((k) => ({ label: GOALIE_LABEL[k], value: toDisplay(p.goalie![k]) }));
  }
  const skip = new Set(['discipline', 'leadership', ...(p.position === 'C' ? [] : ['faceoffs'])]);
  return (Object.keys(SKATER_LABEL) as (keyof typeof SKATER_LABEL)[]).filter((k) => !skip.has(k)).map((k) => ({ label: SKATER_LABEL[k], value: toDisplay(p.skater[k]) }));
}

function RosterList() {
  const { players, world, club, clubById } = useStore();
  const [sel, setSel] = useState<Player | null>(null);
  const [sort, setSort] = useState<Sort>('overall');
  const [view, setView] = useState<View>('overview');
  const inLineup = useMemo(() => {
    const plan = club?.matchplan;
    return new Set(plan ? [...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies] : []);
  }, [club]);
  const comp = world.competition;
  const line = (id: string) => {
    const r = comp?.stats.regular[id], q = comp?.stats.post[id];
    const z = { gp: 0, g: 0, a: 0, pim: 0, pm: 0, sog: 0, toi: 0, gs: 0, sa: 0, ga: 0, w: 0, so: 0 };
    const add = (x: typeof z, y?: typeof z) => (y ? Object.fromEntries(Object.keys(x).map((k) => [k, (x as Record<string, number>)[k] + (y as Record<string, number>)[k]])) as typeof z : x);
    return add(add(z, r), q);
  };
  const key = (p: Player) => {
    if (sort === 'age') return -ageOn(p.birthDate, world.date);
    if (sort === 'salary') return p.contract?.salary ?? 0;
    if (sort === 'off') return offenseRating(p);
    if (sort === 'def') return defenseRating(p);
    if (sort === 'points') { const l = line(p.id); return p.position === 'G' ? (l.sa ? (l.sa - l.ga) / l.sa : 0) : l.g + l.a; }
    return overall(p);
  };
  const statusTag = (p: Player) => (
    <>
      {p.contract && p.contract.untilSeason <= world.season && !p.nextContract && <span className="tag mix">läuft aus</span>}
      {p.nextContract && p.nextContract.clubId === club?.id && <span className="tag pos">verlängert</span>}
      {p.nextContract && p.nextContract.clubId !== club?.id && <span className="tag neg">geht</span>}
    </>
  );
  const name = (p: Player) => (
    <span onClick={() => setSel(p)} className="cell-name"><span className={`pos pos-${p.position}`}>{p.position}</span>{p.firstName[0]}. {p.lastName}</span>
  );

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Kader <span className="muted small">{players.length}/{world.countries[0].rules.maxRoster}</span></h2>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortierung">
          <option value="overall">nach Stärke</option>
          <option value="points">nach Punkten</option>
          <option value="off">nach Offensive</option>
          <option value="def">nach Defensive</option>
          <option value="age">nach Alter</option>
          <option value="salary">nach Gehalt</option>
        </select>
      </div>
      <div className="segmented small-seg">
        {([['overview', 'Übersicht'], ['stats', 'Leistung'], ['skills', 'Stärken'], ['contract', 'Vertrag']] as [View, string][]).map(([id, l]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{l}</button>
        ))}
      </div>
      {GROUPS.map((g) => {
        const list = players.filter((p) => g.pos.includes(p.position)).sort((a, b) => key(b) - key(a));
        const goalies = g.title === 'Tor';
        return (
          <section key={g.title} className="card flush">
            <h3 className="card-title">{g.title}</h3>

            {view === 'overview' && (
              <ul className="roster">
                {list.map((p) => (
                  <li key={p.id} onClick={() => setSel(p)}>
                    <span className={`pos pos-${p.position}`}>{p.position}</span>
                    <div className="roster-main">
                      <strong>{p.firstName[0]}. {p.lastName}</strong>
                      <small className="muted">
                        {ageOn(p.birthDate, world.date)} J · {p.nationalities.join('/')}
                        {!p.nationalities.includes('DE') && <span className="tag">Import</span>}
                        {!inLineup.has(p.id) && <span className="tag dim">Tribüne</span>}
                        {statusTag(p)}
                        {p.contract?.promises.some((x) => x.status !== 'ok') && <span className="tag neg">Versprechen</span>}
                        {p.traits.slice(0, 1).map((t) => <span key={t.id} className={`tag ${TRAIT_LABEL[t.id].tone}`}>{TRAIT_LABEL[t.id].name}</span>)}
                      </small>
                    </div>
                    <small className="muted salary">{euro(p.contract?.salary ?? 0)}</small>
                    <span className="rating">{toDisplay(overall(p))}</span>
                  </li>
                ))}
              </ul>
            )}

            {view === 'stats' && (
              <table className="stats roster-table">
                <thead>
                  {goalies
                    ? <tr><th>Spieler</th><th>Sp</th><th>S</th><th>Fq</th><th>GAA</th><th>SO</th></tr>
                    : <tr><th>Spieler</th><th>Sp</th><th>T</th><th>A</th><th>P</th><th>+/-</th><th>S</th><th>SM</th><th>Eis/Sp</th></tr>}
                </thead>
                <tbody>
                  {list.map((p) => {
                    const l = line(p.id);
                    return goalies ? (
                      <tr key={p.id}>
                        <td>{name(p)}</td><td>{l.gs}</td><td>{l.w}</td>
                        <td>{l.sa ? (((l.sa - l.ga) / l.sa) * 100).toFixed(1).replace('.', ',') : '–'}</td>
                        <td>{l.toi ? ((l.ga * 3600) / l.toi).toFixed(2).replace('.', ',') : '–'}</td><td>{l.so}</td>
                      </tr>
                    ) : (
                      <tr key={p.id}>
                        <td>{name(p)}</td><td>{l.gp}</td><td>{l.g}</td><td>{l.a}</td><td><b>{l.g + l.a}</b></td>
                        <td>{l.pm > 0 ? '+' : ''}{l.pm}</td><td>{l.sog}</td><td>{l.pim}</td>
                        <td>{l.gp ? mmss(l.toi / l.gp) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {view === 'skills' && (
              <ul className="roster">
                {list.map((p) => {
                  const skills = skillList(p).sort((a, b) => b.value - a.value);
                  return (
                    <li key={p.id} onClick={() => setSel(p)}>
                      <span className={`pos pos-${p.position}`}>{p.position}</span>
                      <div className="roster-main">
                        <strong>{p.firstName[0]}. {p.lastName}</strong>
                        <div className="skill-chips">{skills.slice(0, 4).map((s) => <span key={s.label} className="chip top">{s.label} {s.value}</span>)}</div>
                        <div className="skill-chips">{skills.slice(-4).reverse().map((s) => <span key={s.label} className="chip low">{s.label} {s.value}</span>)}</div>
                      </div>
                      <span className="rating">{toDisplay(overall(p))}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {view === 'contract' && (
              <table className="stats roster-table">
                <thead><tr><th>Spieler</th><th>Gehalt / Extras</th><th>bis</th></tr></thead>
                <tbody>
                  {list.map((p) => {
                    const c = p.contract!;
                    const extras = perkCost(c.perks);
                    return (
                      <tr key={p.id}>
                        <td>
                          {name(p)}
                          <div className="muted small">{ROLE_LABEL[c.role]}{c.promises.length ? ` · ${c.promises.length} Verspr.` : ''}{c.clauses.exit ? ' · Ausstieg' : ''}</div>
                          <div>{statusTag(p)}{p.nextContract && p.nextContract.clubId !== club?.id && <span className="muted small"> → {clubById.get(p.nextContract.clubId)?.shortName}</span>}</div>
                        </td>
                        <td>{euro(c.salary)}<div className="muted small">{extras ? `+ ${euro(extras)}` : ''}</div></td>
                        <td>{c.untilSeason + 1}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {sel && <PlayerSheet player={sel} date={world.date} onClose={() => setSel(null)} />}
    </div>
  );
}
