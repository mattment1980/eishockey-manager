/** Spielphasen: Bully, Spielaufbau, neutrale Zone, freie Scheibe, Angriffszone (Methoden der Spiel-Simulation, siehe match.ts) */
import { sigmoid, logit } from '../rng.ts';
import { weightedSkater, W } from '../ratings.ts';
import { C } from './constants.ts';
import type { Side } from './types.ts';
import type { Quality, Next, OnIce } from './state.ts';
import type { MatchSim } from './match.ts';

export function step(this: MatchSim, next: Next): Next {
  switch (next.k) {
    case 'faceoff': return this.faceoff(next.defTeam);
    case 'breakout': return this.breakout(next.team);
    case 'neutral': return this.neutral(next.team, next.rush);
    case 'loose': return this.loose();
    case 'offense': return this.offense(next.team, next.q, next.n);
    case 'end': return next;
  }
}

export function faceoff(this: MatchSim, defTeam: Side | null): Next {
  if (!this.advance(this.dt(C.T_FACEOFF))) return { k: 'end' };
  const o0 = this.onIce(0), o1 = this.onIce(1);
  const taker = (side: Side, o: OnIce) => {
    const pool = o.F.length ? o.F : o.D;
    return pool.reduce((best, id) => (this.teams[side].byId.get(id)!.skater.faceoffs > this.teams[side].byId.get(best)!.skater.faceoffs ? id : best), pool[0]);
  };
  const c0 = taker(0, o0), c1 = taker(1, o1);
  const r0 = weightedSkater(this.teams[0].byId.get(c0)!, W.faceoff);
  const r1 = weightedSkater(this.teams[1].byId.get(c1)!, W.faceoff);
  const p0 = sigmoid(0.5 * ((r0 - r1) / 20) + this.home);
  const w: Side = this.rng.chance(p0) ? 0 : 1;
  const winner = w === 0 ? c0 : c1, loser = w === 0 ? c1 : c0;
  this.ps.get(winner)!.faceoffsWon++;
  this.ps.get(loser)!.faceoffsLost++;
  this.ts[w].faceoffsWon++;
  this.emit('faceoff', w, { winner, loser });
  if (defTeam === null) return { k: 'neutral', team: w, rush: false };
  if (w === defTeam) return { k: 'breakout', team: w };
  return { k: 'offense', team: w, q: 'controlled', n: 0 };
}

export function breakout(this: MatchSim, a: Side): Next {
  const b = (1 - a) as Side;
  if (!this.advance(this.dt(C.T_BREAKOUT))) return { k: 'end' };
  const oa = this.onIce(a), ob = this.onIce(b);
  const ta = this.teams[a].tactics, tb = this.teams[b].tactics;
  const carriers = [...oa.D, ...oa.F.slice(0, 1)];
  let att = this.group(a, carriers, W.breakout);
  if (ta.breakout === 'carry') att = att * 0.6 + this.group(a, oa.D, W.carry) * 0.4;
  const def = this.group(b, ob.F, W.forecheck);
  const aggressive = tb.forecheck === '2-1-2' || tb.forecheckIntensity === 'aggressive';
  let mod = 0;
  mod -= ({ '1-2-2': 0, '2-1-2': 0.35, leftWingLock: -0.15, '1-3-1': -0.3 } as const)[tb.forecheck];
  mod -= ({ passive: -0.25, normal: 0, aggressive: 0.2 } as const)[tb.forecheckIntensity];
  mod += ({ short: 0, d2d: aggressive ? 0.2 : 0, boards: 0.3, stretch: -0.25, carry: 0 } as const)[ta.breakout];
  mod += C.ADV_BREAKOUT * this.adv(a);
  this.ts[a].breakouts++;
  this.penaltyCheck(b, ob, 0.8);
  if (this.penalties.length && this.lastPenaltyNow) return this.afterPenalty();
  const p = this.duel(a, att, def, C.BREAKOUT_BASE, mod);
  if (this.rng.chance(p)) {
    if (ta.breakout === 'boards' && this.rng.chance(0.5)) {
      this.emit('breakout', a, {}, 'chip');
      return { k: 'loose' };
    }
    this.ts[a].breakoutsClean++;
    this.emit('breakout', a, {}, 'clean');
    if (this.teams[b].goaliePulled && this.rng.chance(C.EMPTY_NET_ATTEMPT)) return this.emptyNetShot(a);
    const rushChance = (ta.breakout === 'stretch' ? 0.35 : 0.08) + (aggressive ? 0.12 : 0);
    if (this.rng.chance(rushChance)) {
      this.emit('entry', a, {}, 'rush');
      return { k: 'offense', team: a, q: 'rush', n: 0 };
    }
    return { k: 'neutral', team: a, rush: false };
  }
  const split = ta.breakout === 'boards' ? { chip: 0.65, turnover: 0.2 } : ta.breakout === 'stretch' ? { chip: 0.35, turnover: 0.5 } : C.BREAKOUT_FAIL;
  const r = this.rng.next();
  if (r < split.chip) {
    this.emit('breakout', a, {}, 'chip');
    return { k: 'loose' };
  }
  if (r < split.chip + split.turnover) {
    const giver = this.rng.pick(carriers);
    const taker = this.pickWeighted(b, ob.F, (pl) => pl.skater.stickChecking + pl.skater.workRate);
    this.ps.get(giver)!.giveaways++; this.ts[a].giveaways++;
    this.ps.get(taker)!.takeaways++; this.ts[b].takeaways++;
    this.emit('breakout', a, { giver, taker }, 'turnover');
    return { k: 'offense', team: b, q: 'turnover', n: 0 };
  }
  this.emit('breakout', a, {}, 'icing');
  return { k: 'faceoff', defTeam: a };
}

