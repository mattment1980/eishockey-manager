import type { World, Club, PhaseReport } from '@ehm/schema';
import { payrollOf, baseFill, GOAL_LABEL } from './economy.ts';
import { teamStrength } from './lineup.ts';
import { ovrChange } from './development.ts';
import { ageOn } from './ratings.ts';

/**
 * Saisonbilanz des Vorstands (Sommerpause, Phase „Saisonbilanz“).
 * Bewertet Sport, Finanzen, Kaderplanung, Entwicklung junger Spieler und Zuschauer
 * mit je −2 … +2 und verändert daraus das Vertrauen in den Manager.
 */

type Tone = PhaseReport['tone'];
export type Grade = -2 | -1 | 0 | 1 | 2;

const GRADE_TEXT: Record<Grade, string> = { 2: 'sehr gut', 1: 'gut', 0: 'okay', [-1]: 'schwach', [-2]: 'mangelhaft' };
const toneOf = (g: number): Tone => (g >= 1 ? 'good' : g <= -1 ? 'bad' : 'mixed');
const clampG = (x: number): Grade => Math.max(-2, Math.min(2, Math.round(x))) as Grade;

/** Gewichte der Kategorien für die Veränderung des Vertrauens (Punkte je Notenstufe) */
export const BOARD_WEIGHTS = { sport: 7, finance: 4, squad: 2, youth: 1, fans: 1 } as const;

const GOAL_LEVEL: Record<NonNullable<Club['seasonGoal']>, number> = { title: 4, semifinal: 3, quarterfinal: 2, prePlayoffs: 1, survival: 0 };

export interface SeasonReview {
  clubId: string;
  grades: { sport: Grade; finance: Grade; squad: Grade; youth: Grade | null; fans: Grade };
  confidenceBefore: number;
  confidenceAfter: number;
  report: PhaseReport;
}

/** Erreichte Stufe: 5 Meister, 4 Finale, 3 Halbfinale, 2 Viertelfinale, 1 Pre-Playoffs/Platz ≤ 10, 0 gesichert, −1 Abstieg */
function achieved(world: World, clubId: string): { level: number; text: string } {
  const comp = world.competition!;
  const inRound = (r: string) => comp.series.some((s) => s.roundName === r && (s.high === clubId || s.low === clubId));
  const place = (comp.finalStandings?.indexOf(clubId) ?? 99) + 1;
  if (comp.champion === clubId) return { level: 5, text: 'Meister' };
  if (inRound('Finale')) return { level: 4, text: 'Finale erreicht' };
  if (inRound('Halbfinale')) return { level: 3, text: 'Halbfinale erreicht' };
  if (inRound('Viertelfinale')) return { level: 2, text: 'Viertelfinale erreicht' };
  if (comp.relegated === clubId) return { level: -1, text: 'abgestiegen' };
  if (place <= 10) return { level: 1, text: `Platz ${place}, Pre-Playoffs` };
  return { level: 0, text: `Platz ${place}, Klassenerhalt` };
}

