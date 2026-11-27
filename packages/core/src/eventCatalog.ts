import type { Player, TraitId } from '@ehm/schema';
import { registerEvents, wear, type TerminDef, type RandomDef, type EventCtx, type Outcome, type Effect } from './events.ts';
import { hasTrait } from './chemistry.ts';
import { overall, toDisplay } from './ratings.ts';

/**
 * Katalog der Events. Ein neues Event = ein neuer Eintrag in TERMIN_LIST oder RANDOM_LIST.
 * Jeder Eintrag beschreibt Vor- und Nachteile und liefert in `resolve` Text, Ton und Wirkungen (siehe `Effect` in events.ts).
 * Beträge in Euro, Moral/Frische/Stimmung in Punkten (0–100).
 */

// ---------- Hilfen ----------

const name = (p?: Player) => (p ? `${p.firstName} ${p.lastName}` : 'ein Spieler');
const staffOf = (ctx: EventCtx) => ctx.world.staff.filter((s) => s.contract?.clubId === ctx.club.id);
/** Motivation des Cheftrainers (1–20) */
const motivation = (ctx: EventCtx) => { const h = staffOf(ctx).find((s) => s.role === 'headCoach'); return h ? toDisplay(h.ratings.motivation) : 10; };
const staffTrait = (ctx: EventCtx, t: TraitId) => staffOf(ctx).some((s) => s.traits.some((x) => x.id === t && x.strength >= 50));
const withTrait = (ctx: EventCtx, t: TraitId) => ctx.roster.filter((p) => hasTrait(p, t));
const captain = (ctx: EventCtx) => ctx.roster.find((p) => p.id === ctx.club.matchplan?.captain);
const out = (text: string, tone: Outcome['tone'], effects: Effect[]): Outcome => ({ text, tone, effects });
/** Spieler mit dem höchsten Wert einer Bewertung */
const top = (ps: Player[], f: (p: Player) => number) => [...ps].sort((a, b) => f(b) - f(a))[0];
/** Stimmungsbild: schlecht gelaunte Stars, Diven und Egoisten */
const SOCIAL: Partial<Record<TraitId, number>> = { teamplayer: 1.4, kabinenclown: 1.4, leader: 1.2, egoist: 0.5, diva: 0.6 };

// ---------- Termine (ersetzen je eine Trainingseinheit) ----------

