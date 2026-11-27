import type { World, Player, PhaseReport, TestDay } from '@ehm/schema';
import { overall, ageOn } from './ratings.ts';
import { payrollOf, GOAL_LABEL } from './economy.ts';
import { teamStrength, isImport } from './lineup.ts';
import { unitChemistry } from './chemistry.ts';
import { teamFamiliarity } from './familiarity.ts';

/**
 * Kurzberichte zu den Phasen der Sommerpause für den Verein des Managers.
 * Jede Funktion bekommt die Welt vor und nach der Phase und liefert eine Überschrift,
 * bewertete Zeilen und kurze Hinweise. Die Saisonbilanz des Vorstands steht in board.ts.
 */

type Tone = PhaseReport['tone'];
type Line = PhaseReport['lines'][number];

const d1 = (v: number) => (v / 10).toFixed(1).replace('.', ',');
/** Spieler werden als IDs abgelegt, die Anzeige rendert sie anklickbar */
const ids = (ps: Player[]) => ps.map((p) => p.id);
const euroK = (v: number) => `${Math.round(v / 1000).toLocaleString('de-DE')} T€`;

const club = (w: World, id: string) => w.clubs.find((c) => c.id === id)!;
const nextSeasonRoster = (w: World, clubId: string) =>
  w.players.filter((p) => (p.nextContract ? p.nextContract.clubId === clubId : p.contract?.clubId === clubId && p.contract.untilSeason > w.season));

/** Vertragsgespräche: Stand der eigenen auslaufenden Verträge */
export function talksReport(w: World, clubId: string): PhaseReport {
  const own = w.players.filter((p) => p.contract?.clubId === clubId);
  const expiring = own.filter((p) => p.contract!.untilSeason <= w.season);
  const extended = expiring.filter((p) => p.nextContract?.clubId === clubId);
  const leaving = expiring.filter((p) => p.nextContract && p.nextContract.clubId !== clubId);
  const open = expiring.filter((p) => !p.nextContract).sort((a, b) => overall(b) - overall(a));
  const arriving = w.players.filter((p) => p.nextContract?.clubId === clubId && p.contract?.clubId !== clubId);
  const lines: Line[] = [
    { label: 'Verlängert', value: String(extended.length), tone: extended.length ? 'good' : 'neutral', players: ids(extended) },
    { label: 'Noch offen', value: String(open.length), tone: open.length > 4 ? 'bad' : open.length ? 'mixed' : 'good', players: ids(open) },
    { label: 'Gehen', value: String(leaving.length), tone: leaving.some((p) => overall(p) >= 120) ? 'bad' : leaving.length ? 'mixed' : 'neutral', players: ids(leaving) },
    { label: 'Neuzugänge fix', value: String(arriving.length), tone: arriving.length ? 'good' : 'neutral', players: ids(arriving) },
  ];
  const size = nextSeasonRoster(w, clubId).length;
  const tone: Tone = open.length > 6 || leaving.length > 4 ? 'bad' : open.length > 2 ? 'mixed' : 'good';
  return {
    headline: open.length ? `${open.length} Verträge sind noch offen – die Konkurrenz klopft an.` : 'Alle auslaufenden Verträge sind geklärt.',
    tone,
    lines,
    notes: [`Kader für die neue Saison bisher: ${size} Spieler.`, ...(open.length ? ['Offene Spieler können ab jetzt auch bei anderen Vereinen unterschreiben (Kader › Planer).'] : [])],
  };
}

/** Transfermarkt: eigene Zu- und Abgänge sowie die größten Wechsel der Liga */
export function transferReport(w: World, clubId: string): PhaseReport {
  const byId = new Map(w.clubs.map((c) => [c.id, c]));
  const arriving = w.players.filter((p) => p.nextContract?.clubId === clubId && p.contract?.clubId !== clubId).sort((a, b) => overall(b) - overall(a));
  const leaving = w.players.filter((p) => p.contract?.clubId === clubId && p.nextContract && p.nextContract.clubId !== clubId).sort((a, b) => overall(b) - overall(a));
  const open = w.players.filter((p) => p.contract?.clubId === clubId && !p.nextContract && p.contract.untilSeason <= w.season).sort((a, b) => overall(b) - overall(a));
  const moves = w.players
    .filter((p) => p.nextContract && p.nextContract.clubId !== clubId && p.nextContract.clubId !== p.contract?.clubId)
    .sort((a, b) => overall(b) - overall(a))
    .slice(0, 5);
  const best = (ps: Player[]) => ps.slice(0, 6).reduce((s, p) => s + overall(p), 0) / Math.max(1, Math.min(6, ps.length));
  const out = [...leaving, ...open].sort((a, b) => overall(b) - overall(a));
  const quality = arriving.length && out.length ? best(arriving) - best(out) : arriving.length ? 10 : out.length ? -10 : 0;
  const tone: Tone = quality >= 5 ? 'good' : quality <= -5 ? 'bad' : 'mixed';
  return {
    headline: tone === 'good' ? 'Der Kader hat sich auf dem Markt verstärkt.' : tone === 'bad' ? 'Bisher mehr Qualität verloren als dazugewonnen.' : 'Zu- und Abgänge halten sich die Waage.',
    tone,
    lines: [
      { label: 'Zugänge', value: String(arriving.length), tone: arriving.length ? 'good' : 'neutral', players: ids(arriving) },
      { label: 'Abgänge', value: String(leaving.length), tone: leaving.length ? 'mixed' : 'neutral', players: ids(leaving) },
      { label: 'Ohne Anschlussvertrag', value: String(open.length), tone: open.length > 3 ? 'bad' : open.length ? 'mixed' : 'good', players: ids(open) },
      { label: 'Bilanz', value: quality >= 5 ? 'Verstärkung' : quality <= -5 ? 'Aderlass' : 'ausgeglichen', tone, note: 'Vergleich der besten Zugänge mit den Abgängen und offenen Verträgen' },
      ...(moves.length ? [{ label: 'Größte Wechsel der Liga', value: '', tone: 'neutral' as const, players: ids(moves), tags: moves.map((p) => `${p.contract ? `${byId.get(p.contract.clubId)?.shortName} ` : ''}→ ${byId.get(p.nextContract!.clubId)?.shortName}`) }] : []),
    ],
    notes: moves.length ? [] : ['Auf dem Markt der Liga war es bisher ruhig.'],
  };
}

