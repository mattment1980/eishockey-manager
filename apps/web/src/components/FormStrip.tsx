import type { Competition } from '@ehm/schema';
import { lastResults, type FormCode } from '@ehm/core';
import { useStore } from '../store.tsx';

const LABEL: Record<FormCode, string> = { S: 'Sieg', SnV: 'Sieg nach Verlängerung/Penaltys', NnV: 'Niederlage nach Verlängerung/Penaltys', N: 'Niederlage' };
const SHORT: Record<FormCode, string> = { S: 'S', SnV: 'S', NnV: 'N', N: 'N' };

/** Form der letzten Spiele als farbige Kästchen (ältestes links) */
export function FormStrip({ comp, clubId, n = 5 }: { comp: Competition; clubId: string; n?: number }) {
  const { clubById } = useStore();
  const list = lastResults(comp, clubId, n);
  if (!list.length) return <span className="muted small">–</span>;
  return (
    <span className="formpills">
      {list.map(({ code, fixture: f }) => {
        const h = clubById.get(f.home)?.shortName, a = clubById.get(f.away)?.shortName;
        const r = f.result!;
        const ext = r.decidedIn === 'OT' ? ' n.V.' : r.decidedIn === 'SO' ? ' n.P.' : '';
        return <i key={f.id} className={`fp fp-${code}`} data-tip={`${LABEL[code]}: ${h} ${r.score[0]}:${r.score[1]}${ext} ${a}`}>{SHORT[code]}{code === 'SnV' || code === 'NnV' ? <sup>V</sup> : null}</i>;
      })}
    </span>
  );
}
