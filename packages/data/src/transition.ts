import type { World, Player, News, Position } from '@ehm/schema';
import { makeContract, EMPTY_MARKET } from '@ehm/schema';
import {
  Rng, overall, toDisplay, ageOn, beginSeason, refreshLineup, standardTerms, contractCost, TARGET,
  regionOf,
} from '@ehm/core';
import { WorldGenerator } from './generator.ts';
import { IMPORT_ORIGINS } from './names.ts';

const group = (pos: Position) => (pos === 'G' ? 'G' : pos === 'LD' || pos === 'RD' ? 'D' : 'F');
const isImport = (p: Player) => !p.nationalities.includes('DE');

/**
 * Saisonwechsel für Verträge und Kader:
 * Vorverträge treten in Kraft, auslaufende Verträge enden, Klauseln greifen,
 * neue vereinslose Spieler kommen auf den Markt, KI-Vereine füllen ihre Kader auf.
 * (Altern und Spielerentwicklung folgen in Meilenstein 7.)
 */
export function seasonTransition(world: World): World {
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
    // Ruhestand: ältere Vereinslose
    const age = ageOn(p.birthDate, `${next}-08-01`);
    if (!contract && (age >= 35 || (age >= 32 && toDisplay(overall(p)) <= 8))) continue;
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
  const free = players.filter((p) => !p.contract).sort((a, b) => overall(b) - overall(a));
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
        if (isHuman) {
          // Nachwuchsspieler hochziehen, damit eine Aufstellung möglich bleibt
          const pos: Position = g === 'G' ? 'G' : g === 'D' ? (rng.chance(0.5) ? 'LD' : 'RD') : rng.pick(['C', 'LW', 'RW'] as Position[]);
          const p = gen.generatePlayer({ position: pos, quality: 78 + rng.normal(0, 5), age: rng.int(18, 20), nationality: 'DE', clubId: club.id, role: 'prospect' });
          p.contract = makeContract({ clubId: club.id, salary: 18_000, untilSeason: next + 1, role: 'prospect' });
          w = { ...w, players: [...w.players, p] };
          w.market.news.unshift({ date, text: `${p.firstName} ${p.lastName} (${pos}) wird aus dem Nachwuchs hochgezogen, um den Kader aufzufüllen.`, kind: 'info', mine: true });
        } else {
          const imports = roster().filter(isImport).length;
          const free = w.players
            .filter((p) => !p.contract && group(p.position) === g && (!isImport(p) || imports < rules.importSlotsRoster))
            .sort((a, b) => overall(b) - overall(a));
          const pick = free[Math.min(free.length - 1, rng.int(0, 2))];
          if (!pick) break;
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

  return beginSeason(w, w.seed + next);
}

function forceLineup(world: World, clubId: string): World {
  // menschlicher Verein: Aufstellung neu bauen (refreshLineup lässt gültige Pläne unangetastet)
  const tmp = { ...world, clubs: world.clubs.map((c) => (c.id === clubId ? { ...c, controller: { type: 'ai' as const } } : c)) };
  const rebuilt = refreshLineup(tmp, clubId);
  return { ...rebuilt, clubs: rebuilt.clubs.map((c) => (c.id === clubId ? { ...c, controller: world.clubs.find((x) => x.id === clubId)!.controller } : c)) };
}
