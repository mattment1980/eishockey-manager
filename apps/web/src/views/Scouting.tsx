import { useMemo, useState } from 'react';
import type { Player, Position } from '@ehm/schema';
import { playerView, scoutsOf, regionOf, ageOn, type Region } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerName, useUi } from '../ui.tsx';
import { OverallBadge, viewSortValue as sortValue } from '../components/Badges.tsx';
import { KnowledgeDots } from '../components/KnowledgeDots.tsx';
import { NATION_LABEL } from '../labels.ts';

type PosFilter = 'all' | 'F' | 'D' | 'G';
type StatusFilter = 'free' | 'league' | 'watch';

const POS: Record<PosFilter, Position[]> = { all: ['C', 'LW', 'RW', 'LD', 'RD', 'G'], F: ['C', 'LW', 'RW'], D: ['LD', 'RD'], G: ['G'] };

export function Scouting() {
  const { world, club, clubById, toggleWatch, setScoutRegion } = useStore();
  const [pos, setPos] = useState<PosFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('free');
  const [onlyImports, setOnlyImports] = useState(false);
  const { openPlayer } = useUi();
  const setSel = (p: Player) => openPlayer(p.id);
  const clubId = club?.id ?? '';
  const st = world.scouting[clubId];
  const list = useMemo(() => {
    if (!clubId) return [];
    return world.players
      .filter((p) => p.contract?.clubId !== clubId)
      .filter((p) => POS[pos].includes(p.position))
      .filter((p) => (status === 'free' ? !p.contract : status === 'league' ? !!p.contract : st?.watch.includes(p.id)))
      .filter((p) => !onlyImports || !p.nationalities.includes('DE'))
      .map((p) => ({ p, v: playerView(world, clubId, p, ageOn(p.birthDate, world.date)) }))
      .sort((a, b) => sortValue(b.v) - sortValue(a.v) || b.v.level - a.v.level);
  }, [world, clubId, pos, status, onlyImports, st]);
  if (!club) return null;
  const scouts = scoutsOf(world, club.id);

  const regionCount = (r: Region) => world.players.filter((p) => p.contract?.clubId !== club.id && regionOf(p) === r).length;

  return (
    <div className="stack">
      <p className="muted small">Scouts und ihre Einsatzregionen verwaltest du im Reiter <b>Staff</b>. Beobachtete Spieler haben bei den Scouts Vorrang; Spieler der eigenen Liga lernst du auch durch Spiele gegen sie kennen.</p>

      <div className="segmented small-seg">
        {([['free', 'Vereinslos'], ['league', 'Liga'], ['watch', `Beobachtet (${st?.watch.length ?? 0})`]] as [StatusFilter, string][]).map(([id, l]) => (
          <button key={id} className={status === id ? 'on' : ''} onClick={() => setStatus(id)}>{l}</button>
        ))}
      </div>
      <div className="segmented small-seg">
        {([['all', 'Alle'], ['F', 'Sturm'], ['D', 'Verteidigung'], ['G', 'Tor']] as [PosFilter, string][]).map(([id, l]) => (
          <button key={id} className={pos === id ? 'on' : ''} onClick={() => setPos(id)}>{l}</button>
        ))}
        <button className={onlyImports ? 'on' : ''} onClick={() => setOnlyImports((x) => !x)}>Nur Import</button>
      </div>

      <section className="card flush">
        <ul className="roster">
          {list.length === 0 && <li className="muted">Keine Spieler gefunden.</li>}
          {list.slice(0, 80).map(({ p, v }) => (
            <li key={p.id} onClick={() => setSel(p)}>
              <span className={`pos pos-${p.position}`}>{p.position}</span>
              <div className="roster-main">
                <strong><PlayerName p={p} />{st?.watch.includes(p.id) ? <span data-tip="Wird von deinen Scouts beobachtet"> 👁</span> : ''}</strong>
                <small className="muted">
                  {ageOn(p.birthDate, world.date)} J · {NATION_LABEL[p.nationalities[0]] ?? p.nationalities[0]} · {p.contract ? clubById.get(p.contract.clubId)?.shortName : 'vereinslos'}
                </small>
              </div>
              <KnowledgeDots level={v.level} />
              <OverallBadge v={v} />
            </li>
          ))}
        </ul>
        {list.length > 80 && <p className="muted small pad">… und {list.length - 80} weitere. Filter nutzen.</p>}
      </section>

    </div>
  );
}
