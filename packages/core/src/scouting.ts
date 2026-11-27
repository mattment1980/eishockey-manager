import type { World, Player, ScoutingState, SkaterAttribute, GoalieAttribute, Staff } from '@ehm/schema';
import { SKATER_ATTRIBUTES, GOALIE_ATTRIBUTES } from '@ehm/schema';
import { daysBetween, hash01 } from './calendar.ts';
import { overall, toDisplay, talentStars } from './ratings.ts';
import type { MatchResult } from './engine/types.ts';

/**
 * Scouting: Kenntnis je Spieler aus Sicht eines Vereins (0–400 Punkte → Stufe 1–4).
 * Quellen: Liga-Vertrautheit, Spiele gegeneinander, Scouts (nach Region, Beobachtungsliste zuerst).
 */

export const REGIONS = ['DE', 'Skandinavien', 'Nordamerika', 'Osteuropa'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABEL: Record<Region, string> = {
  DE: 'Deutschland & Österreich', Skandinavien: 'Skandinavien', Nordamerika: 'Nordamerika', Osteuropa: 'Mittel- & Osteuropa',
};

export function regionOf(p: Player): Region {
  const n = p.nationalities[0];
  if (n === 'DE' || n === 'AT') return 'DE';
  if (n === 'SE' || n === 'FI' || n === 'NO' || n === 'DK') return 'Skandinavien';
  if (n === 'CA' || n === 'US') return 'Nordamerika';
  return 'Osteuropa';
}

export const S = {
  OWN: 400,
  LEAGUE_START: 150,
  DOMESTIC_FREE: 120,
  FOREIGN_FREE: 40,
  PER_GAME_FACED: 20,
  PER_VISIT: 60,
  /** Anteil der Punkte bei Reisen außerhalb der Einsatzregion (nur beobachtete Spieler) */
  AWAY_FACTOR: 0.5,
  /** Punkte pro Woche und Scout bei Scouting-Wert 0; + Faktor × Wert */
  WEEKLY_BASE: 110,
  WEEKLY_PER_RATING: 0.6,
};

export const levelOf = (points: number) => Math.max(1, Math.min(4, 1 + Math.floor(points / 100)));

export function scoutsOf(world: World, clubId: string): Staff[] {
  return world.staff.filter((s) => s.role === 'scout' && s.contract?.clubId === clubId);
}

export function initScouting(world: World, clubId: string): World {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const knowledge: Record<string, number> = {};
  for (const p of world.players) {
    const cid = p.contract?.clubId;
    if (cid === clubId) knowledge[p.id] = S.OWN;
    else if (cid && world.clubs.find((c) => c.id === cid)?.leagueId === club.leagueId) knowledge[p.id] = S.LEAGUE_START;
    else knowledge[p.id] = regionOf(p) === 'DE' ? S.DOMESTIC_FREE : S.FOREIGN_FREE;
  }
  const state: ScoutingState = { knowledge, watch: [], bank: {}, lastUpdate: world.date };
  return { ...world, scouting: { ...world.scouting, [clubId]: state } };
}

/** Fortschritt nach einem Spieltag: gespielte Gegner und Scout-Arbeit seit dem letzten Stand. */
export function updateScouting(world: World, newDate: string, results: { home: string; away: string; result: MatchResult }[]): World {
  const scouting = { ...world.scouting };
  for (const [clubId, st0] of Object.entries(world.scouting)) {
    const st: ScoutingState = { knowledge: { ...st0.knowledge }, watch: [...st0.watch], bank: { ...st0.bank }, lastUpdate: newDate };
    const add = (id: string, pts: number) => { st.knowledge[id] = Math.min(400, (st.knowledge[id] ?? 0) + pts); };
    // eigene Spieler immer vollständig bekannt
    for (const p of world.players) if (p.contract?.clubId === clubId) st.knowledge[p.id] = S.OWN;
    // Spiele gegen den Verein
    for (const r of results) {
      if (r.home !== clubId && r.away !== clubId) continue;
      const oppSide = r.home === clubId ? 1 : 0;
      for (const ps of r.result.playerStats) if (ps.team === oppSide && ps.toi > 0) add(ps.playerId, S.PER_GAME_FACED);
    }
    // Scouts
    const days = Math.max(0, daysBetween(st0.lastUpdate, newDate));
    for (const scout of scoutsOf(world, clubId)) {
      const region = (scout.region ?? 'DE') as Region;
      let bank = (st.bank[scout.id] ?? 0) + (days / 7) * (S.WEEKLY_BASE + S.WEEKLY_PER_RATING * scout.ratings.scouting);
      const pool = world.players.filter((p) => p.contract?.clubId !== clubId && regionOf(p) === region && (st.knowledge[p.id] ?? 0) < 400);
      const watched = pool.filter((p) => st.watch.includes(p.id));
      const rest = pool.filter((p) => !st.watch.includes(p.id)).sort((a, b) => (st.knowledge[a.id] ?? 0) - (st.knowledge[b.id] ?? 0) || overall(b) - overall(a));
      for (const p of [...watched, ...rest]) {
        if (bank < S.PER_VISIT) break;
        add(p.id, S.PER_VISIT);
        bank -= S.PER_VISIT;
      }
      // Beobachtete Spieler außerhalb der Region: Scouts reisen hin (weniger ergiebig)
      const away = world.players.filter((p) => st.watch.includes(p.id) && p.contract?.clubId !== clubId && regionOf(p) !== region && (st.knowledge[p.id] ?? 0) < 400);
      for (const p of away) {
        if (bank < S.PER_VISIT) break;
        add(p.id, S.PER_VISIT * S.AWAY_FACTOR);
        bank -= S.PER_VISIT;
      }
      st.bank[scout.id] = Math.min(bank, 600);
    }
    scouting[clubId] = st;
  }
  return { ...world, scouting };
}

// ---------------------------------------------------------------- Ansicht je Kenntnisstufe

export const CATEGORY = ['sehr schwach', 'schwach', 'solide', 'stark', 'sehr stark'] as const;
export function categoryOf(display: number): (typeof CATEGORY)[number] {
  return display <= 6 ? 'sehr schwach' : display <= 9 ? 'schwach' : display <= 12 ? 'solide' : display <= 15 ? 'stark' : 'sehr stark';
}

export type AttrView = { exact: number } | { range: [number, number] } | { category: string } | { hidden: true };

export interface PlayerView {
  level: number;
  points: number;
  overall: AttrView;
  /** Attribute (Feldspieler oder Torhüter) */
  attrs: Record<string, AttrView>;
  traitsVisible: number;
  potential: string;
  /** Talent (Entwicklungsobergrenze) in Sternen – exakt oder als Spanne, je nach Kenntnis */
  talent: { stars: number } | { range: [number, number] } | { hidden: true };
  strengths: string[];
}

/** Systematischer Schätzfehler eines Vereins bei einem Spieler (interne Punkte), abhängig von der Scout-Qualität. */
function estimateError(world: World, viewerId: string, player: Player, key: string): number {
  const best = Math.max(60, ...scoutsOf(world, viewerId).map((s) => s.ratings.scouting));
  const sigma = 14 * (1 - best / 220);
  const u = hash01(`${viewerId}:${player.id}:${key}`) + hash01(`${player.id}:${key}:${viewerId}`) + hash01(`${key}:${viewerId}:${player.id}`) - 1.5;
  return u * 2 * sigma;
}

function viewValue(world: World, viewerId: string, player: Player, key: string, value: number, level: number): AttrView {
  if (level >= 4) return { exact: toDisplay(value) };
  const est = toDisplay(value + estimateError(world, viewerId, player, key));
  if (level === 3) return { range: [Math.max(1, est - 2), Math.min(20, est + 2)] };
  if (level === 2) return { category: categoryOf(est) };
  return { hidden: true };
}

const POTENTIAL_TEXT = (gap: number, age: number) =>
  age >= 28 ? 'ausentwickelt' : gap >= 30 ? 'großes Potenzial' : gap >= 15 ? 'Potenzial nach oben' : gap >= 6 ? 'etwas Luft nach oben' : 'nah an seinem Limit';

export function playerView(world: World, viewerId: string, player: Player, age: number): PlayerView {
  const points = world.scouting[viewerId]?.knowledge[player.id] ?? (player.contract?.clubId === viewerId ? 400 : 0);
  const level = player.contract?.clubId === viewerId ? 4 : levelOf(points);
  const attrs: Record<string, AttrView> = {};
  let strengths: string[] = [];
  if (player.position === 'G' && player.goalie) {
    for (const k of GOALIE_ATTRIBUTES) attrs[k] = viewValue(world, viewerId, player, k, player.goalie[k as GoalieAttribute], level);
    strengths = [...GOALIE_ATTRIBUTES].sort((a, b) => player.goalie![b] - player.goalie![a]).slice(0, 2);
  } else {
    for (const k of SKATER_ATTRIBUTES) attrs[k] = viewValue(world, viewerId, player, k, player.skater[k as SkaterAttribute], level);
    strengths = [...SKATER_ATTRIBUTES].filter((k) => k !== 'discipline' && k !== 'leadership').sort((a, b) => player.skater[b] - player.skater[a]).slice(0, 2);
  }
  const ov = overall(player);
  const ovView: AttrView = level >= 4 ? { exact: toDisplay(ov) } : level === 1
    ? { category: categoryOf(toDisplay(ov + estimateError(world, viewerId, player, 'overall'))) }
    : viewValue(world, viewerId, player, 'overall', ov, level);
  const gap = player.hidden.potential - ov + (level < 4 ? estimateError(world, viewerId, player, 'potential') : 0);
  return {
    level,
    points,
    overall: ovView,
    attrs,
    traitsVisible: level >= 4 ? player.traits.length : level === 3 ? Math.min(player.traits.length, 2) : level === 2 ? Math.min(player.traits.length, 1) : 0,
    potential: level >= 2 ? POTENTIAL_TEXT(gap, age) : 'unbekannt',
    talent: talentView(world, viewerId, player, level),
    strengths,
  };
}

function talentView(world: World, viewerId: string, player: Player, level: number): PlayerView['talent'] {
  if (level >= 4) return { stars: talentStars(player.hidden.potential) };
  if (level === 1) return { hidden: true };
  const est = talentStars(player.hidden.potential + estimateError(world, viewerId, player, 'talent') * 1.5);
  const w = level === 3 ? 0.5 : 1;
  return { range: [Math.max(0.5, est - w), Math.min(5, est + w)] };
}

export function formatView(v: AttrView): string {
  if ('exact' in v) return String(v.exact);
  if ('range' in v) return `${v.range[0]}–${v.range[1]}`;
  if ('category' in v) return v.category;
  return '?';
}
