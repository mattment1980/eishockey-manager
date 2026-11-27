import type { World, Player, SkaterAttribute, GoalieAttribute, News, TestDay } from '@ehm/schema';
import { SKATER_ATTRIBUTES, GOALIE_ATTRIBUTES } from '@ehm/schema';
import { overall, toDisplay, ageOn, talentStars } from './ratings.ts';
import { hash01, monthsBetween, monthKey } from './calendar.ts';
import { hasTrait } from './chemistry.ts';

/**
 * Spielerentwicklung und Alterung (Konzept „spielerentwicklung“):
 * - Während der Saison (September bis April) monatlich kleine Schritte, im Sommer ein großer Schritt.
 * - Junge Spieler wachsen Richtung Potenzial; Talent bestimmt die Obergrenze UND das Tempo.
 * - Treiber: Alter, Eiszeit, Trainer (Entwicklung, „Ausbilder“), Mentor im Team, Perfektionist, Professionalität.
 * - Physis entwickelt sich früh und baut ab etwa 30 ab; Technik später; mentale Werte wachsen am längsten.
 * Alle Werte bleiben ganzzahlig: Bruchteile werden deterministisch gerundet (Zufall aus Spieler, Monat, Attribut).
 */

export const DEV = {
  /** Anteil der Lücke zum Potenzial, der pro Jahr geschlossen wird (vor allen Faktoren) */
  YEAR_RATE: 0.19,
  /** Anteil des Jahres, der auf die 8 Saisonmonate entfällt (Rest im Sommer) */
  SEASON_SHARE: 0.3,
  /** Streuung der „Sommerform“ (log-normal, Mittelwert 1): wie gut ein Spieler den Sommer genutzt hat */
  SUMMER_FORM_SD: 0.55,
  SEASON_MONTHS: 8,
  /** Tempo nach Talent: 0,5 Sterne → 0,6 … 3 Sterne → 1,0 … 5 Sterne → 1,32 */
  TALENT_MIN: 0.6,
  TALENT_PER_STAR: 0.16,
  /** Abbau je Jahr ab Altersgrenze (interne Punkte je Jahr über der Grenze) */
  DECLINE_PHYSICAL_FROM: 29,
  DECLINE_PHYSICAL: 3,
  DECLINE_TECH_FROM: 31,
  DECLINE_TECH: 1.8,
  DECLINE_MENTAL_FROM: 35,
  DECLINE_MENTAL: 1,
  /** Torhüter reifen und altern etwa zwei Jahre später */
  GOALIE_AGE_SHIFT: 2,
  /** Chance auf einen Entwicklungssprung im Sommer (bei großer Lücke) */
  JUMP_CHANCE: 0.12,
} as const;

type Cls = 'physical' | 'technical' | 'mental' | 'fixed';

const SKATER_CLASS: Record<SkaterAttribute, Cls> = {
  skating: 'physical', agility: 'physical', strength: 'physical', stamina: 'physical',
  puckHandling: 'technical', passing: 'technical', shotPower: 'technical', shotAccuracy: 'technical', faceoffs: 'technical',
  defPositioning: 'technical', stickChecking: 'technical', bodyChecking: 'technical', shotBlocking: 'technical',
  hockeyIQ: 'mental', anticipation: 'mental', composure: 'mental', workRate: 'mental',
  discipline: 'fixed', leadership: 'fixed',
};
const GOALIE_CLASS: Record<GoalieAttribute, Cls> = {
  reflexes: 'physical', agility: 'physical',
  positioning: 'technical', lowShots: 'technical', glove: 'technical', blocker: 'technical', reboundControl: 'technical', puckPlaying: 'technical',
  concentration: 'mental', composure: 'mental',
};

