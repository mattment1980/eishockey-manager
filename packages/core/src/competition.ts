import type {
  World, Club, Player, Competition, Fixture, Series, StatLine, League, Stage, Matchplan,
} from '@ehm/schema';
import { Rng } from './rng.ts';
import { roundRobinSchedule, standings, type StandingRow } from './season.ts';
import { simulateMatch } from './engine/match.ts';
import type { MatchInput, MatchResult, TeamInput } from './engine/types.ts';
import { addDays, onOrAfter } from './calendar.ts';
import { beginSeasonFinances, bookFixture, closeMonthsBetween, evaluateSeason } from './economy.ts';
import { updateScouting } from './scouting.ts';
import { marketTick } from './market.ts';
import { coachingCapacity, defaultRules } from './coaching.ts';

/**
 * Saisonablauf nach Ligaformat: Hauptrunde → Pre-Playoffs → Playoffs (mit Neusetzen)
 * sowie parallel Playdowns. Alle Funktionen sind rein: Welt rein → neue Welt raus.
 */

export function leagueOf(world: World, comp: Competition): League {
  const l = world.leagues.find((x) => x.id === comp.leagueId);
  if (!l) throw new Error(`Liga ${comp.leagueId} fehlt`);
  return l;
}

export function createCompetition(world: World, leagueId: string, seed: number): Competition {
  const league = world.leagues.find((l) => l.id === leagueId)!;
  const ids = world.clubs.filter((c) => c.leagueId === leagueId).map((c) => c.id);
  const schedule = roundRobinSchedule(ids, league.format.roundRobins, new Rng(`${seed}:spielplan`));
  // Spieltage freitags und sonntags ab Mitte September
  const start = onOrAfter(`${world.season}-09-12`, 5);
  const dateOf = (day: number) => addDays(start, Math.floor((day - 1) / 2) * 7 + ((day - 1) % 2 ? 2 : 0));
  const lastRegular = dateOf(Math.max(...schedule.map((f) => f.round)));
  const comp: Competition = {
    leagueId,
    year: world.season,
    day: 0,
    transferDeadline: addDays(lastRegular, 3 - 61),
    fixtures: schedule.map((f, i) => ({ id: `h${f.round}-${i}`, stage: 'regular' as Stage, day: f.round, date: dateOf(f.round), home: f.home, away: f.away })),
    series: [],
    finalStandings: null,
    stats: { regular: {}, post: {} },
    champion: null,
    relegated: null,
    finished: false,
  };
  return comp;
}

// ---------------------------------------------------------------- Tabelle

export function regularTable(world: World): StandingRow[] {
  const comp = world.competition!;
  const league = leagueOf(world, comp);
  const ids = world.clubs.filter((c) => c.leagueId === comp.leagueId).map((c) => c.id);
  const games = comp.fixtures
    .filter((f) => f.stage === 'regular' && f.result)
    .map((f) => ({ home: f.home, away: f.away, score: f.result!.score, decidedIn: f.result!.decidedIn }));
  return standings(ids, games, league.format.points);
}

export const regularDays = (comp: Competition) => Math.max(...comp.fixtures.filter((f) => f.stage === 'regular').map((f) => f.day));

export function fixturesOfDay(comp: Competition, day: number): Fixture[] {
  return comp.fixtures.filter((f) => f.day === day);
}

export function nextFixtureOf(comp: Competition, clubId: string): Fixture | null {
  return comp.fixtures.find((f) => f.day === comp.day + 1 && (f.home === clubId || f.away === clubId)) ?? null;
}

// ---------------------------------------------------------------- Phasen & Serien

const needed = (bestOf: number) => Math.ceil(bestOf / 2);

function seriesDone(list: Series[]): boolean {
  return list.length > 0 && list.every((s) => s.winner);
}

function makeSeries(id: string, stage: Stage, roundName: string, roundNo: number, bestOf: number, high: string, low: string): Series {
  return { id, stage, roundName, roundNo, bestOf, high, low, winsHigh: 0, winsLow: 0, winner: null };
}

