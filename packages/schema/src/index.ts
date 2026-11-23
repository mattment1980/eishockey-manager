import { z } from 'zod';

/** Version des Spielstand-Formats. Bei Änderungen erhöhen und Migration ergänzen. */
export const SCHEMA_VERSION = 1;

/** Interne Attributskala 1–200 (Anzeige 1–20). */
export const Rating = z.number().int().min(1).max(200);
const Percent = z.number().min(0).max(100);

export const PositionSchema = z.enum(['C', 'LW', 'RW', 'LD', 'RD', 'G']);
export type Position = z.infer<typeof PositionSchema>;

export const SKATER_ATTRIBUTES = [
  // Technik
  'skating', 'agility', 'puckHandling', 'passing', 'shotPower', 'shotAccuracy', 'faceoffs',
  // Defensive & Physis
  'defPositioning', 'stickChecking', 'bodyChecking', 'shotBlocking', 'strength', 'stamina',
  // Mental
  'hockeyIQ', 'anticipation', 'composure', 'discipline', 'workRate', 'leadership',
] as const;
export type SkaterAttribute = (typeof SKATER_ATTRIBUTES)[number];

export const GOALIE_ATTRIBUTES = [
  'reflexes', 'positioning', 'lowShots', 'glove', 'blocker', 'reboundControl',
  'puckPlaying', 'agility', 'concentration', 'composure',
] as const;
export type GoalieAttribute = (typeof GOALIE_ATTRIBUTES)[number];

export const SkaterAttributesSchema = z.object(
  Object.fromEntries(SKATER_ATTRIBUTES.map((k) => [k, Rating])) as Record<SkaterAttribute, typeof Rating>,
);
export type SkaterAttributes = z.infer<typeof SkaterAttributesSchema>;

export const GoalieAttributesSchema = z.object(
  Object.fromEntries(GOALIE_ATTRIBUTES.map((k) => [k, Rating])) as Record<GoalieAttribute, typeof Rating>,
);
export type GoalieAttributes = z.infer<typeof GoalieAttributesSchema>;

export const HiddenAttributesSchema = z.object({
  potential: Rating,
  consistency: Rating,
  injuryProneness: Rating,
  professionalism: Rating,
  adaptability: Rating,
  malleability: Rating,
});
export type HiddenAttributes = z.infer<typeof HiddenAttributesSchema>;

export const ConditionSchema = z.object({
  fitness: Percent,
  form: Percent,
  morale: Percent,
});
export type Condition = z.infer<typeof ConditionSchema>;

export const TRAIT_IDS = [
  // Spieler – Persönlichkeit
  'leader', 'mentor', 'teamplayer', 'freigeist', 'hitzkopf', 'diva', 'egoist',
  'stillerArbeiter', 'kabinenclown', 'perfektionist',
  // Spieler – situativ
  'bigGame', 'nervenbuendel', 'kaempfer', 'schoenwetter', 'heimstark',
  // Staff
  'disziplinfanatiker', 'spielerversteher', 'motivator', 'ausbilder', 'taktikfuchs',
] as const;
export const TraitIdSchema = z.enum(TRAIT_IDS);
export type TraitId = z.infer<typeof TraitIdSchema>;

export const TraitSchema = z.object({
  id: TraitIdSchema,
  /** Ausprägung 0–100; über einer Schwelle aktiv. */
  strength: Percent,
});
export type Trait = z.infer<typeof TraitSchema>;

export const PlayerRoleSchema = z.enum(['star', 'top', 'regular', 'depth', 'prospect']);

export const ContractSchema = z.object({
  clubId: z.string(),
  /** Jahresgehalt brutto in Euro */
  salary: z.number().int().nonnegative(),
  /** Vertrag läuft bis Ende dieser Saison (Startjahr, z. B. 2027 = Saison 2027/28) */
  untilSeason: z.number().int(),
  role: PlayerRoleSchema,
});
export type Contract = z.infer<typeof ContractSchema>;

export const PlayerSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string(), // ISO yyyy-mm-dd
  nationalities: z.array(z.string().length(2)).min(1), // ISO-Ländercodes
  position: PositionSchema,
  shoots: z.enum(['L', 'R']),
  skater: SkaterAttributesSchema,
  goalie: GoalieAttributesSchema.optional(),
  hidden: HiddenAttributesSchema,
  condition: ConditionSchema,
  traits: z.array(TraitSchema),
  contract: ContractSchema.nullable(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const StaffRoleSchema = z.enum(['headCoach', 'assistantCoach', 'goalieCoach', 'scout', 'youthCoach', 'manager']);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const StaffSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string(),
  nationalities: z.array(z.string().length(2)).min(1),
  role: StaffRoleSchema,
  ratings: z.object({
    tactics: Rating,
    motivation: Rating,
    discipline: Rating,
    development: Rating,
    scouting: Rating,
  }),
  traits: z.array(TraitSchema),
  /** Scouting-Region (nur Scouts) */
  region: z.string().optional(),
  contract: ContractSchema.nullable(),
});
export type Staff = z.infer<typeof StaffSchema>;

export const ClubProfileSchema = z.enum(['tradition', 'corporate', 'patron', 'development', 'promoted']);
export type ClubProfile = z.infer<typeof ClubProfileSchema>;

// ---------- Taktik & Matchplan ----------

