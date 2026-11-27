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

import { submitOffer, expectedSalary, expectedRole, availability, playDay as playOne } from '@ehm/core';
import { seasonTransition } from '@ehm/data';
import { NO_PERKS } from '@ehm/schema';

describe('Markt und Verträge', () => {
  const base = () => {
    let w = generateWorld(31);
    const me = w.clubs[0].id;
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, controller: { type: 'human' as const } } : c)) };
    w = playOne(w).world; // Saison läuft, vor der Wechselfrist
    return { w, me };
  };
  const terms = (w: ReturnType<typeof generateWorld>, id: string, factor: number) => {
    const p = w.players.find((x) => x.id === id)!;
    return { salary: Math.round(expectedSalary(w, p) * factor), years: 2, role: expectedRole(w, p), perks: { ...NO_PERKS }, bonus: { perPoint: 0, playoffs: 0 }, clauses: { exit: false, relegation: false }, promises: [] as never[] };
  };
  it('Vereinsloser unterschreibt bei sehr gutem Angebot sofort', () => {
    const { w, me } = base();
    const fa = w.players.filter((p) => !p.contract && p.nationalities.includes('DE')).sort((a, b) => a.id.localeCompare(b.id))[0];
    expect(availability(w, fa, me)).toMatchObject({ ok: true, immediate: true });
    const r = submitOffer(w, fa.id, me, terms(w, fa.id, 1.6));
    expect(r.response.kind).toBe('accepted');
    expect(r.world.players.find((p) => p.id === fa.id)!.contract!.clubId).toBe(me);
  });
  it('zu niedriges Angebot führt zu Forderung und irgendwann zum Abbruch', () => {
    const { w, me } = base();
    const fa = w.players.find((p) => !p.contract)!;
    let world = w;
    const kinds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = submitOffer(world, fa.id, me, terms(world, fa.id, 0.4));
      kinds.push(r.response.kind);
      world = r.world;
    }
    expect(['insulted', 'lowball']).toContain(kinds[0]);
    expect(kinds).toContain('blocked');
  });
  it('Verträge vor November nur für Vereinslose', () => {
    const { w, me } = base();
    const other = w.players.find((p) => p.contract && p.contract.clubId !== me && p.contract.untilSeason === w.season)!;
    expect(availability(w, other, me).ok).toBe(false);
  });
  it('Saisonwechsel: Vorverträge greifen, Kader bleiben spielfähig', () => {
    let w = playDays(generateWorld(32), 1000);
    const moving = w.players.filter((p) => p.nextContract && p.contract && p.nextContract.clubId !== p.contract.clubId);
    w = seasonTransition(w);
    expect(w.season).toBe(2027);
    for (const p of moving) {
      const now = w.players.find((x) => x.id === p.id);
      if (now) expect(now.contract?.clubId).toBe(p.nextContract!.clubId);
    }
    for (const c of w.clubs) expect(w.players.filter((p) => p.contract?.clubId === c.id).length).toBeGreaterThanOrEqual(20);
    expect(w.competition!.day).toBe(0);
    expect(w.players.every((p) => !p.contract || p.contract.untilSeason >= 2027)).toBe(true);
  });
});

import { simulateMatch as sim2 } from '@ehm/core';
import type { Matchplan } from '@ehm/schema';

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
      const r = sim2({ home: team(0), away: team(1), seed: s, phase: 'regular', format: fmt });
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
        const r = sim2({ home: team(0, patch), away: team(1), seed: s, phase: 'regular', format: fmt });
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
    const r = sim2({ home: team(0, { rules: [rule] }), away: team(1, { rules: [] }), seed: 3, phase: 'regular', format: fmt });
    const rep = r.rules.find((x) => x.ruleId === 'r1')!;
    expect(rep.activations).toBeGreaterThanOrEqual(1);
    expect(rep.activeSeconds).toBeGreaterThan(3000);
  });
  it('Regelplätze begrenzen die Anzahl aktiver Regeln', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, name: `R${i}`, enabled: true, conditions: [{ type: 'time' as const, fromMinute: 0 }], actions: [{ type: 'topLines' as const }] }));
    const r = sim2({ home: { ...team(0, { rules: many }), coach: { slots: 4, fastReaction: true, matchupSkill: 0 } }, away: team(1, { rules: [] }), seed: 4, phase: 'regular', format: fmt });
    expect(r.rules.filter((x) => x.team === 0)).toHaveLength(4);
  });
});

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
