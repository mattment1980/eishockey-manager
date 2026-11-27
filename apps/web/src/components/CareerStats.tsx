import { useState } from 'react';
import type { Player, StatLine } from '@ehm/schema';
import { seasonLabel } from '@ehm/core';
import { useStore } from '../store.tsx';
import { ClubName } from './Names.tsx';

type Row = { season: number; current: boolean; line: StatLine };

const f2 = (v: number) => v.toFixed(2).replace('.', ',');
const f3 = (v: number) => v.toFixed(3).replace('0.', ',').replace('.', ',');

/** Statistik der laufenden und der vergangenen Saisons (Hauptrunde oder Playoffs) */
export function CareerStats({ player }: { player: Player }) {
  const { world } = useStore();
  const [bucket, setBucket] = useState<'regular' | 'post'>('regular');
  const comp = world.competition;
  const rows: Row[] = [];
  const cur = comp?.stats[bucket][player.id];
  if (comp && cur && !player.career.some((c) => c.season === comp.year)) rows.push({ season: comp.year, current: true, line: cur });
  for (const c of [...player.career].reverse()) {
    const line = c[bucket];
    if (line) rows.push({ season: c.season, current: false, line });
  }
  const goalie = player.position === 'G';
  const total = rows.reduce<StatLine | null>((t, r) => (t ? sum(t, r.line) : { ...r.line }), null);
  return (
    <div className="attr-group career">
      <div className="row-between">
        <h4>Statistik</h4>
        <div className="segmented small-seg">
          <button className={bucket === 'regular' ? 'on' : ''} onClick={() => setBucket('regular')}>Hauptrunde</button>
          <button className={bucket === 'post' ? 'on' : ''} onClick={() => setBucket('post')}>Playoffs</button>
        </div>
      </div>
      {rows.length === 0 ? <p className="muted small">{bucket === 'post' ? 'Noch keine Playoff-Einsätze.' : 'Noch keine Einsätze erfasst.'}</p> : (
        <div className="scroll-x">
          <table className="stats career-table">
            <thead>
              {goalie ? (
                <tr><th>Saison</th><th>Verein</th><th data-tip="Spiele">Sp</th><th data-tip="Siege">S</th><th data-tip="Gegentore im Schnitt je 60 Minuten">GT/60</th><th data-tip="Fangquote">Fq</th><th data-tip="Zu-null-Spiele">Shutout</th></tr>
              ) : (
                <tr><th>Saison</th><th>Verein</th><th data-tip="Spiele">Sp</th><th data-tip="Tore">T</th><th data-tip="Vorlagen">V</th><th data-tip="Punkte">P</th><th data-tip="Plus/Minus">+/−</th><th data-tip="Strafminuten">SM</th><th data-tip="Schüsse aufs Tor">Sch</th></tr>
              )}
            </thead>
            <tbody>
              {rows.map((r) => <StatRow key={r.season} row={r} goalie={goalie} />)}
              {rows.length > 1 && total && <StatRow row={{ season: -1, current: false, line: total }} goalie={goalie} />}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatRow({ row, goalie }: { row: Row; goalie: boolean }) {
  const { clubById, world } = useStore();
  const l = row.line;
  const club = clubById.get(l.clubId);
  const name = row.season < 0 ? '' : club ? <ClubName c={club} /> : (world.archive.find((a) => a.season === row.season)?.clubs[l.clubId]?.shortName ?? '–');
  const label = row.season < 0 ? 'Gesamt' : `${seasonLabel(row.season)}${row.current ? ' *' : ''}`;
  return (
    <tr className={row.season < 0 ? 'total' : row.current ? 'current' : ''} data-tip={row.current ? 'laufende Saison' : undefined}>
      <td>{label}</td>
      <td>{name}</td>
      <td>{goalie ? l.gs || l.gp : l.gp}</td>
      {goalie ? (
        <>
          <td>{l.w}</td>
          <td>{l.toi > 0 ? f2((l.ga * 3600) / l.toi) : '–'}</td>
          <td>{l.sa > 0 ? f3(1 - l.ga / l.sa) : '–'}</td>
          <td>{l.so}</td>
        </>
      ) : (
        <>
          <td>{l.g}</td>
          <td>{l.a}</td>
          <td><b>{l.g + l.a}</b></td>
          <td>{l.pm > 0 ? `+${l.pm}` : l.pm}</td>
          <td>{l.pim}</td>
          <td>{l.sog}</td>
        </>
      )}
    </tr>
  );
}

function sum(a: StatLine, b: StatLine): StatLine {
  return { ...a, gp: a.gp + b.gp, g: a.g + b.g, a: a.a + b.a, pim: a.pim + b.pim, pm: a.pm + b.pm, sog: a.sog + b.sog, toi: a.toi + b.toi, gs: a.gs + b.gs, sa: a.sa + b.sa, ga: a.ga + b.ga, w: a.w + b.w, so: a.so + b.so };
}
