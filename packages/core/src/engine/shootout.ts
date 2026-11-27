/** Penaltyschießen (Methoden der Spiel-Simulation, siehe match.ts) */
import { sigmoid, logit } from '../rng.ts';
import { weightedSkater, weightedGoalie, W } from '../ratings.ts';
import { C } from './constants.ts';
import type { Side, ShootoutAttempt } from './types.ts';
import type { MatchSim } from './match.ts';

export function shootout(this: MatchSim): { attempts: ShootoutAttempt[]; score: [number, number] } {
  this.tick('shootout', 'Penaltyschießen!');
  const shooters = this.teams.map((tm) => tm.plan.shootout);
  const goalies = this.teams.map((tm) => tm.goalieId);
  const sc: [number, number] = [0, 0];
  const attempts: ShootoutAttempt[] = [];
  const take = (side: Side, round: number) => {
    const tm = this.teams[side];
    const list = shooters[side];
    const shooter = list[round % list.length];
    const goalie = goalies[1 - side];
    const s = weightedSkater(tm.byId.get(shooter)!, W.shootoutShooter);
    const gpl = this.teams[1 - side].byId.get(goalie)!;
    const g = weightedGoalie(gpl, { reflexes: 0.35, positioning: 0.25, agility: 0.2, composure: 0.2 });
    const scored = this.rng.chance(sigmoid(logit(C.SHOOTOUT_BASE) + 0.4 * ((s - g) / 20)));
    if (scored) sc[side]++;
    attempts.push({ team: side, shooterId: shooter, goalieId: goalie, scored });
    this.tick('shootout', `${this.name(side, shooter)} (${tm.shortName}) ${scored ? 'trifft' : 'scheitert an ' + this.name((1 - side) as Side, goalie)} – ${sc[0]}:${sc[1]}`, side);
  };
  const R = C.SHOOTOUT_ROUNDS;
  for (let r = 0; r < R; r++) {
    take(0, r);
    if (sc[0] > sc[1] + (R - r) || sc[1] > sc[0] + (R - r - 1)) break;
    take(1, r);
    const left = R - r - 1;
    if (sc[0] > sc[1] + left || sc[1] > sc[0] + left) break;
  }
  let r = R;
  while (sc[0] === sc[1] && r < 40) {
    take(0, r); take(1, r); r++;
  }
  const w: Side = sc[0] > sc[1] ? 0 : 1;
  this.tick('shootout', `${this.teams[w].name} gewinnt das Penaltyschießen ${sc[0]}:${sc[1]}.`, w);
  return { attempts, score: sc };
}
