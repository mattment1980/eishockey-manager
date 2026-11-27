/** Schüsse und Tore: Schussabgabe, Torhüter, Abpraller, leeres Tor, Statistik (Methoden der Spiel-Simulation, siehe match.ts) */
import { sigmoid, logit, clamp } from '../rng.ts';
import { weightedSkater, weightedGoalie, W, fitnessFactor, goalieFormFactor } from '../ratings.ts';
import { C } from './constants.ts';
import type { Side, ShotLocation } from './types.ts';
import type { Quality, Next } from './state.ts';
import type { MatchSim } from './match.ts';

export function shot(this: MatchSim, a: Side, q: Quality | 'reboundQ'): Next {
  const b = (1 - a) as Side;
  const oa = this.onIce(a), ob = this.onIce(b);
  const ta = this.teams[a].tactics, tb = this.teams[b].tactics;
  const tmA = this.teams[a], tmB = this.teams[b];
  const rebound = q === 'reboundQ';

  // Schütze
  const cand = this.all(oa);
  const shooter = this.rng.weighted(cand, cand.map((id) => {
    const p = tmA.byId.get(id)!;
    const isD = p.position === 'LD' || p.position === 'RD';
    let w = Math.pow(weightedSkater(p, W.shooting) / 100, 2) * (isD ? 0.55 : 1);
    if (isD && ta.offensiveZone === 'point') w *= 1.6;
    if (rebound && isD) w *= 0.3;
    if (tmA.traits.get(id)?.egoist) w *= 1 + 0.3 * tmA.traits.get(id)!.egoist!;
    return w;
  }));
  const sp = tmA.byId.get(shooter)!;
  const shooterIsD = sp.position === 'LD' || sp.position === 'RD';

  // Ort
  let loc: ShotLocation;
  if (rebound) loc = 'rebound';
  else if (shooterIsD) loc = this.rng.chance(0.85) ? 'point' : 'circle';
  else {
    const dist = ({
      cycle: [0.32, 0.45, 0.23], point: [0.25, 0.4, 0.35], slot: [0.42, 0.4, 0.18], netFront: [0.42, 0.38, 0.2],
    } as const)[ta.offensiveZone];
    let slot: number = dist[0];
    let point: number = dist[2];
    if (q === 'rush' || q === 'turnover') slot += 0.15;
    if (tb.defensiveZone === 'man') slot += 0.04;
    if (this.adv(a) > 0) {
      const pp = tmA.plan.specialTeams?.ppFormation ?? 'umbrella';
      const pk = tmB.plan.specialTeams?.pkFormation ?? 'box';
      if (pp === 'umbrella') point += 0.08;
      if (pp === 'overload') slot += 0.06;
      if (pk === 'box') { slot *= 0.8; point += 0.05; }
      if (pk === 'diamond') { point *= 0.7; slot *= 1.12; }
    }
    loc = this.rng.weighted(['slot', 'circle', 'point'] as ShotLocation[], [slot, dist[1], point]);
  }

  let qs = loc === 'slot' ? C.Q_SLOT : loc === 'circle' ? C.Q_CIRCLE : loc === 'point' ? C.Q_POINT : C.Q_REBOUND;
  if (q === 'rush') qs += C.Q_RUSH_BONUS;
  if (q === 'turnover') qs += C.Q_TURNOVER_BONUS;
  qs *= 1 + C.ADV_QUALITY * Math.max(0, this.adv(a));
  if (this.ot3v3) qs *= C.OT_OPEN_ICE;
  if (loc === 'point' && ta.offensiveZone === 'netFront') qs += 0.012;
  if (loc === 'point' && tb.defensiveZone === 'swarm') qs += 0.01;
  if (this.adv(a) > 0) {
    if ((tmA.plan.specialTeams?.ppFormation ?? 'umbrella') === 'spread') qs *= 1.1;
    if ((tmB.plan.specialTeams?.pkFormation ?? 'box') === 'box') qs *= 0.93;
    if ((tmB.plan.specialTeams?.pkFormation ?? 'box') === 'aggressive') qs *= 1.12;
  }
  // Passqualität
  const passers = cand.filter((id) => id !== shooter);
  const passer = passers.length ? passers.reduce((best, id) => (tmA.byId.get(id)!.skater.passing > tmA.byId.get(best)!.skater.passing ? id : best), passers[0]) : shooter;
  if (!rebound) {
    const pq = sigmoid(C.K * ((weightedSkater(tmA.byId.get(passer)!, { passing: 0.6, hockeyIQ: 0.4 }) * this.mult(a, passer) - this.group(b, this.all(ob), W.dzone)) / 20));
    qs *= 0.8 + 0.4 * pq;
  }

  // Block / Fehlschuss
  const blockSkill = this.group(b, this.all(ob), { shotBlocking: 0.6, defPositioning: 0.4 });
  const pBlock = clamp(C.BLOCK[loc] * (0.7 + 0.6 * (blockSkill / 200)) * (tb.defensiveZone === 'swarm' ? 0.85 : 1), 0, 0.6);
  const acc = sp.skater.shotAccuracy * this.mult(a, shooter);
  const pMiss = clamp(C.MISS_BASE - 0.14 * ((acc - 100) / 50), 0.15, 0.55);
  const xg = qs * (1 - pBlock) * (1 - pMiss);

  const st = this.ps.get(shooter)!;
  st.shotAttempts++;
  st.xg += xg;
  this.ts[a].shotAttempts++;
  this.ts[a].xg += xg;
  this.unitShotAttempt(a, xg);
  const blocked = this.rng.chance(pBlock);
  if (blocked) {
    const blocker = this.pickWeighted(b, this.all(ob), (pl) => pl.skater.shotBlocking * (pl.position === 'LD' || pl.position === 'RD' ? 1.5 : 1));
    st.shotsBlockedAgainst++;
    this.ps.get(blocker)!.blocks++;
    this.ts[a].shotsBlocked++;
    this.ts[b].blocks++;
    this.emit('shot', a, { shooter, blocker }, 'blocked', xg, loc);
    return this.rng.chance(0.4) ? { k: 'offense', team: a, q: 'controlled', n: 1 } : { k: 'breakout', team: b };
  }
  if (this.rng.chance(pMiss)) {
    st.shotsMissed++;
    this.ts[a].shotsMissed++;
    this.emit('shot', a, { shooter }, 'missed', xg, loc);
    return this.rng.chance(0.45) ? { k: 'offense', team: a, q: 'controlled', n: 1 } : { k: 'breakout', team: b };
  }

  // leeres Tor
  if (tmB.goaliePulled) {
    st.shotsOnGoal++;
    this.ts[a].shotsOnGoal++;
    this.ts[a].shotsByPeriod[this.period - 1]++;
    this.unitShotOnGoal(a);
    if (this.rng.chance(0.95)) {
      this.emptyNet[a]++;
      this.goal(a, shooter, cand, loc, xg, true);
      return { k: 'faceoff', defTeam: null };
    }
    return { k: 'breakout', team: b };
  }

  // Schuss aufs Tor
  const goalie = tmB.goalieId;
  const gp = tmB.byId.get(goalie)!;
  const gr = weightedGoalie(gp, W.goalie) * fitnessFactor(gp.condition.fitness) * goalieFormFactor(gp.condition.form);
  const shootR = weightedSkater(sp, W.shooting) * this.mult(a, shooter);
  const homeAdj = a === 0 ? this.home : -this.home;
  const pGoal = sigmoid(logit(qs) + C.K_SHOT * ((shootR - gr) / 20) + homeAdj + this.dayForm[a] - this.goalieForm[b]);
  st.shotsOnGoal++;
  this.ts[a].shotsOnGoal++;
  this.ts[a].shotsByPeriod[this.period - 1]++;
  const gs = this.ps.get(goalie)!;
  gs.shotsAgainst++;
  this.unitShotOnGoal(a);
  this.ruleShot(a, false);
  if (this.rng.chance(pGoal)) {
    gs.goalsAgainst++;
    this.goal(a, shooter, cand, loc, xg);
    return { k: 'faceoff', defTeam: null };
  }
  gs.saves++;
  this.emit('shot', a, { shooter, goalie }, 'saved', xg, loc);
  if (qs >= 0.15 && this.rng.chance(0.6)) {
    this.tick('save', `Starke Parade von ${this.name(b, goalie)} gegen ${this.name(a, shooter)}!`, b);
  }
  const rc = gp.goalie?.reboundControl ?? 80;
  const pReb = clamp(C.REBOUND_BASE - 0.08 * ((rc - 100) / 50), 0.06, 0.34);
  if (!rebound && this.rng.chance(pReb)) {
    const pA = this.duel(a, this.group(a, oa.F, W.battle), this.group(b, ob.D, W.battle), -0.3);
    if (this.rng.chance(pA)) {
      if (!this.advance(1)) return { k: 'end' };
      return this.shot(a, 'reboundQ');
    }
    return { k: 'breakout', team: b };
  }
  if (this.rng.chance(C.FREEZE)) return { k: 'faceoff', defTeam: b };
  return { k: 'breakout', team: b };
}

