import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { World, Club, Player, Matchplan, Terms, Training } from '@ehm/schema';
import { WorldSchema } from '@ehm/schema';
import { beginSeason, initScouting, submitOffer, withdrawOffer, signYouth, releaseYouth, startWeek, type OfferResponse } from '@ehm/core';
import { generateWorld, migrateWorld, advanceOffseason, ensureChemistry, exportWorldJson, importWorldJson } from '@ehm/data';

const KEY = 'ehm.save.v1';
const TEMPLATE_KEY = 'ehm.template.v1';

interface SaveGame {
  world: World;
  clubId: string | null;
}

/**
 * Eine Änderung des Managers an der Welt. Alle Eingaben laufen als Aktion über `act`:
 * Läuft gerade eine Simulation (im Web Worker, auf einer Kopie der Welt), werden die Aktionen
 * gemerkt und auf das Ergebnis der Simulation erneut angewendet – so geht keine Eingabe verloren.
 */
type Action = (world: World, clubId: string | null) => World;

interface Store {
  world: World;
  club: Club | null;
  players: Player[];
  byId: Map<string, Player>;
  clubById: Map<string, Club>;
  /** Läuft gerade eine Simulation? */
  simulating: boolean;
  /** Letzter Fehler beim Speichern im Browser (null = alles gespeichert) */
  saveError: string | null;
  chooseClub: (id: string) => void;
  setMatchplan: (plan: Matchplan) => void;
  /** Spieltage simulieren: `run` rechnet auf einer Kopie; Eingaben währenddessen werden danach erneut angewendet */
  simulate: (run: (w: World) => Promise<World>) => Promise<void>;
  /** Sommerpause: zur nächsten Phase (nach der letzten beginnt die Saison) */
  advanceOffseason: () => void;
  newGame: () => void;
  toggleWatch: (playerId: string) => void;
  makeOffer: (playerId: string, terms: Terms) => OfferResponse;
  withdraw: (playerId: string) => void;
  setScoutRegion: (scoutId: string, region: string) => void;
  /** Nachwuchstalent: Fördervertrag geben (Fehlertext, wenn nicht möglich) oder freigeben */
  signYouth: (playerId: string) => string | null;
  releaseYouth: (playerId: string) => void;
  /** Tag der Leistungstests als gesehen markieren */
  markTestDaySeen: () => void;
  /** Datenwerkstatt: Welt ändern (als Aktion, auch während einer Simulation sicher) */
  editWorld: (fn: (w: World) => World) => void;
  /** Training des eigenen Vereins ändern (Wochenplan, Einzeltraining, Co-Trainer-Regel) */
  setTraining: (patch: Partial<Training>) => void;
  /** Wochenablauf: Training der anstehenden Woche ausführen */
  startWeek: () => void;
  /** Vor Spielbeginn: Welt komplett ersetzen (z. B. nach Import oder Neuaufbau) */
  replaceWorld: (w: World) => void;
  /** Eigene Vorlage (Datensatz) im Browser */
  hasTemplate: boolean;
  saveTemplate: () => string | null;
  loadTemplate: () => string | null;
  /** Spielstand als JSON-Text (zum Herunterladen) */
  exportSave: () => string;
  /** Spielstand aus JSON-Text laden; gibt Fehlermeldungen zurück (leer = geladen) */
  importSave: (json: string) => string[];
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

/** Verein des Managers aus der Welt (für importierte Spielstände) */
const humanClub = (world: World) => world.clubs.find((c) => c.controller.type === 'human')?.id ?? null;

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

/** Speichern; gibt bei Fehler eine Meldung zurück */
function persist(save: SaveGame): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return null;
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return quota
      ? 'Der Browser-Speicher ist voll – der Spielstand konnte nicht gespeichert werden. Bitte unter „Verein“ eine Sicherung herunterladen.'
      : 'Der Spielstand konnte nicht im Browser gespeichert werden (z. B. privates Fenster). Bitte unter „Verein“ eine Sicherung herunterladen.';
  }
}

