import type { World, Club, Fixture, Stand, StandValues, ClubProfile, HomeGameReport, ClubStadium } from '@ehm/schema';
import { STANDS } from '@ehm/schema';
import { hash01, monthKey } from './calendar.ts';
import { lastResults, regularTable } from './standings.ts';
import { overall, toDisplay } from './ratings.ts';
import { businessManager, creditSponsorTermin } from './sponsors.ts';
import { applyEffects, eventCtx, logEvent } from './events.ts';
import { C } from './engine/constants.ts';
import { ACTIONS, actionDef, type ActionDef } from './stadiumActions.ts';

/**
 * Stadionbetrieb & Zuschauer (Meilenstein 12a).
 *
 * - Nachfrage je Heimspiel und Platzbereich (Steh, Sitz, Business); Zuschauer = min(Plätze, Nachfrage).
 *   Überhang = ausverkauft, Abgewiesene werden gezählt.
 * - Einflüsse: Fanbasis, Tabellenplatz, Form, Gegner, Derby, Wettbewerb, Wochentag, Saisonphase,
 *   Fanstimmung, Identifikationsfiguren, Event-Boni, Spieltagsaktion, Preis (je Bereich eigene Preisempfindlichkeit).
 * - Catering: Eigenbetrieb (Risiko und Ertrag) oder Pächter (feste Pacht + kleine Umsatzbeteiligung). Fanshop monatlich.
 * - Heimvorteil der Engine aus Menge (Auslastung) und Art (Stimmung in der Halle) der Zuschauer.
 */

export const STAND_LABEL: Record<Stand, string> = { standing: 'Stehplatz', seated: 'Sitzplatz', business: 'Business/VIP' };

