import { DEFAULT_TACTICS, type Matchplan, type Player, type Position, type Tactics } from '@ehm/schema';
import { overall, offenseRating, defenseRating, weightedSkater, W } from './ratings.ts';

export interface LineupOptions {
  /** Ländercode, der als „einheimisch“ gilt (z. B. DE) */
  countryCode: string;
  /** maximale Anzahl Ausländer im Spieltagskader */
  importSlotsGame: number;
  tactics?: Tactics;
}

export const isImport = (p: Player, countryCode: string) => !p.nationalities.includes(countryCode);

/**
 * Automatische Aufstellung (KI-Co-Trainer): beste Spieler je Position,
 * unter Beachtung der Ausländerlizenzen pro Spiel.
 */
export function autoMatchplan(players: Player[], opts: LineupOptions): Matchplan {
  const used = new Set<string>();
  let imports = 0;
  const sorted = [...players].sort((a, b) => overall(b) - overall(a));

  const take = (positions: Position[], count: number): Player[] => {
    const out: Player[] = [];
    for (const pos of positions) {
      for (const p of sorted) {
        if (out.length >= count) break;
        if (used.has(p.id) || p.position !== pos) continue;
        const imp = isImport(p, opts.countryCode);
        if (imp && imports >= opts.importSlotsGame) continue;
        used.add(p.id);
        if (imp) imports++;
        out.push(p);
      }
    }
    if (out.length < count) {
      // Notfall: beliebige Feldspieler auffüllen (ohne Ausländerlimit zu brechen)
      for (const p of sorted) {
        if (out.length >= count) break;
        if (used.has(p.id) || p.position === 'G') continue;
        const imp = isImport(p, opts.countryCode);
        if (imp && imports >= opts.importSlotsGame) continue;
        used.add(p.id);
        if (imp) imports++;
        out.push(p);
      }
    }
    return out.sort((a, b) => overall(b) - overall(a));
  };

  const goalies = take(['G'], 2);
  const centers = take(['C'], 4);
  const lw = take(['LW', 'RW', 'C'], 4);
  const rw = take(['RW', 'LW', 'C'], 4);
  const ld = take(['LD', 'RD'], 3);
  const rd = take(['RD', 'LD'], 3);
  if (goalies.length < 2 || centers.length < 4 || lw.length < 4 || rw.length < 4 || ld.length < 3 || rd.length < 3) {
    throw new Error('autoMatchplan: Kader zu klein für eine vollständige Aufstellung');
  }

  const forwards = [...centers, ...lw, ...rw];
  const defense = [...ld, ...rd];
  const byOff = (a: Player, b: Player) => offenseRating(b) - offenseRating(a);
  const byDef = (a: Player, b: Player) => defenseRating(b) - defenseRating(a);
  const ppF = [...forwards].sort(byOff).slice(0, 6);
  const ppD = [...defense].sort(byOff).slice(0, 4);
  const pkF = [...forwards].sort(byDef).slice(0, 4);
  const pkD = [...defense].sort(byDef).slice(0, 4);
  const so = [...forwards]
    .sort((a, b) => weightedSkater(b, W.shootoutShooter) - weightedSkater(a, W.shootoutShooter))
    .slice(0, 5);

  return {
    tactics: opts.tactics ?? { ...DEFAULT_TACTICS },
    forwardLines: [0, 1, 2, 3].map((i) => [lw[i].id, centers[i].id, rw[i].id] as [string, string, string]),
    defensePairs: [0, 1, 2].map((i) => [ld[i].id, rd[i].id] as [string, string]),
    forwardShares: [0.34, 0.3, 0.22, 0.14],
    defenseShares: [0.4, 0.34, 0.26],
    goalies: [goalies[0].id, goalies[1].id],
    powerPlay: [
      { forwards: ppF.slice(0, 3).map((p) => p.id), defense: ppD.slice(0, 2).map((p) => p.id) },
      { forwards: ppF.slice(3, 6).map((p) => p.id), defense: ppD.slice(2, 4).map((p) => p.id) },
    ],
    penaltyKill: [
      { forwards: pkF.slice(0, 2).map((p) => p.id), defense: pkD.slice(0, 2).map((p) => p.id) },
      { forwards: pkF.slice(2, 4).map((p) => p.id), defense: pkD.slice(2, 4).map((p) => p.id) },
    ],
    shootout: so.map((p) => p.id),
  };
}

/** Mannschaftsstärke (Durchschnitt der Aufstellung, gewichtet nach Eiszeit) */
export function teamStrength(plan: Matchplan, byId: Map<string, Player>): number {
  let sum = 0, tot = 0;
  plan.forwardLines.forEach((line, i) => line.forEach((id) => { sum += overall(byId.get(id)!) * plan.forwardShares[i]; tot += plan.forwardShares[i]; }));
  plan.defensePairs.forEach((pair, i) => pair.forEach((id) => { sum += overall(byId.get(id)!) * plan.defenseShares[i]; tot += plan.defenseShares[i]; }));
  const skaters = sum / tot;
  const g = overall(byId.get(plan.goalies[0])!);
  return skaters * 0.75 + g * 0.25;
}
