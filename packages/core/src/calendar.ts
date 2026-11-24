/** Datumshilfen (ISO yyyy-mm-dd, ohne Zeitzonen-Effekte). */

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const monthKey = (iso: string) => iso.slice(0, 7);

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Alle Monate von `from` (inkl.) bis `to` (exkl.) */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m < to; m = nextMonth(m)) out.push(m);
  return out;
}

/** Erster Wochentag `weekday` (0 = Sonntag … 5 = Freitag) am oder nach `iso` */
export function onOrAfter(iso: string, weekday: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const diff = (weekday - d.getUTCDay() + 7) % 7;
  return addDays(iso, diff);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function formatDate(iso: string, withWeekday = false): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const s = `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withWeekday ? `${WEEKDAYS[d.getUTCDay()]}, ${s}` : s;
}

export function formatMonth(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[m - 1];
  return short ? `${name.slice(0, 3)} ${String(y).slice(2)}` : `${name} ${y}`;
}

/** Deterministischer Zufallswert 0..1 aus einem Text (z. B. Spiel-ID) */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
