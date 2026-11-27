import { generateWorld } from '@ehm/data';
import { playDay, injuredCount, INJURY } from '@ehm/core';
let w = generateWorld(Number(process.argv[2] ?? 11));
const counts: number[] = []; const kinds: Record<string, number> = {}; let seen = new Set<string>(); let train = 0, game = 0;
const t0 = Date.now();
while (!w.competition!.finished) {
  w = playDay(w).world;
  for (const c of w.clubs) counts.push(injuredCount(w, c.id));
  for (const p of w.players) if (p.injury && !seen.has(p.id + p.injury.date)) { seen.add(p.id + p.injury.date); kinds[p.injury.kind] = (kinds[p.injury.kind] ?? 0) + 1; if (p.injury.cause === 'game') game++; else train++; }
}
const hist: Record<number, number> = {}; for (const c of counts) hist[c] = (hist[c] ?? 0) + 1;
console.log('avg', (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2), 'hist %', Object.entries(hist).map(([k, v]) => `${k}:${(100 * v / counts.length).toFixed(1)}`).join(' '));
console.log('injuries', seen.size, 'per team', (seen.size / 14).toFixed(1), 'game', game, 'training', train, kinds, 'sec', (Date.now() - t0) / 1000);
