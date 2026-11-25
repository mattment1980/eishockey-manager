import { writeFileSync } from 'node:fs';
import type { World, Club, Player } from '@ehm/schema';
import {
  simulateMatch, roundRobinSchedule, teamStrength, overall, toDisplay, Rng, playDays, regularTable, INCOME, EXPENSE, payrollOf,
  type MatchResult, type TeamInput,
} from '@ehm/core';
import { generateWorld, exportWorldJson, seasonTransition } from '@ehm/data';

const [cmd = 'help', ...args] = process.argv.slice(2);
const num = (i: number, d: number) => (args[i] !== undefined ? Number(args[i]) : d);

function playersOf(world: World, clubId: string): Player[] {
  return world.players.filter((p) => p.contract?.clubId === clubId);
}

function teamInput(world: World, club: Club): TeamInput {
  return { clubId: club.id, name: club.name, shortName: club.shortName, plan: club.matchplan!, players: playersOf(world, club.id) };
}

function strengthOf(world: World, club: Club): number {
  const byId = new Map(playersOf(world, club.id).map((p) => [p.id, p]));
  return teamStrength(club.matchplan!, byId);
}

const fmt = (x: number, d = 2) => x.toFixed(d).replace('.', ',');
const pct = (x: number, d = 1) => `${fmt(x * 100, d)} %`;
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);
const mmss = (sec: number) => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------------------------------------------------------------- generate
function cmdGenerate() {
  const seed = num(0, 2026);
  const out = args[1] ?? `welt-${seed}.json`;
  const world = generateWorld(seed);
  writeFileSync(out, exportWorldJson(world));
  console.log(`Welt erzeugt: ${world.clubs.length} Vereine, ${world.players.length} Spieler, ${world.staff.length} Staff → ${out}\n`);
  console.log(`${pad('Verein', 30)} ${pad('Profil', 12)} ${lpad('Stärke', 7)} ${lpad('Etat', 12)}  Kader`);
  for (const c of [...world.clubs].sort((a, b) => strengthOf(world, b) - strengthOf(world, a))) {
    console.log(`${pad(c.name, 30)} ${pad(c.profile, 12)} ${lpad(fmt(strengthOf(world, c) / 10, 1), 7)} ${lpad((c.finances.budget / 1e6).toFixed(1) + ' Mio', 12)}  ${playersOf(world, c.id).length}`);
  }
}

