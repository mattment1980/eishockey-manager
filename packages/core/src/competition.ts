import type { World, Competition, Fixture, Series, Stage } from '@ehm/schema';
import { Rng } from './rng.ts';
import { roundRobinSchedule } from './season.ts';
import { addDays, onOrAfter } from './calendar.ts';
import { beginSeasonFinances } from './economy.ts';
import { leagueOf, regularTable } from './standings.ts';

/**
 * Wettbewerb nach Ligaformat: Spielplan, Hauptrunde → Pre-Playoffs → Playoffs (mit Neusetzen)
 * sowie parallel Playdowns. Der Ablauf eines Spieltags steht in matchday.ts,
 * Tabelle und Statistiken in standings.ts. Alle Funktionen sind rein: Welt rein → neue Welt raus.
 */

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

export const regularDays = (comp: Competition) => Math.max(...comp.fixtures.filter((f) => f.stage === 'regular').map((f) => f.day));

export function fixturesOfDay(comp: Competition, day: number): Fixture[] {
  return comp.fixtures.filter((f) => f.day === day);
}

export function nextFixtureOf(comp: Competition, clubId: string): Fixture | null {
  return comp.fixtures.find((f) => f.day === comp.day + 1 && (f.home === clubId || f.away === clubId)) ?? null;
}

// ---------------------------------------------------------------- Phasen & Serien

/** Siege, die für eine Serie nötig sind (best of n) */
export const needed = (bestOf: number) => Math.ceil(bestOf / 2);

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

/** Neue Saison anlegen: Spielplan, Finanzplanung, erste Spiele. */
export function beginSeason(world: World, seed: number): World {
  const w = { ...world, date: `${world.season}-08-01`, competition: createCompetition(world, world.leagues[0].id, seed) };
  return prepareNextDay(beginSeasonFinances(w));
}

export function stageLabel(comp: Competition): string {
  if (comp.finished) return 'Saison beendet';
  const next = comp.fixtures.filter((f) => f.day === comp.day + 1);
  if (next.some((f) => f.stage === 'regular')) return `Hauptrunde · Spieltag ${comp.day + 1} von ${regularDays(comp)}`;
  const names = [...new Set(next.map((f) => comp.series.find((s) => s.id === f.seriesId)?.roundName).filter(Boolean))];
  return names.join(' · ') || 'Nachsaison';
}
