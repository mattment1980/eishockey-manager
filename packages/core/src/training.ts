import type { World, Club, Player, Fixture, Training, TrainingUnit, TrainingFocus, TrainingIntensity, IndividualFocus, AutoPick } from '@ehm/schema';
import { overall, toDisplay, ageOn } from './ratings.ts';
import { addDays, daysBetween, hash01 } from './calendar.ts';
import { pairKey, CHEM_START } from './chemistry.ts';
import { trainingInjuries, healInjuries, coverInjuries } from './injuries.ts';
import { familiarityKeys, familiarityValue, learningRate, trainFamiliarity, teamFamiliarity } from './familiarity.ts';

/**
 * Training (Meilenstein 8, Konzept „training“):
 * - Jede Woche drei Einheiten mit Schwerpunkt und eigener Intensität (hart, mittel, locker, Regeneration).
 * - Harte Einheiten bringen mehr Entwicklung und Eingespieltheit, kosten aber Frische und – gehäuft – Moral.
 *   Lockere Einheiten und Regeneration geben Frische und Moral zurück.
 * - Legt der Manager nichts fest, plant der Co-Trainer die Woche (nach Spielplan, Frische und Baustellen).
 * - Einzeltraining für bis zu 3 Spieler; freie Plätze besetzt der Co-Trainer nach einer wählbaren Regel.
 * Die Woche läuft montags an; ausgewertet wird sie vor dem ersten Spiel der Woche.
 */

export const INTENSITY: Record<TrainingIntensity, { label: string; load: number; dev: number; fam: number; fitness: number; morale: number }> = {
  hard: { label: 'Hart', load: 3, dev: 1, fam: 1, fitness: -2.6, morale: -0.4 },
  medium: { label: 'Mittel', load: 2, dev: 0.7, fam: 0.7, fitness: -1.2, morale: 0 },
  light: { label: 'Locker', load: 1, dev: 0.35, fam: 0.4, fitness: 0.3, morale: 0.7 },
  recovery: { label: 'Regeneration', load: 0, dev: 0, fam: 0, fitness: 3, morale: 0.4 },
};
export const INTENSITIES: TrainingIntensity[] = ['hard', 'medium', 'light', 'recovery'];

export const FOCUS: Record<TrainingFocus, { label: string; short: string; text: string }> = {
  athletics: { label: 'Athletik & Eislaufen', short: 'Athletik', text: 'Eislaufen, Beweglichkeit, Kraft, Ausdauer' },
  offense: { label: 'Angriff & Abschluss', short: 'Angriff', text: 'Scheibenführung, Passspiel, Schuss, Bullys' },
  defense: { label: 'Defensive & Zweikampf', short: 'Defensive', text: 'Stellungsspiel, Stockcheck, Körperspiel, Schüsse blocken' },
  mental: { label: 'Spielverständnis (Video)', short: 'Video', text: 'Spielintelligenz, Antizipation, Nervenstärke, Einsatz' },
  tactics: { label: 'Taktik & System', short: 'Taktik', text: 'Eingespieltheit der gewählten Teamtaktik' },
  specialTeams: { label: 'Über- & Unterzahl', short: 'Special Teams', text: 'Eingespieltheit der PP- und PK-Formation' },
  lines: { label: 'Reihen-Zusammenspiel', short: 'Reihen', text: 'Chemie der aktuellen Reihen und Verteidigerpaare' },
  goalies: { label: 'Torhütertraining', short: 'Torhüter', text: 'Stellungsspiel, Fanghand, Schienen, Rebounds – nur für Torhüter' },
};
export const TRAINING_FOCUS_ORDER: TrainingFocus[] = ['athletics', 'offense', 'defense', 'mental', 'tactics', 'specialTeams', 'lines', 'goalies'];

export const AUTO_PICK: Record<AutoPick, { label: string; text: string }> = {
  rotate: { label: 'Reihum', text: 'Der Co-Trainer nimmt sich nach und nach jeden Spieler vor.' },
  formweak: { label: 'Formschwache', text: 'Spieler im Formtief bekommen Extraschichten.' },
  talent: { label: 'Talente', text: 'Spieler mit viel Talent und Luft nach oben.' },
  young: { label: 'Junge Spieler', text: 'Die jüngsten Spieler im Kader.' },
};

