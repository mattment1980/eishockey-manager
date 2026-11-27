/** Tests: Chemie, Moral, Fitness, Form, Eingespieltheit, Sommerpause, Talent, Migration */
import { describe, it, expect } from 'vitest';
import { WorldSchema } from '@ehm/schema';
import { simulateMatch, type TeamInput, playDays, playDay, initScouting, playerView } from '@ehm/core';
import { generateWorld, importWorldJson, exportWorldJson } from '@ehm/data';
import { world, input } from './helpers.ts';

describe('Chemie & Moral', () => {
  it('Reihenchemie wächst, Moral reagiert auf Ergebnisse und Tribüne', async () => {
    const { updateAfterGames, pairKey, unitChemistry } = await import('@ehm/core');
    const home = world.clubs[0], away = world.clubs[1];
    const plan = home.matchplan!;
    const [a, b] = plan.forwardLines[0];
    const before = world.chemistry[pairKey(a, b)] ?? 30;
    const r = simulateMatch({ home: input(home.id), away: input(away.id), seed: 1, phase: 'regular', format: world.leagues[0].format, keepEvents: false } as never);
    const fixture = { id: 'f', day: 1, home: home.id, away: away.id } as never;
    const w2 = updateAfterGames(world, [{ fixture, result: r }]);
    expect(w2.chemistry[pairKey(a, b)]).toBeGreaterThan(before);
    const byId = new Map(w2.players.map((p) => [p.id, p]));
    expect(unitChemistry(w2, plan.forwardLines[0], byId)).toBeGreaterThan(0);
    const won = r.score[0] > r.score[1];
    const dressed = new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies]);
    const scratched = world.players.filter((p) => p.contract?.clubId === home.id && !dressed.has(p.id));
    for (const p of scratched) expect(byId.get(p.id)!.condition.morale).toBeLessThanOrEqual(Math.max(p.condition.morale, 60) + (won ? 2 : 0) + 0.1);
  });
  it('Leader-Bonus wird im Ticker angekündigt, Hitzkopf kassiert mehr Strafen', () => {
    const base = input(world.clubs[0].id);
    const lead = base.plan.forwardLines[0][0];
    const withTrait = (t: string) => ({ ...base, players: base.players.map((p) => (p.position === 'G' ? p : { ...p, traits: [{ id: t as never, strength: 100 }] })) });
    let announced = 0, pimHot = 0, pimNormal = 0;
    for (let s = 0; s < 30; s++) {
      const arg = (h: TeamInput) => ({ home: h, away: input(world.clubs[1].id), seed: s, phase: 'playoff', format: world.leagues[0].format, keepEvents: false } as never);
      const r = simulateMatch(arg({ ...withTrait('leader'), captainId: lead }));
      if (r.ticker.some((t) => t.text.includes('Leader-Bonus'))) announced++;
      pimHot += simulateMatch(arg(withTrait('hitzkopf'))).teamStats[0].pim;
      pimNormal += simulateMatch(arg(base)).teamStats[0].pim;
    }
    expect(announced).toBeGreaterThan(3);
    expect(pimHot).toBeGreaterThan(pimNormal);
  });
});

