/** Bewertungen: Leistungsfaktor je Spieler, Charakter-Effekte, Duelle, Zufallshilfen (Methoden der Spiel-Simulation, siehe match.ts) */
import type { Player, SkaterAttribute } from '@ehm/schema';
import { sigmoid } from '../rng.ts';
import { weightedSkater, formMoraleMod, capMod } from '../ratings.ts';
import { C } from './constants.ts';
import type { Side } from './types.ts';
import type { OnIce } from './state.ts';
import type { MatchSim } from './match.ts';

export function mult(this: MatchSim, side: Side, id: string): number {
  const tm = this.teams[side];
  const p = tm.byId.get(id)!;
  const f = tm.fresh.get(id) ?? 100;
  const fat = C.FATIGUE_FLOOR + (1 - C.FATIGUE_FLOOR) * (f / 100);
  const mod = capMod(formMoraleMod(p.condition) + this.characterMod(side, id) + tm.famMod);
  return fat * (tm.fitF.get(id) ?? 1) * (1 + mod);
}

/** Situative Trait-Boni und Reihenchemie (Anteil, z. B. 0.03 = +3 %) */
export function characterMod(this: MatchSim, side: Side, id: string): number {
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

export function group(this: MatchSim, side: Side, ids: string[], w: Partial<Record<SkaterAttribute, number>>): number {
  if (!ids.length) return 60;
  let s = 0;
  for (const id of ids) s += weightedSkater(this.teams[side].byId.get(id)!, w) * this.mult(side, id);
  return s / ids.length;
}

/**
 * Spielstandseffekt: Wer zurückliegt, macht ab dem 2. Drittel mehr Druck,
 * wer führt, verwaltet eher (Faktor auf die Schussrate von `a`).
 */
export function scoreEffect(this: MatchSim, a: Side): number {
  if (this.period < 2 || this.period > 3) return 1;
  const diff = this.score[a] - this.score[1 - a];
  if (diff === 0 || Math.abs(diff) > 3) return 1;
  const late = this.period === 3 ? 1 : 0.5;
  return diff < 0 ? 1 + C.SCORE_EFFECT_TRAIL * late : 1 - C.SCORE_EFFECT_LEAD * late;
}

/** Personelle Überlegenheit von `a` (z. B. +1 bei 5-gegen-4) */
export function adv(this: MatchSim, a: Side): number {
  return this.skaters(a) - this.skaters((1 - a) as Side);
}

export function all(this: MatchSim, o: OnIce): string[] {
  return [...o.F, ...o.D];
}

/** Duell-Logit: Vorteil von `att` gegenüber `def` inkl. Heimvorteil */
export function duel(this: MatchSim, attSide: Side, att: number, def: number, base: number, mod = 0): number {
  const home = attSide === 0 ? C.HOME : -C.HOME;
  const form = C.DAY_FORM_POSSESSION * (this.dayForm[attSide] - this.dayForm[1 - attSide]);
  return sigmoid(C.K * ((att - def) / 20) + base + mod + home + form);
}

export function pickWeighted(this: MatchSim, side: Side, ids: string[], fn: (p: Player) => number): string {
  const tm = this.teams[side];
  return this.rng.weighted(ids, ids.map((id) => Math.max(1, fn(tm.byId.get(id)!))));
}

export function dt(this: MatchSim, range: readonly number[]): number {
  return this.rng.float(range[0], range[1]);
}
