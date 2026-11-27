import type { World, Club, Fixture, ClubProfile } from '@ehm/schema';
import { hash01, monthKey, monthsBetween, nextMonth } from './calendar.ts';
import { teamStrength } from './lineup.ts';
import { perkCost } from './market.ts';

/**
 * Wirtschaft (Basis): Ticketing, Catering, Sponsoren, Medien, Gehälter, Halle, Reisen, Verwaltung.
 * Die Saison wird so geplant, dass ein Verein bei erwartetem Verlauf ungefähr bei null landet;
 * sportlicher Erfolg (Zuschauer, Playoff-Heimspiele) entscheidet über Gewinn oder Verlust.
 */

export type LedgerCategory =
  | 'tickets' | 'catering' | 'sponsors' | 'media' | 'playoffs'
  | 'salaries' | 'perks' | 'bonus' | 'staff' | 'arena' | 'travel' | 'admin';

export const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  tickets: 'Ticketing', catering: 'Catering & Merchandising', sponsors: 'Sponsoring', media: 'Medien', playoffs: 'Playoff-Ticketing',
  salaries: 'Gehälter Spieler', perks: 'Nebenleistungen (Wohnung, Auto, …)', bonus: 'Prämien', staff: 'Gehälter Staff', arena: 'Halle', travel: 'Reisen', admin: 'Verwaltung & Betrieb',
};
export const INCOME: LedgerCategory[] = ['tickets', 'playoffs', 'catering', 'sponsors', 'media'];
export const EXPENSE: LedgerCategory[] = ['salaries', 'perks', 'bonus', 'staff', 'arena', 'travel', 'admin'];

export const E = {
  MEDIA_PER_CLUB: 240_000,
  CATERING_PER_FAN: 5,
  ARENA_PER_SEAT: 3.2,
  TRAVEL_PER_GAME: 5_500,
  PLAYOFF_PRICE_FACTOR: 1.25,
  /** Erwarteter Zusatzerlös (Playoffs, Zuschauerschwankung), um den die Sponsoren niedriger geplant werden */
  EXPECTED_PLAYOFF_SHARE: 150_000,
  TICKET_PRICE: { corporate: 24, patron: 22, tradition: 21, development: 19, promoted: 18 } as Record<ClubProfile, number>,
};

export const GOAL_LABEL = {
  title: 'Finale erreichen', semifinal: 'Halbfinale erreichen', quarterfinal: 'Direkt ins Viertelfinale',
  prePlayoffs: 'Pre-Playoffs erreichen', survival: 'Klassenerhalt',
} as const;
const GOAL_PLACE = { title: 2, semifinal: 3, quarterfinal: 6, prePlayoffs: 10, survival: 12 } as const;

export function payrollOf(world: World, clubId: string): { players: number; perks: number; staff: number } {
  let players = 0, staff = 0, perks = 0;
  for (const p of world.players) {
    if (p.contract?.clubId !== clubId) continue;
    players += p.contract.salary;
    perks += perkCost(p.contract.perks);
  }
  for (const s of world.staff) if (s.contract?.clubId === clubId) staff += s.contract.salary;
  return { players, perks, staff };
}

export function baseFill(club: Club): number {
  return 0.5 + 0.4 * (club.fanBase / 100);
}
function homeGames(world: World, clubId: string): number {
  return world.competition!.fixtures.filter((f) => f.stage === 'regular' && f.home === clubId).length;
}

/** Saisonplanung: Ziel, Ticketpreis, Sponsoren, Medien, Gehaltsetat. */
export function beginSeasonFinances(world: World): World {
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const ranked = [...world.clubs].sort((a, b) => teamStrength(b.matchplan!, byId) - teamStrength(a.matchplan!, byId)).map((c) => c.id);
  const clubs = world.clubs.map((c) => {
    const rank = ranked.indexOf(c.id) + 1;
    const goal = rank <= 2 ? 'title' : rank <= 4 ? 'semifinal' : rank <= 6 ? 'quarterfinal' : rank <= 10 ? 'prePlayoffs' : 'survival';
    const pay = payrollOf(world, c.id);
    const games = homeGames(world, c.id);
    const price = E.TICKET_PRICE[c.profile];
    const expFans = Math.min(1, baseFill(c)) * c.arena.capacity * games;
    const expTickets = expFans * (price + E.CATERING_PER_FAN);
    const fixedCosts = pay.players + pay.perks + pay.staff + games * c.arena.capacity * E.ARENA_PER_SEAT + games * E.TRAVEL_PER_GAME;
    const admin = Math.max(c.finances.budget * 0.08, c.finances.budget - fixedCosts);
    const sponsors = Math.max(c.finances.budget * 0.15, pay.players + pay.perks + pay.staff + games * c.arena.capacity * E.ARENA_PER_SEAT + games * E.TRAVEL_PER_GAME + admin - expTickets - E.MEDIA_PER_CLUB - E.EXPECTED_PLAYOFF_SHARE);
    return {
      ...c,
      seasonGoal: goal as Club['seasonGoal'],
      finances: {
        ...c.finances,
        ticketPrice: price,
        sponsorIncome: Math.round(sponsors / 1000) * 1000,
        mediaIncome: E.MEDIA_PER_CLUB,
        salaryBudget: Math.round(Math.max(c.finances.budget * 0.6, pay.players + pay.perks + pay.staff) / 10_000) * 10_000,
        ledger: [],
        attendance: [],
      },
    };
  });
  return { ...world, clubs };
}

