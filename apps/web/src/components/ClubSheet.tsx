import type { Player } from '@ehm/schema';
import { playerView, ageOn, overall, regularTable } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Sheet } from './Sheet.tsx';
import { Crest } from './Crest.tsx';
import { KnowledgeDots } from './KnowledgeDots.tsx';
import { OverallBadge, viewSortValue, RatingBadge } from './Badges.tsx';
import { FormStrip } from './FormStrip.tsx';
import { PlayerName } from './Names.tsx';
import { PROFILE_LABEL, NATION_LABEL } from '../labels.ts';

const GROUPS: { title: string; pos: Player['position'][] }[] = [
  { title: 'Sturm', pos: ['C', 'LW', 'RW'] },
  { title: 'Verteidigung', pos: ['LD', 'RD'] },
  { title: 'Tor', pos: ['G'] },
];

/** Kader eines Vereins, bewertet nach dem eigenen Scouting-Stand */
export function ClubSheet({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const { world, club: mine, clubById } = useStore();
  const c = clubById.get(clubId);
  if (!c || !mine) return null;
  const own = c.id === mine.id;
  const roster = world.players.filter((p) => p.contract?.clubId === c.id);
  const comp = world.competition;
  const table = comp ? regularTable(world) : [];
  const place = table.findIndex((r) => r.clubId === c.id) + 1;
  const row = table[place - 1];
  const head = world.staff.find((s) => s.contract?.clubId === c.id && s.role === 'headCoach');
  const views = new Map(roster.map((p) => [p.id, playerView(world, mine.id, p, ageOn(p.birthDate, world.date))]));
  return (
    <Sheet onClose={onClose} label={c.name} wide>
      <div className="club-head">
        <Crest club={c} size={56} />
        <div>
          <h2>{c.name}</h2>
          <div className="muted small">{PROFILE_LABEL[c.profile]} · {c.arena.name} ({c.arena.capacity.toLocaleString('de-DE')} Plätze){head ? ` · Trainer ${head.firstName} ${head.lastName}` : ''}</div>
          {row && row.gp > 0 && <div className="small">{place}. Platz · {row.pts} Punkte aus {row.gp} Spielen · Tore {row.gf}:{row.ga}</div>}
          {comp && <FormStrip comp={comp} clubId={c.id} />}
        </div>
      </div>
      {!own && <p className="muted small">Werte nach eurem Scouting-Stand. Spieler anklicken für das Profil.</p>}
      {GROUPS.map((g) => {
        const list = roster.filter((p) => g.pos.includes(p.position))
          .sort((a, b) => (own ? overall(b) - overall(a) : viewSortValue(views.get(b.id)!) - viewSortValue(views.get(a.id)!)));
        return (
          <section key={g.title}>
            <h4>{g.title} ({list.length})</h4>
            <ul className="roster compact">
              {list.map((p) => {
                const v = views.get(p.id)!;
                return (
                  <li key={p.id} className="static">
                    <span className={`pos pos-${p.position}`}>{p.position}</span>
                    <div className="roster-main">
                      <strong><PlayerName p={p} /></strong>
                      <small className="muted">{ageOn(p.birthDate, world.date)} J · {NATION_LABEL[p.nationalities[0]] ?? p.nationalities[0]}{p.contract ? ` · bis ${p.contract.untilSeason + 1}` : ''}</small>
                    </div>
                    {!own && <KnowledgeDots level={v.level} />}
                    {own ? <RatingBadge p={p} /> : <OverallBadge v={v} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Sheet>
  );
}
