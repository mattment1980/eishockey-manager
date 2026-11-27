import type { World, Club, Player, Competition, Fixture, StatLine, Matchplan } from '@ehm/schema';
import { simulateMatch } from './engine/match.ts';
import type { MatchInput, MatchResult, TeamInput } from './engine/types.ts';
import { bookFixture, closeMonthsBetween, evaluateSeason } from './economy.ts';
import { updateScouting } from './scouting.ts';
import { marketTick } from './market.ts';
import { coachingCapacity, defaultRules } from './coaching.ts';
import { updateAfterGames, unitChemistry, teamClimate, captainOf } from './chemistry.ts';
import { toDisplay } from './ratings.ts';
import { recoverFitness, updateCondition, restDays } from './condition.ts';
import { updateFamiliarity } from './familiarity.ts';
import { developMonths } from './development.ts';
import { runTraining } from './training.ts';
import { leagueOf, regularTable } from './standings.ts';
import { sanitizePlan } from './lineup.ts';
import { prepareNextDay, needed } from './competition.ts';

/**
 * Ablauf eines Spieltags (`playDay`): Monate abschließen → Spiele simulieren → Statistik und Einnahmen →
 * Moral & Chemie → Fitness, Form, Eingespieltheit → Scouting → Markt → nächster Spieltag → Erholung.
 */

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
    const players = world.players.filter((p) => p.contract?.clubId === c.id);
    const byId = new Map(players.map((p) => [p.id, p]));
    // Formationen nur mit aufgestellten Spielern (z. B. nach Umbau der Reihen)
    plan = sanitizePlan(plan, byId);
    const staff = world.staff.filter((s) => s.contract?.clubId === c.id);
    const head = staff.find((s) => s.role === 'headCoach');
    const penaltyFactor = (head ? 1.08 - (toDisplay(head.ratings.discipline) - 5) * 0.016 : 1) * (staff.some((s) => s.traits.some((t) => t.id === 'disziplinfanatiker')) ? 0.88 : 1);
    return {
      clubId: c.id, name: c.name, shortName: c.shortName, plan, players,
      coach: { ...coachingCapacity(world, c.id), penaltyFactor },
      chemistry: { lines: plan.forwardLines.map((l) => unitChemistry(world, l, byId)), pairs: plan.defensePairs.map((l) => unitChemistry(world, l, byId)) },
      climate: teamClimate(world, c.id),
      captainId: captainOf(world, c)?.id,
      familiarity: c.familiarity,
    };
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
  const teamLine = (t: MatchResult['teamStats'][number]) => ({
    att: t.shotAttempts, pim: t.pim, pp: t.powerPlays, ppg: t.powerPlayGoals, shg: t.shortHandedGoals,
    fow: t.faceoffsWon, hits: t.hits, blocks: t.blocks, xg: Math.round(t.xg * 100) / 100,
  });
  fixture.result = {
    score: res.score, decidedIn: res.decidedIn, shots: [res.teamStats[0].shotsOnGoal, res.teamStats[1].shotsOnGoal],
    team: [teamLine(res.teamStats[0]), teamLine(res.teamStats[1])],
  };
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
  // Entwicklung der Spieler für abgeschlossene Saisonmonate
  w = developMonths(w, w.date, date);
  // Training der laufenden Woche(n) vor dem Spiel
  if (todays.length) w = runTraining(w, date);
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
  // Moral und Chemie
  const games = todays.map((f) => ({ fixture: f, result: results[f.id] }));
  w = updateAfterGames(w, games);
  // Fitness, Form und Taktik-Eingespieltheit
  w = updateCondition(w, games);
  w = updateFamiliarity(w, todays);
  // Scouting
  w = updateScouting(w, date, todays.map((f) => ({ home: f.home, away: f.away, result: results[f.id] })));
  // Markt (Entscheidungen, KI-Angebote, Versprechen)
  w = marketTick(w, world.date);
  w = prepareNextDay(w);
  // Erholung bis zum nächsten Spieltag: Die Fitness zeigt damit immer den Stand zum nächsten Anpfiff
  const nextDate = w.competition!.fixtures.find((f) => f.day === w.competition!.day + 1)?.date;
  if (nextDate) w = recoverFitness(w, restDays(date, nextDate));
  if (w.competition!.finished) {
    w = evaluateSeason(w);
    // restliche Monate der Saison bis Ende Juli abrechnen
    const seasonEnd = `${w.competition!.year + 1}-08-01`;
    w = developMonths(w, w.date, seasonEnd);
    w = closeMonthsBetween(w, w.date, seasonEnd, () => null);
    w = { ...w, offseason: { phase: 0, reports: {} } };
  }
  return { world: w, results };
}

function placeLookup(world: World): (clubId: string) => number | null {
  const comp = world.competition!;
  if (comp.day < 6 || comp.finalStandings) return () => null;
  const order = regularTable(world).map((r) => r.clubId);
  return (id) => order.indexOf(id) + 1;
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
