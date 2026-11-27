import type { Player, Tactics, SkaterAttribute, CoachingRule, RuleCondition, TraitId } from '@ehm/schema';
import { describeAction, ONCE_ACTIONS } from '../coaching.ts';
import { Rng, sigmoid, logit, clamp } from '../rng.ts';
import { weightedSkater, weightedGoalie, W, fitnessFactor } from '../ratings.ts';
import { teamFamiliarity, familiarityEffect } from '../familiarity.ts';
import { C } from './constants.ts';
import type {
  MatchInput, MatchResult, MatchEvent, PlayerGameStats, TeamStats, TeamLineStats, UnitStats,
  TickerLine, Side, ShotLocation, ShootoutAttempt, EventType, RuleReport, LineMatrix,
} from './types.ts';

type Quality = 'controlled' | 'dump' | 'rush' | 'turnover';
type Next =
  | { k: 'faceoff'; defTeam: Side | null }
  | { k: 'breakout'; team: Side }
  | { k: 'neutral'; team: Side; rush: boolean }
  | { k: 'loose' }
  | { k: 'offense'; team: Side; q: Quality; n: number }
  | { k: 'end' };

interface Penalty { team: Side; playerId: string; remaining: number; length: number }

interface TeamState {
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

interface OnIce { F: string[]; D: string[] }

const INFRACTIONS = [
  'Haken', 'Halten', 'Beinstellen', 'Stockschlag', 'Behinderung', 'Hoher Stock',
  'Crosscheck', 'Ellbogencheck', 'Unkorrekter Körperangriff', 'Halten des Stocks', 'Spielverzögerung',
];

const emptyTeamStats = (): TeamStats => ({
  goals: 0, shotsOnGoal: 0, shotAttempts: 0, xg: 0, shotsBlocked: 0, shotsMissed: 0, blocks: 0, hits: 0,
  giveaways: 0, takeaways: 0, pim: 0, powerPlays: 0, powerPlayGoals: 0, shortHandedGoals: 0, faceoffsWon: 0,
  breakouts: 0, breakoutsClean: 0, entriesControlled: 0, entriesControlledSuccess: 0, dumpIns: 0,
  dumpInsRecovered: 0, ozoneTime: 0, shotsByPeriod: [],
});
const emptyUnit = (): UnitStats => ({ toi: 0, corsiFor: 0, corsiAgainst: 0, xgFor: 0, xgAgainst: 0, goalsFor: 0, goalsAgainst: 0, shotsFor: 0, shotsAgainst: 0 });

const side = (input: MatchInput, s: Side) => (s === 0 ? input.home : input.away);

export function simulateMatch(input: MatchInput): MatchResult {
  return new MatchSim(input).run();
}

class MatchSim {
  private rng: Rng;
  private teams: [TeamState, TeamState];
  private penalties: Penalty[] = [];
  private period = 0;
  private periodLength = 1200;
  private elapsed = 0; // im Drittel
  private t = 0; // gesamt
  private ot3v3 = false;
  private goalThisPeriod = false;
  private score: [number, number] = [0, 0];
  private periodScores: [number, number][] = [];
  private events: MatchEvent[] = [];
  private ticker: TickerLine[] = [];
  private ps = new Map<string, PlayerGameStats>();
  private ts: [TeamStats, TeamStats] = [emptyTeamStats(), emptyTeamStats()];
  private ls: [TeamLineStats, TeamLineStats];
  private keepEvents: boolean;
  /** Tagesform je Team (Logit) und Torhüter-Tagesform */
  private dayForm: [number, number];
  private goalieForm: [number, number];
  private matrix: LineMatrix = {
    toi: [0, 1, 2, 3].map(() => [0, 0, 0, 0]), shotsHome: [0, 1, 2, 3].map(() => [0, 0, 0, 0]), shotsAway: [0, 1, 2, 3].map(() => [0, 0, 0, 0]),
    goalsHome: [0, 1, 2, 3].map(() => [0, 0, 0, 0]), goalsAway: [0, 1, 2, 3].map(() => [0, 0, 0, 0]),
  };
  private emptyNet: [number, number] = [0, 0];

