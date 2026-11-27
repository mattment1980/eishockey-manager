import { z } from 'zod';

/** Version des Spielstand-Formats. Bei Änderungen erhöhen und Migration ergänzen. */
export const SCHEMA_VERSION = 15;

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

export const PerksSchema = z.object({
  /** 0 = keine, 1 = Wohnung, 2 = größere Wohnung, 3 = Haus */
  housing: z.number().int().min(0).max(3),
  /** 0 = kein, 1 = Kleinwagen, 2 = Mittelklasse, 3 = Oberklasse */
  car: z.number().int().min(0).max(3),
  /** Heimflüge pro Jahr (0–3) */
  flights: z.number().int().min(0).max(3),
  /** 0 = nichts, 1 = Schule/Kita, 2 = zusätzlich Jobunterstützung Partner */
  family: z.number().int().min(0).max(2),
  /** 0 = nichts, 1 = Ausbildung/Studium, 2 = zusätzlich Personal Trainer */
  extras: z.number().int().min(0).max(2),
});
export type Perks = z.infer<typeof PerksSchema>;
export const NO_PERKS: Perks = { housing: 0, car: 0, flights: 0, family: 0, extras: 0 };

export const BonusSchema = z.object({
  /** Prämie je Scorerpunkt in Euro */
  perPoint: z.number().int().nonnegative(),
  /** Prämie bei Erreichen des Viertelfinales */
  playoffs: z.number().int().nonnegative(),
});
export type Bonus = z.infer<typeof BonusSchema>;

export const ClausesSchema = z.object({
  /** Ausstiegsklausel: Spieler darf im Sommer für ein Angebot aus einer stärkeren Liga gehen */
  exit: z.boolean(),
  /** Abstiegsklausel: Vertrag endet bei Abstieg */
  relegation: z.boolean(),
});
export type Clauses = z.infer<typeof ClausesSchema>;

export const PromiseTypeSchema = z.enum(['top6F', 'top4D', 'pp1', 'starter', 'playoffs']);
export type PromiseType = z.infer<typeof PromiseTypeSchema>;

export const PromiseSchema = z.object({
  type: PromiseTypeSchema,
  status: z.enum(['ok', 'risk', 'broken']),
  /** Monate in Folge nicht eingehalten */
  strikes: z.number().int(),
});
export type PlayerPromise = z.infer<typeof PromiseSchema>;

export const ContractSchema = z.object({
  clubId: z.string(),
  /** Jahresgehalt brutto in Euro */
  salary: z.number().int().nonnegative(),
  /** Vertrag läuft bis Ende dieser Saison (Startjahr, z. B. 2027 = Saison 2027/28) */
  untilSeason: z.number().int(),
  role: PlayerRoleSchema,
  perks: PerksSchema.default(NO_PERKS),
  bonus: BonusSchema.default({ perPoint: 0, playoffs: 0 }),
  clauses: ClausesSchema.default({ exit: false, relegation: false }),
  promises: z.array(PromiseSchema).default([]),
  /** Saison (Startjahr), ab der dieser Vertrag gilt */
  fromSeason: z.number().int().optional(),
});
export type Contract = z.infer<typeof ContractSchema>;

/** Vertrag mit Standardwerten für alle optionalen Bestandteile */
export function makeContract(base: Pick<Contract, 'clubId' | 'salary' | 'untilSeason' | 'role'> & Partial<Contract>): Contract {
  return {
    perks: { ...NO_PERKS },
    bonus: { perPoint: 0, playoffs: 0 },
    clauses: { exit: false, relegation: false },
    promises: [],
    ...base,
  };
}

/** Kurzbericht zu einer Phase der Sommerpause (für den Verein des Managers) */
export const PhaseReportSchema = z.object({
  headline: z.string(),
  tone: z.enum(['good', 'mixed', 'bad', 'neutral']),
  /** Bewertungszeilen, z. B. „Sportlich – gut – Ziel Halbfinale erreicht“ */
  lines: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(['good', 'mixed', 'bad', 'neutral']), note: z.string().optional(), players: z.array(z.string()).optional(), tags: z.array(z.string()).optional() })),
  notes: z.array(z.string()),
});
export type PhaseReport = z.infer<typeof PhaseReportSchema>;