/** Paarungen 1–n, 2–(n-1), … nach Hauptrundenplatz (Neusetzen je Runde). */
function pairUp(ids: string[], order: string[]): [string, string][] {
  const sorted = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const out: [string, string][] = [];
  for (let i = 0; i < sorted.length / 2; i++) out.push([sorted[i], sorted[sorted.length - 1 - i]]);
  return out;
}

const ROUND_NAMES: Record<number, string> = { 8: 'Viertelfinale', 4: 'Halbfinale', 2: 'Finale' };

/** Legt nach Bedarf neue Serien an und erzeugt die Spiele für den nächsten Spieltag. */
export function prepareNextDay(world: World): World {
  const comp: Competition = structuredClone(world.competition!);
  const fmt = leagueOf(world, comp).format;
  const next = comp.day + 1;
  if (comp.finished || comp.fixtures.some((f) => f.day === next)) return { ...world, competition: comp };

  const regularOpen = comp.fixtures.some((f) => f.stage === 'regular' && !f.result);
  if (regularOpen) return { ...world, competition: comp };

  // Hauptrunde beendet → Abschlusstabelle festhalten, erste Serien anlegen
  if (!comp.finalStandings) {
    comp.finalStandings = regularTable({ ...world, competition: comp }).map((r) => r.clubId);
    const order = comp.finalStandings;
    const at = (place: number) => order[place - 1];
    if (fmt.prePlayoffs) {
      const [a, b] = fmt.prePlayoffs;
      const ids = order.slice(a - 1, b);
      pairUp(ids, order).forEach(([h, l], i) => comp.series.push(makeSeries(`pre${i + 1}`, 'prePlayoffs', 'Pre-Playoffs', 1, fmt.prePlayoffBestOf, h, l)));
    } else {
      const ids = order.slice(fmt.directPlayoffs[0] - 1, fmt.directPlayoffs[1]);
      pairUp(ids, order).forEach(([h, l], i) => comp.series.push(makeSeries(`po2-${i + 1}`, 'playoffs', ROUND_NAMES[ids.length] ?? 'Playoffs', 2, fmt.playoffBestOf, h, l)));
    }
    if (fmt.playdowns) {
      const [a, b] = fmt.playdowns;
      const ids = order.slice(a - 1, b);
      pairUp(ids, order).forEach(([h, l], i) => comp.series.push(makeSeries(`pd1-${i + 1}`, 'playdowns', 'Playdowns', 1, fmt.playdownBestOf, h, l)));
    }
    void at;
  }
  const order = comp.finalStandings!;

  // Playoff-Strang
  const byRound = (stage: Stage, round: number) => comp.series.filter((s) => s.stage === stage && s.roundNo === round);
  const pre = byRound('prePlayoffs', 1);
  if (fmt.prePlayoffs && seriesDone(pre) && byRound('playoffs', 2).length === 0) {
    const direct = order.slice(fmt.directPlayoffs[0] - 1, fmt.directPlayoffs[1]);
    const ids = [...direct, ...pre.map((s) => s.winner!)];
    pairUp(ids, order).forEach(([h, l], i) => comp.series.push(makeSeries(`po2-${i + 1}`, 'playoffs', ROUND_NAMES[ids.length] ?? 'Playoffs', 2, fmt.playoffBestOf, h, l)));
  }
  for (let r = 2; r < 10; r++) {
    const cur = byRound('playoffs', r);
    if (!seriesDone(cur) || byRound('playoffs', r + 1).length) continue;
    const winners = cur.map((s) => s.winner!);
    if (winners.length === 1) {
      comp.champion = winners[0];
    } else {
      pairUp(winners, order).forEach(([h, l], i) => comp.series.push(makeSeries(`po${r + 1}-${i + 1}`, 'playoffs', ROUND_NAMES[winners.length] ?? 'Playoffs', r + 1, fmt.playoffBestOf, h, l)));
    }
  }

  // Playdown-Strang: Verlierer der ersten Runde spielen den Absteiger aus
  const pd1 = byRound('playdowns', 1);
  if (seriesDone(pd1) && byRound('playdowns', 2).length === 0) {
    const losers = pd1.map((s) => (s.winner === s.high ? s.low : s.high));
    if (losers.length === 1) comp.relegated = losers[0];
    else pairUp(losers, order).forEach(([h, l], i) => comp.series.push(makeSeries(`pd2-${i + 1}`, 'playdowns', 'Playdown-Finale', 2, fmt.playdownBestOf, h, l)));
  }
  const pd2 = byRound('playdowns', 2);
  if (seriesDone(pd2) && !comp.relegated) {
    const s = pd2[0];
    comp.relegated = s.winner === s.high ? s.low : s.high;
  }

  // Spiele für offene Serien (Abstand 2–3 Tage)
  const lastDate = comp.fixtures.filter((f) => f.day === comp.day).map((f) => f.date).sort().pop() ?? world.date;
  const gameDate = addDays(lastDate, comp.fixtures.some((f) => f.day === comp.day && f.stage === 'regular') ? 5 : next % 2 ? 2 : 3);
  for (const s of comp.series) {
    if (s.winner) continue;
    const gameNo = s.winsHigh + s.winsLow + 1;
    const highHome = gameNo % 2 === 1;
    comp.fixtures.push({
      id: `${s.id}-g${gameNo}`, stage: s.stage, day: next, date: gameDate,
      home: highHome ? s.high : s.low, away: highHome ? s.low : s.high, seriesId: s.id, gameNo,
    });
  }
  const playoffsOver = !!comp.champion;
  const playdownsOver = !fmt.playdowns || !!comp.relegated;
  if (!comp.fixtures.some((f) => f.day === next) && playoffsOver && playdownsOver) comp.finished = true;
  return { ...world, competition: comp };
}

