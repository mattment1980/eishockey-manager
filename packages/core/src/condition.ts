import type { World, Player, Fixture } from '@ehm/schema';
import type { MatchResult } from './engine/types.ts';
import { hash01, daysBetween } from './calendar.ts';
import { toDisplay } from './ratings.ts';
import { recoveryFactor } from './training.ts';

/**
 * Zustand der Spieler zwischen den Spielen:
 * - Fitness (0–100) sinkt mit der Eiszeit und erholt sich an spielfreien Tagen.
 *   Ausdauer und ein guter Athletiktrainer (Assistenztrainer „Entwicklung“) beschleunigen die Erholung.
 * - Form (0–100, neutral 50) folgt den eigenen Leistungen der letzten Spiele und pendelt zurück zur Mitte.
 *   Beständige Spieler schwanken weniger.
 */

export const COND = {
  /** Fitnessverlust je Eiszeitminute (Feldspieler) */
  DRAIN_PER_MIN: 0.5,
  /** Fitnessverlust Torhüter je 60 Minuten */
  DRAIN_GOALIE: 9,
  /** Erholung je Tag als Anteil des Rückstands auf 100 (Basis + Ausdauer je Anzeigepunkt) */
  RECOVER_BASE: 0.2,
  RECOVER_STAMINA: 0.008,
  /** Rückkehr der Form zur Mitte je Spiel */
  FORM_REVERT: 0.1,
  /** Rückkehr zur Mitte je Spieltag ohne Einsatz */
  FORM_REVERT_IDLE: 0.04,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Erholung über `days` Tage (z. B. vor einem Spieltag) */
export function recoverFitness(world: World, days: number): World {
  if (days <= 0) return world;
  const bonus = new Map<string, number>();
  for (const s of world.staff) {
    if (!s.contract || s.role !== 'assistantCoach') continue;
    bonus.set(s.contract.clubId, Math.max(bonus.get(s.contract.clubId) ?? 0, (toDisplay(s.ratings.development) - 10) * 0.004));
  }
  // Trainingsbelastung der Woche: harte Wochen bremsen die Erholung, Regeneration beschleunigt sie
  const load = new Map(world.clubs.map((c) => [c.id, recoveryFactor(c.training)]));
  return {
    ...world,
    players: world.players.map((p) => {
      if (p.condition.fitness >= 100) return p;
      const r = (COND.RECOVER_BASE + toDisplay(p.skater.stamina) * COND.RECOVER_STAMINA + (bonus.get(p.contract?.clubId ?? '') ?? 0)) * (load.get(p.contract?.clubId ?? '') ?? 1);
      const deficit = (100 - p.condition.fitness) * Math.pow(1 - Math.min(0.6, r), days);
      return { ...p, condition: { ...p.condition, fitness: Math.min(100, Math.round((100 - deficit) * 10) / 10) } };
    }),
  };
}

/** Leistungsnote eines Spiels: grob −2 … +2 */
function performance(p: Player, s: MatchResult['playerStats'][number], won: boolean): number {
  if (p.position === 'G') {
    if (s.shotsAgainst < 8) return 0;
    return clamp((s.saves / s.shotsAgainst - 0.905) * 25, -2, 2) + (won ? 0.2 : -0.1);
  }
  const pts = s.goals + s.assists;
  return clamp(pts * 0.7 + s.plusMinus * 0.35 + (s.xg - 0.25) * 0.8 + (won ? 0.15 : -0.1) - (s.pim >= 4 ? 0.3 : 0) - 0.3, -2, 2);
}

/** Fitness und Form nach den Spielen eines Spieltags */
export function updateCondition(world: World, games: { fixture: Fixture; result: MatchResult }[]): World {
  const played = new Map<string, { stats: MatchResult['playerStats'][number]; won: boolean; fixtureId: string }>();
  const clubsPlaying = new Set<string>();
  for (const { fixture, result } of games) {
    clubsPlaying.add(fixture.home); clubsPlaying.add(fixture.away);
    for (const s of result.playerStats) {
      if (s.toi <= 0) continue;
      played.set(s.playerId, { stats: s, won: result.score[s.team] > result.score[1 - s.team], fixtureId: fixture.id });
    }
  }
  return {
    ...world,
    players: world.players.map((p) => {
      const g = played.get(p.id);
      if (!g) {
        if (!p.contract || !clubsPlaying.has(p.contract.clubId)) return p;
        const form = p.condition.form + (50 - p.condition.form) * COND.FORM_REVERT_IDLE;
        return { ...p, condition: { ...p.condition, form: Math.round(form * 10) / 10 } };
      }
      const minutes = g.stats.toi / 60;
      const drain = p.position === 'G' ? (COND.DRAIN_GOALIE * minutes) / 60 : minutes * COND.DRAIN_PER_MIN * (1.15 - toDisplay(p.skater.stamina) / 70);
      const fitness = clamp(p.condition.fitness - drain, 40, 100);
      const steady = 1.4 - p.hidden.consistency / 200; // 0,4 (sehr beständig) … 1,4 (launisch)
      const noise = (hash01(`${g.fixtureId}:${p.id}:form`) - 0.5) * 6 * steady;
      const perf = performance(p, g.stats, g.won) * 4 * (0.6 + steady * 0.4);
      const f0 = p.condition.form;
      const form = clamp(f0 + (50 - f0) * COND.FORM_REVERT + perf + noise, 10, 90);
      return { ...p, condition: { ...p.condition, fitness: Math.round(fitness * 10) / 10, form: Math.round(form * 10) / 10 } };
    }),
  };
}

/** Tage seit dem letzten Stand (für die Erholung vor einem Spieltag) */
export const restDays = (from: string, to: string) => Math.max(0, daysBetween(from, to));

export const formLabel = (f: number) => (f >= 68 ? 'Topform' : f >= 57 ? 'gut drauf' : f >= 43 ? 'normal' : f >= 32 ? 'durchwachsen' : 'Formtief');
export const fitnessLabel = (f: number) => (f >= 95 ? 'frisch' : f >= 88 ? 'gut' : f >= 80 ? 'müde' : 'erschöpft');