export const ST = {
  /** Fans je Punkt Fanbasis (Grundnachfrage) */
  FANS_PER_POINT: 76,
  /** üblicher Preis in der Liga je Bereich (€), wird mit dem Vereinsprofil skaliert */
  REF_PRICE: { standing: 16, seated: 25, business: 62 } as StandValues,
  PROFILE_PRICE: { corporate: 1.14, patron: 1.05, tradition: 1.0, development: 0.9, promoted: 0.86 } as Record<ClubProfile, number>,
  /** Aufteilung der Halle (Steh, Sitz, Business) nach Profil */
  SEAT_SPLIT: { tradition: [0.6, 0.36, 0.04], corporate: [0.42, 0.5, 0.08], patron: [0.5, 0.44, 0.06], development: [0.58, 0.38, 0.04], promoted: [0.62, 0.35, 0.03] } as Record<ClubProfile, [number, number, number]>,
  /** Preisempfindlichkeit je Bereich (Stehplatz am stärksten) */
  ELASTICITY: { standing: 1.2, seated: 0.9, business: 0.6 } as StandValues,
  /** akzeptierter Aufschlag in den Playoffs und bei Topspielen/Derbys */
  ACCEPT_PLAYOFF: 0.25,
  ACCEPT_TOP: 0.1,
  /** Gästefans je Punkt Fanbasis des Gegners; Gästeblock höchstens dieser Anteil der Stehplätze */
  AWAY_PER_POINT: 3.5,
  AWAY_BLOCK: 0.1,
  /** Anteil der abgewiesenen Stehplatz-Nachfrage, der auf Sitzplätze ausweicht */
  SPILL: 0.35,
  /** Wochentag (So … Sa) */
  WEEKDAY: [0.04, -0.08, -0.06, -0.06, -0.05, 0, 0.04],
  /** Catering: Ausgaben je Kopf (€) */
  SPEND: { standing: 8, seated: 9, business: 30 } as StandValues,
  LEVEL: {
    basic: { label: 'Basis', spend: 0.85, cost: 0.34, staff: 0.85, lease: 0.8 },
    standard: { label: 'Standard', spend: 1, cost: 0.38, staff: 1, lease: 1 },
    premium: { label: 'Premium', spend: 1.2, cost: 0.42, staff: 1.25, lease: 1.2 },
  },
  PRICING: {
    low: { label: 'günstig', spend: 0.9, mood: 0.12 },
    normal: { label: 'normal', spend: 1, mood: 0 },
    high: { label: 'teuer', spend: 1.08, mood: -0.12 },
  },
  /** Eigenbetrieb: Personal und Betrieb je Heimspiel und Platz (€) */
  STAFF_PER_SEAT: 0.9,
  /** Eigenbetrieb: Störfall je Heimspiel (Kühlung, Kasse, Hygiene) */
  INCIDENT: 0.04,
  /** Pächter: feste Pacht je Heimspiel und Platz (€) plus Umsatzbeteiligung */
  LEASE_PER_SEAT: 2.2,
  LEASE_SHARE: 0.08,
  /** Fanshop: Umsatz je Monat und Punkt Fanbasis (€), Wareneinsatz, Größe */
  SHOP_PER_POINT: 380,
  SHOP_COST: 0.45,
  SHOP: {
    small: { label: 'klein', rev: 0.75, fixed: 2000 },
    standard: { label: 'normal', rev: 1, fixed: 4000 },
    large: { label: 'groß', rev: 1.3, fixed: 7000 },
  },
  SHOP_MONTH: { '01': 0.9, '02': 0.9, '03': 1.1, '04': 1, '05': 0.5, '06': 0.4, '07': 0.6, '08': 0.9, '09': 1.4, '10': 1, '11': 1, '12': 1.6 } as Record<string, number>,
  /** Leitlinie des Geschäftsführers: Zielpreis relativ zum üblichen Preis */
  STRATEGY: { fans: { label: 'fanfreundlich', price: 0.9 }, balanced: { label: 'ausgewogen', price: 1 }, profit: { label: 'gewinnorientiert', price: 1.12 } },
  AI_STRATEGY: { corporate: 'profit', patron: 'balanced', tradition: 'balanced', development: 'fans', promoted: 'fans' } as Record<ClubProfile, ClubStadium['strategy']>,
  /** Fanbasis: höchste Veränderung pro Saisonwechsel */
  FANBASE_MAX: 3,
  /** Planung: typischer Zuschlag aus Gästefans, Wochentag, Stars usw. gegenüber der Grundnachfrage */
  PLAN_UPLIFT: 1.08,
  /** Spieltagsaktion: Abnutzung je Wiederholung in den letzten 4 Heimspielen */
  WEAR: 0.6,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const sumOf = (v: StandValues) => v.standing + v.seated + v.business;
const map = (f: (s: Stand) => number): StandValues => ({ standing: f('standing'), seated: f('seated'), business: f('business') });

// ---------------------------------------------------------------- Halle und Preise

/** Plätze je Bereich (aus der Halle oder nach Profil aufgeteilt) */
export function seatsOf(club: Club): StandValues {
  const cap = club.arena.capacity;
  const s = club.arena.seats;
  if (s && sumOf(s) === cap) return s;
  const [st, , bu] = ST.SEAT_SPLIT[club.profile];
  const standing = Math.round(cap * st), business = Math.round(cap * bu);
  return { standing, seated: cap - standing - business, business };
}

/** üblicher Preis für diesen Verein (Nachfrage-Referenz) */
export const refPrices = (club: Club): StandValues => map((s) => ST.REF_PRICE[s] * ST.PROFILE_PRICE[club.profile]);
const roundPrice = (v: number) => Math.max(1, Math.round(v * 2) / 2);
export const defaultPrices = (club: Club): StandValues => map((s) => roundPrice(refPrices(club)[s]));
export const pricesOf = (club: Club): StandValues => club.stadium.prices ?? defaultPrices(club);

/** Durchschnittspreis über alle Plätze */
export function averagePrice(club: Club): number {
  const seats = seatsOf(club), p = pricesOf(club);
  return Math.round((STANDS.reduce((t, s) => t + seats[s] * p[s], 0) / Math.max(1, club.arena.capacity)) * 100) / 100;
}

export const cateringMode = (club: Club): 'own' | 'lease' => club.stadium.catering.mode ?? (club.profile === 'tradition' || club.profile === 'corporate' ? 'own' : 'lease');

/** Preise ändern; Erhöhungen verärgern die Fans, Senkungen freuen sie ein wenig */
export function changePrices(club: Club, next: StandValues): Club {
  const prev = pricesOf(club), seats = seatsOf(club);
  const w = (p: StandValues) => STANDS.reduce((t, s) => t + seats[s] * p[s], 0);
  const r = w(next) / Math.max(1, w(prev)) - 1;
  const fans = r > 0.02 ? -Math.min(8, r * 40) : r < -0.02 ? Math.min(3, -r * 12) : 0;
  const prices = map((s) => roundPrice(clamp(next[s], 1, 500)));
  const c = { ...club, stadium: { ...club.stadium, prices }, mood: { ...club.mood, fans: r1(clamp(club.mood.fans + fans, 0, 100)) } };
  return { ...c, finances: { ...c.finances, ticketPrice: averagePrice(c) } };
}

// ---------------------------------------------------------------- Nachfrage

export interface Factor { key: string; label: string; pct: number }

export interface GameForecast {
  fixtureId: string;
  derby: boolean;
  playoffs: boolean;
  top: boolean;
  /** Grundnachfrage aus der Fanbasis */
  base: number;
  factors: Factor[];
  seats: StandValues;
  /** tatsächliche Preise (inkl. Aufschläge und Aktion) */
  prices: StandValues;
  demand: StandValues;
  attendance: StandValues;
  away: number;
  free: number;
  turnedAway: number;
  total: number;
  fill: number;
  atmosphere: number;
  homeEdge: number;
  tickets: number;
  actionId: string | null;
}

function placeOf(world: World, clubId: string): number | null {
  const comp = world.competition;
  if (!comp || comp.day < 6 || comp.finalStandings) return null;
  const i = regularTable(world).findIndex((r) => r.clubId === clubId);
  return i >= 0 ? i + 1 : null;
}

/** Wie oft wurde die Aktion in den letzten 4 Heimspielen gemacht? */
export const actionWear = (club: Club, id: string) => Math.pow(ST.WEAR, club.stadium.games.slice(-4).filter((g) => g.actionId === id).length);

/** Spieltagsaktion für dieses Heimspiel (geplant oder vom Geschäftsführer vorgeschlagen) */
export function actionFor(world: World, club: Club, fixture: Fixture): ActionDef | null {
  const id = club.stadium.actions[fixture.id] ?? (club.stadium.autoActions && businessManager(world, club.id) ? suggestAction(world, club, fixture) : null);
  const def = id ? actionDef(id) : undefined;
  return def && !actionBlocked(world, club, fixture, def) ? def : null;
}

/** Grund, warum eine Aktion bei diesem Heimspiel nicht geht (null = möglich) */
export function actionBlocked(world: World, club: Club, fixture: Fixture, def: ActionDef): string | null {
  if (def.cooldown) {
    const recent = club.stadium.games.slice(-def.cooldown).some((g) => g.actionId === def.id);
    if (recent) return `erst nach ${def.cooldown} Heimspielen wieder möglich`;
  }
  return def.blocked?.({ world, club, fixture }) ?? null;
}

const isFirstHome = (world: World, club: Club, fixture: Fixture) =>
  fixture.stage === 'regular' && !world.competition!.fixtures.some((f) => f.home === club.id && f.stage === 'regular' && f.day < fixture.day);

/** Nachfrage, Zuschauer, Stimmung und Heimvorteil eines Heimspiels (deterministisch) */
export function homeGameForecast(world: World, fixture: Fixture, opts: { place?: number | null; action?: string | null } = {}): GameForecast {
  const comp = world.competition!;
  const home = world.clubs.find((c) => c.id === fixture.home)!;
  const away = world.clubs.find((c) => c.id === fixture.away)!;
  const n = world.clubs.filter((c) => c.leagueId === home.leagueId).length || 14;
  const place = opts.place !== undefined ? opts.place : placeOf(world, home.id);
  const oppPlace = placeOf(world, away.id);
  const factors: Factor[] = [];
  const add = (key: string, label: string, pct: number) => { if (Math.abs(pct) >= 0.005) factors.push({ key, label, pct }); };
  const playoffs = fixture.stage === 'playoffs';
  const derby = home.rivals.includes(away.id) || away.rivals.includes(home.id);
  const top = derby || playoffs || (oppPlace !== null && oppPlace <= 4);
  // Sport
  if (place) add('table', `Tabellenplatz ${place}`, ((n / 2 + 0.5 - place) / n) * 0.2);
  const form = lastResults(comp, home.id, 5);
  if (form.length >= 3) add('form', 'Form (letzte 5)', (form.filter((r) => r.code === 'S' || r.code === 'SnV').length / form.length - 0.5) * 0.12);
  add('opponent', `Gegner ${away.shortName}`, (away.fanBase / 100) * 0.08 - 0.04 + (oppPlace ? ((n / 2 + 0.5 - oppPlace) / n) * 0.08 : 0));
  if (derby) add('derby', 'Derby', 0.18);
  if (playoffs) {
    const ser = comp.series.find((s) => s.id === fixture.seriesId);
    add('stage', ser?.roundName ?? 'Playoffs', 0.15 + 0.06 * (ser?.roundNo ?? 1));
  } else if (fixture.stage !== 'regular') add('stage', fixture.stage === 'playdowns' ? 'Playdowns' : 'Pre-Playoffs', 0.1);
  // Termin
  const wd = new Date(`${fixture.date}T12:00:00Z`).getUTCDay();
  add('weekday', ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][wd], ST.WEEKDAY[wd]);
  const md = fixture.date.slice(5);
  if (isFirstHome(world, home, fixture)) add('season', 'Saisonauftakt', 0.1);
  else if (md >= '12-26' || md <= '01-06') add('season', 'Feiertage', 0.08);
  else if (md.startsWith('11')) add('season', 'November', -0.04);
  // Umfeld
  add('mood', 'Fanstimmung', ((home.mood.fans - 50) / 50) * 0.12);
  const roster = world.players.filter((p) => p.contract?.clubId === home.id);
  const star = roster.length ? Math.max(...roster.map((p) => toDisplay(overall(p)))) : 12;
  const homegrown = roster.filter((p) => p.youthClub === home.id).length;
  add('idols', 'Stars und Eigengewächse', clamp((star - 14) * 0.012, -0.03, 0.04) + Math.min(0.03, homegrown * 0.006));
  if (home.events.attendance) add('event', 'Vereinsleben (Events)', home.events.attendance.pct / 0.75);
  // Aktion
  const action = opts.action !== undefined ? (opts.action ? actionDef(opts.action) ?? null : null) : actionFor(world, home, fixture);
  const k = action ? actionWear(home, action.id) : 1;
  add('luck', 'Tagesform des Publikums', (hash01(`zuschauer:${fixture.id}:${world.season}`) - 0.5) * 0.08);

  const base = home.fanBase * ST.FANS_PER_POINT * (0.5 + 0.4 * (home.fanBase / 100));
  const mult = Math.max(0.3, 1 + factors.reduce((t, f) => t + f.pct, 0));
  const seats = seatsOf(home);
  const cap = home.arena.capacity;
  const list = pricesOf(home);
  const ref = refPrices(home);
  const sur = (1 + (playoffs ? home.stadium.playoffSurcharge : 0)) * (1 + (top ? home.stadium.topSurcharge : 0));
  const accept = (1 + (playoffs ? ST.ACCEPT_PLAYOFF : 0)) * (1 + (top ? ST.ACCEPT_TOP : 0));
  const prices = map((s) => list[s] * sur * (action?.priceFactor?.[s] ?? 1));
  const standMood = { standing: ((home.mood.fans - 50) / 50) * 0.05, seated: 0, business: ((home.mood.sponsors - 50) / 50) * 0.15 };
  const demand = map((s) => {
    const priceF = clamp(Math.pow((ref[s] * accept) / Math.max(0.5, prices[s]), ST.ELASTICITY[s]), 0.3, 1.8);
    const act = (action?.demand?.[s] ?? 0) * k * (action?.weekdayOnly && (wd === 0 || wd >= 5) ? 0.5 : 1);
    return base * mult * (seats[s] / cap) * (1 + standMood[s]) * priceF * (1 + act);
  });
  // Gästefans (Stehplatz), Derby und Playoffs bringen mehr mit
  const dist = 0.5 + hash01([home.id, away.id].sort().join(':')) * 1;
  const awayWant = away.fanBase * ST.AWAY_PER_POINT * dist * (derby ? 2.2 : 1) * (playoffs ? 1.6 : 1) * clamp(Math.pow(ref.standing / prices.standing, 0.5), 0.6, 1.3);
  const awayN = Math.round(Math.min(awayWant, seats.standing * ST.AWAY_BLOCK * (derby ? 1.5 : 1)));
  demand.standing += awayN;
  // Überhang Stehplatz weicht teilweise auf Sitzplätze aus
  const spill = Math.max(0, demand.standing - seats.standing) * ST.SPILL;
  demand.seated += spill;
  const attendance = map((s) => Math.round(Math.min(seats[s], demand[s])));
  const turnedAway = Math.round(Math.max(0, STANDS.reduce((t, s) => t + Math.max(0, demand[s] - attendance[s]), 0) - spill));
  // Freikarten füllen freie Plätze (ohne Eintritt)
  const freeBy = { standing: 0, seated: 0, business: 0 };
  if (action?.freeFill) {
    const want = Math.round(cap * action.freeFill * k);
    freeBy.standing = Math.min(seats.standing - attendance.standing, Math.round(want * 0.6));
    freeBy.seated = Math.min(seats.seated - attendance.seated, want - freeBy.standing);
    attendance.standing += freeBy.standing; attendance.seated += freeBy.seated;
  }
  const free = freeBy.standing + freeBy.seated;
  const total = sumOf(attendance);
  const fill = total / cap;
  // Stimmung in der Halle: Menge, Stehplatzanteil, Fanstimmung, Derby, Playoffs, Gästeblock, Aktion
  const ser = playoffs ? comp.series.find((s) => s.id === fixture.seriesId) : undefined;
  const atmosphere = clamp(
    5 + 35 * fill + Math.min(25, (attendance.standing / Math.max(1, total) / 0.6) * 20) + (home.mood.fans - 50) * 0.35
      + (derby ? 10 : 0) + (playoffs ? 6 + 2 * (ser?.roundNo ?? 1) : 0) + Math.min(5, (awayN / Math.max(1, total)) * 60) + (action?.atmosphere ?? 0) * k,
    0, 100,
  );
  const homeEdge = homeEdgeOf(Math.min(1, fill), atmosphere);
  const tickets = STANDS.reduce((t, s) => t + (attendance[s] - freeBy[s]) * prices[s], 0);
  return {
    fixtureId: fixture.id, derby, playoffs, top, base, factors, seats, prices, demand, attendance, away: awayN, free, turnedAway, total, fill,
    atmosphere: r1(atmosphere), homeEdge, tickets: Math.round(tickets), actionId: action?.id ?? null,
  };
}