export function neutral(this: MatchSim, a: Side, rush: boolean): Next {
  const b = (1 - a) as Side;
  if (!this.advance(this.dt(C.T_NEUTRAL))) return { k: 'end' };
  if (rush) return { k: 'offense', team: a, q: 'rush', n: 0 };
  const oa = this.onIce(a), ob = this.onIce(b);
  const ta = this.teams[a].tactics, tb = this.teams[b].tactics;
  const carry = this.group(a, oa.F, W.carry);
  let gap = this.group(b, ob.D, W.gap);
  let gapMod = ({ tight: 0.3, medium: 0, loose: -0.3 } as const)[tb.gap];
  if (tb.forecheck === '1-3-1') gapMod += 0.25;
  if (tb.forecheck === 'leftWingLock') gapMod += 0.15;
  const relative = sigmoid(C.K * ((carry - gap) / 20) - gapMod);
  const pControlled = ta.entry === 'controlled' ? 0.8 : ta.entry === 'dump' ? 0.2 : 0.3 + 0.5 * relative;
  if (this.rng.chance(pControlled)) {
    this.ts[a].entriesControlled++;
    const p = this.duel(a, carry, gap, C.ENTRY_CONTROLLED_BASE, -gapMod + C.ADV_ENTRY * this.adv(a));
    if (this.rng.chance(p)) {
      this.ts[a].entriesControlledSuccess++;
      const beaten = tb.gap === 'tight' && this.rng.chance(0.25);
      this.emit('entry', a, {}, beaten ? 'rush' : 'controlled');
      return { k: 'offense', team: a, q: beaten ? 'rush' : 'controlled', n: 0 };
    }
    const r = this.rng.next();
    if (r < 0.55) {
      const taker = this.pickWeighted(b, ob.D, (pl) => pl.skater.stickChecking + pl.skater.anticipation);
      const giver = this.rng.pick(oa.F);
      this.ps.get(giver)!.giveaways++; this.ts[a].giveaways++;
      this.ps.get(taker)!.takeaways++; this.ts[b].takeaways++;
      this.emit('entry', a, { giver, taker }, 'turnover');
      return { k: 'neutral', team: b, rush: this.rng.chance(0.2) };
    }
    if (r < 0.8) {
      this.emit('entry', a, {}, 'offside');
      return { k: 'faceoff', defTeam: null };
    }
  }
  // Dump & Chase
  this.ts[a].dumpIns++;
  const battleA = this.group(a, oa.F, W.battle);
  const retrieveB = this.group(b, ob.D, { ...W.battle, hockeyIQ: 0.2, skating: 0.2 });
  const aggr = ta.forecheckIntensity === 'aggressive' ? 0.2 : ta.forecheckIntensity === 'passive' ? -0.2 : 0;
  this.penaltyCheck(a, oa, 0.6);
  if (this.lastPenaltyNow) return this.afterPenalty();
  if (this.rng.chance(this.duel(a, battleA, retrieveB, C.DUMP_RECOVER_BASE, aggr + C.ADV_ENTRY * this.adv(a)))) {
    this.ts[a].dumpInsRecovered++;
    this.maybeHit(a, oa);
    this.emit('entry', a, {}, 'dumpRecovered');
    return { k: 'offense', team: a, q: 'dump', n: 0 };
  }
  this.emit('entry', a, {}, 'dumpLost');
  return { k: 'breakout', team: b };
}

