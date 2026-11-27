import type { World, Player, Injury, InjuryKind, Matchplan, Fixture, News, Club } from '@ehm/schema';
import type { MatchResult } from './engine/types.ts';
import { addDays, daysBetween, hash01, formatDate } from './calendar.ts';
import { overall, ageOn } from './ratings.ts';
import { autoMatchplan, sanitizePlan } from './lineup.ts';
import { staffLevel } from './staff.ts';

/**
 * Verletzungen und medizinische Abteilung (Meilenstein 9, Konzept „verletzungen-und-medizin“):
 * - Im Spiel (Risiko nach Eiszeit, Anfälligkeit, Fitness, Alter, Härte des Gegners) und durch Überlastung im Training.
 * - Verletzt = nicht einsetzbar; danach „angeschlagen“: einsetzbar, wenn der Manager es erlaubt – mit Abzug und Rückfallrisiko.
 * - Arzt: genauere Prognose, weniger Rückfälle. Physiotherapeut: kürzere Ausfälle. Athletiktrainer: weniger Verletzungen.
 * - Ausfälle werden automatisch ersetzt (Co-Trainer), der Manager bekommt einen Hinweis.
 * Ziel: im Schnitt 1–2 Verletzte je Team, 4 gleichzeitig ist selten.
 */

export const INJURY: Record<InjuryKind, { label: string; days: [number, number]; relapse: number; game: number; training: number }> = {
  prellung: { label: 'Prellung', days: [3, 9], relapse: 0.05, game: 38, training: 8 },
  zerrung: { label: 'Zerrung', days: [6, 18], relapse: 0.12, game: 14, training: 36 },
  leiste: { label: 'Leistenprobleme', days: [7, 24], relapse: 0.15, game: 6, training: 20 },
  ruecken: { label: 'Rückenprobleme', days: [4, 16], relapse: 0.1, game: 4, training: 18 },
  muskelfaser: { label: 'Muskelfaserriss', days: [14, 32], relapse: 0.15, game: 6, training: 18 },
  gehirnerschuetterung: { label: 'Gehirnerschütterung', days: [7, 38], relapse: 0.25, game: 10, training: 0 },
  baender: { label: 'Bänderverletzung', days: [21, 52], relapse: 0.1, game: 11, training: 0 },
  bruch: { label: 'Bruch', days: [28, 63], relapse: 0.05, game: 9, training: 0 },
  schwer: { label: 'Schwere Verletzung', days: [100, 190], relapse: 0.05, game: 2, training: 0 },
};