/** Heimvorteil der Engine aus Auslastung (Menge) und Stimmung (Art) */
export const homeEdgeOf = (fill: number, atmosphere: number) =>
  Math.round((C.HOME_BASE + C.HOME_CROWD * clamp(fill, 0, 1) + C.HOME_ATMOS * clamp(atmosphere / 100, 0, 1)) * 10000) / 10000;

export const ATMOSPHERE_LABEL = (v: number) => (v >= 80 ? 'Hexenkessel' : v >= 65 ? 'laut' : v >= 50 ? 'ordentlich' : v >= 35 ? 'verhalten' : 'leise');

// ---------------------------------------------------------------- Catering

/** Catering eines Heimspiels: Einnahme und Kosten je nach Betriebsmodell */
export function cateringOf(world: World, club: Club, fc: GameForecast, won: boolean | null, action: ActionDef | null): { income: number; costs: number; revenue: number; incident: number } {
  const cat = club.stadium.catering;
  const lv = ST.LEVEL[cat.level], pr = ST.PRICING[cat.pricing];
  const wait = fc.fill > 0.9 ? 1 - (fc.fill - 0.9) * 1.5 * (cat.level === 'premium' ? 0.5 : 1) : 1;
  const mood = (won ? 1.06 : 1) * (fc.derby ? 1.08 : 1) * (fc.playoffs ? 1.08 : 1) * (action?.spend ?? 1);
  const biz = 0.85 + club.mood.sponsors / 333;
  const revenue = STANDS.reduce((t, s) => t + fc.attendance[s] * ST.SPEND[s] * lv.spend * pr.spend * wait * mood * (s === 'business' ? biz : 1), 0);
  const cap = club.arena.capacity;
  if (cateringMode(club) === 'lease') return { income: Math.round(cap * ST.LEASE_PER_SEAT * lv.lease + revenue * ST.LEASE_SHARE), costs: 0, revenue: Math.round(revenue), incident: 0 };
  const gm = businessManager(world, club.id);
  const eff = gm ? 1 - (gm.skill - 10) * 0.006 : 1.03;
  const incident = hash01(`catering:${fc.fixtureId}:${world.season}`) < ST.INCIDENT ? Math.round(3000 + hash01(`catering-hoehe:${fc.fixtureId}`) * 6000) : 0;
  return { income: Math.round(revenue), costs: Math.round(revenue * lv.cost * eff + cap * ST.STAFF_PER_SEAT * lv.staff + incident), revenue: Math.round(revenue), incident };
}

