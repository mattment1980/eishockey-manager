/** Tests: Spielplan, Tabelle, Wettbewerb, Kalender, Wirtschaft, Scouting */
import { describe, it, expect } from 'vitest';
import { Rng, roundRobinSchedule, standings, playDays, regularTable, nextFixtureOf, playDay, initScouting, playerView, levelOf, liquidityForecast, payrollOf } from '@ehm/core';
import { generateWorld } from '@ehm/data';
import { world } from './helpers.ts';

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
      // Kader ändert sich durch Verpflichtungen während der Saison → nur ungefähr gleich
      expect(Math.abs(-salaries / payrollOf(w, club.id).players - 1)).toBeLessThan(0.15);
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

describe('Saisonarchiv', () => {
  it('Saisonwechsel archiviert Tabelle, Teamstatistik und Spielerkarrieren', async () => {
    const core = await import('@ehm/core');
    const data = await import('@ehm/data');
    let w = data.generateWorld(86);
    w = core.playDays(w, 400);
    const year = w.competition!.year;
    const top = Object.entries(w.competition!.stats.regular).sort((a, b) => b[1].g + b[1].a - a[1].g - a[1].a)[0];
    while (data.offseasonPhase(w) !== null) w = data.advanceOffseason(w);
    expect(w.archive).toHaveLength(1);
    const a = w.archive[0];
    expect(a.season).toBe(year);
    expect(a.table).toHaveLength(14);
    expect(a.teams.regular.every((r) => r.gp === 52)).toBe(true);
    expect(a.champion).not.toBeNull();
    const p = w.players.find((x) => x.id === top[0]);
    if (p) expect(p.career.at(-1)).toMatchObject({ season: year, regular: { g: top[1].g, a: top[1].a } });
  });
});
