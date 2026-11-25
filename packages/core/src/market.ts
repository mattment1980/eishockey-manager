import type {
  World, Player, Club, Offer, Terms, Perks, Contract, PromiseType, News, Market, Position,
} from '@ehm/schema';
import { makeContract, NO_PERKS } from '@ehm/schema';
import { overall, ageOn, toDisplay } from './ratings.ts';
import { addDays, daysBetween, formatDate, hash01, monthKey } from './calendar.ts';
import { teamStrength, autoMatchplan } from './lineup.ts';

/**
 * Spielermarkt: kaum Ablösen, Wechsel nach Vertragsende.
 * Ab November wird um Spieler mit auslaufendem Vertrag geboten (Vorverträge für die nächste Saison),
 * vereinslose Spieler sind jederzeit verfügbar (bis zur Wechselfrist sofort, danach für die nächste Saison).
 */

// ---------------------------------------------------------------- Kosten & Bezeichnungen

export const PERK_COST: Record<keyof Perks, number[]> = {
  housing: [0, 9_000, 15_000, 24_000],
  car: [0, 4_000, 7_000, 12_000],
  flights: [0, 2_500, 5_000, 7_500],
  family: [0, 5_000, 10_000],
  extras: [0, 3_000, 6_000],
};
export const PERK_LABEL: Record<keyof Perks, { title: string; levels: string[] }> = {
  housing: { title: 'Wohnen', levels: ['keine', 'Wohnung', 'große Wohnung', 'Haus'] },
  car: { title: 'Auto', levels: ['keins', 'Kleinwagen', 'Mittelklasse', 'Oberklasse'] },
  flights: { title: 'Heimflüge', levels: ['keine', '1 pro Jahr', '2 pro Jahr', '3 pro Jahr'] },
  family: { title: 'Familie', levels: ['nichts', 'Schule/Kita', '+ Job Partner'] },
  extras: { title: 'Sonstiges', levels: ['nichts', 'Ausbildung', '+ Personal Trainer'] },
};
export const ROLE_LABEL = { star: 'Star', top: 'Topspieler', regular: 'Stammspieler', depth: 'Ergänzung', prospect: 'Perspektive' } as const;
const ROLE_ORDER = ['prospect', 'depth', 'regular', 'top', 'star'] as const;
const roleIdx = (r: Contract['role']) => ROLE_ORDER.indexOf(r);

export const PROMISE_LABEL: Record<PromiseType, string> = {
  top6F: 'Platz in den ersten beiden Sturmreihen',
  top4D: 'Platz in den ersten beiden Verteidigerpaaren',
  pp1: 'Platz in der ersten Überzahl',
  starter: 'Stammtorhüter',
  playoffs: 'Wir erreichen die Playoffs',
};

export function perkCost(perks: Perks): number {
  return (Object.keys(PERK_COST) as (keyof Perks)[]).reduce((s, k) => s + PERK_COST[k][perks[k]], 0);
}

/** Jährliche Kosten eines Vertrags ohne Prämien */
export function contractCost(c: Pick<Contract, 'salary' | 'perks'>): number {
  return c.salary + perkCost(c.perks);
}

const isImport = (p: Player) => !p.nationalities.includes('DE');
const group = (pos: Position) => (pos === 'G' ? 'G' : pos === 'LD' || pos === 'RD' ? 'D' : 'F');

// ---------------------------------------------------------------- Bewertung des Spielers

/** Gehaltsvorstellung (Jahresgehalt) */
export function expectedSalary(world: World, p: Player): number {
  const q = overall(p);
  const age = ageOn(p.birthDate, world.date);
  let s = isImport(p) ? 62_000 + (q - 95) * 2_700 : 30_000 + (q - 75) * 2_000;
  if (age < 24) s += Math.max(0, p.hidden.potential - q) * 350;
  s *= age < 21 ? 0.75 : age < 24 ? 0.9 : age >= 35 ? 0.75 : age >= 33 ? 0.9 : 1;
  return Math.round(Math.max(18_000, Math.min(260_000, s)) / 500) * 500;
}

