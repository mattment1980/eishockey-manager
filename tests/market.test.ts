/** Tests: Markt, Verträge, Saisonwechsel */
import { describe, it, expect } from 'vitest';
import { generateWorld, seasonTransition } from '@ehm/data';
import { playDays, submitOffer, expectedSalary, expectedRole, availability, playDay as playOne } from '@ehm/core';
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
