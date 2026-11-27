import type { World, Club, Matchplan, Fixture, Tactics } from '@ehm/schema';
import { toDisplay } from './ratings.ts';

/**
 * Taktik-Eingespieltheit eines Teams: Wie gut beherrscht die Mannschaft die gewählten
 * Systeme? Wächst mit jedem Spiel (und im Trainingslager), verblasst langsam, wenn ein
 * System nicht mehr gespielt wird. 0–100, neutral bei 60.
 */

export const FAM_DEFAULT = 35;
export const FAM_NEUTRAL = 60;
export const FAM_FLOOR = 30;

export const TACTIC_KEYS = ['forecheck', 'forecheckIntensity', 'breakout', 'entry', 'offensiveZone', 'defensiveZone', 'gap', 'tempo', 'physicality'] as const;

/** Schlüssel der Systeme, die ein Matchplan nutzt (Teamtaktik + Special Teams) */
export function familiarityKeys(tactics: Tactics, plan?: Pick<Matchplan, 'specialTeams'>): string[] {
  const keys: string[] = TACTIC_KEYS.map((k) => `${k}:${tactics[k]}`);
  const st = plan?.specialTeams;
  if (st) keys.push(`pp:${st.ppFormation}`, `pk:${st.pkFormation}`);
  return keys;
}

export const familiarityValue = (rec: Record<string, number> | undefined, key: string) => rec?.[key] ?? FAM_DEFAULT;

/** Durchschnittliche Eingespieltheit für die Systeme eines Plans (0–100) */
export function teamFamiliarity(rec: Record<string, number> | undefined, tactics: Tactics, plan?: Pick<Matchplan, 'specialTeams'>): number {
  const keys = familiarityKeys(tactics, plan);
  return keys.reduce((s, k) => s + familiarityValue(rec, k), 0) / keys.length;
}

/** Leistungsanteil aus der Eingespieltheit (z. B. +0,02 = +2 %) */
export function familiarityEffect(avg: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, ((avg - FAM_NEUTRAL) / 40) * cap));
}

/** Lerntempo des Trainerteams (Anteil der Lücke zu 100, der pro Spiel geschlossen wird) */
export function learningRate(world: World, clubId: string): number {
  const staff = world.staff.filter((s) => s.contract?.clubId === clubId);
  const head = staff.find((s) => s.role === 'headCoach');
  const tactics = head ? toDisplay(head.ratings.tactics) : 8;
  const fox = staff.some((s) => s.traits.some((t) => t.id === 'taktikfuchs' && t.strength >= 50));
  return 0.015 + tactics * 0.001 + (fox ? 0.008 : 0);
}

/** Eingespieltheit nach einem Spiel (gespielt = genutzte Systeme wachsen, der Rest verblasst leicht) */
export function trainFamiliarity(world: World, club: Club, plan: Matchplan, rate: number, decay = 0.3): Record<string, number> {
  const rec = { ...club.familiarity };
  const used = new Set(familiarityKeys(plan.tactics, plan));
  // Systeme, die über Coaching-Regeln zum Einsatz kommen, lernt das Team nebenbei mit (halbes Tempo)
  const side = new Set<string>();
  for (const r of plan.rules ?? []) {
    if (!r.enabled) continue;
    for (const a of r.actions) if (a.type === 'tactic') side.add(`${a.key}:${a.value}`);
  }
  for (const k of used) { const v = familiarityValue(rec, k); rec[k] = Math.min(100, v + (100 - v) * rate); }
  for (const k of side) if (!used.has(k)) { const v = familiarityValue(rec, k); rec[k] = Math.min(100, v + (100 - v) * rate * 0.5); }
  for (const k of Object.keys(rec)) {
    if (used.has(k) || side.has(k)) continue;
    rec[k] = Math.max(FAM_FLOOR, rec[k] - decay);
  }
  for (const k of Object.keys(rec)) rec[k] = Math.round(rec[k] * 10) / 10;
  return rec;
}

/** Nach den Spielen eines Spieltags */
export function updateFamiliarity(world: World, fixtures: Fixture[]): World {
  const playing = new Set(fixtures.flatMap((f) => [f.home, f.away]));
  return {
    ...world,
    clubs: world.clubs.map((c) => (playing.has(c.id) && c.matchplan ? { ...c, familiarity: trainFamiliarity(world, c, c.matchplan, learningRate(world, c.id)) } : c)),
  };
}

/** Startwerte: Jeder Verein kennt sein aktuelles System bereits ordentlich */
export function seedFamiliarity(world: World): World {
  return {
    ...world,
    clubs: world.clubs.map((c) => {
      if (!c.matchplan || Object.keys(c.familiarity ?? {}).length) return c;
      const rec: Record<string, number> = {};
      for (const k of familiarityKeys(c.matchplan.tactics, c.matchplan)) rec[k] = 65;
      return { ...c, familiarity: rec };
    }),
  };
}

export const familiarityLabel = (v: number) => (v >= 85 ? 'verinnerlicht' : v >= 70 ? 'eingespielt' : v >= 55 ? 'ordentlich' : v >= 42 ? 'in Arbeit' : 'neu');
