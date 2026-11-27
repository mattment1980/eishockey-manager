import type { World, Position } from '@ehm/schema';
import { autoMatchplan, beginSeason, seedChemistry, seedFamiliarity, seedDevRef, Rng } from '@ehm/core';
import { checkReferences } from './io.ts';

const group = (pos: Position) => (pos === 'G' ? 'G' : pos === 'LD' || pos === 'RD' ? 'D' : 'F');
export const MIN_ROSTER = { G: 2, D: 6, F: 12 } as const;

/**
 * Datensatz vor Spielbeginn neu aufbauen, nachdem sich Vereine oder Kader geändert haben:
 * Aufstellungen, Spielplan, Finanzplanung, Chemie, Eingespieltheit und Entwicklungsstand neu setzen.
 * Gibt Fehler zurück, wenn ein Kader nicht spielfähig ist.
 */
export function rebuildWorld(world: World): { world: World; errors: string[] } {
  const errors = checkReferences({ ...world, clubs: world.clubs.map((c) => ({ ...c, matchplan: null })) });
  for (const c of world.clubs) {
    const roster = world.players.filter((p) => p.contract?.clubId === c.id);
    for (const g of ['G', 'D', 'F'] as const) {
      const n = roster.filter((p) => group(p.position) === g).length;
      if (n < MIN_ROSTER[g]) errors.push(`${c.name}: zu wenige ${g === 'G' ? 'Torhüter' : g === 'D' ? 'Verteidiger' : 'Stürmer'} (${n} von mindestens ${MIN_ROSTER[g]}).`);
    }
  }
  if (errors.length) return { world, errors };
  const rules = world.countries[0].rules;
  let w: World = {
    ...world,
    competition: null,
    chemistry: {},
    scouting: {},
    offseason: null,
    clubs: world.clubs.map((c) => {
      const roster = world.players.filter((p) => p.contract?.clubId === c.id);
      const plan = autoMatchplan(roster, { countryCode: 'DE', importSlotsGame: rules.importSlotsGame, tactics: c.matchplan?.tactics, keep: c.matchplan ? { specialTeams: c.matchplan.specialTeams, rules: c.matchplan.rules, matchups: [] } : undefined });
      return { ...c, matchplan: plan, familiarity: {}, controller: { type: 'ai' as const } };
    }),
    players: world.players.map((p) => ({ ...p, dev: { ref: {}, history: [] }, youthClub: null })),
  };
  const rng = new Rng(w.seed + 1);
  w = seedDevRef(seedFamiliarity(seedChemistry(w, () => rng.next())));
  return { world: beginSeason(w, w.seed), errors: [] };
}
