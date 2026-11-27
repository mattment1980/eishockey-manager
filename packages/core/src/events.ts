import type { World, Club, Player, TraitId, EventLog, Fixture } from '@ehm/schema';
import type { MatchResult } from './engine/types.ts';
import type { LedgerCategory } from './economy.ts';
import { bookExpense } from './economy.ts';
import { addDays, daysBetween, hash01 } from './calendar.ts';
import { pairKey, CHEM_START, hasTrait } from './chemistry.ts';
import { mondayOf, gamesInWeek } from './training.ts';
import { creditSponsorTermin } from './sponsors.ts';

/**
 * Events (Meilenstein 10): planbare Termine und Zufallsereignisse mit Entscheidung.
 * Die Ereignisse selbst stehen als Daten in `eventCatalog.ts` – ein neues Event ist ein neuer Eintrag dort.
 * Diese Datei enthält nur den Ablauf (planen, auswerten, entscheiden) und die Wirkungen (`Effect`).
 *
 * - Termine plant der Manager beim Wochenstart; jeder Termin ersetzt eine Trainingseinheit.
 *   Stadionbezogene Aktionen (Familientag, Kindertag, Business-Spieltag …) sind seit M12a Spieltagsaktionen (`stadiumActions.ts`).
 * - Zufallsereignisse kommen etwa alle 2–3 Wochen beim Wochenstart, meist mit 2–3 Antworten.
 *   Ohne Entscheidung (Schnell weiter) wählt der Co-Trainer die Standardantwort.
 * - Wiederholte Termine nutzen sich ab (Wirkung sinkt), manche haben eine Pause.
 */

// ---------- Wirkungen ----------

/** Wen eine Wirkung trifft */
export type Target = 'team' | 'subject' | 'subject2' | 'others';

export type Effect =
  | { kind: 'morale'; target: Target; amount: number; traits?: Partial<Record<TraitId, number>> }
  | { kind: 'fitness'; target: Target; amount: number }
  /** Chemie aller aktuellen Reihen (Punkte Richtung 100) */
  | { kind: 'chemistry'; amount: number }
  /** Chemie zwischen den beiden betroffenen Spielern */
  | { kind: 'pairChemistry'; amount: number }
  | { kind: 'fans'; amount: number }
  /** Fanbasis (langfristig, Punkte) */
  | { kind: 'fanBase'; amount: number }
  | { kind: 'sponsors'; amount: number }
  /** Geld: positiv = Einnahme, negativ = Ausgabe */
  | { kind: 'money'; amount: number; cat: LedgerCategory }
  | { kind: 'board'; amount: number }
  /** Zuschauerbonus (Anteil der Halle) für die nächsten Heimspiele */
  | { kind: 'attendance'; pct: number; games: number }
  /** nächstes eigenes Spiel wird zum „Spiel der Saison“ */
  | { kind: 'gameOfSeason' }
  /** Taktik-Eingespieltheit aller Systeme (Punkte) */
  | { kind: 'familiarity'; amount: number }
  /** Wochenplan: Belastung (Training) zusätzlich */
  | { kind: 'form'; target: Target; amount: number };

export interface Outcome {
  text: string;
  tone: EventLog['tone'];
  effects: Effect[];
  /** Spieler, auf den sich 'subject' bezieht, wenn er sich erst beim Auswerten ergibt */
  subject?: Player;
}

/** Alles, was ein Event zum Entscheiden und Auswerten braucht */
export interface EventCtx {
  world: World;
  club: Club;
  date: string;
  roster: Player[];
  subject?: Player;
  subject2?: Player;
  /** gewählte Variante eines Termins */
  option?: string;
  /** deterministischer Zufall 0–1 für einen Schlüssel */
  roll: (key: string) => number;
  /** Wie oft wurde dieses Event in den letzten `weeks` Wochen schon gemacht? */
  recent: (id: string, weeks: number) => number;
  /** Spiele des Vereins in dieser Woche */
  games: number;
  homeGames: number;
  /** Niederlagen in Folge (alle Wettbewerbe) */
  losingStreak: number;
}

export type EventCategory = 'team' | 'economy' | 'fans';

