import type { World, Club, SponsorSlot, SponsorType, SponsorDeal, SponsorOffer, SponsorBonus, News } from '@ehm/schema';
import { hash01, addDays, daysBetween } from './calendar.ts';
import { toDisplay } from './ratings.ts';

/**
 * Sponsoring (Meilenstein 11, Konzept „sponsoring“):
 * - 7 Werbeflächen (9 Plätze): Hauptsponsor, Trikot (Ärmel, Hose, Helm), Eisfläche, Bande, Hallenname, Ausrüster, Business-Club.
 * - 6 Partner-Typen mit eigenen Vorlieben (Erfolg, Zuschauer, Fannähe, Image, Termine) und eigener Zufriedenheit.
 * - Angebote kommen in der Sommerpause (Vertragsgespräche) und für freie Flächen auch während der Saison.
 *   Der Manager nimmt an, lehnt ab oder verhandelt (bis zu 3 Runden: Grundbetrag und Pflichttermine).
 * - Der Geschäftsführer kann die Verhandlungen nach einer Leitlinie übernehmen (sicheres Geld / ausgewogen / hohe Boni).
 * - Pflichttermine erfüllen die Spieltagsaktion „Business-Spieltag“ (stadiumActions.ts) und der Termin „Werbedreh“ (Events). Fehlende Termine kosten Zufriedenheit.
 * Die Summe aller Flächen entspricht im Schnitt dem bisherigen Sponsorenwert der Saisonplanung (`finances.sponsorIncome`).
 */

export const SLOT: Record<SponsorSlot, { label: string; area: string; share: number; termine: [number, number]; types: Partial<Record<SponsorType, number>> }> = {
  main: { label: 'Hauptsponsor', area: 'Trikotbrust', share: 0.27, termine: [2, 4], types: { konzern: 3, mittelstand: 2, bank: 2, brauerei: 1, autohaus: 1, startup: 1 } },
  sleeve: { label: 'Trikotärmel', area: 'Trikot', share: 0.05, termine: [0, 1], types: { mittelstand: 3, autohaus: 2, startup: 2, bank: 1 } },
  pants: { label: 'Hose', area: 'Trikot', share: 0.045, termine: [0, 1], types: { mittelstand: 3, brauerei: 1, autohaus: 1, startup: 1 } },
  helmet: { label: 'Helm', area: 'Trikot', share: 0.05, termine: [0, 1], types: { mittelstand: 2, konzern: 1, startup: 2, bank: 1 } },
  ice: { label: 'Eisfläche', area: 'Mittelkreis & Bullypunkte', share: 0.09, termine: [1, 2], types: { konzern: 2, bank: 2, brauerei: 2, mittelstand: 1 } },
  boards: { label: 'Bande', area: 'Bandenpool', share: 0.15, termine: [0, 1], types: { mittelstand: 4, brauerei: 1, autohaus: 1 } },
  naming: { label: 'Hallenname', area: 'Namensrecht der Halle', share: 0.12, termine: [1, 3], types: { konzern: 3, bank: 2, brauerei: 1, mittelstand: 1 } },
  outfitter: { label: 'Ausrüster', area: 'Ausrüstung & Teamkleidung', share: 0.05, termine: [0, 1], types: { mittelstand: 2, startup: 1, konzern: 1 } },
  business: { label: 'Business-Club', area: 'Sponsorenpool & Logen', share: 0.175, termine: [1, 2], types: { mittelstand: 5, bank: 1 } },
};
export const SLOT_ORDER: SponsorSlot[] = ['main', 'naming', 'business', 'boards', 'ice', 'sleeve', 'helmet', 'pants', 'outfitter'];

