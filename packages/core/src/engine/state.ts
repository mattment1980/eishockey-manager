/** Gemeinsame Typen und Hilfen der Match-Engine */
import type { Player, Tactics, CoachingRule, TraitId } from '@ehm/schema';
import type { MatchInput, TeamStats, UnitStats, Side, RuleReport } from './types.ts';

export type Quality = 'controlled' | 'dump' | 'rush' | 'turnover';
export type Next =
  | { k: 'faceoff'; defTeam: Side | null }
  | { k: 'breakout'; team: Side }
  | { k: 'neutral'; team: Side; rush: boolean }
  | { k: 'loose' }
  | { k: 'offense'; team: Side; q: Quality; n: number }
  | { k: 'end' };

export interface Penalty { team: Side; playerId: string; remaining: number; length: number }

export interface TeamState {
  side: Side;
  name: string;
  shortName: string;
  byId: Map<string, Player>;
  tactics: Tactics;
  plan: MatchInput['home']['plan'];
  fresh: Map<string, number>;
  curF: number;
  curD: number;
  shiftF: number;
  shiftD: number;
  toiF: number[];
  toiD: number[];
  goalieId: string;
  otUnit: number;
  otShift: number;
  allForwards: string[];
  allDefense: string[];
  // Coaching
  baseTactics: Tactics;
  rules: CoachingRule[];
  ruleState: Map<string, { active: boolean; pending: boolean; fired: boolean; report: RuleReport }>;
  coach: { slots: number; fastReaction: boolean; matchupSkill: number };
  goaliePulled: boolean;
  benched: Set<string>;
  shares: number[];
  matchupsOn: boolean;
  timeoutUsed: boolean;
  goalsAgainstAt: number[];
  // Chemie & Charakter
  traits: Map<string, Partial<Record<TraitId, number>>>;
  unitChem: Map<string, number>;
  unitLeader: Map<string, number>;
  penaltyFactor: number;
  leaderAnnounced: boolean;
  // Eingespieltheit mit den aktuell gespielten Systemen (Anteil) und Fitness je Spieler
  famMod: number;
  fitF: Map<string, number>;
}

export interface OnIce { F: string[]; D: string[] }

export const INFRACTIONS = [
  'Haken', 'Halten', 'Beinstellen', 'Stockschlag', 'Behinderung', 'Hoher Stock',
  'Crosscheck', 'Ellbogencheck', 'Unkorrekter Körperangriff', 'Halten des Stocks', 'Spielverzögerung',
];

export const emptyTeamStats = (): TeamStats => ({
  goals: 0, shotsOnGoal: 0, shotAttempts: 0, xg: 0, shotsBlocked: 0, shotsMissed: 0, blocks: 0, hits: 0,
  giveaways: 0, takeaways: 0, pim: 0, powerPlays: 0, powerPlayGoals: 0, shortHandedGoals: 0, faceoffsWon: 0,
  breakouts: 0, breakoutsClean: 0, entriesControlled: 0, entriesControlledSuccess: 0, dumpIns: 0,
  dumpInsRecovered: 0, ozoneTime: 0, shotsByPeriod: [],
});
export const emptyUnit = (): UnitStats => ({ toi: 0, corsiFor: 0, corsiAgainst: 0, xgFor: 0, xgAgainst: 0, goalsFor: 0, goalsAgainst: 0, shotsFor: 0, shotsAgainst: 0 });

export const sideInput = (input: MatchInput, s: Side) => (s === 0 ? input.home : input.away);

export function pickNext(toi: number[], shares: number[], current: number): number {
  const total = toi.reduce((s, x) => s + x, 0) + 1;
  let best = -1, bestDeficit = -Infinity;
  for (let i = 0; i < toi.length; i++) {
    if (i === current) continue;
    const deficit = shares[i] * total - toi[i];
    if (deficit > bestDeficit) { bestDeficit = deficit; best = i; }
  }
  return best < 0 ? current : best;
}
