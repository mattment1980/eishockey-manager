import { simulateMatch, playDay, playDays, nextFixtureOf, type MatchInput, type MatchResult } from '@ehm/core';
import type { World } from '@ehm/schema';
import type { WorkerRequest, WorkerResponse } from './sim.worker.ts';

/** Rechenarbeit im Hintergrund (Web Worker), mit Rückfall auf den Hauptthread. */
function run(req: WorkerRequest): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    const fallback = () => { try { compute(); } catch (err) { reject(err); } };
    const compute = () => {
      if (req.type === 'match') return resolve({ type: 'match', result: simulateMatch(req.input) });
      if (req.type === 'day') return resolve({ type: 'world', world: playDay(req.world, req.preplayed).world });
      resolve({
        type: 'world',
        world: playDays(req.world, req.count, (w) => (!!req.untilRegularEnd && !!w.competition!.finalStandings) || (!!req.untilOwnGameOf && !!nextFixtureOf(w.competition!, req.untilOwnGameOf))),
      });
    };
    try {
      const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        w.terminate();
        if (e.data.type === 'error') reject(new Error(e.data.message));
        else resolve(e.data);
      };
      w.onerror = () => { w.terminate(); fallback(); };
      w.postMessage(req);
    } catch {
      fallback();
    }
  });
}

export async function simMatch(input: MatchInput): Promise<MatchResult> {
  const r = await run({ type: 'match', input });
  return (r as Extract<WorkerResponse, { type: 'match' }>).result;
}

export async function simDay(world: World, preplayed: Record<string, MatchResult> = {}): Promise<World> {
  const r = await run({ type: 'day', world, preplayed });
  return (r as Extract<WorkerResponse, { type: 'world' }>).world;
}

export async function simDays(world: World, count: number, opts: { untilOwnGameOf?: string; untilRegularEnd?: boolean } = {}): Promise<World> {
  const r = await run({ type: 'days', world, count, ...opts });
  return (r as Extract<WorkerResponse, { type: 'world' }>).world;
}