/** Rolle, die der Spieler aufgrund seiner Stärke erwartet (Vergleich mit der Liga) */
const peerCache = new WeakMap<Player[], Record<string, number[]>>();
function peersOf(world: World, g: string): number[] {
  let c = peerCache.get(world.players);
  if (!c) {
    c = { F: [], D: [], G: [] };
    for (const x of world.players) if (x.contract) c[group(x.position)].push(overall(x));
    for (const k of Object.keys(c)) c[k].sort((a, b) => b - a);
    peerCache.set(world.players, c);
  }
  return c[g];
}

export function expectedRole(world: World, p: Player): Contract['role'] {
  const g = group(p.position);
  const peers = peersOf(world, g);
  const q = overall(p);
  const pct = peers.filter((v) => v > q).length / Math.max(1, peers.length);
  const age = ageOn(p.birthDate, world.date);
  if (age <= 20 && pct > 0.5) return 'prospect';
  return pct < 0.12 ? 'star' : pct < 0.38 ? 'top' : pct < 0.75 ? 'regular' : 'depth';
}

export interface Preferences { money: number; role: number; sport: number; security: number; family: boolean }

export function preferences(world: World, p: Player): Preferences {
  const age = ageOn(p.birthDate, world.date);
  const pr: Preferences = { money: 1, role: 0.6, sport: 0.5, security: 0.3, family: age >= 27 && hash01(`familie:${p.id}`) < 0.6 };
  if (age >= 30) { pr.security += 0.4; pr.money += 0.2; }
  if (age <= 23) { pr.role += 0.5; pr.sport += 0.2; pr.money -= 0.2; }
  for (const t of p.traits) {
    if (t.id === 'diva') pr.role += 0.6;
    if (t.id === 'teamplayer') pr.role -= 0.3;
    if (t.id === 'egoist') pr.money += 0.3;
    if (t.id === 'bigGame') pr.sport += 0.3;
  }
  return pr;
}

/** Wie viel ist dem Spieler ein Perk-Paket wert (in Euro)? */
export function perceivedPerks(world: World, p: Player, perks: Perks): number {
  const imp = isImport(p);
  const fam = preferences(world, p).family;
  let v = 0;
  for (const k of Object.keys(PERK_COST) as (keyof Perks)[]) {
    let m = 1;
    if ((k === 'housing' || k === 'flights') && imp) m *= 1.6;
    if ((k === 'housing' || k === 'family') && fam) m *= 1.5;
    if (k === 'family' && !fam) m = 0.3;
    if (k === 'flights' && !imp) m = 0.4;
    if (k === 'car') m *= 1.1;
    v += PERK_COST[k][perks[k]] * m;
  }
  return v;
}

const rankCache = new WeakMap<Club[], string[]>();
function strengthRanking(world: World): string[] {
  let r = rankCache.get(world.clubs);
  if (!r) {
    const byId = new Map(world.players.map((x) => [x.id, x]));
    r = [...world.clubs].sort((a, b) => teamStrength(b.matchplan!, byId) - teamStrength(a.matchplan!, byId)).map((c) => c.id);
    rankCache.set(world.clubs, r);
  }
  return r;
}

function clubSportScore(world: World, clubId: string): number {
  const ranked = strengthRanking(world);
  const rank = ranked.indexOf(clubId);
  return (ranked.length - 1 - rank) / Math.max(1, ranked.length - 1) - 0.5;
}

/** Rolle, die der Spieler im Verein tatsächlich bekäme (Rang in seiner Positionsgruppe) */
function actualRoleIn(world: World, p: Player, clubId: string, forSeason: number): Contract['role'] {
  const g = group(p.position);
  const mates = world.players.filter((x) => x.id !== p.id && group(x.position) === g && ((x.contract?.clubId === clubId && (forSeason === world.season || x.contract.untilSeason >= forSeason)) || x.nextContract?.clubId === clubId));
  const better = mates.filter((x) => overall(x) > overall(p)).length;
  const slots = g === 'F' ? [2, 6, 9, 12] : g === 'D' ? [1, 3, 5, 6] : [0, 1, 1, 2];
  return better < slots[0] ? 'star' : better < slots[1] ? 'top' : better < slots[2] ? 'regular' : 'depth';
}

export function credibilityOf(world: World, clubId: string): number {
  return world.market.credibility[clubId] ?? 0.8;
}

