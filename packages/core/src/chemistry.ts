import type { World, Player, Club, TraitId, Fixture } from '@ehm/schema';
import type { MatchResult } from './engine/types.ts';
import { toDisplay } from './ratings.ts';

/**
 * Chemie & Moral (Light):
 * - Moral je Spieler reagiert auf Ergebnisse, Eiszeit im Vergleich zur Rolle, Tribüne, Traits und Trainer.
 * - Teamklima = gewichtete Moral (Kapitän, Leader und Diva zählen stärker).
 * - Reihenchemie wächst mit gemeinsamen Spielen und hängt von der Trait-Kompatibilität ab.
 */

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const CHEM_START = 30;

export function hasTrait(p: Player, id: TraitId): number {
  const t = p.traits.find((x) => x.id === id);
  return t && t.strength >= 50 ? t.strength / 100 : 0;
}

/** Trait-Kompatibilität zweier Mitspieler (−15 … +15) */
const COMPAT: [TraitId, TraitId, number][] = [
  ['egoist', 'teamplayer', -12],
  ['egoist', 'egoist', -10],
  ['diva', 'diva', -12],
  ['diva', 'stillerArbeiter', 4],
  ['hitzkopf', 'hitzkopf', -6],
  ['leader', 'teamplayer', 8],
  ['leader', 'diva', -6],
  ['mentor', 'perfektionist', 6],
  ['freigeist', 'freigeist', 6],
  ['teamplayer', 'teamplayer', 6],
  ['kabinenclown', 'perfektionist', -5],
];

export function compatibility(a: Player, b: Player): number {
  let v = 0;
  for (const [x, y, w] of COMPAT) {
    if ((hasTrait(a, x) && hasTrait(b, y)) || (hasTrait(a, y) && hasTrait(b, x))) v += w;
  }
  if (hasTrait(a, 'leader') || hasTrait(b, 'leader')) v += 3;
  if (a.nationalities[0] === b.nationalities[0] && a.nationalities[0] !== 'DE') v += 4; // Landsleute
  return Math.max(-15, Math.min(15, v));
}

/** Chemie einer Einheit (Reihe/Paar), 0–100 */
export function unitChemistry(world: World, ids: string[], byId: Map<string, Player>): number {
  if (ids.length < 2) return 50;
  let sum = 0, n = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]), b = byId.get(ids[j]);
      if (!a || !b) continue;
      sum += (world.chemistry[pairKey(a.id, b.id)] ?? CHEM_START) + compatibility(a, b);
      n++;
    }
  }
  return Math.max(0, Math.min(100, n ? sum / n : 50));
}

export function captainOf(world: World, club: Club): Player | null {
  const roster = world.players.filter((p) => p.contract?.clubId === club.id && p.position !== 'G');
  const chosen = club.matchplan?.captain ? roster.find((p) => p.id === club.matchplan!.captain) : null;
  if (chosen) return chosen;
  return [...roster].sort((a, b) => b.skater.leadership + hasTrait(b, 'leader') * 40 - (a.skater.leadership + hasTrait(a, 'leader') * 40))[0] ?? null;
}

function staffOf(world: World, clubId: string) {
  return world.staff.filter((s) => s.contract?.clubId === clubId);
}

/** Teamklima 0–100 */
export function teamClimate(world: World, clubId: string): number {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const roster = world.players.filter((p) => p.contract?.clubId === clubId);
  if (!roster.length) return 60;
  const captain = captainOf(world, club);
  let sum = 0, tot = 0;
  for (const p of roster) {
    const w = 1 + (captain?.id === p.id ? 1 : 0) + hasTrait(p, 'leader') * 0.5 + hasTrait(p, 'diva') * 0.3;
    sum += p.condition.morale * w;
    tot += w;
  }
  let climate = sum / tot;
  const staff = staffOf(world, clubId);
  const head = staff.find((s) => s.role === 'headCoach');
  if (head) climate += (toDisplay(head.ratings.motivation) - 10) * 0.6;
  if (staff.some((s) => s.traits.some((t) => t.id === 'motivator'))) climate += 3;
  return Math.max(0, Math.min(100, Math.round(climate)));
}

export interface ClimateIssue { level: 'warn' | 'bad'; text: string }

/** Hinweise für die Kabinen-Ansicht */
export function climateIssues(world: World, clubId: string): ClimateIssue[] {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const plan = club.matchplan;
  const roster = world.players.filter((p) => p.contract?.clubId === clubId);
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const out: ClimateIssue[] = [];
  const staff = staffOf(world, clubId);
  const fanatic = staff.find((s) => s.traits.some((t) => t.id === 'disziplinfanatiker'));
  if (fanatic) {
    for (const p of roster.filter((x) => hasTrait(x, 'freigeist'))) out.push({ level: 'warn', text: `${p.firstName} ${p.lastName} (Freigeist) kommt mit ${fanatic.firstName} ${fanatic.lastName} (Disziplinfanatiker) nicht gut klar.` });
  }
  if (plan) {
    const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
    for (const p of roster.filter((x) => hasTrait(x, 'diva') && !dressed.has(x.id))) out.push({ level: 'bad', text: `${p.firstName} ${p.lastName} (Diva) sitzt auf der Tribüne – die Stimmung leidet.` });
    for (const line of [...plan.forwardLines, ...plan.defensePairs]) {
      const ps = line.map((id) => byId.get(id)!).filter(Boolean);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        if (compatibility(ps[i], ps[j]) <= -10) out.push({ level: 'warn', text: `${ps[i].lastName} und ${ps[j].lastName} passen charakterlich schlecht zusammen.` });
      }
    }
  }
  for (const p of roster.filter((x) => x.condition.morale < 35)) out.push({ level: 'bad', text: `${p.firstName} ${p.lastName} ist unzufrieden (Moral ${Math.round(p.condition.morale)}).` });
  return out;
}

