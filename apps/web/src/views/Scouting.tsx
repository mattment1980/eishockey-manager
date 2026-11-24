import { useMemo, useState } from 'react';
import type { Player, Position } from '@ehm/schema';
import { playerView, scoutsOf, regionOf, REGIONS, REGION_LABEL, ageOn, toDisplay, CATEGORY, type PlayerView, type Region } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from '../components/PlayerSheet.tsx';
import { KnowledgeDots } from '../components/KnowledgeDots.tsx';
import { NATION_LABEL } from '../labels.ts';

type PosFilter = 'all' | 'F' | 'D' | 'G';
type StatusFilter = 'free' | 'league' | 'watch';

const POS: Record<PosFilter, Position[]> = { all: ['C', 'LW', 'RW', 'LD', 'RD', 'G'], F: ['C', 'LW', 'RW'], D: ['LD', 'RD'], G: ['G'] };

/** Sortierwert aus der Schätzung (exakt, Spannenmitte oder Kategorie). */
function sortValue(v: PlayerView): number {
  const o = v.overall;
  if ('exact' in o) return o.exact;
  if ('range' in o) return (o.range[0] + o.range[1]) / 2;
  if ('category' in o) return 5 + CATEGORY.indexOf(o.category as (typeof CATEGORY)[number]) * 3;
  return 0;
}

function OverallBadge({ v }: { v: PlayerView }) {
  const o = v.overall;
  if ('exact' in o) return <span className="rating">{o.exact}</span>;
  if ('range' in o) return <span className="rating range-badge">{o.range[0]}–{o.range[1]}</span>;
  if ('category' in o) return <span className="rating cat-badge">{o.category}</span>;
  return <span className="rating">?</span>;
}

export function Scouting() {
  const { world, club, clubById, toggleWatch, setScoutRegion } = useStore();
  const [pos, setPos] = useState<PosFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('free');
  const [onlyImports, setOnlyImports] = useState(false);
  const [sel, setSel] = useState<Player | null>(null);
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
      <section className="card">
        <h3>Deine Scouts</h3>
        {scouts.length === 0 && <p className="muted small">Keine Scouts angestellt.</p>}
        {scouts.map((s) => (
          <div key={s.id} className="scout-row">
            <div>
              <strong>{s.firstName} {s.lastName}</strong>
              <div className="muted small">Scouting {toDisplay(s.ratings.scouting)} · ca. {Math.round((110 + 0.6 * s.ratings.scouting) / 60)} Spieler pro Woche</div>
            </div>
            <select className="select" value={s.region ?? 'DE'} onChange={(e) => setScoutRegion(s.id, e.target.value)} aria-label="Region">
              {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABEL[r]} ({regionCount(r)})</option>)}
            </select>
          </div>
        ))}
        <p className="muted small hint">Spieler der eigenen Liga lernst du auch durch Spiele gegen sie kennen. Beobachtete Spieler haben bei deinen Scouts Vorrang.</p>
      </section>

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
                <strong>{p.firstName[0]}. {p.lastName}{st?.watch.includes(p.id) ? ' 👁' : ''}</strong>
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

      {sel && (
        <PlayerSheet
          player={sel}
          date={world.date}
          onClose={() => setSel(null)}
          view={playerView(world, club.id, sel, ageOn(sel.birthDate, world.date))}
          clubName={sel.contract ? clubById.get(sel.contract.clubId)?.name : 'vereinslos'}
          watch={{ on: !!st?.watch.includes(sel.id), toggle: () => toggleWatch(sel.id) }}
        />
      )}
    </div>
  );
}