export const TRAIN = {
  /** Entwicklungsumfang einer typischen Woche (Bezugsgröße für Faktor 1,0) */
  DEV_REF: 1.65,
  /** Wirkung des Umfangs auf das Entwicklungstempo: 0,85 + 0,15 × Umfang/Bezug, begrenzt */
  DEV_MIN: 0.82,
  DEV_MAX: 1.15,
  /** Gewicht des Schwerpunkts bei der Verteilung auf die Attribute (Anteil 1,0 → Gewicht 1 + FOCUS_WEIGHT) */
  FOCUS_WEIGHT: 2.2,
  /** Einzeltraining: Tempo-Bonus bei durchgehendem Einzeltraining und Gewicht des Schwerpunkts */
  INDIV_BOOST: 0.22,
  INDIV_WEIGHT: 3,
  /** Eingespieltheit je Einheit (Anteil des Lerntempos eines Spiels) */
  FAM: 0.55,
  /** Reihenchemie je Einheit (Anteil der Lücke zu 88) */
  CHEM: 0.035,
  /** Moralabzug bei 2 bzw. 3 harten Einheiten in einer Woche */
  HARD2: -1.2,
  HARD3: -3,
  /** Erholungstempo zwischen den Spielen: neutral bei Belastung 5 */
  RECOVERY_PER_LOAD: 0.04,
  RECOVERY_PER_REGEN: 0.05,
};

/** Welche Attribute ein Schwerpunkt fördert */
export const FOCUS_ATTRS: Record<IndividualFocus | 'tactics' | 'specialTeams' | 'lines', { skater: string[]; goalie: string[] }> = {
  athletics: { skater: ['skating', 'agility', 'strength', 'stamina'], goalie: ['reflexes', 'agility'] },
  offense: { skater: ['puckHandling', 'passing', 'shotPower', 'shotAccuracy', 'faceoffs'], goalie: [] },
  defense: { skater: ['defPositioning', 'stickChecking', 'bodyChecking', 'shotBlocking'], goalie: [] },
  mental: { skater: ['hockeyIQ', 'anticipation', 'composure', 'workRate'], goalie: ['concentration', 'composure'] },
  goalies: { skater: [], goalie: ['positioning', 'lowShots', 'glove', 'blocker', 'reboundControl', 'puckPlaying'] },
  tactics: { skater: ['hockeyIQ', 'defPositioning', 'passing'], goalie: ['positioning'] },
  specialTeams: { skater: ['passing', 'shotAccuracy', 'shotBlocking', 'stickChecking'], goalie: ['positioning'] },
  lines: { skater: ['passing', 'anticipation'], goalie: [] },
};

