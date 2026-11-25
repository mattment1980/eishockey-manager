import { useMemo, useState } from 'react';
import type { Player, Position } from '@ehm/schema';
import { marketPlayers, marketInfo, playerView, ageOn, formatDate, expectedSalary, CATEGORY, type PlayerView, type AttrView } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from '../components/PlayerSheet.tsx';
import { Negotiation } from '../components/Negotiation.tsx';
import { KnowledgeDots } from '../components/KnowledgeDots.tsx';
import { NATION_LABEL, SKATER_LABEL, GOALIE_LABEL, euro } from '../labels.ts';

type PosFilter = 'all' | 'F' | 'D' | 'G';
type Kind = 'all' | 'free' | 'expiring' | 'mine';
const POS: Record<PosFilter, Position[]> = { all: ['C', 'LW', 'RW', 'LD', 'RD', 'G'], F: ['C', 'LW', 'RW'], D: ['LD', 'RD'], G: ['G'] };

/** Mittelwert der Kategorien in Anzeigepunkten */
const CAT_MID: Record<string, number> = { 'sehr schwach': 4, schwach: 8, solide: 11, stark: 14, 'sehr stark': 17 };
const LEVELS: { value: number; label: string }[] = [
  { value: 0, label: 'egal' }, { value: 10, label: 'mind. solide' }, { value: 13, label: 'mind. stark' }, { value: 16, label: 'sehr stark' },
];

/** Geschätzter Wert (Anzeigepunkte) oder null, wenn unbekannt */
function estimate(v: AttrView): number | null {
  if ('exact' in v) return v.exact;
  if ('range' in v) return (v.range[0] + v.range[1]) / 2;
  if ('category' in v) return CAT_MID[v.category] ?? null;
  return null;
}

interface AttrFilter { key: string; min: number }
interface Filters {
  ageMin: number; ageMax: number; overallMin: number; shoots: 'all' | 'L' | 'R';
  attrs: AttrFilter[]; showUnknown: boolean; minKnowledge: number; maxSalary: number;
  sort: 'overall' | 'age' | 'salary' | 'knowledge';
}
const DEFAULT_FILTERS: Filters = { ageMin: 16, ageMax: 40, overallMin: 0, shoots: 'all', attrs: [], showUnknown: false, minKnowledge: 1, maxSalary: 0, sort: 'overall' };

