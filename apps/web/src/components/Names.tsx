import type { Player, Club } from '@ehm/schema';
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
