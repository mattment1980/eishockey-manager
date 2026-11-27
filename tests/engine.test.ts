/** Tests: Match-Engine, Coaching-Regeln, Matchups, Special Teams */
import { describe, it, expect } from 'vitest';
import { simulateMatch } from '@ehm/core';
import { generateWorld } from '@ehm/data';
import type { Matchplan } from '@ehm/schema';
import { world, input } from './helpers.ts';

describe('Match-Engine', () => {
  const [h, a] = [world.clubs[0].id, world.clubs[1].id];
  const fmt = world.leagues[0].format;
  it('ist reproduzierbar', () => {
    const r1 = simulateMatch({ home: input(h), away: input(a), seed: 7, phase: 'regular', format: fmt });
    const r2 = simulateMatch({ home: input(h), away: input(a), seed: 7, phase: 'regular', format: fmt });
    expect(r1.score).toEqual(r2.score);
    expect(r1.ticker).toEqual(r2.ticker);
  });
  it('liefert immer einen Sieger und stimmige Statistiken', () => {
    for (let s = 0; s < 40; s++) {
      const r = simulateMatch({ home: input(h), away: input(a), seed: s, phase: s % 2 ? 'playoff' : 'regular', format: fmt });
      expect(r.score[0]).not.toBe(r.score[1]);
      if (s % 2) expect(r.decidedIn).not.toBe('SO');
      const goals = r.playerStats.filter((p) => p.team === 0).reduce((x, p) => x + p.goals, 0);
      expect(goals).toBe(r.teamStats[0].goals);
      for (const ts of r.teamStats) expect(ts.shotsOnGoal).toBeLessThanOrEqual(ts.shotAttempts);
    }
  });
});



describe('Coaching, Matchups, Special Teams', () => {
  const w = generateWorld(41);
  const team = (i: number, patch: Partial<Matchplan> = {}) => {
    const c = w.clubs[i];
    return { clubId: c.id, name: c.name, shortName: c.shortName, plan: { ...c.matchplan!, ...patch }, players: w.players.filter((p) => p.contract?.clubId === c.id) };
  };
  const fmt = w.leagues[0].format;
  it('Torhüter raus führt zu Toren ins leere Tor', () => {
    let en = 0, pulls = 0;
    for (let s = 0; s < 120; s++) {
      const r = simulateMatch({ home: team(0), away: team(1), seed: s, phase: 'regular', format: fmt });
      en += r.emptyNetGoals[0] + r.emptyNetGoals[1];
      if (r.ticker.some((t) => t.text.includes('Torhüter raus'))) pulls++;
    }
    expect(pulls).toBeGreaterThan(10);
    expect(en).toBeGreaterThan(5);
  });
  it('Matchup-Anweisung erhöht die gemeinsame Eiszeit der Reihen', () => {
    const toi = (patch: Partial<Matchplan>) => {
      let t00 = 0, all = 0;
      for (let s = 0; s < 30; s++) {
        const r = simulateMatch({ home: team(0, patch), away: team(1), seed: s, phase: 'regular', format: fmt });
        t00 += r.lineMatrix.toi[3][0];
        all += r.lineMatrix.toi.flat().reduce((a, b) => a + b, 0);
      }
      return t00 / all;
    };
    const without = toi({ matchups: [] });
    const withM = toi({ matchups: [{ unit: 'line', mine: 3, vs: 0 }] });
    expect(withM).toBeGreaterThan(without * 1.3);
  });
  it('Regel-Report zählt Aktivierungen', () => {
    const rule = { id: 'r1', name: 'Immer aggressiv', enabled: true, conditions: [{ type: 'time' as const, fromMinute: 0 }], actions: [{ type: 'tactic' as const, key: 'tempo' as const, value: 'high' }] };
    const r = simulateMatch({ home: team(0, { rules: [rule] }), away: team(1, { rules: [] }), seed: 3, phase: 'regular', format: fmt });
    const rep = r.rules.find((x) => x.ruleId === 'r1')!;
    expect(rep.activations).toBeGreaterThanOrEqual(1);
    expect(rep.activeSeconds).toBeGreaterThan(3000);
  });
  it('Regelplätze begrenzen die Anzahl aktiver Regeln', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, name: `R${i}`, enabled: true, conditions: [{ type: 'time' as const, fromMinute: 0 }], actions: [{ type: 'topLines' as const }] }));
    const r = simulateMatch({ home: { ...team(0, { rules: many }), coach: { slots: 4, fastReaction: true, matchupSkill: 0 } }, away: team(1, { rules: [] }), seed: 4, phase: 'regular', format: fmt });
    expect(r.rules.filter((x) => x.team === 0)).toHaveLength(4);
  });
});

describe('Aufstellung absichern', () => {
  it('Über-/Unterzahl mit nicht aufgestellten Spielern wird vor dem Spiel ersetzt', async () => {
    const core = await import('@ehm/core');
    const { generateWorld } = await import('@ehm/data');
    const w = generateWorld(87);
    const club = w.clubs[0];
    const plan = club.matchplan!;
    const roster = w.players.filter((p) => p.contract?.clubId === club.id);
    const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
    const scratchD = roster.find((p) => (p.position === 'LD' || p.position === 'RD') && !dressed.has(p.id));
    expect(scratchD).toBeDefined();
    const broken = structuredClone(plan);
    broken.powerPlay[1].defense[1] = scratchD!.id;
    broken.penaltyKill[0].defense[1] = scratchD!.id;
    const byId = new Map(roster.map((p) => [p.id, p]));
    const fixed = core.sanitizePlan(broken, byId);
    const ids = [...fixed.powerPlay, ...fixed.penaltyKill].flatMap((u) => [...u.forwards, ...u.defense]);
    expect(ids).not.toContain(scratchD!.id);
    expect(core.sanitizePlan(plan, byId)).toBe(plan);
    const w2 = { ...w, clubs: w.clubs.map((c) => (c.id === club.id ? { ...c, matchplan: broken } : c)) };
    expect(() => core.playDay(w2)).not.toThrow();
  });
});
