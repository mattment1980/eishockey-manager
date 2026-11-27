/** Tests: Spielerentwicklung, Alterung, Nachwuchsjahrgang */
import { describe, it, expect } from 'vitest';
import { WorldSchema } from '@ehm/schema';
import {
  playDays, overall, ageOn, developSummer, devFactors, talentSpeed, youthOf, signYouth, ovrChange, attrChange,
} from '@ehm/core';
import { generateWorld, advanceOffseason, offseasonPhase, youthIntake, exportWorldJson, importWorldJson } from '@ehm/data';

describe('Spielerentwicklung', () => {
  it('Junge mit Lücke zum Potenzial wachsen im Sommer, Ältere bauen ab', () => {
    const w = generateWorld(91);
    const { world: after } = developSummer(w, w.season + 1);
    const young = w.players.filter((p) => ageOn(p.birthDate, w.date) <= 20 && p.hidden.potential - overall(p) > 15);
    const old = w.players.filter((p) => ageOn(p.birthDate, w.date) >= 33 && p.position !== 'G');
    const delta = (list: typeof young) => list.reduce((s, p) => s + overall(after.players.find((x) => x.id === p.id)!) - overall(p), 0) / list.length;
    expect(young.length).toBeGreaterThan(5);
    expect(old.length).toBeGreaterThan(5);
    expect(delta(young)).toBeGreaterThan(2);
    expect(delta(old)).toBeLessThan(-1);
  });

  it('Talent beschleunigt die Entwicklung', () => {
    expect(talentSpeed(130)).toBeGreaterThan(talentSpeed(100));
    expect(talentSpeed(100)).toBeGreaterThan(talentSpeed(75));
    const w = generateWorld(92);
    const p = w.players.find((x) => ageOn(x.birthDate, w.date) <= 21)!;
    const hi = devFactors(w, { ...p, hidden: { ...p.hidden, potential: 140 } }, w.date);
    const lo = devFactors(w, { ...p, hidden: { ...p.hidden, potential: 80 } }, w.date);
    expect(hi.total).toBeGreaterThan(lo.total);
  });

  it('entwickelt monatlich während der Saison und zeigt die Veränderung seit Saisonbeginn', () => {
    let w = generateWorld(93);
    w = playDays(w, 30); // bis in den Dezember
    const p = w.players.find((x) => x.contract && ageOn(x.birthDate, w.date) <= 21)!;
    expect(p.dev.history.length).toBeGreaterThanOrEqual(2);
    expect(ovrChange(p)).not.toBeUndefined();
    expect(attrChange(p, 'skating')).not.toBeUndefined();
  });
});

describe('Nachwuchsjahrgang', () => {
  it('jeder Verein bekommt Talente, KI entscheidet sofort, der Manager selbst', () => {
    let w = generateWorld(94);
    const me = w.clubs[0].id;
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, controller: { type: 'human' as const } } : c)) };
    w = youthIntake(w, w.season + 1);
    expect(youthOf(w, me).length).toBeGreaterThanOrEqual(4);
    for (const c of w.clubs.filter((x) => x.id !== me)) expect(youthOf(w, c.id).length).toBe(0);
    const youngsters = w.players.filter((p) => p.id.startsWith(`py${w.season + 1}-`));
    expect(youngsters.length).toBeGreaterThanOrEqual(w.clubs.length * 4);
    expect(youngsters.every((p) => { const a = ageOn(p.birthDate, `${w.season + 1}-07-15`); return a >= 16 && a <= 18; })).toBe(true);
    const pick = youthOf(w, me)[0];
    const r = signYouth(w, pick.id);
    expect(r.error).toBeUndefined();
    expect(r.world.players.find((p) => p.id === pick.id)!.contract!.clubId).toBe(me);
  });

  it('Sommerpause: Jahrgang im Sommertraining, offene Talente werden beim Saisonwechsel frei', () => {
    let w = generateWorld(95);
    const me = w.clubs[0].id;
    w = { ...w, clubs: w.clubs.map((c) => (c.id === me ? { ...c, controller: { type: 'human' as const } } : c)) };
    w = playDays(w, 400);
    while (offseasonPhase(w) !== null && w.offseason?.phase !== 4) w = advanceOffseason(w);
    expect(youthOf(w, me).length).toBeGreaterThan(0);
    w = advanceOffseason(w); // Saisonwechsel
    expect(youthOf(w, me).length).toBe(0);
    expect(WorldSchema.safeParse(w).success).toBe(true);
  });

  it('migriert v7-Spielstände', () => {
    const w = generateWorld(96);
    const raw = JSON.parse(exportWorldJson(w));
    raw.schemaVersion = 7;
    for (const p of raw.players) { delete p.dev; delete p.youthClub; }
    const res = importWorldJson(JSON.stringify(raw));
    expect(res.ok).toBe(true);
    if (res.ok) expect(Object.keys(res.world.players[0].dev.ref).length).toBeGreaterThan(0);
  });
});
