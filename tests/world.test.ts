/** Tests: Zufall, Weltgenerator, Import/Export, Aufstellung */
import { describe, it, expect } from 'vitest';
import { WorldSchema } from '@ehm/schema';
import { Rng, autoMatchplan, isImport } from '@ehm/core';
import { generateWorld, checkReferences, importWorldJson, exportWorldJson } from '@ehm/data';
import { world } from './helpers.ts';

describe('Zufallsgenerator', () => {
  it('ist mit gleichem Startwert reproduzierbar', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});

describe('Weltgenerator', () => {
  it('erzeugt eine gültige DEL2-Modell-Welt', () => {
    expect(WorldSchema.safeParse(world).success).toBe(true);
    expect(world.clubs).toHaveLength(14);
    expect(checkReferences(world)).toEqual([]);
  });
  it('ist deterministisch', () => {
    expect(exportWorldJson(generateWorld(2026))).toBe(exportWorldJson(world));
  });
  it('übersteht Export und Import', () => {
    const res = importWorldJson(exportWorldJson(world));
    expect(res.ok).toBe(true);
  });
  it('meldet Fehler bei kaputten Daten verständlich', () => {
    const res = importWorldJson('{"schemaVersion": 1}');
    expect(res.ok).toBe(false);
  });
});

describe('Aufstellung', () => {
  it('hält das Ausländerlimit pro Spiel ein', () => {
    for (const c of world.clubs) {
      const players = world.players.filter((p) => p.contract?.clubId === c.id);
      const plan = autoMatchplan(players, { countryCode: 'DE', importSlotsGame: 2 });
      const ids = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
      const imports = players.filter((p) => ids.has(p.id) && isImport(p, 'DE')).length;
      expect(imports).toBeLessThanOrEqual(2);
      expect(ids.size).toBe(20);
    }
  });
});
