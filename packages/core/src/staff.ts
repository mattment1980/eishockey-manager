import type { World, Staff, StaffRole, News } from '@ehm/schema';
import { makeContract } from '@ehm/schema';
import { toDisplay } from './ratings.ts';
import { bookExpense } from './economy.ts';

/**
 * Staff-Markt: vereinslose Trainer, Scouts und die medizinische Abteilung einstellen und entlassen.
 * Gehälter laufen über das Monatsbuch („Gehälter Staff“); bei einer Entlassung wird die Hälfte
 * des Restvertrags als Abfindung fällig.
 */

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  headCoach: 'Cheftrainer', assistantCoach: 'Co-Trainer', goalieCoach: 'Torwarttrainer', scout: 'Scout',
  youthCoach: 'Nachwuchstrainer', manager: 'Geschäftsführer', doctor: 'Mannschaftsarzt', physio: 'Physiotherapeut', athleticsCoach: 'Athletiktrainer',
};

/** Höchstzahl je Rolle in einem Verein */
export const ROLE_LIMIT: Record<StaffRole, number> = {
  headCoach: 1, assistantCoach: 2, goalieCoach: 1, youthCoach: 1, scout: 3, manager: 1, doctor: 1, physio: 1, athleticsCoach: 1,
};

/** Wichtigster Wert einer Rolle (für Markt und Gehalt) */
export const ROLE_MAIN: Record<StaffRole, keyof Staff['ratings']> = {
  headCoach: 'tactics', assistantCoach: 'tactics', goalieCoach: 'development', youthCoach: 'development', scout: 'scouting',
  manager: 'business', doctor: 'medical', physio: 'medical', athleticsCoach: 'medical',
};

const BASE_SALARY: Record<StaffRole, number> = {
  headCoach: 110_000, assistantCoach: 60_000, goalieCoach: 45_000, youthCoach: 40_000, scout: 50_000, manager: 90_000,
  doctor: 55_000, physio: 40_000, athleticsCoach: 45_000,
};

/** Jahresgehalt nach Rolle und Qualität (intern 1–200) */
export function staffSalary(role: StaffRole, q: number): number {
  return Math.round((BASE_SALARY[role] * Math.pow(Math.max(40, q) / 100, 1.3)) / 1000) * 1000;
}

/** Gehaltsforderung eines vereinslosen Staff-Mitglieds */
export const askingSalary = (s: Staff) => staffSalary(s.role, s.ratings[ROLE_MAIN[s.role]]);

/** Wert (1–20) des besten Mitglieds einer Rolle im Verein; 0 = Stelle unbesetzt */
export function staffLevel(world: World, clubId: string, role: StaffRole): number {
  let best = 0;
  for (const s of world.staff) if (s.contract?.clubId === clubId && s.role === role) best = Math.max(best, toDisplay(s.ratings[ROLE_MAIN[role]]));
  return best;
}

const news = (world: World, text: string): News[] => [{ date: world.date, kind: 'info' as const, text, mine: true }, ...world.market.news].slice(0, 120);

/** Einstellen: Vertrag über `seasons` Saisons zur Gehaltsforderung */
export function hireStaff(world: World, clubId: string, staffId: string, seasons = 2): { world: World; error?: string } {
  const s = world.staff.find((x) => x.id === staffId);
  if (!s || s.contract) return { world, error: 'nicht mehr verfügbar' };
  const count = world.staff.filter((x) => x.contract?.clubId === clubId && x.role === s.role).length;
  if (count >= ROLE_LIMIT[s.role]) return { world, error: `höchstens ${ROLE_LIMIT[s.role]} ${STAFF_ROLE_LABEL[s.role]} – erst jemanden entlassen` };
  const contract = makeContract({ clubId, salary: askingSalary(s), untilSeason: world.season + seasons - 1, role: 'regular' });
  return {
    world: {
      ...world,
      staff: world.staff.map((x) => (x.id === staffId ? { ...x, contract } : x)),
      market: { ...world.market, news: news(world, `${STAFF_ROLE_LABEL[s.role]} ${s.firstName} ${s.lastName} unterschreibt bis ${world.season + seasons}.`) },
    },
  };
}

/** Abfindung bei Entlassung: halbes Restgehalt bis Vertragsende (mindestens ein halbes Jahresgehalt × 0,5) */
export function severance(world: World, s: Staff): number {
  if (!s.contract) return 0;
  const years = Math.max(0.5, s.contract.untilSeason - world.season + 0.5);
  return Math.round((s.contract.salary * years * 0.5) / 1000) * 1000;
}

/** Entlassen: Abfindung wird gebucht, die Person steht wieder auf dem Markt */
export function releaseStaff(world: World, staffId: string): World {
  const s = world.staff.find((x) => x.id === staffId);
  if (!s?.contract) return world;
  const cost = severance(world, s);
  const w = bookExpense(world, s.contract.clubId, 'staff', cost);
  return {
    ...w,
    staff: w.staff.map((x) => (x.id === staffId ? { ...x, contract: null } : x)),
    market: { ...w.market, news: news(w, `${STAFF_ROLE_LABEL[s.role]} ${s.firstName} ${s.lastName} entlassen – Abfindung ${cost.toLocaleString('de-DE')} €.`) },
  };
}

/** Staff-Verträge laufen beim Saisonwechsel automatisch ein Jahr weiter (Vertragsverhandlungen mit Staff folgen später) */
export function extendStaffContracts(world: World, nextSeason: number): World {
  return { ...world, staff: world.staff.map((s) => (s.contract && s.contract.untilSeason < nextSeason ? { ...s, contract: { ...s.contract, untilSeason: nextSeason } } : s)) };
}
