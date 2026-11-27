import {
  SCHEMA_VERSION, SKATER_ATTRIBUTES, GOALIE_ATTRIBUTES,
  type World, type Player, type Position, type Staff, type Club, type Trait, type TraitId,
  type SkaterAttribute, type GoalieAttribute, type StaffRole, type Manager,
} from '@ehm/schema';
import { Rng, clamp, autoMatchplan, beginSeason, seedChemistry, seedFamiliarity, seedDevRef } from '@ehm/core';
import { DEFAULT_TACTICS, EMPTY_MARKET, makeContract, TrainingSchema, type Tactics } from '@ehm/schema';
import { NAMES, IMPORT_ORIGINS } from './names.ts';
import { COUNTRY_DE, LEAGUE_DEL2_MODEL, CLUBS_DEL2_MODEL, BUDGET_BY_PROFILE } from './del2.ts';

type Boost = Partial<Record<SkaterAttribute, number>>;

const POSITION_BASE: Record<'C' | 'W' | 'D', Boost> = {
  C: { faceoffs: 10, shotBlocking: -12 },
  W: { faceoffs: -45, shotBlocking: -12, defPositioning: -6 },
  D: { faceoffs: -65, shotAccuracy: -12, puckHandling: -6, shotBlocking: 12, defPositioning: 10, strength: 6 },
};

const ARCHETYPES: Record<'C' | 'W' | 'D', Boost[]> = {
  C: [
    { passing: 12, hockeyIQ: 10, puckHandling: 8, bodyChecking: -10, strength: -5 }, // Spielmacher
    { defPositioning: 10, faceoffs: 10, anticipation: 6, workRate: 6, shotPower: -5 }, // Zwei-Wege
    { strength: 12, bodyChecking: 10, shotPower: 8, agility: -6, passing: -4 }, // Power-Center
  ],
  W: [
    { shotAccuracy: 14, shotPower: 10, agility: 4, defPositioning: -10, bodyChecking: -6 }, // Sniper
    { strength: 10, bodyChecking: 12, shotPower: 6, workRate: 4, agility: -6 }, // Power Forward
    { workRate: 14, bodyChecking: 10, defPositioning: 8, stickChecking: 4, shotAccuracy: -10, puckHandling: -8 }, // Grinder
    { skating: 14, agility: 10, puckHandling: 4, strength: -8 }, // Flitzer
  ],
  D: [
    { passing: 10, shotPower: 12, skating: 6, puckHandling: 8, defPositioning: -8, bodyChecking: -4 }, // offensiv
    { defPositioning: 10, shotBlocking: 14, strength: 8, bodyChecking: 8, puckHandling: -10, passing: -4 }, // defensiv
    {}, // Zwei-Wege
  ],
};

const PLAYER_TRAITS: TraitId[] = [
  'leader', 'mentor', 'teamplayer', 'freigeist', 'hitzkopf', 'diva', 'egoist', 'stillerArbeiter',
  'kabinenclown', 'perfektionist', 'bigGame', 'nervenbuendel', 'kaempfer', 'schoenwetter', 'heimstark',
];
const STAFF_TRAITS: TraitId[] = ['disziplinfanatiker', 'spielerversteher', 'motivator', 'ausbilder', 'taktikfuchs'];

const r200 = (v: number) => clamp(Math.round(v), 1, 200);

/** Spielstile der KI-Trainer, damit sich die Gegner unterschiedlich anfühlen. */
const TACTIC_STYLES: (() => Tactics)[] = [
  () => ({ ...DEFAULT_TACTICS }),
  () => ({ ...DEFAULT_TACTICS, forecheck: '2-1-2', forecheckIntensity: 'aggressive', tempo: 'high', entry: 'controlled' }),
  () => ({ ...DEFAULT_TACTICS, forecheck: '1-3-1', forecheckIntensity: 'passive', gap: 'loose', tempo: 'slow', breakout: 'boards' }),
  () => ({ ...DEFAULT_TACTICS, physicality: 'hard', entry: 'dump', offensiveZone: 'netFront', forecheckIntensity: 'aggressive' }),
  () => ({ ...DEFAULT_TACTICS, forecheck: 'leftWingLock', offensiveZone: 'point', defensiveZone: 'swarm' }),
  () => ({ ...DEFAULT_TACTICS, breakout: 'stretch', offensiveZone: 'slot', gap: 'tight', tempo: 'high' }),
];

/** Faktor für die Stärkeunterschiede zwischen den Vereinen (1 = Vorlagenwerte) */
export const LEAGUE_SPREAD = 0.6;

