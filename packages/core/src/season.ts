import type { LeagueFormat } from '@ehm/schema';
import type { Rng } from './rng.ts';

export interface Fixture {
  round: number;
  home: string;
  away: string;
}

/**
 * Spielplan „jeder gegen jeden“ (Kreisverfahren), `roundRobins`-mal,
 * mit wechselndem Heimrecht. Bei 14 Vereinen und 4 Runden: 52 Spieltage à 7 Spiele.
 */
export function roundRobinSchedule(clubIds: string[], roundRobins: number, rng?: Rng): Fixture[] {
  const ids = [...clubIds];
  if (rng) rng.shuffle(ids);
  if (ids.length % 2) ids.push('__BYE__');
  const n = ids.length;
  const single: [string, string][][] = [];
  const arr = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    single.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  const fixtures: Fixture[] = [];
  let round = 1;
  for (let k = 0; k < roundRobins; k++) {
    for (const pairs of single) {
      for (const [h, a] of pairs) {
        if (h === '__BYE__' || a === '__BYE__') continue;
        fixtures.push(k % 2 === 0 ? { round, home: h, away: a } : { round, home: a, away: h });
      }
      round++;
    }
  }
  return fixtures;
}

export interface StandingRow {
  clubId: string;
  gp: number;
  w: number;
  otw: number;
  otl: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export interface GameOutcome {
  home: string;
  away: string;
  score: [number, number];
  decidedIn: 'REG' | 'OT' | 'SO';
}

export function standings(clubIds: string[], games: GameOutcome[], pts: LeagueFormat['points']): StandingRow[] {
  const rows = new Map<string, StandingRow>(clubIds.map((id) => [id, { clubId: id, gp: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const g of games) {
    const h = rows.get(g.home)!, a = rows.get(g.away)!;
    h.gp++; a.gp++;
    h.gf += g.score[0]; h.ga += g.score[1];
    a.gf += g.score[1]; a.ga += g.score[0];
    const homeWin = g.score[0] > g.score[1];
    const [win, loss] = homeWin ? [h, a] : [a, h];
    if (g.decidedIn === 'REG') { win.w++; win.pts += pts.win; loss.l++; loss.pts += pts.loss; }
    else { win.otw++; win.pts += pts.otWin; loss.otl++; loss.pts += pts.otLoss; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}