/** Fanshop eines Monats: Umsatz und Kosten */
export function shopMonth(world: World, club: Club, month: string): { revenue: number; costs: number } {
  const sh = ST.SHOP[club.stadium.shop];
  const comp = world.competition;
  const n = world.clubs.filter((c) => c.leagueId === club.leagueId).length || 14;
  const place = comp ? placeOf(world, club.id) : null;
  const success = 1 + (place ? ((n / 2 + 0.5 - place) / n) * 0.3 : 0) + ((club.mood.fans - 50) / 50) * 0.15;
  const inPlayoffs = !!comp?.series.some((s) => s.stage === 'playoffs' && !s.winner && (s.high === club.id || s.low === club.id));
  const season = (ST.SHOP_MONTH[month.slice(5)] ?? 1) * (inPlayoffs ? 1.25 : 1);
  const gm = businessManager(world, club.id);
  const revenue = club.fanBase * ST.SHOP_PER_POINT * sh.rev * success * season * (gm ? 1 + (gm.skill - 10) * 0.01 : 1);
  return { revenue: Math.round(revenue), costs: Math.round(revenue * ST.SHOP_COST + sh.fixed) };
}

// ---------------------------------------------------------------- Abrechnung eines Heimspiels

/** Heimspiel auswerten: Bericht, Stimmung, Spieltagsaktion (Wirkungen, Log, Sponsorentermin). Buchung macht `bookFixture`. */
export function settleHomeGame(world: World, fixture: Fixture, fc: GameForecast): { world: World; report: HomeGameReport; catering: ReturnType<typeof cateringOf>; actionCost: number } {
  const club = world.clubs.find((c) => c.id === fixture.home)!;
  const res = fixture.result;
  const won = res ? res.score[0] > res.score[1] : null;
  const action = fc.actionId ? actionDef(fc.actionId) ?? null : null;
  const cat = cateringOf(world, club, fc, won, action);
  const actionCost = action?.cost ?? 0;
  const report: HomeGameReport = {
    fixtureId: fixture.id, date: fixture.date, opponent: fixture.away, playoffs: fc.playoffs, derby: fc.derby,
    attendance: fc.attendance, demand: map((s) => Math.round(fc.demand[s])), away: fc.away, turnedAway: fc.turnedAway, free: fc.free,
    atmosphere: fc.atmosphere, homeEdge: fc.homeEdge, tickets: fc.tickets, catering: cat.income, costs: cat.costs + actionCost, actionId: fc.actionId,
  };
  // Stimmung: Preisniveau beim Catering, überteuerte Tickets, volle Halle
  const priceRatio = fc.tickets / Math.max(1, STANDS.reduce((t, s) => t + fc.attendance[s] * refPrices(club)[s], 0));
  const moodD = ST.PRICING[club.stadium.catering.pricing].mood + (priceRatio > 1.2 ? -0.3 : 0) + (fc.fill > 0.97 ? 0.2 : 0);
  let w: World = {
    ...world,
    clubs: world.clubs.map((c) => {
      if (c.id !== club.id) return c;
      const actions = { ...c.stadium.actions };
      delete actions[fixture.id];
      return { ...c, mood: { ...c.mood, fans: r1(clamp(c.mood.fans + moodD, 0, 100)) }, stadium: { ...c.stadium, actions, games: [...c.stadium.games, report] } };
    }),
  };
  if (cat.incident && club.controller.type === 'human') {
    w = { ...w, market: { ...w.market, news: [{ date: fixture.date, kind: 'info' as const, text: `Catering: Störung beim Heimspiel (Kühlung/Kassen) – ${Math.round(cat.incident / 1000)} T€ Zusatzkosten im Eigenbetrieb.`, mine: true }, ...w.market.news].slice(0, 120) } };
  }
  if (action) {
    const k = Math.pow(ST.WEAR, club.stadium.games.slice(-4).filter((g) => g.actionId === action.id).length);
    const ctx = eventCtx(w, club.id, fixture.date);
    const out = action.after({ ...ctx, report, k, won });
    w = applyEffects(w, club.id, out.effects, ctx);
    if (club.controller.type === 'human') w = logEvent(w, club.id, { date: fixture.date, defId: action.id, title: `Spieltagsaktion: ${action.label}`, text: out.text, tone: out.tone }, action.id);
    if (action.sponsorTermin) w = creditSponsorTermin(w, club.id);
  }
  return { world: w, report, catering: cat, actionCost };
}