// ---------------------------------------------------------------- match
function cmdMatch() {
  const seed = num(0, 1);
  const world = generateWorld(num(1, 2026));
  const rng = new Rng(seed);
  const [h, a] = rng.shuffle([...world.clubs]).slice(0, 2);
  const res = simulateMatch({ home: teamInput(world, h), away: teamInput(world, a), seed, phase: 'regular', format: world.leagues[0].format });
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const nm = (id: string) => { const p = byId.get(id)!; return `${p.firstName} ${p.lastName}`; };

  console.log(`\n=== ${h.name} – ${a.name} ===\n`);
  let lastPeriod = 0;
  for (const t of res.ticker) {
    if (t.period !== lastPeriod) { console.log(''); lastPeriod = t.period; }
    const mark = t.type === 'goal' ? '🚨' : t.type === 'penalty' ? '⏱ ' : t.type === 'save' ? '🧤' : t.type === 'shootout' ? '🎯' : '  ';
    console.log(`${t.clock}  ${mark} ${t.text}`);
  }
  const suffix = res.decidedIn === 'OT' ? ' n.V.' : res.decidedIn === 'SO' ? ' n.P.' : '';
  console.log(`\nEndstand: ${h.shortName} ${res.score[0]}:${res.score[1]} ${a.shortName}${suffix}  (${res.periodScores.map((p) => p.join(':')).join(', ')})\n`);
  printTeamStats(res, [h.shortName, a.shortName]);
  for (const side of [0, 1] as const) {
    const club = side === 0 ? h : a;
    console.log(`\n--- ${club.name}: Reihen (5-gegen-5) ---`);
    console.log(`${pad('Einheit', 10)} ${lpad('Eiszeit', 8)} ${lpad('Corsi', 8)} ${lpad('xG', 10)} ${lpad('Tore', 6)}`);
    res.lineStats[side].lines.forEach((u, i) => console.log(`${pad(`Reihe ${i + 1}`, 10)} ${lpad(mmss(u.toi), 8)} ${lpad(`${u.corsiFor}:${u.corsiAgainst}`, 8)} ${lpad(`${fmt(u.xgFor)}:${fmt(u.xgAgainst)}`, 10)} ${lpad(`${u.goalsFor}:${u.goalsAgainst}`, 6)}`));
    res.lineStats[side].pairs.forEach((u, i) => console.log(`${pad(`Paar ${i + 1}`, 10)} ${lpad(mmss(u.toi), 8)} ${lpad(`${u.corsiFor}:${u.corsiAgainst}`, 8)} ${lpad(`${fmt(u.xgFor)}:${fmt(u.xgAgainst)}`, 10)} ${lpad(`${u.goalsFor}:${u.goalsAgainst}`, 6)}`));
    console.log(`\n${pad('Spieler', 24)} Pos  T  A  S/V   +/-  Eiszeit  Schüsse  xG    Bully`);
    const rows = res.playerStats.filter((s) => s.team === side && byId.get(s.playerId)!.position !== 'G')
      .sort((x, y) => y.goals + y.assists - (x.goals + x.assists) || y.toi - x.toi);
    for (const s of rows) {
      const p = byId.get(s.playerId)!;
      const fo = s.faceoffsWon + s.faceoffsLost ? `${s.faceoffsWon}/${s.faceoffsWon + s.faceoffsLost}` : '';
      console.log(`${pad(nm(s.playerId), 24)} ${pad(p.position, 4)} ${lpad(s.goals, 1)}  ${lpad(s.assists, 1)}  ${pad(`${s.shotsOnGoal}/${s.shotAttempts}`, 5)} ${lpad((s.plusMinus > 0 ? '+' : '') + s.plusMinus, 3)}  ${lpad(mmss(s.toi), 7)}  ${lpad(s.shotsOnGoal, 7)}  ${pad(fmt(s.xg), 5)} ${fo}`);
    }
    for (const s of res.playerStats.filter((s) => s.team === side && byId.get(s.playerId)!.position === 'G' && s.toi > 0)) {
      console.log(`Torhüter ${nm(s.playerId)}: ${s.saves}/${s.shotsAgainst} Paraden (${s.shotsAgainst ? pct(s.saves / s.shotsAgainst) : '–'})`);
    }
  }
}

function printTeamStats(res: MatchResult, names: [string, string]) {
  const [a, b] = res.teamStats;
  const row = (label: string, x: string | number, y: string | number) => console.log(`${pad(label, 30)} ${lpad(x, 10)} ${lpad(y, 10)}`);
  console.log(`${pad('Mannschaftsstatistik', 30)} ${lpad(names[0], 10)} ${lpad(names[1], 10)}`);
  row('Tore', a.goals, b.goals);
  row('Schüsse aufs Tor', a.shotsOnGoal, b.shotsOnGoal);
  row('Schussversuche (Corsi)', a.shotAttempts, b.shotAttempts);
  row('Expected Goals (xG)', fmt(a.xg), fmt(b.xg));
  row('Geblockte eigene Schüsse', a.shotsBlocked, b.shotsBlocked);
  row('Überzahl', `${a.powerPlayGoals}/${a.powerPlays}`, `${b.powerPlayGoals}/${b.powerPlays}`);
  row('Strafminuten', a.pim, b.pim);
  const foT = a.faceoffsWon + b.faceoffsWon;
  row('Bullys gewonnen', `${a.faceoffsWon} (${pct(a.faceoffsWon / foT, 0)})`, `${b.faceoffsWon} (${pct(b.faceoffsWon / foT, 0)})`);
  row('Breakout sauber', `${pct(a.breakoutsClean / Math.max(1, a.breakouts), 0)} (${a.breakouts})`, `${pct(b.breakoutsClean / Math.max(1, b.breakouts), 0)} (${b.breakouts})`);
  row('Zoneneintritt kontrolliert', `${a.entriesControlledSuccess}/${a.entriesControlled}`, `${b.entriesControlledSuccess}/${b.entriesControlled}`);
  row('Dump-ins zurückerobert', `${a.dumpInsRecovered}/${a.dumpIns}`, `${b.dumpInsRecovered}/${b.dumpIns}`);
  row('Zeit in Angriffszone', mmss(a.ozoneTime), mmss(b.ozoneTime));
  row('Checks', a.hits, b.hits);
  row('Puckverluste / -gewinne', `${a.giveaways} / ${a.takeaways}`, `${b.giveaways} / ${b.takeaways}`);
}

