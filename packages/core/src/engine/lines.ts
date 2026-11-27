/** Spieler auf dem Eis: Strafen-Situation, Reihen, Wechsel, Matchups (Methoden der Spiel-Simulation, siehe match.ts) */
import { clamp } from '../rng.ts';
import { C } from './constants.ts';
import type { Side } from './types.ts';
import { pickNext } from './state.ts';
import type { Penalty, TeamState, OnIce } from './state.ts';
import type { MatchSim } from './match.ts';

export function penCount(this: MatchSim, side: Side): number {
  return Math.min(2, this.penalties.filter((p) => p.team === side).length);
}

export function skaters(this: MatchSim, side: Side): number {
  const own = this.penCount(side), opp = this.penCount((1 - side) as Side);
  const extra = this.teams[side].goaliePulled ? 1 : 0;
  if (this.ot3v3) return Math.min(6, 3 + Math.max(0, opp - own) + extra);
  return Math.max(3, 5 - own) + extra;
}

/** Spielstärke ohne gezogenen Torhüter (für Situationen wie Über-/Unterzahl) */
export function penaltySituation(this: MatchSim, side: Side): 'EV' | 'PP' | 'PK' {
  const own = this.penCount(side), opp = this.penCount((1 - side) as Side);
  return own === opp ? 'EV' : own < opp ? 'PP' : 'PK';
}

export function isEvenStrength5(this: MatchSim): boolean {
  return !this.ot3v3 && this.skaters(0) === 5 && this.skaters(1) === 5 && !this.teams[0].goaliePulled && !this.teams[1].goaliePulled;
}

export function strengthLabel(this: MatchSim, side: Side): string {
  return `${this.skaters(side)}v${this.skaters((1 - side) as Side)}`;
}

export function boxed(this: MatchSim): Set<string> {
  return new Set(this.penalties.map((p) => p.playerId));
}

export function fill(this: MatchSim, preferred: string[], pool: string[], count: number, boxed: Set<string>, taken: Set<string>): string[] {
  const out: string[] = [];
  for (const id of [...preferred, ...pool]) {
    if (out.length >= count) break;
    if (boxed.has(id) || taken.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  out.forEach((id) => taken.add(id));
  return out;
}

export function onIce(this: MatchSim, side: Side): OnIce {
  const tm = this.teams[side];
  const plan = tm.plan;
  const n = this.skaters(side);
  const opp = this.skaters((1 - side) as Side);
  const boxed = new Set([...this.boxed(), ...tm.benched]);
  const taken = new Set<string>();
  let fPref: string[], dPref: string[], nF: number, nD: number;

  const oppPen = this.penalties.filter((p) => p.team !== side);
  const ownPen = this.penalties.filter((p) => p.team === side);
  const sinceStart = (list: Penalty[]) => (list.length ? Math.max(...list.map((p) => p.length - p.remaining)) : 0);

  if (this.ot3v3 && n === 3 && opp === 3) {
    const u = tm.otUnit % 3;
    const line = plan.forwardLines[u];
    fPref = [line[1], line[0], line[2]];
    dPref = [plan.defensePairs[u][0], plan.defensePairs[u][1]];
    nF = 2; nD = 1;
  } else if (n > opp) {
    const unit = plan.powerPlay[sinceStart(oppPen) < 70 ? 0 : 1];
    fPref = unit.forwards; dPref = unit.defense;
    nD = 2; nF = n - 2;
  } else if (n < opp) {
    const unit = plan.penaltyKill[sinceStart(ownPen) < 60 ? 0 : 1];
    fPref = unit.forwards; dPref = unit.defense;
    nD = 2; nF = n - 2;
  } else {
    const line = plan.forwardLines[tm.curF];
    fPref = [line[1], line[0], line[2]];
    dPref = plan.defensePairs[tm.curD];
    nD = 2; nF = n - 2;
  }
  const F = this.fill(fPref, tm.allForwards, nF, boxed, taken);
  const D = this.fill(dPref, tm.allDefense, nD, boxed, taken);
  return { F, D };
}

export function lineChanges(this: MatchSim, stoppage: boolean) {
  // Gast wechselt zuerst, Heimteam hat den letzten Wechsel
  for (const tm of [this.teams[1], this.teams[0]]) {
    if (this.ot3v3) {
      if (tm.otShift >= 40 && (stoppage || this.rng.chance(C.ON_THE_FLY_CHANCE))) {
        tm.otUnit++; tm.otShift = 0;
      }
      continue;
    }
    const tempoFactor = tm.tactics.tempo === 'high' ? 0.9 : tm.tactics.tempo === 'slow' ? 1.1 : 1;
    const canChange = stoppage || this.rng.chance(C.ON_THE_FLY_CHANCE);
    if (tm.shiftF >= C.SHIFT_F * tempoFactor && canChange) {
      tm.curF = pickNext(tm.toiF, tm.shares, tm.curF);
      tm.shiftF = 0;
    }
    if (tm.shiftD >= C.SHIFT_D * tempoFactor && canChange) {
      tm.curD = pickNext(tm.toiD, tm.plan.defenseShares, tm.curD);
      tm.shiftD = 0;
    }
    this.applyMatchups(tm, stoppage);
  }
}

/** Matchup-Anweisungen umsetzen (nur 5-gegen-5): Heimteam bei Unterbrechungen im Vorteil. */
export function applyMatchups(this: MatchSim, tm: TeamState, stoppage: boolean) {
  if (!tm.matchupsOn || this.ot3v3 || !this.isEvenStrength5()) return;
  const opp = this.teams[1 - tm.side];
  for (const m of tm.plan.matchups ?? []) {
    if (opp.curF !== m.vs) continue;
    const already = m.unit === 'line' ? tm.curF === m.mine : tm.curD === m.mine;
    if (already) continue;
    const ids = m.unit === 'line' ? tm.plan.forwardLines[m.mine] : tm.plan.defensePairs[m.mine];
    if (!ids) continue;
    const rested = ids.reduce((s, id) => s + (tm.fresh.get(id) ?? 100), 0) / ids.length;
    if (rested < 60) continue;
    const base = stoppage ? (tm.side === 0 ? C.MATCHUP_HOME : C.MATCHUP_AWAY) : C.MATCHUP_ON_THE_FLY;
    if (!this.rng.chance(clamp(base + tm.coach.matchupSkill, 0.05, 0.97))) continue;
    if (m.unit === 'line') { tm.curF = m.mine; tm.shiftF = 0; } else { tm.curD = m.mine; tm.shiftD = 0; }
  }
}
