import type { LeagueFormat, Matchplan, Player } from '@ehm/schema';

export type Side = 0 | 1; // 0 = Heim, 1 = Gast
export type MatchPhase = 'regular' | 'playoff';
export type ShotLocation = 'slot' | 'circle' | 'point' | 'rebound';

export interface TeamInput {
  clubId: string;
  name: string;
  shortName: string;
  plan: Matchplan;
  players: Player[];
  /** Fähigkeiten des Trainerteams (Regelplätze, Reaktion, Matchups) */
  coach?: { slots: number; fastReaction: boolean; matchupSkill: number; penaltyFactor?: number };
  /** Chemie der Sturmreihen und Verteidigerpaare (0–100) */
  chemistry?: { lines: number[]; pairs: number[] };
  /** Teamklima (0–100) */
  climate?: number;
  captainId?: string;
}

export interface MatchInput {
  home: TeamInput;
  away: TeamInput;
  seed: number | string;
  phase: MatchPhase;
  format: LeagueFormat;
  /** Volles Ereignisprotokoll behalten (Standard: ja) */
  keepEvents?: boolean;
}

export type EventType =
  | 'periodStart' | 'periodEnd' | 'faceoff' | 'breakout' | 'entry' | 'shot' | 'goal'
  | 'penalty' | 'penaltyEnd' | 'hit' | 'turnover' | 'lineChange' | 'shootoutAttempt';

export interface MatchEvent {
  /** Spielsekunde seit Spielbeginn */
  t: number;
  period: number;
  /** Sekunde im Drittel */
  clock: number;
  type: EventType;
  team: Side;
  /** Spielstärke aus Sicht von `team`, z. B. "5v4" */
  strength: string;
  result?: string;
  players?: Record<string, string>;
  xg?: number;
  location?: ShotLocation;
  /** Sturmreihe/Verteidigerpaar von `team` (nur bei 5-gegen-5) */
  line?: number | null;
  pair?: number | null;
  /** Reihe/Paar des Gegners (nur bei 5-gegen-5) */
  oppLine?: number | null;
  oppPair?: number | null;
}

export interface PlayerGameStats {
  playerId: string;
  team: Side;
  goals: number;
  assists: number;
  shotsOnGoal: number;
  shotAttempts: number;
  shotsMissed: number;
  shotsBlockedAgainst: number;
  blocks: number;
  hits: number;
  giveaways: number;
  takeaways: number;
  faceoffsWon: number;
  faceoffsLost: number;
  pim: number;
  plusMinus: number;
  toi: number;
  ppToi: number;
  shToi: number;
  xg: number;
  // Torhüter
  shotsAgainst: number;
  goalsAgainst: number;
  saves: number;
}

export interface TeamStats {
  goals: number;
  shotsOnGoal: number;
  shotAttempts: number;
  xg: number;
  shotsBlocked: number; // eigene Schüsse geblockt
  shotsMissed: number;
  blocks: number; // gegnerische Schüsse geblockt
  hits: number;
  giveaways: number;
  takeaways: number;
  pim: number;
  powerPlays: number;
  powerPlayGoals: number;
  shortHandedGoals: number;
  faceoffsWon: number;
  breakouts: number;
  breakoutsClean: number;
  entriesControlled: number;
  entriesControlledSuccess: number;
  dumpIns: number;
  dumpInsRecovered: number;
  ozoneTime: number;
  shotsByPeriod: number[];
}

export interface UnitStats {
  toi: number;
  corsiFor: number;
  corsiAgainst: number;
  xgFor: number;
  xgAgainst: number;
  goalsFor: number;
  goalsAgainst: number;
  shotsFor: number;
  shotsAgainst: number;
}

export interface TeamLineStats {
  lines: UnitStats[];
  pairs: UnitStats[];
}

export interface TickerLine {
  /** Spielsekunde seit Spielbeginn */
  t: number;
  period: number;
  clock: string;
  type: 'goal' | 'penalty' | 'save' | 'period' | 'info' | 'shootout' | 'chance' | 'coach';
  team?: Side;
  text: string;
}

export interface RuleReport {
  team: Side;
  ruleId: string;
  name: string;
  activations: number;
  activeSeconds: number;
  goalsFor: number;
  goalsAgainst: number;
  shotsFor: number;
  shotsAgainst: number;
}

/** Reihe gegen Reihe bei 5-gegen-5: [Heimreihe][Gastreihe] */
export interface LineMatrix {
  toi: number[][];
  shotsHome: number[][];
  shotsAway: number[][];
  goalsHome: number[][];
  goalsAway: number[][];
}

export interface ShootoutAttempt {
  team: Side;
  shooterId: string;
  goalieId: string;
  scored: boolean;
}

export interface MatchResult {
  score: [number, number];
  decidedIn: 'REG' | 'OT' | 'SO';
  periodScores: [number, number][];
  teamStats: [TeamStats, TeamStats];
  lineStats: [TeamLineStats, TeamLineStats];
  playerStats: PlayerGameStats[];
  ticker: TickerLine[];
  events: MatchEvent[];
  shootout?: { attempts: ShootoutAttempt[]; score: [number, number] };
  rules: RuleReport[];
  lineMatrix: LineMatrix;
  emptyNetGoals: [number, number];
}