// ---------------------------------------------------------------- calibrate
interface Agg {
  games: number; goals: number; sog: number; att: number; blocked: number; missed: number; pp: number; ppg: number;
  pim: number; ot: number; so: number; homeWins: number; xg: number; hits: number; oneGoal: number;
  breakouts: number; breakoutsClean: number; ec: number; ecs: number; dumps: number; dumpsRec: number;
  lopsided: number;
  en: number;
}

function cmdCalibrate() {
  const seasons = num(0, 10);
  const world = generateWorld(num(1, 2026));
  const fmtL = world.leagues[0].format;
  const strength = new Map(world.clubs.map((c) => [c.id, strengthOf(world, c)]));
  const inputs = new Map(world.clubs.map((c) => [c.id, teamInput(world, c)]));
  const agg: Agg = { games: 0, goals: 0, sog: 0, att: 0, blocked: 0, missed: 0, pp: 0, ppg: 0, pim: 0, ot: 0, so: 0, homeWins: 0, xg: 0, hits: 0, oneGoal: 0, breakouts: 0, breakoutsClean: 0, ec: 0, ecs: 0, dumps: 0, dumpsRec: 0, lopsided: 0, en: 0 };
  const buckets = [
    { label: 'ausgeglichen (< 0,3)', max: 3, g: 0, favWins: 0 },
    { label: 'leichter Favorit (0,3–0,8)', max: 8, g: 0, favWins: 0 },
    { label: 'Favorit (0,8–1,5)', max: 15, g: 0, favWins: 0 },
    { label: 'klarer Favorit (> 1,5)', max: Infinity, g: 0, favWins: 0 },
  ];
  const rng = new Rng(99);
  const t0 = Date.now();
  for (let s = 0; s < seasons; s++) {
    for (const f of roundRobinSchedule(world.clubs.map((c) => c.id), fmtL.roundRobins, rng)) {
      const r = simulateMatch({ home: inputs.get(f.home)!, away: inputs.get(f.away)!, seed: rng.int(0, 2 ** 31), phase: 'regular', format: fmtL, keepEvents: false });
      agg.games++;
      for (const ts of r.teamStats) {
        agg.goals += ts.goals; agg.sog += ts.shotsOnGoal; agg.att += ts.shotAttempts; agg.blocked += ts.shotsBlocked;
        agg.missed += ts.shotsMissed; agg.pp += ts.powerPlays; agg.ppg += ts.powerPlayGoals; agg.pim += ts.pim; agg.xg += ts.xg; agg.hits += ts.hits;
        agg.breakouts += ts.breakouts; agg.breakoutsClean += ts.breakoutsClean; agg.ec += ts.entriesControlled; agg.ecs += ts.entriesControlledSuccess; agg.dumps += ts.dumpIns; agg.dumpsRec += ts.dumpInsRecovered;
      }
      if (r.shootout) { agg.goals -= 1; } // Penaltytor nicht als Spieltor zählen
      const [s0, s1] = [r.teamStats[0].shotAttempts, r.teamStats[1].shotAttempts];
      if (Math.max(s0, s1) > 2 * Math.min(s0, s1)) agg.lopsided++;
      agg.en += r.emptyNetGoals[0] + r.emptyNetGoals[1];
      if (r.decidedIn !== 'REG') agg.ot++;
      if (r.decidedIn === 'SO') agg.so++;
      if (r.score[0] > r.score[1]) agg.homeWins++;
      if (r.decidedIn === 'REG' && Math.abs(r.score[0] - r.score[1]) === 1) agg.oneGoal++;
      const diff = strength.get(f.home)! - strength.get(f.away)!;
      const b = buckets.find((x) => Math.abs(diff) < x.max)!;
      b.g++;
      const favHome = diff >= 0;
      if ((r.score[0] > r.score[1]) === favHome) b.favWins++;
    }
  }
  const ms = Date.now() - t0;
  const n = agg.games, tg = n * 2;
  console.log(`\nKalibrierung: ${n} Spiele (${seasons} Saisons à 52 Spieltage) in ${(ms / 1000).toFixed(1)} s (${fmt(ms / n, 2)} ms/Spiel)\n`);
  console.log(`${pad('Kennzahl (je Team und Spiel)', 36)} ${lpad('Engine', 10)}   Richtwert`);
  const line = (label: string, val: string, target: string) => console.log(`${pad(label, 36)} ${lpad(val, 10)}   ${target}`);
  line('Tore', fmt(agg.goals / tg), '2,8 – 3,3');
  line('Schüsse aufs Tor', fmt(agg.sog / tg, 1), '27 – 32');
  line('Schussversuche (Corsi)', fmt(agg.att / tg, 1), '50 – 60');
  line('davon geblockt', fmt(agg.blocked / tg, 1), '12 – 16');
  line('davon vorbei', fmt(agg.missed / tg, 1), '10 – 14');
  line('Fangquote', pct(1 - (agg.goals - agg.ppg * 0) / agg.sog), '90,5 – 91,5 %');
  line('xG', fmt(agg.xg / tg), '≈ Tore');
  line('Tore ins leere Tor (je Spiel)', fmt(agg.en / n), '0,3 – 0,5');
  line('Überzahlspiele', fmt(agg.pp / tg), '3,0 – 4,0');
  line('Überzahlquote', pct(agg.ppg / Math.max(1, agg.pp)), '17 – 22 %');
  line('Strafminuten', fmt(agg.pim / tg, 1), '6 – 9');
  line('Checks', fmt(agg.hits / tg, 1), '15 – 25');
  line('Breakout sauber', pct(agg.breakoutsClean / agg.breakouts), '(beobachten)');
  line('kontrollierte Eintritte erfolgreich', pct(agg.ecs / agg.ec), '(beobachten)');
  line('Dump-ins zurückerobert', pct(agg.dumpsRec / agg.dumps), '25 – 40 %');
  console.log('');
  line('Spiele mit Verlängerung', pct(agg.ot / n), '20 – 25 %');
  line('davon Penaltyschießen', pct(agg.so / Math.max(1, agg.ot)), '40 – 55 %');
  line('Heimsiege', pct(agg.homeWins / n), '52 – 56 %');
  line('Ein-Tor-Spiele (reguläre Zeit)', pct(agg.oneGoal / n), '25 – 32 %');
  line('Spiele mit Corsi > 2:1', pct(agg.lopsided / n), '< 5 %');
  console.log('\nSiegquote des Favoriten (Stärkeunterschied in Anzeigepunkten)');
  for (const b of buckets) console.log(`${pad(b.label, 36)} ${lpad(b.g ? pct(b.favWins / b.g) : '–', 10)}   (${b.g} Spiele)`);
  console.log(`${pad('Ziel klarer Favorit', 36)} ${lpad('', 10)}   ca. 65 – 70 %`);
}

