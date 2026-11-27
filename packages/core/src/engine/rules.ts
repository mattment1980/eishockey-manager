/** Coaching-Regeln: Bedingungen prüfen, Aktionen auslösen, Taktik anpassen (Methoden der Spiel-Simulation, siehe match.ts) */
import type { Tactics, CoachingRule, RuleCondition } from '@ehm/schema';
import { describeAction, ONCE_ACTIONS } from '../coaching.ts';
import { teamFamiliarity, familiarityEffect } from '../familiarity.ts';
import { C } from './constants.ts';
import type { Side } from './types.ts';
import { sideInput } from './state.ts';
import type { Next, TeamState } from './state.ts';
import type { MatchSim } from './match.ts';

export function gameMinute(this: MatchSim): number {
  return (Math.min(this.period, 4) - 1) * 20 + this.elapsed / 60;
}

export function conditionMet(this: MatchSim, tm: TeamState, c: RuleCondition): boolean {
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
export function coaching(this: MatchSim, stoppage: boolean, next: Next) {
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

export function fireOnce(this: MatchSim, tm: TeamState, rule: CoachingRule) {
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
export function applyRuleEffects(this: MatchSim, tm: TeamState) {
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
  const fam = sideInput(this.input, tm.side).familiarity;
  if (fam) tm.famMod = familiarityEffect(teamFamiliarity(fam, tactics, tm.plan), C.FAMILIARITY_EFFECT);
  tm.shares = shares;
  tm.matchupsOn = matchups;
  if (pull !== tm.goaliePulled) {
    tm.goaliePulled = pull;
    this.tick('coach', pull ? `Torhüter raus! ${tm.shortName} spielt mit sechs Feldspielern.` : `${tm.shortName}: Torhüter wieder im Tor.`, tm.side);
  }
}

/** Statistik für aktive Regeln */
export function ruleShot(this: MatchSim, a: Side, goal: boolean) {
  for (const tm of this.teams) {
    for (const r of tm.ruleState.values()) {
      if (!r.active) continue;
      if (tm.side === a) { r.report.shotsFor++; if (goal) r.report.goalsFor++; }
      else { r.report.shotsAgainst++; if (goal) r.report.goalsAgainst++; }
    }
  }
}
