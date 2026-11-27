import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Player, Club } from '@ehm/schema';
import {
  playerView, ageOn, availability, marketInfo, overall, toDisplay1, talentStars, formLabel,
  fitnessLabel, regularTable, formatView, regionOf, REGION_LABEL, scoutsOf,
} from '@ehm/core';
import { useStore } from './store.tsx';
import { PlayerSheet, moodLabel } from './components/PlayerSheet.tsx';
import { Negotiation } from './components/Negotiation.tsx';
import { Sheet } from './components/Sheet.tsx';
import { Crest } from './components/Crest.tsx';
import { KnowledgeDots } from './components/KnowledgeDots.tsx';
import { Talent } from './components/Talent.tsx';
import { OverallBadge, viewSortValue, RatingBadge, EffectiveBadge } from './components/Badges.tsx';
import { FormStrip } from './components/FormStrip.tsx';
import { POSITION_LABEL, PROFILE_LABEL, TRAIT_LABEL, NATION_LABEL, euro } from './labels.ts';
import { fmt1 } from './format.ts';

interface Ui {
  openPlayer: (id: string) => void;
  openClub: (id: string) => void;
}

const UiCtx = createContext<Ui | null>(null);

export function useUi(): Ui {
  const u = useContext(UiCtx);
  if (!u) throw new Error('UiProvider fehlt');
  return u;
}

/** Fenster für Spielerprofil und Vereinskader sowie die Mouseover-Ebene */
export function UiProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<string | null>(null);
  const [club, setClub] = useState<string | null>(null);
  const openPlayer = useCallback((id: string) => setPlayer(id), []);
  const openClub = useCallback((id: string) => setClub(id), []);
  const ui = useMemo(() => ({ openPlayer, openClub }), [openPlayer, openClub]);
  return (
    <UiCtx.Provider value={ui}>
      {children}
      {club && <ClubSheet clubId={club} onClose={() => setClub(null)} />}
      {player && <PlayerProfile id={player} onClose={() => setPlayer(null)} />}
      <HoverLayer />
    </UiCtx.Provider>
  );
}

// ---------------------------------------------------------------- Namen

/** Spielername: Klick öffnet das Profil, Mouseover zeigt die Kurzinfo */
export function PlayerName({ p, full, pos }: { p: Player; full?: boolean; pos?: boolean }) {
  const { openPlayer } = useUi();
  return (
    <span
      className="pname"
      data-player={p.id}
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); openPlayer(p.id); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openPlayer(p.id); } }}
    >
      {pos && <span className={`pos pos-${p.position}`}>{p.position}</span>}
      {full ? `${p.firstName} ${p.lastName}` : `${p.firstName[0]}. ${p.lastName}`}
    </span>
  );
}

/** Spielername über die ID (z. B. aus Statistiken) */
export function PlayerNameId({ id, full }: { id: string; full?: boolean }) {
  const { byId } = useStore();
  const p = byId.get(id);
  return p ? <PlayerName p={p} full={full} /> : <span className="muted">–</span>;
}

/** Vereinsname: Klick öffnet den Kader */
export function ClubName({ c, crest = 0, full }: { c: Club; crest?: number; full?: boolean }) {
  const { openClub } = useUi();
  return (
    <span className="cname tteam" role="button" tabIndex={0} data-tip={`${c.name} – Kader ansehen`}
      onClick={(e) => { e.stopPropagation(); openClub(c.id); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openClub(c.id); } }}>
      {crest > 0 && <Crest club={c} size={crest} />}{full ? c.name : c.shortName}
    </span>
  );
}

// ---------------------------------------------------------------- Spielerprofil

function PlayerProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const { world, club, byId, clubById, toggleWatch } = useStore();
  const [nego, setNego] = useState(false);
  const p = byId.get(id);
  if (!p || !club) return null;
  const own = p.contract?.clubId === club.id;
  const st = world.scouting[club.id];
  const watched = !!st?.watch.includes(p.id);
  const av = availability(world, p, club.id);
  const info = av.ok ? marketInfo(world, p, club.id) : null;
  const other = p.contract ? clubById.get(p.contract.clubId) : undefined;
  const clubName = other ? <ClubName c={other} full /> : 'vereinslos';
  if (nego) return <Negotiation player={p} onClose={() => setNego(false)} />;

  if (own) {
    return (
      <PlayerSheet player={p} date={world.date} onClose={onClose} clubName={club.name}>
        {av.ok && <button className="btn primary block" onClick={() => setNego(true)}>{info?.myOffer ? 'Verlängerungsangebot ansehen / ändern' : 'Vertrag verlängern'}</button>}
      </PlayerSheet>
    );
  }
  const view = playerView(world, club.id, p, ageOn(p.birthDate, world.date));
  const region = regionOf(p);
  const scoutHere = scoutsOf(world, club.id).some((s) => (s.region ?? 'DE') === region);
  return (
    <PlayerSheet player={p} date={world.date} onClose={onClose} view={view} clubName={clubName}>
      <div className="sheet-actions">
        <button className={`btn block ${watched ? '' : 'primary'}`} onClick={() => toggleWatch(p.id)}
          data-tip="Deine Scouts beobachten ihn bevorzugt – auch außerhalb ihrer Einsatzregion (dort etwas langsamer).">
          {watched ? '✓ Wird gescoutet – Auftrag beenden' : 'Scoute diesen Spieler'}
        </button>
        {watched && view.level < 4 && (
          <p className="muted small">{scoutHere ? 'Ein Scout ist in seiner Region im Einsatz – schneller Fortschritt.' : `Kein Scout in der Region ${REGION_LABEL[region]} – die Scouts reisen hin, das dauert länger.`}</p>
        )}
        {av.ok
          ? <button className="btn block" onClick={() => setNego(true)}>{info?.myOffer ? 'Angebot ansehen / ändern' : 'Vertragsangebot machen'}</button>
          : <p className="muted small">Kein Angebot möglich: {p.lastName} {av.reason}.</p>}
      </div>
    </PlayerSheet>
  );
}

// ---------------------------------------------------------------- Vereinskader

const GROUPS: { title: string; pos: Player['position'][] }[] = [
  { title: 'Sturm', pos: ['C', 'LW', 'RW'] },
  { title: 'Verteidigung', pos: ['LD', 'RD'] },
  { title: 'Tor', pos: ['G'] },
];