// ---------------------------------------------------------------- season
function cmdSeason() {
  const world0 = generateWorld(num(0, 2026));
  const t0 = Date.now();
  const world = playDays(world0, 1000);
  const comp = world.competition!;
  const clubById = new Map(world.clubs.map((c) => [c.id, c]));
  const name = (id: string) => clubById.get(id)!.name;
  const table = regularTable(world);
  console.log(`\nSaison komplett simuliert: ${comp.fixtures.length} Spiele, ${comp.day} Spieltage in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  console.log(`${lpad('#', 2)}  ${pad('Verein', 28)} ${lpad('Sp', 3)} ${lpad('S', 3)} ${lpad('SnV', 4)} ${lpad('NnV', 4)} ${lpad('N', 3)} ${lpad('Tore', 8)} ${lpad('Pkt', 4)}  Stärke`);
  table.forEach((r, i) => {
    const c = clubById.get(r.clubId)!;
    const zone = i < 6 ? 'VF ' : i < 10 ? 'PPO' : 'PD ';
    console.log(`${lpad(i + 1, 2)}  ${pad(c.name, 28)} ${lpad(r.gp, 3)} ${lpad(r.w, 3)} ${lpad(r.otw, 4)} ${lpad(r.otl, 4)} ${lpad(r.l, 3)} ${lpad(`${r.gf}:${r.ga}`, 8)} ${lpad(r.pts, 4)}  ${fmt(strengthOf(world, c) / 10, 1)}  ${zone}`);
  });
  console.log('\nNachsaison');
  for (const s of comp.series) {
    console.log(`${pad(s.roundName, 16)} ${pad(name(s.high), 28)} ${s.winsHigh}:${s.winsLow}  ${pad(name(s.low), 28)} → ${name(s.winner!)}`);
  }
  console.log(`\nMeister: ${name(comp.champion!)}   Absteiger: ${comp.relegated ? name(comp.relegated) : '–'}`);
  console.log('\nFinanzen (Saison komplett, Aug–Jul)');
  console.log(`${pad('Verein', 28)} ${lpad('Ø Zuschauer', 12)} ${lpad('Einnahmen', 12)} ${lpad('Ausgaben', 12)} ${lpad('Ergebnis', 11)} ${lpad('Konto', 11)}  Ziel / Vorstand`);
  for (const r of table) {
    const c = world.clubs.find((x) => x.id === r.clubId)!;
    const sum = (cats: string[]) => c.finances.ledger.reduce((t, m) => t + cats.reduce((u, k) => u + (m.items[k] ?? 0), 0), 0);
    const inc = sum(INCOME), exp = sum(EXPENSE);
    const att = c.finances.attendance;
    const avg = att.length ? Math.round(att.reduce((a, b) => a + b, 0) / att.length) : 0;
    const k = (x: number) => `${(x / 1e6).toFixed(2).replace('.', ',')} Mio`;
    console.log(`${pad(c.name, 28)} ${lpad(avg.toLocaleString('de-DE'), 12)} ${lpad(k(inc), 12)} ${lpad(k(-exp), 12)} ${lpad(k(inc + exp), 11)} ${lpad(k(c.finances.balance), 11)}  ${c.seasonGoal} / ${c.boardConfidence}`);
  }
  const byId = new Map(world.players.map((p) => [p.id, p]));
  const nm = (id: string) => { const p = byId.get(id)!; return `${p.firstName} ${p.lastName}`; };
  const stats = Object.entries(comp.stats.regular);
  console.log('\nTopscorer Hauptrunde');
  stats.filter(([id]) => byId.get(id)!.position !== 'G')
    .sort(([, a], [, b]) => b.g + b.a - (a.g + a.a) || b.g - a.g).slice(0, 12)
    .forEach(([id, t], i) => {
      const p = byId.get(id)!;
      console.log(`${lpad(i + 1, 2)}. ${pad(nm(id), 24)} ${pad(clubById.get(t.clubId)!.shortName, 4)} ${pad(p.position, 3)} ${pad(p.nationalities.join('/'), 6)} ${lpad(t.gp, 2)} Sp  ${lpad(t.g, 2)} T  ${lpad(t.a, 2)} A  ${lpad(t.g + t.a, 3)} P  (Gesamt ${toDisplay(overall(p))})`);
    });
  console.log('\nTorhüter Hauptrunde (mind. 15 Spiele)');
  stats.filter(([id, t]) => byId.get(id)!.position === 'G' && t.gs >= 15)
    .sort(([, a], [, b]) => (b.sa - b.ga) / b.sa - (a.sa - a.ga) / a.sa).slice(0, 10)
    .forEach(([id, t]) => console.log(`${pad(nm(id), 24)} ${pad(clubById.get(t.clubId)!.shortName, 4)} ${lpad(t.gs, 2)} Sp  Fangquote ${pct((t.sa - t.ga) / t.sa)}  GAA ${fmt((t.ga * 3600) / t.toi)}  Shutouts ${t.so}`));
}

// ---------------------------------------------------------------- seasons (Markt über mehrere Saisons)
function cmdSeasons() {
  const n = num(0, 3);
  let world = generateWorld(num(1, 2026));
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    world = playDays(world, 1000);
    const comp = world.competition!;
    const signed = world.market.offers.filter((o) => o.status === 'accepted');
    const ext = signed.filter((o) => world.players.find((p) => p.id === o.playerId)?.contract?.clubId === o.clubId).length;
    const nextRoster = world.clubs.map((c) => world.players.filter((p) => (p.contract?.clubId === c.id && p.contract.untilSeason > world.season) || p.nextContract?.clubId === c.id).length);
    const free = world.players.filter((p) => !p.contract).length;
    console.log(`\nSaison ${world.season}/${String(world.season + 1).slice(2)} (${((Date.now() - t0) / 1000).toFixed(1)} s): Meister ${world.clubs.find((c) => c.id === comp.champion)!.shortName}, Absteiger ${world.clubs.find((c) => c.id === comp.relegated)!.shortName}`);
    console.log(`  Verträge für nächste Saison unterschrieben: ${signed.length} (davon Verlängerungen ${ext}), offen: ${world.market.offers.filter((o) => o.status === 'open').length}, Vereinslose: ${free}`);
    console.log(`  Kader nächste Saison je Verein: ${nextRoster.join(' ')}`);
    world = seasonTransition(world);
    const rosters = world.clubs.map((c) => world.players.filter((p) => p.contract?.clubId === c.id).length);
    const payroll = world.clubs.map((c) => { const p = payrollOf(world, c.id); return Math.round(((p.players + p.perks + p.staff) / c.finances.budget) * 100); });
    const strength = world.clubs.map((c) => toDisplay(strengthOf(world, c)));
    console.log(`  → nach Saisonwechsel: Kader ${rosters.join(' ')} | Gehälter in % des Etats ${payroll.join(' ')} | Stärke ${strength.join(' ')}`);
    console.log(`  Nachrichten (Auszug): ${world.market.news.slice(0, 3).map((x) => x.text).join(' | ')}`);
  }
}

switch (cmd) {
  case 'seasons': cmdSeasons(); break;
  case 'generate': cmdGenerate(); break;
  case 'match': cmdMatch(); break;
  case 'calibrate': cmdCalibrate(); break;
  case 'season': cmdSeason(); break;
  default:
    console.log(`Eishockey-Manager – Simulations-Werkzeug

  pnpm sim generate [seed] [datei]   Welt erzeugen und als JSON speichern
  pnpm sim match [seed] [weltSeed]    Ein Spiel mit Ticker und Statistik
  pnpm sim season [weltSeed]          Komplette Saison inkl. Playoffs und Playdowns
  pnpm sim calibrate [saisons] [weltSeed]  Massensimulation mit Richtwerten`);
}