function fresh(): SaveGame {
  return { world: generateWorld(Math.floor(Math.random() * 1e9)), clubId: null };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<SaveGame>(() => load() ?? fresh());
  const [simulating, setSimulating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasTemplate, setHasTemplate] = useState(() => { try { return !!localStorage.getItem(TEMPLATE_KEY); } catch { return false; } });
  /** Aktionen, die während einer laufenden Simulation ausgeführt wurden */
  const pending = useRef<Action[] | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => setSaveError(persist(save)), [save]);

  const act = useCallback((a: Action) => {
    if (pending.current) pending.current.push(a);
    setSave((s) => ({ ...s, world: a(s.world, s.clubId) }));
  }, []);

  const simulate = useCallback(async (run: (w: World) => Promise<World>) => {
    if (pending.current) return; // läuft schon
    pending.current = [];
    setSimulating(true);
    try {
      const result = await run(saveRef.current.world);
      const actions = pending.current ?? [];
      setSave((s) => ({ ...s, world: actions.reduce((w, a) => a(w, s.clubId), result) }));
    } finally {
      pending.current = null;
      setSimulating(false);
    }
  }, []);

  const store = useMemo<Store>(() => {
    const byId = new Map(save.world.players.map((p) => [p.id, p]));
    const clubById = new Map(save.world.clubs.map((c) => [c.id, c]));
    const club = save.world.clubs.find((c) => c.id === save.clubId) ?? null;
    return {
      world: save.world,
      club,
      byId,
      clubById,
      simulating,
      saveError,
      players: club ? save.world.players.filter((p) => p.contract?.clubId === club.id) : [],
      chooseClub: (id) =>
        setSave((s) => ({
          ...s,
          clubId: id,
          world: withScouting({ ...s.world, clubs: s.world.clubs.map((c) => (c.id === id ? { ...c, controller: { type: 'human' as const } } : c)) }, id),
        })),
      setMatchplan: (plan) =>
        act((w, clubId) => ({ ...w, clubs: w.clubs.map((c) => (c.id === clubId ? { ...c, matchplan: plan } : c)) })),
      simulate,
      advanceOffseason: () => act((w) => advanceOffseason(w)),
      newGame: () => setSave(fresh()),
      makeOffer: (playerId, terms) => {
        if (!save.clubId) return { kind: 'invalid', text: 'Kein Verein gewählt.' };
        // Antwort für die Anzeige aus dem aktuellen Stand; die Aktion selbst läuft über die Warteschlange
        const r = submitOffer(save.world, playerId, save.clubId, terms);
        act((w, clubId) => (clubId ? submitOffer(w, playerId, clubId, terms).world : w));
        return r.response;
      },
      withdraw: (playerId) => act((w, clubId) => (clubId ? withdrawOffer(w, playerId, clubId) : w)),
      toggleWatch: (playerId) =>
        act((w, clubId) => {
          if (!clubId || !w.scouting[clubId]) return w;
          const st = w.scouting[clubId];
          const watch = st.watch.includes(playerId) ? st.watch.filter((x) => x !== playerId) : [...st.watch, playerId];
          return { ...w, scouting: { ...w.scouting, [clubId]: { ...st, watch } } };
        }),
      setScoutRegion: (scoutId, region) =>
        act((w) => ({ ...w, staff: w.staff.map((x) => (x.id === scoutId ? { ...x, region } : x)) })),
      signYouth: (playerId) => {
        const r = signYouth(save.world, playerId);
        if (r.error) return r.error;
        act((w) => signYouth(w, playerId).world);
        return null;
      },
      releaseYouth: (playerId) => act((w) => releaseYouth(w, playerId)),
      markTestDaySeen: () => act((w) => (w.offseason?.testDay ? { ...w, offseason: { ...w.offseason, testDay: { ...w.offseason.testDay, seen: true } } } : w)),
      editWorld: (fn) => act((w) => fn(w)),
      startWeek: () => act((w) => startWeek(w)),
      setTraining: (patch) => act((w, clubId) => ({ ...w, clubs: w.clubs.map((c) => (c.id === clubId ? { ...c, training: { ...c.training, ...patch } } : c)) })),
      replaceWorld: (w) => setSave((s) => ({ ...s, world: w })),
      hasTemplate,
      saveTemplate: () => {
        try {
          localStorage.setItem(TEMPLATE_KEY, JSON.stringify(save.world));
          setHasTemplate(true);
          return null;
        } catch {
          return 'Die Vorlage konnte nicht im Browser gespeichert werden (Speicher voll?). Bitte als Datei exportieren.';
        }
      },
      loadTemplate: () => {
        const raw = localStorage.getItem(TEMPLATE_KEY);
        if (!raw) return 'Keine Vorlage gespeichert.';
        const res = importWorldJson(raw);
        if (!res.ok) return `Vorlage fehlerhaft: ${res.errors.slice(0, 2).join('; ')}`;
        setSave({ world: res.world, clubId: null });
        return null;
      },
      exportSave: () => exportWorldJson(save.world),
      importSave: (json) => {
        const res = importWorldJson(json);
        if (!res.ok) return res.errors;
        const clubId = humanClub(res.world);
        setSave({ world: withScouting(withCompetition(res.world), clubId), clubId });
        return [];
      },
    };
  }, [save, simulating, saveError, hasTemplate, act, simulate]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider fehlt');
  return s;
}