const TERMIN_LIST: TerminDef[] = [
  {
    id: 'teamabend', category: 'team', label: 'Teamabend', cost: 4000,
    pros: 'Moral und Reihenchemie steigen', cons: 'kostet Geld; selten schlägt jemand über die Stränge',
    resolve: (ctx) => {
      const k = wear(ctx, 'teamabend');
      const wild = withTrait(ctx, 'freigeist').concat(withTrait(ctx, 'hitzkopf'));
      if (wild.length && ctx.roll('teamabend:eskalation') < 0.15) {
        const p = wild[Math.floor(ctx.roll('wer') * wild.length)];
        return { ...out(`Ein lustiger Abend – nur ${name(p)} fand kein Ende und kam völlig übermüdet zum Training.`, 'mixed', [
          { kind: 'money', amount: -4000, cat: 'admin' }, { kind: 'morale', target: 'team', amount: 3 * k, traits: SOCIAL }, { kind: 'chemistry', amount: 1.5 * k },
          { kind: 'fitness', target: 'subject', amount: -8 }, { kind: 'board', amount: -1 },
        ]), subject: p };
      }
      return out(k < 0.7 ? 'Wieder ein Teamabend – nett, aber der Reiz des Neuen ist weg.' : 'Bowling, Burger, gute Laune: Die Mannschaft rückt zusammen.', k < 0.7 ? 'neutral' : 'good', [
        { kind: 'money', amount: -4000, cat: 'admin' }, { kind: 'morale', target: 'team', amount: 4 * k, traits: SOCIAL }, { kind: 'chemistry', amount: 2.5 * k },
      ]);
    },
  },
  {
    id: 'besprechung', category: 'team', label: 'Mannschaftsbesprechung', cooldown: 4,
    options: [{ id: 'aufbauend', label: 'aufbauend' }, { id: 'fordernd', label: 'fordernd' }],
    pros: 'kann eine Krise drehen', cons: 'kann nach hinten losgehen; nur alle 4 Wochen',
    resolve: (ctx) => {
      const mot = motivation(ctx) + (staffTrait(ctx, 'motivator') ? 4 : 0) + (captain(ctx) && hasTrait(captain(ctx)!, 'leader') ? 2 : 0);
      const avgMorale = ctx.roster.reduce((s, p) => s + p.condition.morale, 0) / Math.max(1, ctx.roster.length);
      const crisis = ctx.losingStreak >= 3 || avgMorale < 45;
      const demanding = ctx.option === 'fordernd';
      // Aufbauend wirkt in der Krise, fordernd wenn das Team zu satt ist
      const fit = demanding ? (crisis ? -0.15 : avgMorale > 65 ? 0.2 : 0) : crisis ? 0.2 : avgMorale > 65 ? -0.1 : 0;
      const success = ctx.roll('besprechung') < 0.35 + mot * 0.025 + fit;
      if (success) return out(demanding ? 'Klare Worte, die angekommen sind – die Spieler wirken hellwach.' : 'Die Ansprache trifft den Nerv, die Köpfe gehen wieder hoch.', 'good', [
        { kind: 'morale', target: 'team', amount: crisis ? 7 : 4, traits: { leader: 1.3, diva: demanding ? 0.3 : 1 } }, { kind: 'form', target: 'team', amount: demanding ? 4 : 2 },
      ]);
      return out(demanding ? 'Die Ansprache kam als Abrechnung an – in der Kabine brodelt es.' : 'Die Worte verpuffen, einige Spieler verdrehen die Augen.', 'bad', [
        { kind: 'morale', target: 'team', amount: demanding ? -5 : -2, traits: { diva: 1.5, egoist: 1.5, stillerArbeiter: 0.5 } },
      ]);
    },
  },
  {
    id: 'wellness', category: 'team', label: 'Wellness-Kurztrip', cost: 18000, cooldown: 6,
    pros: 'Frische und Moral deutlich höher', cons: 'teuer; nur in Wochen mit höchstens einem Spiel; Eingespieltheit leidet etwas',
    blocked: (ctx) => (ctx.games > 1 ? 'nur in Wochen mit höchstens einem Spiel' : null),
    resolve: () => out('Zwei Tage Therme und Alpenluft – die Akkus sind wieder voll.', 'good', [
      { kind: 'money', amount: -18000, cat: 'admin' }, { kind: 'fitness', target: 'team', amount: 8 }, { kind: 'morale', target: 'team', amount: 5 }, { kind: 'familiarity', amount: -1.5 },
    ]),
  },
  {
    id: 'einzelgespraech', category: 'team', label: 'Einzelgespräch',
    pros: 'hebt die Moral eines unzufriedenen Spielers', cons: 'Diven und Egoisten fordern danach mehr',
    subject: (p) => p.condition.morale < 60,
    blocked: (ctx) => (ctx.roster.some((p) => p.condition.morale < 60) ? null : 'niemand ist gerade unzufrieden'),
    resolve: (ctx) => {
      const p = ctx.subject ?? top(ctx.roster, (x) => -x.condition.morale);
      if (hasTrait(p, 'diva') || hasTrait(p, 'egoist')) return out(`${name(p)} hört zu – und will mehr Eiszeit. Die Laune bessert sich nur etwas.`, 'mixed', [{ kind: 'morale', target: 'subject', amount: 4 }]);
      return out(`Ein offenes Gespräch mit ${name(p)} – er fühlt sich ernst genommen.`, 'good', [{ kind: 'morale', target: 'subject', amount: 12 }]);
    },
  },
  {
    id: 'spielDerSaison', category: 'team', label: '„Spiel der Saison“ ausrufen', cooldown: 6,
    pros: 'deutlicher Formschub im nächsten Spiel', cons: 'danach eine Frische- und Moraldelle; nur alle 6 Wochen',
    blocked: (ctx) => (ctx.games === 0 ? 'diese Woche kein Spiel' : null),
    resolve: () => out('Die Mannschaft ist heiß – im nächsten Spiel wird alles reingeworfen.', 'neutral', [{ kind: 'gameOfSeason' }]),
  },
  {
    id: 'sponsorenabend', category: 'economy', label: 'Sponsorenabend / Business-Spieltag',
    pros: 'Geld und Sponsorenzufriedenheit', cons: 'Pflichttermin für die Spieler: Frische und etwas Moral',
    blocked: (ctx) => (ctx.homeGames === 0 ? 'braucht ein Heimspiel in dieser Woche' : null),
    resolve: (ctx) => {
      const k = wear(ctx, 'sponsorenabend');
      return out('Logen voll, Hände geschüttelt, Visitenkarten getauscht. Die Partner sind angetan.', 'good', [
        { kind: 'money', amount: Math.round(25000 * k), cat: 'sponsors' }, { kind: 'sponsors', amount: 6 * k },
        { kind: 'fitness', target: 'team', amount: -2 }, { kind: 'morale', target: 'team', amount: -1, traits: { diva: -1, egoist: 1.5, stillerArbeiter: 2 } },
      ]);
    },
  },
  {
    id: 'werbedreh', category: 'economy', label: 'Werbedreh mit einem Star',
    pros: 'Geld vom Hauptsponsor', cons: 'der Star verliert Frische; Arbeiter nervt es, Diven lieben es',
    resolve: (ctx) => {
      const star = top(ctx.roster, overall);
      const diva = hasTrait(star, 'diva');
      return { ...out(`${name(star)} steht einen Tag vor der Kamera${diva ? ' – und genießt jede Minute' : ''}.`, 'good', [
        { kind: 'money', amount: 15000, cat: 'sponsors' }, { kind: 'sponsors', amount: 3 },
        { kind: 'fitness', target: 'subject', amount: -4 }, { kind: 'morale', target: 'subject', amount: diva ? 6 : hasTrait(star, 'stillerArbeiter') ? -5 : -1 },
      ]), subject: star };
    },
  },
  {
    id: 'sondertrikot', category: 'economy', label: 'Sondertrikot (Retro/Derby)', cost: 20000, cooldown: 10,
    pros: 'Merchandise-Einnahmen, Fans freuen sich', cons: 'Vorlaufkosten; Flop bei schlechter Stimmung',
    resolve: (ctx) => {
      const mood = ctx.club.mood.fans;
      const sale = Math.round((20000 + mood * 900 + ctx.club.fanBase * 300) * (0.75 + ctx.roll('verkauf') * 0.5));
      const flop = mood < 35 || ctx.losingStreak >= 4;
      if (flop) return out('Das Trikot ist schick, aber bei der Stimmung kauft es kaum jemand.', 'bad', [{ kind: 'money', amount: -20000 + Math.round(sale * 0.4), cat: 'catering' }, { kind: 'fans', amount: 1 }]);
      return out(`Das Sondertrikot ist ein Renner – rund ${Math.round((sale - 20000) / 1000)} T€ Gewinn.`, 'good', [{ kind: 'money', amount: sale - 20000, cat: 'catering' }, { kind: 'fans', amount: 4 }]);
    },
  },
  {
    id: 'autogrammstunde', category: 'fans', label: 'Autogrammstunde',
    pros: 'Fanstimmung, nächstes Heimspiel voller', cons: 'kostet etwas Frische; Diven maulen',
    resolve: (ctx) => {
      const k = wear(ctx, 'autogrammstunde');
      return out('Lange Schlangen im Einkaufszentrum – Kinder mit Trikots, strahlende Gesichter.', 'good', [
        { kind: 'fans', amount: 4 * k }, { kind: 'attendance', pct: 0.04 * k, games: 1 },
        { kind: 'fitness', target: 'team', amount: -1 }, { kind: 'morale', target: 'team', amount: 0.5, traits: { kabinenclown: 4, teamplayer: 3, diva: -4 } },
      ]);
    },
  },
  {
    id: 'fanclubbesuch', category: 'fans', label: 'Fanclub-Besuch (Sternfahrt)', cooldown: 8,
    pros: 'Fanstimmung deutlich höher, Teamplayer blühen auf', cons: 'zeitintensiv: Frische sinkt spürbar',
    resolve: () => out('Die Mannschaft tourt durch die Fanclubs – Stimmung wie bei einer Meisterfeier.', 'good', [
      { kind: 'fans', amount: 9 }, { kind: 'fitness', target: 'team', amount: -4 }, { kind: 'morale', target: 'team', amount: 1, traits: { teamplayer: 4, leader: 3, diva: -3 } },
    ]),
  },
  {
    id: 'kindertag', category: 'fans', label: 'Kindertag / Schultour', cost: 8000,
    pros: 'Fanbasis wächst langfristig, Nachwuchs wird aufmerksam', cons: 'kostet; kurzfristig wenig Wirkung',
    resolve: (ctx) => {
      const k = wear(ctx, 'kindertag');
      return out('Hunderte Kinder auf dem Eis – manche davon stehen in zehn Jahren in der Halle.', 'good', [
        { kind: 'money', amount: -8000, cat: 'admin' }, { kind: 'fans', amount: 2 * k }, { kind: 'board', amount: 1 * k }, { kind: 'morale', target: 'team', amount: 1 },
      ]);
    },
  },
  {
    id: 'ticketaktion', category: 'fans', label: 'Ticketaktion (Familientag)',
    pros: 'volle Halle, gute Stimmung', cons: 'geringere Ticketeinnahmen',
    blocked: (ctx) => (ctx.homeGames === 0 ? 'braucht ein Heimspiel in dieser Woche' : null),
    resolve: (ctx) => {
      const loss = Math.round(ctx.club.arena.capacity * ctx.club.finances.ticketPrice * 0.12);
      return out('Familienpreise locken neue Gesichter in die Halle.', 'good', [
        { kind: 'attendance', pct: 0.12, games: 1 }, { kind: 'fans', amount: 3 }, { kind: 'money', amount: -loss, cat: 'tickets' },
      ]);
    },
  },
  {
    id: 'offenesTraining', category: 'fans', label: 'Öffentliches Training',
    pros: 'Fans kommen nah ran, kostet nichts', cons: 'die Einheit bringt sportlich weniger',
    resolve: (ctx) => {
      const k = wear(ctx, 'offenesTraining');
      return out('Volle Tribüne beim Training, Applaus für jeden Schuss.', 'good', [{ kind: 'fans', amount: 3 * k }, { kind: 'morale', target: 'team', amount: 1 }, { kind: 'chemistry', amount: 0.5 }]);
    },
  },
];