/** Planbarer Termin */
export interface TerminDef {
  id: string;
  category: EventCategory;
  label: string;
  /** Kurzbeschreibung inkl. Vor- und Nachteilen für die Anzeige */
  pros: string;
  cons: string;
  /** Kosten in € (zur Anzeige; gebucht wird über die Wirkungen) */
  cost?: number;
  /** Pause in Wochen, bevor der Termin wieder möglich ist */
  cooldown?: number;
  /** Varianten (z. B. Ton der Besprechung) */
  options?: { id: string; label: string }[];
  /** Termin braucht einen Spieler (z. B. Einzelgespräch); Filter für die Auswahl */
  subject?: (p: Player, ctx: EventCtx) => boolean;
  /** zählt als Pflichttermin für einen Sponsor */
  sponsorTermin?: boolean;
  /** Grund, warum der Termin diese Woche nicht geht (null = möglich) */
  blocked?: (ctx: EventCtx) => string | null;
  resolve: (ctx: EventCtx) => Outcome;
}

/** Zufallsereignis mit Entscheidung */
export interface RandomDef {
  id: string;
  category: EventCategory;
  /** relative Häufigkeit */
  weight: number;
  /** Pause in Wochen nach dem letzten Auftreten */
  cooldown?: number;
  /** Betroffene Spieler wählen; null = Ereignis passt gerade nicht */
  subjects?: (ctx: EventCtx) => Player[] | null;
  /** Kann es gerade auftreten? */
  when?: (ctx: EventCtx) => boolean;
  title: (ctx: EventCtx) => string;
  text: (ctx: EventCtx) => string;
  options: { id: string; label: string; hint: string; resolve: (ctx: EventCtx) => Outcome }[];
  /** Antwort, die der Co-Trainer ohne Entscheidung wählt */
  fallback: string;
}

export const EVT = {
  /** Abstand zwischen Zufallsereignissen in Tagen (frühestens / spätestens) */
  MIN_GAP: 12,
  MAX_GAP: 24,
  /** Abnutzung: jede Wiederholung in den letzten 4 Wochen senkt die Wirkung */
  WEAR: 0.6,
  /** „Spiel der Saison“: Formschub im Spiel, danach Delle */
  GOS_FORM: 12,
  GOS_MORALE_AFTER: -4,
  GOS_FITNESS_AFTER: -5,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

// ---------- Katalog-Zugriff (wird von eventCatalog.ts gefüllt) ----------

export const TERMINE: TerminDef[] = [];
export const RANDOM_EVENTS: RandomDef[] = [];
export function registerEvents(t: TerminDef[], r: RandomDef[]) {
  TERMINE.push(...t.filter((x) => !TERMINE.some((y) => y.id === x.id)));
  RANDOM_EVENTS.push(...r.filter((x) => !RANDOM_EVENTS.some((y) => y.id === x.id)));
}
export const terminDef = (id: string) => TERMINE.find((t) => t.id === id);
export const randomDef = (id: string) => RANDOM_EVENTS.find((t) => t.id === id);

// ---------- Kontext ----------

function losingStreak(world: World, clubId: string): number {
  const games = (world.competition?.fixtures ?? []).filter((f) => f.result && (f.home === clubId || f.away === clubId));
  let n = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    const f = games[i], r = f.result!;
    const mine = f.home === clubId ? r.score[0] : r.score[1], theirs = f.home === clubId ? r.score[1] : r.score[0];
    if (mine < theirs) n++; else break;
  }
  return n;
}

export function eventCtx(world: World, clubId: string, date: string, extra: Partial<EventCtx> = {}): EventCtx {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const roster = world.players.filter((p) => p.contract?.clubId === clubId);
  const start = mondayOf(date);
  const end = addDays(start, 7);
  const homeGames = world.competition?.fixtures.filter((f) => f.home === clubId && f.date >= start && f.date < end).length ?? 0;
  return {
    world, club, date, roster,
    roll: (key) => hash01(`${world.seed}:${clubId}:${date}:${key}`),
    recent: (id, weeks) => club.events.done.filter((d) => d.id === id && daysBetween(d.date, date) < weeks * 7).length,
    games: gamesInWeek(world, clubId, start),
    homeGames,
    losingStreak: losingStreak(world, clubId),
    ...extra,
  };
}

/** Abnutzung eines Termins: 1 = volle Wirkung */
export const wear = (ctx: EventCtx, id: string) => Math.pow(EVT.WEAR, ctx.recent(id, 4));

/** Terminplätze in einer Woche (jeder ersetzt eine Trainingseinheit) */
export const terminSlots = (games: number) => (games >= 3 ? 1 : 2);

