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

describe('Sponsoring', () => {
  it('jeder Verein startet mit 9 Partnern, Summe nahe am Sponsorenwert', async () => {
    const core = await import('@ehm/core');
    const { generateWorld } = await import('@ehm/data');
    const w = generateWorld(95);
    for (const c of w.clubs) {
      expect(core.activeDeals(c, w.season)).toHaveLength(9);
      const r = core.sponsorAnnual(c, w.season) / c.finances.sponsorIncome;
      expect(r).toBeGreaterThan(0.75);
      expect(r).toBeLessThan(1.1);
      expect(new Set(c.sponsors.deals.map((d) => d.name)).size).toBe(9);
    }
  });

  it('Verhandeln: Forderung im Rahmen wird angenommen, zu hohe Forderung führt zu Gegenangebot oder Abbruch, nach 3 Runden ist Schluss', async () => {
    const core = await import('@ehm/core');
    const { generateWorld } = await import('@ehm/data');
    let w = generateWorld(96);
    const club = w.clubs[0];
    const offer = core.makeOffer(w, club, 'sleeve', 'test-1');
    w = { ...w, clubs: w.clubs.map((c) => (c.id === club.id ? { ...c, sponsors: { ...c.sponsors, offers: [offer], deals: c.sponsors.deals.filter((d) => d.slot !== 'sleeve') } } : c)) };
    const ok = core.negotiateOffer(w, club.id, offer.id, { base: offer.limit - 1000, termine: offer.termine });
    expect(ok.result).toBe('accepted');
    expect(core.dealOf(ok.world.clubs[0], 'sleeve', w.season)!.base).toBe(offer.limit - 1000);
    let x = w, res = '';
    for (let i = 0; i < 4 && res !== 'walked' && res !== 'final'; i++) { const r = core.negotiateOffer(x, club.id, offer.id, { base: offer.limit * 2, termine: 0 }); x = r.world; res = r.result; }
    expect(['walked', 'final']).toContain(res);
  });

  it('Pflichttermine, Boni und Sommer: freie Flächen werden zum Saisonwechsel besetzt', async () => {
    const core = await import('@ehm/core');
    const data = await import('@ehm/data');
    let w = data.generateWorld(97);
    const me = w.clubs[0].id;
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, controller: { type: 'human' as const } } : c)) };
    const before = core.openSponsorTermine(w.clubs[0], w.season);
    w = core.creditSponsorTermin(w, me);
    expect(core.openSponsorTermine(w.clubs[0], w.season)).toBe(Math.max(0, before - 1));
    w = core.playDays(w, 400);
    expect(w.clubs.some((c) => c.sponsors.paidBonus > 0)).toBe(true);
    while (data.offseasonPhase(w) !== null) w = data.advanceOffseason(w);
    for (const c of w.clubs) expect(core.activeDeals(c, w.season).length).toBe(9);
    expect(w.clubs.find((c) => c.id === me)!.sponsors.offers).toHaveLength(0);
  });
});
