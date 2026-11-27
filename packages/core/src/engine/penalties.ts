/** Strafen und Checks (Methoden der Spiel-Simulation, siehe match.ts) */
import { C } from './constants.ts';
import type { Side } from './types.ts';
import { INFRACTIONS } from './state.ts';
import type { Next, OnIce } from './state.ts';
import type { MatchSim } from './match.ts';

/** Prüft, ob die Mannschaft `side` in diesem Zweikampf eine Strafe kassiert. */
export function penaltyCheck(this: MatchSim, side: Side, on: OnIce, weight: number) {
  this.lastPenaltyNow = false;
  const tm = this.teams[side];
  const ids = this.all(on);
  if (!ids.length) return;
  const phys = ({ fair: 0.7, normal: 1, hard: 1.45 } as const)[tm.tactics.physicality];
  const offender = this.pickWeighted(side, ids, (p) => (220 - p.skater.discipline) * (0.5 + p.skater.bodyChecking / 200));
  const p = tm.byId.get(offender)!;
  const disc = (1 + (100 - p.skater.discipline) / 120) * tm.penaltyFactor * (1 + 0.35 * (tm.traits.get(offender)?.hitzkopf ?? 0));
  const fatigue = 1 + (100 - (tm.fresh.get(offender) ?? 100)) / 250;
  if (!this.rng.chance(C.PENALTY_PER_DUEL * weight * phys * disc * fatigue)) return;
  const opp = (1 - side) as Side;
  const wasPP = this.skaters(opp) > this.skaters(side);
  this.penalties.push({ team: side, playerId: offender, remaining: C.PENALTY_LENGTH, length: C.PENALTY_LENGTH });
  this.ps.get(offender)!.pim += 2;
  this.ts[side].pim += 2;
  if (!wasPP || this.skaters(opp) > this.skaters(side)) this.ts[opp].powerPlays++;
  const inf = this.rng.pick(INFRACTIONS);
  this.emit('penalty', side, { player: offender }, inf);
  this.tick('penalty', `Strafe: ${this.name(side, offender)} (${tm.shortName}) – 2 Minuten wegen ${inf}`, side);
  this.lastPenaltyNow = true;
  this.penaltySide = side;
}


export function afterPenalty(this: MatchSim): Next {
  this.lastPenaltyNow = false;
  return { k: 'faceoff', defTeam: this.penaltySide };
}

export function maybeHit(this: MatchSim, side: Side, on: OnIce) {
  if (!this.rng.chance(0.35)) return;
  const ids = this.all(on);
  if (!ids.length) return;
  const hitter = this.pickWeighted(side, ids, (p) => p.skater.bodyChecking ** 2 / 100);
  this.ps.get(hitter)!.hits++;
  this.ts[side].hits++;
  this.emit('hit', side, { hitter });
}