/** Monatliche Verwaltungskosten aus dem Etat (gleiche Formel wie in der Saisonplanung). */
function adminPerMonth(world: World, club: Club): number {
  const pay = payrollOf(world, club.id);
  const games = homeGames(world, club.id);
  const fixed = pay.players + pay.perks + pay.staff + games * club.arena.capacity * E.ARENA_PER_SEAT + games * E.TRAVEL_PER_GAME;
  return Math.max(club.finances.budget * 0.08, club.finances.budget - fixed) / 12;
}

/** Ausgabe im laufenden Monat buchen (z. B. Abfindung) */
export function bookExpense(world: World, clubId: string, cat: LedgerCategory, amount: number): World {
  return { ...world, clubs: world.clubs.map((c) => (c.id === clubId ? book(c, monthKey(world.date), cat, -amount) : c)) };
}

function book(club: Club, month: string, cat: LedgerCategory, amount: number): Club {
  const ledger = club.finances.ledger.map((m) => ({ month: m.month, items: { ...m.items } }));
  let entry = ledger.find((m) => m.month === month);
  if (!entry) { entry = { month, items: {} }; ledger.push(entry); ledger.sort((a, b) => a.month.localeCompare(b.month)); }
  entry.items[cat] = (entry.items[cat] ?? 0) + amount;
  return { ...club, finances: { ...club.finances, ledger, balance: Math.round(club.finances.balance + amount) } };
}

/** Zuschlag auf die Hallenauslastung: Fanstimmung (±10 % der Halle) und Event-Bonus (z. B. Autogrammstunde) */
export const fanFillBonus = (c: Club) => ((c.mood.fans - 50) / 50) * 0.1 + (c.events.attendance?.pct ?? 0);
/** Faktor auf die Sponsoreneinnahmen aus der Sponsorenzufriedenheit (±8 %) */
export const sponsorFactor = (c: Club) => 1 + ((c.mood.sponsors - 50) / 50) * 0.08;

/** Zuschauerzahl eines Heimspiels (deterministisch je Spiel). */
export function attendanceFor(world: World, fixture: Fixture, place: number | null): number {
  const home = world.clubs.find((c) => c.id === fixture.home)!;
  const away = world.clubs.find((c) => c.id === fixture.away)!;
  const n = world.clubs.filter((c) => c.leagueId === home.leagueId).length;
  let fill = baseFill(home);
  if (place) fill += ((n / 2 - place) / n) * 0.16;
  fill += (away.fanBase / 100) * 0.06 - 0.03;
  fill += fanFillBonus(home);
  if (fixture.stage === 'playoffs') {
    const ser = world.competition!.series.find((s) => s.id === fixture.seriesId);
    fill += 0.12 + 0.04 * (ser?.roundNo ?? 1);
  } else if (fixture.stage !== 'regular') fill += 0.1;
  fill += (hash01(`zuschauer:${fixture.id}:${world.season}`) - 0.5) * 0.08;
  return Math.round(Math.max(0.25, Math.min(1, fill)) * home.arena.capacity);
}

/** Einnahmen/Ausgaben eines gespielten Spiels buchen. */
export function bookFixture(world: World, fixture: Fixture, place: number | null): World {
  const month = monthKey(fixture.date);
  const fans = attendanceFor(world, fixture, place);
  const clubs = world.clubs.map((c) => {
    if (c.id === fixture.home) {
      const post = fixture.stage !== 'regular';
      const price = c.finances.ticketPrice * (post ? E.PLAYOFF_PRICE_FACTOR : 1);
      let x = book(c, month, post ? 'playoffs' : 'tickets', fans * price);
      x = book(x, month, 'catering', fans * E.CATERING_PER_FAN);
      x = book(x, month, 'arena', -c.arena.capacity * E.ARENA_PER_SEAT);
      return { ...x, finances: { ...x.finances, attendance: [...x.finances.attendance, fans] } };
    }
    if (c.id === fixture.away) return book(c, month, 'travel', -E.TRAVEL_PER_GAME);
    return c;
  });
  return { ...world, clubs };
}