/** Distanzschuss aufs leere Tor nach Befreiung */
export function emptyNetShot(this: MatchSim, a: Side): Next {
  const b = (1 - a) as Side;
  const oa = this.onIce(a);
  const cand = this.all(oa);
  const shooter = this.pickWeighted(a, cand, (p) => p.skater.shotAccuracy);
  const st = this.ps.get(shooter)!;
  st.shotAttempts++;
  this.ts[a].shotAttempts++;
  const xg = 0.45;
  this.ts[a].xg += xg;
  st.xg += xg;
  if (this.rng.chance(0.5)) {
    st.shotsOnGoal++;
    this.ts[a].shotsOnGoal++;
    this.ts[a].shotsByPeriod[this.period - 1]++;
    this.emptyNet[a]++;
    this.goal(a, shooter, cand, 'point', xg, true);
    return { k: 'faceoff', defTeam: null };
  }
  st.shotsMissed++;
  this.ts[a].shotsMissed++;
  this.emit('shot', a, { shooter }, 'missed', xg, 'point');
  return { k: 'faceoff', defTeam: a };
}

export function goal(this: MatchSim, a: Side, scorer: string, onIce: string[], loc: ShotLocation, xg: number, emptyNet = false) {
  const b = (1 - a) as Side;
  const tmA = this.teams[a];
  this.teams[b].goalsAgainstAt.push(this.t);
  this.ruleShot(a, true);
  if (this.isEvenStrength5()) this.matrix[a === 0 ? 'goalsHome' : 'goalsAway'][this.teams[0].curF][this.teams[1].curF]++;
  const nA = this.skaters(a), nB = this.skaters(b);
  this.score[a]++;
  this.periodScores[this.period - 1][a]++;
  this.goalThisPeriod = true;
  this.ts[a].goals++;
  const st = this.ps.get(scorer)!;
  st.goals++;
  // Vorlagen
  const mates = onIce.filter((id) => id !== scorer);
  const assists: string[] = [];
  if (mates.length && this.rng.chance(loc === 'rebound' ? 0.94 : 0.92)) {
    const a1 = this.rng.weighted(mates, mates.map((id) => Math.pow(tmA.byId.get(id)!.skater.passing / 100, 2)));
    assists.push(a1);
    const rest = mates.filter((id) => id !== a1);
    if (rest.length && this.rng.chance(0.78)) {
      assists.push(this.rng.weighted(rest, rest.map((id) => tmA.byId.get(id)!.skater.passing / 100)));
    }
  }
  for (const id of assists) this.ps.get(id)!.assists++;
  // Plus/Minus (kein +/- bei Überzahltoren)
  if (nA <= nB) {
    for (const id of onIce) this.ps.get(id)!.plusMinus++;
    for (const id of this.all(this.onIce(b))) this.ps.get(id)!.plusMinus--;
  }
  let kind = '';
  const sit = this.penaltySituation(a);
  if (sit === 'PP') {
    kind = 'PP';
    this.ts[a].powerPlayGoals++;
    // kleinste Reststrafe des Gegners endet
    const opp = this.penalties.filter((p) => p.team === b).sort((x, y) => x.remaining - y.remaining)[0];
    if (opp) {
      this.penalties = this.penalties.filter((p) => p !== opp);
      this.emit('penaltyEnd', b, { player: opp.playerId });
    }
  } else if (sit === 'PK') {
    kind = 'SH';
    this.ts[a].shortHandedGoals++;
  }
  // Reihenstatistik
  if (this.isEvenStrength5() || (nA === nB && !this.ot3v3)) {
    const la = this.ls[a], lb = this.ls[b];
    la.lines[this.teams[a].curF].goalsFor++; la.pairs[this.teams[a].curD].goalsFor++;
    lb.lines[this.teams[b].curF].goalsAgainst++; lb.pairs[this.teams[b].curD].goalsAgainst++;
  }
  this.emit('goal', a, { scorer, assist1: assists[0] ?? '', assist2: assists[1] ?? '' }, kind || 'EV', xg, loc);
  const astText = assists.length ? ` (${assists.map((id) => this.name(a, id)).join(', ')})` : ' (ohne Vorlage)';
  const kindText = (emptyNet ? ' – ins leere Tor' : '') + (kind === 'PP' ? ' – Überzahltor' : kind === 'SH' ? ' – Unterzahltor' : '');
  this.tick('goal', `TOR für ${tmA.name}! ${this.name(a, scorer)}${astText} – ${this.score[0]}:${this.score[1]}${kindText}`, a);
}

