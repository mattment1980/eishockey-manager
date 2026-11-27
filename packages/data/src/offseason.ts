import type { World } from '@ehm/schema';
import { OFFSEASON_PHASES, phaseDate, marketAdvance, daysBetween, trainingCamp, vacation, developSummer, buildTestDay, releaseRemainingYouth, resetDevRef } from '@ehm/core';
import { seasonTransition } from './transition.ts';
import { youthIntake } from './youth.ts';

/** Aktuelle Phase der Sommerpause (null = Saison läuft) */
export function offseasonPhase(world: World): number | null {
  if (world.offseason) return world.offseason.phase;
  return world.competition?.finished ? 0 : null;
}

/** Zur nächsten Phase der Sommerpause; nach der letzten beginnt die Saison. */
export function advanceOffseason(world: World): World {
  const cur = offseasonPhase(world);
  if (cur === null) return world;
  const next = cur + 1;
  // alte Saison: Startjahr aus dem Wettbewerb, nach dem Saisonwechsel ist es das Vorjahr
  const oldSeason = OFFSEASON_PHASES[cur].newSeason ? world.season - 1 : world.season;
  let w = world;
  if (next >= OFFSEASON_PHASES.length) return { ...w, offseason: null };
  const ph = OFFSEASON_PHASES[next];
  const target = phaseDate(oldSeason, next)!;
  if (!ph.newSeason) {
    w = marketAdvance(w, Math.max(0, daysBetween(w.date, target)));
    if (ph.id === 'review') w = vacation(w);
    let testDay = world.offseason?.testDay;
    if (ph.id === 'summer') {
      // Großer Entwicklungsschritt: Wachstum der Jungen, Abbau der Älteren.
      // Für den Manager als „Tag der Leistungstests“ aufbereitet (keine Einzelmeldungen vorab – nichts verraten).
      const prev = w;
      const { world: dev, report } = developSummer(w, oldSeason + 1);
      w = dev;
      const human = w.clubs.find((c) => c.controller.type === 'human');
      if (human) {
        testDay = buildTestDay(prev, w, report, human.id);
        w = { ...w, market: { ...w.market, news: [{ date: target, kind: 'info' as const, mine: true, text: 'Tag der Leistungstests: Die Ergebnisse des Sommertrainings liegen vor (Spieltag › Sommerpause).' }, ...w.market.news].slice(0, 120) } };
      }
      // Nachwuchsjahrgang für alle Vereine
      w = youthIntake(w, oldSeason + 1);
    }
    return { ...w, offseason: { phase: next, ...(testDay ? { testDay } : {}) } };
  }
  if (ph.id === 'kickoff') {
    w = releaseRemainingYouth(w, target);
    w = resetDevRef(seasonTransition(w));
    w = trainingCamp(w, 0.3, `${w.season}:auftakt`);
    return { ...w, offseason: { phase: next, ...(world.offseason?.testDay ? { testDay: world.offseason.testDay } : {}) } };
  }
  w = marketAdvance(w, Math.max(0, daysBetween(w.date, target)));
  w = trainingCamp(w, ph.id === 'camp' ? 1 : 0.6, `${w.season}:${ph.id}`);
  return { ...w, offseason: { phase: next, ...(world.offseason?.testDay ? { testDay: world.offseason.testDay } : {}) } };
}