/** Wachstumsfaktor nach Alter und Attributklasse (0 … 1) */
export function growthByAge(age: number, cls: Cls): number {
  if (cls === 'fixed') return 0;
  if (cls === 'physical') return age <= 22 ? 1 : age <= 24 ? 0.6 : age <= 26 ? 0.25 : 0;
  if (cls === 'technical') return age <= 23 ? 1 : age <= 26 ? 0.65 : age <= 28 ? 0.3 : 0.08;
  return age <= 21 ? 0.7 : age <= 27 ? 1 : age <= 31 ? 0.55 : 0.25;
}

/** Abbau je Jahr in internen Punkten */
export function declineByAge(age: number, cls: Cls): number {
  if (cls === 'physical') return Math.max(0, age - DEV.DECLINE_PHYSICAL_FROM) * DEV.DECLINE_PHYSICAL;
  if (cls === 'technical') return Math.max(0, age - DEV.DECLINE_TECH_FROM) * DEV.DECLINE_TECH;
  if (cls === 'mental') return Math.max(0, age - DEV.DECLINE_MENTAL_FROM) * DEV.DECLINE_MENTAL;
  return 0;
}

export const talentSpeed = (potential: number) => DEV.TALENT_MIN + (talentStars(potential) - 0.5) * DEV.TALENT_PER_STAR;

/** Gründe für das Entwicklungstempo (für Anzeige und Bericht) */
export interface DevFactors {
  age: number;
  talent: number;
  playtime: number;
  coach: number;
  mentor: number;
  personality: number;
  /** Produkt aller Faktoren */
  total: number;
  /** Abstand zum Potenzial (intern) */
  gap: number;
}

/** Eiszeitfaktor aus der laufenden Saison (Tribüne bremst, viel Eiszeit fördert) */
function playtimeFactor(world: World, p: Player): number {
  const st = world.competition?.stats.regular[p.id];
  const played = world.competition?.fixtures.filter((f) => f.result && f.stage === 'regular' && p.contract && (f.home === p.contract.clubId || f.away === p.contract.clubId)).length ?? 0;
  if (!p.contract) return 0.75; // vereinslos: nur Eigentraining
  if (played < 4) return 1; // Saison hat kaum begonnen
  if (!st || st.gp === 0) return 0.7;
  const share = st.gp / played;
  if (p.position === 'G') return 0.75 + 0.5 * Math.min(1, st.gs / Math.max(1, played * 0.6));
  const minutes = st.toi / 60 / st.gp;
  return (0.75 + 0.25 * share) * (minutes >= 16 ? 1.15 : minutes >= 11 ? 1.05 : minutes >= 7 ? 0.95 : 0.85);
}

/** Faktoren des Entwicklungstempos eines Spielers */
export function devFactors(world: World, p: Player, date: string): DevFactors {
  const age = ageOn(p.birthDate, date);
  const clubId = p.contract?.clubId;
  const staff = clubId ? world.staff.filter((s) => s.contract?.clubId === clubId) : [];
  const devCoach = staff.filter((s) => s.role === 'assistantCoach' || s.role === 'youthCoach' || s.role === 'goalieCoach').reduce((m, s) => Math.max(m, toDisplay(s.ratings.development)), 0) || 8;
  const ausbilder = staff.some((s) => s.traits.some((t) => t.id === 'ausbilder' && t.strength >= 50));
  const coach = (0.85 + (devCoach / 20) * 0.3) * (ausbilder && age <= 23 ? 1.1 : 1);
  const mentorHere = clubId && age <= 23
    ? world.players.some((m) => m.id !== p.id && m.contract?.clubId === clubId && hasTrait(m, 'mentor') && ageOn(m.birthDate, date) >= 27)
    : false;
  const mentor = mentorHere ? 1.08 : 1;
  const personality = (0.85 + (p.hidden.professionalism / 200) * 0.3) * (hasTrait(p, 'perfektionist') ? 1.1 : 1);
  const talent = talentSpeed(p.hidden.potential);
  const playtime = playtimeFactor(world, p);
  return { age, talent, playtime, coach, mentor, personality, total: talent * playtime * coach * mentor * personality, gap: Math.max(0, p.hidden.potential - overall(p)) };
}