/** Nutzenwert eines Angebots aus Sicht des Spielers (0 ≈ fair, > 0 attraktiv). */
export function offerUtility(world: World, p: Player, clubId: string, terms: Terms, forSeason: number): number {
  const pr = preferences(world, p);
  const exp = expectedSalary(world, p);
  const age = ageOn(p.birthDate, world.date);
  const expPoints = p.position === 'G' ? 0 : Math.max(0, (toDisplay(overall(p)) - 6) * 4);
  const bonusValue = terms.bonus.perPoint * expPoints * 0.7 + terms.bonus.playoffs * 0.4;
  const money = (terms.salary + perceivedPerks(world, p, terms.perks) + bonusValue) / exp - 1;

  const cred = credibilityOf(world, clubId);
  const expected = roleIdx(expectedRole(world, p));
  const actual = roleIdx(actualRoleIn(world, p, clubId, forSeason));
  const promised = roleIdx(terms.role);
  const role = 0.15 * ((promised - expected) * cred * 0.5 + (actual - expected) * 0.5);

  const sport = clubSportScore(world, clubId);
  const wantYears = age >= 30 ? 3 : age <= 23 ? 2 : 2;
  const security = -0.12 * Math.abs(terms.years - wantYears) + (age >= 32 && terms.years >= 2 ? 0.1 : 0);

  let clauses = 0;
  if (terms.clauses.exit) clauses += toDisplay(overall(p)) >= 12 ? 0.1 : 0.04;
  if (terms.clauses.relegation) clauses -= 0.04;

  const g = group(p.position);
  let promises = 0;
  for (const pt of terms.promises) {
    const relevant = (pt === 'top6F' && g === 'F') || (pt === 'top4D' && g === 'D') || (pt === 'starter' && g === 'G') || (pt === 'pp1' && g !== 'G') || pt === 'playoffs';
    if (relevant) promises += (pt === 'playoffs' ? 0.04 + 0.06 * pr.sport : 0.07) * cred;
  }

  const club = world.clubs.find((c) => c.id === clubId)!;
  const attract = ((club.fanBase - 50) / 100) * 0.2;
  const loyalty = p.contract?.clubId === clubId
    ? 0.12 + (p.condition.morale - 55) / 250 - p.contract.promises.filter((x) => x.status === 'broken').length * 0.1
    : 0;
  const noise = (hash01(`passt:${p.id}:${clubId}`) - 0.5) * 0.2;
  return pr.money * money + pr.role * role + pr.sport * sport * 0.5 + pr.security * security + clauses + promises + attract + loyalty + noise;
}

/** Mindestnutzen, ab dem der Spieler unterschreibt – sinkt, wenn die Frist verstrichen ist. */
function reservation(world: World, p: Player): number {
  const by = world.market.decideBy[p.id];
  if (!by) return 0;
  const overdue = Math.max(0, daysBetween(by, world.date));
  return -0.06 * (overdue / 7);
}

// ---------------------------------------------------------------- Verfügbarkeit

export type Availability =
  | { ok: true; forSeason: number; immediate: boolean }
  | { ok: false; reason: string };

export function availability(world: World, p: Player, clubId: string): Availability {
  const season = world.season;
  const comp = world.competition;
  if (p.nextContract) return { ok: false, reason: `hat bereits für ${p.nextContract.fromSeason ?? season + 1}/${String((p.nextContract.fromSeason ?? season + 1) + 1).slice(2)} unterschrieben` };
  if (world.market.blocked.includes(`${p.id}:${clubId}`)) return { ok: false, reason: 'hat die Gespräche mit euch abgebrochen' };
  if (!p.contract) {
    const immediate = !!comp && !comp.finished && world.date <= comp.transferDeadline;
    return { ok: true, forSeason: immediate ? season : season + 1, immediate };
  }
  if (p.contract.untilSeason > season) return { ok: false, reason: `unter Vertrag bis ${p.contract.untilSeason + 1}` };
  if (world.date < `${season}-11-01` && p.contract.clubId !== clubId) return { ok: false, reason: 'Verhandlungen für die nächste Saison ab 1. November' };
  return { ok: true, forSeason: season + 1, immediate: false };
}

/** Spieler, um die gerade geboten werden kann (aus Sicht eines Vereins) */
export function marketPlayers(world: World, clubId: string): Player[] {
  return world.players.filter((p) => p.contract?.clubId !== clubId || p.contract.untilSeason <= world.season)
    .filter((p) => availability(world, p, clubId).ok);
}

// ---------------------------------------------------------------- Angebote