export const TYPE: Record<SponsorType, { label: string; wants: string; pay: number; bonusShare: number; patience: number; flex: [number, number] }> = {
  mittelstand: { label: 'Regionaler Mittelständler', wants: 'Fannähe und Treue – verzeiht Durststrecken', pay: 0.95, bonusShare: 0.1, patience: 0.8, flex: [1.05, 1.18] },
  konzern: { label: 'Konzern', wants: 'Erfolg und Sichtbarkeit – springt bei Misserfolg schnell ab', pay: 1.2, bonusShare: 0.35, patience: 0.45, flex: [1.08, 1.25] },
  brauerei: { label: 'Brauerei', wants: 'volle Halle – Bonus nach Zuschauerschnitt', pay: 1, bonusShare: 0.22, patience: 0.7, flex: [1.05, 1.2] },
  autohaus: { label: 'Autohaus', wants: 'Spieler in der Werbung (Werbedreh)', pay: 0.95, bonusShare: 0.15, patience: 0.7, flex: [1.05, 1.18] },
  bank: { label: 'Bank / Versicherung', wants: 'sauberes Image und Nachwuchsarbeit – reagiert auf Skandale', pay: 1.05, bonusShare: 0.15, patience: 0.6, flex: [1.05, 1.15] },
  startup: { label: 'Start-up', wants: 'Aufmerksamkeit – zahlt gut, kann aber pleitegehen', pay: 1.25, bonusShare: 0.2, patience: 0.55, flex: [1.1, 1.3] },
};