/** Anteil einer Einheit, der in die individuelle Entwicklung fließt (Feldspieler / Torhüter) */
const DEV_SHARE: Record<TrainingFocus, [number, number]> = {
  athletics: [1, 0.8], offense: [1, 0.1], defense: [1, 0.1], mental: [0.8, 0.8],
  tactics: [0.4, 0.2], specialTeams: [0.5, 0.1], lines: [0.4, 0.1], goalies: [0.1, 1],
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Montag der Woche eines Datums */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

const rosterOf = (world: World, clubId: string) => world.players.filter((p) => p.contract?.clubId === clubId);

/** Spiele eines Vereins in der Woche ab `start` */
export function gamesInWeek(world: World, clubId: string, start: string): number {
  const end = addDays(start, 7);
  return world.competition?.fixtures.filter((f) => f.date >= start && f.date < end && (f.home === clubId || f.away === clubId)).length ?? 0;
}

const STEP_DOWN: Record<TrainingIntensity, TrainingIntensity> = { hard: 'medium', medium: 'light', light: 'recovery', recovery: 'recovery' };

/** Wochenplan des Co-Trainers: Intensität nach Spielplan und Frische, Schwerpunkte nach Baustellen und im Wechsel */
export function coachPlan(world: World, club: Club, start: string): TrainingUnit[] {
  const games = gamesInWeek(world, club.id, start);
  const roster = rosterOf(world, club.id);
  const fit = roster.length ? roster.reduce((s, p) => s + p.condition.fitness, 0) / roster.length : 100;
  let ints: TrainingIntensity[] = games >= 3 ? ['medium', 'light', 'recovery'] : games === 2 ? ['hard', 'medium', 'recovery'] : games === 1 ? ['hard', 'medium', 'light'] : ['hard', 'hard', 'medium'];
  if (fit < 84) ints = ints.map((i) => STEP_DOWN[i]);
  // Baustellen
  const needs: TrainingFocus[] = [];
  const plan = club.matchplan;
  if (plan) {
    if (teamFamiliarity(club.familiarity, plan.tactics) < 62) needs.push('tactics');
    const st = (familiarityValue(club.familiarity, `pp:${plan.specialTeams.ppFormation}`) + familiarityValue(club.familiarity, `pk:${plan.specialTeams.pkFormation}`)) / 2;
    if (st < 58) needs.push('specialTeams');
    const byId = new Map(roster.map((p) => [p.id, p]));
    const units = [...plan.forwardLines, ...plan.defensePairs];
    let chem = 0, n = 0;
    for (const u of units) for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) { if (byId.has(u[i]) && byId.has(u[j])) { chem += world.chemistry[pairKey(u[i], u[j])] ?? CHEM_START; n++; } }
    if (n && chem / n < 52) needs.push('lines');
  }
  const rotation: TrainingFocus[] = ['offense', 'defense', 'athletics', 'mental', 'offense', 'defense', 'specialTeams', 'athletics'];
  const week = Math.floor(daysBetween('2000-01-03', start) / 7);
  const foci: TrainingFocus[] = [];
  for (const f of needs) if (foci.length < 2 && !foci.includes(f)) foci.push(f);
  for (let i = 0; foci.length < 3 && i < 16; i++) { const f = rotation[(week + i) % rotation.length]; if (!foci.includes(f)) foci.push(f); }
  return foci.map((focus, i) => ({ focus, intensity: ints[i] }));
}

/** Schwächster passender Bereich eines Spielers (für das Einzeltraining des Co-Trainers) */
export function weakestFocus(p: Player): IndividualFocus {
  if (p.position === 'G') return 'goalies';
  const opts: IndividualFocus[] = p.position === 'LD' || p.position === 'RD' ? ['defense', 'athletics', 'mental', 'offense'] : ['offense', 'athletics', 'mental', 'defense'];
  const avg = (f: IndividualFocus) => { const ks = FOCUS_ATTRS[f].skater; return ks.reduce((s, k) => s + p.skater[k as keyof Player['skater']], 0) / ks.length; };
  // Gewichtung: der Kernbereich der Position zählt etwas weniger stark (wird ohnehin trainiert)
  return opts.slice(0, 3).reduce((best, f) => (avg(f) < avg(best) ? f : best), opts[0]);
}

/** Einzeltraining der Woche: feste Plätze des Managers plus Auswahl des Co-Trainers */
export function individualFor(world: World, club: Club, start: string): { playerId: string; focus: IndividualFocus; auto: boolean }[] {
  const roster = rosterOf(world, club.id);
  const ids = new Set(roster.map((p) => p.id));
  const fixed = club.training.individual.filter((x) => ids.has(x.playerId)).map((x) => ({ ...x, auto: false }));
  const taken = new Set(fixed.map((x) => x.playerId));
  const free = roster.filter((p) => !taken.has(p.id));
  const date = start;
  let order: Player[];
  switch (club.training.autoPick) {
    case 'formweak': order = [...free].sort((a, b) => a.condition.form - b.condition.form); break;
    case 'talent': order = [...free].filter((p) => p.hidden.potential - overall(p) > 4).sort((a, b) => b.hidden.potential - a.hidden.potential); break;
    case 'young': order = [...free].sort((a, b) => ageOn(a.birthDate, date) - ageOn(b.birthDate, date) || b.hidden.potential - a.hidden.potential); break;
    default: {
      // reihum: wer zuletzt dran war, kommt später wieder
      const last = new Set(club.training.week?.individual.map((x) => x.playerId) ?? []);
      order = [...free].sort((a, b) => Number(last.has(a.id)) - Number(last.has(b.id)) || hash01(`${start}:${a.id}`) - hash01(`${start}:${b.id}`));
    }
  }
  const auto = order.slice(0, Math.max(0, 3 - fixed.length)).map((p) => ({ playerId: p.id, focus: weakestFocus(p), auto: true }));
  return [...fixed, ...auto];
}

