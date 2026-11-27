import { ensureStaff } from './generator.ts';
import { WorldSchema, SCHEMA_VERSION, type World } from '@ehm/schema';
import { defaultRules, seedChemistry, seedFamiliarity, seedDevRef, Rng } from '@ehm/core';

/** Ältere Spielstände auf das aktuelle Format heben. */
export function migrateWorld(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const w = { ...(raw as Record<string, unknown>) };
  if (w.schemaVersion === 1) {
    w.schemaVersion = 2;
    w.competition = null;
  }
  if (w.schemaVersion === 2) {
    w.schemaVersion = 3;
    w.competition = null; // Saison wird mit Terminen neu angelegt
    w.scouting = {};
    if (Array.isArray(w.clubs)) w.clubs = ((w.clubs as Record<string, unknown>[])).map((c) => ({
      ...c,
      seasonGoal: null,
      finances: { ticketPrice: 20, sponsorIncome: 0, mediaIncome: 0, salaryBudget: 0, ledger: [], attendance: [], ...(c.finances as object) },
    }));
  }
  if (w.schemaVersion === 3) {
    // Vertragsfelder und Markt werden über Standardwerte des Schemas ergänzt
    w.schemaVersion = 4;
  }
  if (w.schemaVersion === 4) {
    // Special Teams und Matchups über Standardwerte; Coaching-Regeln mit Standardvorlagen vorbelegen
    w.schemaVersion = 5;
    if (Array.isArray(w.clubs)) {
      w.clubs = (w.clubs as Record<string, unknown>[]).map((c) => {
        const mp = c.matchplan as Record<string, unknown> | null;
        return mp && !mp.rules ? { ...c, matchplan: { ...mp, rules: defaultRules() } } : c;
      });
    }
  }
  if (w.schemaVersion === 5) {
    // Kapitän über Standardwert; Chemie wird nach dem Parsen gesät
    w.schemaVersion = 6;
  }
  if (w.schemaVersion === 6) {
    // Taktik-Eingespieltheit und Sommerpause über Standardwerte; Startwerte werden nach dem Parsen gesetzt
    w.schemaVersion = 7;
  }
  if (w.schemaVersion === 7) {
    // Entwicklungsverlauf und Nachwuchs-Kennzeichen über Standardwerte
    w.schemaVersion = 8;
  }
  if (w.schemaVersion === 8) {
    // Tag der Leistungstests: optionales Feld in der Sommerpause
    w.schemaVersion = 9;
  }
  if (w.schemaVersion === 9) {
    // Phasenberichte der Sommerpause über Standardwert
    w.schemaVersion = 10;
  }
  if (w.schemaVersion === 10) {
    // Training je Verein über Standardwert (Co-Trainer plant)
    w.schemaVersion = 11;
  }
  if (w.schemaVersion === 11) {
    // Saisonarchiv und Spielerkarriere über Standardwerte
    w.schemaVersion = 12;
  }
  if (w.schemaVersion === 12) {
    // Verletzungen und medizinische Abteilung: Standardwerte; Staff wird beim Laden ergänzt (ensureChemistry)
    w.schemaVersion = 13;
  }
  if (w.schemaVersion === 13) {
    // Events: Fanstimmung, Sponsorenzufriedenheit und Termine über Standardwerte
    w.schemaVersion = 14;
  }
  void SCHEMA_VERSION;
  return w;
}

/** Alte Spielstände: Reihen bekommen eine Anfangschemie (vor v6), Vereine eine Taktik-Eingespieltheit (vor v7) */
export function ensureChemistry(world: World): World {
  // medizinische Abteilung und Staff-Markt (ab v13)
  let w = ensureStaff(seedDevRef(seedFamiliarity(world)));
  if (Object.keys(w.chemistry).length > 0) return w;
  const rng = new Rng(w.seed + 606);
  w = seedChemistry(w, () => rng.next());
  return w;
}

/** Welt als JSON exportieren (Grundlage für Datenpakete und Spielstände). */
export function exportWorldJson(world: World): string {
  return JSON.stringify(world, null, 2);
}

export type ImportResult =
  | { ok: true; world: World }
  | { ok: false; errors: string[] };

/** Welt aus JSON importieren und gegen das Schema prüfen. */
export function importWorldJson(json: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`Ungültiges JSON: ${(e as Error).message}`] };
  }
  const parsed = WorldSchema.safeParse(migrateWorld(raw));
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 50).map((i) => `${i.path.join('.') || '(Wurzel)'}: ${i.message}`),
    };
  }
  const world = ensureChemistry(parsed.data);
  const errors = checkReferences(world);
  return errors.length ? { ok: false, errors } : { ok: true, world };
}

/** Querverweise prüfen (Vereine, Ligen, Verträge, Aufstellungen). */
export function checkReferences(world: World): string[] {
  const errors: string[] = [];
  const leagueIds = new Set(world.leagues.map((l) => l.id));
  const countryIds = new Set(world.countries.map((c) => c.id));
  const clubIds = new Set(world.clubs.map((c) => c.id));
  const playerIds = new Set<string>();
  for (const p of world.players) {
    if (playerIds.has(p.id)) errors.push(`Spieler-ID doppelt: ${p.id}`);
    playerIds.add(p.id);
    if (p.contract && !clubIds.has(p.contract.clubId)) errors.push(`Spieler ${p.id}: unbekannter Verein ${p.contract.clubId}`);
    if (p.position === 'G' && !p.goalie) errors.push(`Torhüter ${p.id} ohne Torhüterwerte`);
  }
  for (const l of world.leagues) if (!countryIds.has(l.countryId)) errors.push(`Liga ${l.id}: unbekanntes Land ${l.countryId}`);
  for (const c of world.clubs) {
    if (!leagueIds.has(c.leagueId)) errors.push(`Verein ${c.id}: unbekannte Liga ${c.leagueId}`);
    if (c.matchplan) {
      const ids = [...c.matchplan.forwardLines.flat(), ...c.matchplan.defensePairs.flat(), ...c.matchplan.goalies];
      for (const id of ids) if (!playerIds.has(id)) errors.push(`Verein ${c.id}: Aufstellung enthält unbekannten Spieler ${id}`);
    }
  }
  return errors;
}
