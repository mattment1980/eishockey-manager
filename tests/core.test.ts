import { describe, it, expect } from 'vitest';
import { WorldSchema } from '@ehm/schema';
import { Rng, simulateMatch, autoMatchplan, isImport, roundRobinSchedule, standings, type TeamInput } from '@ehm/core';
import { generateWorld, checkReferences, importWorldJson, exportWorldJson } from '@ehm/data';

const world = generateWorld(2026);
const input = (id: string): TeamInput => {
  const c = world.clubs.find((x) => x.id === id)!;
  return { clubId: c.id, name: c.name, shortName: c.shortName, plan: c.matchplan!, players: world.players.filter((p) => p.contract?.clubId === c.id) };
};

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

describe('Saison', () => {
  it('Spielplan: 52 Spiele je Verein, 26 daheim', () => {
    const ids = world.clubs.map((c) => c.id);
    const fx = roundRobinSchedule(ids, 4, new Rng(1));
    expect(fx).toHaveLength(364);
    for (const id of ids) {
      expect(fx.filter((f) => f.home === id || f.away === id)).toHaveLength(52);
      expect(fx.filter((f) => f.home === id)).toHaveLength(26);
    }
  });
  it('Tabelle vergibt 3-2-1-0 Punkte', () => {
    const t = standings(['a', 'b'], [
      { home: 'a', away: 'b', score: [3, 1], decidedIn: 'REG' },
      { home: 'b', away: 'a', score: [2, 1], decidedIn: 'OT' },
    ], fmt0());
    expect(t.find((r) => r.clubId === 'a')!.pts).toBe(4);
    expect(t.find((r) => r.clubId === 'b')!.pts).toBe(2);
  });
});

function fmt0() {
  return world.leagues[0].format.points;
}

import { playDays, regularTable, nextFixtureOf, playDay } from '@ehm/core';

describe('Wettbewerb', () => {
  it('spielt eine komplette Saison mit Playoffs und Playdowns', () => {
    const w = playDays(generateWorld(11), 1000);
    const c = w.competition!;
    expect(c.finished).toBe(true);
    expect(c.champion).toBeTruthy();
    expect(c.relegated).toBeTruthy();
    expect(c.fixtures.filter((f) => f.stage === 'regular' && f.result)).toHaveLength(364);
    expect(regularTable(w)[0].gp).toBe(52);
    const final = c.series.find((s) => s.roundName === 'Finale')!;
    expect(final.winner).toBe(c.champion);
    expect(Math.max(final.winsHigh, final.winsLow)).toBe(4);
    for (const s of c.series) expect(Math.max(s.winsHigh, s.winsLow)).toBe(Math.ceil(s.bestOf / 2));
    expect(c.fixtures.filter((f) => f.stage !== 'regular').every((f) => f.result!.decidedIn !== 'SO')).toBe(true);
  });
  it('übernimmt live gespielte Partien', () => {
    const w0 = generateWorld(12);
    const clubId = w0.clubs[0].id;
    const f = nextFixtureOf(w0.competition!, clubId)!;
    const { world, results } = playDay(w0);
    expect(world.competition!.day).toBe(1);
    expect(results[f.id]).toBeTruthy();
    expect(world.competition!.fixtures.find((x) => x.id === f.id)!.result).toBeTruthy();
  });
});

import { initScouting, playerView, levelOf, liquidityForecast, payrollOf } from '@ehm/core';

describe('Kalender, Wirtschaft, Scouting', () => {
  it('vergibt Termine und eine Wechselfrist vor den Playoffs', () => {
    const w = generateWorld(21);
    const c = w.competition!;
    const first = c.fixtures.find((f) => f.day === 1)!;
    expect(first.date >= '2026-09-12' && first.date < '2026-09-20').toBe(true);
    const lastRegular = c.fixtures.filter((f) => f.stage === 'regular').map((f) => f.date).sort().pop()!;
    expect(c.transferDeadline < lastRegular).toBe(true);
  });
  it('bucht Einnahmen und Ausgaben über die Saison', () => {
    const w = playDays(generateWorld(22), 1000);
    for (const club of w.clubs) {
      const months = club.finances.ledger.map((m) => m.month);
      expect(months[0]).toBe('2026-08');
      expect(months[months.length - 1]).toBe('2027-07');
      expect(club.finances.attendance.length).toBeGreaterThanOrEqual(26);
      const salaries = club.finances.ledger.reduce((s, m) => s + (m.items.salaries ?? 0), 0);
      expect(Math.round(-salaries)).toBe(Math.round(payrollOf(w, club.id).players));
    }
  });
  it('Liquiditätsprognose reicht bis Juli', () => {
    const w = playDays(generateWorld(23), 10);
    const f = liquidityForecast(w, w.clubs[0].id);
    expect(f[f.length - 1].month).toBe('2027-07');
  });
  it('Scouting: Kenntnis steigt durch Spiele und Scouts', () => {
    let w = generateWorld(24);
    const me = w.clubs[0].id;
    w = initScouting(w, me);
    const foreignFree = w.players.find((p) => !p.contract && !p.nationalities.includes('DE'))!;
    const leaguePlayer = w.players.find((p) => p.contract && p.contract.clubId !== me)!;
    expect(levelOf(w.scouting[me].knowledge[foreignFree.id])).toBe(1);
    expect(levelOf(w.scouting[me].knowledge[leaguePlayer.id])).toBe(2);
    expect(playerView(w, me, leaguePlayer, 25).overall).toHaveProperty('category');
    w = playDays(w, 30);
    const before = 40, after = w.scouting[me].knowledge[foreignFree.id] ?? 0;
    const anyForeignProgress = w.players.filter((p) => !p.contract).some((p) => (w.scouting[me].knowledge[p.id] ?? 0) > before + 50);
    expect(anyForeignProgress || after > before).toBe(true);
    const own = w.players.find((p) => p.contract?.clubId === me)!;
    expect(playerView(w, me, own, 25).overall).toHaveProperty('exact');
  });
});
