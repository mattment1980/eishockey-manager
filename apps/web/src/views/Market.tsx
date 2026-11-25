import { useMemo, useState } from 'react';
import type { Player, Position } from '@ehm/schema';
import { marketPlayers, marketInfo, playerView, ageOn, formatDate, CATEGORY, type PlayerView } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from '../components/PlayerSheet.tsx';
import { Negotiation } from '../components/Negotiation.tsx';
import { KnowledgeDots } from '../components/KnowledgeDots.tsx';
import { NATION_LABEL } from '../labels.ts';

type PosFilter = 'all' | 'F' | 'D' | 'G';
type Kind = 'all' | 'free' | 'expiring' | 'mine';
const POS: Record<PosFilter, Position[]> = { all: ['C', 'LW', 'RW', 'LD', 'RD', 'G'], F: ['C', 'LW', 'RW'], D: ['LD', 'RD'], G: ['G'] };

function sortValue(v: PlayerView): number {
  const o = v.overall;
  if ('exact' in o) return o.exact;
  if ('range' in o) return (o.range[0] + o.range[1]) / 2;
  if ('category' in o) return 5 + CATEGORY.indexOf(o.category as (typeof CATEGORY)[number]) * 3;
  return 0;
}

export function OverallBadge({ v }: { v: PlayerView }) {
  const o = v.overall;
  if ('exact' in o) return <span className="rating">{o.exact}</span>;
  if ('range' in o) return <span className="rating range-badge">{o.range[0]}–{o.range[1]}</span>;
  if ('category' in o) return <span className="rating cat-badge">{o.category}</span>;
  return <span className="rating">?</span>;
}

export function Market() {
  const { world, club, clubById } = useStore();
  const [pos, setPos] = useState<PosFilter>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [onlyImports, setOnlyImports] = useState(false);
  const [sel, setSel] = useState<Player | null>(null);
  const [nego, setNego] = useState<Player | null>(null);
  const clubId = club?.id ?? '';
  const st = world.scouting[clubId];

  const list = useMemo(() => {
    if (!clubId) return [];
    return marketPlayers(world, clubId)
      .filter((p) => p.contract?.clubId !== clubId)
      .filter((p) => POS[pos].includes(p.position))
      .filter((p) => !onlyImports || !p.nationalities.includes('DE'))
      .map((p) => ({ p, v: playerView(world, clubId, p, ageOn(p.birthDate, world.date)), m: marketInfo(world, p, clubId) }))
      .filter(({ p, m }) => (kind === 'free' ? !p.contract : kind === 'expiring' ? !!p.contract : kind === 'mine' ? !!m.myOffer : true))
      .sort((a, b) => Number(!!b.m.myOffer) - Number(!!a.m.myOffer) || sortValue(b.v) - sortValue(a.v));
  }, [world, clubId, pos, kind, onlyImports]);
  if (!club) return null;

  const comp = world.competition!;
  const phase = world.date >= `${world.season}-11-01` || comp.finished
    ? 'Verhandlungsphase für die nächste Saison: Spieler mit auslaufendem Vertrag sind verfügbar.'
    : `Bis 1. November nur vereinslose Spieler. Sofortverpflichtungen bis ${formatDate(comp.transferDeadline)}.`;

  return (
    <div className="stack">
      <p className="muted small">{phase}</p>
      <div className="segmented small-seg">
        {([['all', 'Alle'], ['free', 'Vereinslos'], ['expiring', 'Vertrag läuft aus'], ['mine', 'Meine Angebote']] as [Kind, string][]).map(([id, l]) => (
          <button key={id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)}>{l}</button>
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
          {list.slice(0, 80).map(({ p, v, m }) => (
            <li key={p.id} onClick={() => setSel(p)}>
              <span className={`pos pos-${p.position}`}>{p.position}</span>
              <div className="roster-main">
                <strong>{p.firstName[0]}. {p.lastName}{st?.watch.includes(p.id) ? ' 👁' : ''}</strong>
                <small className="muted">
                  {ageOn(p.birthDate, world.date)} J · {NATION_LABEL[p.nationalities[0]] ?? p.nationalities[0]} · {p.contract ? `läuft aus (${clubById.get(p.contract.clubId)?.shortName})` : 'vereinslos'}
                  {m.interested > 0 && <span className="tag">{m.interested} {m.interested === 1 ? 'Angebot' : 'Angebote'}</span>}
                  {m.myOffer && <span className={`tag ${m.tendency.code === 'leading' ? 'pos' : m.tendency.code === 'behind' ? 'neg' : 'mix'}`}>dein Angebot</span>}
                </small>
              </div>
              <KnowledgeDots level={v.level} />
              <OverallBadge v={v} />
            </li>
          ))}
        </ul>
        {list.length > 80 && <p className="muted small pad">… und {list.length - 80} weitere. Filter nutzen.</p>}
      </section>

      {sel && !nego && (
        <PlayerSheet
          player={sel}
          date={world.date}
          onClose={() => setSel(null)}
          view={playerView(world, club.id, sel, ageOn(sel.birthDate, world.date))}
          clubName={sel.contract ? clubById.get(sel.contract.clubId)?.name : 'vereinslos'}
          action={{ label: marketInfo(world, sel, club.id).myOffer ? 'Angebot ansehen / ändern' : 'Vertragsangebot machen', onClick: () => setNego(sel) }}
        />
      )}
      {nego && <Negotiation player={nego} onClose={() => { setNego(null); setSel(null); }} />}
    </div>
  );
}
