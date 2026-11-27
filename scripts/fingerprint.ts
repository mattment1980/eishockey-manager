/**
 * Fingerabdruck des Spielverhaltens: eine komplette Saison plus Sommerpause und Start der Folgesaison
 * mit festem Startwert. Reine Umbauten dürfen den Hash nicht verändern.
 * Aufruf: pnpm fingerprint
 */
import { createHash } from 'node:crypto';
import { generateWorld, advanceOffseason, offseasonPhase } from '@ehm/data';
import { playDays, simulateMatch, matchInputFor } from '@ehm/core';

const h = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

let w = generateWorld(4242);
const first = w.competition!.fixtures.find((f) => f.day === 1)!;
const single = simulateMatch(matchInputFor(w, first));
console.log('Einzelspiel ', h(single));
w = playDays(w, 400);
console.log('Saison      ', h(w));
while (offseasonPhase(w) !== null) w = advanceOffseason(w);
console.log('Sommerpause ', h(w));
w = playDays(w, 10);
console.log('Folgesaison ', h(w));
