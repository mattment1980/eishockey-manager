/** Gemeinsame Testwelt und Hilfen */
import type { TeamInput } from '@ehm/core';
import { generateWorld } from '@ehm/data';

export const world = generateWorld(2026);
export const input = (id: string): TeamInput => {
  const c = world.clubs.find((x) => x.id === id)!;
  return { clubId: c.id, name: c.name, shortName: c.shortName, plan: c.matchplan!, players: world.players.filter((p) => p.contract?.clubId === c.id) };
};
