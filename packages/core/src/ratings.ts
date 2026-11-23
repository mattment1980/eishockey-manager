import type { Player, SkaterAttribute, GoalieAttribute } from '@ehm/schema';

type Weights<K extends string> = Partial<Record<K, number>>;

export function weightedSkater(p: Player, w: Weights<SkaterAttribute>): number {
  let sum = 0, tot = 0;
  for (const k in w) {
    const wk = w[k as SkaterAttribute]!;
    sum += p.skater[k as SkaterAttribute] * wk;
    tot += wk;
  }
  return tot ? sum / tot : 0;
}

export function weightedGoalie(p: Player, w: Weights<GoalieAttribute>): number {
  if (!p.goalie) return 40;
  let sum = 0, tot = 0;
  for (const k in w) {
    const wk = w[k as GoalieAttribute]!;
    sum += p.goalie[k as GoalieAttribute] * wk;
    tot += wk;
  }
  return tot ? sum / tot : 0;
}

/** Gewichtungen der Duelle – zentral, damit Kalibrierung an einer Stelle passiert. */
export const W = {
  breakout: { passing: 0.35, hockeyIQ: 0.25, skating: 0.2, puckHandling: 0.2 },
  forecheck: { workRate: 0.3, skating: 0.25, anticipation: 0.25, bodyChecking: 0.2 },
  carry: { skating: 0.35, puckHandling: 0.35, agility: 0.2, hockeyIQ: 0.1 },
  gap: { defPositioning: 0.4, skating: 0.25, anticipation: 0.25, stickChecking: 0.1 },
  battle: { strength: 0.3, workRate: 0.3, bodyChecking: 0.2, agility: 0.2 },
  cycle: { puckHandling: 0.3, passing: 0.3, hockeyIQ: 0.2, strength: 0.2 },
  dzone: { defPositioning: 0.35, stickChecking: 0.25, anticipation: 0.2, strength: 0.2 },
  shooting: { shotAccuracy: 0.5, shotPower: 0.3, composure: 0.2 },
  shootoutShooter: { puckHandling: 0.45, shotAccuracy: 0.35, composure: 0.2 },
  faceoff: { faceoffs: 0.8, strength: 0.1, hockeyIQ: 0.1 },
  goalie: { reflexes: 0.3, positioning: 0.3, glove: 0.1, blocker: 0.1, lowShots: 0.1, concentration: 0.1 },
} as const;

/** Gesamtstärke eines Spielers auf seiner Position (interne Skala 1–200). */
export function overall(p: Player): number {
  switch (p.position) {
    case 'G':
      return weightedGoalie(p, W.goalie);
    case 'C':
      return weightedSkater(p, {
        passing: 2, hockeyIQ: 2, puckHandling: 1.5, skating: 1.5, faceoffs: 1.2, shotAccuracy: 1.2,
        defPositioning: 1, anticipation: 1, workRate: 0.8, strength: 0.6, shotPower: 0.6, composure: 0.6,
      });
    case 'LW':
    case 'RW':
      return weightedSkater(p, {
        shotAccuracy: 2, shotPower: 1.2, skating: 1.8, puckHandling: 1.5, passing: 1.2, hockeyIQ: 1.2,
        workRate: 1, strength: 0.8, defPositioning: 0.6, anticipation: 0.8, composure: 0.6,
      });
    case 'LD':
    case 'RD':
      return weightedSkater(p, {
        defPositioning: 2, stickChecking: 1.2, shotBlocking: 1, strength: 1.2, skating: 1.4, passing: 1.4,
        hockeyIQ: 1.2, anticipation: 1.2, bodyChecking: 0.8, shotPower: 0.6, puckHandling: 0.8,
      });
  }
}

export const offenseRating = (p: Player) =>
  weightedSkater(p, { shotAccuracy: 2, shotPower: 1, passing: 1.5, puckHandling: 1.5, hockeyIQ: 1.2, skating: 1 });
export const defenseRating = (p: Player) =>
  weightedSkater(p, { defPositioning: 2, stickChecking: 1.2, anticipation: 1.2, shotBlocking: 1, workRate: 1, strength: 0.8 });

/** Interne Skala (1–200) → Anzeige (1–20) */
export const toDisplay = (v: number): number => Math.max(1, Math.min(20, Math.round(v / 10)));

export function ageOn(birthDate: string, date: string): number {
  const b = new Date(birthDate), d = new Date(date);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}