// ---------------------------------------------------------------- Planung, Geschäftsführer, KI

/** Erwartung je Heimspiel ohne Sondereinflüsse (Saisonplanung, Liquiditätsprognose) */
export function expectedHomeGame(world: World, club: Club): { fans: number; tickets: number; catering: number } {
  const seats = seatsOf(club), p = pricesOf(club), ref = refPrices(club);
  const base = club.fanBase * ST.FANS_PER_POINT * (0.5 + 0.4 * (club.fanBase / 100)) * ST.PLAN_UPLIFT;
  const att = map((s) => Math.min(seats[s], base * (seats[s] / club.arena.capacity) * clamp(Math.pow(ref[s] / p[s], ST.ELASTICITY[s]), 0.3, 1.8)));
  const total = sumOf(att);
  const tickets = STANDS.reduce((t, s) => t + att[s] * p[s], 0);
  const fc = { fixtureId: 'plan', derby: false, playoffs: false, attendance: att, fill: total / club.arena.capacity } as GameForecast;
  const cat = cateringOf(world, club, fc, null, null);
  // Störfälle mit ihrem Erwartungswert statt des Zufallswurfs
  const incident = cateringMode(club) === 'own' ? ST.INCIDENT * 6000 : 0;
  return { fans: total, tickets, catering: cat.income - (cat.costs - cat.incident) - incident };
}

