import type { Player } from '@ehm/schema';
import { GOALIE_ATTRIBUTES } from '@ehm/schema';
import { overall, toDisplay, ageOn } from '@ehm/core';
import { SKATER_GROUPS, SKATER_LABEL, GOALIE_LABEL, TRAIT_LABEL, POSITION_LABEL, NATION_LABEL, euro } from '../labels.ts';

function Bar({ label, value }: { label: string; value: number }) {
  const d = toDisplay(value);
  const tone = d >= 15 ? 'hi' : d >= 11 ? 'mid' : d >= 7 ? 'lo' : 'bad';
  return (
    <div className="attr">
      <span>{label}</span>
      <div className="attr-bar"><div className={tone} style={{ width: `${d * 5}%` }} /></div>
      <b className={tone}>{d}</b>
    </div>
  );
}

export function PlayerSheet({ player, date, onClose }: { player: Player; date: string; onClose: () => void }) {
  const p = player;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${p.firstName} ${p.lastName}`}>
        <div className="sheet-head">
          <div>
            <div className="muted small">{POSITION_LABEL[p.position]} · {p.shoots === 'L' ? 'schießt links' : 'schießt rechts'}</div>
            <h2>{p.firstName} {p.lastName}</h2>
            <div className="muted small">
              {ageOn(p.birthDate, date)} Jahre · {p.nationalities.map((n) => NATION_LABEL[n] ?? n).join(' / ')}
            </div>
          </div>
          <div className="big-rating">{toDisplay(overall(p))}<small>Gesamt</small></div>
        </div>
        {p.traits.length > 0 && (
          <div className="traits">
            {p.traits.map((t) => (
              <span key={t.id} className={`trait ${TRAIT_LABEL[t.id].tone}`} title={TRAIT_LABEL[t.id].text}>
                {TRAIT_LABEL[t.id].name}
              </span>
            ))}
          </div>
        )}
        {p.traits.length > 0 && (
          <ul className="plain small muted">
            {p.traits.map((t) => <li key={t.id}><b>{TRAIT_LABEL[t.id].name}:</b> {TRAIT_LABEL[t.id].text}</li>)}
          </ul>
        )}
        {p.position === 'G' && p.goalie ? (
          <div className="attr-group">
            <h4>Torhüter</h4>
            {GOALIE_ATTRIBUTES.map((k) => <Bar key={k} label={GOALIE_LABEL[k]} value={p.goalie![k]} />)}
          </div>
        ) : (
          SKATER_GROUPS.map((g) => (
            <div key={g.title} className="attr-group">
              <h4>{g.title}</h4>
              {g.keys.map((k) => <Bar key={k} label={SKATER_LABEL[k]} value={p.skater[k]} />)}
            </div>
          ))
        )}
        <div className="attr-group">
          <h4>Zustand & Vertrag</h4>
          <div className="row-between small"><span>Form</span><b>{p.condition.form}</b></div>
          <div className="row-between small"><span>Moral</span><b>{p.condition.morale}</b></div>
          <div className="row-between small"><span>Fitness</span><b>{p.condition.fitness} %</b></div>
          {p.contract && (
            <>
              <div className="row-between small"><span>Gehalt</span><b>{euro(p.contract.salary)} / Jahr</b></div>
              <div className="row-between small"><span>Vertrag bis</span><b>Saisonende {p.contract.untilSeason + 1}</b></div>
            </>
          )}
        </div>
        <button className="btn primary block" onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}
