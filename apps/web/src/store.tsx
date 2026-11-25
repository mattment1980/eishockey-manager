import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { World, Club, Player, Matchplan, Terms } from '@ehm/schema';
import { WorldSchema } from '@ehm/schema';
import { beginSeason, initScouting, submitOffer, withdrawOffer, type OfferResponse } from '@ehm/core';
import { generateWorld, migrateWorld, seasonTransition, ensureChemistry } from '@ehm/data';

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
  toggleWatch: (playerId: string) => void;
  makeOffer: (playerId: string, terms: Terms) => OfferResponse;
  withdraw: (playerId: string) => void;
  setScoutRegion: (scoutId: string, region: string) => void;
}

const Ctx = createContext<Store | null>(null);

function withCompetition(world: World): World {
  if (world.competition) return world;
  return beginSeason(world, world.seed);
}

function withScouting(world: World, clubId: string | null): World {
  if (!clubId || world.scouting[clubId]) return world;
  return initScouting(world, clubId);
}

function load(): SaveGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const parsed = WorldSchema.safeParse(migrateWorld(data.world));
    if (!parsed.success) return null;
    return { world: withScouting(withCompetition(ensureChemistry(parsed.data)), data.clubId ?? null), clubId: data.clubId ?? null };
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
          world: withScouting({ ...s.world, clubs: s.world.clubs.map((c) => (c.id === id ? { ...c, controller: { type: 'human' as const } } : c)) }, id),
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
          const sc = s.clubId ? s.world.scouting[s.clubId] : undefined;
          const scouting = sc && s.clubId && w.scouting[s.clubId] ? { ...w.scouting, [s.clubId]: { ...w.scouting[s.clubId], watch: sc.watch } } : w.scouting;
          const staff = w.staff.map((x) => {
            const cur = s.world.staff.find((y) => y.id === x.id);
            return cur && cur.region !== x.region ? { ...x, region: cur.region } : x;
          });
          return { ...s, world: { ...w, scouting, staff, clubs: w.clubs.map((c) => (mine && c.id === mine.id ? { ...c, matchplan: mine.matchplan } : c)) } };
        }),
      newSeason: () =>
        setSave((s) => ({ ...s, world: seasonTransition(s.world) })),
      newGame: () => setSave(fresh()),
      makeOffer: (playerId, terms) => {
        if (!save.clubId) return { kind: 'invalid', text: 'Kein Verein gewählt.' };
        const r = submitOffer(save.world, playerId, save.clubId, terms);
        setSave((s) => ({ ...s, world: r.world }));
        return r.response;
      },
      withdraw: (playerId) => setSave((s) => (s.clubId ? { ...s, world: withdrawOffer(s.world, playerId, s.clubId) } : s)),
      toggleWatch: (playerId) =>
        setSave((s) => {
          if (!s.clubId) return s;
          const st = s.world.scouting[s.clubId];
          const watch = st.watch.includes(playerId) ? st.watch.filter((x) => x !== playerId) : [...st.watch, playerId];
          return { ...s, world: { ...s.world, scouting: { ...s.world.scouting, [s.clubId]: { ...st, watch } } } };
        }),
      setScoutRegion: (scoutId, region) =>
        setSave((s) => ({ ...s, world: { ...s.world, staff: s.world.staff.map((x) => (x.id === scoutId ? { ...x, region } : x)) } })),
    };
  }, [save]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider fehlt');
  return s;
}