/** Tag der Leistungstests: Ergebnis des Sommerschritts für den Verein des Managers */
export const TestDaySchema = z.object({
  clubId: z.string(),
  /** schon angesehen? */
  seen: z.boolean(),
  lines: z.array(z.object({
    playerId: z.string(),
    /** Gesamtstärke vorher/nachher (intern) */
    before: z.number(),
    after: z.number(),
    jump: z.boolean(),
    /** Veränderung je Attribut (intern), Torhüterwerte mit Präfix „g.“ */
    attrs: z.record(z.number()),
  })),
});
export type TestDay = z.infer<typeof TestDaySchema>;

/** Entwicklungsverlauf eines Spielers */
export const PlayerDevSchema = z.object({
  /** Attributwerte zu Saisonbeginn (nach dem Sommerschritt) – Grundlage für die Entwicklungspfeile */
  ref: z.record(z.number()).default({}),
  /** Gesamtstärke (intern) je Monat, zuletzt die neuesten */
  history: z.array(z.object({ month: z.string(), ovr: z.number() })).default([]),
});
export type PlayerDev = z.infer<typeof PlayerDevSchema>;

export const StatLineSchema = z.object({
  clubId: z.string(),
  gp: z.number().int(),
  g: z.number().int(),
  a: z.number().int(),
  pim: z.number().int(),
  pm: z.number().int(),
  sog: z.number().int(),
  toi: z.number(),
  // Torhüter
  gs: z.number().int(),
  sa: z.number().int(),
  ga: z.number().int(),
  w: z.number().int(),
  so: z.number().int(),
});
export type StatLine = z.infer<typeof StatLineSchema>;

/** Statistik einer abgeschlossenen Saison (Karriere eines Spielers) */
export const CareerSeasonSchema = z.object({
  /** Startjahr der Saison (2026 = 2026/27) */
  season: z.number().int(),
  leagueId: z.string(),
  regular: StatLineSchema.nullable(),
  post: StatLineSchema.nullable(),
});
export type CareerSeason = z.infer<typeof CareerSeasonSchema>;

/** Verletzungen (Meilenstein 9) */
export const INJURY_KINDS = ['prellung', 'zerrung', 'leiste', 'ruecken', 'muskelfaser', 'gehirnerschuetterung', 'baender', 'bruch', 'schwer'] as const;
export const InjuryKindSchema = z.enum(INJURY_KINDS);
export type InjuryKind = z.infer<typeof InjuryKindSchema>;
export const InjurySchema = z.object({
  kind: InjuryKindSchema,
  /** Tag der Verletzung */
  date: z.string(),
  /** ab diesem Tag wieder voll fit */
  out: z.string(),
  /** ab diesem Tag angeschlagen einsetzbar (mit Abzug und Rückfallrisiko) */
  knock: z.string(),
  /** Prognose des Arztes in Tagen ab Verletzung (von–bis) */
  est: z.tuple([z.number().int(), z.number().int()]),
  /** Manager erlaubt den Einsatz, sobald der Spieler angeschlagen ist */
  play: z.boolean().default(false),
  /** Anzahl Rückfälle */
  relapses: z.number().int().default(0),
  /** im Spiel oder im Training/durch Überlastung */
  cause: z.enum(['game', 'training']),
});
export type Injury = z.infer<typeof InjurySchema>;

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
  /** Vorvertrag für die kommende Saison (bei anderem oder eigenem Verein) */
  nextContract: ContractSchema.nullable().default(null),
  dev: PlayerDevSchema.default({}),
  /** Nachwuchsspieler aus dem Jahrgang dieses Vereins, noch ohne Profivertrag */
  youthClub: z.string().nullable().default(null),
  /** Statistik der abgeschlossenen Saisons (neueste zuletzt) */
  career: z.array(CareerSeasonSchema).default([]),
  /** aktuelle Verletzung (null = gesund) */
  injury: InjurySchema.nullable().default(null),
  /** Verletzungshistorie (neueste zuletzt, höchstens 20) */
  injuries: z.array(z.object({ kind: InjuryKindSchema, date: z.string(), days: z.number().int() })).default([]),
});
export type Player = z.infer<typeof PlayerSchema>;