describe('Zustand, Eingespieltheit, Sommerpause (vor M7)', async () => {
  const core = await import('@ehm/core');
  const data = await import('@ehm/data');

  it('Fitness sinkt mit Eiszeit und erholt sich, Form bewegt sich', () => {
    let w = data.generateWorld(77);
    const day = core.playDay(w);
    const fx = day.world.competition!.fixtures.filter((f) => f.day === 1);
    // direkt nach dem Spiel (ohne Erholung bis zum nächsten Termin)
    w = core.updateCondition(w, fx.map((f) => ({ fixture: f, result: day.results[f.id] })));
    const tired = w.players.filter((p) => p.contract && p.condition.fitness < 95);
    expect(tired.length).toBeGreaterThan(20);
    const forms = new Set(w.players.filter((p) => p.contract).map((p) => p.condition.form));
    expect(forms.size).toBeGreaterThan(50);
    const rested = core.recoverFitness(w, 6);
    const p = tired[0];
    expect(rested.players.find((x) => x.id === p.id)!.condition.fitness).toBeGreaterThan(p.condition.fitness);
    // aktuelle Stärke: müder Spieler liegt unter seinem Grundwert
    const exhausted = { ...p, condition: { fitness: 70, form: 50, morale: 50 } };
    expect(core.effectiveRating(exhausted)).toBeLessThan(core.overall(exhausted));
  });

  it('Taktik-Eingespieltheit wächst mit Spielen und neue Systeme starten niedrig', () => {
    let w = data.generateWorld(78);
    const c0 = w.clubs[0];
    const before = core.teamFamiliarity(c0.familiarity, c0.matchplan!.tactics, c0.matchplan!);
    w = core.playDays(w, 4);
    const c1 = w.clubs.find((c) => c.id === c0.id)!;
    expect(core.teamFamiliarity(c1.familiarity, c1.matchplan!.tactics, c1.matchplan!)).toBeGreaterThan(before);
    const other = { ...c1.matchplan!.tactics, forecheck: c1.matchplan!.tactics.forecheck === '1-3-1' ? '2-1-2' as const : '1-3-1' as const };
    expect(core.familiarityValue(c1.familiarity, `forecheck:${other.forecheck}`)).toBeLessThan(core.familiarityValue(c1.familiarity, `forecheck:${c1.matchplan!.tactics.forecheck}`));
  });

  it('Teamstatistik und Form der letzten Spiele', () => {
    let w = data.generateWorld(79);
    w = core.playDays(w, 6);
    const rows = core.teamSeasonStats(w, 'regular');
    expect(rows.reduce((s, r) => s + r.gf, 0)).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.gp).toBe(6);
      expect(r.detailed).toBe(6);
      expect(r.ppg).toBeLessThanOrEqual(r.pp);
    }
    expect(rows.reduce((s, r) => s + r.pp, 0)).toBe(rows.reduce((s, r) => s + r.pk, 0));
    expect(core.lastResults(w.competition!, w.clubs[0].id).length).toBe(5);
  });

  it('Sommerpause läuft in Phasen bis zum Saisonstart', () => {
    let w = data.generateWorld(80);
    w = core.playDays(w, 400);
    expect(w.competition!.finished).toBe(true);
    expect(data.offseasonPhase(w)).toBe(0);
    const year = w.season;
    const seen: number[] = [];
    let guard = 0;
    while (data.offseasonPhase(w) !== null && guard++ < 20) { w = data.advanceOffseason(w); seen.push(data.offseasonPhase(w) ?? -1); }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, -1]);
    expect(w.season).toBe(year + 1);
    expect(w.competition!.day).toBe(0);
    expect(WorldSchema.safeParse(w).success).toBe(true);
    w = core.playDays(w, 1);
    expect(w.competition!.day).toBe(1);
  });

  it('Talent ist je nach Scouting exakt, als Spanne oder unbekannt', () => {
    const w = data.generateWorld(81);
    const clubId = w.clubs[0].id;
    const st = w.scouting[clubId] ? w : core.initScouting(w, clubId);
    const foreign = st.players.find((p) => !p.contract && core.regionOf(p) !== 'DE')!;
    const own = st.players.find((p) => p.contract?.clubId === clubId)!;
    expect('stars' in core.playerView(st, clubId, own, 25).talent).toBe(true);
    expect('hidden' in core.playerView(st, clubId, foreign, 25).talent).toBe(true);
  });

  it('migriert v6-Spielstände', () => {
    const w = data.generateWorld(82);
    const raw = JSON.parse(data.exportWorldJson(w));
    raw.schemaVersion = 6;
    delete raw.offseason;
    for (const c of raw.clubs) delete c.familiarity;
    const res = data.importWorldJson(JSON.stringify(raw));
    expect(res.ok).toBe(true);
    if (res.ok) expect(Object.keys(res.world.clubs[0].familiarity).length).toBeGreaterThan(0);
  });
});

describe('Scouting-Auftrag', () => {
  it('Scouts reisen zu beobachteten Spielern außerhalb ihrer Region', async () => {
    const core = await import('@ehm/core');
    const data = await import('@ehm/data');
    let w = data.generateWorld(83);
    const clubId = w.clubs[0].id;
    w = core.initScouting(w, clubId);
    const covered = new Set(core.scoutsOf(w, clubId).map((s) => s.region ?? 'DE'));
    const target = w.players.find((p) => !p.contract && !covered.has(core.regionOf(p)))!;
    expect(target).toBeDefined();
    const before = w.scouting[clubId].knowledge[target.id] ?? 0;
    const later = core.addDays(w.date, 14);
    const without = core.updateScouting(w, later, []);
    expect(without.scouting[clubId].knowledge[target.id] ?? 0).toBe(before);
    w = { ...w, scouting: { ...w.scouting, [clubId]: { ...w.scouting[clubId], watch: [target.id] } } };
    const withWatch = core.updateScouting(w, later, []);
    expect(withWatch.scouting[clubId].knowledge[target.id]).toBeGreaterThan(before);
  });
});