export const SPON = {
  /** Wert eines Pflichttermins (Anteil am Grundbetrag) beim Verhandeln */
  TERMIN_VALUE: 0.07,
  /** Zufriedenheit: Abzug je fehlendem Pflichttermin am Saisonende */
  MISSED_TERMIN: 12,
  /** Ausstieg bei Zufriedenheit unter */
  QUIT_BELOW: 15,
  /** Insolvenzrisiko eines Start-ups pro Monat */
  STARTUP_BANKRUPT: 0.012,
  /** Chance je Monat und freier Fläche auf ein Angebot während der Saison */
  MIDSEASON_OFFER: 0.35,
  /** Angebote während der Saison sind weniger wert */
  MIDSEASON_VALUE: 0.75,
  MAX_ROUNDS: 3,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const k1 = (v: number) => Math.round(v / 1000) * 1000;

// ---------- Namen (Fantasie) ----------

const SURNAMES = ['Hollerbach', 'Krämer', 'Steinlein', 'Wagenknecht', 'Brandl', 'Oberhuber', 'Lindner', 'Pfeffer', 'Rauscher', 'Ehrenreich', 'Kessler', 'Moosbrugger', 'Albrecht', 'Hagedorn', 'Ziegler', 'Vogl'];
const TRADES = ['Haustechnik', 'Bau', 'Logistik', 'Elektro', 'Holzbau', 'Metallbau', 'Fensterbau', 'Gebäudereinigung', 'Spedition', 'Druckerei'];
const CORPS = ['Nordwerk', 'Valtron', 'Arvena', 'Kordia', 'Helion Industries', 'Talmar', 'Corvinus', 'Brightfeld', 'Sanova', 'Orbis Energie'];
const STARTS = ['Byte', 'Flux', 'Nova', 'Kraft', 'Puls', 'Klar', 'Funke', 'Welle'];
const ENDS = ['ly', 'io', 'werk', 'hub', 'lab', 'bit'];

export function sponsorName(type: SponsorType, club: Club, key: string): string {
  const r = (n: number, i: number) => Math.floor(hash01(`${key}:${i}`) * n);
  const sur = SURNAMES[r(SURNAMES.length, 1)];
  switch (type) {
    case 'mittelstand': return `${sur} ${TRADES[r(TRADES.length, 2)]}`;
    case 'konzern': return CORPS[r(CORPS.length, 3)];
    case 'brauerei': return [`Brauerei ${sur}`, `${sur}bräu`, `${club.city}er Brauhaus`][r(3, 4)];
    case 'autohaus': return `Autohaus ${sur}`;
    case 'bank': return [`Regionalbank ${club.city}`, `${club.city}er Versicherungsverein`, `Bankhaus ${sur}`, `${sur} Privatbank`, `Volkskasse ${club.city}`][r(5, 5)];
    case 'startup': return `${STARTS[r(STARTS.length, 6)]}${ENDS[r(ENDS.length, 7)]}`;
  }
}

/** Name, den der Verein noch nicht als Partner hat */
function uniqueName(type: SponsorType, club: Club, key: string): string {
  const used = new Set([...club.sponsors.deals.map((d) => d.name), ...club.sponsors.offers.map((o) => o.name)]);
  for (let i = 0; i < 24; i++) { const n = sponsorName(type, club, i ? `${key}:n${i}` : key); if (!used.has(n)) return n; }
  return sponsorName(type, club, key);
}

// ---------- Werte ----------

/** Aktive Verträge (laufen bis einschließlich `untilSeason`) */
export const activeDeals = (club: Club, season: number) => club.sponsors.deals.filter((d) => d.untilSeason >= season);
export const dealOf = (club: Club, slot: SponsorSlot, season: number) => activeDeals(club, season).find((d) => d.slot === slot);

/** Grundbeträge pro Saison; der Business-Club schwankt mit der Sponsorenstimmung */
export function sponsorAnnual(club: Club, season: number): number {
  const deals = activeDeals(club, season);
  if (!club.sponsors.deals.length) return club.finances.sponsorIncome;
  return deals.reduce((s, d) => s + d.base * (d.slot === 'business' ? 0.8 + club.mood.sponsors / 250 : 1), 0);
}

/** Geschäftsführer des Vereins (Vermarktung 1–20) oder null */
export function businessManager(world: World, clubId: string) {
  const gm = world.staff.find((s) => s.contract?.clubId === clubId && s.role === 'manager');
  return gm ? { staff: gm, skill: toDisplay(gm.ratings.business) } : null;
}

/** Wie attraktiv ist der Verein für Partner? (~0,7–1,3) */
export function attractiveness(world: World, club: Club): number {
  const fill = club.finances.attendance.length ? club.finances.attendance.reduce((a, b) => a + b, 0) / club.finances.attendance.length / club.arena.capacity : 0.75;
  const arch = world.archive.filter((a) => a.leagueId === club.leagueId).at(-1);
  const lastPlace = arch?.finalStandings ? arch.finalStandings.indexOf(club.id) + 1 : 7;
  const n = world.clubs.filter((c) => c.leagueId === club.leagueId).length || 14;
  return clamp(0.85 + ((club.mood.sponsors - 50) / 50) * 0.12 + ((club.mood.fans - 50) / 50) * 0.06 + ((n / 2 - lastPlace) / n) * 0.2 + (fill - 0.75) * 0.3 + club.fanBase / 1000, 0.7, 1.3);
}

function pickType(slot: SponsorSlot, key: string): SponsorType {
  const w = SLOT[slot].types;
  const list = Object.entries(w) as [SponsorType, number][];
  const total = list.reduce((s, [, v]) => s + v, 0);
  let r = hash01(key) * total;
  for (const [t, v] of list) if ((r -= v) <= 0) return t;
  return list[0][0];
}

function bonusesFor(type: SponsorType, total: number, club: Club): SponsorBonus[] {
  const b = total * TYPE[type].bonusShare;
  const fill = club.finances.attendance.length ? club.finances.attendance.reduce((a, x) => a + x, 0) / club.finances.attendance.length / club.arena.capacity : 0.75;
  switch (type) {
    case 'konzern': return [{ kind: 'playoffs', amount: k1(b * 0.4) }, { kind: 'semifinal', amount: k1(b * 0.35) }, { kind: 'title', amount: k1(b * 0.6) }];
    case 'brauerei': return [{ kind: 'attendance', amount: k1(b), threshold: Math.round(clamp(fill + 0.03, 0.6, 0.97) * 100) / 100 }];
    case 'bank': return [{ kind: 'top6', amount: k1(b) }];
    case 'startup': return [{ kind: 'title', amount: k1(b * 1.5) }];
    default: return b >= 1000 ? [{ kind: 'playoffs', amount: k1(b) }] : [];
  }
}

/** Neues Angebot für eine Fläche */
export function makeOffer(world: World, club: Club, slot: SponsorSlot, key: string, value = 1, type?: SponsorType): SponsorOffer {
  const t = type ?? pickType(slot, `${key}:typ`);
  const v = club.finances.sponsorIncome * SLOT[slot].share * attractiveness(world, club) * TYPE[t].pay * value * (0.9 + hash01(`${key}:wert`) * 0.2);
  const bonuses = bonusesFor(t, v, club);
  const bonusTotal = bonuses.reduce((s, b) => s + b.amount, 0);
  const base = k1(Math.max(4000, v - bonusTotal * 0.6));
  const [tl, th] = SLOT[slot].termine;
  const termine = clamp(tl + Math.floor(hash01(`${key}:termine`) * (th - tl + 1)) + (t === 'mittelstand' || t === 'autohaus' ? 1 : 0), 0, 5);
  const [fl, fh] = TYPE[t].flex;
  return {
    id: `so-${key}`.replace(/[^a-zA-Z0-9-]/g, ''),
    slot, type: t, name: uniqueName(t, club, key), base, bonuses, termine,
    years: slot === 'naming' ? 2 + Math.floor(hash01(`${key}:jahre`) * 2) : 1 + Math.floor(hash01(`${key}:jahre`) * 3),
    relegationExit: t === 'konzern' || t === 'startup',
    limit: k1(base * (fl + hash01(`${key}:grenze`) * (fh - fl))),
    round: 0,
    until: addDays(world.date, 45),
  };
}

/** Erwarteter Wert eines Angebots pro Saison (für KI und Geschäftsführer) */
export function offerValue(o: Pick<SponsorOffer, 'base' | 'bonuses' | 'termine'>, strategy: 'safe' | 'balanced' | 'bonus' = 'balanced'): number {
  const w = strategy === 'safe' ? 0.25 : strategy === 'bonus' ? 0.85 : 0.55;
  return o.base + o.bonuses.reduce((s, b) => s + b.amount, 0) * w - o.termine * o.base * 0.02;
}

// ---------- Verhandeln und Abschließen ----------

const news = (world: World, text: string): World => ({ ...world, market: { ...world.market, news: [{ date: world.date, kind: 'info' as const, text, mine: true }, ...world.market.news].slice(0, 120) as News[] } });
const setClub = (world: World, clubId: string, f: (c: Club) => Club): World => ({ ...world, clubs: world.clubs.map((c) => (c.id === clubId ? f(c) : c)) });

/** Saison, ab der ein neuer Vertrag läuft (in der Sommerpause: die kommende) */
const startSeason = (world: World) => (world.offseason ? world.season + 1 : world.season);

/** Angebot annehmen: Vertrag ab jetzt bzw. ab der kommenden Saison */
export function acceptOffer(world: World, clubId: string, offerId: string): World {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const o = club.sponsors.offers.find((x) => x.id === offerId);
  if (!o) return world;
  const from = startSeason(world);
  const deal: SponsorDeal = {
    id: o.id.replace(/^so-/, 'sd-'), slot: o.slot, name: o.name, type: o.type, base: o.base, bonuses: o.bonuses,
    termine: o.termine, termineDone: 0, untilSeason: from + o.years - 1, satisfaction: 65, relegationExit: o.relegationExit,
  };
  const w = setClub(world, clubId, (c) => ({
    ...c,
    sponsors: {
      ...c.sponsors,
      // bisheriger Vertrag dieser Fläche endet mit der laufenden Saison
      deals: [...c.sponsors.deals.filter((d) => !(d.slot === o.slot && d.untilSeason >= from)), deal],
      offers: c.sponsors.offers.filter((x) => x.slot !== o.slot),
    },
  }));
  return club.controller.type === 'human' ? news(w, `${SLOT[o.slot].label}: ${o.name} unterschreibt (${(o.base / 1000).toLocaleString('de-DE')} T€ pro Saison, ${o.years} ${o.years === 1 ? 'Saison' : 'Saisons'}).`) : w;
}

export function rejectOffer(world: World, clubId: string, offerId: string): World {
  return setClub(world, clubId, (c) => ({ ...c, sponsors: { ...c.sponsors, offers: c.sponsors.offers.filter((x) => x.id !== offerId) } }));
}

/**
 * Nachverhandeln: Forderung nach Grundbetrag und Zahl der Pflichttermine.
 * Liegt die Forderung im Rahmen der (verdeckten) Schmerzgrenze, sagt der Partner zu. Sonst macht er ein Gegenangebot
 * auf halbem Weg – oder steigt aus, je gieriger die Forderung und je ungeduldiger der Partner. Nach der 3. Runde ist Schluss.
 */
export function negotiateOffer(world: World, clubId: string, offerId: string, ask: { base: number; termine: number }): { world: World; result: 'accepted' | 'counter' | 'final' | 'walked' } {
  const club = world.clubs.find((c) => c.id === clubId)!;
  const o = club.sponsors.offers.find((x) => x.id === offerId);
  if (!o || o.round >= SPON.MAX_ROUNDS) return { world, result: 'final' };
  const gm = businessManager(world, clubId);
  const limit = o.limit * (1 + (gm ? gm.skill * 0.004 : 0));
  const termCost = Math.max(0, o.termine - ask.termine) * SPON.TERMIN_VALUE * o.base - Math.max(0, ask.termine - o.termine) * SPON.TERMIN_VALUE * o.base * 0.5;
  const effective = ask.base + termCost;
  const round = o.round + 1;
  const replace = (patch: Partial<SponsorOffer>) => setClub(world, clubId, (c) => ({ ...c, sponsors: { ...c.sponsors, offers: c.sponsors.offers.map((x) => (x.id === offerId ? { ...x, ...patch } : x)) } }));
  if (effective <= limit) {
    const w = replace({ base: k1(ask.base), termine: ask.termine, round, reply: 'Einverstanden – so machen wir es.' });
    return { world: acceptOffer(w, clubId, offerId), result: 'accepted' };
  }
  const greed = effective / limit - 1;
  const walk = clamp(greed * 2.5 * (1.2 - TYPE[o.type].patience) + (round - 1) * 0.08, 0, 0.9);
  if (hash01(`${world.seed}:${o.id}:runde${round}`) < walk) {
    const w = rejectOffer(world, clubId, offerId);
    return { world: news(w, `${o.name} bricht die Verhandlungen ab – die Forderung war zu hoch.`), result: 'walked' };
  }
  // Gegenangebot: halber Weg zur Schmerzgrenze, ein Pflichttermin Entgegenkommen pro Runde
  const termine = ask.termine < o.termine ? o.termine - 1 : o.termine;
  const base = k1(Math.min(limit - Math.max(0, o.termine - termine) * SPON.TERMIN_VALUE * o.base, o.base + (limit - o.base) * 0.5));
  const final = round >= SPON.MAX_ROUNDS;
  return {
    world: replace({ base: Math.max(o.base, base), termine, round, reply: final ? `Unser letztes Wort: ${(Math.max(o.base, base) / 1000).toLocaleString('de-DE')} T€ bei ${termine} Terminen.` : `Wir kommen Ihnen entgegen: ${(Math.max(o.base, base) / 1000).toLocaleString('de-DE')} T€ bei ${termine} Terminen.` }),
    result: final ? 'final' : 'counter',
  };
}

/** Geschäftsführer bzw. KI entscheidet: bestes Angebot je Fläche nach Leitlinie, mit Verhandlungsgeschick */
export function autoDecide(world: World, clubId: string, by: 'gm' | 'ai' | 'board'): World {
  let w = world;
  const club = w.clubs.find((c) => c.id === clubId)!;
  const strategy = by === 'ai' ? 'balanced' : by === 'board' ? 'safe' : club.sponsors.strategy;
  const gm = businessManager(w, clubId);
  const slots = [...new Set(club.sponsors.offers.map((o) => o.slot))];
  for (const slot of slots) {
    const c = w.clubs.find((x) => x.id === clubId)!;
    const best = c.sponsors.offers.filter((o) => o.slot === slot).sort((a, b) => offerValue(b, strategy) - offerValue(a, strategy))[0];
    if (!best) continue;
    // Verhandlungsgeschick: ein Teil des Spielraums bis zur Schmerzgrenze
    const share = by === 'gm' && gm ? 0.15 + gm.skill * 0.03 : by === 'ai' ? 0.25 : 0;
    const base = k1(best.base + (best.limit - best.base) * share);
    w = setClub(w, clubId, (x) => ({ ...x, sponsors: { ...x.sponsors, offers: x.sponsors.offers.map((o) => (o.id === best.id ? { ...o, base } : o)) } }));
    w = acceptOffer(w, clubId, best.id);
    if (by !== 'ai') w = news(w, `${by === 'gm' ? 'Der Geschäftsführer' : 'Der Vorstand'} hat ${best.name} als ${SLOT[slot].label} unterschrieben.`);
  }
  return w;
}

// ---------- Saisonablauf ----------

/** Fehlende Verträge anlegen (neue Welt, alte Spielstände): alle Flächen belegt, Laufzeiten gestaffelt */
export function ensureSponsors(world: World): World {
  if (world.clubs.every((c) => c.sponsors.deals.length)) return world;
  return {
    ...world,
    clubs: world.clubs.map((c) => {
      if (c.sponsors.deals.length || !c.finances.sponsorIncome) return c;
      const deals: SponsorDeal[] = [];
      SLOT_ORDER.forEach((slot, i) => {
        const key = `${world.seed}:${c.id}:start:${slot}`;
        const base = { ...c, mood: { fans: 50, sponsors: 50 }, sponsors: { ...c.sponsors, deals } };
        const o = makeOffer({ ...world, archive: [] }, base, slot, key, 1 / attractiveness({ ...world, archive: [] }, base));
        deals.push({ id: `sd-${c.id}-${slot}-${world.season}`, slot, name: o.name, type: o.type, base: o.base, bonuses: o.bonuses, termine: o.termine, termineDone: 0, untilSeason: world.season + Math.floor(hash01(`${key}:${i}:dauer`) * 3), satisfaction: 60, relegationExit: o.relegationExit });
      });
      return { ...c, sponsors: { ...c.sponsors, deals } };
    }),
  };
}

/** Pflichttermin erledigt (Business-Spieltag, Werbedreh): dem Partner mit dem größten Rückstand gutschreiben */
export function creditSponsorTermin(world: World, clubId: string): World {
  return setClub(world, clubId, (c) => {
    const open = activeDeals(c, world.season).filter((d) => d.termine > d.termineDone).sort((a, b) => b.termine - b.termineDone - (a.termine - a.termineDone) || b.base - a.base)[0];
    if (!open) return c;
    return { ...c, sponsors: { ...c.sponsors, deals: c.sponsors.deals.map((d) => (d.id === open.id ? { ...d, termineDone: d.termineDone + 1, satisfaction: clamp(d.satisfaction + 3, 0, 100) } : d)) } };
  });
}

/** Offene Pflichttermine der laufenden Saison */
export const openSponsorTermine = (club: Club, season: number) => activeDeals(club, season).reduce((s, d) => s + Math.max(0, d.termine - d.termineDone), 0);

/** Zielwert der Zufriedenheit je Partner-Typ */
function satisfactionTarget(world: World, club: Club, d: SponsorDeal, place: number | null, expected: number | null): number {
  let t = club.mood.sponsors;
  const fill = club.finances.attendance.length ? club.finances.attendance.reduce((a, b) => a + b, 0) / club.finances.attendance.length / club.arena.capacity : 0.75;
  const scandals = club.events.log.filter((l) => ['feiern', 'pyro', 'streit', 'protest'].includes(l.defId) && daysBetween(l.date, world.date) <= 60).length;
  switch (d.type) {
    case 'konzern': t += place && expected ? (expected - place) * 3 : 0; break;
    case 'brauerei': t += (fill - 0.75) * 80; break;
    case 'mittelstand': t += 8 + (club.mood.fans - 50) * 0.2; break;
    case 'bank': t -= scandals * 7; break;
    case 'autohaus': t += d.termineDone * 4; break;
    case 'startup': t += (club.mood.fans - 50) * 0.3; break;
  }
  return clamp(t, 0, 100);
}

/**
 * Monatlich: Zufriedenheit, Ausstiege, Insolvenzen, neue Angebote für freie Flächen, abgelaufene Angebote.
 * `place`/`expected` liefern Tabellenplatz und Zielplatz (aus der Wirtschaft).
 */
export function sponsorMonth(world: World, month: string, place: (clubId: string) => number | null, expected: (c: Club) => number | null): World {
  let w = world;
  const msgs: string[] = [];
  const season = world.season;
  for (const c0 of world.clubs) {
    if (!c0.sponsors.deals.length) continue;
    let c = c0;
    const deals: SponsorDeal[] = [];
    for (const d of c.sponsors.deals) {
      if (d.untilSeason < season) { deals.push(d); continue; }
      const sat = clamp(d.satisfaction + (satisfactionTarget(w, c, d, place(c.id), expected(c)) - d.satisfaction) * 0.3, 0, 100);
      if (d.type === 'startup' && hash01(`${world.seed}:${d.id}:${month}:pleite`) < SPON.STARTUP_BANKRUPT) {
        if (c.controller.type === 'human') msgs.push(`${d.name} ist insolvent – die Fläche „${SLOT[d.slot].label}“ ist frei.`);
        continue;
      }
      if (sat < SPON.QUIT_BELOW && d.slot !== 'business') {
        if (c.controller.type === 'human') msgs.push(`${d.name} kündigt den Vertrag als ${SLOT[d.slot].label} – die Unzufriedenheit war zu groß.`);
        continue;
      }
      deals.push({ ...d, satisfaction: Math.round(sat * 10) / 10 });
    }
    // abgelaufene Angebote entfernen
    let offers = c.sponsors.offers.filter((o) => o.until >= world.date);
    c = { ...c, sponsors: { ...c.sponsors, deals, offers } };
    // freie Flächen während der Saison: gelegentlich ein (schwächeres) Angebot
    if (!world.offseason) {
      for (const slot of SLOT_ORDER) {
        if (dealOf(c, slot, season) || offers.some((o) => o.slot === slot)) continue;
        if (hash01(`${world.seed}:${c.id}:${month}:${slot}:angebot`) >= SPON.MIDSEASON_OFFER) continue;
        offers = [...offers, makeOffer(w, { ...c, sponsors: { ...c.sponsors, offers } }, slot, `${c.id}-${month}-${slot}`, SPON.MIDSEASON_VALUE)];
      }
      c = { ...c, sponsors: { ...c.sponsors, offers } };
    }
    w = setClub(w, c.id, () => c);
    if (c.controller.type === 'ai' && offers.length) w = autoDecide(w, c.id, 'ai');
    else if (c.controller.type === 'human' && c.sponsors.delegate && businessManager(w, c.id) && offers.length) w = autoDecide(w, c.id, 'gm');
  }
  for (const m of msgs) w = news(w, m);
  return w;
}

/** Saisonende: Boni auswerten, fehlende Pflichttermine kosten Zufriedenheit. Gibt die Boni je Verein zurück. */
export function sponsorSeasonEnd(world: World, reached: (clubId: string, round: string) => boolean): { world: World; bonus: Map<string, number> } {
  const comp = world.competition!;
  const bonus = new Map<string, number>();
  const clubs = world.clubs.map((c) => {
    if (!c.sponsors.deals.length) return c;
    const regPlace = (comp.finalStandings ?? []).indexOf(c.id) + 1;
    const fill = c.finances.attendance.length ? c.finances.attendance.reduce((a, b) => a + b, 0) / c.finances.attendance.length / c.arena.capacity : 0;
    const playoffs = reached(c.id, 'Viertelfinale') || reached(c.id, 'Halbfinale') || reached(c.id, 'Finale');
    let sum = 0;
    const deals = c.sponsors.deals.map((d) => {
      if (d.untilSeason < world.season) return d;
      for (const b of d.bonuses) {
        const ok = b.kind === 'playoffs' ? playoffs
          : b.kind === 'semifinal' ? reached(c.id, 'Halbfinale') || reached(c.id, 'Finale')
          : b.kind === 'title' ? comp.champion === c.id
          : b.kind === 'top6' ? regPlace > 0 && regPlace <= 6
          : fill >= (b.threshold ?? 1);
        if (ok) sum += b.amount;
      }
      const missed = Math.max(0, d.termine - d.termineDone);
      return { ...d, satisfaction: clamp(d.satisfaction - missed * SPON.MISSED_TERMIN, 0, 100), termineDone: 0 };
    });
    bonus.set(c.id, sum);
    return { ...c, sponsors: { ...c.sponsors, deals, paidBonus: sum } };
  });
  return { world: { ...world, clubs }, bonus };
}

/** Sommerpause (Vertragsgespräche): Angebote für auslaufende und freie Flächen; KI unterschreibt sofort */
export function sponsorSummer(world: World): World {
  let w = world;
  const next = world.season + 1;
  const rel = world.competition?.relegated;
  if (rel) w = sponsorRelegation(w, rel);
  for (const c of w.clubs) {
    if (!c.sponsors.deals.length) continue;
    const offers: SponsorOffer[] = [];
    for (const slot of SLOT_ORDER) {
      if (dealOf(c, slot, next)) continue;
      const old = c.sponsors.deals.find((d) => d.slot === slot && d.untilSeason === world.season);
      // Verlängerung vom bisherigen Partner, wenn er zufrieden war
      if (old && old.satisfaction >= 40) {
        const o = makeOffer(w, { ...c, sponsors: { ...c.sponsors, offers } }, slot, `${c.id}-${next}-${slot}-alt`, 0.8 + old.satisfaction / 250, old.type);
        offers.push({ ...o, name: old.name, reply: `Verlängerungsangebot des bisherigen Partners (Zufriedenheit ${Math.round(old.satisfaction)}).` });
      }
      const n = slot === 'main' || slot === 'naming' ? 3 : 2;
      for (let i = 0; i < n; i++) offers.push(makeOffer(w, { ...c, sponsors: { ...c.sponsors, offers } }, slot, `${c.id}-${next}-${slot}-${i}`));
    }
    const until = addDays(world.date, 80);
    w = setClub(w, c.id, (x) => ({ ...x, sponsors: { ...x.sponsors, offers: offers.map((o) => ({ ...o, until })) } }));
    if (c.controller.type === 'ai') w = autoDecide(w, c.id, 'ai');
    else if (c.sponsors.delegate && businessManager(w, c.id)) w = autoDecide(w, c.id, 'gm');
  }
  return w;
}

/**
 * Saisonwechsel (vor dem Jahreswechsel aufrufen): offene Flächen mit Angeboten unterschreibt der Vorstand bzw. der Geschäftsführer,
 * Absteiger verlieren Partner mit Ausstiegsklausel, abgelaufene Verträge werden entfernt.
 */
export function sponsorKickoff(world: World): World {
  let w = world;
  const rel = world.competition?.relegated;
  if (rel) w = sponsorRelegation(w, rel);
  for (const c of w.clubs) {
    if (!c.sponsors.deals.length) continue;
    // Was bis jetzt leer ist, bekommt eine Notlösung zu schlechteren Konditionen
    const offers = [...c.sponsors.offers];
    for (const slot of SLOT_ORDER) {
      if (dealOf(c, slot, w.season + 1) || offers.some((o) => o.slot === slot)) continue;
      offers.push(makeOffer(w, { ...c, sponsors: { ...c.sponsors, offers } }, slot, `${c.id}-${w.season + 1}-${slot}-not`, SPON.MIDSEASON_VALUE));
    }
    w = setClub(w, c.id, (x) => ({ ...x, sponsors: { ...x.sponsors, offers } }));
    if (!offers.length) continue;
    w = autoDecide(w, c.id, c.controller.type === 'ai' ? 'ai' : c.sponsors.delegate && businessManager(w, c.id) ? 'gm' : 'board');
  }
  return {
    ...w,
    clubs: w.clubs.map((c) => ({ ...c, sponsors: { ...c.sponsors, deals: c.sponsors.deals.filter((d) => d.untilSeason > w.season), offers: [], paidBonus: 0 } })),
  };
}

/** Abstieg: Partner mit Ausstiegsklausel steigen aus */
export function sponsorRelegation(world: World, clubId: string): World {
  return setClub(world, clubId, (c) => ({ ...c, sponsors: { ...c.sponsors, deals: c.sponsors.deals.filter((d) => !d.relegationExit) } }));
}

export const BONUS_LABEL: Record<SponsorBonus['kind'], string> = {
  playoffs: 'Playoffs erreicht', semifinal: 'Halbfinale erreicht', title: 'Meisterschaft', top6: 'Hauptrunde unter den ersten 6', attendance: 'Zuschauerschnitt',
};