const EXPECTED_TOI: Record<string, number> = { star: 17, top: 15, regular: 12, depth: 8, prospect: 6 };

/** Moral und Chemie nach den Spielen eines Spieltags aktualisieren */
export function updateAfterGames(world: World, games: { fixture: Fixture; result: MatchResult }[]): World {
  const morale = new Map<string, number>();
  const chem = { ...world.chemistry };
  const together = new Set<string>();
  const playing = new Set<string>();
  for (const { fixture, result } of games) {
    for (const side of [0, 1] as const) {
      const clubId = side === 0 ? fixture.home : fixture.away;
      const club = world.clubs.find((c) => c.id === clubId);
      if (!club?.matchplan) continue;
      playing.add(clubId);
      const plan = club.matchplan;
      const staff = staffOf(world, clubId);
      const head = staff.find((s) => s.role === 'headCoach');
      const drift = 0.04 + (head ? toDisplay(head.ratings.motivation) / 400 : 0.025);
      const softener = staff.some((s) => s.traits.some((t) => t.id === 'spielerversteher')) ? 0.7 : 1;
      const fanatic = staff.some((s) => s.traits.some((t) => t.id === 'disziplinfanatiker'));
      const won = result.score[side] > result.score[1 - side];
      const roster = world.players.filter((p) => p.contract?.clubId === clubId);
      const clown = roster.some((p) => hasTrait(p, 'kabinenclown'));
      const stats = new Map(result.playerStats.filter((s) => s.team === side).map((s) => [s.playerId, s]));
      const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
      for (const p of roster) {
        let d = won ? 2 : result.decidedIn !== 'REG' ? -1 : -2;
        if (!won && clown) d += 0.5;
        const role = p.contract!.role;
        const diva = 1 + hasTrait(p, 'diva');
        const team = 1 - hasTrait(p, 'teamplayer') * 0.7;
        const st = stats.get(p.id);
        if (p.position === 'G') {
          const started = !!st && st.toi > 0;
          if (!started && (role === 'star' || role === 'top')) d -= 2 * diva * team;
          if (started && st!.shotsAgainst >= 15) d += (st!.saves / st!.shotsAgainst - 0.9) * 40;
        } else if (dressed.has(p.id) && st) {
          const minutes = st.toi / 60;
          if (minutes < EXPECTED_TOI[role] - 4) d -= 1.5 * diva * team;
          if (st.goals + st.assists >= 2) d += 1.5;
          if (hasTrait(p, 'perfektionist') && st.plusMinus <= -2) d -= 1;
        } else {
          d -= (role === 'star' || role === 'top' ? 3 : role === 'regular' ? 1.5 : 0.5) * diva * team;
        }
        if (fanatic && hasTrait(p, 'freigeist')) d -= 1;
        if (d < 0) d *= softener;
        const m = p.condition.morale + d;
        morale.set(p.id, Math.max(5, Math.min(100, m + (60 - m) * drift)));
      }
      // Chemie: gemeinsame Einheiten wachsen
      for (const unit of [...plan.forwardLines, ...plan.defensePairs]) {
        for (let i = 0; i < unit.length; i++) for (let j = i + 1; j < unit.length; j++) {
          const k = pairKey(unit[i], unit[j]);
          together.add(k);
          const p1 = world.players.find((x) => x.id === unit[i]), p2 = world.players.find((x) => x.id === unit[j]);
          const bonus = p1 && p2 ? (hasTrait(p1, 'teamplayer') + hasTrait(p2, 'teamplayer')) * 0.8 : 0;
          const c0 = chem[k] ?? CHEM_START;
          chem[k] = Math.min(100, c0 + Math.max(0, 92 - c0) * 0.035 + bonus);
        }
      }
    }
  }
  // Chemie verblasst, wenn Spieler nicht mehr zusammen spielen
  const clubOf = new Map(world.players.map((p) => [p.id, p.contract?.clubId]));
  for (const k of Object.keys(chem)) {
    if (together.has(k)) continue;
    const [a, b] = k.split('|');
    const ca = clubOf.get(a), cb = clubOf.get(b);
    if (!ca || ca !== cb) { delete chem[k]; continue; }
    if (!playing.has(ca)) continue;
    chem[k] -= 0.5;
    if (chem[k] <= CHEM_START - 10) delete chem[k];
  }
  const players = world.players.map((p) => (morale.has(p.id) ? { ...p, condition: { ...p.condition, morale: Math.round(morale.get(p.id)! * 10) / 10 } } : p));
  return { ...world, players, chemistry: chem };
}

/** Anfangschemie für bestehende Reihen (Spieler kennen sich aus der Vorbereitung) */
export function seedChemistry(world: World, rnd: () => number): World {
  const chem = { ...world.chemistry };
  for (const c of world.clubs) {
    const plan = c.matchplan;
    if (!plan) continue;
    for (const unit of [...plan.forwardLines, ...plan.defensePairs]) {
      for (let i = 0; i < unit.length; i++) for (let j = i + 1; j < unit.length; j++) {
        const k = pairKey(unit[i], unit[j]);
        if (chem[k] === undefined) chem[k] = Math.round(35 + rnd() * 30);
      }
    }
  }
  return { ...world, chemistry: chem };
}
