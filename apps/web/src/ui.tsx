import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { UiCtx } from './uiContext.ts';
import { PlayerProfile } from './components/PlayerProfile.tsx';
import { ClubSheet } from './components/ClubSheet.tsx';
import { HoverLayer } from './components/HoverLayer.tsx';

export { useUi } from './uiContext.ts';
export { PlayerName, PlayerNameId, ClubName } from './components/Names.tsx';

/** Stellt die globalen Fenster (Spielerprofil, Vereinskader) und die Mouseover-Ebene bereit */
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
