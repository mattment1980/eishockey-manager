import type { Country, League, ClubProfile } from '@ehm/schema';

/**
 * Testliga nach dem Vorbild der DEL2 (Modus Saison 2025/26):
 * 14 Vereine, 52 Hauptrundenspiele, 1–6 Viertelfinale, 7–10 Pre-Playoffs (Best-of-3),
 * 11–14 Playdowns, Playoffs Best-of-7 mit Verlängerung bis zur Entscheidung.
 * Alle Werte sind Konfiguration und können angepasst werden.
 */
export const COUNTRY_DE: Country = {
  id: 'de',
  code: 'DE',
  name: 'Deutschland',
  rules: {
    maxRoster: 28,
    importSlotsRoster: 4, // Platzhalter – konfigurierbar
    importSlotsGame: 4,
    gameRoster: 22,
  },
};

export const LEAGUE_DEL2_MODEL: League = {
  id: 'de-2',
  countryId: 'de',
  name: 'Testliga (DEL2-Modell)',
  level: 2,
  format: {
    teams: 14,
    roundRobins: 4,
    points: { win: 3, otWin: 2, otLoss: 1, loss: 0 },
    regularOvertime: { skaters: 3, minutes: 5, shootout: true },
    playoffOvertime: { skaters: 5, minutes: 20, suddenDeathUntilDecided: true },
    directPlayoffs: [1, 6],
    prePlayoffs: [7, 10],
    prePlayoffBestOf: 3,
    playoffBestOf: 7,
    playdowns: [11, 14],
    playdownBestOf: 7,
  },
};

export interface ClubTemplate {
  prefix: string;
  city: string;
  nickname: string;
  shortName: string;
  profile: ClubProfile;
  /** Grundqualität des Kaders (interne Skala) */
  base: number;
  capacity: number;
  colors: [string, string];
}

/** 14 Fantasievereine – keine realen Namen oder Logos. */
export const CLUBS_DEL2_MODEL: ClubTemplate[] = [
  { prefix: 'EHC', city: 'Ostervald', nickname: 'Wölfe', shortName: 'OST', profile: 'tradition', base: 108, capacity: 5800, colors: ['#1f3a68', '#c9d3e0'] },
  { prefix: 'EC', city: 'Falkenstein', nickname: 'Greifen', shortName: 'FAL', profile: 'corporate', base: 112, capacity: 4600, colors: ['#b3121c', '#f2f2f2'] },
  { prefix: 'ESV', city: 'Hohenmark', nickname: 'Steinböcke', shortName: 'HOM', profile: 'tradition', base: 101, capacity: 5200, colors: ['#0d6b3b', '#f4c430'] },
  { prefix: '', city: 'Grünbach', nickname: 'Hornets', shortName: 'GRB', profile: 'development', base: 94, capacity: 3100, colors: ['#111111', '#f2c200'] },
  { prefix: 'EV', city: 'Rabenau', nickname: 'Raben', shortName: 'RAB', profile: 'tradition', base: 104, capacity: 4900, colors: ['#1b1b1b', '#9a1f2b'] },
  { prefix: 'ERC', city: 'Lindheim', nickname: 'Luchse', shortName: 'LIN', profile: 'patron', base: 106, capacity: 3800, colors: ['#5a2d82', '#e8e0f0'] },
  { prefix: '', city: 'Eisenried', nickname: 'Bisons', shortName: 'EIS', profile: 'development', base: 95, capacity: 3400, colors: ['#6b3e1f', '#e9d8b4'] },
  { prefix: 'EHC', city: 'Kaltenbrunn', nickname: 'Eisbrecher', shortName: 'KAL', profile: 'tradition', base: 99, capacity: 4400, colors: ['#0b7fab', '#ffffff'] },
  { prefix: 'SC', city: 'Sturmhafen', nickname: 'Haie', shortName: 'STU', profile: 'patron', base: 103, capacity: 4100, colors: ['#0a2342', '#2ca6a4'] },
  { prefix: '', city: 'Blauwald', nickname: 'Blizzards', shortName: 'BLW', profile: 'promoted', base: 90, capacity: 2900, colors: ['#2b59c3', '#d6e4ff'] },
  { prefix: 'ERC', city: 'Tannried', nickname: 'Tiger', shortName: 'TAN', profile: 'tradition', base: 100, capacity: 4700, colors: ['#e86a10', '#1a1a1a'] },
  { prefix: '', city: 'Weißenhagen', nickname: 'Wildcats', shortName: 'WEI', profile: 'development', base: 93, capacity: 3000, colors: ['#7a0f2e', '#d9d9d9'] },
  { prefix: 'SV', city: 'Moosberg', nickname: 'Mammuts', shortName: 'MOO', profile: 'tradition', base: 97, capacity: 3900, colors: ['#3d5a3a', '#c8b88a'] },
  { prefix: 'EC', city: 'Rotfels', nickname: 'Panther', shortName: 'ROT', profile: 'promoted', base: 91, capacity: 2700, colors: ['#c4161c', '#222222'] },
];

export const BUDGET_BY_PROFILE: Record<ClubProfile, number> = {
  corporate: 6_500_000,
  patron: 5_000_000,
  tradition: 4_200_000,
  development: 3_000_000,
  promoted: 2_600_000,
};