export const StaffRoleSchema = z.enum(['headCoach', 'assistantCoach', 'goalieCoach', 'scout', 'youthCoach', 'manager', 'doctor', 'physio', 'athleticsCoach']);
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
    /** Medizin (Arzt, Physiotherapeut, Athletiktrainer) */
    medical: Rating.default(60),
    /** Vermarktung und Verhandlung (Geschäftsführer) */
    business: Rating.default(60),
  }),
  traits: z.array(TraitSchema),
  /** Scouting-Region (nur Scouts) */
  region: z.string().optional(),
  contract: ContractSchema.nullable(),
});
export type Staff = z.infer<typeof StaffSchema>;

// ---------- Training ----------

export const TRAINING_FOCI = ['athletics', 'offense', 'defense', 'mental', 'tactics', 'specialTeams', 'lines', 'goalies'] as const;
export const TrainingFocusSchema = z.enum(TRAINING_FOCI);
export type TrainingFocus = z.infer<typeof TrainingFocusSchema>;
export const TrainingIntensitySchema = z.enum(['hard', 'medium', 'light', 'recovery']);
export type TrainingIntensity = z.infer<typeof TrainingIntensitySchema>;
export const INDIVIDUAL_FOCI = ['athletics', 'offense', 'defense', 'mental', 'goalies'] as const;
export const IndividualFocusSchema = z.enum(INDIVIDUAL_FOCI);
export type IndividualFocus = z.infer<typeof IndividualFocusSchema>;
export const TrainingUnitSchema = z.object({ focus: TrainingFocusSchema, intensity: TrainingIntensitySchema });
export type TrainingUnit = z.infer<typeof TrainingUnitSchema>;
export const AutoPickSchema = z.enum(['rotate', 'formweak', 'talent', 'young']);
export type AutoPick = z.infer<typeof AutoPickSchema>;

export const TrainingSchema = z.object({
  /** Wochenplan des Managers (3 Schwerpunkte); null = der Co-Trainer plant */
  plan: z.array(TrainingUnitSchema).length(3).nullable().default(null),
  /** Plan über die Woche hinaus beibehalten (sonst übernimmt danach wieder der Co-Trainer) */
  keep: z.boolean().default(true),
  /** Einzeltraining: bis zu 3 vom Manager festgelegte Spieler */
  individual: z.array(z.object({ playerId: z.string(), focus: IndividualFocusSchema })).max(3).default([]),
  /** Auswahlregel des Co-Trainers für freie Einzeltrainings-Plätze */
  autoPick: AutoPickSchema.default('rotate'),
  /** Zuletzt absolvierte Trainingswoche (Montag) */
  week: z.object({
    start: z.string(),
    units: z.array(TrainingUnitSchema),
    byCoach: z.boolean(),
    individual: z.array(z.object({ playerId: z.string(), focus: IndividualFocusSchema, auto: z.boolean() })),
    games: z.number().int(),
    /** Belastung 0–9 (Summe der Intensitäten) */
    load: z.number(),
    /** Kaderschnitt zu Wochenbeginn (für den Wochenrückblick) */
    before: z.object({ fitness: z.number(), morale: z.number(), form: z.number() }).optional(),
  }).nullable().default(null),
  /** Trainingsumfang seit dem letzten Entwicklungsschritt („team:offense“, „<spielerId>:offense“) */
  log: z.record(z.number()).default({}),
  /** Anzahl Wochen im Log */
  weeks: z.number().default(0),
});
export type Training = z.infer<typeof TrainingSchema>;

// ---------- Sponsoring ----------

export const SPONSOR_SLOTS = ['main', 'sleeve', 'pants', 'helmet', 'ice', 'boards', 'naming', 'outfitter', 'business'] as const;
export const SponsorSlotSchema = z.enum(SPONSOR_SLOTS);
export type SponsorSlot = z.infer<typeof SponsorSlotSchema>;
export const SPONSOR_TYPES = ['mittelstand', 'konzern', 'brauerei', 'autohaus', 'bank', 'startup'] as const;
export const SponsorTypeSchema = z.enum(SPONSOR_TYPES);
export type SponsorType = z.infer<typeof SponsorTypeSchema>;
export const SponsorBonusSchema = z.object({
  kind: z.enum(['playoffs', 'semifinal', 'title', 'top6', 'attendance']),
  amount: z.number(),
  /** bei 'attendance': Zuschauerschnitt (Anteil der Halle) */
  threshold: z.number().optional(),
});
export type SponsorBonus = z.infer<typeof SponsorBonusSchema>;

