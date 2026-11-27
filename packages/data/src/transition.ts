import type { World, Player, News, Position } from '@ehm/schema';
import { makeContract, EMPTY_MARKET } from '@ehm/schema';
import {
  Rng, overall, toDisplay, ageOn, beginSeason, seedChemistry, refreshLineup, standardTerms, contractCost, TARGET,
  regionOf, archiveSeason,
} from '@ehm/core';
import { WorldGenerator } from './generator.ts';
import { IMPORT_ORIGINS } from './names.ts';

const group = (pos: Position) => (pos === 'G' ? 'G' : pos === 'LD' || pos === 'RD' ? 'D' : 'F');
const isImport = (p: Player) => !p.nationalities.includes('DE');

/**
 * Saisonwechsel für Verträge und Kader:
 * Vorverträge treten in Kraft, auslaufende Verträge enden, Klauseln greifen,
 * neue vereinslose Spieler kommen auf den Markt, KI-Vereine füllen ihre Kader auf.
 * Die Spielerentwicklung selbst passiert vorher im Sommerschritt (Sommerpause, Phase „Sommertraining“).
 */
export function seasonTransition(input: World): World {
  // Abgeschlossene Saison archivieren (Tabelle, Teamstatistik, Spielerkarrieren)
  const world = archiveSeason(input);
  const old = world.season;
  const next = old + 1;
  const comp = world.competition!;
  const rng = new Rng(`${world.seed}:wechsel:${old}`);
  const gen = new WorldGenerator({ seed: world.seed + old * 7919, season: next, idPrefix: `s${next}-` });
  const human = new Set(world.clubs.filter((c) => c.controller.type === 'human').map((c) => c.id));
  const clubName = new Map(world.clubs.map((c) => [c.id, c.name]));
  const news: News[] = [];
  const date = `${next}-07-15`;
  const say = (text: string, mine: boolean) => news.push({ date, text, kind: 'info', mine });

  // Playoff-Versprechen bewerten
  const place = (id: string) => (comp.finalStandings?.indexOf(id) ?? 99) + 1;

  let players: Player[] = [];
  for (const p0 of world.players) {
    let p = p0;
    let contract = p.contract;
    let nextContract = p.nextContract;
    const mine = !!contract && human.has(contract.clubId);
    if (contract?.promises.some((x) => x.type === 'playoffs') && place(contract.clubId) > 10) {
      p = { ...p, condition: { ...p.condition, morale: Math.max(5, p.condition.morale - 15) } };
      contract = { ...contract, promises: contract.promises.map((x) => (x.type === 'playoffs' ? { ...x, status: 'broken' as const } : x)) };
      if (mine) say(`Versprechen gebrochen: Playoffs verpasst – ${p.firstName} ${p.lastName} ist enttäuscht.`, true);
    }
    // Abstiegsklausel
    if (contract && comp.relegated === contract.clubId && contract.clauses.relegation && contract.untilSeason > old) {
      if (mine) say(`${p.firstName} ${p.lastName} nutzt die Abstiegsklausel und ist vereinslos.`, true);
      contract = null;
    }
    // Ausstiegsklausel: Angebot aus einer stärkeren Liga
    if (contract && !nextContract && contract.clauses.exit && contract.untilSeason > old && toDisplay(overall(p)) >= 13 && rng.chance(0.35)) {
      say(`${p.firstName} ${p.lastName} zieht die Ausstiegsklausel und wechselt in eine stärkere Liga (${clubName.get(contract.clubId)}).`, mine);
      continue;
    }
    if (contract && contract.untilSeason <= old) {
      if (!nextContract && mine) say(`Vertrag von ${p.firstName} ${p.lastName} ist ausgelaufen.`, true);
      contract = null;
    }
    if (nextContract) {
      if (p.contract && p.contract.clubId !== nextContract.clubId && human.has(nextContract.clubId)) say(`Neuzugang: ${p.firstName} ${p.lastName} ist jetzt bei euch.`, true);
      contract = nextContract;
      nextContract = null;
    }
    // Karriereende: ältere Vereinslose, mit zunehmendem Alter auch Spieler mit Vertrag
    const age = ageOn(p.birthDate, `${next}-08-01`);
    const retireChance = contract
      ? (age >= 38 ? 1 : age >= 36 ? 0.25 : 0)
      : (age >= 35 ? 1 : age >= 34 ? 0.6 : age >= 33 ? 0.35 : age >= 31 && toDisplay(overall(p)) <= 8 ? 0.7 : 0);
    if (retireChance > 0 && rng.chance(retireChance)) {
      const wasMine = human.has(p0.contract?.clubId ?? '') || (!!contract && human.has(contract.clubId));
      if (wasMine) say(`${p.firstName} ${p.lastName} beendet mit ${age} Jahren seine Karriere.`, true);
      continue;
    }
    players.push({ ...p, contract, nextContract });
  }

  // Neue Vereinslose (Rückkehrer, Ausland, Nachwuchs anderer Ligen)
  const positions: Position[] = ['C', 'LW', 'RW', 'LD', 'RD', 'G'];
  const fresh: Player[] = [];
  for (let i = 0; i < 36; i++) {
    const pos = rng.weighted(positions, [3, 3, 3, 3, 3, 1.2]);
    const imp = rng.chance(0.45);
    const nat = imp ? rng.weighted(IMPORT_ORIGINS.map((o) => o[0]), IMPORT_ORIGINS.map((o) => o[1])) : 'DE';
    fresh.push(gen.generatePlayer({ position: pos, quality: rng.normal(imp ? 98 : 88, 8), age: rng.int(19, 32), nationality: nat, clubId: null }));
  }
  players = [...players, ...fresh];
  // Markt nicht überlaufen lassen: schwächste Vereinslose wechseln in tiefere Ligen
  // Wert für den Markt: junge Spieler zählen mit ihrem Potenzial
  const marketValue = (p: Player) => overall(p) + (ageOn(p.birthDate, `${next}-08-01`) <= 21 ? Math.max(0, p.hidden.potential - overall(p)) * 0.6 : 0);
  const free = players.filter((p) => !p.contract && !p.nextContract).sort((a, b) => marketValue(b) - marketValue(a));
  if (free.length > 90) {
    const drop = new Set(free.slice(90).map((p) => p.id));
    players = players.filter((p) => !drop.has(p.id));
  }

  let w: World = { ...world, season: next, date: `${next}-08-01`, players, market: { ...structuredClone(EMPTY_MARKET), news: [...news, ...world.market.news].slice(0, 120), credibility: world.market.credibility } };

  // Kader auffüllen
  const rules = w.countries[0].rules;
  for (const club of w.clubs) {
    const roster = () => w.players.filter((p) => p.contract?.clubId === club.id);
    const isHuman = human.has(club.id);
    const target = isHuman ? { F: 12, D: 6, G: 2 } : TARGET;
    for (const g of ['G', 'D', 'F'] as const) {
      let missing = target[g] - roster().filter((p) => group(p.position) === g).length;
      while (missing > 0) {
        const imports = roster().filter(isImport).length;
        const free = isHuman ? [] : w.players
          .filter((p) => !p.contract && !p.nextContract && group(p.position) === g && (!isImport(p) || imports < rules.importSlotsRoster))
          .sort((a, b) => overall(b) - overall(a));
        if (isHuman || !free.length) {
          // Nachwuchsspieler hochziehen, damit eine Aufstellung möglich bleibt (KI nur, wenn der Markt leer ist)
          const pos: Position = g === 'G' ? 'G' : g === 'D' ? (rng.chance(0.5) ? 'LD' : 'RD') : rng.pick(['C', 'LW', 'RW'] as Position[]);
          const p = gen.generatePlayer({ position: pos, quality: 78 + rng.normal(0, 5), age: rng.int(18, 20), nationality: 'DE', clubId: club.id, role: 'prospect' });
          p.contract = makeContract({ clubId: club.id, salary: 18_000, untilSeason: next + 1, role: 'prospect' });
          w = { ...w, players: [...w.players, p] };
          if (isHuman) w.market.news.unshift({ date, text: `${p.firstName} ${p.lastName} (${pos}) wird aus dem Nachwuchs hochgezogen, um den Kader aufzufüllen.`, kind: 'info', mine: true });
        } else {
          const pick = free[Math.min(free.length - 1, rng.int(0, 2))];
          const terms = standardTerms(w, pick, club, 1);
          const contract = makeContract({ clubId: club.id, salary: terms.salary, untilSeason: next + terms.years - 1, role: terms.role, perks: terms.perks, clauses: terms.clauses, fromSeason: next });
          w = { ...w, players: w.players.map((p) => (p.id === pick.id ? { ...p, contract } : p)) };
          void contractCost;
        }
        missing--;
      }
    }
    w = refreshLineup(w, club.id);
    if (isHuman) {
      const plan = w.clubs.find((c) => c.id === club.id)!.matchplan;
      const ids = new Set(roster().map((p) => p.id));
      if (plan && ![...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies].every((id) => ids.has(id))) {
        w = forceLineup(w, club.id);
        w.market.news.unshift({ date, text: 'Die Aufstellung wurde an den neuen Kader angepasst – bitte prüfen.', kind: 'info', mine: true });
      }
    }
  }

  // Scouting: neue Spieler erfassen
  const scouting = { ...w.scouting };
  for (const [clubId, st] of Object.entries(scouting)) {
    const knowledge = { ...st.knowledge };
    for (const p of w.players) {
      if (p.contract?.clubId === clubId) knowledge[p.id] = 400;
      else if (knowledge[p.id] === undefined) knowledge[p.id] = regionOf(p) === 'DE' ? 120 : 40;
    }
    scouting[clubId] = { ...st, knowledge, watch: st.watch.filter((id) => w.players.some((p) => p.id === id)) };
  }
  w = { ...w, scouting };

  // Sommerpause: Moral pendelt sich ein, neue Reihen bekommen Vorbereitungs-Chemie
  w = { ...w, players: w.players.map((p) => ({ ...p, condition: { ...p.condition, morale: Math.round((p.condition.morale + 60) / 2) } })) };
  const seedRng = new Rng(w.seed + next * 7);
  w = seedChemistry(w, () => seedRng.next());
  return { ...beginSeason(w, w.seed + next), offseason: null };
}

function forceLineup(world: World, clubId: string): World {
  // menschlicher Verein: Aufstellung neu bauen (refreshLineup lässt gültige Pläne unangetastet)
  const tmp = { ...world, clubs: world.clubs.map((c) => (c.id === clubId ? { ...c, controller: { type: 'ai' as const } } : c)) };
  const rebuilt = refreshLineup(tmp, clubId);
  return { ...rebuilt, clubs: rebuilt.clubs.map((c) => (c.id === clubId ? { ...c, controller: world.clubs.find((x) => x.id === clubId)!.controller } : c)) };
}