/** Erwarteter Fanshop-Gewinn einer Saison */
export const expectedShopSeason = (club: Club) => {
  const sh = ST.SHOP[club.stadium.shop];
  const rev = club.fanBase * ST.SHOP_PER_POINT * sh.rev * Object.values(ST.SHOP_MONTH).reduce((a, b) => a + b, 0);
  return rev * (1 - ST.SHOP_COST) - sh.fixed * 12;
};

/** Zielpreise nach Leitlinie, angepasst an die letzten Heimspiele (ausverkauft → teurer, leer → günstiger) */
export function strategyPrices(club: Club, strategy: ClubStadium['strategy']): StandValues {
  const ref = refPrices(club), cur = pricesOf(club), seats = seatsOf(club);
  const recent = club.stadium.games.filter((g) => !g.playoffs).slice(-3);
  return map((s) => {
    let target = ref[s] * ST.STRATEGY[strategy].price;
    if (recent.length) {
      const fill = recent.reduce((t, g) => t + g.attendance[s] / Math.max(1, seats[s]), 0) / recent.length;
      const want = recent.reduce((t, g) => t + g.demand[s] / Math.max(1, seats[s]), 0) / recent.length;
      if (want > 1.08) target = Math.max(target, cur[s] * 1.05);
      else if (fill < 0.6) target = Math.min(target, cur[s] * 0.96);
    }
    return roundPrice(clamp(target, ref[s] * 0.75, ref[s] * 1.4));
  });
}

