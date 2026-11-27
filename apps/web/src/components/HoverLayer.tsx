import { useEffect, useRef, useState } from 'react';
import { playerView, ageOn, overall, toDisplay1, talentStars, formLabel, fitnessLabel, formatView } from '@ehm/core';
import { useStore } from '../store.tsx';
import { moodLabel } from './PlayerSheet.tsx';
import { KnowledgeDots } from './KnowledgeDots.tsx';
import { Talent } from './Talent.tsx';
import { OverallBadge, EffectiveBadge } from './Badges.tsx';
import { POSITION_LABEL, TRAIT_LABEL, NATION_LABEL, euro } from '../labels.ts';
import { fmt1 } from '../format.ts';

/**
 * Mouseover-Ebene: Elemente mit `data-player` zeigen eine Spieler-Kurzinfo, Elemente mit `data-tip` einen Hinweistext.
 * Nur auf Geräten mit Maus (hover: hover).
 */
type Hover = { kind: 'player'; id: string; rect: DOMRect } | { kind: 'tip'; text: string; rect: DOMRect };

export function HoverLayer() {
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
