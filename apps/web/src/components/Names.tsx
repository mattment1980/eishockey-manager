import type { Player, Club } from '@ehm/schema';
import { injuryStatus, injuryLabel, prognosisText } from '@ehm/core';
import { useStore } from '../store.tsx';
import { useUi } from '../uiContext.ts';
import { Crest } from './Crest.tsx';

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
      <InjuryBadge p={p} />
    </span>
  );
}

/** Kreuz für verletzte (rot) und angeschlagene (orange) Spieler */
export function InjuryBadge({ p }: { p: Player }) {
  const { world } = useStore();
  if (!p.injury) return null;
  const st = injuryStatus(p, world.date);
  if (st === 'fit') return null;
  const tip = `${st === 'injured' ? 'Verletzt' : 'Angeschlagen'}: ${injuryLabel(p.injury.kind)} – ${prognosisText(p.injury, world.date)}${st === 'knock' ? (p.injury.play ? ' · darf spielen (mit Abzug, Rückfallrisiko)' : ' · wird geschont') : ''}`;
  return <span className={`inj-badge ${st}`} data-tip={tip} aria-label={tip}>✚</span>;
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
