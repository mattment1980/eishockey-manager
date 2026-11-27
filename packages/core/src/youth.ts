import type { World, Player, News } from '@ehm/schema';
import { makeContract } from '@ehm/schema';
import { rosterCount } from './market.ts';
import { toDisplay } from './ratings.ts';

/**
 * Nachwuchsjahrgang: Jeder Verein bekommt im Sommer (Phase „Sommertraining“) einige 16- bis 17-Jährige
 * aus dem eigenen Nachwuchs. Sie können einen Fördervertrag bekommen oder werden freigegeben
 * (dann sind sie vereinslos und für alle auf dem Markt). KI-Vereine entscheiden sofort,
 * der Manager bis zum Saisonwechsel – danach werden übrige Talente automatisch freigegeben.
 * Erzeugt werden die Spieler in `packages/data` (Generator), hier stehen nur die Regeln.
 */

export const YOUTH = {
  /** Jahresgehalt eines Fördervertrags */
  SALARY: 12_000,
  /** Laufzeit in Saisons */
  YEARS: 3,
  /** Wie viele Talente KI-Vereine höchstens übernehmen */
  AI_KEEP: 1,
  /** Größe des Jahrgangs */
  SIZE: 4,
} as const;

/** Talente aus dem Jahrgang eines Vereins, die noch auf eine Entscheidung warten */
export const youthOf = (world: World, clubId: string): Player[] => world.players.filter((p) => p.youthClub === clubId && !p.contract);

/** Qualität des Nachwuchses eines Vereins (Anzeige 1–20): bester Entwicklungstrainer */
export function academyRating(world: World, clubId: string): number {
  const devs = world.staff.filter((s) => s.contract?.clubId === clubId && s.role !== 'scout').map((s) => toDisplay(s.ratings.development));
  return devs.length ? Math.max(...devs) : 8;
}

/** Fördervertrag geben; Fehlertext, wenn der Kader voll ist */
export function signYouth(world: World, playerId: string): { world: World; error?: string } {
  const p = world.players.find((x) => x.id === playerId);
  if (!p || !p.youthClub || p.contract) return { world, error: 'Kein offenes Nachwuchstalent.' };
  const clubId = p.youthClub;
  const rules = world.countries[0].rules;
  if (rosterCount(world, clubId, world.season + 1) >= rules.maxRoster) return { world, error: `Kader für die nächste Saison ist voll (${rules.maxRoster} Spieler).` };
  const contract = makeContract({ clubId, salary: YOUTH.SALARY, untilSeason: world.season + YOUTH.YEARS, role: 'prospect', fromSeason: world.season + 1 });
  return { world: { ...world, players: world.players.map((x) => (x.id === playerId ? { ...x, contract, youthClub: null } : x)) } };
}

/** Talent freigeben: wird vereinslos */
export function releaseYouth(world: World, playerId: string): World {
  return { ...world, players: world.players.map((x) => (x.id === playerId && !x.contract ? { ...x, youthClub: null } : x)) };
}

/** KI-Verein: die vielversprechendsten Talente übernehmen, den Rest freigeben */
export function aiYouthDecisions(world: World, clubId: string): World {
  let w = world;
  const list = youthOf(w, clubId).sort((a, b) => b.hidden.potential - a.hidden.potential);
  list.forEach((p, i) => {
    const keep = i < YOUTH.AI_KEEP && p.hidden.potential >= 110;
    if (keep) {
      const r = signYouth(w, p.id);
      w = r.error ? releaseYouth(w, p.id) : r.world;
    } else w = releaseYouth(w, p.id);
  });
  return w;
}

/** Beim Saisonwechsel: nicht entschiedene Talente werden freigegeben (mit Nachricht für den Manager) */
export function releaseRemainingYouth(world: World, date: string): World {
  const open = world.players.filter((p) => p.youthClub && !p.contract);
  if (!open.length) return world;
  const human = new Set(world.clubs.filter((c) => c.controller.type === 'human').map((c) => c.id));
  const news: News[] = open.filter((p) => human.has(p.youthClub!)).map((p) => ({ date, kind: 'info', mine: true, text: `Ohne Fördervertrag: ${p.firstName} ${p.lastName} verlässt den Nachwuchs und ist vereinslos.` }));
  let w = world;
  for (const p of open) w = releaseYouth(w, p.id);
  return news.length ? { ...w, market: { ...w.market, news: [...news, ...w.market.news].slice(0, 120) } } : w;
}