export function loose(this: MatchSim): Next {
  if (!this.advance(this.dt(C.T_NEUTRAL))) return { k: 'end' };
  const o0 = this.onIce(0), o1 = this.onIce(1);
  const p = this.duel(0, this.group(0, this.all(o0), W.battle), this.group(1, this.all(o1), W.battle), 0);
  const w: Side = this.rng.chance(p) ? 0 : 1;
  this.maybeHit(w, w === 0 ? o0 : o1);
  return { k: 'neutral', team: w, rush: false };
}

export function offense(this: MatchSim, a: Side, q: Quality, n: number): Next {
  const b = (1 - a) as Side;
  const dt = this.dt(C.T_OFFENSE);
  if (!this.advance(dt)) return { k: 'end' };
  this.ts[a].ozoneTime += dt;
  const oa = this.onIce(a), ob = this.onIce(b);
  const ta = this.teams[a].tactics, tb = this.teams[b].tactics;

  // Konter / Puckverlust des Gegners → schneller Abschluss
  if ((q === 'rush' || q === 'turnover') && n === 0 && this.rng.chance(0.7)) {
    return this.shot(a, q);
  }
  this.penaltyCheck(b, ob, 1);
  if (this.lastPenaltyNow) return this.afterPenalty();

  const cycle = this.group(a, this.all(oa), W.cycle);
  const dz = this.group(b, this.all(ob), W.dzone);
  const dzMod = ({ zone: 0, man: 0.1, swarm: 0.2 } as const)[tb.defensiveZone];
  const tempo = ta.tempo === 'high' ? 1.12 : ta.tempo === 'slow' ? 0.88 : 1;
  const ozMult = ({ cycle: 0.95, point: 1.25, slot: 1.0, netFront: 1.05 } as const)[ta.offensiveZone];
  const adv = this.adv(a);
  const open = this.ot3v3 ? C.OT_OPEN_ICE : 1;
  const scoreFx = this.scoreEffect(a);
  const pShotBase = C.SHOT_PER_ACTION * tempo * ozMult * (q === 'dump' && n === 0 ? 0.6 : 1) * (1 + C.ADV_SHOT_RATE * adv) * open * scoreFx;
  let stShot = 1, stTurn = 0;
  if (adv > 0) {
    const pp = this.teams[a].plan.specialTeams?.ppFormation ?? 'umbrella';
    const pk = this.teams[b].plan.specialTeams?.pkFormation ?? 'box';
    if (pp === 'umbrella') stShot *= 1.12;
    if (pp === 'overload') stTurn -= 0.15;
    if (pp === 'spread') stTurn += 0.1;
    if (pk === 'aggressive') stTurn += 0.3;
    if (pk === 'box') stShot *= 0.95;
  }
  const pTurn = sigmoid(C.K * ((dz - cycle) / 20) + logit(C.TURNOVER_BASE) + dzMod + stTurn + (ta.offensiveZone === 'slot' ? 0.15 : 0) - (a === 0 ? this.home : -this.home) - C.DAY_FORM_POSSESSION * (this.dayForm[a] - this.dayForm[b]) - C.ADV_TURNOVER * adv);
  const pShot = pShotBase * stShot;
  const r = this.rng.next();
  if (r < C.STOPPAGE_PER_ACTION) return { k: 'faceoff', defTeam: b };
  if (r < C.STOPPAGE_PER_ACTION + pShot) return this.shot(a, q === 'dump' ? 'controlled' : q);
  if (r < C.STOPPAGE_PER_ACTION + pShot + pTurn * (1 - pShot)) {
    const giver = this.rng.pick(this.all(oa));
    const taker = this.pickWeighted(b, this.all(ob), (pl) => pl.skater.stickChecking + pl.skater.defPositioning);
    this.ps.get(giver)!.giveaways++; this.ts[a].giveaways++;
    this.ps.get(taker)!.takeaways++; this.ts[b].takeaways++;
    this.maybeHit(b, ob);
    this.emit('turnover', a, { giver, taker });
    // aggressive Unterzahl: Chance auf Konter in Unterzahl
    if (adv > 0 && this.teams[b].plan.specialTeams?.pkFormation === 'aggressive' && this.rng.chance(0.2)) {
      return { k: 'offense', team: b, q: 'rush', n: 0 };
    }
    return { k: 'breakout', team: b };
  }
  return { k: 'offense', team: a, q: 'controlled', n: n + 1 };
}