/** Warum ein Termin gerade nicht geht (Pause, Wochenlage) */
export function terminBlocked(def: TerminDef, ctx: EventCtx): string | null {
  if (def.cooldown && ctx.recent(def.id, def.cooldown) > 0) return `erst wieder in einigen Wochen möglich`;
  return def.blocked?.(ctx) ?? null;
}

// ---------- Wirkungen anwenden ----------

function targets(t: Target, ctx: EventCtx): Player[] {
  if (t === 'team') return ctx.roster;
  if (t === 'subject') return ctx.subject ? [ctx.subject] : [];
  if (t === 'subject2') return ctx.subject2 ? [ctx.subject2] : [];
  return ctx.roster.filter((p) => p.id !== ctx.subject?.id && p.id !== ctx.subject2?.id);
}

export function applyEffects(world: World, clubId: string, effects: Effect[], ctx: EventCtx): World {
  let w = world;
  const changed = new Map<string, Player>();
  const get = (p: Player) => changed.get(p.id) ?? w.players.find((x) => x.id === p.id)!;
  let club = w.clubs.find((c) => c.id === clubId)!;
  for (const e of effects) {
    switch (e.kind) {
      case 'morale':
      case 'fitness':
      case 'form':
        for (const p0 of targets(e.target, ctx)) {
          const p = get(p0);
          let amount = e.amount;
          if (e.kind === 'morale' && e.traits) for (const [t, f] of Object.entries(e.traits)) if (hasTrait(p, t as TraitId)) amount *= f!;
          const key = e.kind;
          const lo = key === 'fitness' ? 40 : 0;
          changed.set(p.id, { ...p, condition: { ...p.condition, [key]: r1(clamp(p.condition[key] + amount, lo, 100)) } });
        }
        break;
      case 'chemistry': {
        const plan = club.matchplan;
        if (!plan) break;
        const chem = { ...w.chemistry };
        for (const u of [...plan.forwardLines, ...plan.defensePairs]) for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
          const k = pairKey(u[i], u[j]);
          chem[k] = r1(clamp((chem[k] ?? CHEM_START) + e.amount, 0, 100));
        }
        w = { ...w, chemistry: chem };
        break;
      }
      case 'pairChemistry':
        if (ctx.subject && ctx.subject2) {
          const k = pairKey(ctx.subject.id, ctx.subject2.id);
          w = { ...w, chemistry: { ...w.chemistry, [k]: r1(clamp((w.chemistry[k] ?? CHEM_START) + e.amount, 0, 100)) } };
        }
        break;
      case 'fans':
        club = { ...club, mood: { ...club.mood, fans: r1(clamp(club.mood.fans + e.amount, 0, 100)) } };
        break;
      case 'fanBase':
        club = { ...club, fanBase: r1(clamp(club.fanBase + e.amount, 1, 100)) };
        break;
      case 'sponsors':
        club = { ...club, mood: { ...club.mood, sponsors: r1(clamp(club.mood.sponsors + e.amount, 0, 100)) } };
        break;
      case 'board':
        club = { ...club, boardConfidence: r1(clamp(club.boardConfidence + e.amount, 0, 100)) };
        break;
      case 'attendance': {
        const cur = club.events.attendance;
        club = { ...club, events: { ...club.events, attendance: { pct: Math.max(cur?.pct ?? 0, e.pct), games: Math.max(cur?.games ?? 0, e.games) } } };
        break;
      }
      case 'gameOfSeason': {
        const next = w.competition?.fixtures.find((f) => !f.result && (f.home === clubId || f.away === clubId) && f.date >= ctx.date);
        if (next) club = { ...club, events: { ...club.events, gameOfSeason: next.id } };
        break;
      }
      case 'familiarity': {
        const fam: Record<string, number> = {};
        for (const [k, v] of Object.entries(club.familiarity)) fam[k] = r1(clamp(v + e.amount, 0, 100));
        club = { ...club, familiarity: fam };
        break;
      }
      case 'money':
        // Geld wird nach den übrigen Wirkungen gebucht
        break;
    }
  }
  w = { ...w, clubs: w.clubs.map((c) => (c.id === clubId ? club : c)), players: changed.size ? w.players.map((p) => changed.get(p.id) ?? p) : w.players };
  for (const e of effects) if (e.kind === 'money' && e.amount) w = bookExpense(w, clubId, e.cat, -e.amount);
  return w;
}

