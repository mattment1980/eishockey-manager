import { simulateMatch, type MatchInput } from '@ehm/core';

self.onmessage = (e: MessageEvent<MatchInput>) => {
  const result = simulateMatch(e.data);
  (self as unknown as Worker).postMessage(result);
};
