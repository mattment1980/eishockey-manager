import type { World, Competition, Fixture, League, Stage } from '@ehm/schema';
import { standings } from './season.ts';
import type { StandingRow } from './season.ts';

/** Tabelle, Form der letzten Spiele und Mannschaftsstatistik */

export function leagueOf(world: World, comp: Competition): League {
  const l = world.leagues.find((x) => x.id === comp.leagueId);
  if (!l) throw new Error(`Liga ${comp.leagueId} fehlt`);
  return l;
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

// ---------------------------------------------------------------- Form & Teamstatistik

export type FormCode = 'S' | 'SnV' | 'NnV' | 'N';

/** Ergebnisse der letzten `n` Spiele eines Vereins (ältestes zuerst) */
export function lastResults(comp: Competition, clubId: string, n = 5, stage?: Stage): { code: FormCode; fixture: Fixture }[] {
  const games = comp.fixtures
    .filter((f) => f.result && (f.home === clubId || f.away === clubId) && (!stage || f.stage === stage))
    .sort((a, b) => a.day - b.day);
  return games.slice(-n).map((f) => {
    const side = f.home === clubId ? 0 : 1;
    const won = f.result!.score[side] > f.result!.score[1 - side];
    const ot = f.result!.decidedIn !== 'REG';
    return { code: won ? (ot ? 'SnV' : 'S') : ot ? 'NnV' : 'N', fixture: f };
  });
}

export interface TeamSeasonStats {
  clubId: string;
  gp: number;
  gf: number;
  ga: number;
  sog: number;
  sogA: number;
  att: number;
  attA: number;
  xg: number;
  xgA: number;
  pp: number;
  ppg: number;
  /** Unterzahlsituationen = Überzahlspiele des Gegners */
  pk: number;
  ppgA: number;
  shg: number;
  shgA: number;
  pim: number;
  fow: number;
  fol: number;
  hits: number;
  blocks: number;
  /** Spiele mit Detailstatistik (ältere Spielstände haben sie nicht für alle Spiele) */
  detailed: number;
}

/** Mannschaftsstatistik für Hauptrunde oder Nachsaison */
export function teamSeasonStats(world: World, bucket: 'regular' | 'post'): TeamSeasonStats[] {
  const comp = world.competition!;
  const ids = world.clubs.filter((c) => c.leagueId === comp.leagueId).map((c) => c.id);
  const rows = new Map<string, TeamSeasonStats>(ids.map((id) => [id, {
    clubId: id, gp: 0, gf: 0, ga: 0, sog: 0, sogA: 0, att: 0, attA: 0, xg: 0, xgA: 0, pp: 0, ppg: 0, pk: 0, ppgA: 0,
    shg: 0, shgA: 0, pim: 0, fow: 0, fol: 0, hits: 0, blocks: 0, detailed: 0,
  }]));
  for (const f of comp.fixtures) {
    if (!f.result || (bucket === 'regular') !== (f.stage === 'regular')) continue;
    const r = f.result;
    ([0, 1] as const).forEach((side) => {
      const row = rows.get(side === 0 ? f.home : f.away);
      if (!row) return;
      const o = 1 - side;
      row.gp++;
      row.gf += r.score[side]; row.ga += r.score[o];
      // Penaltyschießen: Siegtreffer zählt nicht als Tor in der Statistik
      if (r.decidedIn === 'SO') { if (r.score[side] > r.score[o]) row.gf--; else row.ga--; }
      row.sog += r.shots[side]; row.sogA += r.shots[o];
      if (r.team) {
        const m = r.team[side], t = r.team[o];
        row.detailed++;
        row.att += m.att; row.attA += t.att; row.xg += m.xg; row.xgA += t.xg;
        row.pp += m.pp; row.ppg += m.ppg; row.pk += t.pp; row.ppgA += t.ppg;
        row.shg += m.shg; row.shgA += t.shg; row.pim += m.pim; row.fow += m.fow; row.fol += t.fow;
        row.hits += m.hits; row.blocks += m.blocks;
      }
    });
  }
  return [...rows.values()];
}
