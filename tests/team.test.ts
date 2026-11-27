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

  it('Sommerpause: Vorstand bewertet die Saison, jede Phase hat einen Bericht', () => {
    let w = data.generateWorld(82);
    const me = w.clubs[0].id;
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, controller: { type: 'human' as const } } : c)) };
    w = core.playDays(w, 400);
    const before = w.clubs.find((c) => c.id === me)!.boardConfidence;
    w = data.advanceOffseason(w);
    const review = w.offseason!.reports.review!;
    expect(review.lines.map((l) => l.label)).toEqual(expect.arrayContaining(['Sportlich', 'Finanzen', 'Kaderplanung', 'Zuschauer']));
    expect(review.notes[0]).toContain(`${before} %`);
    expect(w.clubs.find((c) => c.id === me)!.boardConfidence).toBe(core.seasonReview({ ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, boardConfidence: before } : c)) }, me).confidenceAfter);
    while (w.offseason && w.offseason.phase < 7) w = data.advanceOffseason(w);
    expect(Object.keys(w.offseason!.reports)).toEqual(['review', 'talks', 'transfer', 'summer', 'kickoff', 'camp', 'preseason']);
    for (const r of Object.values(w.offseason!.reports)) expect(r.headline.length).toBeGreaterThan(5);
    if (process.env.SHOW_REPORTS) for (const [k, r] of Object.entries(w.offseason!.reports)) console.log(k, JSON.stringify(r, null, 1));
    expect(WorldSchema.safeParse(w).success).toBe(true);
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

describe('Training', () => {
  it('Co-Trainer plant nach Spielplan, harte Wochen kosten Frische und Moral', async () => {
    const core = await import('@ehm/core');
    const w = world;
    const club = w.clubs[0];
    const start = core.mondayOf(w.competition!.fixtures.find((f) => f.home === club.id || f.away === club.id)!.date);
    const plan = core.coachPlan(w, club, start);
    expect(plan).toHaveLength(3);
    expect(new Set(plan.map((u) => u.focus)).size).toBe(3);
    const p = w.players.find((x) => x.contract?.clubId === club.id && x.position !== 'G')!;
    const hard = core.weekEffect(p, [{ focus: 'offense', intensity: 'hard' }, { focus: 'defense', intensity: 'hard' }, { focus: 'athletics', intensity: 'hard' }], 2, false);
    const easy = core.weekEffect(p, [{ focus: 'offense', intensity: 'light' }, { focus: 'defense', intensity: 'recovery' }, { focus: 'athletics', intensity: 'light' }], 2, false);
    expect(hard.fitness).toBeLessThan(easy.fitness);
    expect(hard.morale).toBeLessThan(-2);
    expect(easy.morale).toBeGreaterThan(0);
    expect(core.recoveryFactor({ ...club.training, week: { start, units: [], byCoach: true, individual: [], games: 2, load: 9 } })).toBeLessThan(1);
  });

  it('Eigener Plan und Einzeltraining werden angewendet; Einmal-Plan fällt an den Co-Trainer zurück', async () => {
    const core = await import('@ehm/core');
    let w = generateWorld(83);
    const me = w.clubs[0].id;
    const roster = w.players.filter((p) => p.contract?.clubId === me && p.position !== 'G');
    const myPlan = [{ focus: 'offense' as const, intensity: 'hard' as const }, { focus: 'offense' as const, intensity: 'medium' as const }, { focus: 'lines' as const, intensity: 'light' as const }];
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, controller: { type: 'human' as const }, training: { ...c.training, plan: myPlan, keep: false, individual: [{ playerId: roster[0].id, focus: 'athletics' as const }] } } : c)) };
    const date = w.competition!.fixtures[0].date;
    w = core.runTraining(w, date);
    const t = w.clubs.find((c) => c.id === me)!.training;
    expect(t.week!.byCoach).toBe(false);
    expect(t.week!.units).toEqual(myPlan);
    expect(t.plan).toBeNull();
    expect(t.week!.individual).toHaveLength(3);
    expect(t.week!.individual[0]).toMatchObject({ playerId: roster[0].id, focus: 'athletics', auto: false });
    expect(t.log['team:offense']).toBeCloseTo(1.7);
    // Schwerpunkt Angriff lenkt das Wachstum auf die Angriffswerte
    const p = roster.find((x) => x.hidden.potential - core.overall(x) > 15) ?? roster[0];
    const dev = core.trainingDev(w.clubs.find((c) => c.id === me), p);
    expect(dev.weights.shotAccuracy).toBeGreaterThan(dev.weights.stamina ?? 1);
    expect(WorldSchema.safeParse(w).success).toBe(true);
  });

  it('Saison mit Training bleibt stabil, Log wird monatlich geleert', () => {
    let w = generateWorld(84);
    w = playDays(w, 40);
    expect(w.clubs.every((c) => c.training.week !== null)).toBe(true);
    expect(w.clubs.every((c) => c.training.weeks <= 6)).toBe(true);
    const r = w.players.filter((p) => p.contract);
    const fit = r.reduce((s, p) => s + p.condition.fitness, 0) / r.length;
    const morale = r.reduce((s, p) => s + p.condition.morale, 0) / r.length;
    expect(fit).toBeGreaterThan(85);
    expect(morale).toBeGreaterThan(45);
  });
});

