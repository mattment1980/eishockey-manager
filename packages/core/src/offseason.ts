import type { World } from '@ehm/schema';
import { pairKey, CHEM_START } from './chemistry.ts';
import { trainFamiliarity, learningRate } from './familiarity.ts';
import { hash01 } from './calendar.ts';

/**
 * Sommerpause in Phasen: vom Saisonende bis zum ersten Spieltag.
 * Phase 0–4 gehören noch zur alten Saison (Markt läuft weiter), in Phase 5 greift der Saisonwechsel,
 * danach folgen Trainingslager und Vorbereitung. Später kommen hier Testspiele und Training dazu.
 */

export interface OffseasonPhase {
  id: string;
  name: string;
  /** Datum (MM-TT) und Jahr relativ zum Saisonstartjahr der alten Saison (+1 = Folgejahr) */
  date: string | null;
  text: string;
  /** gehört schon zur neuen Saison (nach dem Saisonwechsel) */
  newSeason: boolean;
}

export const OFFSEASON_PHASES: OffseasonPhase[] = [
  { id: 'end', name: 'Saisonende', date: null, newSeason: false, text: 'Die Saison ist entschieden. Bilanz ziehen, Meister feiern – und den Blick nach vorn richten.' },
  { id: 'review', name: 'Saisonbilanz', date: '05-01', newSeason: false, text: 'Der Vorstand bewertet die Saison. Die Spieler gehen in den Urlaub und erholen sich.' },
  { id: 'talks', name: 'Vertragsgespräche', date: '05-25', newSeason: false, text: 'Hauptphase der Verhandlungen: Verlängerungen und Vorverträge für die neue Saison.' },
  { id: 'transfer', name: 'Transfermarkt', date: '06-20', newSeason: false, text: 'Die Kader nehmen Form an. Die Konkurrenz schlägt bei den letzten freien Spielern zu.' },
  { id: 'summer', name: 'Sommertraining', date: '07-15', newSeason: false, text: 'Individuelles Training. Letzte Chance, den Kader vor dem Saisonwechsel zu ergänzen.' },
  { id: 'kickoff', name: 'Saisonwechsel & Trainingsauftakt', date: '08-01', newSeason: true, text: 'Neue Verträge treten in Kraft, Neuzugänge stoßen dazu. Die Mannschaft trifft sich zum ersten Eistraining.' },
  { id: 'camp', name: 'Trainingslager', date: '08-12', newSeason: true, text: 'Intensive Einheiten nach deinem Wochenplan (Reiter Training) – im Trainingslager wirkt jede Woche anderthalbfach. Reihen spielen sich ein, das Team lernt das System.' },
  { id: 'preseason', name: 'Vorbereitungsspiele', date: '08-26', newSeason: true, text: 'Testspiele und Feinschliff. Reihen und Systeme sitzen besser – bald geht es los.' },
];

/** Datum einer Phase (ISO) bezogen auf das Startjahr der alten Saison */
export function phaseDate(oldSeason: number, idx: number): string | null {
  const ph = OFFSEASON_PHASES[idx];
  if (!ph?.date) return null;
  return `${oldSeason + 1}-${ph.date}`;
}

/**
 * Trainingsphase für alle Vereine: Reihen gewinnen Chemie, das Team lernt seine Systeme,
 * die Spieler werden fit, die Form pendelt sich ein. `intensity` 0–1.
 */
export function trainingCamp(world: World, intensity: number, tag: string): World {
  const chemistry = { ...world.chemistry };
  for (const c of world.clubs) {
    const plan = c.matchplan;
    if (!plan) continue;
    for (const unit of [...plan.forwardLines, ...plan.defensePairs]) {
      for (let i = 0; i < unit.length; i++) for (let j = i + 1; j < unit.length; j++) {
        const k = pairKey(unit[i], unit[j]);
        const c0 = chemistry[k] ?? CHEM_START;
        chemistry[k] = Math.round(Math.min(100, c0 + Math.max(0, 88 - c0) * 0.18 * intensity) * 10) / 10;
      }
    }
  }
  const clubs = world.clubs.map((c) => (c.matchplan
    ? { ...c, familiarity: trainFamiliarity(world, c, c.matchplan, Math.min(0.5, learningRate(world, c.id) * 4 * intensity), 0) }
    : c));
  const players = world.players.map((p) => {
    const f0 = p.condition.form;
    const form = 50 + (f0 - 50) * 0.5 + (hash01(`${tag}:${p.id}`) - 0.5) * 10;
    return { ...p, condition: { ...p.condition, fitness: 100, form: Math.round(form * 10) / 10 } };
  });
  return { ...world, chemistry, clubs, players };
}

/** Urlaub: alle erholen sich, Form und Moral pendeln zur Mitte, eingespielte Systeme verblassen etwas */
export function vacation(world: World): World {
  return {
    ...world,
    clubs: world.clubs.map((c) => ({
      ...c,
      familiarity: Object.fromEntries(Object.entries(c.familiarity).map(([k, v]) => [k, Math.round((v > 50 ? 50 + (v - 50) * 0.7 : v) * 10) / 10])),
    })),
    players: world.players.map((p) => ({
      ...p,
      condition: { fitness: 100, form: Math.round((50 + (p.condition.form - 50) * 0.4) * 10) / 10, morale: Math.round((p.condition.morale * 2 + 60) / 3 * 10) / 10 },
    })),
  };
}