/** Erholungstempo zwischen den Spielen nach der Belastung der Woche (1 = neutral) */
export function recoveryFactor(training: Training | undefined): number {
  const wk = training?.week;
  if (!wk) return 1;
  const regen = wk.units.filter((u) => u.intensity === 'recovery').length;
  return clamp(1 + (5 - wk.load) * TRAIN.RECOVERY_PER_LOAD + regen * TRAIN.RECOVERY_PER_REGEN, 0.75, 1.35);
}

/** Plan, der in einer Woche tatsächlich trainiert wird */
export function weekPlan(world: World, club: Club, start: string): { units: TrainingUnit[]; byCoach: boolean } {
  if (club.controller.type === 'human' && club.training.plan) return { units: club.training.plan, byCoach: false };
  return { units: coachPlan(world, club, start), byCoach: true };
}

/** Wirkung einer Woche auf einen Spieler (Frische, Moral) – auch für die Vorschau */
export function weekEffect(p: Player, units: TrainingUnit[], games: number, individual: boolean, boost = 1): { fitness: number; morale: number } {
  const stamina = toDisplay(p.skater.stamina);
  let fitness = 0, morale = 0;
  for (const u of units) {
    const it = INTENSITY[u.intensity];
    fitness += it.fitness < 0 ? it.fitness * boost * (1.25 - stamina / 40) : it.fitness;
    morale += it.morale;
  }
  const hard = units.filter((u) => u.intensity === 'hard').length * (boost > 1 ? 1.5 : 1);
  const tolerance = 1.3 - p.hidden.professionalism / 200 * 0.6; // Profis stecken harte Wochen besser weg
  if (hard >= 3) morale += TRAIN.HARD3 * tolerance; else if (hard >= 2) morale += TRAIN.HARD2 * tolerance;
  if (games >= 3 && hard >= 1) { fitness -= 1.5; morale -= 0.5; }
  if (individual) { morale += 0.5; fitness -= 0.6; }
  return { fitness: r1(fitness), morale: r1(morale) };
}

/**
 * Eine Trainingswoche für einen Verein auswerten.
 * `boost` > 1 im Trainingslager (mehr Einheiten am Tag).
 */
function trainClubWeek(world: World, club: Club, start: string, boost: number): { club: Club; players: Map<string, Player>; chemistry: Record<string, number> } {
  const { units, byCoach } = weekPlan(world, club, start);
  const games = gamesInWeek(world, club.id, start);
  const individual = individualFor(world, club, start);
  const indiv = new Map(individual.map((x) => [x.playerId, x.focus]));
  const load = units.reduce((s, u) => s + INTENSITY[u.intensity].load, 0);
  const before = rosterAverages(rosterOf(world, club.id));
  // Spieler: Frische und Moral
  const players = new Map<string, Player>();
  for (const p of rosterOf(world, club.id)) {
    const e = weekEffect(p, units, games, indiv.has(p.id), boost);
    players.set(p.id, { ...p, condition: { ...p.condition, fitness: r1(clamp(p.condition.fitness + e.fitness, 40, 100)), morale: r1(clamp(p.condition.morale + e.morale, 0, 100)) } });
  }
  // Entwicklungs-Log
  const log = { ...club.training.log };
  for (const u of units) log[`team:${u.focus}`] = r1((log[`team:${u.focus}`] ?? 0) + INTENSITY[u.intensity].dev * boost);
  for (const x of individual) log[`${x.playerId}:${x.focus}`] = (log[`${x.playerId}:${x.focus}`] ?? 0) + 1;
  // Eingespieltheit und Reihenchemie
  let familiarity = club.familiarity;
  const chemistry = { ...world.chemistry };
  const plan = club.matchplan;
  if (plan) {
    const rate = learningRate(world, club.id) * TRAIN.FAM * boost;
    const k = (f: TrainingFocus) => units.filter((u) => u.focus === f).reduce((s, u) => s + INTENSITY[u.intensity].fam, 0);
    const kt = k('tactics'), ks = k('specialTeams'), kl = k('lines');
    if (kt > 0) familiarity = trainFamiliarity(world, { ...club, familiarity }, plan, rate * kt, 0);
    if (ks > 0) {
      familiarity = { ...familiarity };
      for (const key of familiarityKeys(plan.tactics, plan).filter((x) => x.startsWith('pp:') || x.startsWith('pk:'))) {
        const v = familiarityValue(familiarity, key);
        familiarity[key] = r1(Math.min(100, v + (100 - v) * rate * ks * 1.3));
      }
    }
    if (kl > 0) {
      for (const unit of [...plan.forwardLines, ...plan.defensePairs]) {
        for (let i = 0; i < unit.length; i++) for (let j = i + 1; j < unit.length; j++) {
          const key = pairKey(unit[i], unit[j]);
          const c0 = chemistry[key] ?? CHEM_START;
          chemistry[key] = r1(Math.min(100, c0 + Math.max(0, 88 - c0) * TRAIN.CHEM * kl * boost));
        }
      }
    }
  }
  const training: Training = {
    ...club.training,
    // Einmal-Plan: nach der Woche übernimmt wieder der Co-Trainer
    plan: club.training.plan && !club.training.keep ? null : club.training.plan,
    week: { start, units, byCoach, individual, games, load, before },
    log,
    weeks: club.training.weeks + boost,
  };
  return { club: { ...club, familiarity, training }, players, chemistry };
}

