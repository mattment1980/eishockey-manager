import type { World, Club, Fixture, HomeGameReport, StandValues } from '@ehm/schema';
import type { EventCtx, Outcome, Effect } from './events.ts';

/**
 * Katalog der Spieltagsaktionen (Meilenstein 12a). Eine Aktion gehört zu genau einem Heimspiel
 * und kostet keine Trainingseinheit. Neue Aktion = neuer Eintrag in ACTIONS.
 *
 * Vor dem Spiel wirken `demand` (Zusatznachfrage je Bereich), `priceFactor` (Preisnachlass),
 * `freeFill` (Freikarten, Anteil der Halle), `spend` (Catering je Kopf) und `atmosphere` (Stimmung in der Halle).
 * Nach dem Spiel liefert `after` Text und Wirkungen (wie bei den Events, siehe `Effect`).
 * Wiederholungen in den letzten 4 Heimspielen schwächen die Wirkung ab (Faktor k).
 */

export interface ActionCtx { world: World; club: Club; fixture: Fixture }

export interface ActionDef {
  id: string;
  label: string;
  pros: string;
  cons: string;
  /** Kosten in € (werden als Spieltagskosten gebucht) */
  cost?: number;
  /** Pause in Heimspielen */
  cooldown?: number;
  /** zählt als Pflichttermin für einen Sponsor */
  sponsorTermin?: boolean;
  /** zählt für die Fanbasis als Familien-/Nachwuchsaktion */
  family?: boolean;
  /** wirkt am Wochenende nur halb (Studenten/Azubis) */
  weekdayOnly?: boolean;
  demand?: Partial<StandValues>;
  priceFactor?: Partial<StandValues>;
  freeFill?: number;
  spend?: number;
  atmosphere?: number;
  blocked?: (ctx: ActionCtx) => string | null;
  after: (ctx: EventCtx & { report: HomeGameReport; k: number; won: boolean | null }) => Outcome;
}

const out = (text: string, tone: Outcome['tone'], effects: Effect[]): Outcome => ({ text, tone, effects });
const fmt = (n: number) => n.toLocaleString('de-DE');
const regularOnly = ({ fixture }: ActionCtx) => (fixture.stage === 'regular' ? null : 'nur in der Hauptrunde');