export function unitShotAttempt(this: MatchSim, a: Side, xg: number) {
  if (!this.isEvenStrength5()) return;
  this.matrix[a === 0 ? 'shotsHome' : 'shotsAway'][this.teams[0].curF][this.teams[1].curF]++;
  const b = (1 - a) as Side;
  const ta = this.teams[a], tb = this.teams[b];
  const la = this.ls[a], lb = this.ls[b];
  la.lines[ta.curF].corsiFor++; la.pairs[ta.curD].corsiFor++;
  la.lines[ta.curF].xgFor += xg; la.pairs[ta.curD].xgFor += xg;
  lb.lines[tb.curF].corsiAgainst++; lb.pairs[tb.curD].corsiAgainst++;
  lb.lines[tb.curF].xgAgainst += xg; lb.pairs[tb.curD].xgAgainst += xg;
}

export function unitShotOnGoal(this: MatchSim, a: Side) {
  if (!this.isEvenStrength5()) return;
  const b = (1 - a) as Side;
  this.ls[a].lines[this.teams[a].curF].shotsFor++;
  this.ls[a].pairs[this.teams[a].curD].shotsFor++;
  this.ls[b].lines[this.teams[b].curF].shotsAgainst++;
  this.ls[b].pairs[this.teams[b].curD].shotsAgainst++;
}
