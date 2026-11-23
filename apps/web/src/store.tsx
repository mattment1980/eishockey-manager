import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { World, Club, Player, Matchplan } from '@ehm/schema';
import { WorldSchema } from '@ehm/schema';
import { generateWorld } from '@ehm/data';

const KEY = 'ehm.save.v1';

interface SaveGame {
  world: World;
  clubId: string | null;
  results: ResultSummary[];
}

export interface ResultSummary {
  date: string;
  homeId: string;
  awayId: string;
  score: [number, number];
  decidedIn: 'REG' | 'OT' | 'SO';
}

interface Store {
  world: World;
  club: Club | null;
  players: Player[];
  byId: Map<string, Player>;
  results: ResultSummary[];
  chooseClub: (id: string) => void;
  setMatchplan: (plan: Matchplan) => void;
  addResult: (r: ResultSummary) => void;
  newGame: () => void;
}

const Ctx = createContext<Store | null>(null);

function load(): SaveGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!WorldSchema.safeParse(data.world).success) return null;
    return data as SaveGame;
  } catch {
    return null;
  }
}

function persist(save: SaveGame) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* Speichern nicht möglich – Spiel läuft im Speicher weiter */
  }
}

function fresh(): SaveGame {
  return { world: generateWorld(Math.floor(Math.random() * 1e9)), clubId: null, results: [] };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<SaveGame>(() => load() ?? fresh());
  useEffect(() => persist(save), [save]);

  const store = useMemo<Store>(() => {
    const byId = new Map(save.world.players.map((p) => [p.id, p]));
    const club = save.world.clubs.find((c) => c.id === save.clubId) ?? null;
    return {
      world: save.world,
      club,
      byId,
      players: club ? save.world.players.filter((p) => p.contract?.clubId === club.id) : [],
      results: save.results,
      chooseClub: (id) =>
        setSave((s) => ({
          ...s,
          clubId: id,
          world: {
            ...s.world,
            clubs: s.world.clubs.map((c) => (c.id === id ? { ...c, controller: { type: 'human' as const } } : c)),
          },
        })),
      setMatchplan: (plan) =>
        setSave((s) => ({
          ...s,
          world: { ...s.world, clubs: s.world.clubs.map((c) => (c.id === s.clubId ? { ...c, matchplan: plan } : c)) },
        })),
      addResult: (r) => setSave((s) => ({ ...s, results: [r, ...s.results].slice(0, 50) })),
      newGame: () => setSave(fresh()),
    };
  }, [save]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider fehlt');
  return s;
}