type AttrMap = Record<string, number>;

/** Attribute eines Spielers mit ihren Klassen */
function attrsOf(p: Player): { group: 'skater' | 'goalie'; keys: readonly string[]; cls: Record<string, Cls> }[] {
  const out: { group: 'skater' | 'goalie'; keys: readonly string[]; cls: Record<string, Cls> }[] = [{ group: 'skater', keys: SKATER_ATTRIBUTES, cls: SKATER_CLASS }];
  if (p.position === 'G' && p.goalie) out.push({ group: 'goalie', keys: GOALIE_ATTRIBUTES, cls: GOALIE_CLASS });
  return out;
}

/** Deterministisch runden: 2,3 wird mit 30 % Wahrscheinlichkeit zu 3 */
const roundBy = (v: number, key: string) => {
  const f = Math.floor(v);
  return f + (hash01(key) < v - f ? 1 : 0);
};

/**
 * Ein Entwicklungsschritt: `share` = Anteil eines Jahres (Monat ≈ 0,05, Sommer ≈ 0,6).
 * `declineShare` = Anteil des jährlichen Abbaus (nur im Sommer 1, sonst 0).
 */
export function developPlayer(world: World, p: Player, date: string, share: number, declineShare: number, tag: string): Player {
  const f = devFactors(world, p, date);
  // Sommerform: im Mittel 1, einzelne Spieler nutzen den Sommer viel besser oder schlechter (nur im Sommerschritt)
  const summerForm = declineShare > 0 ? summerFormOf(`${tag}:${p.id}`) : 1;
  const ageG = p.position === 'G' ? f.age - DEV.GOALIE_AGE_SHIFT : f.age;
  const ovr = overall(p);
  const gap = Math.max(0, p.hidden.potential - ovr);
  // gewünschter Zuwachs der Gesamtstärke in diesem Schritt
  let growth = gap * DEV.YEAR_RATE * share * f.total * summerForm;
  // Entwicklungssprung im Sommer
  const jump = declineShare > 0 && gap > 12 && ageG <= 23 && hash01(`${tag}:${p.id}:sprung`) < DEV.JUMP_CHANCE * f.talent;
  if (jump) growth += gap * 0.25;
  const noise = (k: string) => 0.6 + hash01(`${tag}:${p.id}:${k}`) * 0.8; // 0,6 … 1,4
  const next = { skater: { ...p.skater } as AttrMap, goalie: p.goalie ? ({ ...p.goalie } as AttrMap) : undefined };

  for (const g of attrsOf(p)) {
    const vals = g.group === 'skater' ? next.skater : next.goalie!;
    // Wachstum auf die Attribute verteilen: nach Altersfaktor der Klasse, normiert, damit die Gesamtstärke ≈ growth steigt
    const weights = g.keys.map((k) => growthByAge(ageG, g.cls[k]));
    const mean = weights.reduce((a, b) => a + b, 0) / Math.max(1, weights.filter((w) => w > 0).length || 1);
    g.keys.forEach((k, i) => {
      const cls = g.cls[k];
      let delta = mean > 0 ? growth * (weights[i] / mean) * noise(k) : 0;
      delta -= declineByAge(ageG, cls) * declineShare * (1.15 - p.hidden.professionalism / 400) * noise(`${k}:abbau`) * (2 - Math.min(1.6, summerForm));
      if (k === 'leadership') delta += (f.age >= 22 ? 1.5 : 0.5) * share;
      if (k === 'discipline') delta += (hash01(`${tag}:${p.id}:disz`) - 0.5) * 4 * share;
      const v = vals[k] + roundBy(delta, `${tag}:${p.id}:${k}:r`);
      vals[k] = Math.max(1, Math.min(200, v));
    });
  }
  // Torhüter: Feldspielerwerte sind Nebensache, nur Komposition/Führung zählen – nicht künstlich wachsen lassen
  if (p.position === 'G') {
    for (const k of SKATER_ATTRIBUTES) if (k !== 'composure' && k !== 'leadership' && k !== 'discipline') next.skater[k] = p.skater[k];
  }
  // nie über das Potenzial hinaus wachsen (Abbau bleibt möglich)
  let np: Player = { ...p, skater: next.skater as Player['skater'], goalie: next.goalie as Player['goalie'] };
  const after = overall(np);
  if (after > Math.max(ovr, p.hidden.potential)) np = { ...np, skater: p.skater, goalie: p.goalie };
  return np;
}