  constructor(private input: MatchInput) {
    this.rng = new Rng(input.seed);
    this.keepEvents = input.keepEvents ?? true;
    this.teams = [this.initTeam(0), this.initTeam(1)];
    this.dayForm = [this.rng.normal(0, C.DAY_FORM_SD), this.rng.normal(0, C.DAY_FORM_SD)];
    // Teamklima verschiebt die Tagesform leicht
    this.dayForm[0] += ((input.home.climate ?? 60) - 60) * C.CLIMATE_FORM;
    this.dayForm[1] += ((input.away.climate ?? 60) - 60) * C.CLIMATE_FORM;
    this.goalieForm = [this.rng.normal(0, C.GOALIE_FORM_SD), this.rng.normal(0, C.GOALIE_FORM_SD)];
    this.ls = [0, 1].map(() => ({ lines: [0, 1, 2, 3].map(emptyUnit), pairs: [0, 1, 2].map(emptyUnit) })) as [TeamLineStats, TeamLineStats];
  }

  private initTeam(side: Side): TeamState {
    const ti = side === 0 ? this.input.home : this.input.away;
    const byId = new Map(ti.players.map((p) => [p.id, p]));
    const plan = ti.plan;
    const allForwards = plan.forwardLines.flat();
    const allDefense = plan.defensePairs.flat();
    const ids = [...allForwards, ...allDefense, ...plan.goalies];
    const fresh = new Map<string, number>();
    for (const id of ids) {
      if (!byId.has(id)) throw new Error(`Spieler ${id} nicht im Kader von ${ti.name}`);
      fresh.set(id, 100);
      this.ps.set(id, {
        playerId: id, team: side, goals: 0, assists: 0, shotsOnGoal: 0, shotAttempts: 0, shotsMissed: 0,
        shotsBlockedAgainst: 0, blocks: 0, hits: 0, giveaways: 0, takeaways: 0, faceoffsWon: 0, faceoffsLost: 0,
        pim: 0, plusMinus: 0, toi: 0, ppToi: 0, shToi: 0, xg: 0, shotsAgainst: 0, goalsAgainst: 0, saves: 0,
      });
    }
    const coach = ti.coach ?? { slots: 6, fastReaction: true, matchupSkill: 0 };
    const traits = new Map<string, Partial<Record<TraitId, number>>>();
    for (const id of ids) {
      const t: Partial<Record<TraitId, number>> = {};
      for (const tr of byId.get(id)!.traits) if (tr.strength >= 50) t[tr.id] = tr.strength / 100;
      traits.set(id, t);
    }
    const unitChem = new Map<string, number>();
    const unitLeader = new Map<string, number>();
    const units: [string[], number | undefined][] = [
      ...plan.forwardLines.map((l, i) => [l, ti.chemistry?.lines[i]] as [string[], number | undefined]),
      ...plan.defensePairs.map((l, i) => [l, ti.chemistry?.pairs[i]] as [string[], number | undefined]),
    ];
    for (const [unit, chem] of units) {
      const lead = Math.max(0, ...unit.map((id) => (traits.get(id)?.leader ?? 0) + (id === ti.captainId ? 0.3 : 0)));
      for (const id of unit) {
        if (chem !== undefined) unitChem.set(id, chem);
        unitLeader.set(id, Math.min(1, lead));
      }
    }
    const rules = (plan.rules ?? []).filter((r) => r.enabled).slice(0, coach.slots);
    const ruleState = new Map(rules.map((r) => [r.id, {
      active: false, pending: false, fired: false,
      report: { team: side, ruleId: r.id, name: r.name, activations: 0, activeSeconds: 0, goalsFor: 0, goalsAgainst: 0, shotsFor: 0, shotsAgainst: 0 },
    }]));
    return {
      side, name: ti.name, shortName: ti.shortName, byId, tactics: { ...plan.tactics }, plan, fresh,
      curF: 0, curD: 0, shiftF: 0, shiftD: 0, toiF: [0, 0, 0, 0], toiD: [0, 0, 0],
      goalieId: plan.goalies[0], otUnit: 0, otShift: 0, allForwards, allDefense,
      baseTactics: { ...plan.tactics }, rules, ruleState, coach, goaliePulled: false, benched: new Set(),
      shares: [...plan.forwardShares], matchupsOn: (plan.matchups ?? []).length > 0, timeoutUsed: false, goalsAgainstAt: [],
      traits, unitChem, unitLeader, penaltyFactor: coach.penaltyFactor ?? 1, leaderAnnounced: false,
      famMod: ti.familiarity ? familiarityEffect(teamFamiliarity(ti.familiarity, plan.tactics, plan), C.FAMILIARITY_EFFECT) : 0,
      fitF: new Map(ids.map((id) => [id, fitnessFactor(byId.get(id)!.condition.fitness)])),
    };
  }