const ATTR_OPTIONS: { key: string; label: string }[] = [
  ...Object.entries(SKATER_LABEL).map(([k, l]) => ({ key: k, label: l })),
  ...Object.entries(GOALIE_LABEL).map(([k, l]) => ({ key: `g:${k}`, label: `Torhüter: ${l}` })),
];

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
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = (f.ageMin > 16 || f.ageMax < 40 ? 1 : 0) + (f.overallMin ? 1 : 0) + (f.shoots !== 'all' ? 1 : 0) + f.attrs.filter((a) => a.min).length + (f.minKnowledge > 1 ? 1 : 0) + (f.maxSalary ? 1 : 0);
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
      .filter((p) => f.shoots === 'all' || p.shoots === f.shoots)
      .map((p) => ({ p, age: ageOn(p.birthDate, world.date) }))
      .filter(({ age }) => age >= f.ageMin && age <= f.ageMax)
      .map(({ p, age }) => ({ p, age, v: playerView(world, clubId, p, age), m: marketInfo(world, p, clubId), sal: expectedSalary(world, p) }))
      .filter(({ p, m }) => (kind === 'free' ? !p.contract : kind === 'expiring' ? !!p.contract : kind === 'mine' ? !!m.myOffer : true))
      .filter(({ v }) => v.level >= f.minKnowledge)
      .filter(({ sal }) => !f.maxSalary || sal <= f.maxSalary)
      .filter(({ v }) => {
        if (!f.overallMin) return true;
        const e = estimate(v.overall);
        return e === null ? f.showUnknown : e >= f.overallMin;
      })
      .filter(({ p, v }) => f.attrs.every((a) => {
        if (!a.min) return true;
        const isG = a.key.startsWith('g:');
        if (isG !== (p.position === 'G')) return false;
        const view = v.attrs[isG ? a.key.slice(2) : a.key];
        const e = view ? estimate(view) : null;
        return e === null ? f.showUnknown : e >= a.min;
      }))
      .sort((a, b) => Number(!!b.m.myOffer) - Number(!!a.m.myOffer) || (
        f.sort === 'age' ? a.age - b.age
        : f.sort === 'salary' ? a.sal - b.sal
        : f.sort === 'knowledge' ? b.v.level - a.v.level || sortValue(b.v) - sortValue(a.v)
        : sortValue(b.v) - sortValue(a.v)));
  }, [world, clubId, pos, kind, onlyImports, f]);
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
      <div className="row-between">
        <button className="btn" onClick={() => setShowFilters((x) => !x)}>Filter{activeFilters ? ` (${activeFilters})` : ''} {showFilters ? '▲' : '▼'}</button>
        <select className="select" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as Filters['sort'] })} aria-label="Sortierung">
          <option value="overall">nach Stärke</option>
          <option value="age">nach Alter</option>
          <option value="salary">nach Gehaltsvorstellung</option>
          <option value="knowledge">nach Kenntnisstand</option>
        </select>
      </div>
      {showFilters && (
        <section className="card filters">
          <div className="filter-row">
            <span>Alter</span>
            <div className="range-pair">
              <input type="number" min={16} max={40} value={f.ageMin} onChange={(e) => setF({ ...f, ageMin: Number(e.target.value) || 16 })} aria-label="Mindestalter" />
              <span>bis</span>
              <input type="number" min={16} max={40} value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: Number(e.target.value) || 40 })} aria-label="Höchstalter" />
            </div>
          </div>
          <div className="filter-row">
            <span>Gesamtstärke</span>
            <select className="select" value={f.overallMin} onChange={(e) => setF({ ...f, overallMin: Number(e.target.value) })}>
              {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="filter-row">
            <span>Schusshand</span>
            <div className="segmented small-seg">
              {([['all', 'egal'], ['L', 'links'], ['R', 'rechts']] as [Filters['shoots'], string][]).map(([id, l]) => (
                <button key={id} className={f.shoots === id ? 'on' : ''} onClick={() => setF({ ...f, shoots: id })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="filter-row">
            <span>Max. Gehaltsvorstellung</span>
            <select className="select" value={f.maxSalary} onChange={(e) => setF({ ...f, maxSalary: Number(e.target.value) })}>
              {[0, 40000, 60000, 80000, 100000, 130000, 160000].map((v) => <option key={v} value={v}>{v ? euro(v) : 'egal'}</option>)}
            </select>
          </div>
          <div className="filter-row">
            <span>Kenntnisstand</span>
            <div className="segmented small-seg">
              {[1, 2, 3, 4].map((l) => <button key={l} className={f.minKnowledge === l ? 'on' : ''} onClick={() => setF({ ...f, minKnowledge: l })}>{l === 1 ? 'alle' : `ab ${l}`}</button>)}
            </div>
          </div>
          <h4>Fähigkeiten</h4>
          {f.attrs.map((a, i) => (
            <div key={i} className="attr-filter">
              <select className="select" value={a.key} onChange={(e) => setF({ ...f, attrs: f.attrs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })}>
                {ATTR_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <select className="select" value={a.min} onChange={(e) => setF({ ...f, attrs: f.attrs.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })}>
                {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <button className="btn ghost" onClick={() => setF({ ...f, attrs: f.attrs.filter((_, j) => j !== i) })} aria-label="Filter entfernen">✕</button>
            </div>
          ))}
          {f.attrs.length < 4 && <button className="btn" onClick={() => setF({ ...f, attrs: [...f.attrs, { key: 'skating', min: 10 }] })}>+ Fähigkeit hinzufügen</button>}
          <label className="check"><input type="checkbox" checked={f.showUnknown} onChange={(e) => setF({ ...f, showUnknown: e.target.checked })} /> Spieler mit unbekannten Werten trotzdem zeigen</label>
          <p className="muted small">Stärke- und Fähigkeitsfilter nutzen eure Scouting-Einschätzung: exakte Werte bei Stufe 4, die Mitte der Spanne bei Stufe 3, die Kategorie bei Stufe 2. Bei Stufe 1 sind die Werte unbekannt.</p>
          <button className="btn ghost" onClick={() => setF(DEFAULT_FILTERS)}>Filter zurücksetzen</button>
        </section>
      )}
      <p className="muted small">{list.length} Spieler gefunden</p>
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