export interface OfferResponse {
  kind: 'accepted' | 'interested' | 'lowball' | 'insulted' | 'blocked' | 'invalid';
  text: string;
  demand?: number;
}

function news(m: Market, n: News): Market {
  return { ...m, news: [n, ...m.news].slice(0, 120) };
}

function rosterCount(world: World, clubId: string, forSeason: number, pred: (p: Player) => boolean = () => true): number {
  return world.players.filter((p) => pred(p) && (
    forSeason === world.season
      ? p.contract?.clubId === clubId
      : (p.contract?.clubId === clubId && p.contract.untilSeason >= forSeason) || p.nextContract?.clubId === clubId
  )).length;
}

function checkLimits(world: World, p: Player, clubId: string, forSeason: number): string | null {
  const rules = world.countries[0].rules;
  const alreadyMine = forSeason === world.season ? p.contract?.clubId === clubId : false;
  if (!alreadyMine && rosterCount(world, clubId, forSeason) >= rules.maxRoster) return 'Kader voll';
  if (isImport(p) && !alreadyMine && !(p.contract?.clubId === clubId) && rosterCount(world, clubId, forSeason, isImport) >= rules.importSlotsRoster) return 'keine Ausländerlizenz frei';
  return null;
}

/** Angebot abgeben (oder ersetzen) und sofortige Reaktion des Spielers erhalten. */
export function submitOffer(world: World, playerId: string, clubId: string, terms: Terms): { world: World; response: OfferResponse } {
  const p = world.players.find((x) => x.id === playerId)!;
  const av = availability(world, p, clubId);
  if (!av.ok) return { world, response: { kind: 'blocked', text: `${p.lastName} ${av.reason}.` } };
  const limit = checkLimits(world, p, clubId, av.forSeason);
  if (limit) return { world, response: { kind: 'invalid', text: `Nicht möglich: ${limit}.` } };

  const key = `${p.id}:${clubId}`;
  let market: Market = structuredClone(world.market);
  const u = offerUtility(world, p, clubId, terms, av.forSeason);
  const patience = market.patience[key] ?? 3;
  if (!market.decideBy[p.id]) market.decideBy[p.id] = decisionDateFor(world, p);

  const pr = preferences(world, p);
  const exp = expectedSalary(world, p);
  const demand = Math.round((terms.salary + ((0.05 - u) / Math.max(0.3, pr.money)) * exp) / 500) * 500;

  if (u < -0.35 || u < -0.1) {
    const insult = u < -0.35;
    const left = patience - (insult ? 2 : 1);
    market.patience[key] = left;
    if (left <= 0) {
      market.blocked.push(key);
      market.offers = market.offers.map((o) => (o.playerId === p.id && o.clubId === clubId && o.status === 'open' ? { ...o, status: 'withdrawn' } : o));
      return { world: { ...world, market }, response: { kind: 'blocked', text: `${p.lastName} bricht die Gespräche ab – eure Angebote lagen zu weit unter seinen Vorstellungen.` } };
    }
    return {
      world: { ...world, market },
      response: {
        kind: insult ? 'insulted' : 'lowball',
        demand,
        text: insult
          ? `${p.lastName} fühlt sich nicht ernst genommen. Sein Berater nennt ca. ${fmtEuro(demand)} als Gehalt (bei sonst gleichen Bedingungen).`
          : `${p.lastName} ist interessiert, aber das reicht ihm nicht. Sein Berater fordert ca. ${fmtEuro(demand)}.`,
      },
    };
  }

  market.offers = market.offers.map((o) => (o.playerId === p.id && o.clubId === clubId && o.status === 'open' ? { ...o, status: 'withdrawn' } : o));
  const prev = world.market.offers.filter((o) => o.playerId === p.id && o.clubId === clubId).length;
  const offer: Offer = { id: `o${world.market.offers.length + 1}-${p.id}-${clubId}`, playerId: p.id, clubId, terms, forSeason: av.forSeason, date: world.date, status: 'open', raises: prev };
  market.offers.push(offer);
  let w: World = { ...world, market };

  // Vereinslose entscheiden bei klar gutem Angebot sofort
  if (av.immediate && u >= 0.15 && u >= bestOtherUtility(w, p, clubId) + 0.1) {
    w = sign(w, offer);
    return { world: w, response: { kind: 'accepted', text: `${p.firstName} ${p.lastName} sagt zu und unterschreibt sofort!` } };
  }
  const t = tendency(w, p, clubId);
  return {
    world: w,
    response: { kind: 'interested', text: `${p.lastName} prüft das Angebot und will sich bis ${formatDate(market.decideBy[p.id])} entscheiden. ${t.text}` },
  };
}