  // ------------------------------------------------------------------ Ablauf

  run(): MatchResult {
    for (let p = 0; p < 3; p++) this.playPeriod(1200, false, false);
    let decidedIn: MatchResult['decidedIn'] = 'REG';
    let shootout: MatchResult['shootout'];
    if (this.score[0] === this.score[1]) {
      decidedIn = 'OT';
      const f = this.input.format;
      if (this.input.phase === 'regular') {
        this.playPeriod(f.regularOvertime.minutes * 60, f.regularOvertime.skaters === 3, true);
        if (this.score[0] === this.score[1]) {
          if (f.regularOvertime.shootout) {
            decidedIn = 'SO';
            shootout = this.shootout();
            this.score[shootout.score[0] > shootout.score[1] ? 0 : 1]++;
          }
        }
      } else {
        for (let i = 0; i < 12 && this.score[0] === this.score[1]; i++) {
          this.playPeriod(f.playoffOvertime.minutes * 60, f.playoffOvertime.skaters === 3, true);
        }
      }
    }
    return {
      score: this.score,
      decidedIn,
      periodScores: this.periodScores,
      teamStats: this.ts,
      lineStats: this.ls,
      playerStats: [...this.ps.values()],
      ticker: this.ticker,
      events: this.events,
      shootout,
      rules: this.teams.flatMap((tm) => [...tm.ruleState.values()].map((r) => r.report)),
      lineMatrix: this.matrix,
      emptyNetGoals: this.emptyNet,
    };
  }

  private playPeriod(length: number, ot3v3: boolean, suddenDeath: boolean) {
    this.period++;
    this.periodLength = length;
    this.elapsed = 0;
    this.ot3v3 = ot3v3;
    this.goalThisPeriod = false;
    this.periodScores.push([0, 0]);
    for (const tm of this.teams) {
      for (const id of tm.fresh.keys()) tm.fresh.set(id, 100);
      tm.shiftF = 0; tm.shiftD = 0; tm.curF = 0; tm.curD = 0; tm.otUnit = 0; tm.otShift = 0;
      tm.goaliePulled = false;
      this.ts[tm.side].shotsByPeriod.push(0);
    }
    const label = this.periodLabel();
    this.tick('period', `${label} beginnt.`);
    this.emit('periodStart', 0, {});
    let next: Next = { k: 'faceoff', defTeam: null };
    while (this.elapsed < this.periodLength) {
      const stoppage = next.k === 'faceoff';
      this.coaching(stoppage, next);
      this.lineChanges(stoppage);
      next = this.step(next);
      if (next.k === 'end') break;
      if (suddenDeath && this.goalThisPeriod) break;
    }
    this.emit('periodEnd', 0, {});
    const sh = this.ts.map((s) => s.shotsByPeriod[this.period - 1] ?? 0);
    if (!(suddenDeath && this.goalThisPeriod)) {
      this.tick('period', `Ende ${label}: ${this.teams[0].shortName} ${this.score[0]}:${this.score[1]} ${this.teams[1].shortName} (Schüsse ${sh[0]}:${sh[1]})`);
    }
  }

  private periodLabel(): string {
    if (this.period <= 3) return `${this.period}. Drittel`;
    if (this.input.phase === 'regular') return 'Verlängerung';
    return `${this.period - 3}. Verlängerung`;
  }