export function logEvent(world: World, clubId: string, entry: EventLog, doneId: string): World {
  return {
    ...world,
    clubs: world.clubs.map((c) => (c.id === clubId ? { ...c, events: { ...c.events, log: [entry, ...c.events.log].slice(0, 40), done: [...c.events.done, { id: doneId, date: entry.date }].slice(-60) } } : c)),
    market: { ...world.market, news: [{ date: entry.date, kind: 'info' as const, text: `${entry.title}: ${entry.text}`, mine: true }, ...world.market.news].slice(0, 120) },
  };
}

// ---------- Ablauf ----------

const humanClub = (world: World) => world.clubs.find((c) => c.controller.type === 'human');

/** Termine der Woche auswerten (geplant vom Manager) */
function runTermine(world: World, clubId: string, date: string): World {
  let w = world;
  const plan = w.clubs.find((c) => c.id === clubId)!.events.plan;
  for (const entry of plan) {
    const def = terminDef(entry.id);
    if (!def) continue;
    const ctx = eventCtx(w, clubId, date, { option: entry.option, subject: entry.subject ? w.players.find((p) => p.id === entry.subject) : undefined });
    if (terminBlocked(def, ctx)) continue;
    const out = def.resolve(ctx);
    w = applyEffects(w, clubId, out.effects, out.subject ? { ...ctx, subject: out.subject } : ctx);
    w = logEvent(w, clubId, { date, defId: def.id, title: def.label, text: out.text, tone: out.tone }, def.id);
    if (def.sponsorTermin) w = creditSponsorTermin(w, clubId);
  }
  return { ...w, clubs: w.clubs.map((c) => (c.id === clubId ? { ...c, events: { ...c.events, plan: [] } } : c)) };
}

/** Zufallsereignis würfeln (höchstens eines offen; Abstand 12–24 Tage) */
function rollRandom(world: World, clubId: string, date: string): World {
  const club = world.clubs.find((c) => c.id === clubId)!;
  if (club.events.pending) return world;
  const last = [...club.events.done].reverse().find((d) => randomDef(d.id));
  const gap = last ? daysBetween(last.date, date) : EVT.MAX_GAP;
  if (gap < EVT.MIN_GAP) return world;
  const chance = gap >= EVT.MAX_GAP ? 1 : 0.4;
  const ctx = eventCtx(world, clubId, date);
  if (ctx.roll('zufall') > chance) return world;
  const options = RANDOM_EVENTS.map((d) => {
    if (d.cooldown && ctx.recent(d.id, d.cooldown) > 0) return null;
    if (d.when && !d.when(ctx)) return null;
    const subs = d.subjects ? d.subjects(ctx) : [];
    if (subs === null) return null;
    return { d, subs };
  }).filter((x): x is { d: RandomDef; subs: Player[] } => !!x);
  if (!options.length) return world;
  const total = options.reduce((s, o) => s + o.d.weight, 0);
  let r = ctx.roll('welches') * total;
  const pick = options.find((o) => (r -= o.d.weight) <= 0) ?? options[0];
  return {
    ...world,
    clubs: world.clubs.map((c) => (c.id === clubId ? { ...c, events: { ...c.events, pending: { defId: pick.d.id, date, subjects: pick.subs.map((p) => p.id) } } } : c)),
  };
}

/** Kontext für ein offenes Zufallsereignis */
export function pendingCtx(world: World, clubId: string): { def: RandomDef; ctx: EventCtx } | null {
  const club = world.clubs.find((c) => c.id === clubId);
  const pend = club?.events.pending;
  const def = pend && randomDef(pend.defId);
  if (!club || !pend || !def) return null;
  const subjects = pend.subjects.map((id) => world.players.find((p) => p.id === id));
  if (subjects.some((p) => !p || p.contract?.clubId !== clubId)) return null;
  return { def, ctx: eventCtx(world, clubId, pend.date, { subject: subjects[0], subject2: subjects[1] }) };
}

/** Entscheidung zu einem offenen Zufallsereignis */
export function resolvePending(world: World, clubId: string, optionId?: string): World {
  const pc = pendingCtx(world, clubId);
  const clear = (w: World) => ({ ...w, clubs: w.clubs.map((c) => (c.id === clubId ? { ...c, events: { ...c.events, pending: null } } : c)) });
  if (!pc) return clear(world);
  const opt = pc.def.options.find((o) => o.id === (optionId ?? pc.def.fallback)) ?? pc.def.options[0];
  const out = opt.resolve(pc.ctx);
  let w = applyEffects(world, clubId, out.effects, pc.ctx);
  w = logEvent(w, clubId, { date: pc.ctx.date, defId: pc.def.id, title: pc.def.title(pc.ctx), text: `${optionId ? '' : 'Der Co-Trainer entscheidet: '}${opt.label} – ${out.text}`, tone: out.tone }, pc.def.id);
  return clear(w);
}