/** Sommertraining: Zusammenfassung des Tags der Leistungstests und des Nachwuchsjahrgangs */
export function summerReport(w: World, clubId: string, td: TestDay | undefined): PhaseReport {
  const byId = new Map(w.players.map((p) => [p.id, p]));
  const lines: Line[] = [];
  let tone: Tone = 'neutral';
  let headline = 'Das Sommertraining ist abgeschlossen.';
  if (td && td.lines.length) {
    const top = (key: 'before' | 'after') => { const v = td.lines.map((l) => l[key]).sort((a, b) => b - a).slice(0, 20); return v.reduce((a, b) => a + b, 0) / v.length; };
    const diff = top('after') - top('before');
    const best = [...td.lines].sort((a, b) => b.after - b.before - (a.after - a.before))[0];
    const worst = [...td.lines].sort((a, b) => a.after - a.before - (b.after - b.before))[0];
    tone = diff >= 1 ? 'good' : diff <= -1 ? 'bad' : 'mixed';
    headline = diff >= 1 ? 'Der Kader kommt stärker aus dem Sommer.' : diff <= -1 ? 'Der Kader hat im Sommer an Substanz verloren.' : 'Der Kader hält sein Niveau.';
    lines.push({ label: 'Kaderstärke (beste 20)', value: `${d1(top('before'))} → ${d1(top('after'))}`, tone });
    const bp = byId.get(best.playerId), wp = byId.get(worst.playerId);
    if (bp && best.after > best.before) lines.push({ label: 'Gewinner', value: `+${d1(best.after - best.before)}`, tone: 'good', note: best.jump ? 'Entwicklungssprung' : undefined, players: [bp.id] });
    if (wp && worst.after < worst.before) lines.push({ label: 'Verlierer', value: `−${d1(worst.before - worst.after)}`, tone: 'bad', players: [wp.id] });
  }
  const youth = w.players.filter((p) => p.youthClub === clubId && !p.contract);
  if (youth.length) lines.push({ label: 'Nachwuchsjahrgang', value: `${youth.length} Talente`, tone: 'neutral', note: 'Entscheidung bis zum Saisonwechsel (Kader › Nachwuchs)' });
  return { headline, tone, lines, notes: td && !td.seen ? ['Die Einzelergebnisse gibt es beim Tag der Leistungstests.'] : [] };
}