/** Eine Woche für alle Vereine einer Liga mit Matchplan */
export function trainWeek(world: World, start: string, boost = 1): World {
  let chemistry = world.chemistry;
  const changed = new Map<string, Player>();
  const loads = new Map<string, number>();
  const clubs = world.clubs.map((c) => {
    if (!c.matchplan || c.training.week?.start === start) return c;
    const r = trainClubWeek({ ...world, chemistry }, c, start, boost);
    chemistry = r.chemistry;
    for (const [id, p] of r.players) changed.set(id, p);
    loads.set(c.id, r.club.training.week!.load);
    return r.club;
  });
  const w = { ...world, clubs, chemistry, players: changed.size ? world.players.map((p) => changed.get(p.id) ?? p) : world.players };
  // Überlastung: harte Wochen erhöhen das Verletzungsrisiko
  return loads.size ? trainingInjuries(w, start, loads, boost) : w;
}

/** Alle Trainingswochen bis einschließlich der Woche von `upto` (höchstens 4 nachholen) */
export function runTraining(world: World, upto: string, boost = 1): World {
  const target = mondayOf(upto);
  const last = world.clubs.reduce<string | null>((m, c) => (c.training.week && (!m || c.training.week.start > m) ? c.training.week.start : m), null);
  let start = last && last < target ? addDays(last, 7) : target;
  if (daysBetween(start, target) > 21) start = addDays(target, -21);
  let w = world;
  for (let d = start; d <= target; d = addDays(d, 7)) w = trainWeek(w, d, boost);
  return w;
}

/**
 * Trainingswirkung auf die Entwicklung eines Spielers (für den nächsten Entwicklungsschritt):
 * Tempo-Faktor aus dem Umfang und Gewichte je Attribut aus den Schwerpunkten und dem Einzeltraining.
 */