/** Log-normaler Faktor mit Mittelwert 1 (deterministisch aus dem Schlüssel) */
export function summerFormOf(key: string): number {
  const u1 = Math.max(1e-6, hash01(`${key}:u1`)), u2 = hash01(`${key}:u2`);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const sd = DEV.SUMMER_FORM_SD;
  return Math.exp(z * sd - (sd * sd) / 2);
}

const monthIn = (month: string) => {
  const m = Number(month.slice(5, 7));
  return m >= 9 || m <= 4; // September bis April
};

/** Verlauf fortschreiben (ein Eintrag je Monat, höchstens 36) */
function logHistory(p: Player, month: string): Player {
  const h = p.dev.history.filter((x) => x.month !== month);
  return { ...p, dev: { ...p.dev, history: [...h, { month, ovr: Math.round(overall(p) * 10) / 10 }].slice(-36) } };
}

/** Monatliche Entwicklung für alle abgeschlossenen Monate zwischen zwei Daten (während der Saison) */
export function developMonths(world: World, from: string, to: string): World {
  const months = monthsBetween(monthKey(from), monthKey(to)).filter(monthIn);
  if (!months.length) return world;
  let players = world.players;
  for (const m of months) {
    const date = `${m}-28`;
    players = players.map((p) => logHistory(developPlayer({ ...world, players }, p, date, DEV.SEASON_SHARE / DEV.SEASON_MONTHS, 0, m), m));
  }
  return { ...world, players };
}

export interface DevReportLine {
  playerId: string;
  before: number;
  after: number;
  jump: boolean;
}

/**
 * Großer Sommerschritt: Wachstum (Rest des Jahres) und Abbau mit dem Alter.
 * Der Referenzstand für die Pfeile wird erst beim Saisonwechsel neu gesetzt (`resetDevRef`),
 * damit in der Sommerpause die Entwicklung des ganzen Jahres sichtbar bleibt.
 */
export function developSummer(world: World, year: number): { world: World; report: Map<string, DevReportLine> } {
  const date = `${year}-07-15`;
  const tag = `sommer${year}`;
  const report = new Map<string, DevReportLine>();
  const players = world.players.map((p) => {
    const before = overall(p);
    const gap = Math.max(0, p.hidden.potential - before);
    const np = developPlayer(world, p, date, 1 - DEV.SEASON_SHARE, 1, tag);
    const after = overall(np);
    const jump = after - before > Math.max(6, gap * 0.3);
    report.set(p.id, { playerId: p.id, before, after, jump });
    return logHistory(np, `${year}-07`);
  });
  return { world: { ...world, players }, report };
}

/** Nachrichten zum Sommerschritt für den eigenen Verein */
export function summerNews(world: World, report: Map<string, DevReportLine>, clubId: string, date: string): News[] {
  const mine = world.players.filter((p) => p.contract?.clubId === clubId || p.nextContract?.clubId === clubId);
  const lines = mine.map((p) => ({ p, r: report.get(p.id)! })).filter((x) => x.r);
  const d = (x: { r: DevReportLine }) => x.r.after - x.r.before;
  const up = lines.filter((x) => d(x) >= 4).sort((a, b) => d(b) - d(a)).slice(0, 4);
  const down = lines.filter((x) => d(x) <= -4).sort((a, b) => d(a) - d(b)).slice(0, 3);
  const fmt = (v: number) => (v / 10).toFixed(1).replace('.', ',');
  const news: News[] = [];
  for (const x of up) news.push({ date, kind: 'info', mine: true, text: `${x.r.jump ? 'Entwicklungssprung' : 'Sommertraining'}: ${x.p.firstName} ${x.p.lastName} verbessert sich um ${fmt(d(x))} auf ${fmt(x.r.after)}.` });
  for (const x of down) news.push({ date, kind: 'info', mine: true, text: `Alter macht sich bemerkbar: ${x.p.firstName} ${x.p.lastName} verliert ${fmt(-d(x))} (jetzt ${fmt(x.r.after)}).` });
  return news;
}

