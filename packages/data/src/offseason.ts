import type { World } from '@ehm/schema';
import type { PhaseReport } from '@ehm/schema';
import {
  OFFSEASON_PHASES, phaseDate, marketAdvance, daysBetween, trainingCamp, vacation, developSummer, buildTestDay, releaseRemainingYouth, resetDevRef,
  applySeasonReviews, runTraining, healInjuries, sponsorSummer, sponsorKickoff, clearTrainingLog, recoverFitness, talksReport, transferReport, summerReport, kickoffReport, trainingReport,
} from '@ehm/core';
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
  const human = world.clubs.find((c) => c.controller.type === 'human');
  const reports: Record<string, PhaseReport> = { ...(world.offseason?.reports ?? {}) };
  /** Bericht der neuen Phase für den Verein des Managers ablegen */
  const done = (out: World, testDay = world.offseason?.testDay, make?: (hid: string) => PhaseReport | null): World => {
    const r = human && make ? make(human.id) : null;
    if (r) reports[ph.id] = r;
    return { ...out, offseason: { phase: next, reports, ...(testDay ? { testDay } : {}) } };
  };
  if (!ph.newSeason) {
    w = healInjuries(marketAdvance(w, Math.max(0, daysBetween(w.date, target))), target);
    if (ph.id === 'review') {
      w = vacation(w);
      // Saisonbilanz: Der Vorstand bewertet alle Vereine und passt das Vertrauen an
      const { world: rated, reviews } = applySeasonReviews(w);
      return done(rated, undefined, (hid) => reviews.get(hid)?.report ?? null);
    }
    if (ph.id === 'talks') {
      // Sponsoren: Angebote für auslaufende und freie Flächen
      w = sponsorSummer(w);
      const out = w;
      return done(out, undefined, (hid) => talksReport(out, hid));
    }
    if (ph.id === 'transfer') return done(w, undefined, (hid) => transferReport(w, hid));
    let testDay = world.offseason?.testDay;
    if (ph.id === 'summer') {
      // Großer Entwicklungsschritt: Wachstum der Jungen, Abbau der Älteren.
      // Für den Manager als „Tag der Leistungstests“ aufbereitet (keine Einzelmeldungen vorab – nichts verraten).
      const prev = w;
      const { world: dev, report } = developSummer(w, oldSeason + 1);
      w = dev;
      if (human) {
        testDay = buildTestDay(prev, w, report, human.id);
        w = { ...w, market: { ...w.market, news: [{ date: target, kind: 'info' as const, mine: true, text: 'Tag der Leistungstests: Die Ergebnisse des Sommertrainings liegen vor (Spieltag › Sommerpause).' }, ...w.market.news].slice(0, 120) } };
      }
      // Nachwuchsjahrgang für alle Vereine
      w = youthIntake(w, oldSeason + 1);
    }
    const out = w;
    return done(out, testDay, (hid) => summerReport(out, hid, testDay?.clubId === hid ? testDay : undefined));
  }
  if (ph.id === 'kickoff') {
    const prev = w;
    w = healInjuries(releaseRemainingYouth(w, target), target);
    // Sponsoren: offene Flächen unterschreibt der Vorstand bzw. der Geschäftsführer
    w = sponsorKickoff(w);
    w = clearTrainingLog(resetDevRef(seasonTransition(w)));
    w = trainingCamp(w, 0.3, `${w.season}:auftakt`);
    // Trainingsauftakt: erste Trainingswoche nach dem Wochenplan
    w = recoverFitness(runTraining(w, target), 2);
    const out = w;
    return done(out, undefined, (hid) => kickoffReport(prev, out, hid));
  }
  const prev = w;
  w = healInjuries(marketAdvance(w, Math.max(0, daysBetween(w.date, target))), target);
  w = trainingCamp(w, ph.id === 'camp' ? 1 : 0.6, `${w.season}:${ph.id}`);
  // Trainingswochen der abgelaufenen Phase; die Wochen im Trainingslager zählen anderthalbfach
  w = recoverFitness(runTraining(w, target, ph.id === 'preseason' ? 1.5 : 1), 2);
  const out = w;
  return done(out, undefined, (hid) => trainingReport(prev, out, hid, ph.id === 'preseason'));
}
