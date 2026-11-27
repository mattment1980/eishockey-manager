import { describe, it, expect } from 'vitest';
import type { World } from '@ehm/schema';
import {
  playDays, homeGameForecast, seatsOf, pricesOf, changePrices, cateringOf, fanBaseChange, ACTIONS, TERMINE, ST, ENGINE_CONSTANTS as C,
  setCateringMode, cateringMode, openSponsorTermine,
} from '@ehm/core';
import { generateWorld, importWorldJson, exportWorldJson } from '@ehm/data';
import { world } from './helpers.ts';

const human = (w: World, id: string): World => ({ ...w, clubs: w.clubs.map((c) => (c.id === id ? { ...c, controller: { type: 'human' as const } } : c)) });
const firstHome = (w: World, clubId: string) => w.competition!.fixtures.find((f) => f.home === clubId && !f.result)!;

describe('Stadion & Zuschauer', () => {
  it('Halle: drei Bereiche, Summe = Kapazität; jeder Verein hat einen Rivalen', () => {
    for (const c of world.clubs) {
      const s = seatsOf(c);
      expect(s.standing + s.seated + s.business).toBe(c.arena.capacity);
      expect(s.business).toBeGreaterThan(0);
      expect(c.rivals.length).toBe(1);
      expect(world.clubs.find((x) => x.id === c.rivals[0])!.rivals).toContain(c.id);
    }
  });

  it('Nachfrage: Preis, Derby und Spieltagsaktion wirken je Bereich', () => {
    const club = world.clubs[0];
    const f = firstHome(world, club.id);
    const base = homeGameForecast(world, f, { action: null });
    expect(base.total).toBeLessThanOrEqual(club.arena.capacity);
    // teurere Stehplätze → weniger Nachfrage dort, mehr Einnahme je Kopf
    const p = pricesOf(club);
    const dear = { ...world, clubs: world.clubs.map((c) => (c.id === club.id ? changePrices(c, { ...p, standing: p.standing * 1.6 }) : c)) };
    const fd = homeGameForecast(dear, f, { action: null });
    expect(fd.demand.standing).toBeLessThan(base.demand.standing);
    expect(fd.demand.business / base.demand.business).toBeGreaterThan(0.95); // nur über die gesunkene Fanstimmung
    expect(dear.clubs[0].mood.fans).toBeLessThan(club.mood.fans);
    // Derby gegen den Rivalen
    const derby = world.competition!.fixtures.find((x) => x.home === club.id && x.away === club.rivals[0])!;
    const fr = homeGameForecast(world, derby, { action: null });
    expect(fr.derby).toBe(true);
    expect(fr.factors.some((x) => x.key === 'derby')).toBe(true);
    // Familientag: günstiger, mehr Nachfrage auf Steh- und Sitzplätzen
    const fam = homeGameForecast(world, f, { action: 'familientag' });
    expect(fam.demand.seated).toBeGreaterThan(base.demand.seated);
    expect(fam.prices.standing).toBeLessThan(base.prices.standing);
    // Fan-Tag: lautere Halle → höherer Heimvorteil
    const fan = homeGameForecast(world, f, { action: 'fantag' });
    expect(fan.atmosphere).toBeGreaterThan(base.atmosphere);
    expect(fan.homeEdge).toBeGreaterThan(base.homeEdge);
  });

  it('Catering: Pächter zahlt feste Pacht, Eigenbetrieb schwankt mit den Zuschauern', () => {
    const club = world.clubs[0];
    const f = firstHome(world, club.id);
    const fc = homeGameForecast(world, f, { action: null });
    const half = { ...fc, attendance: { standing: Math.round(fc.attendance.standing / 2), seated: Math.round(fc.attendance.seated / 2), business: Math.round(fc.attendance.business / 2) }, fill: fc.fill / 2 };
    const lease = { ...club, stadium: { ...club.stadium, catering: { ...club.stadium.catering, mode: 'lease' as const } } };
    const own = { ...club, stadium: { ...club.stadium, catering: { ...club.stadium.catering, mode: 'own' as const } } };
    const l1 = cateringOf(world, lease, fc, true, null), l2 = cateringOf(world, lease, half, true, null);
    const o1 = cateringOf(world, own, fc, true, null), o2 = cateringOf(world, own, half, true, null);
    expect(l1.costs).toBe(0);
    expect(l2.income / l1.income).toBeGreaterThan(0.7); // Pacht trägt
    expect((o2.income - o2.costs) / (o1.income - o1.costs)).toBeLessThan(0.5); // Fixkosten im Eigenbetrieb
    expect(o1.income - o1.costs).toBeGreaterThan(l1.income); // volle Halle: Eigenbetrieb lohnt
  });

  it('Saison: Berichte je Heimspiel, Heimvorteil im Rahmen, Aktionen und Pflichttermine', () => {
    let w = human(generateWorld(2027), generateWorld(2027).clubs[0].id);
    const me = w.clubs[0].id;
    // Geschäftsführer plant Aktionen; erstes Heimspiel bewusst als Business-Spieltag
    const f = firstHome(w, me);
    const before = openSponsorTermine(w.clubs[0], w.season);
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, stadium: { ...c.stadium, actions: { [f.id]: 'sponsorenabend' } } } : c)) };
    w = playDays(w, 60);
    const club = w.clubs.find((c) => c.id === me)!;
    const homes = w.competition!.fixtures.filter((x) => x.home === me && x.result);
    expect(club.stadium.games.length).toBe(homes.length);
    expect(club.stadium.actions[f.id]).toBeUndefined();
    expect(club.stadium.games[0].actionId).toBe('sponsorenabend');
    if (before > 0) expect(openSponsorTermine(club, w.season)).toBeLessThan(before);
    expect(club.events.log.some((l) => l.defId === 'sponsorenabend')).toBe(true);
    const all = w.clubs.flatMap((c) => c.stadium.games);
    const edges = all.map((g) => g.homeEdge);
    expect(Math.min(...edges)).toBeGreaterThanOrEqual(C.HOME_BASE);
    expect(Math.max(...edges)).toBeLessThanOrEqual(C.HOME_BASE + C.HOME_CROWD + C.HOME_ATMOS + 1e-9);
    const avg = edges.reduce((a, b) => a + b, 0) / edges.length;
    expect(avg).toBeGreaterThan(0.034);
    expect(avg).toBeLessThan(0.046);
    for (const c of w.clubs) for (const g of c.stadium.games) {
      const t = g.attendance.standing + g.attendance.seated + g.attendance.business;
      expect(t).toBeLessThanOrEqual(c.arena.capacity);
      expect(g.atmosphere).toBeGreaterThanOrEqual(0);
      expect(g.atmosphere).toBeLessThanOrEqual(100);
    }
    // Ledger: Fanshop und Stadionbetrieb gebucht
    const sum = (k: string) => club.finances.ledger.reduce((t, m) => t + (m.items[k] ?? 0), 0);
    expect(sum('merch')).toBeGreaterThan(0);
    expect(sum('matchday')).toBeLessThan(0);
    // Fanbasis-Veränderung gedeckelt
    for (const c of w.clubs) expect(Math.abs(fanBaseChange(w, c).delta)).toBeLessThanOrEqual(ST.FANBASE_MAX);
  });

  it('Catering-Modell: Wechsel sofort vor dem ersten Heimspiel, sonst zur nächsten Saison', () => {
    const id = world.clubs[0].id;
    const cur = cateringMode(world.clubs[0]);
    const other = cur === 'own' ? 'lease' : 'own';
    const now = setCateringMode(world, id, other);
    expect(cateringMode(now.clubs[0])).toBe(other);
    const played = playDays(world, 6);
    const later = setCateringMode(played, id, other);
    const c = later.clubs.find((x) => x.id === id)!;
    if (c.stadium.games.length) {
      expect(cateringMode(c)).toBe(cur);
      expect(c.stadium.catering.nextMode).toBe(other);
    }
  });

  it('Katalog: eindeutige IDs, keine Überschneidung mit den Terminen; alte Spielstände (v15) laden', () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['familientag', 'kindertag', 'sponsorenabend']) {
      expect(ids).toContain(id);
      expect(TERMINE.some((t) => t.id === id)).toBe(false);
    }
    const raw = JSON.parse(exportWorldJson(world));
    raw.schemaVersion = 15;
    for (const c of raw.clubs) { delete c.stadium; delete c.rivals; delete c.arena.seats; }
    const res = importWorldJson(JSON.stringify(raw));
    expect(res.ok).toBe(true);
    if (res.ok) for (const c of res.world.clubs) { expect(c.rivals.length).toBe(1); expect(c.arena.seats).toBeDefined(); }
  });
});