/** Laufender Sponsorenvertrag */
export const SponsorDealSchema = z.object({
  id: z.string(),
  slot: SponsorSlotSchema,
  name: z.string(),
  type: SponsorTypeSchema,
  /** Grundbetrag pro Saison (€) */
  base: z.number(),
  bonuses: z.array(SponsorBonusSchema).default([]),
  /** Pflichttermine pro Saison und davon erledigt */
  termine: z.number().int().default(0),
  termineDone: z.number().int().default(0),
  /** läuft bis einschließlich dieser Saison (Startjahr) */
  untilSeason: z.number().int(),
  /** Zufriedenheit 0–100 */
  satisfaction: z.number().default(60),
  /** Ausstieg bei Abstieg */
  relegationExit: z.boolean().default(false),
});
export type SponsorDeal = z.infer<typeof SponsorDealSchema>;

/** Angebot für eine freie Fläche (verhandelbar in bis zu 3 Runden) */
export const SponsorOfferSchema = z.object({
  id: z.string(),
  slot: SponsorSlotSchema,
  name: z.string(),
  type: SponsorTypeSchema,
  base: z.number(),
  bonuses: z.array(SponsorBonusSchema).default([]),
  termine: z.number().int(),
  years: z.number().int(),
  relegationExit: z.boolean().default(false),
  /** verdeckte Schmerzgrenze des Partners (Grundbetrag bei gleichen Terminen) */
  limit: z.number(),
  /** Verhandlungsrunde 0–3 */
  round: z.number().int().default(0),
  /** letzte Antwort des Partners */
  reply: z.string().optional(),
  /** gilt bis */
  until: z.string(),
});
export type SponsorOffer = z.infer<typeof SponsorOfferSchema>;

export const ClubSponsorsSchema = z.object({
  deals: z.array(SponsorDealSchema).default([]),
  offers: z.array(SponsorOfferSchema).default([]),
  /** Geschäftsführer verhandelt selbst */
  delegate: z.boolean().default(false),
  /** Leitlinie für den Geschäftsführer */
  strategy: z.enum(['safe', 'balanced', 'bonus']).default('balanced'),
  /** in dieser Saison ausgezahlte Boni (Anzeige) */
  paidBonus: z.number().default(0),
});
export type ClubSponsors = z.infer<typeof ClubSponsorsSchema>;

// ---------- Events (Termine und Zufallsereignisse) ----------

/** Stimmung im Umfeld des Vereins (0–100, 50 = normal) */
export const ClubMoodSchema = z.object({
  fans: z.number().default(50),
  sponsors: z.number().default(50),
});

export const EventLogSchema = z.object({
  date: z.string(),
  defId: z.string(),
  title: z.string(),
  text: z.string(),
  tone: z.enum(['good', 'mixed', 'bad', 'neutral']),
});
export type EventLog = z.infer<typeof EventLogSchema>;

export const ClubEventsSchema = z.object({
  /** geplante Termine für die nächste Woche (ersetzen je eine Trainingseinheit) */
  plan: z.array(z.object({ id: z.string(), option: z.string().optional(), subject: z.string().optional() })).default([]),
  /** Woche (Montag), deren Termine und Zufallsereignis bereits ausgewertet sind */
  week: z.string().nullable().default(null),
  /** durchgeführte Termine und Ereignisse (für Abnutzung und Pausen) */
  done: z.array(z.object({ id: z.string(), date: z.string() })).default([]),
  /** Zufallsereignis, das auf eine Entscheidung wartet */
  pending: z.object({ defId: z.string(), date: z.string(), subjects: z.array(z.string()) }).nullable().default(null),
  /** Ergebnisse (neueste zuerst) */
  log: z.array(EventLogSchema).default([]),
  /** Zuschauerbonus für die nächsten Heimspiele */
  attendance: z.object({ pct: z.number(), games: z.number().int() }).nullable().default(null),
  /** „Spiel der Saison“: dieses Spiel mit Zusatzantrieb, danach eine Delle */
  gameOfSeason: z.string().nullable().default(null),
});
export type ClubEvents = z.infer<typeof ClubEventsSchema>;

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

// ---------- Special Teams, Matchups, Coaching-Regeln ----------

export const SpecialTeamsSchema = z.object({
  /** Überzahl-Formation */
  ppFormation: z.enum(['umbrella', 'overload', 'spread']),
  /** Unterzahl-Formation */
  pkFormation: z.enum(['box', 'diamond', 'aggressive']),
});
export type SpecialTeams = z.infer<typeof SpecialTeamsSchema>;
export const DEFAULT_SPECIAL_TEAMS: SpecialTeams = { ppFormation: 'umbrella', pkFormation: 'box' };