/** Saisonwechsel: Karriereenden, Kaderlage, Finanzen und Ziel der neuen Saison */
export function kickoffReport(prev: World, w: World, clubId: string): PhaseReport {
  const rules = w.countries[0].rules;
  const c = club(w, clubId);
  const roster = w.players.filter((p) => p.contract?.clubId === clubId);
  const now = new Set(w.players.map((p) => p.id));
  const mine = new Set(roster.map((p) => p.id));
  const prevRoster = prev.players.filter((p) => p.contract?.clubId === clubId && !(p.nextContract && p.nextContract.clubId !== clubId));
  const retired = prevRoster.filter((p) => !now.has(p.id) && ageOn(p.birthDate, prev.date) >= 30);
  const unsigned = prevRoster.filter((p) => !mine.has(p.id) && !retired.includes(p));
  const imports = roster.filter((p) => isImport(p, 'DE')).length;
  const pay = payrollOf(w, clubId);
  const ratio = (pay.players + pay.perks + pay.staff) / Math.max(1, c.finances.salaryBudget);
  const byId = new Map(w.players.map((p) => [p.id, p]));
  const league = w.clubs.filter((x) => x.leagueId === c.leagueId && x.matchplan);
  const rank = [...league].sort((a, b) => teamStrength(b.matchplan!, byId) - teamStrength(a.matchplan!, byId)).findIndex((x) => x.id === clubId) + 1;
  const sizeTone: Tone = roster.length < 22 ? 'bad' : roster.length > rules.maxRoster - 1 ? 'mixed' : 'good';
  const lines: Line[] = [
    { label: 'Kader', value: `${roster.length} / ${rules.maxRoster}`, tone: sizeTone, note: roster.length < 22 ? 'dünn besetzt – Ausfälle sind kaum aufzufangen' : undefined },
    { label: 'Ausländerlizenzen', value: `${imports} / ${rules.importSlotsRoster}`, tone: imports > rules.importSlotsRoster ? 'bad' : 'neutral' },
    { label: 'Gehälter', value: `${Math.round(ratio * 100)} %`, tone: ratio > 1.02 ? 'bad' : ratio > 0.95 ? 'mixed' : 'good', note: `${euroK(pay.players + pay.perks + pay.staff)} von ${euroK(c.finances.salaryBudget)} Rahmen` },
    { label: 'Kaderstärke', value: `Rang ${rank} von ${league.length}`, tone: rank <= 4 ? 'good' : rank <= 10 ? 'mixed' : 'bad' },
    { label: 'Saisonziel', value: c.seasonGoal ? GOAL_LABEL[c.seasonGoal] : '–', tone: 'neutral', note: 'vom Vorstand nach der Kaderstärke festgelegt' },
  ];
  const notes: string[] = [];
  if (retired.length) lines.push({ label: 'Karriereende', value: String(retired.length), tone: 'neutral', players: ids(retired) });
  if (unsigned.length) lines.push({ label: 'Ohne neuen Vertrag', value: String(unsigned.length), tone: 'neutral', players: ids(unsigned) });
  if (ratio > 1.02) notes.push('Der Gehaltsrahmen ist überschritten – das kostet jeden Monat Vertrauen beim Vorstand.');
  return {
    headline: `Neue Saison, neues Ziel: ${c.seasonGoal ? GOAL_LABEL[c.seasonGoal] : '–'}.`,
    tone: sizeTone === 'bad' || ratio > 1.02 ? 'mixed' : 'good',
    lines,
    notes,
  };
}

/** Durchschnittliche Chemie der Reihen und Taktik-Eingespieltheit */
function teamCohesion(w: World, clubId: string): { chem: number; fam: number } {
  const c = club(w, clubId);
  const plan = c.matchplan;
  if (!plan) return { chem: 50, fam: 50 };
  const byId = new Map(w.players.map((p) => [p.id, p]));
  const units = [...plan.forwardLines, ...plan.defensePairs];
  const chem = units.reduce((s, u) => s + unitChemistry(w, u, byId), 0) / units.length;
  return { chem, fam: teamFamiliarity(c.familiarity, plan.tactics, plan) };
}

/** Trainingslager und Vorbereitung: was sich bei Chemie und Eingespieltheit getan hat */
export function trainingReport(prev: World, w: World, clubId: string, preseason: boolean): PhaseReport {
  const a = teamCohesion(prev, clubId), b = teamCohesion(w, clubId);
  const lines: Line[] = [
    { label: 'Reihen-Chemie', value: `${Math.round(a.chem)} → ${Math.round(b.chem)}`, tone: b.chem - a.chem >= 2 ? 'good' : 'neutral', note: 'Durchschnitt aller Reihen und Verteidigerpaare' },
    { label: 'Taktik-Eingespieltheit', value: `${Math.round(a.fam)} → ${Math.round(b.fam)}`, tone: b.fam - a.fam >= 2 ? 'good' : 'neutral' },
  ];
  const notes: string[] = [];
  if (preseason) {
    // Saisonprognose: Experten-Tipp nach Kaderstärke
    const byId = new Map(w.players.map((p) => [p.id, p]));
    const c = club(w, clubId);
    const league = w.clubs.filter((x) => x.leagueId === c.leagueId && x.matchplan);
    const ranked = [...league].sort((x, y) => teamStrength(y.matchplan!, byId) - teamStrength(x.matchplan!, byId));
    const rank = ranked.findIndex((x) => x.id === clubId) + 1;
    lines.push({ label: 'Experten-Tipp', value: `Platz ${rank}`, tone: rank <= 4 ? 'good' : rank <= 10 ? 'mixed' : 'bad', note: `Favoriten: ${ranked.slice(0, 3).map((x) => x.shortName).join(', ')} · Kaderstärke ${d1(teamStrength(c.matchplan!, byId))}` });
    notes.push(c.seasonGoal ? `Ziel des Vorstands: ${GOAL_LABEL[c.seasonGoal]}.` : '');
  } else notes.push('Reihen, die jetzt zusammen trainieren, sind zum Saisonstart besser eingespielt.');
  return {
    headline: preseason ? 'Die Vorbereitung ist abgeschlossen – die Saison kann kommen.' : 'Intensive Tage im Trainingslager.',
    tone: b.chem - a.chem >= 2 || b.fam - a.fam >= 2 ? 'good' : 'neutral',
    lines,
    notes: notes.filter(Boolean),
  };
}