const euroK = (v: number) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) / 1000).toLocaleString('de-DE')} T€`;

export function seasonReview(world: World, clubId: string): SeasonReview {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const comp = world.competition!;
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const lines: PhaseReport['lines'] = [];

  // Sport: erreichte Stufe gegen Saisonziel
  const a = achieved(world, clubId);
  const goal = club.seasonGoal ?? 'survival';
  const diff = a.level - GOAL_LEVEL[goal] + (a.level === 5 ? 1 : 0);
  const sport = clampG(diff >= 2 ? 2 : diff === 1 ? 1 : diff === 0 ? 0 : diff >= -2 ? -1 : -2);
  lines.push({ label: 'Sportlich', value: GRADE_TEXT[sport], tone: toneOf(sport), note: `Ziel: ${GOAL_LABEL[goal]} – ${a.text}` });

  // Finanzen: Saisonergebnis im Verhältnis zum Etat, Gehaltsrahmen
  const result = club.finances.ledger.reduce((s, m) => s + Object.values(m.items).reduce((x, y) => x + y, 0), 0);
  const r = result / Math.max(1, club.finances.budget);
  const pay = payrollOf(world, clubId);
  const payRatio = (pay.players + pay.perks + pay.staff) / Math.max(1, club.finances.salaryBudget);
  const finance = clampG((r >= 0.03 ? 2 : r >= 0 ? 1 : r >= -0.03 ? 0 : r >= -0.08 ? -1 : -2) - (payRatio > 1.05 ? 1 : 0));
  lines.push({ label: 'Finanzen', value: GRADE_TEXT[finance], tone: toneOf(finance), note: `Saisonergebnis ${euroK(result)}, Gehälter ${Math.round(payRatio * 100)} % des Rahmens` });

  // Kaderplanung: Stärke im Vergleich zu den Gehaltskosten (Rang gegen Rang)
  const league = world.clubs.filter((c) => c.leagueId === club.leagueId && c.matchplan);
  const strengthRank = [...league].sort((x, y) => teamStrength(y.matchplan!, byId) - teamStrength(x.matchplan!, byId)).findIndex((c) => c.id === clubId) + 1;
  const payRank = [...league].sort((x, y) => { const px = payrollOf(world, x.id), py = payrollOf(world, y.id); return py.players + py.perks - px.players - px.perks; }).findIndex((c) => c.id === clubId) + 1;
  const eff = payRank - strengthRank;
  const squad = clampG(eff >= 3 ? 2 : eff >= 1 ? 1 : eff >= -1 ? 0 : eff >= -3 ? -1 : -2);
  lines.push({ label: 'Kaderplanung', value: GRADE_TEXT[squad], tone: toneOf(squad), note: `Kaderstärke Rang ${strengthRank}, Gehaltskosten Rang ${payRank} von ${league.length}` });

  // Junge Spieler: Entwicklung der bis 23-Jährigen seit Saisonbeginn
  const young = world.players.filter((p) => p.contract?.clubId === clubId && ageOn(p.birthDate, world.date) <= 23);
  const changes = young.map((p) => ovrChange(p)).filter((x): x is number => x !== undefined);
  let youth: Grade | null = null;
  if (changes.length >= 2) {
    const avg = changes.reduce((s, x) => s + x, 0) / changes.length / 10;
    youth = clampG(avg >= 0.4 ? 2 : avg >= 0.2 ? 1 : avg >= 0.05 ? 0 : -1);
    lines.push({ label: 'Junge Spieler', value: GRADE_TEXT[youth], tone: toneOf(youth), note: `${changes.length} Spieler bis 23 Jahre, im Schnitt ${avg >= 0 ? '+' : ''}${avg.toFixed(2).replace('.', ',')} seit Saisonbeginn` });
  }

  // Zuschauer: Auslastung gegenüber der Erwartung
  const att = club.finances.attendance;
  const fill = att.length ? att.reduce((s, x) => s + x, 0) / att.length / club.arena.capacity : baseFill(club);
  const fd = fill - Math.min(1, baseFill(club));
  const fans = clampG(fd >= 0.06 ? 2 : fd >= 0.02 ? 1 : fd >= -0.03 ? 0 : fd >= -0.08 ? -1 : -2);
  lines.push({ label: 'Zuschauer', value: GRADE_TEXT[fans], tone: toneOf(fans), note: `Auslastung ${Math.round(fill * 100)} % (Ø ${Math.round(fill * club.arena.capacity).toLocaleString('de-DE')})` });

  const delta = Math.max(-25, Math.min(25,
    sport * BOARD_WEIGHTS.sport + finance * BOARD_WEIGHTS.finance + squad * BOARD_WEIGHTS.squad + (youth ?? 0) * BOARD_WEIGHTS.youth + fans * BOARD_WEIGHTS.fans));
  const before = club.boardConfidence;
  const after = Math.max(0, Math.min(100, Math.round(before + delta)));

  // Gesamturteil in einem Satz
  const headline =
    sport >= 1 && finance >= 1 ? 'Eine rundum gelungene Saison.'
    : sport >= 1 && finance <= -1 ? 'Sportlich stark – aber finanziell zu teuer erkauft.'
    : sport <= -1 && finance >= 1 ? 'Finanziell solide, sportlich enttäuschend.'
    : sport <= -1 && finance <= -1 ? 'Eine Saison zum Vergessen – sportlich wie finanziell.'
    : sport >= 1 ? 'Sportlich mehr erreicht als erwartet.'
    : sport <= -1 ? 'Sportlich hinter den Erwartungen geblieben.'
    : finance >= 1 ? 'Pflicht erfüllt, Kasse stimmt.'
    : finance <= -1 ? 'Sportlich im Soll, aber die Zahlen bereiten Sorgen.'
    : 'Eine Saison im Rahmen der Erwartungen.';
  const position =
    after >= 80 ? 'Ihre Position ist unangefochten – der Vorstand spricht von einer langfristigen Zusammenarbeit.'
    : after >= 60 ? 'Der Vorstand stärkt Ihnen den Rücken.'
    : after >= 40 ? 'Der Vorstand wird die nächste Saison genau beobachten.'
    : after >= 20 ? 'Sie sind angezählt: Ohne klare Verbesserung wird es eng.'
    : 'Der Vorstand denkt laut über Konsequenzen nach.';
  const notes = [
    `Vertrauen des Vorstands: ${before} % → ${after} % (${delta >= 0 ? '+' : ''}${Math.round(delta)}).`,
    position,
  ];
  if (payRatio > 1.05) notes.push('Der Gehaltsrahmen wurde überzogen – der Vorstand erwartet in der neuen Saison mehr Disziplin.');
  const tone: Tone = delta >= 6 ? 'good' : delta <= -6 ? 'bad' : 'mixed';
  return {
    clubId,
    grades: { sport, finance, squad, youth, fans },
    confidenceBefore: before,
    confidenceAfter: after,
    report: { headline, tone, lines, notes },
  };
}

/** Saisonbilanz für alle Vereine anwenden; gibt die Bewertungen zurück */
export function applySeasonReviews(world: World): { world: World; reviews: Map<string, SeasonReview> } {
  const inComp = new Set(world.competition?.finalStandings ?? []);
  const reviews = new Map(world.clubs.filter((c) => inComp.has(c.id)).map((c) => [c.id, seasonReview(world, c.id)]));
  return { world: { ...world, clubs: world.clubs.map((c) => (reviews.has(c.id) ? { ...c, boardConfidence: reviews.get(c.id)!.confidenceAfter } : c)) }, reviews };
}