/** Monatlich: KI-Vereine und delegierende Manager passen Preise an (optional nur ein Verein) */
export function stadiumMonth(world: World, onlyClubId?: string): World {
  return {
    ...world,
    clubs: world.clubs.map((c) => {
      if (onlyClubId && c.id !== onlyClubId) return c;
      const human = c.controller.type === 'human';
      if (human && !(c.stadium.delegate && businessManager(world, c.id))) return c;
      const strategy = human ? c.stadium.strategy : ST.AI_STRATEGY[c.profile];
      const next = strategyPrices(c, strategy);
      const cur = pricesOf(c);
      return STANDS.some((s) => next[s] !== cur[s]) ? changePrices(c, next) : c;
    }),
  };
}

/** Vorschlag des Geschäftsführers für ein Heimspiel */
export function suggestAction(world: World, club: Club, fixture: Fixture): string | null {
  const ok = (id: string) => { const d = actionDef(id); return d && !actionBlocked(world, club, fixture, d) && actionWear(club, id) === 1 ? id : null; };
  const fc = homeGameForecast(world, fixture, { action: null });
  const openTermine = club.sponsors.deals.filter((d) => d.untilSeason >= world.season).reduce((t, d) => t + Math.max(0, d.termine - d.termineDone), 0);
  if (isFirstHome(world, club, fixture)) return ok('lichtshow');
  if (fc.derby) return ok('fantag') ?? ok('lichtshow');
  if (openTermine > 0 && fc.attendance.business < fc.seats.business * 0.97) return ok('sponsorenabend');
  if (fc.fill < 0.62) return ok('familientag') ?? ok('freikarten');
  if (club.stadium.games.length % 6 === 5) return ok('kindertag');
  return null;
}

/** Saisonbeginn: Spielberichte leeren, Wechsel des Catering-Modells umsetzen, Durchschnittspreis setzen */
export function beginSeasonStadium(club: Club): Club {
  const cat = club.stadium.catering;
  const c = { ...club, stadium: { ...club.stadium, games: [], actions: {}, catering: cat.nextMode ? { ...cat, mode: cat.nextMode, nextMode: null } : cat } };
  return { ...c, finances: { ...c.finances, ticketPrice: averagePrice(c) } };
}

