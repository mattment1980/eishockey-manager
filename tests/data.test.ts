/** Tests: CSV-Import/-Export, Datensatz neu aufbauen */
import { describe, it, expect } from 'vitest';
import { WorldSchema } from '@ehm/schema';
import { overall, playDays } from '@ehm/core';
import {
  generateWorld, parseCsv, autoMap, guessKind, PLAYER_FIELDS, CLUB_FIELDS, previewPlayers, applyPlayers, previewClubs, applyClubs,
  exportPlayersCsv, exportClubsCsv, rebuildWorld,
} from '@ehm/data';

describe('CSV', () => {
  it('liest Semikolon, Komma, Anführungszeichen und erkennt die Spalten', () => {
    const t = parseCsv('Vorname;Nachname;"Verein";Position;Stärke\r\nMax;"Muster; Junior";FAL;C;12,5\n');
    expect(t.headers).toEqual(['Vorname', 'Nachname', 'Verein', 'Position', 'Stärke']);
    expect(t.rows[0][1]).toBe('Muster; Junior');
    const m = autoMap(t.headers, PLAYER_FIELDS);
    expect(m.firstName).toBe(0); expect(m.club).toBe(2); expect(m.overall).toBe(4);
    expect(guessKind(t.headers)).toBe('players');
    expect(guessKind(['Name', 'Kürzel', 'Halle'])).toBe('clubs');
    expect(parseCsv('a,b\n1,2').delimiter).toBe(',');
  });

  it('einfache Liste legt neue Spieler mit passender Stärke an', () => {
    const w = generateWorld(201);
    const t = parseCsv('Name;Position;Verein;Stärke;Alter\nAnton Beispiel;RW;FAL;13;24\nBernd Probe;G;;9;30\n');
    const pre = previewPlayers(w, t, autoMap(t.headers, PLAYER_FIELDS), 'merge');
    expect(pre.errors).toEqual([]);
    expect(pre.creates).toBe(2);
    const w2 = applyPlayers(w, pre.items, 'merge');
    const a = w2.players.find((p) => p.lastName === 'Beispiel')!;
    expect(a.firstName).toBe('Anton');
    expect(Math.abs(overall(a) - 130)).toBeLessThan(15);
    expect(a.contract?.clubId).toBe(w.clubs.find((c) => c.shortName === 'FAL')!.id);
    expect(w2.players.find((p) => p.lastName === 'Probe')!.contract).toBeNull();
    expect(WorldSchema.safeParse(w2).success).toBe(true);
  });

  it('meldet Fehler je Zeile verständlich', () => {
    const w = generateWorld(202);
    const t = parseCsv('Vorname;Nachname;Position;Verein\nA;B;XY;FAL\nC;D;C;Unbekannt\n');
    const pre = previewPlayers(w, t, autoMap(t.headers, PLAYER_FIELDS), 'merge');
    expect(pre.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(pre.errors[1].message).toContain('Unbekannt');
  });

  it('Export und erneuter Import ändern nichts (Zusammenführen über ID)', () => {
    const w = generateWorld(203);
    const t = parseCsv(exportPlayersCsv(w));
    const pre = previewPlayers(w, t, autoMap(t.headers, PLAYER_FIELDS), 'merge');
    expect(pre.errors).toEqual([]);
    expect(pre.updates).toBe(w.players.length);
    const w2 = applyPlayers(w, pre.items, 'merge');
    const p0 = w.players[5], p1 = w2.players[5];
    expect(p1.skater).toEqual(p0.skater);
    expect(p1.contract?.clubId).toBe(p0.contract?.clubId);
  });

  it('Vereine ersetzen benennt die ganze Liga um', () => {
    const w = generateWorld(204);
    const rows = w.clubs.map((c, i) => `Neuer Verein ${i};N${i};Neustadt ${i};#112233`).join('\n');
    const t = parseCsv(`Name;Kürzel;Stadt;Farbe 1\n${rows}\n`);
    const pre = previewClubs(w, t, autoMap(t.headers, CLUB_FIELDS), 'replace');
    expect(pre.errors).toEqual([]);
    const w2 = applyClubs(w, pre.items);
    expect(w2.clubs[3].name).toBe('Neuer Verein 3');
    expect(w2.clubs[3].id).toBe(w.clubs[3].id);
    expect(parseCsv(exportClubsCsv(w2)).rows.length).toBe(w.clubs.length);
  });

  it('Datensatz neu aufbauen nach Spieler-Ersetzen und dann spielen', () => {
    const w = generateWorld(205);
    const t = parseCsv(exportPlayersCsv(w));
    const pre = previewPlayers(w, t, autoMap(t.headers, PLAYER_FIELDS), 'replace');
    const r = rebuildWorld(applyPlayers(w, pre.items, 'replace'));
    expect(r.errors).toEqual([]);
    expect(WorldSchema.safeParse(r.world).success).toBe(true);
    expect(playDays(r.world, 2).competition!.day).toBe(2);
    const broken = rebuildWorld({ ...w, players: w.players.filter((p) => p.position !== 'G') });
    expect(broken.errors.some((e) => e.includes('Torhüter'))).toBe(true);
  });
});