  /** Zeit voranschreiten lassen. Gibt false zurück, wenn das Drittel abgelaufen ist. */
  private advance(dt: number): boolean {
    dt = Math.min(dt, this.periodLength - this.elapsed);
    if (dt <= 0) return false;
    const es = this.isEvenStrength5();
    for (const tm of this.teams) {
      const on = this.onIce(tm.side);
      const onSet = new Set([...on.F, ...on.D]);
      const tempo = tm.tactics.tempo === 'high' ? 1.15 : tm.tactics.tempo === 'slow' ? 0.88 : 1;
      const myN = this.skaters(tm.side), oppN = this.skaters((1 - tm.side) as Side);
      for (const [id, f] of tm.fresh) {
        const p = tm.byId.get(id)!;
        if (p.position === 'G') continue;
        if (onSet.has(id)) {
          const drain = C.DRAIN * (1.3 - p.skater.stamina / 200) * tempo;
          tm.fresh.set(id, Math.max(0, f - dt * drain));
          const st = this.ps.get(id)!;
          st.toi += dt;
          if (myN > oppN) st.ppToi += dt;
          if (myN < oppN) st.shToi += dt;
        } else {
          tm.fresh.set(id, Math.min(100, f + dt * C.RECOVER));
        }
      }
      tm.shiftF += dt;
      tm.shiftD += dt;
      tm.otShift += dt;
      if (es) {
        tm.toiF[tm.curF] += dt;
        tm.toiD[tm.curD] += dt;
        this.ls[tm.side].lines[tm.curF].toi += dt;
        this.ls[tm.side].pairs[tm.curD].toi += dt;
      }
      if (!tm.goaliePulled) this.ps.get(tm.goalieId)!.toi += dt;
      for (const r of tm.ruleState.values()) if (r.active) r.report.activeSeconds += dt;
    }
    if (es) this.matrix.toi[this.teams[0].curF][this.teams[1].curF] += dt;
    // Strafen
    for (const pen of this.penalties) pen.remaining -= dt;
    const expired = this.penalties.filter((p) => p.remaining <= 0);
    if (expired.length) {
      this.penalties = this.penalties.filter((p) => p.remaining > 0);
      for (const e of expired) this.emit('penaltyEnd', e.team, { player: e.playerId });
    }
    this.elapsed += dt;
    this.t += dt;
    return this.elapsed < this.periodLength;
  }

  // ------------------------------------------------------------------ Aufstellung auf dem Eis

  private penCount(side: Side): number {
    return Math.min(2, this.penalties.filter((p) => p.team === side).length);
  }

  private skaters(side: Side): number {
    const own = this.penCount(side), opp = this.penCount((1 - side) as Side);
    const extra = this.teams[side].goaliePulled ? 1 : 0;
    if (this.ot3v3) return Math.min(6, 3 + Math.max(0, opp - own) + extra);
    return Math.max(3, 5 - own) + extra;
  }

  /** Spielstärke ohne gezogenen Torhüter (für Situationen wie Über-/Unterzahl) */
  private penaltySituation(side: Side): 'EV' | 'PP' | 'PK' {
    const own = this.penCount(side), opp = this.penCount((1 - side) as Side);
    return own === opp ? 'EV' : own < opp ? 'PP' : 'PK';
  }

  private isEvenStrength5(): boolean {
    return !this.ot3v3 && this.skaters(0) === 5 && this.skaters(1) === 5 && !this.teams[0].goaliePulled && !this.teams[1].goaliePulled;
  }

  private strengthLabel(side: Side): string {
    return `${this.skaters(side)}v${this.skaters((1 - side) as Side)}`;
  }

  private boxed(): Set<string> {
    return new Set(this.penalties.map((p) => p.playerId));
  }

  private fill(preferred: string[], pool: string[], count: number, boxed: Set<string>, taken: Set<string>): string[] {
    const out: string[] = [];
    for (const id of [...preferred, ...pool]) {
      if (out.length >= count) break;
      if (boxed.has(id) || taken.has(id) || out.includes(id)) continue;
      out.push(id);
    }
    out.forEach((id) => taken.add(id));
    return out;
  }