/** Veränderung eines Attributs seit Saisonbeginn (für Pfeile); undefined = kein Referenzwert */
export function attrChange(p: Player, key: string, goalie = false): number | undefined {
  const ref = p.dev.ref[goalie ? `g.${key}` : key];
  if (ref === undefined) return undefined;
  const now = goalie ? p.goalie?.[key as GoalieAttribute] : p.skater[key as SkaterAttribute];
  return now === undefined ? undefined : now - ref;
}

/** Veränderung der Gesamtstärke seit Saisonbeginn (intern) */
export function ovrChange(p: Player): number | undefined {
  if (!Object.keys(p.dev.ref).length) return undefined;
  const refPlayer: Player = {
    ...p,
    skater: { ...p.skater, ...Object.fromEntries(Object.entries(p.dev.ref).filter(([k]) => !k.startsWith('g.'))) } as Player['skater'],
    goalie: p.goalie ? ({ ...p.goalie, ...Object.fromEntries(Object.entries(p.dev.ref).filter(([k]) => k.startsWith('g.')).map(([k, v]) => [k.slice(2), v])) } as Player['goalie']) : undefined,
  };
  return overall(p) - overall(refPlayer);
}

const refOf = (p: Player): Record<string, number> => ({ ...p.skater, ...(p.goalie ? Object.fromEntries(Object.entries(p.goalie).map(([k, v]) => [`g.${k}`, v])) : {}) });

/** Saisonwechsel: aktueller Stand wird Referenz für die Entwicklungspfeile der neuen Saison */
export function resetDevRef(world: World): World {
  return { ...world, players: world.players.map((p) => ({ ...p, dev: { ...p.dev, ref: refOf(p) } })) };
}

/** Referenzstand für Spieler ohne Verlauf setzen (neue Welt, alte Spielstände) */
export function seedDevRef(world: World): World {
  if (!world.players.some((p) => !Object.keys(p.dev.ref).length)) return world;
  return {
    ...world,
    players: world.players.map((p) => (Object.keys(p.dev.ref).length ? p : {
      ...p,
      dev: { ...p.dev, ref: refOf(p) },
    })),
  };
}

/** Tag der Leistungstests: Vorher/Nachher je Spieler des Vereins (für die Inszenierung in der Sommerpause) */
export function buildTestDay(before: World, after: World, report: Map<string, DevReportLine>, clubId: string): TestDay {
  const prev = new Map(before.players.map((p) => [p.id, p]));
  const lines: TestDay['lines'] = [];
  for (const p of after.players) {
    if (p.contract?.clubId !== clubId && p.nextContract?.clubId !== clubId) continue;
    const r = report.get(p.id);
    const o = prev.get(p.id);
    if (!r || !o) continue;
    const attrs: Record<string, number> = {};
    for (const k of SKATER_ATTRIBUTES) if (p.skater[k] !== o.skater[k]) attrs[k] = p.skater[k] - o.skater[k];
    if (p.goalie && o.goalie) for (const k of GOALIE_ATTRIBUTES) if (p.goalie[k] !== o.goalie[k]) attrs[`g.${k}`] = p.goalie[k] - o.goalie[k];
    lines.push({ playerId: p.id, before: Math.round(r.before * 10) / 10, after: Math.round(r.after * 10) / 10, jump: r.jump, attrs });
  }
  return { clubId, seen: false, lines };
}