export const ACTIONS: ActionDef[] = [
  {
    id: 'familientag', label: 'Familientag', family: true,
    pros: 'Familienpreise füllen Steh- und Sitzplätze, neue Fans, gute Stimmung', cons: 'Steh- und Sitzplätze 30 % günstiger',
    demand: { standing: 0.16, seated: 0.22 }, priceFactor: { standing: 0.7, seated: 0.7 }, spend: 1.05, atmosphere: 2,
    blocked: regularOnly,
    after: ({ report, k }) => out(`Familienpreise locken ${fmt(report.attendance.standing + report.attendance.seated)} Fans auf Steh- und Sitzplätze – viele neue Gesichter.`, 'good', [
      { kind: 'fans', amount: 3 * k }, { kind: 'fanBase', amount: 0.3 * k },
    ]),
  },
  {
    id: 'kindertag', label: 'Kindertag (Schulklassen in der Halle)', cost: 8000, family: true,
    pros: 'Fanbasis wächst langfristig, Vorstand und Mannschaft freuen sich', cons: 'kostet; Kinder kommen zum Teil mit Freikarte',
    demand: { standing: 0.05, seated: 0.06 }, freeFill: 0.05, spend: 1.1, atmosphere: 1,
    blocked: regularOnly,
    after: ({ k }) => out('Hunderte Kinder in der Halle – manche davon stehen in zehn Jahren in der Fankurve.', 'good', [
      { kind: 'fans', amount: 2 * k }, { kind: 'fanBase', amount: 0.8 * k }, { kind: 'board', amount: 1 * k }, { kind: 'morale', target: 'team', amount: 1 },
    ]),
  },
  {
    id: 'sponsorenabend', label: 'Business-Spieltag / Sponsorenabend', sponsorTermin: true,
    pros: 'Business-Bereich voll, Geld und Sponsorenzufriedenheit; zählt als Pflichttermin', cons: 'Pflichttermin für die Spieler; etwas ruhigere Halle',
    demand: { business: 0.35 }, spend: 1.05, atmosphere: -3,
    after: ({ k, report }) => out(`Logen voll (${fmt(report.attendance.business)} Gäste im Business-Bereich), Hände geschüttelt, Visitenkarten getauscht.`, 'good', [
      { kind: 'money', amount: Math.round(25000 * k), cat: 'sponsors' }, { kind: 'sponsors', amount: 6 * k },
      { kind: 'fitness', target: 'team', amount: -1 }, { kind: 'morale', target: 'team', amount: -1, traits: { diva: -1, egoist: 1.5, stillerArbeiter: 2 } },
    ]),
  },
  {
    id: 'fantag', label: 'Fan-Tag mit Choreo', cost: 5000, cooldown: 4,
    pros: 'Stimmung in der Halle deutlich lauter (Heimvorteil), Fans fühlen sich ernst genommen', cons: 'kostet; nutzt sich schnell ab',
    demand: { standing: 0.06 }, atmosphere: 14,
    after: ({ report, k }) => out(`Choreo über die ganze Kurve – die Halle bebt (Stimmung ${Math.round(report.atmosphere)}).`, 'good', [
      { kind: 'fans', amount: 4 * k }, { kind: 'morale', target: 'team', amount: 1, traits: { leader: 1.5, bigGame: 1.5 } },
    ]),
  },
  {
    id: 'studententag', label: 'Studenten- und Azubitag', weekdayOnly: true,
    pros: 'junge Zuschauer, Fanbasis wächst', cons: 'Rabatt auf Steh- und Sitzplätze; am Wochenende wenig Wirkung',
    demand: { standing: 0.1, seated: 0.05 }, priceFactor: { standing: 0.88, seated: 0.9 }, atmosphere: 3,
    blocked: regularOnly,
    after: ({ k }) => out('Viele junge Gesichter in der Kurve – laut und durstig.', 'good', [{ kind: 'fans', amount: 1 * k }, { kind: 'fanBase', amount: 0.3 * k }]),
  },
  {
    id: 'retrospiel', label: 'Retro-Spiel im Traditionstrikot', cost: 12000, cooldown: 12,
    pros: 'Fanshop-Verkauf, Nostalgie, volle Halle', cons: 'Vorlaufkosten; Flop bei schlechter Stimmung',
    demand: { standing: 0.08, seated: 0.08 }, atmosphere: 5,
    after: ({ club, roll, k, losingStreak }) => {
      const sale = Math.round((10000 + club.mood.fans * 500 + club.fanBase * 250) * (0.75 + roll('retro') * 0.5) * k);
      if (club.mood.fans < 35 || losingStreak >= 4) return out('Schickes Trikot, aber bei der Stimmung bleibt das Merchandising liegen.', 'bad', [{ kind: 'money', amount: Math.round(sale * 0.3), cat: 'merch' }, { kind: 'fans', amount: 1 }]);
      return out(`Das Retro-Trikot ist ein Renner – rund ${Math.round(sale / 1000)} T€ im Fanshop.`, 'good', [{ kind: 'money', amount: sale, cat: 'merch' }, { kind: 'fans', amount: 3 * k }]);
    },
  },
  {
    id: 'benefiz', label: 'Benefizspiel', cooldown: 10,
    pros: 'Image: Sponsoren, Vorstand und Fans freuen sich', cons: '20 % der Ticketeinnahmen gehen an den guten Zweck',
    demand: { standing: 0.05, seated: 0.05, business: 0.05 }, atmosphere: 2,
    after: ({ report, k }) => out(`${fmt(Math.round(report.tickets * 0.2))} € für den guten Zweck – große Geste, gute Presse.`, 'good', [
      { kind: 'money', amount: -Math.round(report.tickets * 0.2), cat: 'tickets' }, { kind: 'sponsors', amount: 5 * k }, { kind: 'board', amount: 2 * k }, { kind: 'fans', amount: 2 * k }, { kind: 'fanBase', amount: 0.2 * k },
    ]),
  },
  {
    id: 'legende', label: 'Ehrung einer Vereinslegende', cost: 6000, cooldown: 26,
    pros: 'Gänsehaut: Nachfrage, Stimmung, Mannschaft motiviert', cons: 'kostet; höchstens einmal pro Saison',
    demand: { standing: 0.1, seated: 0.1, business: 0.05 }, atmosphere: 8,
    after: () => out('Trikot unters Hallendach, stehende Ovationen – Gänsehaut bis in die Kabine.', 'good', [
      { kind: 'fans', amount: 4 }, { kind: 'morale', target: 'team', amount: 1.5, traits: { leader: 1.5 } },
    ]),
  },
  {
    id: 'lichtshow', label: 'Licht- und Lasershow', cost: 15000, cooldown: 6,
    pros: 'Spektakel: mehr Nachfrage und Stimmung', cons: 'teuer; nur zum Saisonauftakt, im Derby oder in den Playoffs',
    demand: { standing: 0.1, seated: 0.1, business: 0.05 }, atmosphere: 6,
    blocked: ({ world, club, fixture }) => {
      const first = fixture.stage === 'regular' && !world.competition!.fixtures.some((f) => f.home === club.id && f.stage === 'regular' && f.day < fixture.day);
      const derby = club.rivals.includes(fixture.away);
      return first || derby || fixture.stage === 'playoffs' ? null : 'nur zum Saisonauftakt, im Derby oder in den Playoffs';
    },
    after: ({ k }) => out('Licht aus, Show an – die Fans filmen, die Halle kocht.', 'good', [{ kind: 'fans', amount: 3 * k }]),
  },
  {
    id: 'freikarten', label: 'Freikarten für Vereine und Schulen', family: true,
    pros: 'freie Plätze füllen sich, Fanbasis wächst', cons: 'Freikarten bringen kein Eintrittsgeld',
    freeFill: 0.2, spend: 0.9, atmosphere: 2,
    blocked: regularOnly,
    after: ({ report, k }) => out(`${fmt(report.free)} Freikarten verteilt – Sportvereine und Schulen sagen Danke.`, 'neutral', [{ kind: 'fans', amount: 1 * k }, { kind: 'fanBase', amount: 0.5 * k }]),
  },
];

export const actionDef = (id: string) => ACTIONS.find((a) => a.id === id);