export interface GenerateOptions {
  seed: number;
  season?: number;
  freeAgents?: number;
  /** Präfix für IDs neu erzeugter Personen (z. B. bei späteren Saisons, um Kollisionen zu vermeiden) */
  idPrefix?: string;
}

export class WorldGenerator {
  private rng: Rng;
  private season: number;
  private date: string;
  private idCounter = 0;
  private usedNames = new Set<string>();

  constructor(private opts: GenerateOptions) {
    this.rng = new Rng(opts.seed);
    this.season = opts.season ?? 2026;
    this.date = `${this.season}-08-01`;
  }

  private id(prefix: string) {
    return `${prefix}${this.opts.idPrefix ?? ''}${(++this.idCounter).toString(36)}`;
  }

  generate(): World {
    const players: Player[] = [];
    const staff: Staff[] = [];
    const clubs: Club[] = [];
    const managers: Manager[] = [];

    for (const tpl of CLUBS_DEL2_MODEL) {
      const clubId = `c-${tpl.shortName.toLowerCase()}`;
      // Leistungsdichte der Liga: Abstände zwischen den Vereinen gestaucht (realistische Ausgeglichenheit)
      const base = 100 + (tpl.base - 100) * LEAGUE_SPREAD;
      const roster = this.generateRoster(clubId, base, tpl.profile === 'promoted' ? 3 : 4);
      players.push(...roster);
      staff.push(...this.generateStaff(clubId, base));
      const budget = Math.round((BUDGET_BY_PROFILE[tpl.profile] * this.rng.float(0.9, 1.1)) / 10_000) * 10_000;
      const managerId = this.id('m');
      managers.push({ id: managerId, name: this.personName('DE').join(' '), type: 'ai', reputation: clamp(Math.round(tpl.base / 2 + this.rng.normal(0, 8)), 10, 90), clubId });
      const club: Club = {
        id: clubId,
        name: [tpl.prefix, tpl.city, tpl.nickname].filter(Boolean).join(' '),
        shortName: tpl.shortName,
        city: tpl.city,
        nickname: tpl.nickname,
        colors: { primary: tpl.colors[0], secondary: tpl.colors[1] },
        profile: tpl.profile,
        arena: { name: `Eisarena ${tpl.city}`, capacity: tpl.capacity },
        finances: { budget, balance: Math.round(budget * this.rng.float(0.08, 0.22)), ticketPrice: 20, sponsorIncome: 0, mediaIncome: 0, salaryBudget: 0, ledger: [], attendance: [] },
        seasonGoal: null,
        fanBase: clamp(Math.round(tpl.capacity / 80 + this.rng.normal(0, 5)), 10, 100),
        boardConfidence: 60,
        controller: { type: 'ai', managerId },
        leagueId: LEAGUE_DEL2_MODEL.id,
        matchplan: null,
        familiarity: {},
        training: TrainingSchema.parse({}),
      };
      club.matchplan = autoMatchplan(roster, { countryCode: COUNTRY_DE.code, importSlotsGame: COUNTRY_DE.rules.importSlotsGame, tactics: this.rng.pick(TACTIC_STYLES)() });
      clubs.push(club);
    }

    // Vereinslose Spieler (Transfermarkt)
    const fa = this.opts.freeAgents ?? 60;
    const faPositions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
    for (let i = 0; i < fa; i++) {
      const pos = this.rng.weighted(faPositions, [3, 3, 3, 3, 3, 1.2]);
      const imp = this.rng.chance(0.35);
      const nat = imp ? this.rng.weighted(IMPORT_ORIGINS.map((o) => o[0]), IMPORT_ORIGINS.map((o) => o[1])) : 'DE';
      players.push(this.generatePlayer({ position: pos, quality: this.rng.normal(imp ? 96 : 86, 8), age: this.rng.int(19, 34), nationality: nat, clubId: null }));
    }

    const base: World = {
      schemaVersion: SCHEMA_VERSION,
      id: `world-${this.opts.seed}`,
      name: 'Testwelt (DEL2-Modell)',
      seed: this.opts.seed,
      season: this.season,
      date: this.date,
      countries: [COUNTRY_DE],
      leagues: [LEAGUE_DEL2_MODEL],
      clubs,
      players,
      staff,
      managers,
      competition: null,
      scouting: {},
      market: structuredClone(EMPTY_MARKET),
      archive: [],
      chemistry: {},
      offseason: null,
    };
    return beginSeason(seedDevRef(seedFamiliarity(seedChemistry(base, () => this.rng.next()))), this.opts.seed);
  }