function fmtEuro(v: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

function bestOtherUtility(world: World, p: Player, exceptClub: string): number {
  const others = world.market.offers.filter((o) => o.playerId === p.id && o.status === 'open' && o.clubId !== exceptClub);
  return others.length ? Math.max(...others.map((o) => offerUtility(world, p, o.clubId, o.terms, o.forSeason))) : -Infinity;
}

export function withdrawOffer(world: World, playerId: string, clubId: string): World {
  const market = { ...world.market, offers: world.market.offers.map((o) => (o.playerId === playerId && o.clubId === clubId && o.status === 'open' ? { ...o, status: 'withdrawn' as const } : o)) };
  return { ...world, market };
}

/** Marktlage zu einem Spieler aus Sicht eines Vereins */
export interface MarketInfo {
  interested: number;
  topClub: boolean;
  myOffer: Offer | null;
  decideBy: string | null;
  tendency: Tendency;
}
export interface Tendency { code: 'none' | 'leading' | 'close' | 'behind'; text: string }

export function tendency(world: World, p: Player, clubId: string): Tendency {
  const mine = world.market.offers.find((o) => o.playerId === p.id && o.clubId === clubId && o.status === 'open');
  if (!mine) return { code: 'none', text: '' };
  const u = offerUtility(world, p, clubId, mine.terms, mine.forSeason);
  const other = bestOtherUtility(world, p, clubId);
  if (other === -Infinity) return { code: 'leading', text: 'Bisher liegt nur euer Angebot vor.' };
  if (u >= other + 0.08) return { code: 'leading', text: 'Euer Angebot liegt vorne.' };
  if (u >= other - 0.08) return { code: 'close', text: 'Es ist eng – ein anderer Verein ist dicht dran.' };
  return { code: 'behind', text: 'Ein anderer Verein liegt vorne. Nachbessern?' };
}

export function marketInfo(world: World, p: Player, clubId: string): MarketInfo {
  const open = world.market.offers.filter((o) => o.playerId === p.id && o.status === 'open');
  const strong = strengthRanking(world).slice(0, 4);
  return {
    interested: new Set(open.map((o) => o.clubId)).size,
    topClub: open.some((o) => o.clubId !== clubId && strong.includes(o.clubId)),
    myOffer: open.find((o) => o.clubId === clubId) ?? null,
    decideBy: world.market.decideBy[p.id] ?? null,
    tendency: tendency(world, p, clubId),
  };
}

function decisionDateFor(world: World, p: Player): string {
  const h = hash01(`frist:${p.id}:${world.season}`);
  if (!p.contract) return addDays(world.date, 7 + Math.round(h * 14));
  const strength = toDisplay(overall(p));
  // Topspieler entscheiden früher
  const base = strength >= 13 ? 20 : strength >= 11 ? 45 : 75;
  const start = world.date > `${world.season}-11-01` ? world.date : `${world.season}-11-01`;
  return addDays(start, base + Math.round(h * 40));
}

/** Vertrag schließen */
export function sign(world: World, offer: Offer): World {
  const p = world.players.find((x) => x.id === offer.playerId)!;
  const t = offer.terms;
  const contract = makeContract({
    clubId: offer.clubId, salary: t.salary, untilSeason: offer.forSeason + t.years - 1, role: t.role,
    perks: t.perks, bonus: t.bonus, clauses: t.clauses,
    promises: t.promises.map((type) => ({ type, status: 'ok' as const, strikes: 0 })),
    fromSeason: offer.forSeason,
  });
  const immediate = offer.forSeason === world.season;
  const fromClub = p.contract?.clubId;
  const players = world.players.map((x) => (x.id !== p.id ? x : immediate ? { ...x, contract, nextContract: null } : { ...x, nextContract: contract }));
  let market: Market = {
    ...world.market,
    offers: world.market.offers.map((o) => (o.playerId !== p.id || o.status !== 'open' ? o : o.id === offer.id ? { ...o, status: 'accepted' as const } : { ...o, status: 'rejected' as const })),
  };
  delete market.decideBy[p.id];
  const club = world.clubs.find((c) => c.id === offer.clubId)!;
  const human = world.clubs.filter((c) => c.controller.type === 'human').map((c) => c.id);
  const mine = human.includes(offer.clubId) || (!!fromClub && human.includes(fromClub)) || world.market.offers.some((o) => o.playerId === p.id && human.includes(o.clubId) && o.status === 'open');
  const extension = fromClub === offer.clubId;
  const seasonTxt = immediate ? 'ab sofort' : `ab ${offer.forSeason}/${String(offer.forSeason + 1).slice(2)}`;
  const text = extension
    ? `${p.firstName} ${p.lastName} verlängert bei ${club.name} (${t.years} ${t.years === 1 ? 'Jahr' : 'Jahre'}).`
    : `${p.firstName} ${p.lastName} unterschreibt bei ${club.name} ${seasonTxt} (${t.years} ${t.years === 1 ? 'Jahr' : 'Jahre'}).`;
  market = news(market, { date: world.date, text, kind: 'signing', mine });
  let w: World = { ...world, players, market };
  if (immediate) w = refreshLineup(w, offer.clubId);
  return w;
}

/** Aufstellung eines KI-Vereins nach Kaderänderung neu bauen; beim Menschen nur, wenn ungültig. */
export function refreshLineup(world: World, clubId: string): World {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const roster = world.players.filter((p) => p.contract?.clubId === clubId);
  const ids = new Set(roster.map((p) => p.id));
  const plan = club.matchplan;
  const valid = plan && [...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies, ...plan.powerPlay.flatMap((u) => [...u.forwards, ...u.defense]), ...plan.penaltyKill.flatMap((u) => [...u.forwards, ...u.defense])].every((id) => ids.has(id));
  if (club.controller.type === 'human' && valid) return world;
  try {
    const next = autoMatchplan(roster, { countryCode: 'DE', importSlotsGame: world.countries[0].rules.importSlotsGame, tactics: plan?.tactics, keep: plan ? { specialTeams: plan.specialTeams, matchups: plan.matchups, rules: plan.rules } : undefined });
    return { ...world, clubs: world.clubs.map((c) => (c.id === clubId ? { ...c, matchplan: next } : c)) };
  } catch {
    return world;
  }
}

// ---------------------------------------------------------------- Zeitablauf: Entscheidungen, KI, Versprechen

/** Spieler mit offenen Angeboten entscheiden sich (bei Frist oder klar bestem Angebot). */
function decide(world: World): World {
  let w = world;
  const byPlayer = new Map<string, Offer[]>();
  for (const o of w.market.offers) if (o.status === 'open') byPlayer.set(o.playerId, [...(byPlayer.get(o.playerId) ?? []), o]);
  for (const [pid, offers] of byPlayer) {
    const p = w.players.find((x) => x.id === pid);
    if (!p || p.nextContract) continue;
    const valid = offers.filter((o) => !checkLimits(w, p, o.clubId, o.forSeason) && availability(w, p, o.clubId).ok);
    if (!valid.length) continue;
    const scored = valid.map((o) => ({ o, u: offerUtility(w, p, o.clubId, o.terms, o.forSeason) })).sort((a, b) => b.u - a.u);
    const best = scored[0], second = scored[1]?.u ?? -Infinity;
    const by = w.market.decideBy[pid] ?? decisionDateFor(w, p);
    const due = w.date >= by;
    const clear = best.u >= 0.2 && best.u >= second + 0.3;
    if (!(due || clear)) continue;
    if (best.u >= reservation(w, p)) {
      w = sign(w, best.o);
    } else if (due) {
      w = { ...w, market: { ...w.market, decideBy: { ...w.market.decideBy, [pid]: addDays(w.date, 21) } } };
    }
  }
  return w;
}

export const TARGET = { F: 13, D: 8, G: 2 } as const;
const PROFILE_FACTOR = { corporate: 1.1, patron: 1.05, tradition: 1.0, development: 0.95, promoted: 0.9 } as const;

export function standardTerms(world: World, p: Player, club: Club, factor: number): Terms {
  const age = ageOn(p.birthDate, world.date);
  const imp = isImport(p);
  return {
    salary: Math.round((expectedSalary(world, p) * factor) / 500) * 500,
    years: age >= 31 ? 1 : age <= 23 ? 2 : hash01(`jahre:${p.id}:${club.id}`) < 0.5 ? 1 : 2,
    role: expectedRole(world, p),
    perks: imp ? { housing: 1, car: 1, flights: 1, family: 0, extras: 0 } : { ...NO_PERKS, car: hash01(`auto:${p.id}`) < 0.4 ? 1 : 0 },
    bonus: { perPoint: 0, playoffs: 0 },
    clauses: { exit: imp && toDisplay(overall(p)) >= 13, relegation: club.profile === 'promoted' },
    promises: [],
  };
}

/** Wöchentliche KI-Marktrunde: eigene Spieler verlängern, Lücken für die nächste Saison füllen, nachbessern. */
function aiRound(world: World): World {
  let w = world;
  const season = w.season;
  const nextSeasonPhase = w.date >= `${season}-11-01`;
  const rules = w.countries[0].rules;
  for (const club of w.clubs.filter((c) => c.controller.type === 'ai')) {
    const forSeason = nextSeasonPhase ? season + 1 : season;
    const roster = w.players.filter((p) =>
      forSeason === season ? p.contract?.clubId === club.id : (p.contract?.clubId === club.id && p.contract.untilSeason >= forSeason) || p.nextContract?.clubId === club.id);
    const myOpen = w.market.offers.filter((o) => o.clubId === club.id && o.status === 'open');
    const count = (g: 'F' | 'D' | 'G') => roster.filter((p) => group(p.position) === g).length + myOpen.filter((o) => group(w.players.find((x) => x.id === o.playerId)!.position) === g).length;
    const committed = roster.reduce((s, p) => s + contractCost((forSeason === season ? p.contract : p.nextContract?.clubId === club.id ? p.nextContract : p.contract)!), 0)
      + myOpen.reduce((s, o) => s + contractCost(o.terms), 0);
    let budget = club.finances.salaryBudget - committed - w.staff.filter((s) => s.contract?.clubId === club.id).reduce((s, x) => s + x.contract!.salary, 0);
    const factor = PROFILE_FACTOR[club.profile];

    // Nachbessern, wenn ein anderer Verein vorne liegt
    for (const o of myOpen) {
      const p = w.players.find((x) => x.id === o.playerId)!;
      if (o.raises >= 2 || tendency(w, p, club.id).code !== 'behind') continue;
      const raise = Math.round((o.terms.salary * 0.07) / 500) * 500;
      if (raise > budget) continue;
      budget -= raise;
      const terms = { ...o.terms, salary: o.terms.salary + raise };
      const market = { ...w.market, offers: w.market.offers.map((x) => (x.id === o.id ? { ...x, terms, raises: x.raises + 1, date: w.date } : x)) };
      w = { ...w, market };
      const humanInvolved = w.market.offers.some((x) => x.playerId === p.id && x.status === 'open' && w.clubs.find((c) => c.id === x.clubId)?.controller.type === 'human');
      if (humanInvolved) w = { ...w, market: news(w.market, { date: w.date, text: `${club.name} bessert das Angebot für ${p.firstName} ${p.lastName} nach.`, kind: 'offer', mine: true }) };
    }

    // Lücken füllen
    for (const g of ['G', 'D', 'F'] as const) {
      let missing = TARGET[g] - count(g);
      if (missing <= 0) continue;
      const imports = roster.filter(isImport).length + myOpen.filter((o) => isImport(w.players.find((x) => x.id === o.playerId)!)).length;
      const candidates = marketPlayers(w, club.id)
        .filter((p) => group(p.position) === g && !w.market.offers.some((o) => o.playerId === p.id && o.clubId === club.id && o.status === 'open'))
        .filter((p) => (forSeason === season ? !p.contract : true))
        .filter((p) => !isImport(p) || imports < rules.importSlotsRoster)
        .map((p) => ({ p, own: p.contract?.clubId === club.id, value: overall(p) - expectedSalary(w, p) / 4000 + (p.contract?.clubId === club.id ? 6 : 0) + (hash01(`ki:${club.id}:${p.id}`) - 0.5) * 6 }))
        .sort((a, b) => b.value - a.value);
      for (const { p } of candidates) {
        if (missing <= 0) break;
        const terms = standardTerms(w, p, club, factor * (0.95 + hash01(`bieten:${club.id}:${p.id}`) * 0.12));
        const cost = contractCost(terms);
        if (cost > budget && budget < 40_000) continue;
        if (cost > budget * 1.1) continue;
        const res = submitOffer(w, p.id, club.id, terms);
        if (res.response.kind === 'interested' || res.response.kind === 'accepted') {
          w = res.world;
          budget -= cost;
          missing--;
          const humanOwns = p.contract && w.clubs.find((c) => c.id === p.contract!.clubId)?.controller.type === 'human';
          if (humanOwns && res.response.kind === 'interested') {
            w = { ...w, market: news(w.market, { date: w.date, text: `${club.name} bietet für euren Spieler ${p.firstName} ${p.lastName}.`, kind: 'offer', mine: true }) };
          }
        } else {
          w = { ...w, market: res.world.market };
        }
      }
    }
  }
  return { ...w, market: { ...w.market, lastAiRun: w.date } };
}

/** Versprechen des menschlichen Vereins monatlich prüfen. */
function checkPromises(world: World): World {
  let w = world;
  for (const club of w.clubs.filter((c) => c.controller.type === 'human')) {
    const plan = club.matchplan;
    if (!plan) continue;
    const top6 = new Set(plan.forwardLines.slice(0, 2).flat());
    const top4 = new Set(plan.defensePairs.slice(0, 2).flat());
    const pp1 = new Set([...plan.powerPlay[0].forwards, ...plan.powerPlay[0].defense]);
    let cred = credibilityOf(w, club.id);
    const newsItems: News[] = [];
    const players = w.players.map((p) => {
      if (p.contract?.clubId !== club.id || !p.contract.promises.length) return p;
      const promises = p.contract.promises.map((pr) => {
        if (pr.type === 'playoffs' || pr.status === 'broken') return pr;
        const kept = pr.type === 'top6F' ? top6.has(p.id) : pr.type === 'top4D' ? top4.has(p.id) : pr.type === 'pp1' ? pp1.has(p.id) : plan.goalies[0] === p.id;
        const strikes = kept ? 0 : pr.strikes + 1;
        const status = strikes === 0 ? 'ok' : strikes === 1 ? 'risk' : 'broken';
        if (status === 'risk' && pr.status === 'ok') newsItems.push({ date: w.date, text: `${p.firstName} ${p.lastName} ist unzufrieden: Versprechen „${PROMISE_LABEL[pr.type]}“ wird nicht eingehalten.`, kind: 'promise', mine: true });
        if (status === 'broken') {
          cred = Math.max(0.3, cred - 0.06);
          newsItems.push({ date: w.date, text: `Versprechen gebrochen: ${p.firstName} ${p.lastName} („${PROMISE_LABEL[pr.type]}“). Seine Moral sinkt, eure Glaubwürdigkeit leidet.`, kind: 'promise', mine: true });
        }
        return { ...pr, strikes, status: status as 'ok' | 'risk' | 'broken' };
      });
      const brokenNow = promises.filter((x) => x.status === 'broken').length - p.contract.promises.filter((x) => x.status === 'broken').length;
      const morale = Math.max(5, p.condition.morale - brokenNow * 15 - promises.filter((x) => x.status === 'risk').length * 2);
      return { ...p, condition: { ...p.condition, morale }, contract: { ...p.contract, promises } };
    });
    let market = { ...w.market, credibility: { ...w.market.credibility, [club.id]: cred } };
    for (const n of newsItems) market = news(market, n);
    w = { ...w, players, market };
  }
  return w;
}

/** Markt-Fortschritt bis zum neuen Datum (aufgerufen nach jedem Spieltag). */
export function marketTick(world: World, prevDate: string): World {
  let w = world;
  if (monthKey(prevDate) !== monthKey(w.date)) w = checkPromises(w);
  if (daysBetween(w.market.lastAiRun, w.date) >= 7) w = aiRound(w);
  w = decide(w);
  return w;
}

/** Vereinslose mit offenem Angebot: sofort entscheiden lassen (z. B. im Sommer ohne Spieltage). */
export function marketAdvance(world: World, days: number): World {
  let w = world;
  for (let i = 0; i < days; i += 7) {
    const prev = w.date;
    w = { ...w, date: addDays(w.date, Math.min(7, days - i)) };
    w = marketTick(w, prev);
  }
  return w;
}