/**
 * Wochenstart: Termine auswerten und ggf. ein Zufallsereignis ziehen (nur für den Verein des Managers).
 * Wird nach dem Training der Woche aufgerufen (Termine haben dort Trainingseinheiten ersetzt).
 */
export function runWeekEvents(world: World, date: string): World {
  const club = humanClub(world);
  if (!club) return world;
  const start = mondayOf(date);
  if (club.events.week && club.events.week >= start) return world;
  // offenes Ereignis aus der Vorwoche: Co-Trainer entscheidet
  let w = club.events.pending ? resolvePending(world, club.id) : world;
  w = runTermine(w, club.id, date);
  w = rollRandom(w, club.id, date);
  return { ...w, clubs: w.clubs.map((c) => (c.id === club.id ? { ...c, events: { ...c.events, week: start } } : c)) };
}

// ---------- Stimmung im Umfeld ----------

/** Nach einem Spieltag: Fanstimmung nach Ergebnissen, Sponsoren folgen langsam; Event-Boni verbrauchen */
export function updateMoods(world: World, games: { fixture: Fixture; result: MatchResult }[]): World {
  if (!games.length) return world;
  const delta = new Map<string, number>();
  const gos = new Set<string>();
  const homeIds = new Set<string>();
  for (const { fixture, result } of games) {
    const [h, a] = result.score;
    const big = Math.abs(h - a) >= 3 ? 1.4 : 1;
    const ot = result.decidedIn !== 'REG';
    delta.set(fixture.home, (delta.get(fixture.home) ?? 0) + (h > a ? (ot ? 0.8 : 1.5) * big : ot ? -0.4 : -1.4 * big));
    delta.set(fixture.away, (delta.get(fixture.away) ?? 0) + (a > h ? (ot ? 0.9 : 1.8) * big : ot ? -0.3 : -1 * big));
    homeIds.add(fixture.home);
    for (const id of [fixture.home, fixture.away]) {
      const c = world.clubs.find((x) => x.id === id);
      if (c?.events.gameOfSeason === fixture.id) gos.add(id);
    }
  }
  let w: World = {
    ...world,
    clubs: world.clubs.map((c) => {
      const d = delta.get(c.id);
      if (d === undefined && !gos.has(c.id)) return c;
      // langsames Zurückpendeln zur Mitte
      const fans = clamp(c.mood.fans + (d ?? 0) + (50 - c.mood.fans) * 0.02, 0, 100);
      const sponsors = clamp(c.mood.sponsors + (fans - c.mood.sponsors) * 0.03 + (50 - c.mood.sponsors) * 0.01, 0, 100);
      const att = c.events.attendance && homeIds.has(c.id) ? (c.events.attendance.games > 1 ? { ...c.events.attendance, games: c.events.attendance.games - 1 } : null) : c.events.attendance;
      return { ...c, mood: { fans: r1(fans), sponsors: r1(sponsors) }, events: { ...c.events, attendance: att, gameOfSeason: gos.has(c.id) ? null : c.events.gameOfSeason } };
    }),
  };
  // „Spiel der Saison“: Delle danach
  for (const id of gos) {
    const ids = new Set(w.players.filter((p) => p.contract?.clubId === id).map((p) => p.id));
    w = { ...w, players: w.players.map((p) => (ids.has(p.id) ? { ...p, condition: { ...p.condition, morale: r1(clamp(p.condition.morale + EVT.GOS_MORALE_AFTER, 0, 100)), fitness: r1(clamp(p.condition.fitness + EVT.GOS_FITNESS_AFTER, 40, 100)) } } : p)) };
  }
  return w;
}

/** Formschub im „Spiel der Saison“ */
export const isGameOfSeason = (c: Club, fixtureId: string) => c.events.gameOfSeason === fixtureId;

export const MOOD_LABEL = (v: number) => (v >= 80 ? 'euphorisch' : v >= 62 ? 'gut' : v >= 42 ? 'normal' : v >= 25 ? 'gereizt' : 'aufgebracht');
export const SPONSOR_LABEL = (v: number) => (v >= 80 ? 'begeistert' : v >= 62 ? 'zufrieden' : v >= 42 ? 'normal' : v >= 25 ? 'skeptisch' : 'verärgert');