  private generateRoster(clubId: string, base: number, imports: number): Player[] {
    // Kaderplätze mit Qualitäts-Offset je Tiefe
    const slots: { pos: Position; off: number }[] = [];
    const add = (pos: Position, offs: number[]) => offs.forEach((off) => slots.push({ pos, off }));
    add('C', [14, 6, 0, -8, -14]);
    add('LW', [14, 5, -3, -12]);
    add('RW', [14, 5, -3, -12]);
    add('LD', [12, 4, -4, -12]);
    add('RD', [12, 4, -4, -12]);
    add('G', [8, -10]);

    // Ausländer bevorzugt auf den Topplätzen
    const topSlots = slots.map((s, i) => ({ ...s, i })).filter((s) => s.off >= 4).map((s) => s.i);
    this.rng.shuffle(topSlots);
    const importSlots = new Set(topSlots.slice(0, imports));

    const players = slots.map((s, i) => {
      const imp = importSlots.has(i);
      const nat = imp ? this.rng.weighted(IMPORT_ORIGINS.map((o) => o[0]), IMPORT_ORIGINS.map((o) => o[1])) : 'DE';
      const age = s.off >= 10 ? this.rng.int(23, 33) : s.off <= -10 ? this.rng.int(18, 34) : this.rng.int(20, 34);
      return this.generatePlayer({
        position: s.pos,
        quality: base + s.off + (imp ? 6 : 0) + this.rng.normal(0, 4),
        age,
        nationality: nat,
        clubId,
        role: s.off >= 12 ? 'star' : s.off >= 4 ? 'top' : s.off >= -4 ? 'regular' : 'depth',
      });
    });
    // Zwei Nachwuchsspieler
    for (let k = 0; k < 2; k++) {
      const pos = this.rng.pick<Position>(['C', 'LW', 'RW', 'LD', 'RD']);
      players.push(this.generatePlayer({ position: pos, quality: base - 22 + this.rng.normal(0, 5), age: this.rng.int(17, 19), nationality: 'DE', clubId, role: 'prospect' }));
    }
    return players;
  }

  private personName(nat: string): [string, string] {
    const pool = NAMES[nat] ?? NAMES.DE;
    for (let i = 0; i < 50; i++) {
      const f = this.rng.pick(pool.first), l = this.rng.pick(pool.last);
      if (!this.usedNames.has(f + l)) {
        this.usedNames.add(f + l);
        return [f, l];
      }
    }
    return [this.rng.pick(pool.first), this.rng.pick(pool.last)];
  }