/** Monatsabschluss: laufende Einnahmen und Ausgaben, Vorstandsvertrauen. */
export function closeMonth(world: World, month: string, place: (clubId: string) => number | null): World {
  const clubs = world.clubs.map((c) => {
    const pay = payrollOf(world, c.id);
    let x = book(c, month, 'salaries', -pay.players / 12);
    if (pay.perks) x = book(x, month, 'perks', -pay.perks / 12);
    x = book(x, month, 'staff', -pay.staff / 12);
    x = book(x, month, 'sponsors', (c.finances.sponsorIncome / 12) * sponsorFactor(c));
    x = book(x, month, 'media', c.finances.mediaIncome / 12);
    x = book(x, month, 'admin', -adminPerMonth(world, c));
    // Vorstand
    let conf = x.boardConfidence;
    const p = place(c.id);
    if (p && c.seasonGoal) conf += Math.max(-3, Math.min(3, (GOAL_PLACE[c.seasonGoal] - p) * 0.5));
    const ratio = (pay.players + pay.perks + pay.staff) / Math.max(1, c.finances.salaryBudget);
    if (ratio > 1.0) conf -= Math.min(4, (ratio - 1) * 40);
    if (x.finances.balance < 0) conf -= 2;
    return { ...x, boardConfidence: Math.round(Math.max(0, Math.min(100, conf))) };
  });
  return { ...world, clubs };
}

/** Alle Monatsabschlüsse zwischen zwei Daten. */
export function closeMonthsBetween(world: World, fromIso: string, toIso: string, place: (clubId: string) => number | null): World {
  let w = world;
  for (const m of monthsBetween(monthKey(fromIso), monthKey(toIso))) w = closeMonth(w, m, place);
  return w;
}

/** Nach dem letzten Spiel: Prämien auszahlen. */
export function evaluateSeason(world: World): World {
  const comp = world.competition!;
  const reached = (clubId: string, round: string) => comp.series.some((s) => s.roundName === round && (s.high === clubId || s.low === clubId));
  const clubs = world.clubs.map((c) => {
    // Das Vertrauen bewertet der Vorstand erst in der Saisonbilanz (board.ts)
    let x = c;
    // Prämien auszahlen
    const quarter = reached(c.id, 'Viertelfinale') || reached(c.id, 'Halbfinale') || reached(c.id, 'Finale');
    let bonus = 0;
    for (const p of world.players) {
      if (p.contract?.clubId !== c.id) continue;
      const st = [comp.stats.regular[p.id], comp.stats.post[p.id]];
      const points = st.reduce((s, l) => s + (l ? l.g + l.a : 0), 0);
      bonus += p.contract.bonus.perPoint * points + (quarter ? p.contract.bonus.playoffs : 0);
    }
    if (bonus) x = book(x, monthKey(world.date), 'bonus', -bonus);
    return x;
  });
  return { ...world, clubs };
}

export interface ForecastMonth { month: string; income: number; expense: number; balance: number; actual: boolean }

/** Liquiditätsprognose bis Juli des Folgejahres (Ist-Werte + Plan). */
export function liquidityForecast(world: World, clubId: string): ForecastMonth[] {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const comp = world.competition!;
  const end = `${comp.year + 1}-08`;
  const current = monthKey(world.date);
  const out: ForecastMonth[] = [];
  // Ist
  let balance = club.finances.balance;
  const ledgerTotal = club.finances.ledger.reduce((s, m) => s + Object.values(m.items).reduce((a, b) => a + b, 0), 0);
  let running = club.finances.balance - ledgerTotal;
  for (const m of club.finances.ledger) {
    const inc = Object.entries(m.items).filter(([k]) => INCOME.includes(k as LedgerCategory)).reduce((s, [, v]) => s + v, 0);
    const exp = Object.entries(m.items).filter(([k]) => EXPENSE.includes(k as LedgerCategory)).reduce((s, [, v]) => s + v, 0);
    running += inc + exp;
    out.push({ month: m.month, income: inc, expense: exp, balance: running, actual: m.month < current });
  }
  // Plan ab aktuellem Monat
  const pay = payrollOf(world, clubId);
  const monthly = { inc: (club.finances.sponsorIncome + club.finances.mediaIncome) / 12, exp: (pay.players + pay.perks + pay.staff) / 12 + adminPerMonth(world, club) };
  const expFans = Math.min(1, baseFill(club)) * club.arena.capacity;
  const startMonth = out.length && out[out.length - 1].month >= current ? nextMonth(out[out.length - 1].month) : current;
  balance = running;
  for (const m of monthsBetween(startMonth, end)) {
    const homes = comp.fixtures.filter((f) => !f.result && f.home === clubId && monthKey(f.date) === m).length;
    const aways = comp.fixtures.filter((f) => !f.result && f.away === clubId && monthKey(f.date) === m).length;
    const inc = monthly.inc + homes * expFans * (club.finances.ticketPrice + E.CATERING_PER_FAN);
    const exp = -monthly.exp - homes * club.arena.capacity * E.ARENA_PER_SEAT - aways * E.TRAVEL_PER_GAME;
    balance += inc + exp;
    out.push({ month: m, income: inc, expense: exp, balance, actual: false });
  }
  return out;
}