export const INJ = {
  /** Grundrisiko je Spiel für einen Feldspieler mit 16 Minuten Eiszeit */
  GAME_BASE: 0.011,
  /** Grundrisiko je Trainingswoche bei mittlerer Belastung (5) */
  TRAINING_BASE: 0.0042,
  /** Torhüter verletzen sich seltener */
  GOALIE: 0.35,
  /** Anteil der Ausfallzeit, nach dem ein Spieler angeschlagen einsetzbar ist */
  KNOCK_SHARE: 0.72,
  /** Fitnessabzug (Punkte) für angeschlagene Spieler im Spiel */
  KNOCK_FITNESS: 15,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const injuryLabel = (k: InjuryKind) => INJURY[k].label;

/** Zustand eines Spielers an einem Tag */
export function injuryStatus(p: Player, date: string): 'fit' | 'injured' | 'knock' {
  const i = p.injury;
  if (!i || date >= i.out) return 'fit';
  return date >= i.knock ? 'knock' : 'injured';
}

/** Kann der Spieler an diesem Tag spielen? (angeschlagen nur, wenn erlaubt) */
export function isAvailable(p: Player, date: string): boolean {
  const st = injuryStatus(p, date);
  return st === 'fit' || (st === 'knock' && !!p.injury?.play);
}

/** Medizinische Abteilung eines Vereins (Werte 1–20, 0 = unbesetzt) */
export function medicalStaff(world: World, clubId: string): { doctor: number; physio: number; athletics: number } {
  return { doctor: staffLevel(world, clubId, 'doctor'), physio: staffLevel(world, clubId, 'physio'), athletics: staffLevel(world, clubId, 'athleticsCoach') };
}

/** Faktoren der medizinischen Abteilung (für Berechnung und Anzeige) */
export function medicalFactors(world: World, clubId: string): { risk: number; duration: number; relapse: number; accuracy: number } {
  const m = medicalStaff(world, clubId);
  return {
    // Athletiktrainer: 10 = neutral, 20 = −25 %, unbesetzt = +30 %
    risk: m.athletics ? 1.25 - m.athletics * 0.025 : 1.3,
    // Physiotherapeut: 10 = neutral, 20 = −20 %, unbesetzt = +25 %
    duration: m.physio ? 1.2 - m.physio * 0.02 : 1.25,
    // Arzt: Rückfallrisiko und Genauigkeit der Prognose (halbe Spannweite als Anteil der Ausfallzeit)
    relapse: m.doctor ? 1.3 - m.doctor * 0.03 : 1.4,
    accuracy: m.doctor ? 0.45 - m.doctor * 0.018 : 0.5,
  };
}

/** Anfälligkeit (verstecktes Merkmal, ~90 im Schnitt) als Faktor */
const proneness = (p: Player) => clamp(0.5 + p.hidden.injuryProneness / 180, 0.55, 1.7);
const ageFactor = (p: Player, date: string) => { const a = ageOn(p.birthDate, date); return a >= 33 ? 1.25 : a >= 30 ? 1.1 : 1; };
const fitnessFactor = (p: Player) => (p.condition.fitness < 80 ? 1.45 : p.condition.fitness < 88 ? 1.15 : 1);

function pickKind(key: string, cause: 'game' | 'training', goalie: boolean): InjuryKind {
  const kinds = (Object.keys(INJURY) as InjuryKind[]).filter((k) => INJURY[k][cause] > 0 && !(goalie && (k === 'bruch' || k === 'gehirnerschuetterung') && hash01(`${key}:gk`) < 0.5));
  const total = kinds.reduce((s, k) => s + INJURY[k][cause], 0);
  let r = hash01(`${key}:art`) * total;
  for (const k of kinds) { r -= INJURY[k][cause]; if (r <= 0) return k; }
  return kinds[0];
}

/** Neue Verletzung anlegen (Dauer, Prognose, ab wann angeschlagen) */
export function makeInjury(world: World, p: Player, date: string, cause: 'game' | 'training', key: string): Injury {
  const kind = pickKind(key, cause, p.position === 'G');
  const [lo, hi] = INJURY[kind].days;
  const med = medicalFactors(world, p.contract?.clubId ?? '');
  const days = Math.max(2, Math.round((lo + (hi - lo) * Math.pow(hash01(`${key}:dauer`), 1.3)) * med.duration));
  const knockDays = days <= 5 ? days : Math.round(days * INJ.KNOCK_SHARE);
  const w = med.accuracy, a = hash01(`${key}:prognose`);
  const est: [number, number] = [Math.max(1, Math.round(days * (1 - w * a))), Math.max(2, Math.round(days * (1 + w * (1 - a))))];
  return { kind, date, out: addDays(date, days), knock: addDays(date, knockDays), est, play: false, relapses: 0, cause };
}

/** Restdauer-Prognose als Text, z. B. „noch 1–2 Wochen“ */
export function prognosisText(inj: Injury, date: string): string {
  const passed = daysBetween(inj.date, date);
  const lo = Math.max(0, inj.est[0] - passed), hi = Math.max(1, inj.est[1] - passed);
  if (hi <= 3) return 'noch wenige Tage';
  if (inj.kind === 'schwer' && hi > 80) return 'Saisonaus droht';
  const wk = (d: number) => Math.max(1, Math.round(d / 7));
  if (hi <= 10) return `noch ${Math.max(1, lo)}–${hi} Tage`;
  return wk(lo) === wk(hi) ? `noch ca. ${wk(hi)} ${wk(hi) === 1 ? 'Woche' : 'Wochen'}` : `noch ${wk(lo)}–${wk(hi)} Wochen`;
}

const say = (date: string, text: string): News => ({ date, kind: 'info', text, mine: true });
const pushNews = (world: World, items: News[]): World => (items.length ? { ...world, market: { ...world.market, news: [...items.reverse(), ...world.market.news].slice(0, 120) } } : world);
const humanClub = (world: World) => world.clubs.find((c) => c.controller.type === 'human')?.id;

/** Verletzungen nach den Spielen eines Spieltags (und Rückfälle angeschlagener Spieler) */
export function gameInjuries(world: World, games: { fixture: Fixture; result: MatchResult }[], date: string): World {
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const clubs = new Map(world.clubs.map((c) => [c.id, c]));
  const changed = new Map<string, Player>();
  const news: News[] = [];
  const me = humanClub(world);
  for (const { fixture, result } of games) {
    for (const s of result.playerStats) {
      if (s.toi <= 0) continue;
      const p = byId.get(s.playerId);
      if (!p?.contract) continue;
      const clubId = p.contract.clubId;
      const opp = clubs.get(clubId === fixture.home ? fixture.away : fixture.home);
      const key = `${fixture.id}:${p.id}`;
      // angeschlagen gespielt → Rückfallrisiko
      if (p.injury && injuryStatus(p, date) === 'knock') {
        const med = medicalFactors(world, clubId);
        if (hash01(`${key}:rueckfall`) < INJURY[p.injury.kind].relapse * 1.5 * med.relapse) {
          const total = daysBetween(p.injury.date, p.injury.out);
          const extra = Math.max(4, Math.round(total * 0.5));
          const out = addDays(date, extra);
          changed.set(p.id, { ...p, injury: { ...p.injury, out, knock: out, play: false, relapses: p.injury.relapses + 1, est: [daysBetween(p.injury.date, out) - 2, daysBetween(p.injury.date, out) + 4] } });
          if (clubId === me) news.push(say(date, `Rückfall: ${p.firstName} ${p.lastName} (${INJURY[p.injury.kind].label}) fällt weitere ${Math.round(extra / 7) || 1} Woche(n) aus.`));
        }
        continue;
      }
      if (p.injury) continue;
      const phys = opp?.matchplan?.tactics.physicality === 'hard' ? 1.25 : opp?.matchplan?.tactics.physicality === 'fair' ? 0.85 : 1;
      const exposure = p.position === 'G' ? INJ.GOALIE : clamp(s.toi / 960, 0.3, 1.6);
      const risk = INJ.GAME_BASE * exposure * proneness(p) * fitnessFactor(p) * ageFactor(p, date) * phys * medicalFactors(world, clubId).risk;
      if (hash01(`${key}:verletzt`) >= risk) continue;
      const injury = makeInjury(world, p, date, 'game', key);
      changed.set(p.id, { ...p, injury });
      if (clubId === me) news.push(say(date, `Verletzt: ${p.firstName} ${p.lastName} – ${INJURY[injury.kind].label} im Spiel gegen ${opp?.shortName ?? ''} (Prognose ${injury.est[0]}–${injury.est[1]} Tage).`));
    }
  }
  if (!changed.size) return world;
  return pushNews({ ...world, players: world.players.map((p) => changed.get(p.id) ?? p) }, news);
}

/** Überlastungsverletzungen einer Trainingswoche (Belastung 0–9 je Verein) */
export function trainingInjuries(world: World, start: string, load: Map<string, number>, boost = 1): World {
  const changed = new Map<string, Player>();
  const news: News[] = [];
  const me = humanClub(world);
  const med = new Map<string, number>();
  for (const p of world.players) {
    const clubId = p.contract?.clubId;
    if (!clubId || p.injury || !load.has(clubId)) continue;
    if (!med.has(clubId)) med.set(clubId, medicalFactors(world, clubId).risk);
    const l = Math.max(0.5, load.get(clubId)! * boost) / 5;
    const risk = INJ.TRAINING_BASE * Math.pow(l, 1.5) * proneness(p) * fitnessFactor(p) * ageFactor(p, start) * med.get(clubId)! * (p.position === 'G' ? 0.6 : 1);
    const key = `${start}:${p.id}:training`;
    if (hash01(key) >= risk) continue;
    const injury = makeInjury(world, p, addDays(start, 2), 'training', key);
    changed.set(p.id, { ...p, injury });
    if (clubId === me) news.push(say(start, `Verletzt im Training: ${p.firstName} ${p.lastName} – ${INJURY[injury.kind].label} (Prognose ${injury.est[0]}–${injury.est[1]} Tage).`));
  }
  if (!changed.size) return world;
  return pushNews({ ...world, players: world.players.map((p) => changed.get(p.id) ?? p) }, news);
}

/** Genesene Spieler: Verletzung endet, Eintrag in die Historie */
export function healInjuries(world: World, date: string): World {
  const me = humanClub(world);
  const news: News[] = [];
  let any = false;
  const players = world.players.map((p) => {
    if (!p.injury || date < p.injury.out) return p;
    any = true;
    if (p.contract?.clubId === me) news.push(say(p.injury.out, `Wieder fit: ${p.firstName} ${p.lastName} (${INJURY[p.injury.kind].label}) steht wieder zur Verfügung.`));
    const entry = { kind: p.injury.kind, date: p.injury.date, days: daysBetween(p.injury.date, p.injury.out) };
    return { ...p, injury: null, injuries: [...p.injuries, entry].slice(-20) };
  });
  return any ? pushNews({ ...world, players }, news) : world;
}

/**
 * Aufstellung ohne nicht einsetzbare Spieler: Ausfälle werden durch den besten freien Spieler
 * derselben Gruppe ersetzt (Sturm, Verteidigung, Tor). Gibt den Plan und die Wechsel zurück.
 */
export function coverPlan(plan: Matchplan, roster: Player[], date: string): { plan: Matchplan; swaps: { out: string; in: string }[] } {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
  const missing = [...dressed].filter((id) => { const p = byId.get(id); return !p || !isAvailable(p, date); });
  if (!missing.length) return { plan, swaps: [] };
  const group = (p: Player) => (p.position === 'G' ? 'G' : p.position === 'LD' || p.position === 'RD' ? 'D' : 'F');
  const used = new Set(dressed);
  const free = roster.filter((p) => !used.has(p.id) && isAvailable(p, date)).sort((a, b) => overall(b) - overall(a));
  const next: Matchplan = structuredClone(plan);
  const swaps: { out: string; in: string }[] = [];
  const replace = (outId: string, inId: string) => {
    next.forwardLines = next.forwardLines.map((l) => l.map((x) => (x === outId ? inId : x)) as [string, string, string]);
    next.defensePairs = next.defensePairs.map((l) => l.map((x) => (x === outId ? inId : x)) as [string, string]);
    next.goalies = next.goalies.map((x) => (x === outId ? inId : x)) as [string, string];
  };
  for (const id of missing) {
    const p = byId.get(id);
    const g = p ? group(p) : 'F';
    const sub = free.find((x) => !used.has(x.id) && group(x) === g) ?? (g !== 'G' ? free.find((x) => !used.has(x.id) && group(x) !== 'G') : undefined);
    if (!sub) continue; // niemand mehr da – der Spieler muss ran
    used.add(sub.id);
    replace(id, sub.id);
    swaps.push({ out: id, in: sub.id });
  }
  return { plan: sanitizePlan(next, byId), swaps };
}

/** Vor einem Spieltag: Ausfälle in allen Aufstellungen ersetzen; KI baut nach Rückkehrern neu auf */
export function coverInjuries(world: World, date: string): World {
  const news: News[] = [];
  const playoffs = !!world.competition?.finalStandings;
  let players = world.players;
  const clubs = world.clubs.map((c): Club => {
    if (!c.matchplan) return c;
    let roster = players.filter((p) => p.contract?.clubId === c.id);
    if (c.controller.type === 'ai') {
      // KI: angeschlagene Spieler nur in den Playoffs einsetzen
      const want = playoffs;
      if (roster.some((p) => injuryStatus(p, date) === 'knock' && !!p.injury?.play !== want)) {
        const ids = new Set(roster.filter((p) => injuryStatus(p, date) === 'knock').map((p) => p.id));
        players = players.map((p) => (ids.has(p.id) && p.injury ? { ...p, injury: { ...p.injury, play: want } } : p));
        roster = players.filter((p) => p.contract?.clubId === c.id);
      }
      const dressed = new Set([...c.matchplan.forwardLines.flat(), ...c.matchplan.defensePairs.flat(), ...c.matchplan.goalies]);
      const blocked = roster.some((p) => dressed.has(p.id) && !isAvailable(p, date));
      const returned = roster.some((p) => !dressed.has(p.id) && isAvailable(p, date) && p.injuries.length > 0 && daysBetween(p.injuries.at(-1)!.date, date) <= p.injuries.at(-1)!.days + 7);
      if (blocked || returned) {
        try {
          const avail = roster.filter((p) => isAvailable(p, date));
          const plan = autoMatchplan(avail, {
            countryCode: 'DE', importSlotsGame: world.countries[0].rules.importSlotsGame, tactics: c.matchplan.tactics,
            keep: { specialTeams: c.matchplan.specialTeams, matchups: c.matchplan.matchups, rules: c.matchplan.rules, captain: c.matchplan.captain },
          });
          return { ...c, matchplan: plan };
        } catch {
          return { ...c, matchplan: coverPlan(c.matchplan, roster, date).plan };
        }
      }
      return c;
    }
    const { plan, swaps } = coverPlan(c.matchplan, roster, date);
    if (!swaps.length) return c;
    const byId = new Map(roster.map((p) => [p.id, p]));
    for (const s of swaps) {
      const o = byId.get(s.out), n = byId.get(s.in);
      if (o && n) news.push(say(date, `Co-Trainer: ${o.lastName} fällt aus${o.injury ? ` (${INJURY[o.injury.kind].label})` : ''} – ${n.firstName} ${n.lastName} rückt in die Aufstellung (${formatDate(date)}).`));
    }
    return { ...c, matchplan: plan };
  });
  return pushNews({ ...world, clubs, players }, news);
}

/** Spieler für die Simulation: angeschlagene Spieler mit Abzug */
export function matchReady(p: Player, date: string): Player {
  if (injuryStatus(p, date) !== 'knock') return p;
  return { ...p, condition: { ...p.condition, fitness: Math.max(40, p.condition.fitness - INJ.KNOCK_FITNESS) } };
}

/** Anzahl nicht einsetzbarer Spieler je Verein (für Statistik und Kalibrierung) */
export function injuredCount(world: World, clubId: string, date = world.date): number {
  return world.players.filter((p) => p.contract?.clubId === clubId && injuryStatus(p, date) !== 'fit').length;
}
