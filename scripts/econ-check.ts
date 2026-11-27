import { generateWorld, advanceOffseason, offseasonPhase } from '@ehm/data';
// Wirtschaftsprüfung: npx tsx scripts/econ-check.ts [Saisons] [Startwert] [v]  – Auslastung, Heimvorteil, Erlöse je Kategorie, Fanbasis
import { playDays } from '@ehm/core';
const seasons = Number(process.argv[2] ?? 2);
let w = generateWorld(Number(process.argv[3] ?? 2026));
for (let s = 0; s < seasons; s++) {
  w = playDays(w, 1000);
  const comp = w.competition!;
  const reg = comp.fixtures.filter((f) => f.result);
  const hw = reg.filter((f) => f.result!.score[0] > f.result!.score[1]).length / reg.length;
  const cats = ['tickets', 'playoffs', 'catering', 'merch', 'matchday', 'sponsors', 'media'];
  const tot: Record<string, number> = {};
  let fillSum = 0, n = 0, res = 0;
  const lines: string[] = [];
  for (const c of w.clubs) {
    const sum = (k: string) => c.finances.ledger.reduce((t, m) => t + (m.items[k] ?? 0), 0);
    for (const k of cats) tot[k] = (tot[k] ?? 0) + sum(k);
    const att = c.finances.attendance;
    const fill = att.reduce((a, b) => a + b, 0) / att.length / c.arena.capacity;
    fillSum += fill; n++;
    const all = c.finances.ledger.reduce((t, m) => t + Object.values(m.items).reduce((a, b) => a + b, 0), 0);
    res += all;
    lines.push(`${c.shortName} fb ${c.fanBase} fill ${(fill * 100).toFixed(0)}% erg ${(all / 1e3).toFixed(0)}k tickets ${(sum('tickets') / 1e3).toFixed(0)}k cat ${(sum('catering') / 1e3).toFixed(0)}k merch ${(sum('merch') / 1e3).toFixed(0)}k md ${(sum('matchday') / 1e3).toFixed(0)}k`);
  }
  const reps = w.clubs.flatMap((c) => c.stadium.games);
  const edge = reps.reduce((t, g) => t + g.homeEdge, 0) / reps.length, atm = reps.reduce((t, g) => t + g.atmosphere, 0) / reps.length;
  const sold = reps.filter((g) => g.turnedAway > 0).length / reps.length;
  console.log(`  Heimvorteil Ø ${edge.toFixed(4)} (min ${Math.min(...reps.map((g) => g.homeEdge)).toFixed(3)}, max ${Math.max(...reps.map((g) => g.homeEdge)).toFixed(3)}), Stimmung Ø ${atm.toFixed(1)}, ausverkauft ${(sold * 100).toFixed(0)} %, Aktionen ${reps.filter((g) => g.actionId).length}`);
  console.log(`Saison ${w.season}: Heimsiege ${(hw * 100).toFixed(1)} %, Ø Auslastung ${(fillSum / n * 100).toFixed(1)} %, Ø Ergebnis ${(res / n / 1e3).toFixed(0)}k`);
  console.log('  Summen je Verein (k€): ' + cats.map((k) => `${k} ${((tot[k] ?? 0) / n / 1e3).toFixed(0)}`).join(' | '));
  if (process.argv[4] === 'v') lines.forEach((l) => console.log('   ' + l));
  while (offseasonPhase(w) !== null) w = advanceOffseason(w);
  console.log(`  Fanbasis nach Sommer: ${w.clubs.map((c) => c.fanBase).join(' ')}`);
}