export function trainingDev(club: Club | undefined, p: Player): { factor: number; weights: Record<string, number>; indivShare: number } {
  const t = club?.training;
  if (!t || t.weeks <= 0) return { factor: 1, weights: {}, indivShare: 0 };
  const g = p.position === 'G' ? 1 : 0;
  let vol = 0;
  const byFocus: Partial<Record<TrainingFocus, number>> = {};
  for (const [key, v] of Object.entries(t.log)) {
    if (!key.startsWith('team:')) continue;
    const f = key.slice(5) as TrainingFocus;
    const share = (DEV_SHARE[f]?.[g] ?? 0) * v;
    vol += share;
    byFocus[f] = (byFocus[f] ?? 0) + share;
  }
  const perWeek = vol / t.weeks;
  // Torhüter arbeiten ohnehin viel mit dem Torwarttrainer: Teamtraining wirkt nur zur Hälfte
  let factor = clamp(0.85 + 0.15 * (perWeek / TRAIN.DEV_REF), TRAIN.DEV_MIN, TRAIN.DEV_MAX);
  if (g) factor = 0.5 + factor / 2;
  const weights: Record<string, number> = {};
  const add = (f: keyof typeof FOCUS_ATTRS, w: number) => { for (const k of FOCUS_ATTRS[f][g ? 'goalie' : 'skater']) weights[k] = (weights[k] ?? 1) + w; };
  if (vol > 0) for (const [f, v] of Object.entries(byFocus)) add(f as TrainingFocus, (v! / vol) * TRAIN.FOCUS_WEIGHT);
  // Einzeltraining
  let indivWeeks = 0;
  for (const [key, v] of Object.entries(t.log)) {
    if (!key.startsWith(`${p.id}:`)) continue;
    indivWeeks += v;
    add(key.slice(p.id.length + 1) as IndividualFocus, (v / t.weeks) * TRAIN.INDIV_WEIGHT);
  }
  const indivShare = Math.min(1, indivWeeks / t.weeks);
  factor *= 1 + TRAIN.INDIV_BOOST * indivShare;
  return { factor: Math.round(factor * 1000) / 1000, weights, indivShare };
}

/** Log nach einem Entwicklungsschritt leeren */
export function clearTrainingLog(world: World): World {
  return { ...world, clubs: world.clubs.map((c) => (c.training.weeks ? { ...c, training: { ...c.training, log: {}, weeks: 0 } } : c)) };
}

export const intensityLabel = (i: TrainingIntensity) => INTENSITY[i].label;
export const loadLabel = (load: number) => (load >= 8 ? 'sehr hoch' : load >= 6 ? 'hoch' : load >= 4 ? 'mittel' : load >= 2 ? 'niedrig' : 'Erholungswoche');

/** Nächste noch nicht trainierte Woche eines Vereins (Montag) – für die Planung */
export function nextTrainingWeek(world: World, club: Club): string {
  const next = world.competition?.fixtures.find((f) => !f.result)?.date ?? world.date;
  let start = mondayOf(next < world.date ? world.date : next);
  const done = club.training.week?.start;
  if (done && done >= start) start = addDays(done, 7);
  return start;
}

/** Kaderschnitt von Fitness, Moral und Form */
export function rosterAverages(ps: Player[]): { fitness: number; morale: number; form: number } {
  const n = Math.max(1, ps.length);
  const avg = (f: (p: Player) => number) => r1(ps.reduce((s, p) => s + f(p), 0) / n);
  return { fitness: avg((p) => p.condition.fitness), morale: avg((p) => p.condition.morale), form: avg((p) => p.condition.form) };
}

/** Datum des nächsten Spieltags (irgendein Spiel der Liga) */
export function nextMatchDate(world: World): string | null {
  const comp = world.competition;
  if (!comp || comp.finished) return null;
  return comp.fixtures.find((f) => f.day === comp.day + 1)?.date ?? null;
}

export interface WeekStatus {
  /** Montag der anstehenden Woche */
  start: string;
  /** eigene Spiele dieser Woche (gespielt und offen) */
  fixtures: Fixture[];
  /** Training der Woche ist gelaufen */
  started: boolean;
  /** Die Woche muss gestartet werden, bevor der nächste Spieltag gespielt wird (eigenes Spiel in dieser Woche) */
  needsStart: boolean;
}

/** Stand des Wochenablaufs für einen Verein: Woche starten → Spieltage der Woche → nächste Woche */
export function weekStatus(world: World, clubId: string): WeekStatus | null {
  const date = nextMatchDate(world);
  const club = world.clubs.find((c) => c.id === clubId);
  if (!date || !club) return null;
  const start = mondayOf(date);
  const end = addDays(start, 7);
  const fixtures = world.competition!.fixtures.filter((f) => f.date >= start && f.date < end && (f.home === clubId || f.away === clubId));
  const started = (club.training.week?.start ?? '') >= start;
  return { start, fixtures, started, needsStart: !started && fixtures.some((f) => !f.result) };
}

/** Woche starten: Training aller Vereine bis zur Woche des nächsten Spieltags */
export function startWeek(world: World): World {
  const date = nextMatchDate(world);
  return date ? coverInjuries(healInjuries(runTraining(world, date), date), date) : world;
}