export const MatchupSchema = z.object({
  /** eigene Einheit: Sturmreihe (0–3) oder Verteidigerpaar (0–2) */
  unit: z.enum(['line', 'pair']),
  mine: z.number().int().min(0).max(3),
  /** gegnerische Sturmreihe (0–3), gegen die gespielt werden soll */
  vs: z.number().int().min(0).max(3),
});
export type Matchup = z.infer<typeof MatchupSchema>;

export const RuleConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('score'), state: z.enum(['leading', 'trailing', 'tied']), min: z.number().int().min(1).max(5), max: z.number().int().min(1).max(9) }),
  z.object({ type: z.literal('time'), fromMinute: z.number().min(0).max(65) }),
  z.object({ type: z.literal('lastMinutes'), minutes: z.number().min(0.5).max(20) }),
  z.object({ type: z.literal('period'), period: z.enum(['1', '2', '3', 'OT']) }),
  z.object({ type: z.literal('situation'), situation: z.enum(['EV', 'PP', 'PK']) }),
  z.object({ type: z.literal('shots'), state: z.enum(['ahead', 'behind']), diff: z.number().int().min(1).max(30) }),
  z.object({ type: z.literal('goalieSave'), below: z.number().min(70).max(95), minShots: z.number().int().min(3).max(30) }),
  z.object({ type: z.literal('goalsAgainst'), goals: z.number().int().min(2).max(5), withinMinutes: z.number().min(2).max(20) }),
  z.object({ type: z.literal('playerPenalties'), count: z.number().int().min(1).max(4) }),
  z.object({ type: z.literal('playoffs') }),
]);
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

export const RuleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tactic'), key: z.enum(['forecheck', 'forecheckIntensity', 'breakout', 'entry', 'offensiveZone', 'defensiveZone', 'gap', 'tempo', 'physicality']), value: z.string() }),
  z.object({ type: z.literal('shortBench') }),
  z.object({ type: z.literal('topLines') }),
  z.object({ type: z.literal('pullGoalie') }),
  z.object({ type: z.literal('switchGoalie') }),
  z.object({ type: z.literal('timeout') }),
  z.object({ type: z.literal('benchPenalized') }),
  z.object({ type: z.literal('matchups'), on: z.boolean() }),
]);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const CoachingRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  conditions: z.array(RuleConditionSchema).min(1),
  actions: z.array(RuleActionSchema).min(1),
});
export type CoachingRule = z.infer<typeof CoachingRuleSchema>;

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
  specialTeams: SpecialTeamsSchema.default(DEFAULT_SPECIAL_TEAMS),
  matchups: z.array(MatchupSchema).default([]),
  /** Coaching-Regeln in Prioritätsreihenfolge (oben = wichtiger) */
  rules: z.array(CoachingRuleSchema).default([]),
  /** Kapitän (null = automatisch der Spieler mit der meisten Führungsstärke) */
  captain: z.string().nullable().default(null),
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
    /** Saisonetat in Euro (geplante Gesamtausgaben) */
    budget: z.number().int(),
    /** Kontostand in Euro */
    balance: z.number().int(),
    /** Durchschnittlicher Ticketpreis in Euro */
    ticketPrice: z.number(),
    /** Sponsoreneinnahmen der laufenden Saison (gesamt) */
    sponsorIncome: z.number().int(),
    /** Medieneinnahmen der laufenden Saison (gesamt) */
    mediaIncome: z.number().int(),
    /** Gehaltsetat (Spieler + Staff) der laufenden Saison */
    salaryBudget: z.number().int(),
    /** Monatsbuch der laufenden Saison */
    ledger: z.array(z.object({ month: z.string(), items: z.record(z.number()) })),
    /** Zuschauer der Heimspiele der laufenden Saison */
    attendance: z.array(z.number().int()),
  }),
  seasonGoal: z.enum(['title', 'semifinal', 'quarterfinal', 'prePlayoffs', 'survival']).nullable(),
  fanBase: Percent,
  boardConfidence: Percent,
  controller: ControllerSchema,
  leagueId: z.string(),
  matchplan: MatchplanSchema.nullable(),
  /** Eingespieltheit mit Taktik-Optionen (Schlüssel "taktik:wert", z. B. "forecheck:1-2-2" oder "pp:umbrella"), 0–100 */
  familiarity: z.record(z.number()).default({}),
  /** Training: Wochenplan, Einzeltraining, letzte Woche */
  training: TrainingSchema.default({}),
  /** Fanstimmung und Sponsorenzufriedenheit */
  mood: ClubMoodSchema.default({}),
  /** Termine und Zufallsereignisse */
  events: ClubEventsSchema.default({}),
  /** Sponsoren: Verträge, Angebote, Geschäftsführer-Leitlinie */
  sponsors: ClubSponsorsSchema.default({}),
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

