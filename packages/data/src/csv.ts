import type { World, Player, Club, Position, TraitId, ClubProfile } from '@ehm/schema';
import { SKATER_ATTRIBUTES, GOALIE_ATTRIBUTES, TRAIT_IDS, makeContract } from '@ehm/schema';
import { overall, ageOn, Rng } from '@ehm/core';
import { WorldGenerator } from './generator.ts';

/**
 * CSV-Import und -Export für Spieler und Vereine.
 * - Werte auf der Anzeigeskala 1–20 (Nachkommastellen erlaubt), intern ×10.
 * - Spaltenzuordnung: Kopfzeilen werden automatisch erkannt (deutsch/englisch), lassen sich aber frei zuordnen.
 * - Fehlende Attribute werden aus „Stärke“ erzeugt – so reicht schon eine einfache Liste (Name, Position, Verein, Stärke, Alter).
 */

// ---------------------------------------------------------------- CSV lesen/schreiben

export interface CsvTable { headers: string[]; rows: string[][]; delimiter: string }

/** CSV lesen: Trennzeichen ; , oder Tab (automatisch), Anführungszeichen, Zeilenumbrüche in Feldern */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const delimiter = [';', '\t', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  const [headers = [], ...body] = rows;
  return { headers: headers.map((h) => h.trim()), rows: body, delimiter };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (headers: string[], rows: unknown[][]) => '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';

// ---------------------------------------------------------------- Felder

export interface CsvField {
  key: string;
  label: string;
  /** Kopfzeilen, die automatisch zugeordnet werden (klein geschrieben, ohne Leerzeichen) */
  synonyms: string[];
  required?: boolean;
  hint?: string;
}

const ATTR_DE: Record<string, string> = {
  skating: 'Eislaufen', agility: 'Beweglichkeit', puckHandling: 'Scheibenführung', passing: 'Passen', shotPower: 'Schusskraft',
  shotAccuracy: 'Schussgenauigkeit', faceoffs: 'Bullys', defPositioning: 'Stellungsspiel', stickChecking: 'Stockcheck',
  bodyChecking: 'Körperspiel', shotBlocking: 'Schüsse blocken', strength: 'Kraft', stamina: 'Ausdauer', hockeyIQ: 'Spielintelligenz',
  anticipation: 'Antizipation', composure: 'Nervenstärke', discipline: 'Disziplin', workRate: 'Einsatz', leadership: 'Führung',
};
const GOALIE_DE: Record<string, string> = {
  reflexes: 'Reflexe', positioning: 'Positionsspiel', lowShots: 'Flache Schüsse', glove: 'Fanghand', blocker: 'Stockhand',
  reboundControl: 'Abpraller', puckPlaying: 'Scheibenspiel', agility: 'Beweglichkeit', concentration: 'Konzentration', composure: 'Nervenstärke',
};
const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

export const PLAYER_FIELDS: CsvField[] = [
  { key: 'id', label: 'ID', synonyms: ['id', 'spielerid', 'playerid'], hint: 'Zum Aktualisieren bestehender Spieler; leer = neuer Spieler' },
  { key: 'firstName', label: 'Vorname', synonyms: ['vorname', 'firstname', 'first'], hint: 'Fehlt die Spalte, wird „Nachname“ am ersten Leerzeichen geteilt' },
  { key: 'lastName', label: 'Nachname', synonyms: ['nachname', 'lastname', 'name', 'last', 'familienname'], required: true },
  { key: 'birthDate', label: 'Geburtsdatum', synonyms: ['geburtsdatum', 'birthdate', 'geboren', 'dob'], hint: 'JJJJ-MM-TT oder TT.MM.JJJJ' },
  { key: 'age', label: 'Alter', synonyms: ['alter', 'age'], hint: 'Alternative zum Geburtsdatum' },
  { key: 'nationality', label: 'Nation', synonyms: ['nation', 'nationalitaet', 'nationality', 'land', 'country'], hint: 'Ländercode (DE, CA, SE …); mehrere mit / trennen' },
  { key: 'position', label: 'Position', synonyms: ['position', 'pos'], required: true, hint: 'C, LW, RW, LD, RD, G (auch F/D/Sturm/Verteidigung/Tor)' },
  { key: 'shoots', label: 'Schusshand', synonyms: ['schusshand', 'shoots', 'hand', 'schiesst'], hint: 'L oder R' },
  { key: 'club', label: 'Verein', synonyms: ['verein', 'club', 'team', 'mannschaft'], hint: 'ID, Kürzel oder Name; leer = vereinslos' },
  { key: 'salary', label: 'Gehalt', synonyms: ['gehalt', 'salary', 'lohn'] },
  { key: 'contractUntil', label: 'Vertrag bis', synonyms: ['vertragbis', 'contractuntil', 'vertrag', 'bis'], hint: 'Jahr des Saisonendes, z. B. 2028' },
  { key: 'overall', label: 'Stärke', synonyms: ['staerke', 'strength', 'gesamt', 'overall', 'ovr', 'rating'], hint: '1–20; erzeugt fehlende Einzelwerte' },
  { key: 'potential', label: 'Potenzial', synonyms: ['potenzial', 'potential', 'pot', 'talent'], hint: '1–20 (Obergrenze der Entwicklung)' },
  { key: 'traits', label: 'Charakter', synonyms: ['charakter', 'traits', 'eigenschaften'], hint: 'IDs mit | getrennt, z. B. leader|mentor' },
  ...SKATER_ATTRIBUTES.map((k) => ({ key: k, label: ATTR_DE[k], synonyms: [norm(k), norm(ATTR_DE[k])], hint: '1–20' })),
  ...GOALIE_ATTRIBUTES.map((k) => ({ key: `g_${k}`, label: `Torhüter: ${GOALIE_DE[k]}`, synonyms: [`g${norm(k)}`, `tw${norm(GOALIE_DE[k])}`, ...(k === 'reflexes' || k === 'glove' || k === 'blocker' || k === 'lowShots' || k === 'reboundControl' || k === 'concentration' || k === 'positioning' || k === 'puckPlaying' ? [norm(k), norm(GOALIE_DE[k])] : [])], hint: '1–20' })),
];

export const CLUB_FIELDS: CsvField[] = [
  { key: 'id', label: 'ID', synonyms: ['id', 'vereinsid', 'clubid'], hint: 'Bestehender Verein; leer = Zuordnung über Kürzel/Name oder Reihenfolge' },
  { key: 'name', label: 'Name', synonyms: ['name', 'verein', 'club', 'vereinsname'], required: true },
  { key: 'shortName', label: 'Kürzel', synonyms: ['kuerzel', 'shortname', 'abk', 'abkuerzung', 'short'], hint: 'höchstens 4 Zeichen' },
  { key: 'city', label: 'Stadt', synonyms: ['stadt', 'city', 'ort'] },
  { key: 'nickname', label: 'Spitzname', synonyms: ['spitzname', 'nickname', 'beiname'] },
  { key: 'profile', label: 'Profil', synonyms: ['profil', 'profile'], hint: 'tradition, corporate, patron, development, promoted' },
  { key: 'colorPrimary', label: 'Farbe 1', synonyms: ['farbe1', 'farbe', 'color1', 'primary', 'primaerfarbe'], hint: '#RRGGBB' },
  { key: 'colorSecondary', label: 'Farbe 2', synonyms: ['farbe2', 'color2', 'secondary', 'sekundaerfarbe'], hint: '#RRGGBB' },
  { key: 'arena', label: 'Halle', synonyms: ['halle', 'arena', 'stadion'] },
  { key: 'capacity', label: 'Plätze', synonyms: ['plaetze', 'kapazitaet', 'capacity', 'zuschauer'] },
  { key: 'budget', label: 'Etat', synonyms: ['etat', 'budget'] },
];

export type Mapping = Record<string, number | null>;

/** Spalten automatisch den Feldern zuordnen */
export function autoMap(headers: string[], fields: CsvField[]): Mapping {
  const map: Mapping = {};
  const used = new Set<number>();
  for (const f of fields) {
    const idx = headers.findIndex((h, i) => !used.has(i) && (norm(h) === norm(f.key) || f.synonyms.includes(norm(h)) || norm(h) === norm(f.label)));
    map[f.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

/** Spieler- oder Vereinsdatei anhand der Kopfzeile erkennen */
export function guessKind(headers: string[]): 'players' | 'clubs' {
  const p = Object.values(autoMap(headers, PLAYER_FIELDS)).filter((x) => x !== null).length;
  const c = Object.values(autoMap(headers, CLUB_FIELDS)).filter((x) => x !== null).length;
  return p >= c + 1 || headers.some((h) => ['position', 'pos', 'vorname', 'firstname'].includes(norm(h))) ? 'players' : 'clubs';
}

// ---------------------------------------------------------------- Werte lesen

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.trim().replace(/\s/g, '').replace(/€/g, '');
  if (!t) return null;
  const v = Number(t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
const rating = (s: string | undefined): number | null => {
  const v = num(s);
  if (v === null) return null;
  return Math.max(1, Math.min(200, Math.round(v * 10)));
};
const POS: Record<string, Position> = { c: 'C', center: 'C', lw: 'LW', lf: 'LW', rw: 'RW', rf: 'RW', ld: 'LD', rd: 'RD', g: 'G', tw: 'G', goalie: 'G', torhueter: 'G', tor: 'G', f: 'C', sturm: 'C', stuermer: 'C', d: 'LD', verteidiger: 'LD', verteidigung: 'LD' };
function dateOf(s: string | undefined): string | null {
  const t = s?.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Verein aus ID, Kürzel oder Name finden */
export function findClub(world: World, ref: string): Club | undefined {
  const r = norm(ref);
  return world.clubs.find((c) => norm(c.id) === r || norm(c.shortName) === r || norm(c.name) === r || norm(`${c.city} ${c.nickname}`) === r);
}

export interface RowError { row: number; message: string }

export interface PlayerRow {
  row: number;
  id?: string;
  values: Partial<Record<string, string>>;
}

export interface ImportPreview<T> {
  items: T[];
  errors: RowError[];
  /** Zeilen, die einen bestehenden Datensatz aktualisieren bzw. neu anlegen */
  updates: number;
  creates: number;
}

const get = (row: string[], map: Mapping, key: string) => (map[key] === null || map[key] === undefined ? undefined : row[map[key]!]?.trim());

/** Fertiger Spieler-Datensatz aus einer CSV-Zeile (noch nicht in der Welt) */
export interface PlayerImport { row: number; existing?: Player; player: Player }

/**
 * Spielerzeilen prüfen und in Spieler übersetzen.
 * Bestehende Spieler (gleiche ID oder gleicher Name + Geburtsdatum) werden nur in den angegebenen Feldern geändert.
 */
export function previewPlayers(world: World, table: CsvTable, map: Mapping, mode: 'merge' | 'replace'): ImportPreview<PlayerImport> {
  const errors: RowError[] = [];
  const items: PlayerImport[] = [];
  const gen = new WorldGenerator({ seed: world.seed + 31337, season: world.season, idPrefix: `imp${world.season}-` });
  const rng = new Rng(`${world.seed}:import`);
  const byId = new Map(world.players.map((p) => [p.id, p]));
  for (const f of PLAYER_FIELDS) if (f.required && (map[f.key] === null || map[f.key] === undefined)) errors.push({ row: 0, message: `Pflichtfeld „${f.label}“ ist keiner Spalte zugeordnet.` });
  if (errors.length) return { items, errors, updates: 0, creates: 0 };
  table.rows.forEach((r, i) => {
    const row = i + 2; // Zeile in der Datei (Kopfzeile = 1)
    const err = (m: string) => errors.push({ row, message: m });
    const v = (k: string) => get(r, map, k);
    const id = v('id');
    let firstName = v('firstName') ?? '', lastName = v('lastName') ?? '';
    if (!firstName && lastName.includes(' ')) { const i = lastName.indexOf(' '); firstName = lastName.slice(0, i); lastName = lastName.slice(i + 1); }
    const birth = dateOf(v('birthDate'));
    if (v('birthDate') && !birth) err(`Geburtsdatum „${v('birthDate')}“ nicht lesbar (JJJJ-MM-TT oder TT.MM.JJJJ).`);
    const existing = mode === 'merge'
      ? (id ? byId.get(id) : undefined) ?? world.players.find((p) => norm(p.firstName) === norm(firstName) && norm(p.lastName) === norm(lastName) && (!birth || p.birthDate === birth))
      : undefined;
    if (id && mode === 'merge' && !existing) err(`Spieler-ID ${id} gibt es nicht – Zeile wird als neuer Spieler angelegt.`);
    if (!existing && (!firstName || !lastName)) { err('Vor- und Nachname fehlen.'); return; }
    const posRaw = v('position');
    const position = posRaw ? POS[norm(posRaw)] : existing?.position;
    if (!position) { err(`Position „${posRaw ?? ''}“ unbekannt (C, LW, RW, LD, RD, G).`); return; }
    const ageV = num(v('age'));
    const age = birth ? ageOn(birth, world.date) : ageV ?? (existing ? ageOn(existing.birthDate, world.date) : 25);
    if (age < 15 || age > 45) err(`Alter ${age} ist unplausibel.`);
    const natRaw = v('nationality');
    const nats = natRaw ? natRaw.split(/[/|,]/).map((x) => x.trim().toUpperCase()).filter(Boolean) : existing?.nationalities ?? ['DE'];
    if (nats.some((n) => n.length !== 2)) { err(`Nation „${natRaw}“: bitte zweistellige Ländercodes (DE, CA, SE …).`); return; }
    const clubRef = v('club');
    let clubId: string | null | undefined = undefined;
    if (clubRef !== undefined) {
      if (clubRef === '' || norm(clubRef) === 'vereinslos' || norm(clubRef) === 'free') clubId = null;
      else {
        const c = findClub(world, clubRef);
        if (!c) { err(`Verein „${clubRef}“ nicht gefunden (ID, Kürzel oder Name).`); return; }
        clubId = c.id;
      }
    }
    // Basis: bestehender Spieler oder neu erzeugter Spieler in passender Stärke
    const strength = rating(v('overall'));
    let p: Player = existing ?? gen.generatePlayer({ position, quality: strength ?? 95, age, nationality: nats[0], clubId: null });
    if (strength !== null) {
      // Stärke als Ziel: alle Werte gleichmäßig verschieben
      const diff = strength - overall(p);
      const shift = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, Math.max(1, Math.min(200, Math.round(x + diff)))]));
      p = { ...p, skater: shift(p.skater) as Player['skater'], goalie: p.goalie ? (shift(p.goalie) as Player['goalie']) : undefined };
    }
    p = { ...p, position, nationalities: nats };
    if (firstName) p.firstName = firstName;
    if (lastName) p.lastName = lastName;
    if (birth) p.birthDate = birth;
    else if (ageV !== null && !existing) p.birthDate = `${Number(world.date.slice(0, 4)) - ageV - 1}-${String(rng.int(1, 12)).padStart(2, '0')}-${String(rng.int(1, 28)).padStart(2, '0')}`;
    const sh = v('shoots')?.toUpperCase();
    if (sh === 'L' || sh === 'R') p.shoots = sh;
    // Einzelwerte
    const skater = { ...p.skater };
    for (const k of SKATER_ATTRIBUTES) { const x = rating(v(k)); if (x !== null) skater[k] = x; }
    p.skater = skater;
    if (position === 'G') {
      const goalie = { ...(p.goalie ?? gen.generatePlayer({ position: 'G', quality: strength ?? 95, age, nationality: nats[0], clubId: null }).goalie!) };
      for (const k of GOALIE_ATTRIBUTES) { const x = rating(v(`g_${k}`)); if (x !== null) goalie[k] = x; }
      p.goalie = goalie;
    } else p.goalie = undefined;
    const pot = rating(v('potential'));
    if (pot !== null) p.hidden = { ...p.hidden, potential: pot };
    else if (!existing && strength !== null) p.hidden = { ...p.hidden, potential: Math.round(strength + (age <= 23 ? (24 - age) * 4 : 2)) };
    if (p.hidden.potential < overall(p)) p.hidden = { ...p.hidden, potential: Math.round(overall(p)) };
    const tr = v('traits');
    if (tr !== undefined) {
      const ids = tr.split(/[|,]/).map((x) => x.trim()).filter(Boolean);
      const bad = ids.filter((x) => !(TRAIT_IDS as readonly string[]).includes(x));
      if (bad.length) err(`Unbekannter Charakter: ${bad.join(', ')}.`);
      p.traits = ids.filter((x) => (TRAIT_IDS as readonly string[]).includes(x)).map((x) => ({ id: x as TraitId, strength: 75 }));
    }
    // Vertrag
    const salary = num(v('salary'));
    const until = num(v('contractUntil'));
    if (clubId === null) p.contract = null;
    else if (clubId) {
      const untilSeason = until ? until - 1 : p.contract?.clubId === clubId ? p.contract.untilSeason : world.season + 1;
      p.contract = p.contract && p.contract.clubId === clubId
        ? { ...p.contract, untilSeason, salary: salary ?? p.contract.salary }
        : makeContract({ clubId, salary: salary ?? 40_000, untilSeason, role: 'regular' });
    } else if (p.contract && (salary !== null || until !== null)) {
      p.contract = { ...p.contract, salary: salary ?? p.contract.salary, untilSeason: until ? until - 1 : p.contract.untilSeason };
    }
    if (p.contract && p.contract.untilSeason < world.season) err(`Vertrag bis ${until} liegt in der Vergangenheit.`);
    items.push({ row, existing, player: p });
  });
  return { items, errors, updates: items.filter((x) => x.existing).length, creates: items.filter((x) => !x.existing).length };
}

/** Importierte Spieler übernehmen: zusammenführen (ändern/ergänzen) oder alle Spieler ersetzen */
export function applyPlayers(world: World, items: PlayerImport[], mode: 'merge' | 'replace'): World {
  if (mode === 'replace') return { ...world, players: items.map((x) => x.player) };
  const updated = new Map(items.filter((x) => x.existing).map((x) => [x.existing!.id, x.player]));
  const added = items.filter((x) => !x.existing).map((x) => x.player);
  return { ...world, players: [...world.players.map((p) => updated.get(p.id) ?? p), ...added] };
}

export interface ClubImport { row: number; target: Club; club: Club }

const PROFILES: ClubProfile[] = ['tradition', 'corporate', 'patron', 'development', 'promoted'];

/**
 * Vereinszeilen prüfen. Zusammenführen: Zuordnung über ID, Kürzel oder Name.
 * Ersetzen: Zeile für Zeile auf die bestehenden Vereine (gleiche Anzahl nötig) – so lässt sich die ganze Liga umbenennen.
 */
export function previewClubs(world: World, table: CsvTable, map: Mapping, mode: 'merge' | 'replace'): ImportPreview<ClubImport> {
  const errors: RowError[] = [];
  const items: ClubImport[] = [];
  if (map.name === null || map.name === undefined) return { items, errors: [{ row: 0, message: 'Pflichtfeld „Name“ ist keiner Spalte zugeordnet.' }], updates: 0, creates: 0 };
  if (mode === 'replace' && table.rows.length !== world.clubs.length) errors.push({ row: 0, message: `Ersetzen braucht genau ${world.clubs.length} Vereine (Datei: ${table.rows.length}).` });
  const shorts = new Set<string>();
  table.rows.forEach((r, i) => {
    const row = i + 2;
    const err = (m: string) => errors.push({ row, message: m });
    const v = (k: string) => get(r, map, k);
    const target = mode === 'replace' ? world.clubs[i] : (v('id') && world.clubs.find((c) => c.id === v('id'))) || (v('shortName') && findClub(world, v('shortName')!)) || findClub(world, v('name') ?? '');
    if (!target) { err(`Verein „${v('name')}“ nicht gefunden – neue Vereine lassen sich nur über einen kompletten JSON-Datensatz anlegen.`); return; }
    const c: Club = structuredClone(target);
    if (v('name')) c.name = v('name')!;
    if (v('shortName')) {
      const s = v('shortName')!.toUpperCase();
      if (s.length > 4) err(`Kürzel „${s}“ ist länger als 4 Zeichen.`);
      c.shortName = s.slice(0, 4);
    }
    if (shorts.has(c.shortName)) err(`Kürzel ${c.shortName} kommt doppelt vor.`);
    shorts.add(c.shortName);
    if (v('city')) c.city = v('city')!;
    if (v('nickname')) c.nickname = v('nickname')!;
    const prof = v('profile');
    if (prof) {
      if (!PROFILES.includes(prof as ClubProfile)) err(`Profil „${prof}“ unbekannt (${PROFILES.join(', ')}).`);
      else c.profile = prof as ClubProfile;
    }
    const col = (x: string | undefined) => (x && /^#?[0-9a-f]{6}$/i.test(x) ? (x.startsWith('#') ? x : `#${x}`) : null);
    if (v('colorPrimary')) { const x = col(v('colorPrimary')); if (x) c.colors.primary = x; else err(`Farbe „${v('colorPrimary')}“ ist kein #RRGGBB-Wert.`); }
    if (v('colorSecondary')) { const x = col(v('colorSecondary')); if (x) c.colors.secondary = x; else err(`Farbe „${v('colorSecondary')}“ ist kein #RRGGBB-Wert.`); }
    if (v('arena')) c.arena.name = v('arena')!;
    const cap = num(v('capacity'));
    if (cap !== null) { if (cap < 500 || cap > 20000) err(`Hallengröße ${cap} ist unplausibel.`); else c.arena.capacity = Math.round(cap); }
    const budget = num(v('budget'));
    if (budget !== null) { if (budget < 500_000) err(`Etat ${budget} ist unplausibel (in Euro angeben).`); else c.finances.budget = Math.round(budget); }
    items.push({ row, target, club: c });
  });
  return { items, errors, updates: items.length, creates: 0 };
}

export function applyClubs(world: World, items: ClubImport[]): World {
  const byId = new Map(items.map((x) => [x.target.id, x.club]));
  return { ...world, clubs: world.clubs.map((c) => byId.get(c.id) ?? c) };
}

// ---------------------------------------------------------------- Export

const d1 = (v: number) => (v / 10).toFixed(1).replace('.', ',');

export function exportPlayersCsv(world: World): string {
  const headers = ['ID', 'Vorname', 'Nachname', 'Geburtsdatum', 'Nation', 'Position', 'Schusshand', 'Verein', 'Gehalt', 'Vertrag bis', 'Stärke', 'Potenzial', 'Charakter',
    ...SKATER_ATTRIBUTES.map((k) => ATTR_DE[k]), ...GOALIE_ATTRIBUTES.map((k) => `Torhüter: ${GOALIE_DE[k]}`)];
  const clubs = new Map(world.clubs.map((c) => [c.id, c.shortName]));
  const rows = world.players.map((p) => [
    p.id, p.firstName, p.lastName, p.birthDate, p.nationalities.join('/'), p.position, p.shoots,
    p.contract ? clubs.get(p.contract.clubId) : '', p.contract?.salary ?? '', p.contract ? p.contract.untilSeason + 1 : '',
    d1(overall(p)), d1(p.hidden.potential), p.traits.map((t) => t.id).join('|'),
    ...SKATER_ATTRIBUTES.map((k) => d1(p.skater[k])), ...GOALIE_ATTRIBUTES.map((k) => (p.goalie ? d1(p.goalie[k]) : '')),
  ]);
  return toCsv(headers, rows);
}

export function exportClubsCsv(world: World): string {
  const headers = ['ID', 'Name', 'Kürzel', 'Stadt', 'Spitzname', 'Profil', 'Farbe 1', 'Farbe 2', 'Halle', 'Plätze', 'Etat'];
  return toCsv(headers, world.clubs.map((c) => [c.id, c.name, c.shortName, c.city, c.nickname, c.profile, c.colors.primary, c.colors.secondary, c.arena.name, c.arena.capacity, c.finances.budget]));
}
