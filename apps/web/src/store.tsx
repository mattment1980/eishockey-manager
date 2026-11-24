import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { World, Club, Player, Matchplan } from '@ehm/schema';
import { WorldSchema } from '@ehm/schema';
import { createCompetition, prepareNextDay } from '@ehm/core';
import { generateWorld, migrateWorld } from '@ehm/data';

const KEY = 'ehm.save.v1';

interface SaveGame {
  world: World;
  clubId: string | null;
}

interface Store {
  world: World;
  club: Club | null;
  players: Player[];
  byId: Map<string, Player>;
  clubById: Map<string, Club>;
  chooseClub: (id: string) => void;
  setMatchplan: (plan: Matchplan) => void;
  /** Neue Welt nach gespielten Spieltagen übernehmen (Manager-Änderungen bleiben erhalten) */
  applyWorld: (w: World) => void;
  newSeason: () => void;
  newGame: () => void;
}

const Ctx = createContext<Store | null>(null);

function withCompetition(world: World): World {
  if (world.competition) return world;
  return prepareNextDay({ ...world, competition: createCompetition(world, world.leagues[0].id, world.seed) });
}

function load(): SaveGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const parsed = WorldSchema.safeParse(migrateWorld(data.world));
    if (!parsed.success) return null;
    return { world: withCompetition(parsed.data), clubId: data.clubId ?? null };
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
  return { world: generateWorld(Math.floor(Math.random() * 1e9)), clubId: null };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<SaveGame>(() => load() ?? fresh());
  useEffect(() => persist(save), [save]);

  const store = useMemo<Store>(() => {
    const byId = new Map(save.world.players.map((p) => [p.id, p]));
    const clubById = new Map(save.world.clubs.map((c) => [c.id, c]));
    const club = save.world.clubs.find((c) => c.id === save.clubId) ?? null;
    return {
      world: save.world,
      club,
      byId,
      clubById,
      players: club ? save.world.players.filter((p) => p.contract?.clubId === club.id) : [],
      chooseClub: (id) =>
        setSave((s) => ({
          ...s,
          clubId: id,
          world: { ...s.world, clubs: s.world.clubs.map((c) => (c.id === id ? { ...c, controller: { type: 'human' as const } } : c)) },
        })),
      setMatchplan: (plan) =>
        setSave((s) => ({
          ...s,
          world: { ...s.world, clubs: s.world.clubs.map((c) => (c.id === s.clubId ? { ...c, matchplan: plan } : c)) },
        })),
      applyWorld: (w) =>
        setSave((s) => {
          // Aufstellung des Managers aus dem aktuellen Stand übernehmen (falls während der Simulation geändert)
          const mine = s.world.clubs.find((c) => c.id === s.clubId);
          return { ...s, world: { ...w, clubs: w.clubs.map((c) => (mine && c.id === mine.id ? { ...c, matchplan: mine.matchplan } : c)) } };
        }),
      newSeason: () =>
        setSave((s) => {
          const w = { ...s.world, season: s.world.season + 1, date: `${s.world.season + 1}-08-01`, competition: null };
          return { ...s, world: prepareNextDay({ ...w, competition: createCompetition(w, w.leagues[0].id, w.seed + w.season) }) };
        }),
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
