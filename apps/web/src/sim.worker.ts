import type { World } from '@ehm/schema';
import { simulateMatch, playDay, playDays, nextFixtureOf, type MatchInput, type MatchResult } from '@ehm/core';

export type WorkerRequest =
  | { type: 'match'; input: MatchInput }
  | { type: 'day'; world: World; preplayed: Record<string, MatchResult> }
  | { type: 'days'; world: World; count: number; untilOwnGameOf?: string; untilRegularEnd?: boolean };

export type WorkerResponse =
  | { type: 'match'; result: MatchResult }
  | { type: 'world'; world: World };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const post = (r: WorkerResponse) => (self as unknown as Worker).postMessage(r);
  if (req.type === 'match') post({ type: 'match', result: simulateMatch(req.input) });
  if (req.type === 'day') post({ type: 'world', world: playDay(req.world, req.preplayed).world });
  if (req.type === 'days') {
    const world = playDays(req.world, req.count, (w) => {
      const c = w.competition!;
      if (req.untilRegularEnd && c.finalStandings) return true;
      if (req.untilOwnGameOf && nextFixtureOf(c, req.untilOwnGameOf)) return true;
      return false;
    });
    post({ type: 'world', world });
  }
};
