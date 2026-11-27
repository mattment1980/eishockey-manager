import { useState } from 'react';
import { playerView, ageOn, availability, marketInfo, regionOf, REGION_LABEL, scoutsOf } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from './PlayerSheet.tsx';
import { Negotiation } from './Negotiation.tsx';
import { ClubName } from './Names.tsx';

/** Profil eines Spielers – eigener Spieler mit allen Werten, fremder nach Scouting-Stand mit Scouting- und Angebotsknopf */
export function PlayerProfile({ id, onClose }: { id: string; onClose: () => void }) {
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
      <PlayerSheet player={p} date={world.date} onClose={onClose} clubName={club.name} world={world}>
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
