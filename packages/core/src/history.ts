import type { World, SeasonArchive, StatLine } from '@ehm/schema';
import { regularTable, teamSeasonStats } from './standings.ts';

/**
 * Saisonarchiv: Beim Saisonwechsel werden Tabelle, Endplatzierung und Mannschaftsstatistik
 * der Liga sowie die Statistik jedes Spielers festgehalten (für Profile und die Liga-Ansicht).
 */

/** Abgeschlossene Saison archivieren (nur einmal je Saison) */
export function archiveSeason(world: World): World {
  const comp = world.competition;
  if (!comp || world.archive.some((a) => a.season === comp.year && a.leagueId === comp.leagueId)) return world;
  const clubs: SeasonArchive['clubs'] = {};
  for (const c of world.clubs) if (c.leagueId === comp.leagueId) clubs[c.id] = { name: c.name, shortName: c.shortName };
  const entry: SeasonArchive = {
    season: comp.year,
    leagueId: comp.leagueId,
    champion: comp.champion,
    relegated: comp.relegated,
    table: regularTable(world),
    finalStandings: comp.finalStandings ?? null,
    teams: { regular: teamSeasonStats(world, 'regular'), post: teamSeasonStats(world, 'post') },
    clubs,
  };
  const reg = comp.stats.regular, post = comp.stats.post;
  const players = world.players.map((p) => {
    const r: StatLine | undefined = reg[p.id], q: StatLine | undefined = post[p.id];
    if (!r && !q) return p;
    if (p.career.some((x) => x.season === comp.year && x.leagueId === comp.leagueId)) return p;
    return { ...p, career: [...p.career, { season: comp.year, leagueId: comp.leagueId, regular: r ?? null, post: q ?? null }] };
  });
  return { ...world, players, archive: [...world.archive, entry] };
}

/** Bezeichnung einer Saison: 2026 → „2026/27“ */
export const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(2)}`;