describe('Wochenablauf', () => {
  it('Woche starten trainiert die Woche, danach laufen die Spieltage ohne erneutes Training', async () => {
    const core = await import('@ehm/core');
    let w = generateWorld(85);
    const me = w.clubs[0].id;
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, controller: { type: 'human' as const } } : c)) };
    let st = core.weekStatus(w, me)!;
    expect(st.needsStart).toBe(st.fixtures.length > 0);
    w = core.startWeek(w);
    st = core.weekStatus(w, me)!;
    expect(st.started).toBe(true);
    expect(st.needsStart).toBe(false);
    const wk = w.clubs.find((c) => c.id === me)!.training.week!;
    expect(wk.before).toBeDefined();
    // Spieltage der Woche: kein zweites Training
    const weekStart = st.start;
    while (core.weekStatus(w, me) && core.weekStatus(w, me)!.start === weekStart) w = core.playDay(w).world;
    expect(w.clubs.find((c) => c.id === me)!.training.week!.start).toBe(weekStart);
    expect(w.clubs.find((c) => c.id === me)!.training.weeks).toBeLessThanOrEqual(1);
    // nächste Woche wartet wieder auf den Start
    st = core.weekStatus(w, me)!;
    expect(st.started).toBe(false);
  });
});

describe('Verletzungen & medizinische Abteilung', () => {
  it('Saison: im Schnitt 1–2 Verletzte je Team, Verletzte stehen nie in der Aufstellung eines Spiels', async () => {
    const core = await import('@ehm/core');
    let w = generateWorld(88);
    expect(w.clubs.every((c) => ['doctor', 'physio', 'athleticsCoach'].every((r) => w.staff.some((s) => s.contract?.clubId === c.id && s.role === r)))).toBe(true);
    const counts: number[] = [];
    for (let i = 0; i < 60; i++) {
      w = core.playDay(w).world;
      for (const c of w.clubs) counts.push(core.injuredCount(w, c.id));
      const f = w.competition!.fixtures.find((x) => x.day === w.competition!.day + 1);
      if (f) {
        const input = core.matchInputFor(w, f);
        for (const t of [input.home, input.away]) {
          const ids = [...t.plan.forwardLines.flat(), ...t.plan.defensePairs.flat(), ...t.plan.goalies];
          const byId = new Map(w.players.map((p) => [p.id, p]));
          expect(ids.every((id) => core.isAvailable(byId.get(id)!, f.date))).toBe(true);
        }
      }
    }
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(avg).toBeGreaterThan(0.6);
    expect(avg).toBeLessThan(2.6);
    expect(w.players.some((p) => p.injuries.length > 0 || p.injury)).toBe(true);
  });

  it('Ausfälle werden ersetzt, Physio verkürzt, Staff-Markt: einstellen und entlassen', async () => {
    const core = await import('@ehm/core');
    const w = generateWorld(89);
    const club = w.clubs[0];
    const roster = w.players.filter((p) => p.contract?.clubId === club.id);
    const star = club.matchplan!.forwardLines[0][1];
    const date = w.competition!.fixtures[0].date;
    const hurt = roster.map((p) => (p.id === star ? { ...p, injury: core.makeInjury(w, p, date, 'game', 'test') } : p));
    const { plan, swaps } = core.coverPlan(club.matchplan!, hurt, date);
    expect(swaps).toHaveLength(1);
    expect(plan.forwardLines.flat()).not.toContain(star);
    // Physio: ohne Physiotherapeut dauert es länger
    const physio = w.staff.find((s) => s.contract?.clubId === club.id && s.role === 'physio')!;
    const noPhysio = { ...w, staff: w.staff.filter((s) => s.id !== physio.id) };
    expect(core.medicalFactors(noPhysio, club.id).duration).toBeGreaterThan(core.medicalFactors(w, club.id).duration);
    // Staff-Markt
    const before = w.clubs[0].finances.balance;
    const fired = core.releaseStaff(w, physio.id);
    expect(fired.staff.find((s) => s.id === physio.id)!.contract).toBeNull();
    expect(fired.clubs[0].finances.balance).toBeLessThan(before);
    const cand = fired.staff.find((s) => !s.contract && s.role === 'physio' && s.id !== physio.id)!;
    const hired = core.hireStaff(fired, club.id, cand.id, 2);
    expect(hired.error).toBeUndefined();
    expect(hired.world.staff.find((s) => s.id === cand.id)!.contract!.clubId).toBe(club.id);
    expect(core.hireStaff(hired.world, club.id, physio.id, 1).error).toBeDefined(); // nur ein Physio
    expect(WorldSchema.safeParse(hired.world).success).toBe(true);
  });

  it('alte Spielstände bekommen eine medizinische Abteilung', () => {
    const w = generateWorld(90);
    const raw = JSON.parse(exportWorldJson(w));
    raw.schemaVersion = 12;
    raw.staff = raw.staff.filter((s: { role: string }) => !['doctor', 'physio', 'athleticsCoach'].includes(s.role));
    for (const p of raw.players) { delete p.injury; delete p.injuries; }
    const r = importWorldJson(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.world.clubs.every((c) => r.world.staff.some((s) => s.contract?.clubId === c.id && s.role === 'doctor'))).toBe(true);
  });
});