// ---------- Wettbewerb (Saison) ----------

export const StageSchema = z.enum(['regular', 'prePlayoffs', 'playoffs', 'playdowns']);
export type Stage = z.infer<typeof StageSchema>;

/** Mannschaftsstatistik eines Spiels (für die Teamstatistik der Liga) */
export const TeamGameLineSchema = z.object({
  /** Schussversuche (Corsi) */
  att: z.number().int(),
  pim: z.number().int(),
  /** Überzahlspiele und Überzahltore */
  pp: z.number().int(),
  ppg: z.number().int(),
  /** Unterzahltore */
  shg: z.number().int(),
  /** gewonnene Bullys */
  fow: z.number().int(),
  hits: z.number().int(),
  blocks: z.number().int(),
  xg: z.number(),
});
export type TeamGameLine = z.infer<typeof TeamGameLineSchema>;

export const FixtureResultSchema = z.object({
  score: z.tuple([z.number().int(), z.number().int()]),
  decidedIn: z.enum(['REG', 'OT', 'SO']),
  shots: z.tuple([z.number().int(), z.number().int()]),
  team: z.tuple([TeamGameLineSchema, TeamGameLineSchema]).optional(),
});
export type FixtureResult = z.infer<typeof FixtureResultSchema>;

export const FixtureSchema = z.object({
  id: z.string(),
  stage: StageSchema,
  /** Spieltag (fortlaufend über die ganze Saison) */
  day: z.number().int(),
  home: z.string(),
  away: z.string(),
  /** Spieldatum (ISO yyyy-mm-dd) */
  date: z.string(),
  seriesId: z.string().optional(),
  gameNo: z.number().int().optional(),
  result: FixtureResultSchema.optional(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

export const SeriesSchema = z.object({
  id: z.string(),
  stage: StageSchema,
  /** z. B. "Pre-Playoffs", "Viertelfinale", "Playdown-Finale" */
  roundName: z.string(),
  roundNo: z.number().int(),
  bestOf: z.number().int(),
  /** besser platzierter Verein (Heimrecht in Spiel 1, 3, 5, 7) */
  high: z.string(),
  low: z.string(),
  winsHigh: z.number().int(),
  winsLow: z.number().int(),
  winner: z.string().nullable(),
});
export type Series = z.infer<typeof SeriesSchema>;


export const CompetitionSchema = z.object({
  leagueId: z.string(),
  year: z.number().int(),
  /** zuletzt gespielter Spieltag (0 = noch keiner) */
  day: z.number().int(),
  fixtures: z.array(FixtureSchema),
  series: z.array(SeriesSchema),
  /** Ende der Wechselfrist für Sofortwechsel (ISO-Datum) */
  transferDeadline: z.string(),
  /** Plätze nach der Hauptrunde (Vereins-IDs), gesetzt sobald diese beendet ist */
  finalStandings: z.array(z.string()).nullable(),
  stats: z.object({
    regular: z.record(StatLineSchema),
    post: z.record(StatLineSchema),
  }),
  champion: z.string().nullable(),
  relegated: z.string().nullable(),
  finished: z.boolean(),
});
export type Competition = z.infer<typeof CompetitionSchema>;

// ---------- Scouting ----------

export const ScoutingStateSchema = z.object({
  /** Kenntnispunkte je Spieler (0–400 → Stufe 1–4) */
  knowledge: z.record(z.number()),
  /** Beobachtungsliste (werden von Scouts bevorzugt) */
  watch: z.array(z.string()),
  /** angesparte Scouting-Punkte je Scout */
  bank: z.record(z.number()),
  /** letztes Datum der Aktualisierung */
  lastUpdate: z.string(),
});
export type ScoutingState = z.infer<typeof ScoutingStateSchema>;

// ---------- Markt ----------

export const TermsSchema = z.object({
  salary: z.number().int().nonnegative(),
  years: z.number().int().min(1).max(3),
  role: PlayerRoleSchema,
  perks: PerksSchema,
  bonus: BonusSchema,
  clauses: ClausesSchema,
  promises: z.array(PromiseTypeSchema),
});
export type Terms = z.infer<typeof TermsSchema>;

export const OfferSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  clubId: z.string(),
  terms: TermsSchema,
  /** Saison (Startjahr), ab der der Vertrag gelten soll */
  forSeason: z.number().int(),
  date: z.string(),
  status: z.enum(['open', 'accepted', 'rejected', 'withdrawn']),
  /** wie oft nachgebessert */
  raises: z.number().int(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const NewsSchema = z.object({
  date: z.string(),
  text: z.string(),
  kind: z.enum(['signing', 'offer', 'decision', 'promise', 'info']),
  /** betrifft den Verein des Managers */
  mine: z.boolean(),
});
export type News = z.infer<typeof NewsSchema>;

export const MarketSchema = z.object({
  offers: z.array(OfferSchema),
  /** Entscheidungsfrist je Spieler (ISO-Datum) */
  decideBy: z.record(z.string()),
  /** Geduld je Spieler und Verein ("spieler:verein") */
  patience: z.record(z.number()),
  /** Gespräche abgebrochen ("spieler:verein") */
  blocked: z.array(z.string()),
  news: z.array(NewsSchema),
  lastAiRun: z.string(),
  /** Glaubwürdigkeit je Verein (0–1) */
  credibility: z.record(z.number()),
});
export type Market = z.infer<typeof MarketSchema>;
export const EMPTY_MARKET: Market = { offers: [], decideBy: {}, patience: {}, blocked: [], news: [], lastAiRun: '1900-01-01', credibility: {} };

// ---------- Saisonarchiv ----------

export const StandingRowSchema = z.object({
  clubId: z.string(), gp: z.number().int(), w: z.number().int(), otw: z.number().int(), otl: z.number().int(), l: z.number().int(),
  gf: z.number().int(), ga: z.number().int(), pts: z.number().int(),
});
const n = z.number();
export const TeamSeasonStatsSchema = z.object({
  clubId: z.string(), gp: n, gf: n, ga: n, sog: n, sogA: n, att: n, attA: n, xg: n, xgA: n, pp: n, ppg: n, pk: n, ppgA: n,
  shg: n, shgA: n, pim: n, fow: n, fol: n, hits: n, blocks: n, detailed: n,
});
/** Abgeschlossene Saison einer Liga: Tabelle, Endplatzierung, Mannschaftsstatistik */
export const SeasonArchiveSchema = z.object({
  season: z.number().int(),
  leagueId: z.string(),
  champion: z.string().nullable(),
  relegated: z.string().nullable(),
  table: z.array(StandingRowSchema),
  finalStandings: z.array(z.string()).nullable(),
  teams: z.object({ regular: z.array(TeamSeasonStatsSchema), post: z.array(TeamSeasonStatsSchema) }),
  /** Namen der Vereine zu dieser Zeit */
  clubs: z.record(z.object({ name: z.string(), shortName: z.string() })),
});
export type SeasonArchive = z.infer<typeof SeasonArchiveSchema>;

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
  competition: CompetitionSchema.nullable(),
  /** Scouting-Stand je menschlich geführtem Verein */
  scouting: z.record(ScoutingStateSchema),
  market: MarketSchema.default(EMPTY_MARKET),
  /** Chemie zwischen zwei Spielern (Schlüssel "idA|idB", sortiert), 0–100 */
  chemistry: z.record(z.number()).default({}),
  /** Sommerpause in Phasen (null = keine Sommerpause, Saison läuft) */
  offseason: z.object({
    phase: z.number().int().min(0),
    testDay: TestDaySchema.optional(),
    /** Kurzberichte je Phase (Schlüssel = Phasen-ID, z. B. „review“) */
    reports: z.record(PhaseReportSchema).default({}),
  }).nullable().default(null),
  /** Abgeschlossene Saisons (neueste zuletzt) */
  archive: z.array(SeasonArchiveSchema).default([]),
});
export type World = z.infer<typeof WorldSchema>;