export const TacticsSchema = z.object({
  forecheck: z.enum(['1-2-2', '2-1-2', 'leftWingLock', '1-3-1']),
  forecheckIntensity: z.enum(['passive', 'normal', 'aggressive']),
  breakout: z.enum(['short', 'd2d', 'boards', 'stretch', 'carry']),
  entry: z.enum(['controlled', 'dump', 'auto']),
  offensiveZone: z.enum(['cycle', 'point', 'slot', 'netFront']),
  defensiveZone: z.enum(['zone', 'man', 'swarm']),
  gap: z.enum(['tight', 'medium', 'loose']),
  tempo: z.enum(['slow', 'normal', 'high']),
  physicality: z.enum(['fair', 'normal', 'hard']),
});
export type Tactics = z.infer<typeof TacticsSchema>;

export const DEFAULT_TACTICS: Tactics = {
  forecheck: '1-2-2',
  forecheckIntensity: 'normal',
  breakout: 'short',
  entry: 'auto',
  offensiveZone: 'cycle',
  defensiveZone: 'zone',
  gap: 'medium',
  tempo: 'normal',
  physicality: 'normal',
};

export const MatchplanSchema = z.object({
  tactics: TacticsSchema,
  /** 4 Sturmreihen: [LW, C, RW] */
  forwardLines: z.array(z.tuple([z.string(), z.string(), z.string()])).length(4),
  /** 3 Verteidigerpaare: [LD, RD] */
  defensePairs: z.array(z.tuple([z.string(), z.string()])).length(3),
  /** Eiszeitanteile der Sturmreihen (Summe 1) */
  forwardShares: z.array(z.number()).length(4),
  /** Eiszeitanteile der Verteidigerpaare (Summe 1) */
  defenseShares: z.array(z.number()).length(3),
  goalies: z.tuple([z.string(), z.string()]),
  /** Überzahl-Einheiten: 3 Stürmer + 2 Verteidiger */
  powerPlay: z.array(z.object({ forwards: z.array(z.string()).length(3), defense: z.array(z.string()).length(2) })).length(2),
  /** Unterzahl-Einheiten: 2 Stürmer + 2 Verteidiger */
  penaltyKill: z.array(z.object({ forwards: z.array(z.string()).length(2), defense: z.array(z.string()).length(2) })).length(2),
  shootout: z.array(z.string()).min(3),
});
export type Matchplan = z.infer<typeof MatchplanSchema>;

// ---------- Verein, Liga, Land, Welt ----------

export const ControllerSchema = z.object({
  type: z.enum(['human', 'ai']),
  managerId: z.string().optional(),
});

export const ClubSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string().max(4),
  city: z.string(),
  nickname: z.string(),
  colors: z.object({ primary: z.string(), secondary: z.string() }),
  profile: ClubProfileSchema,
  arena: z.object({ name: z.string(), capacity: z.number().int().positive() }),
  finances: z.object({
    /** Saisonetat in Euro */
    budget: z.number().int(),
    /** Kontostand in Euro */
    balance: z.number().int(),
  }),
  fanBase: Percent,
  boardConfidence: Percent,
  controller: ControllerSchema,
  leagueId: z.string(),
  matchplan: MatchplanSchema.nullable(),
});
export type Club = z.infer<typeof ClubSchema>;

export const LeagueFormatSchema = z.object({
  teams: z.number().int(),
  /** Anzahl Runden „jeder gegen jeden“ */
  roundRobins: z.number().int(),
  points: z.object({ win: z.number(), otWin: z.number(), otLoss: z.number(), loss: z.number() }),
  regularOvertime: z.object({ skaters: z.number().int(), minutes: z.number(), shootout: z.boolean() }),
  playoffOvertime: z.object({ skaters: z.number().int(), minutes: z.number(), suddenDeathUntilDecided: z.boolean() }),
  /** Platzierungen (1-basiert) für direkte Playoffs, Pre-Playoffs, Playdowns */
  directPlayoffs: z.tuple([z.number(), z.number()]),
  prePlayoffs: z.tuple([z.number(), z.number()]).nullable(),
  prePlayoffBestOf: z.number().int(),
  playoffBestOf: z.number().int(),
  playdowns: z.tuple([z.number(), z.number()]).nullable(),
  playdownBestOf: z.number().int(),
});
export type LeagueFormat = z.infer<typeof LeagueFormatSchema>;

export const LeagueSchema = z.object({
  id: z.string(),
  countryId: z.string(),
  name: z.string(),
  level: z.number().int(),
  format: LeagueFormatSchema,
});
export type League = z.infer<typeof LeagueSchema>;

export const CountryRulesSchema = z.object({
  maxRoster: z.number().int(),
  /** Ausländerlizenzen im Kader */
  importSlotsRoster: z.number().int(),
  /** Ausländer auf dem Spielberichtsbogen */
  importSlotsGame: z.number().int(),
  /** Spieler im Spieltagskader (Feldspieler + Torhüter) */
  gameRoster: z.number().int(),
});

export const CountrySchema = z.object({
  id: z.string(),
  code: z.string().length(2),
  name: z.string(),
  rules: CountryRulesSchema,
});
export type Country = z.infer<typeof CountrySchema>;

export const ManagerSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['human', 'ai']),
  reputation: Percent,
  clubId: z.string().nullable(),
});
export type Manager = z.infer<typeof ManagerSchema>;

export const WorldSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  seed: z.number().int(),
  season: z.number().int(),
  date: z.string(),
  countries: z.array(CountrySchema),
  leagues: z.array(LeagueSchema),
  clubs: z.array(ClubSchema),
  players: z.array(PlayerSchema),
  staff: z.array(StaffSchema),
  managers: z.array(ManagerSchema),
});
export type World = z.infer<typeof WorldSchema>;