// ---------------------------------------------------------------- Spiele

function seedFor(world: World, fixtureId: string): number {
  let h = world.seed >>> 0;
  for (const ch of `${world.season}:${fixtureId}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Aufstellung für ein konkretes Spiel – KI rotiert den Torhüter in der Hauptrunde. */
export function planFor(world: World, club: Club, fixture: Fixture): Matchplan {
  const plan = club.matchplan!;
  if (club.controller.type !== 'ai' || fixture.stage !== 'regular') return plan;
  const played = world.competition!.fixtures.filter((f) => f.result && f.stage === 'regular' && (f.home === club.id || f.away === club.id)).length;
  if (played % 4 === 3) return { ...plan, goalies: [plan.goalies[1], plan.goalies[0]] };
  return plan;
}

export function matchInputFor(world: World, fixture: Fixture): MatchInput {
  const comp = world.competition!;
  const fmt = leagueOf(world, comp).format;
  const team = (id: string): TeamInput => {
    const c = world.clubs.find((x) => x.id === id)!;
    let plan = planFor(world, c, fixture);
    if (c.controller.type === 'ai' && !(plan.rules ?? []).length) plan = { ...plan, rules: defaultRules() };
    return { clubId: c.id, name: c.name, shortName: c.shortName, plan, players: world.players.filter((p) => p.contract?.clubId === c.id), coach: coachingCapacity(world, c.id) };
  };
  return {
    home: team(fixture.home),
    away: team(fixture.away),
    seed: seedFor(world, fixture.id),
    phase: fixture.stage === 'regular' ? 'regular' : 'playoff',
    format: fmt,
    keepEvents: false,
  };
}

const emptyLine = (clubId: string): StatLine => ({ clubId, gp: 0, g: 0, a: 0, pim: 0, pm: 0, sog: 0, toi: 0, gs: 0, sa: 0, ga: 0, w: 0, so: 0 });

function record(comp: Competition, fixture: Fixture, res: MatchResult, byId: Map<string, Player>) {
  fixture.result = { score: res.score, decidedIn: res.decidedIn, shots: [res.teamStats[0].shotsOnGoal, res.teamStats[1].shotsOnGoal] };
  const bucket = fixture.stage === 'regular' ? comp.stats.regular : comp.stats.post;
  const clubs = [fixture.home, fixture.away];
  for (const s of res.playerStats) {
    if (s.toi <= 0) continue;
    const p = byId.get(s.playerId);
    if (!p) continue;
    const line = (bucket[s.playerId] ??= emptyLine(clubs[s.team]));
    line.gp++;
    line.g += s.goals; line.a += s.assists; line.pim += s.pim; line.pm += s.plusMinus; line.sog += s.shotsOnGoal; line.toi += s.toi;
    if (p.position === 'G') {
      const won = res.score[s.team] > res.score[1 - s.team];
      line.gs++; line.sa += s.shotsAgainst; line.ga += s.goalsAgainst;
      if (won) line.w++;
      if (won && s.goalsAgainst === 0) line.so++;
    }
  }
  if (fixture.seriesId) {
    const ser = comp.series.find((x) => x.id === fixture.seriesId)!;
    const winner = res.score[0] > res.score[1] ? fixture.home : fixture.away;
    if (winner === ser.high) ser.winsHigh++; else ser.winsLow++;
    if (ser.winsHigh >= needed(ser.bestOf)) ser.winner = ser.high;
    if (ser.winsLow >= needed(ser.bestOf)) ser.winner = ser.low;
  }
}

/**
 * Nächsten Spieltag spielen. Bereits (z. B. live) gespielte Partien können übergeben werden.
 * Gibt die neue Welt und alle Ergebnisse des Spieltags zurück.
 */
export function playDay(world: World, preplayed: Record<string, MatchResult> = {}): { world: World; results: Record<string, MatchResult> } {
  let w = prepareNextDay(world);
  const comp: Competition = structuredClone(w.competition!);
  if (comp.finished) return { world: w, results: {} };
  const day = comp.day + 1;
  const byId = new Map(w.players.map((p) => [p.id, p]));
  const results: Record<string, MatchResult> = {};
  const todays = comp.fixtures.filter((x) => x.day === day && !x.result);
  const date = todays[0]?.date ?? w.date;
  // Monatsabschlüsse bis zum Spieltag
  const placeBefore = placeLookup(w);
  w = closeMonthsBetween(w, w.date, date, placeBefore);
  for (const f of todays) {
    const res = preplayed[f.id] ?? simulateMatch(matchInputFor(w, f));
    results[f.id] = res;
    record(comp, f, res, byId);
  }
  comp.day = day;
  w = { ...w, competition: comp, date };
  // Einnahmen/Ausgaben der Spiele
  const placeNow = placeLookup(w);
  for (const f of todays) w = bookFixture(w, f, f.stage === 'regular' ? placeNow(f.home) : null);
  // Scouting
  w = updateScouting(w, date, todays.map((f) => ({ home: f.home, away: f.away, result: results[f.id] })));
  // Markt (Entscheidungen, KI-Angebote, Versprechen)
  w = marketTick(w, world.date);
  w = prepareNextDay(w);
  if (w.competition!.finished) {
    w = evaluateSeason(w);
    // restliche Monate der Saison bis Ende Juli abrechnen
    w = closeMonthsBetween(w, w.date, `${w.competition!.year + 1}-08-01`, () => null);
  }
  return { world: w, results };
}

function placeLookup(world: World): (clubId: string) => number | null {
  const comp = world.competition!;
  if (comp.day < 6 || comp.finalStandings) return () => null;
  const order = regularTable(world).map((r) => r.clubId);
  return (id) => order.indexOf(id) + 1;
}

/** Neue Saison anlegen: Spielplan, Finanzplanung, erste Spiele. */
export function beginSeason(world: World, seed: number): World {
  const w = { ...world, date: `${world.season}-08-01`, competition: createCompetition(world, world.leagues[0].id, seed) };
  return prepareNextDay(beginSeasonFinances(w));
}

/** Mehrere Spieltage am Stück (z. B. bis Hauptrundenende). */
export function playDays(world: World, count: number, stopAt?: (w: World) => boolean): World {
  let w = world;
  for (let i = 0; i < count; i++) {
    if (w.competition?.finished) break;
    w = playDay(w).world;
    if (stopAt?.(w)) break;
  }
  return w;
}

export function stageLabel(comp: Competition): string {
  if (comp.finished) return 'Saison beendet';
  const next = comp.fixtures.filter((f) => f.day === comp.day + 1);
  if (next.some((f) => f.stage === 'regular')) return `Hauptrunde · Spieltag ${comp.day + 1} von ${regularDays(comp)}`;
  const names = [...new Set(next.map((f) => comp.series.find((s) => s.id === f.seriesId)?.roundName).filter(Boolean))];
  return names.join(' · ') || 'Nachsaison';
}