function ClubSheet({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const { world, club: mine, clubById } = useStore();
  const c = clubById.get(clubId);
  if (!c || !mine) return null;
  const own = c.id === mine.id;
  const roster = world.players.filter((p) => p.contract?.clubId === c.id);
  const comp = world.competition;
  const table = comp ? regularTable(world) : [];
  const place = table.findIndex((r) => r.clubId === c.id) + 1;
  const row = table[place - 1];
  const head = world.staff.find((s) => s.contract?.clubId === c.id && s.role === 'headCoach');
  const views = new Map(roster.map((p) => [p.id, playerView(world, mine.id, p, ageOn(p.birthDate, world.date))]));
  return (
    <Sheet onClose={onClose} label={c.name} wide>
      <div className="club-head">
        <Crest club={c} size={56} />
        <div>
          <h2>{c.name}</h2>
          <div className="muted small">{PROFILE_LABEL[c.profile]} · {c.arena.name} ({c.arena.capacity.toLocaleString('de-DE')} Plätze){head ? ` · Trainer ${head.firstName} ${head.lastName}` : ''}</div>
          {row && row.gp > 0 && <div className="small">{place}. Platz · {row.pts} Punkte aus {row.gp} Spielen · Tore {row.gf}:{row.ga}</div>}
          {comp && <FormStrip comp={comp} clubId={c.id} />}
        </div>
      </div>
      {!own && <p className="muted small">Werte nach eurem Scouting-Stand. Spieler anklicken für das Profil.</p>}
      {GROUPS.map((g) => {
        const list = roster.filter((p) => g.pos.includes(p.position))
          .sort((a, b) => (own ? overall(b) - overall(a) : viewSortValue(views.get(b.id)!) - viewSortValue(views.get(a.id)!)));
        return (
          <section key={g.title}>
            <h4>{g.title} ({list.length})</h4>
            <ul className="roster compact">
              {list.map((p) => {
                const v = views.get(p.id)!;
                return (
                  <li key={p.id} className="static">
                    <span className={`pos pos-${p.position}`}>{p.position}</span>
                    <div className="roster-main">
                      <strong><PlayerName p={p} /></strong>
                      <small className="muted">{ageOn(p.birthDate, world.date)} J · {NATION_LABEL[p.nationalities[0]] ?? p.nationalities[0]}{p.contract ? ` · bis ${p.contract.untilSeason + 1}` : ''}</small>
                    </div>
                    {!own && <KnowledgeDots level={v.level} />}
                    {own ? <RatingBadge p={p} /> : <OverallBadge v={v} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Mouseover

type Hover = { kind: 'player'; id: string; rect: DOMRect } | { kind: 'tip'; text: string; rect: DOMRect };

function HoverLayer() {
  const [hover, setHover] = useState<Hover | null>(null);
  const current = useRef<Element | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-player],[data-tip]') as HTMLElement | null;
      if (el === current.current) return;
      current.current = el;
      clearTimeout(timer);
      if (!el) { setHover(null); return; }
      timer = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        if (el.dataset.player) setHover({ kind: 'player', id: el.dataset.player, rect });
        else if (el.dataset.tip) setHover({ kind: 'tip', text: el.dataset.tip, rect });
      }, el.dataset.player ? 280 : 150);
    };
    const hide = () => { clearTimeout(timer); current.current = null; setHover(null); };
    document.addEventListener('mouseover', over);
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!hover) return null;
  const { rect } = hover;
  const width = hover.kind === 'player' ? 290 : 260;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom < window.innerHeight * 0.62;
  const style = below ? { left, top: rect.bottom + 6, width } : { left, bottom: window.innerHeight - rect.top + 6, width };
  return (
    <div className={`hover-card ${hover.kind}`} style={style} role="tooltip">
      {hover.kind === 'tip' ? hover.text : <PlayerCard id={hover.id} />}
    </div>
  );
}

function PlayerCard({ id }: { id: string }) {
  const { world, club, byId, clubById } = useStore();
  const p = byId.get(id);
  if (!p || !club) return null;
  const own = p.contract?.clubId === club.id;
  const age = ageOn(p.birthDate, world.date);
  const view = own ? null : playerView(world, club.id, p, age);
  const traits = view ? p.traits.slice(0, view.traitsVisible) : p.traits.filter((t) => t.strength >= 50);
  const other = p.contract ? clubById.get(p.contract.clubId) : undefined;
  return (
    <div className="pcard">
      <div className="row-between">
        <span className="pcard-name"><span className={`pos pos-${p.position}`}>{p.position}</span>{p.firstName} {p.lastName}</span>
        {own ? <span className="rating">{fmt1(toDisplay1(overall(p)))}</span> : <OverallBadge v={view!} />}
      </div>
      <div className="muted small">{POSITION_LABEL[p.position]} · {age} J · {p.nationalities.map((n) => NATION_LABEL[n] ?? n).join('/')} · {other ? other.shortName : 'vereinslos'}</div>
      <div className="pcard-row"><span>Talent</span><Talent view={own ? { stars: talentStars(p.hidden.potential) } : view!.talent} /></div>
      {own ? (
        <>
          <div className="pcard-row"><span>Aktuelle Stärke</span><EffectiveBadge p={p} /></div>
          <div className="pcard-grid">
            <span>Fitness <b>{Math.round(p.condition.fitness)} %</b><small>{fitnessLabel(p.condition.fitness)}</small></span>
            <span>Form <b>{Math.round(p.condition.form)}</b><small>{formLabel(p.condition.form)}</small></span>
            <span>Moral <b>{Math.round(p.condition.morale)}</b><small>{moodLabel(p.condition.morale)}</small></span>
          </div>
        </>
      ) : (
        <div className="pcard-row"><span>Kenntnis</span><KnowledgeDots level={view!.level} /></div>
      )}
      {traits.length > 0 && <div className="pcard-traits">{traits.map((t) => <span key={t.id} className={`trait ${TRAIT_LABEL[t.id].tone}`}>{TRAIT_LABEL[t.id].name}</span>)}</div>}
      {view && view.traitsVisible < p.traits.length && <div className="muted small">Charakter: {p.traits.length - view.traitsVisible} Merkmal(e) unbekannt</div>}
      <div className="muted small">{p.contract ? `Vertrag bis ${p.contract.untilSeason + 1}${own ? ` · ${euro(p.contract.salary)}` : ''}` : 'ohne Vertrag'}{view && 'exact' in view.overall ? '' : view ? ` · Stärke ${formatView(view.overall)}` : ''}</div>
      <div className="muted tiny">Klicken für das Profil</div>
    </div>
  );
}