  private birthDate(age: number): string {
    const year = this.season - age - 1 + (this.rng.chance(0.4) ? 1 : 0);
    const m = this.rng.int(1, 12), d = this.rng.int(1, 28);
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  generatePlayer(o: { position: Position; quality: number; age: number; nationality: string; clubId: string | null; role?: 'star' | 'top' | 'regular' | 'depth' | 'prospect' }): Player {
    const rng = this.rng;
    const q = o.quality;
    const [firstName, lastName] = this.personName(o.nationality);
    const group: 'C' | 'W' | 'D' | 'G' = o.position === 'C' ? 'C' : o.position === 'LW' || o.position === 'RW' ? 'W' : o.position === 'G' ? 'G' : 'D';

    const skater = {} as Record<SkaterAttribute, number>;
    if (group === 'G') {
      for (const k of SKATER_ATTRIBUTES) skater[k] = r200(rng.normal(55, 12));
      skater.discipline = r200(rng.normal(120, 20));
      skater.composure = r200(q + rng.normal(0, 10));
      skater.leadership = r200(rng.normal(80, 25));
    } else {
      const arch = rng.pick(ARCHETYPES[group]);
      const posBase = POSITION_BASE[group];
      const young = o.age <= 21 ? (22 - o.age) : 0;
      const old = o.age >= 31 ? (o.age - 30) : 0;
      for (const k of SKATER_ATTRIBUTES) {
        let v = q + (posBase[k] ?? 0) + (arch[k] ?? 0) + rng.normal(0, 8);
        if (k === 'hockeyIQ' || k === 'anticipation' || k === 'composure') v += -young * 3 + old * 3;
        if (k === 'skating' || k === 'agility' || k === 'stamina') v += young * 1 - old * 5;
        if (k === 'discipline') v = rng.normal(112, 22);
        if (k === 'leadership') v = rng.normal(70 + Math.max(0, o.age - 22) * 4, 22);
        skater[k] = r200(v);
      }
    }

    let goalie: Record<GoalieAttribute, number> | undefined;
    if (group === 'G') {
      goalie = {} as Record<GoalieAttribute, number>;
      for (const k of GOALIE_ATTRIBUTES) goalie[k] = r200(q + rng.normal(0, 9));
      goalie.puckPlaying = r200(rng.normal(q - 10, 15));
    }

    const potential = o.age <= 23 ? q + rng.float(5, 35) * (24 - o.age) / 6 : q + rng.float(0, 4);
    const traits: Trait[] = [];
    const nTraits = rng.weighted([0, 1, 2], [0.35, 0.45, 0.2]);
    const pool = [...PLAYER_TRAITS];
    for (let i = 0; i < nTraits; i++) {
      const weights = pool.map((t) => (t === 'leader' ? skater.leadership / 100 : t === 'hitzkopf' ? (200 - skater.discipline) / 100 : 1));
      const t = rng.weighted(pool, weights);
      pool.splice(pool.indexOf(t), 1);
      traits.push({ id: t, strength: Math.round(rng.float(55, 95)) });
    }

    const isImport = o.nationality !== 'DE';
    const nationalities = [o.nationality];
    if (isImport && (o.nationality === 'CA' || o.nationality === 'US') && rng.chance(0.08)) nationalities.push('DE');
    const salary = Math.round(
      clamp(isImport ? 60_000 + (q - 95) * 2_600 : 28_000 + (q - 75) * 1_900, 15_000, 220_000) * rng.float(0.85, 1.15) / 500,
    ) * 500;

    return {
      id: this.id('p'),
      firstName,
      lastName,
      birthDate: this.birthDate(o.age),
      nationalities,
      position: o.position,
      shoots: rng.chance(0.6) ? 'L' : 'R',
      skater: skater as Player['skater'],
      goalie: goalie as Player['goalie'],
      hidden: {
        potential: r200(potential),
        consistency: r200(rng.normal(100, 25)),
        injuryProneness: r200(rng.normal(90, 25)),
        professionalism: r200(rng.normal(105, 25)),
        adaptability: r200(rng.normal(100, 25)),
        malleability: r200(clamp(180 - o.age * 4 + rng.normal(0, 15), 10, 200)),
      },
      condition: { fitness: Math.round(rng.float(94, 100)), form: Math.round(clamp(rng.normal(50, 8), 20, 80)), morale: Math.round(clamp(rng.normal(62, 8), 30, 90)) },
      traits,
      contract: o.clubId
        ? makeContract({
          clubId: o.clubId, salary, untilSeason: this.season + rng.int(0, 2), role: o.role ?? 'regular',
          perks: isImport ? { housing: rng.int(1, 2), car: rng.int(1, 2), flights: rng.int(1, 2), family: 0, extras: 0 } : { housing: 0, car: rng.int(0, 1), flights: 0, family: 0, extras: 0 },
        })
        : null,
      nextContract: null,
      dev: { ref: {}, history: [] },
      youthClub: null,
      career: [],
    };
  }

  private generateStaff(clubId: string, base: number): Staff[] {
    const roles: StaffRole[] = ['headCoach', 'assistantCoach', 'scout'];
    return roles.map((role) => {
      const nat = this.rng.chance(role === 'headCoach' ? 0.45 : 0.2) ? this.rng.weighted(IMPORT_ORIGINS.map((o) => o[0]), IMPORT_ORIGINS.map((o) => o[1])) : 'DE';
      const [firstName, lastName] = this.personName(nat);
      const q = base + this.rng.normal(0, 12);
      const rt = () => r200(q + this.rng.normal(0, 15));
      const traits: Trait[] = this.rng.chance(0.7)
        ? [{ id: this.rng.pick(STAFF_TRAITS), strength: Math.round(this.rng.float(55, 95)) }]
        : [];
      return {
        id: this.id('s'),
        firstName,
        lastName,
        birthDate: this.birthDate(this.rng.int(34, 62)),
        nationalities: [nat],
        role,
        ratings: { tactics: rt(), motivation: rt(), discipline: rt(), development: rt(), scouting: rt() },
        traits,
        region: role === 'scout' ? this.rng.pick(['DE', 'Skandinavien', 'Nordamerika', 'Osteuropa']) : undefined,
        contract: makeContract({ clubId, salary: Math.round((role === 'headCoach' ? 110_000 : 60_000) * this.rng.float(0.8, 1.3) / 1000) * 1000, untilSeason: this.season + this.rng.int(0, 2), role: 'regular' }),
      };
    });
  }
}

export function generateWorld(seed: number, opts: Omit<GenerateOptions, 'seed'> = {}): World {
  return new WorldGenerator({ seed, ...opts }).generate();
}
