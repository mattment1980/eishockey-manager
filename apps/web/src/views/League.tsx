import { useMemo, useState } from 'react';
import type { Fixture, Series, StatLine } from '@ehm/schema';
import { regularTable, regularDays, fixturesOfDay, formatDate, teamSeasonStats, type TeamSeasonStats } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';
import { FormStrip } from '../components/FormStrip.tsx';
import { ClubName, PlayerNameId, useUi } from '../ui.tsx';

type View = 'table' | 'games' | 'playoffs' | 'stats' | 'teams';

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
        {([['table', 'Tabelle'], ['games', 'Spiele'], ['playoffs', 'Playoffs'], ['stats', 'Spieler'], ['teams', 'Teams']] as [View, string][]).map(([id, l]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{l}</button>
        ))}
      </div>
      {view === 'table' && <Table />}
      {view === 'games' && <Games />}
      {view === 'playoffs' && <Playoffs />}
      {view === 'stats' && <Stats />}
      {view === 'teams' && <TeamStats />}
    </div>
  );
}

function Table() {
  const { world, club, clubById } = useStore();
  const { openClub } = useUi();
  const table = regularTable(world);
  const comp = world.competition!;
  const fmt = world.leagues[0].format;
  const zone = (place: number) =>
    place <= fmt.directPlayoffs[1] ? 'z-po' : fmt.prePlayoffs && place <= fmt.prePlayoffs[1] ? 'z-pre' : fmt.playdowns && place >= fmt.playdowns[0] ? 'z-pd' : '';
  return (
    <section className="card flush">
      <table className="stats league">
        <thead><tr><th>#</th><th>Verein</th><th data-tip="Spiele">Sp</th><th data-tip="Siege nach regulärer Spielzeit (3 Punkte)">S</th><th data-tip="Siege nach Verlängerung oder Penaltyschießen (2 Punkte)">SnV</th><th data-tip="Niederlagen nach Verlängerung oder Penaltyschießen (1 Punkt)">NnV</th><th data-tip="Niederlagen nach regulärer Spielzeit">N</th><th className="hide-sm" data-tip="Tore : Gegentore">Tore</th><th data-tip="Tordifferenz">Diff</th><th data-tip="Punkte">Pkt</th><th className="form-col" data-tip="Letzte 5 Spiele (ältestes links). Grün = Sieg, Rot = Niederlage, V = nach Verlängerung/Penaltys">Form</th></tr></thead>
        <tbody>
          {table.map((r, i) => {
            const c = clubById.get(r.clubId)!;
            return (
              <tr key={r.clubId} className={`${zone(i + 1)} ${c.id === club?.id ? 'me' : ''} clickable`} onClick={() => openClub(c.id)}>
                <td>{i + 1}</td>
                <td><ClubName c={c} crest={20} /></td>
                <td>{r.gp}</td><td>{r.w}</td><td>{r.otw}</td><td>{r.otl}</td><td>{r.l}</td>
                <td className="hide-sm">{r.gf}:{r.ga}</td>
                <td>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td>
                <td><b>{r.pts}</b></td>
                <td className="form-col"><FormStrip comp={comp} clubId={c.id} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="legend small muted pad">
        <span><i className="zone z-po" /> Viertelfinale</span>
        <span><i className="zone z-pre" /> Pre-Playoffs</span>
        <span><i className="zone z-pd" /> Playdowns</span>
        <span>Verein anklicken für den Kader</span>
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
          <strong>{label}<br /><span className="muted small">{list[0] ? formatDate(list[0].date, true) : ''}</span></strong>
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
            return <li key={f.id} className={won ? 'w' : ot ? 'otl' : 'l'} data-tip={`${clubById.get(f.home)!.shortName} ${f.result!.score.join(':')} ${clubById.get(f.away)!.shortName}`}>{won ? 'S' : ot ? 'V' : 'N'}</li>;
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
            <span className="res-team"><ClubName c={h} crest={22} /></span>
            <b className="res-score">{r ? `${r.score[0]}:${r.score[1]}${r.decidedIn === 'OT' ? ' n.V.' : r.decidedIn === 'SO' ? ' n.P.' : ''}` : '–:–'}</b>
            <span className="res-team right"><ClubName c={a} /><Crest club={a} size={22} /></span>
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
      <div className={`series-team ${cls(h.id)}`}><Crest club={h} size={24} /><span>{order.indexOf(h.id) + 1}. <ClubName c={h} /></span><b>{s.winsHigh}</b></div>
      <div className={`series-team ${cls(l.id)}`}><Crest club={l} size={24} /><span>{order.indexOf(l.id) + 1}. <ClubName c={l} /></span><b>{s.winsLow}</b></div>
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
                  <td><PlayerNameId id={id} /></td><td><ClubName c={clubById.get(s.clubId)!} /></td><td>{s.gp}</td><td>{s.g}</td><td>{s.a}</td><td><b>{s.g + s.a}</b></td><td>{s.pm > 0 ? '+' : ''}{s.pm}</td><td>{s.pim}</td>
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
                  <td><PlayerNameId id={id} /></td><td><ClubName c={clubById.get(s.clubId)!} /></td><td>{s.gs}</td>
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

// ---------------------------------------------------------------- Teamstatistik

type TeamView = 'general' | 'special' | 'control';
type Col = { key: string; label: string; tip: string; value: (r: TeamSeasonStats) => number | null; fmt: (v: number) => string; asc?: boolean };

const per = (x: number, gp: number) => (gp ? x / gp : null);
const ratio = (a: number, b: number) => (b ? a / b : null);
const d1 = (v: number) => v.toFixed(1).replace('.', ',');
const d2 = (v: number) => v.toFixed(2).replace('.', ',');
const pc = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}`;

const COLS: Record<TeamView, Col[]> = {
  general: [
    { key: 'gp', label: 'Sp', tip: 'Spiele', value: (r) => r.gp, fmt: String },
    { key: 'gfpg', label: 'T/Sp', tip: 'Tore pro Spiel (ohne Penaltyschießen)', value: (r) => per(r.gf, r.gp), fmt: d2 },
    { key: 'gapg', label: 'GT/Sp', tip: 'Gegentore pro Spiel', value: (r) => per(r.ga, r.gp), fmt: d2, asc: true },
    { key: 'sog', label: 'Sch/Sp', tip: 'Schüsse aufs Tor pro Spiel', value: (r) => per(r.sog, r.gp), fmt: d1 },
    { key: 'soga', label: 'SchG/Sp', tip: 'Schüsse aufs eigene Tor pro Spiel (Gegner)', value: (r) => per(r.sogA, r.gp), fmt: d1, asc: true },
    { key: 'shpct', label: 'Sch %', tip: 'Schussquote: Tore je Schuss aufs Tor', value: (r) => ratio(r.gf, r.sog), fmt: pc },
    { key: 'svpct', label: 'Fq %', tip: 'Fangquote: gehaltene Schüsse je Schuss aufs eigene Tor', value: (r) => (r.sogA ? 1 - r.ga / r.sogA : null), fmt: pc },
  ],
  special: [
    { key: 'pp', label: 'ÜZ', tip: 'Überzahlspiele', value: (r) => r.pp, fmt: String },
    { key: 'ppg', label: 'ÜZ-T', tip: 'Überzahltore', value: (r) => r.ppg, fmt: String },
    { key: 'pppct', label: 'ÜZ %', tip: 'Überzahlquote: Tore je Überzahlspiel', value: (r) => ratio(r.ppg, r.pp), fmt: pc },
    { key: 'pk', label: 'UZ', tip: 'Unterzahlsituationen', value: (r) => r.pk, fmt: String },
    { key: 'pkpct', label: 'UZ %', tip: 'Unterzahlquote: überstandene Unterzahlsituationen ohne Gegentor', value: (r) => (r.pk ? 1 - r.ppgA / r.pk : null), fmt: pc },
    { key: 'shg', label: 'SH-T', tip: 'Tore in Unterzahl (Shorthander)', value: (r) => r.shg, fmt: String },
    { key: 'shga', label: 'SH-GT', tip: 'Gegentore in Überzahl', value: (r) => r.shgA, fmt: String, asc: true },
    { key: 'pim', label: 'SM/Sp', tip: 'Strafminuten pro Spiel', value: (r) => per(r.pim, r.detailed), fmt: d1, asc: true },
  ],
  control: [
    { key: 'cf', label: 'Corsi %', tip: 'Anteil an allen Schussversuchen (eigene : gegnerische) – Maß für Spielkontrolle', value: (r) => ratio(r.att, r.att + r.attA), fmt: pc },
    { key: 'xg', label: 'xG/Sp', tip: 'Erwartete Tore pro Spiel (Qualität der Chancen)', value: (r) => per(r.xg, r.detailed), fmt: d2 },
    { key: 'xga', label: 'xGA/Sp', tip: 'Erwartete Gegentore pro Spiel', value: (r) => per(r.xgA, r.detailed), fmt: d2, asc: true },
    { key: 'fo', label: 'Bully %', tip: 'Gewonnene Bullys', value: (r) => ratio(r.fow, r.fow + r.fol), fmt: pc },
    { key: 'hits', label: 'Chk/Sp', tip: 'Checks pro Spiel', value: (r) => per(r.hits, r.detailed), fmt: d1 },
    { key: 'blk', label: 'Blk/Sp', tip: 'Geblockte gegnerische Schüsse pro Spiel', value: (r) => per(r.blocks, r.detailed), fmt: d1 },
    { key: 'pdo', label: 'PDO', tip: 'Schussquote + Fangquote (×100). Über 100 = Glück oder Klasse im Abschluss/Tor', value: (r) => (r.sog && r.sogA ? (r.gf / r.sog + 1 - r.ga / r.sogA) * 100 : null), fmt: d1 },
  ],
};

function TeamStats() {
  const { world, club, clubById } = useStore();
  const comp = world.competition!;
  const [bucket, setBucket] = useState<'regular' | 'post'>('regular');
  const [view, setView] = useState<TeamView>('general');
  const [sort, setSort] = useState<string>('gfpg');
  const rows = useMemo(() => teamSeasonStats(world, bucket).filter((r) => r.gp > 0), [world, bucket]);
  const cols = COLS[view];
  const col = cols.find((c) => c.key === sort) ?? cols[1] ?? cols[0];
  const sorted = [...rows].sort((a, b) => {
    const x = col.value(a) ?? -Infinity, y = col.value(b) ?? -Infinity;
    return col.asc ? x - y : y - x;
  });
  const best = new Map(cols.map((c) => {
    const vals = rows.map((r) => c.value(r)).filter((v): v is number => v !== null);
    return [c.key, vals.length ? (c.asc ? Math.min(...vals) : Math.max(...vals)) : null];
  }));
  const partial = rows.some((r) => r.detailed < r.gp);
  void comp;
  return (
    <>
      <div className="segmented small-seg">
        <button className={bucket === 'regular' ? 'on' : ''} onClick={() => setBucket('regular')}>Hauptrunde</button>
        <button className={bucket === 'post' ? 'on' : ''} onClick={() => setBucket('post')}>Nachsaison</button>
      </div>
      <div className="segmented small-seg">
        {([['general', 'Allgemein'], ['special', 'Special Teams'], ['control', 'Spielkontrolle']] as [TeamView, string][]).map(([id, l]) => (
          <button key={id} className={view === id ? 'on' : ''} onClick={() => { setView(id); setSort(COLS[id][view === 'general' ? 2 : 1]?.key ?? COLS[id][0].key); }}>{l}</button>
        ))}
      </div>
      <section className="card flush scroll-x">
        {sorted.length === 0 ? <p className="muted pad">Noch keine Spiele.</p> : (
          <table className="stats teamstats">
            <thead>
              <tr>
                <th>Verein</th>
                {cols.map((c) => <th key={c.key} className={`sortable ${c.key === col.key ? 'sorted' : ''}`} onClick={() => setSort(c.key)} data-tip={`${c.tip} – zum Sortieren klicken`}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.clubId} className={r.clubId === club?.id ? 'me' : ''}>
                  <td><ClubName c={clubById.get(r.clubId)!} crest={18} /></td>
                  {cols.map((c) => {
                    const v = c.value(r);
                    return <td key={c.key} className={v !== null && v === best.get(c.key) && c.key !== 'gp' ? 'good' : ''}>{v === null ? '–' : c.fmt(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="muted small">Spaltenkopf anklicken zum Sortieren; grün = Ligabester. {partial ? 'Hinweis: Für Spiele aus älteren Spielständen fehlen Detailwerte (Corsi, Überzahl, Bullys) – sie zählen ab jetzt mit.' : ''}</p>
    </>
  );
}