  private onIce(side: Side): OnIce {
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

  private lineChanges(stoppage: boolean) {
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
  private applyMatchups(tm: TeamState, stoppage: boolean) {
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

  // ------------------------------------------------------------------ Coaching-Regeln

  private gameMinute(): number {
    return (Math.min(this.period, 4) - 1) * 20 + this.elapsed / 60;
  }

  private conditionMet(tm: TeamState, c: RuleCondition): boolean {
    const s = tm.side, o = (1 - s) as Side;
    const diff = this.score[s] - this.score[o];
    switch (c.type) {
      case 'score': return c.state === 'tied' ? diff === 0 : c.state === 'leading' ? diff >= c.min && diff <= c.max : -diff >= c.min && -diff <= c.max;
      case 'time': return this.gameMinute() >= c.fromMinute;
      case 'lastMinutes': return (this.periodLength - this.elapsed) / 60 <= c.minutes;
      case 'period': return c.period === 'OT' ? this.period > 3 : String(this.period) === c.period;
      case 'situation': return this.penaltySituation(s) === c.situation;
      case 'shots': {
        const d = this.ts[s].shotsOnGoal - this.ts[o].shotsOnGoal;
        return c.state === 'ahead' ? d >= c.diff : -d >= c.diff;
      }
      case 'goalieSave': {
        const g = this.ps.get(tm.goalieId)!;
        return g.shotsAgainst >= c.minShots && (g.saves / g.shotsAgainst) * 100 < c.below;
      }
      case 'goalsAgainst': return tm.goalsAgainstAt.filter((t) => this.t - t <= c.withinMinutes * 60).length >= c.goals;
      case 'playerPenalties': return [...tm.allForwards, ...tm.allDefense].some((id) => !tm.benched.has(id) && this.ps.get(id)!.pim / 2 >= c.count);
      case 'playoffs': return this.input.phase === 'playoff';
    }
  }

  /** Regeln prüfen und Wirkungen setzen (Wirkung bei Unterbrechung; Torhüter raus auch bei Puckbesitz). */
  private coaching(stoppage: boolean, next: Next) {
    for (const tm of this.teams) {
      if (!tm.rules.length) continue;
      const possession = (next.k === 'offense' || next.k === 'neutral') && next.team === tm.side;
      let changed = false;
      for (const rule of tm.rules) {
        const st = tm.ruleState.get(rule.id)!;
        const met = rule.conditions.every((c) => this.conditionMet(tm, c));
        const pullOnly = rule.actions.every((a) => a.type === 'pullGoalie');
        const canApply = stoppage || (pullOnly && possession);
        if (met && !st.active) {
          if (!canApply) continue;
          if (!tm.coach.fastReaction && !st.pending && !pullOnly) { st.pending = true; continue; }
          st.pending = false;
          const once = rule.actions.every((a) => ONCE_ACTIONS.includes(a.type));
          if (once && st.fired) continue;
          st.active = true;
          st.fired = true;
          st.report.activations++;
          changed = true;
          this.tick('coach', `${tm.shortName}: Regel „${rule.name}“ greift – ${rule.actions.map(describeAction).join(', ')}`, tm.side);
          this.fireOnce(tm, rule);
        } else if (!met && st.active && (stoppage || pullOnly)) {
          st.active = false;
          st.pending = false;
          changed = true;
        } else if (!met) {
          st.pending = false;
        }
      }
      if (changed) this.applyRuleEffects(tm);
    }
  }

  private fireOnce(tm: TeamState, rule: CoachingRule) {
    for (const a of rule.actions) {
      if (a.type === 'switchGoalie' && tm.goalieId === tm.plan.goalies[0]) {
        tm.goalieId = tm.plan.goalies[1];
        this.tick('coach', `Torhüterwechsel bei ${tm.shortName}: ${this.name(tm.side, tm.goalieId)} kommt ins Tor.`, tm.side);
      }
      if (a.type === 'timeout' && !tm.timeoutUsed) {
        tm.timeoutUsed = true;
        for (const [id, f] of tm.fresh) tm.fresh.set(id, Math.min(100, f + 25));
        this.dayForm[tm.side] += 0.04;
        this.tick('coach', `Auszeit ${tm.shortName}.`, tm.side);
      }
      if (a.type === 'benchPenalized') {
        const cond = rule.conditions.find((c) => c.type === 'playerPenalties');
        const n = cond && cond.type === 'playerPenalties' ? cond.count : 2;
        for (const id of [...tm.allForwards, ...tm.allDefense]) {
          if (!tm.benched.has(id) && this.ps.get(id)!.pim / 2 >= n) {
            tm.benched.add(id);
            this.tick('coach', `${this.name(tm.side, id)} (${tm.shortName}) muss auf der Bank Platz nehmen.`, tm.side);
          }
        }
      }
    }
  }

  /** Wirkungen aller aktiven Regeln zusammenführen (höhere Priorität = weiter oben = gewinnt). */
  private applyRuleEffects(tm: TeamState) {
    const tactics: Tactics = { ...tm.baseTactics };
    let shares = [...tm.plan.forwardShares];
    let pull = false;
    let matchups = (tm.plan.matchups ?? []).length > 0;
    const active = tm.rules.filter((r) => tm.ruleState.get(r.id)!.active);
    for (const rule of [...active].reverse()) {
      for (const a of rule.actions) {
        if (a.type === 'tactic') (tactics as Record<string, string>)[a.key] = a.value;
        if (a.type === 'shortBench') shares = [0.38, 0.34, 0.28, 0];
        if (a.type === 'topLines') shares = [0.4, 0.33, 0.2, 0.07];
        if (a.type === 'pullGoalie') pull = true;
        if (a.type === 'matchups') matchups = a.on;
      }
    }
    tm.tactics = tactics;
    const fam = side(this.input, tm.side).familiarity;
    if (fam) tm.famMod = familiarityEffect(teamFamiliarity(fam, tactics, tm.plan), C.FAMILIARITY_EFFECT);
    tm.shares = shares;
    tm.matchupsOn = matchups;
    if (pull !== tm.goaliePulled) {
      tm.goaliePulled = pull;
      this.tick('coach', pull ? `Torhüter raus! ${tm.shortName} spielt mit sechs Feldspielern.` : `${tm.shortName}: Torhüter wieder im Tor.`, tm.side);
    }
  }

  /** Statistik für aktive Regeln */
  private ruleShot(a: Side, goal: boolean) {
    for (const tm of this.teams) {
      for (const r of tm.ruleState.values()) {
        if (!r.active) continue;
        if (tm.side === a) { r.report.shotsFor++; if (goal) r.report.goalsFor++; }
        else { r.report.shotsAgainst++; if (goal) r.report.goalsAgainst++; }
      }
    }
  }

  // ------------------------------------------------------------------ Bewertungen

  private mult(side: Side, id: string): number {
    const tm = this.teams[side];
    const p = tm.byId.get(id)!;
    const f = tm.fresh.get(id) ?? 100;
    const fat = C.FATIGUE_FLOOR + (1 - C.FATIGUE_FLOOR) * (f / 100);
    let mod = (p.condition.form - 50) / 1000 + (p.condition.morale - 50) / 1500 + this.characterMod(side, id) + tm.famMod;
    mod = Math.max(-C.CHARACTER_CAP, Math.min(C.CHARACTER_CAP, mod));
    return fat * (tm.fitF.get(id) ?? 1) * (1 + mod);
  }

  /** Situative Trait-Boni und Reihenchemie (Anteil, z. B. 0.03 = +3 %) */
  private characterMod(side: Side, id: string): number {
    const tm = this.teams[side];
    const t = tm.traits.get(id)!;
    let m = 0;
    const chem = tm.unitChem.get(id);
    if (chem !== undefined) m += ((chem - 50) / 50) * C.CHEM_EFFECT;
    const diff = this.score[side] - this.score[1 - side];
    const late = this.period >= 3;
    const playoff = this.input.phase === 'playoff';
    const big = playoff || this.period > 3;
    if (t.bigGame && big) m += 0.05 * t.bigGame;
    if (t.nervenbuendel && big) m -= 0.05 * t.nervenbuendel;
    if (t.kaempfer && diff < 0) m += 0.04 * t.kaempfer;
    if (t.schoenwetter) m += diff > 0 ? 0.03 * t.schoenwetter : diff < 0 ? -0.04 * t.schoenwetter : 0;
    if (t.heimstark && side === 0) m += 0.03 * t.heimstark;
    if (t.freigeist) m += 0.015 * t.freigeist;
    const lead = tm.unitLeader.get(id) ?? 0;
    if (lead > 0 && diff < 0 && (late || playoff)) {
      m += 0.03 * lead;
      if (!tm.leaderAnnounced) {
        tm.leaderAnnounced = true;
        const unit = [...tm.plan.forwardLines, ...tm.plan.defensePairs].find((u) => u.includes(id)) ?? [id];
        const leader = unit.reduce((b, x) => ((tm.traits.get(x)?.leader ?? 0) > (tm.traits.get(b)?.leader ?? 0) ? x : b), unit[0]);
        this.tick('coach', `${this.name(side, leader)} treibt seine Reihe an – Leader-Bonus für ${tm.shortName} aktiv.`, side);
      }
    }
    return m;
  }

  private group(side: Side, ids: string[], w: Partial<Record<SkaterAttribute, number>>): number {
    if (!ids.length) return 60;
    let s = 0;
    for (const id of ids) s += weightedSkater(this.teams[side].byId.get(id)!, w) * this.mult(side, id);
    return s / ids.length;
  }

  /**
   * Spielstandseffekt: Wer zurückliegt, macht ab dem 2. Drittel mehr Druck,
   * wer führt, verwaltet eher (Faktor auf die Schussrate von `a`).
   */
  private scoreEffect(a: Side): number {
    if (this.period < 2 || this.period > 3) return 1;
    const diff = this.score[a] - this.score[1 - a];
    if (diff === 0 || Math.abs(diff) > 3) return 1;
    const late = this.period === 3 ? 1 : 0.5;
    return diff < 0 ? 1 + C.SCORE_EFFECT_TRAIL * late : 1 - C.SCORE_EFFECT_LEAD * late;
  }

  /** Personelle Überlegenheit von `a` (z. B. +1 bei 5-gegen-4) */
  private adv(a: Side): number {
    return this.skaters(a) - this.skaters((1 - a) as Side);
  }

  private all(o: OnIce): string[] {
    return [...o.F, ...o.D];
  }

  /** Duell-Logit: Vorteil von `att` gegenüber `def` inkl. Heimvorteil */
  private duel(attSide: Side, att: number, def: number, base: number, mod = 0): number {
    const home = attSide === 0 ? C.HOME : -C.HOME;
    const form = C.DAY_FORM_POSSESSION * (this.dayForm[attSide] - this.dayForm[1 - attSide]);
    return sigmoid(C.K * ((att - def) / 20) + base + mod + home + form);
  }

  private pickWeighted(side: Side, ids: string[], fn: (p: Player) => number): string {
    const tm = this.teams[side];
    return this.rng.weighted(ids, ids.map((id) => Math.max(1, fn(tm.byId.get(id)!))));
  }

  private dt(range: readonly number[]): number {
    return this.rng.float(range[0], range[1]);
  }

  // ------------------------------------------------------------------ Phasen

  private step(next: Next): Next {
    switch (next.k) {
      case 'faceoff': return this.faceoff(next.defTeam);
      case 'breakout': return this.breakout(next.team);
      case 'neutral': return this.neutral(next.team, next.rush);
      case 'loose': return this.loose();
      case 'offense': return this.offense(next.team, next.q, next.n);
      case 'end': return next;
    }
  }

  private faceoff(defTeam: Side | null): Next {
    if (!this.advance(this.dt(C.T_FACEOFF))) return { k: 'end' };
    const o0 = this.onIce(0), o1 = this.onIce(1);
    const taker = (side: Side, o: OnIce) => {
      const pool = o.F.length ? o.F : o.D;
      return pool.reduce((best, id) => (this.teams[side].byId.get(id)!.skater.faceoffs > this.teams[side].byId.get(best)!.skater.faceoffs ? id : best), pool[0]);
    };
    const c0 = taker(0, o0), c1 = taker(1, o1);
    const r0 = weightedSkater(this.teams[0].byId.get(c0)!, W.faceoff);
    const r1 = weightedSkater(this.teams[1].byId.get(c1)!, W.faceoff);
    const p0 = sigmoid(0.5 * ((r0 - r1) / 20) + C.HOME);
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

  private breakout(a: Side): Next {
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

  private neutral(a: Side, rush: boolean): Next {
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

  private loose(): Next {
    if (!this.advance(this.dt(C.T_NEUTRAL))) return { k: 'end' };
    const o0 = this.onIce(0), o1 = this.onIce(1);
    const p = this.duel(0, this.group(0, this.all(o0), W.battle), this.group(1, this.all(o1), W.battle), 0);
    const w: Side = this.rng.chance(p) ? 0 : 1;
    this.maybeHit(w, w === 0 ? o0 : o1);
    return { k: 'neutral', team: w, rush: false };
  }

  private offense(a: Side, q: Quality, n: number): Next {
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
    const pTurn = sigmoid(C.K * ((dz - cycle) / 20) + logit(C.TURNOVER_BASE) + dzMod + stTurn + (ta.offensiveZone === 'slot' ? 0.15 : 0) - (a === 0 ? C.HOME : -C.HOME) - C.DAY_FORM_POSSESSION * (this.dayForm[a] - this.dayForm[b]) - C.ADV_TURNOVER * adv);
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

  private shot(a: Side, q: Quality | 'reboundQ'): Next {
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
    const gr = weightedGoalie(gp, W.goalie) * fitnessFactor(gp.condition.fitness) * (1 + (gp.condition.form - 50) / 800);
    const shootR = weightedSkater(sp, W.shooting) * this.mult(a, shooter);
    const homeAdj = a === 0 ? C.HOME : -C.HOME;
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
  private emptyNetShot(a: Side): Next {
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

  private goal(a: Side, scorer: string, onIce: string[], loc: ShotLocation, xg: number, emptyNet = false) {
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

  private unitShotAttempt(a: Side, xg: number) {
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

  private unitShotOnGoal(a: Side) {
    if (!this.isEvenStrength5()) return;
    const b = (1 - a) as Side;
    this.ls[a].lines[this.teams[a].curF].shotsFor++;
    this.ls[a].pairs[this.teams[a].curD].shotsFor++;
    this.ls[b].lines[this.teams[b].curF].shotsAgainst++;
    this.ls[b].pairs[this.teams[b].curD].shotsAgainst++;
  }

  // ------------------------------------------------------------------ Strafen & Zweikämpfe

  private lastPenaltyNow = false;

  /** Prüft, ob die Mannschaft `side` in diesem Zweikampf eine Strafe kassiert. */
  private penaltyCheck(side: Side, on: OnIce, weight: number) {
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

  private penaltySide: Side = 0;

  private afterPenalty(): Next {
    this.lastPenaltyNow = false;
    return { k: 'faceoff', defTeam: this.penaltySide };
  }

  private maybeHit(side: Side, on: OnIce) {
    if (!this.rng.chance(0.35)) return;
    const ids = this.all(on);
    if (!ids.length) return;
    const hitter = this.pickWeighted(side, ids, (p) => p.skater.bodyChecking ** 2 / 100);
    this.ps.get(hitter)!.hits++;
    this.ts[side].hits++;
    this.emit('hit', side, { hitter });
  }

  // ------------------------------------------------------------------ Penaltyschießen

  private shootout(): { attempts: ShootoutAttempt[]; score: [number, number] } {
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

  // ------------------------------------------------------------------ Hilfen

  private name(side: Side, id: string): string {
    const p = this.teams[side].byId.get(id);
    return p ? `${p.firstName[0]}. ${p.lastName}` : id;
  }

  private emit(type: EventType, team: Side, players: Record<string, string>, result?: string, xg?: number, location?: ShotLocation) {
    if (!this.keepEvents && type !== 'goal' && type !== 'penalty') return;
    const es = this.isEvenStrength5();
    this.events.push({
      t: Math.round(this.t), period: this.period, clock: Math.round(this.elapsed), type, team,
      strength: this.strengthLabel(team), result, players, xg, location,
      line: es ? this.teams[team].curF : null, pair: es ? this.teams[team].curD : null,
      oppLine: es ? this.teams[1 - team].curF : null, oppPair: es ? this.teams[1 - team].curD : null,
    });
  }

  private tick(type: TickerLine['type'], text: string, team?: Side) {
    const s = Math.min(Math.round(this.elapsed), this.periodLength);
    const clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    this.ticker.push({ t: Math.round(this.t), period: this.period, clock, type, team, text });
  }
}

/** Nächste Reihe: die mit dem größten Rückstand auf ihren Soll-Eiszeitanteil. */
function pickNext(toi: number[], shares: number[], current: number): number {
  const total = toi.reduce((s, x) => s + x, 0) + 1;
  let best = -1, bestDeficit = -Infinity;
  for (let i = 0; i < toi.length; i++) {
    if (i === current) continue;
    const deficit = shares[i] * total - toi[i];
    if (deficit > bestDeficit) { bestDeficit = deficit; best = i; }
  }
  return best < 0 ? current : best;
}