/** Darf das Catering-Modell sofort gewechselt werden? (vor dem ersten Heimspiel der Saison oder in der Sommerpause) */
export const cateringSwitchNow = (world: World, club: Club) => !!world.offseason || club.stadium.games.length === 0;

/** Betriebsmodell wählen (sofort oder zur nächsten Saison) */
export function setCateringMode(world: World, clubId: string, mode: 'own' | 'lease'): World {
  return {
    ...world,
    clubs: world.clubs.map((c) => {
      if (c.id !== clubId) return c;
      const cat = c.stadium.catering;
      const now = cateringSwitchNow(world, c);
      return { ...c, stadium: { ...c.stadium, catering: now ? { ...cat, mode, nextMode: null } : { ...cat, nextMode: mode === cateringMode(c) ? null : mode } } };
    }),
  };
}

/** Saisonwechsel: Fanbasis wächst mit vollen Hallen, Erfolg, guter Stimmung und Familienaktionen (höchstens ±3) */
export function fanBaseChange(world: World, club: Club): { delta: number; reasons: string[] } {
  const games = club.stadium.games.filter((g) => !g.playoffs);
  const reasons: string[] = [];
  if (!games.length) return { delta: 0, reasons };
  const fill = games.reduce((t, g) => t + (g.attendance.standing + g.attendance.seated + g.attendance.business) / club.arena.capacity, 0) / games.length;
  const want = games.reduce((t, g) => t + (g.demand.standing + g.demand.seated + g.demand.business) / club.arena.capacity, 0) / games.length;
  const comp = world.competition;
  const n = world.clubs.filter((c) => c.leagueId === club.leagueId).length || 14;
  const place = comp?.finalStandings ? comp.finalStandings.indexOf(club.id) + 1 : null;
  const parts: [string, number][] = [
    ['Zuschauerzuspruch', clamp((Math.min(1.1, want) - 0.8) * 5, -1.2, 1.2)],
    ['sportliches Abschneiden', place ? ((n / 2 + 0.5 - place) / n) * 2 : 0],
    ['Fanstimmung', ((club.mood.fans - 50) / 50) * 1.2],
    ['Familien- und Nachwuchsaktionen', Math.min(1.5, games.filter((g) => g.actionId && ACTIONS.find((a) => a.id === g.actionId)?.family).length * 0.25)],
    ['Erlebnis in der Halle', ((games.reduce((t, g) => t + g.atmosphere, 0) / games.length - 55) / 45) * 0.6],
    ['überfüllte Halle', fill > 0.97 && want > 1.15 ? -0.3 : 0],
  ];
  // leichte Rückkehr zur Mitte, damit die Liga stabil bleibt
  const drift = (50 - club.fanBase) * 0.04;
  let delta = parts.reduce((t, [, v]) => t + v, 0) + drift;
  delta = r1(clamp(delta, -ST.FANBASE_MAX, ST.FANBASE_MAX));
  for (const [label, v] of parts) if (Math.abs(v) >= 0.3) reasons.push(`${label} ${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}`);
  return { delta, reasons };
}

/** Alte Spielstände und neue Welten: Platzaufteilung, Durchschnittspreis, Rivalen */
export function ensureStadium(world: World): World {
  const needRivals = world.clubs.some((c) => !c.rivals.length);
  let clubs = world.clubs.map((c) => {
    const x = c.arena.seats && sumOf(c.arena.seats) === c.arena.capacity ? c : { ...c, arena: { ...c.arena, seats: seatsOf(c) } };
    return { ...x, finances: { ...x.finances, ticketPrice: averagePrice(x) } };
  });
  if (needRivals) {
    // Je Liga feste Derby-Paare (deterministisch aus dem Startwert)
    const leagues = [...new Set(clubs.map((c) => c.leagueId))];
    const rivals = new Map<string, string[]>();
    for (const l of leagues) {
      const ids = clubs.filter((c) => c.leagueId === l && !c.rivals.length).map((c) => c.id).sort((a, b) => hash01(`${world.seed}:derby:${a}`) - hash01(`${world.seed}:derby:${b}`));
      for (let i = 0; i + 1 < ids.length; i += 2) { rivals.set(ids[i], [ids[i + 1]]); rivals.set(ids[i + 1], [ids[i]]); }
    }
    clubs = clubs.map((c) => (c.rivals.length || !rivals.has(c.id) ? c : { ...c, rivals: rivals.get(c.id)! }));
  }
  return { ...world, clubs };
}

export { ACTIONS, actionDef };
export type { ActionDef };
