import { createContext, useContext } from 'react';

/** Globale Fenster: Spielerprofil und Vereinskader (bereitgestellt von UiProvider in ui.tsx) */
export interface Ui {
  openPlayer: (id: string) => void;
  openClub: (id: string) => void;
}

export const UiCtx = createContext<Ui | null>(null);

export function useUi(): Ui {
  const u = useContext(UiCtx);
  if (!u) throw new Error('UiProvider fehlt');
  return u;
}
