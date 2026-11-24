import { useMemo, useState } from 'react';
import type { Fixture, Series, StatLine } from '@ehm/schema';
import { regularTable, regularDays, fixturesOfDay } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';

type View = 'table' | 'games' | 'playoffs' | 'stats';

export function League() {
  const [view, setView] = useState<View>('table');
  const { world } = useStore();
  const comp = world.competition!;
  return (
    <div className="stack">
      <div className="row-between">
        <h2>{world.leagues[0].name}</h2>
        <span className="muted small">Saison {comp.year}/{String(comp.year + 1).slice(2)}</span>
      </div>
      <div className="tabs">
        {([['table', 'Tabelle'], ['games', 'Spiele'], ['playoffs', 'Playoffs'], ['stats', 'Statistik']] as [View, string][]).map(([id, l]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{l}</button>
        ))}
      </div>
      {view === 'table' && <Table />}
      {view === 'games' && <Games />}
      {view === 'playoffs' && <Playoffs />}
      {view === 'stats' && <Stats />}
    </div>
  );
}

function Table() {
  const { world, club, clubById } = useStore();
  const table = regularTable(world);
  const fmt = world.leagues[0].format;
  const zone = (place: number) =>
    place <= fmt.directPlayoffs[1] ? 'z-po' : fmt.prePlayoffs && place <= fmt.prePlayoffs[1] ? 'z-pre' : fmt.playdowns && place >= fmt.playdowns[0] ? 'z-pd' : '';
  return (
    <section className="card flush">
      <table className="stats league">
        <thead><tr><th>#</th><th>Verein</th><th>Sp</th><th>S</th><th>SnV</th><th>NnV</th><th>N</th><th>Diff</th><th>Pkt</th></tr></thead>
        <tbody>
          {table.map((r, i) => {
            const c = clubById.get(r.clubId)!;
            return (
              <tr key={r.clubId} className={`${zone(i + 1)} ${c.id === club?.id ? 'me' : ''}`}>
                <td>{i + 1}</td>
                <td><span className="tteam"><Crest club={c} size={20} />{c.shortName}</span></td>
                <td>{r.gp}</td><td>{r.w}</td><td>{r.otw}</td><td>{r.otl}</td><td>{r.l}</td>
                <td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td>
                <td><b>{r.pts}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="legend small muted pad">
        <span><i className="zone z-po" /> Viertelfinale</span>
        <span><i className="zone z-pre" /> Pre-Playoffs</span>
        <span><i className="zone z-pd" /> Playdowns</span>
      </div>
    </section>
  );
}

function Games() {
  const { world, club, clubById } = useStore();
  const comp = world.competition!;
  const maxDay = Math.max(1, ...comp.fixtures.map((f) => f.day));
  const [day, setDay] = useState(Math.max(1, Math.min(comp.day || 1, maxDay)));
  const list = fixturesOfDay(comp, day);
  const label = list[0]?.stage === 'regular' ? `Spieltag ${day} von ${regularDays(comp)}` : `Nachsaison · Tag ${day - regularDays(comp)}`;
  const own = comp.fixtures.filter((f) => f.home === club?.id || f.away === club?.id);
  return (
    <>
      <section className="card flush">
        <div className="day-nav">
          <button className="btn" onClick={() => setDay((d) => Math.max(1, d - 1))} disabled={day <= 1}>‹</button>
          <strong>{label}</strong>
          <button className="btn" onClick={() => setDay((d) => Math.min(maxDay, d + 1))} disabled={day >= maxDay}>›</button>
        </div>
        <FixtureList list={list} />
      </section>
      <section className="card flush">
        <h3 className="card-title">Eure Saison</h3>
        <ul className="form-strip">
          {own.filter((f) => f.result).map((f) => {
            const side = f.home === club?.id ? 0 : 1;
            const won = f.result!.score[side] > f.result!.score[1 - side];
            const ot = f.result!.decidedIn !== 'REG';
            return <li key={f.id} className={won ? 'w' : ot ? 'otl' : 'l'} title={`${clubById.get(f.home)!.shortName} ${f.result!.score.join(':')} ${clubById.get(f.away)!.shortName}`}>{won ? 'S' : ot ? 'V' : 'N'}</li>;
          })}
        </ul>
        <p className="muted small pad">S = Sieg, V = Niederlage nach Verlängerung/Penaltys, N = Niederlage</p>
      </section>
    </>
  );
}

function FixtureList({ list }: { list: Fixture[] }) {
  const { club, clubById, world } = useStore();
  const comp = world.competition!;
  return (
    <ul className="results">
      {list.map((f) => {
        const h = clubById.get(f.home)!, a = clubById.get(f.away)!;
        const ser = comp.series.find((s) => s.id === f.seriesId);
        const mine = f.home === club?.id || f.away === club?.id;
        const r = f.result;
        return (
          <li key={f.id} className={mine ? 'mine' : ''}>
            <span className="res-team"><Crest club={h} size={22} />{h.shortName}</span>
            <b className="res-score">{r ? `${r.score[0]}:${r.score[1]}${r.decidedIn === 'OT' ? ' n.V.' : r.decidedIn === 'SO' ? ' n.P.' : ''}` : '–:–'}</b>
            <span className="res-team right">{a.shortName}<Crest club={a} size={22} /></span>
            {ser && <small className="res-series muted">{ser.roundName}, Spiel {f.gameNo}</small>}
          </li>
        );
      })}
    </ul>
  );
}

function Playoffs() {
  const { world } = useStore();
  const comp = world.competition!;
  if (!comp.finalStandings) {
    return <section className="card"><p className="muted">Die Nachsaison beginnt nach dem letzten Hauptrundenspieltag. Plätze 1–6 direkt im Viertelfinale, 7–10 in den Pre-Playoffs, 11–14 in den Playdowns.</p></section>;
  }
  const groups = new Map<string, Series[]>();
  const rank = (s: Series) => (s.stage === 'playdowns' ? 100 : 0) + s.roundNo;
  for (const s of [...comp.series].sort((a, b) => rank(a) - rank(b))) groups.set(s.roundName, [...(groups.get(s.roundName) ?? []), s]);
  return (
    <>
      {[...groups.entries()].map(([name, list]) => (
        <section key={name} className="card">
          <h3>{name}</h3>
          {list.map((s) => <SeriesRow key={s.id} s={s} />)}
        </section>
      ))}
    </>
  );
}

function SeriesRow({ s }: { s: Series }) {
  const { clubById, club, world } = useStore();
  const order = world.competition!.finalStandings!;
  const h = clubById.get(s.high)!, l = clubById.get(s.low)!;
  const cls = (id: string) => `${s.winner === id ? 'winner' : s.winner ? 'loser' : ''} ${id === club?.id ? 'me' : ''}`;
  return (
    <div className="series">
      <div className={`series-team ${cls(h.id)}`}><Crest club={h} size={24} /><span>{order.indexOf(h.id) + 1}. {h.shortName}</span><b>{s.winsHigh}</b></div>
      <div className={`series-team ${cls(l.id)}`}><Crest club={l} size={24} /><span>{order.indexOf(l.id) + 1}. {l.shortName}</span><b>{s.winsLow}</b></div>
      <small className="muted">Best-of-{s.bestOf}</small>
    </div>
  );
}

type StatView = 'points' | 'goals' | 'goalies' | 'defense';

function Stats() {
  const { world, byId, clubById, club } = useStore();
  const comp = world.competition!;
  const [bucket, setBucket] = useState<'regular' | 'post'>('regular');
  const [view, setView] = useState<StatView>('points');
  const entries = useMemo(() => Object.entries(comp.stats[bucket]) as [string, StatLine][], [comp, bucket]);
  const minGs = bucket === 'regular' ? Math.max(1, Math.floor(comp.day * 0.25)) : 1;
  const rows = useMemo(() => {
    const skaters = entries.filter(([id]) => byId.get(id)?.position !== 'G');
    const isD = (id: string) => ['LD', 'RD'].includes(byId.get(id)!.position);
    switch (view) {
      case 'points': return skaters.sort(([, a], [, b]) => b.g + b.a - (a.g + a.a) || b.g - a.g).slice(0, 25);
      case 'goals': return skaters.sort(([, a], [, b]) => b.g - a.g || b.a - a.a).slice(0, 25);
      case 'defense': return skaters.filter(([id]) => isD(id)).sort(([, a], [, b]) => b.g + b.a - (a.g + a.a)).slice(0, 25);
      case 'goalies': return entries.filter(([id, s]) => byId.get(id)?.position === 'G' && s.gs >= minGs).sort(([, a], [, b]) => (b.sa - b.ga) / Math.max(1, b.sa) - (a.sa - a.ga) / Math.max(1, a.sa));
    }
  }, [entries, view, byId, minGs]);
  const name = (id: string) => { const p = byId.get(id)!; return `${p.firstName[0]}. ${p.lastName}`; };
  return (
    <>
      <div className="segmented small-seg">
        <button className={bucket === 'regular' ? 'on' : ''} onClick={() => setBucket('regular')}>Hauptrunde</button>
        <button className={bucket === 'post' ? 'on' : ''} onClick={() => setBucket('post')}>Nachsaison</button>
      </div>
      <div className="segmented small-seg">
        {([['points', 'Scorer'], ['goals', 'Tore'], ['defense', 'Verteidiger'], ['goalies', 'Torhüter']] as [StatView, string][]).map(([id, l]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{l}</button>
        ))}
      </div>
      <section className="card flush">
        {rows.length === 0 && <p className="muted pad">Noch keine Daten.</p>}
        {rows.length > 0 && view !== 'goalies' && (
          <table className="stats">
            <thead><tr><th>Spieler</th><th>Verein</th><th>Sp</th><th>T</th><th>A</th><th>P</th><th>+/-</th><th>SM</th></tr></thead>
            <tbody>
              {rows.map(([id, s]) => (
                <tr key={id} className={s.clubId === club?.id ? 'me' : ''}>
                  <td>{name(id)}</td><td>{clubById.get(s.clubId)!.shortName}</td><td>{s.gp}</td><td>{s.g}</td><td>{s.a}</td><td><b>{s.g + s.a}</b></td><td>{s.pm > 0 ? '+' : ''}{s.pm}</td><td>{s.pim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 0 && view === 'goalies' && (
          <table className="stats">
            <thead><tr><th>Torhüter</th><th>Verein</th><th>Sp</th><th>Fq</th><th>GAA</th><th>S</th><th>SO</th></tr></thead>
            <tbody>
              {rows.map(([id, s]) => (
                <tr key={id} className={s.clubId === club?.id ? 'me' : ''}>
                  <td>{name(id)}</td><td>{clubById.get(s.clubId)!.shortName}</td><td>{s.gs}</td>
                  <td>{s.sa ? (((s.sa - s.ga) / s.sa) * 100).toFixed(1).replace('.', ',') : '–'}</td>
                  <td>{s.toi ? ((s.ga * 3600) / s.toi).toFixed(2).replace('.', ',') : '–'}</td>
                  <td>{s.w}</td><td>{s.so}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {view === 'goalies' && <p className="muted small">Fq = Fangquote in %, GAA = Gegentore pro 60 Minuten, SO = Spiele ohne Gegentor. Mindestens {minGs} Einsätze.</p>}
    </>
  );
}
