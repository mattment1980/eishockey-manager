import type { World, Position, News } from '@ehm/schema';
import { Rng, academyRating, aiYouthDecisions, YOUTH } from '@ehm/core';
import { WorldGenerator } from './generator.ts';

/**
 * Nachwuchsjahrgang für alle Vereine erzeugen (Sommerpause, Phase „Sommertraining“).
 * Qualität: fester Ligamaßstab (damit die Liga über die Jahre nicht stärker oder schwächer wird),
 * dazu Ausbildungsvereine (Profil „development“) und der beste Entwicklungstrainer.
 * KI-Vereine entscheiden sofort, der Manager in der Sommerpause (Kader › Nachwuchs).
 */
/** Grundqualität eines 16- bis 17-jährigen Talents (intern, ≈ 7 in der Anzeige) */
export const YOUTH_BASE = 72;

export function youthIntake(world: World, year: number): World {
  const rng = new Rng(`${world.seed}:nachwuchs:${year}`);
  const gen = new WorldGenerator({ seed: world.seed + year * 104729, season: year, idPrefix: `y${year}-` });
  const players = [...world.players];
  const news: News[] = [];
  const date = `${year}-07-15`;
  for (const club of world.clubs) {
    const level = YOUTH_BASE + (club.profile === 'development' ? 4 : 0);
    const academy = academyRating(world, club.id);
    const size = YOUTH.SIZE + (academy >= 14 ? 1 : 0);
    for (let i = 0; i < size; i++) {
      const pos = rng.weighted<Position>(['C', 'LW', 'RW', 'LD', 'RD', 'G'], [2.5, 2, 2, 1.6, 1.6, 0.6]);
      const p = gen.generatePlayer({ position: pos, quality: level + (academy - 10) * 1.5 + rng.normal(0, 6), age: rng.int(16, 17), nationality: 'DE', clubId: null, role: 'prospect' });
      players.push({ ...p, youthClub: club.id });
    }
    if (club.controller.type === 'human') news.push({ date, kind: 'info', mine: true, text: `Neuer Nachwuchsjahrgang: ${size} Talente warten auf eine Entscheidung (Kader › Nachwuchs).` });
  }
  // Den eigenen Nachwuchs kennt jeder Verein gut (Kenntnisstufe 3), andere Vereine kaum
  const scouting = { ...world.scouting };
  for (const [clubId, st] of Object.entries(scouting)) {
    const knowledge = { ...st.knowledge };
    for (const p of players) if (p.youthClub) knowledge[p.id] = p.youthClub === clubId ? 300 : (knowledge[p.id] ?? 20);
    scouting[clubId] = { ...st, knowledge };
  }
  let w: World = { ...world, players, scouting, market: { ...world.market, news: [...news, ...world.market.news].slice(0, 120) } };
  for (const c of w.clubs) if (c.controller.type !== 'human') w = aiYouthDecisions(w, c.id);
  return w;
}