// ---------- Zufallsereignisse ----------

const pickBy = (ps: Player[], ctx: EventCtx, key: string) => (ps.length ? ps[Math.floor(ctx.roll(key) * ps.length)] : undefined);

const RANDOM_LIST: RandomDef[] = [
  // Kabine
  {
    id: 'feiern', category: 'team', weight: 3, cooldown: 6,
    subjects: (ctx) => { const p = pickBy(ctx.roster.filter((x) => hasTrait(x, 'freigeist') || hasTrait(x, 'hitzkopf') || x.hidden.professionalism < 70), ctx, 'feiern'); return p ? [p] : null; },
    title: () => 'Nachts erwischt',
    text: (ctx) => `${name(ctx.subject)} wurde um drei Uhr nachts in einer Bar gesehen – zwei Tage vor dem Spiel. Die Lokalpresse hat Fotos.`,
    options: [
      { id: 'strafe', label: 'Geldstrafe', hint: 'Disziplin im Team steigt, der Spieler ist beleidigt', resolve: () => out('Die Strafe sitzt – das Team hat die Botschaft verstanden.', 'mixed', [{ kind: 'morale', target: 'subject', amount: -8 }, { kind: 'morale', target: 'others', amount: 1, traits: { stillerArbeiter: 2, perfektionist: 2 } }, { kind: 'money', amount: 3000, cat: 'admin' }, { kind: 'board', amount: 1 }]) },
      { id: 'gespraech', label: 'Unter vier Augen klären', hint: 'kein Ärger, aber es kann wieder passieren', resolve: (ctx) => (ctx.roll('rueckfall') < 0.3 ? out('Das Gespräch war gut gemeint – zwei Wochen später war er wieder unterwegs.', 'bad', [{ kind: 'morale', target: 'others', amount: -1.5 }, { kind: 'fans', amount: -2 }]) : out('Er entschuldigt sich bei der Mannschaft. Thema erledigt.', 'good', [{ kind: 'morale', target: 'subject', amount: 2 }])) },
      { id: 'sperre', label: 'Ein Spiel auf die Tribüne', hint: 'deutliches Zeichen, der Spieler fehlt sportlich', resolve: () => out('Er sitzt das nächste Spiel auf der Tribüne. Ein klares Zeichen.', 'mixed', [{ kind: 'morale', target: 'subject', amount: -12 }, { kind: 'fitness', target: 'subject', amount: -3 }, { kind: 'morale', target: 'others', amount: 2, traits: { stillerArbeiter: 1.5 } }, { kind: 'board', amount: 2 }]) },
    ],
    fallback: 'strafe',
  },
  {
    id: 'streit', category: 'team', weight: 3, cooldown: 8,
    subjects: (ctx) => {
      const hot = ctx.roster.filter((p) => hasTrait(p, 'hitzkopf') || hasTrait(p, 'egoist') || hasTrait(p, 'diva'));
      const a = pickBy(hot.length ? hot : ctx.roster, ctx, 'streit1');
      const b = pickBy(ctx.roster.filter((p) => p.id !== a?.id), ctx, 'streit2');
      return a && b ? [a, b] : null;
    },
    title: () => 'Streit in der Kabine',
    text: (ctx) => `${name(ctx.subject)} und ${name(ctx.subject2)} sind beim Training aneinandergeraten. Die Stimmung ist geladen.`,
    options: [
      { id: 'kapitaen', label: 'Kapitän schlichten lassen', hint: 'klappt gut mit einem echten Leader', resolve: (ctx) => { const c = captain(ctx); const ok = c && (hasTrait(c, 'leader') ? 0.8 : 0.45) > ctx.roll('schlichten'); return ok ? out(`${name(c)} bringt beide an einen Tisch – Handschlag, weiter geht's.`, 'good', [{ kind: 'pairChemistry', amount: 5 }, { kind: 'morale', target: 'team', amount: 1 }]) : out('Der Schlichtungsversuch scheitert, die beiden gehen sich aus dem Weg.', 'bad', [{ kind: 'pairChemistry', amount: -10 }, { kind: 'morale', target: 'team', amount: -1.5 }]); } },
      { id: 'trennen', label: 'In verschiedene Reihen stecken', hint: 'Ruhe in der Kabine, aber die Reihen werden umgebaut', resolve: () => out('Die beiden spielen vorerst nicht mehr zusammen. Ruhe kehrt ein.', 'mixed', [{ kind: 'pairChemistry', amount: -6 }, { kind: 'chemistry', amount: -1 }]) },
      { id: 'ignorieren', label: 'Laufen lassen', hint: 'kostet nichts – oder viel', resolve: (ctx) => (ctx.roll('ignorieren') < 0.5 ? out('Das hat sich von selbst erledigt.', 'neutral', []) : out('Der Streit schwelt weiter und vergiftet das Klima.', 'bad', [{ kind: 'pairChemistry', amount: -12 }, { kind: 'morale', target: 'team', amount: -3 }])) },
    ],
    fallback: 'kapitaen',
  },
  {
    id: 'eiszeit', category: 'team', weight: 3, cooldown: 6,
    subjects: (ctx) => { const plan = ctx.club.matchplan; const dressed = new Set(plan ? [...plan.forwardLines.flat(), ...plan.defensePairs.flat()] : []); const p = top(ctx.roster.filter((x) => x.position !== 'G' && (!dressed.has(x.id) || plan?.forwardLines[3]?.includes(x.id)) && overall(x) > 95), overall); return p ? [p] : null; },
    title: () => 'Wunsch nach mehr Eiszeit',
    text: (ctx) => `${name(ctx.subject)} klopft an die Bürotür: Er will mehr spielen – sonst denkt er über einen Wechsel nach.`,
    options: [
      { id: 'versprechen', label: 'Mehr Eiszeit in Aussicht stellen', hint: 'er ist zufrieden – wenn du es dann auch einlöst', resolve: () => out('Er geht zufrieden – jetzt muss die Aufstellung mitspielen.', 'mixed', [{ kind: 'morale', target: 'subject', amount: 10 }]) },
      { id: 'ablehnen', label: 'Ablehnen: Leistung zeigen', hint: 'klare Linie, der Spieler ist enttäuscht', resolve: (ctx) => out(hasTrait(ctx.subject!, 'kaempfer') ? 'Er nimmt die Herausforderung an.' : 'Er ist enttäuscht und lässt es sich anmerken.', hasTrait(ctx.subject!, 'kaempfer') ? 'neutral' : 'bad', [{ kind: 'morale', target: 'subject', amount: hasTrait(ctx.subject!, 'kaempfer') ? 2 : -8 }]) },
      { id: 'gespraech', label: 'Rolle erklären', hint: 'kleiner Gewinn ohne Versprechen', resolve: () => out('Er versteht seine Rolle besser.', 'neutral', [{ kind: 'morale', target: 'subject', amount: 3 }]) },
    ],
    fallback: 'gespraech',
  },
  {
    id: 'grippe', category: 'team', weight: 2, cooldown: 12,
    when: (ctx) => { const m = Number(ctx.date.slice(5, 7)); return m >= 11 || m <= 3; },
    title: () => 'Grippewelle',
    text: () => 'In der Kabine geht ein Infekt um. Mehrere Spieler husten und schniefen.',
    options: [
      { id: 'absagen', label: 'Training zurückfahren', hint: 'schont die Spieler, die Woche bringt sportlich wenig', resolve: () => out('Kurze Pause, Tee und Ruhe – die meisten sind schnell wieder fit.', 'mixed', [{ kind: 'fitness', target: 'team', amount: -2 }, { kind: 'familiarity', amount: -1 }]) },
      { id: 'durchziehen', label: 'Durchziehen', hint: 'kein Trainingsausfall, aber der Infekt verbreitet sich', resolve: () => out('Durchgezogen – die halbe Mannschaft läuft auf Reserve.', 'bad', [{ kind: 'fitness', target: 'team', amount: -7 }, { kind: 'morale', target: 'team', amount: -1 }]) },
    ],
    fallback: 'absagen',
  },
  {
    id: 'nachwuchs', category: 'team', weight: 2, cooldown: 10,
    subjects: (ctx) => { const p = pickBy(ctx.roster.filter((x) => x.birthDate < `${Number(ctx.date.slice(0, 4)) - 24}`), ctx, 'baby'); return p ? [p] : null; },
    title: () => 'Freudige Nachricht',
    text: (ctx) => `${name(ctx.subject)} ist Vater geworden! Er fragt, ob er ein paar Tage bei der Familie bleiben darf.`,
    options: [
      { id: 'frei', label: 'Ein paar Tage frei geben', hint: 'großer Moralschub, er verpasst Training', resolve: () => out('Glückwünsche aus der Kabine – er kommt strahlend zurück.', 'good', [{ kind: 'morale', target: 'subject', amount: 14 }, { kind: 'morale', target: 'others', amount: 1 }, { kind: 'fitness', target: 'subject', amount: -2 }]) },
      { id: 'kurz', label: 'Nur einen Tag', hint: 'er ist dabei, aber etwas enttäuscht', resolve: () => out('Er ist dabei, die Gedanken sind aber zu Hause.', 'neutral', [{ kind: 'morale', target: 'subject', amount: 3 }]) },
    ],
    fallback: 'frei',
  },
  {
    id: 'trauer', category: 'team', weight: 1, cooldown: 16,
    subjects: (ctx) => { const p = pickBy(ctx.roster, ctx, 'trauer'); return p ? [p] : null; },
    title: () => 'Trauerfall',
    text: (ctx) => `In der Familie von ${name(ctx.subject)} gab es einen Todesfall.`,
    options: [
      { id: 'freistellen', label: 'Freistellen, solange er braucht', hint: 'menschlich richtig, die Mannschaft rückt zusammen', resolve: () => out('Die Mannschaft trägt Trauerflor. Er kommt nach einer Woche zurück.', 'neutral', [{ kind: 'morale', target: 'subject', amount: -4 }, { kind: 'morale', target: 'others', amount: 1.5, traits: { teamplayer: 1.5 } }, { kind: 'fitness', target: 'subject', amount: -6 }]) },
      { id: 'anbieten', label: 'Freistellung anbieten, Entscheidung ihm überlassen', hint: 'er spielt meist weiter, wirkt aber abwesend', resolve: () => out('Er will spielen – „für die Familie“.', 'neutral', [{ kind: 'morale', target: 'subject', amount: -9 }]) },
    ],
    fallback: 'freistellen',
  },
  // Wirtschaft
  {
    id: 'technik', category: 'economy', weight: 2, cooldown: 12,
    title: () => 'Technik defekt',
    text: (ctx) => (ctx.roll('was') < 0.5 ? 'Die Eismaschine streikt.' : 'Der Videowürfel ist ausgefallen.') + ' Der Hausmeister rät zu einer schnellen Reparatur.',
    options: [
      { id: 'reparieren', label: 'Sofort reparieren', hint: 'teuer, aber alles läuft', resolve: () => out('Repariert – teuer, aber erledigt.', 'mixed', [{ kind: 'money', amount: -30000, cat: 'admin' }]) },
      { id: 'provisorium', label: 'Provisorium', hint: 'billig, Zuschauer und Stimmung leiden', resolve: () => out('Das Provisorium hält – mehr schlecht als recht. Die Fans murren.', 'bad', [{ kind: 'money', amount: -6000, cat: 'admin' }, { kind: 'fans', amount: -4 }, { kind: 'attendance', pct: -0.03, games: 3 }]) },
    ],
    fallback: 'reparieren',
  },
  {
    id: 'doku', category: 'economy', weight: 2, cooldown: 20,
    title: () => 'Lokal-TV will eine Doku drehen',
    text: () => 'Ein regionaler Sender will die Mannschaft einen Monat lang mit der Kamera begleiten – auch in der Kabine.',
    options: [
      { id: 'ja', label: 'Zusagen', hint: 'Geld und Fans, aber Unruhe in der Kabine', resolve: () => out('Die Kamera ist überall. Die Fans lieben es, manche Spieler weniger.', 'mixed', [{ kind: 'money', amount: 20000, cat: 'media' }, { kind: 'fans', amount: 6 }, { kind: 'sponsors', amount: 3 }, { kind: 'morale', target: 'team', amount: -1.5, traits: { diva: -2, stillerArbeiter: 2, kabinenclown: -1 } }]) },
      { id: 'kabine', label: 'Zusagen, aber ohne Kabine', hint: 'weniger Geld, keine Unruhe', resolve: () => out('Eine nette Reportage ohne Kabinenbilder.', 'good', [{ kind: 'money', amount: 8000, cat: 'media' }, { kind: 'fans', amount: 3 }]) },
      { id: 'nein', label: 'Absagen', hint: 'Ruhe – der Sender ist verschnupft', resolve: () => out('Abgesagt. Der Sender berichtet künftig etwas kühler.', 'neutral', [{ kind: 'sponsors', amount: -1 }]) },
    ],
    fallback: 'kabine',
  },
  {
    id: 'sponsorSonder', category: 'economy', weight: 2, cooldown: 10,
    title: () => 'Angebot eines Partners',
    text: () => 'Ein Sponsor bietet eine Sonderzahlung – dafür sollen drei Spieler an einem Firmenevent unter der Woche teilnehmen.',
    options: [
      { id: 'ja', label: 'Annehmen', hint: 'Geld und Sponsorenzufriedenheit, Spieler verlieren Frische', resolve: () => out('Die Spieler lächeln in die Kameras, das Geld ist überwiesen.', 'good', [{ kind: 'money', amount: 18000, cat: 'sponsors' }, { kind: 'sponsors', amount: 4 }, { kind: 'fitness', target: 'team', amount: -1.5 }, { kind: 'morale', target: 'team', amount: -0.5, traits: { diva: -2 } }]) },
      { id: 'nein', label: 'Ablehnen', hint: 'Fokus aufs Eis, der Partner ist enttäuscht', resolve: () => out('Abgelehnt – der Partner ist hörbar enttäuscht.', 'neutral', [{ kind: 'sponsors', amount: -4 }]) },
    ],
    fallback: 'ja',
  },
  {
    id: 'energie', category: 'economy', weight: 1, cooldown: 30,
    title: () => 'Energiekosten steigen',
    text: () => 'Der Stadtwerke-Vertrag für die Eisfläche wird teurer. Da gibt es nichts zu verhandeln.',
    options: [
      { id: 'zahlen', label: 'Zähneknirschend zahlen', hint: 'Pech – die Ausgaben steigen', resolve: () => out('Die Rechnung steigt um rund 15.000 €.', 'bad', [{ kind: 'money', amount: -15000, cat: 'admin' }]) },
      { id: 'sparen', label: 'Sparprogramm in der Halle', hint: 'spart Geld, die Fans frieren', resolve: () => out('Kältere Halle, kürzere Öffnungszeiten – spart Geld, kostet Sympathie.', 'mixed', [{ kind: 'money', amount: -6000, cat: 'admin' }, { kind: 'fans', amount: -3 }]) },
    ],
    fallback: 'zahlen',
  },
  // Fans
  {
    id: 'protest', category: 'fans', weight: 4, cooldown: 6,
    when: (ctx) => ctx.losingStreak >= 3 || ctx.club.mood.fans < 30,
    title: () => 'Fans protestieren',
    text: (ctx) => `Nach ${ctx.losingStreak >= 3 ? `${ctx.losingStreak} Niederlagen in Folge` : 'den letzten Wochen'} hängen Banner in der Kurve: „Wir wollen euch kämpfen sehen!“`,
    options: [
      { id: 'gipfel', label: 'Fan-Gipfel einberufen', hint: 'Fans fühlen sich gehört, der Druck auf den Kader steigt', resolve: () => out('Ein ehrliches Gespräch mit den Fanclubs. Die Kurve gibt einen Vertrauensvorschuss.', 'mixed', [{ kind: 'fans', amount: 8 }, { kind: 'morale', target: 'team', amount: -1.5, traits: { kaempfer: -1, nervenbuendel: 2 } }]) },
      { id: 'ignorieren', label: 'Ignorieren', hint: 'kein Druck auf die Spieler, Fans und Vorstand sind verärgert', resolve: () => out('Funkstille – die Kurve ist sauer, der Vorstand fragt nach.', 'bad', [{ kind: 'fans', amount: -5 }, { kind: 'board', amount: -2 }]) },
      { id: 'mannschaft', label: 'Mannschaft zur Kurve schicken', hint: 'starkes Zeichen – kann aber eskalieren', resolve: (ctx) => (ctx.roll('kurve') < 0.65 ? out('Die Mannschaft stellt sich der Kurve. Applaus statt Pfiffe.', 'good', [{ kind: 'fans', amount: 10 }, { kind: 'morale', target: 'team', amount: 2, traits: { kaempfer: 2, leader: 1.5 } }]) : out('Es fliegen Bierbecher – ein Bild, das keiner sehen wollte.', 'bad', [{ kind: 'fans', amount: -3 }, { kind: 'morale', target: 'team', amount: -4 }])) },
    ],
    fallback: 'gipfel',
  },
  {
    id: 'pyro', category: 'fans', weight: 2, cooldown: 12,
    title: () => 'Pyrotechnik im Fanblock',
    text: () => 'Beim letzten Heimspiel wurde gezündet. Die Liga verhängt eine Geldstrafe.',
    options: [
      { id: 'zahlen', label: 'Strafe zahlen', hint: 'kostet Geld, die Fans bleiben dir gewogen', resolve: () => out('Strafe bezahlt, Appell an die Kurve.', 'mixed', [{ kind: 'money', amount: -10000, cat: 'admin' }]) },
      { id: 'sperren', label: 'Block für ein Spiel sperren', hint: 'deutliches Zeichen, Stimmung und Zuschauer sinken', resolve: () => out('Der Block bleibt leer. Die Liga ist zufrieden, die Fans nicht.', 'bad', [{ kind: 'money', amount: -4000, cat: 'admin' }, { kind: 'fans', amount: -8 }, { kind: 'attendance', pct: -0.08, games: 1 }, { kind: 'board', amount: 1 }]) },
    ],
    fallback: 'zahlen',
  },
  {
    id: 'choreo', category: 'fans', weight: 2, cooldown: 10,
    when: (ctx) => ctx.homeGames > 0,
    title: () => 'Choreo-Pläne',
    text: () => 'Die Ultras planen eine große Choreo fürs nächste Heimspiel und bitten um einen Zuschuss für Stoff und Farbe.',
    options: [
      { id: 'zuschuss', label: 'Zuschuss geben', hint: 'die Halle bebt – Heimspiel mit Zusatzschub', resolve: () => out('Eine Choreo über die ganze Tribüne – Gänsehaut pur.', 'good', [{ kind: 'money', amount: -5000, cat: 'admin' }, { kind: 'fans', amount: 5 }, { kind: 'attendance', pct: 0.05, games: 1 }, { kind: 'morale', target: 'team', amount: 2 }]) },
      { id: 'nein', label: 'Kein Geld', hint: 'spart Geld, die Ultras sind enttäuscht', resolve: () => out('Die Choreo fällt kleiner aus. Die Kurve hat es registriert.', 'neutral', [{ kind: 'fans', amount: -2 }]) },
    ],
    fallback: 'zuschuss',
  },
  {
    id: 'jubilaeum', category: 'fans', weight: 2, cooldown: 12,
    title: () => 'Fanclub-Jubiläum',
    text: () => 'Ein großer Fanclub feiert 25-jähriges Bestehen und lädt die Mannschaft ein – unter der Woche, abends.',
    options: [
      { id: 'hin', label: 'Mannschaft hinschicken', hint: 'Fans sind begeistert, es wird spät', resolve: () => out('Ein Abend mit Liedern und Geschichten. Die Fans werden ihn nie vergessen.', 'good', [{ kind: 'fans', amount: 6 }, { kind: 'fitness', target: 'team', amount: -2.5 }, { kind: 'morale', target: 'team', amount: 1, traits: { teamplayer: 2, diva: -2 } }]) },
      { id: 'abordnung', label: 'Kapitän und zwei Spieler', hint: 'gute Geste, wenig Aufwand', resolve: () => out('Eine kleine Abordnung überbringt ein signiertes Trikot.', 'good', [{ kind: 'fans', amount: 3 }]) },
      { id: 'absagen', label: 'Absagen', hint: 'Fokus aufs Eis, Fans enttäuscht', resolve: () => out('Abgesagt – im Fanforum wird diskutiert.', 'bad', [{ kind: 'fans', amount: -4 }]) },
    ],
    fallback: 'abordnung',
  },
  {
    id: 'nationalteam', category: 'team', weight: 1, cooldown: 20,
    subjects: (ctx) => { const p = top(ctx.roster.filter((x) => x.nationalities.includes('DE') && overall(x) >= 125), overall); return p ? [p] : null; },
    title: () => 'Lob vom Bundestrainer',
    text: (ctx) => `Der Bundestrainer war in der Halle und hat ${name(ctx.subject)} öffentlich gelobt. Eine Nominierung für den Deutschland Cup liegt in der Luft.`,
    options: [
      { id: 'freuen', label: 'Öffentlich gratulieren', hint: 'Spieler und Fans freuen sich, Mitspieler eventuell neidisch', resolve: () => out('Stolz in der Kabine – und Schlagzeilen in der Zeitung.', 'good', [{ kind: 'morale', target: 'subject', amount: 10 }, { kind: 'fans', amount: 3 }, { kind: 'morale', target: 'others', amount: 0.5, traits: { egoist: -3, diva: -3 } }]) },
      { id: 'bremsen', label: 'Ball flach halten', hint: 'keine Unruhe, der Spieler ist etwas enttäuscht', resolve: () => out('„Erst mal den Job im Verein machen.“ Er nickt – etwas zerknirscht.', 'neutral', [{ kind: 'morale', target: 'subject', amount: 3 }]) },
    ],
    fallback: 'freuen',
  },
];

registerEvents(TERMIN_LIST, RANDOM_LIST);
export { TERMIN_LIST, RANDOM_LIST };
