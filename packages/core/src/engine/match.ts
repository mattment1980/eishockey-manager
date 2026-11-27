/**
 * Match-Engine: ereignisbasierte Simulation eines Spiels.
 * Die Klasse hält Spielzustand und Ablauf (Drittel, Zeit, Takt); die einzelnen Bereiche
 * liegen als Methoden in eigenen Dateien und werden unten an die Klasse gehängt:
 * lines (Eis-Aufstellung, Wechsel), rules (Coaching-Regeln), modifiers (Bewertungen),
 * phases (Spielphasen), shots (Schüsse & Tore), penalties (Strafen & Checks), shootout (Penaltyschießen).
 */
import type { TraitId } from '@ehm/schema';
import { Rng } from '../rng.ts';
import { fitnessFactor } from '../ratings.ts';
import { teamFamiliarity, familiarityEffect } from '../familiarity.ts';
import { C } from './constants.ts';
import type { MatchInput, MatchResult, MatchEvent, PlayerGameStats, TeamStats, TeamLineStats, TickerLine, Side, ShotLocation, EventType, LineMatrix } from './types.ts';
import { emptyTeamStats, emptyUnit } from './state.ts';
import type { Next, Penalty, TeamState } from './state.ts';
import * as lines from './lines.ts';
import * as rules from './rules.ts';
import * as modifiers from './modifiers.ts';
import * as phases from './phases.ts';
import * as shots from './shots.ts';
import * as penalties from './penalties.ts';
import * as shootout from './shootout.ts';

export function simulateMatch(input: MatchInput): MatchResult {
  return new MatchSim(input).run();
}

type Methods = typeof lines & typeof rules & typeof modifiers & typeof phases & typeof shots & typeof penalties & typeof shootout;
/** Die Methoden aus den Teildateien gehören zur Klasse (siehe Object.assign unten). */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface MatchSim extends Methods {}

export class MatchSim {
  rng: Rng;
  teams: [TeamState, TeamState];
  penalties: Penalty[] = [];
  period = 0;
  periodLength = 1200;
  elapsed = 0; // im Drittel
  t = 0; // gesamt
  ot3v3 = false;
  goalThisPeriod = false;
  score: [number, number] = [0, 0];
  periodScores: [number, number][] = [];
  events: MatchEvent[] = [];
  ticker: TickerLine[] = [];
  ps = new Map<string, PlayerGameStats>();
  ts: [TeamStats, TeamStats] = [emptyTeamStats(), emptyTeamStats()];
  ls: [TeamLineStats, TeamLineStats];
  keepEvents: boolean;
  /** Tagesform je Team (Logit) und Torhüter-Tagesform */
  dayForm: [number, number];
  goalieForm: [number, number];
  matrix: LineMatrix = {
    toi: [0, 1, 2, 3].map(() => [0, 0, 0, 0]), shotsHome: [0, 1, 2, 3].map(() => [0, 0, 0, 0]), shotsAway: [0, 1, 2, 3].map(() => [0, 0, 0, 0]),
    goalsHome: [0, 1, 2, 3].map(() => [0, 0, 0, 0]), goalsAway: [0, 1, 2, 3].map(() => [0, 0, 0, 0]),
  };
  emptyNet: [number, number] = [0, 0];
  lastPenaltyNow = false;
  penaltySide: Side = 0;

  constructor(readonly input: MatchInput) {
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

  initTeam(side: Side): TeamState {
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

  playPeriod(length: number, ot3v3: boolean, suddenDeath: boolean) {
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

  periodLabel(): string {
    if (this.period <= 3) return `${this.period}. Drittel`;
    if (this.input.phase === 'regular') return 'Verlängerung';
    return `${this.period - 3}. Verlängerung`;
  }

  /** Zeit voranschreiten lassen. Gibt false zurück, wenn das Drittel abgelaufen ist. */
  advance(dt: number): boolean {
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


  // ------------------------------------------------------------------ Hilfen

  name(side: Side, id: string): string {
    const p = this.teams[side].byId.get(id);
    return p ? `${p.firstName[0]}. ${p.lastName}` : id;
  }

  emit(type: EventType, team: Side, players: Record<string, string>, result?: string, xg?: number, location?: ShotLocation) {
    if (!this.keepEvents && type !== 'goal' && type !== 'penalty') return;
    const es = this.isEvenStrength5();
    this.events.push({
      t: Math.round(this.t), period: this.period, clock: Math.round(this.elapsed), type, team,
      strength: this.strengthLabel(team), result, players, xg, location,
      line: es ? this.teams[team].curF : null, pair: es ? this.teams[team].curD : null,
      oppLine: es ? this.teams[1 - team].curF : null, oppPair: es ? this.teams[1 - team].curD : null,
    });
  }

  tick(type: TickerLine['type'], text: string, team?: Side) {
    const s = Math.min(Math.round(this.elapsed), this.periodLength);
    const clock = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    this.ticker.push({ t: Math.round(this.t), period: this.period, clock, type, team, text });
  }
}

Object.assign(MatchSim.prototype, { ...lines, ...rules, ...modifiers, ...phases, ...shots, ...penalties, ...shootout });
