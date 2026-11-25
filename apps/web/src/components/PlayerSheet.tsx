import type { Player } from '@ehm/schema';
import { GOALIE_ATTRIBUTES } from '@ehm/schema';
import { overall, toDisplay, ageOn, formatView, PERK_LABEL, PROMISE_LABEL, ROLE_LABEL, type PlayerView, type AttrView } from '@ehm/core';
import type { Perks } from '@ehm/schema';
import { SKATER_GROUPS, SKATER_LABEL, GOALIE_LABEL, TRAIT_LABEL, POSITION_LABEL, NATION_LABEL, euro } from '../labels.ts';
import { KnowledgeDots } from './KnowledgeDots.tsx';

const CAT_WIDTH: Record<string, number> = { 'sehr schwach': 25, schwach: 42, solide: 58, stark: 74, 'sehr stark': 90 };

function Bar({ label, view }: { label: string; view: AttrView }) {
  if ('exact' in view) {
    const d = view.exact;
    const tone = d >= 15 ? 'hi' : d >= 11 ? 'mid' : d >= 7 ? 'lo' : 'bad';
    return (
      <div className="attr">
        <span>{label}</span>
        <div className="attr-bar"><div className={tone} style={{ width: `${d * 5}%` }} /></div>
        <b className={tone}>{d}</b>
      </div>
    );
  }
  if ('range' in view) {
    const [lo, hi] = view.range;
    return (
      <div className="attr">
        <span>{label}</span>
        <div className="attr-bar"><div className="range" style={{ marginLeft: `${lo * 5}%`, width: `${(hi - lo) * 5}%` }} /></div>
        <b className="muted">{lo}–{hi}</b>
      </div>
    );
  }
  if ('category' in view) {
    return (
      <div className="attr cat">
        <span>{label}</span>
        <div className="attr-bar"><div className="fuzzy" style={{ width: `${CAT_WIDTH[view.category] ?? 50}%` }} /></div>
        <b className="muted small">{view.category}</b>
      </div>
    );
  }
  return (
    <div className="attr">
      <span>{label}</span>
      <div className="attr-bar" />
      <b className="muted">?</b>
    </div>
  );
}

interface Props {
  player: Player;
  date: string;
  onClose: () => void;
  /** Ansicht nach Scouting-Kenntnis (fehlt = alles exakt, eigener Spieler) */
  view?: PlayerView;
  clubName?: string;
  watch?: { on: boolean; toggle: () => void };
  action?: { label: string; onClick: () => void };
}

export function PlayerSheet({ player, date, onClose, view, clubName, watch, action }: Props) {
  const p = player;
  const age = ageOn(p.birthDate, date);
  const exact = (v: number): AttrView => ({ exact: toDisplay(v) });
  const ov = view ? view.overall : exact(overall(p));
  const attrView = (k: string, raw: number) => (view ? view.attrs[k] : exact(raw));
  const traits = view ? p.traits.slice(0, view.traitsVisible) : p.traits;
  const hiddenTraits = view ? Math.max(0, p.traits.length - view.traitsVisible) : 0;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${p.firstName} ${p.lastName}`}>
        <div className="sheet-head">
          <div>
            <div className="muted small">{POSITION_LABEL[p.position]} · {p.shoots === 'L' ? 'schießt links' : 'schießt rechts'}</div>
            <h2>{p.firstName} {p.lastName}</h2>
            <div className="muted small">
              {age} Jahre · {p.nationalities.map((n) => NATION_LABEL[n] ?? n).join(' / ')}{clubName ? ` · ${clubName}` : ''}
            </div>
          </div>
          <div className="big-rating">
            {'exact' in ov ? ov.exact : 'range' in ov ? `${ov.range[0]}–${ov.range[1]}` : '~'}
            <small>{'category' in ov ? ov.category : 'Gesamt'}</small>
          </div>
        </div>

        {view && view.level < 4 && (
          <div className="scout-note">
            <KnowledgeDots level={view.level} />
            <span>
              {view.level === 1 && 'Kaum bekannt – nur ein grober Eindruck. Lass ihn scouten, um mehr zu erfahren.'}
              {view.level === 2 && 'Grob bekannt – Einschätzungen in Kategorien.'}
              {view.level === 3 && 'Gut bekannt – Werte als Spannen.'}
            </span>
          </div>
        )}
        {view && view.level === 1 && (
          <p className="small">Stärken laut Berichten: <b>{view.strengths.map((k) => (p.position === 'G' ? GOALIE_LABEL[k as keyof typeof GOALIE_LABEL] : SKATER_LABEL[k as keyof typeof SKATER_LABEL])).join(', ')}</b></p>
        )}
        {view && <p className="small muted">Potenzial: {view.potential}</p>}
        {action && <button className="btn primary block" onClick={action.onClick}>{action.label}</button>}
        {watch && (
          <button className={`btn block ${watch.on || action ? '' : 'primary'}`} onClick={watch.toggle}>
            {watch.on ? '✓ Auf der Beobachtungsliste – entfernen' : 'Beobachten (Scouts priorisieren ihn)'}
          </button>
        )}

        {(traits.length > 0 || hiddenTraits > 0) && (
          <div className="traits">
            {traits.map((t) => (
              <span key={t.id} className={`trait ${TRAIT_LABEL[t.id].tone}`} title={TRAIT_LABEL[t.id].text}>{TRAIT_LABEL[t.id].name}</span>
            ))}
            {hiddenTraits > 0 && <span className="trait unknown">+ {hiddenTraits} unbekannt</span>}
          </div>
        )}
        {traits.length > 0 && (
          <ul className="plain small muted">
            {traits.map((t) => <li key={t.id}><b>{TRAIT_LABEL[t.id].name}:</b> {TRAIT_LABEL[t.id].text}</li>)}
          </ul>
        )}

        {(!view || view.level >= 2) && (p.position === 'G' && p.goalie ? (
          <div className="attr-group">
            <h4>Torhüter</h4>
            {GOALIE_ATTRIBUTES.map((k) => <Bar key={k} label={GOALIE_LABEL[k]} view={attrView(k, p.goalie![k])} />)}
          </div>
        ) : (
          SKATER_GROUPS.map((g) => (
            <div key={g.title} className="attr-group">
              <h4>{g.title}</h4>
              {g.keys.map((k) => <Bar key={k} label={SKATER_LABEL[k]} view={attrView(k, p.skater[k])} />)}
            </div>
          ))
        ))}

        {!view && (
          <div className="attr-group">
            <h4>Zustand & Vertrag</h4>
            <div className="row-between small"><span>Form</span><b>{p.condition.form}</b></div>
            <div className="row-between small"><span>Moral</span><b>{p.condition.morale}</b></div>
            <div className="row-between small"><span>Fitness</span><b>{p.condition.fitness} %</b></div>
            {p.contract && (
              <>
                <div className="row-between small"><span>Gehalt</span><b>{euro(p.contract.salary)} / Jahr</b></div>
                <div className="row-between small"><span>Vertrag bis</span><b>Saisonende {p.contract.untilSeason + 1}</b></div>
                <div className="row-between small"><span>Rolle</span><b>{ROLE_LABEL[p.contract.role]}</b></div>
                {(Object.keys(p.contract.perks) as (keyof Perks)[]).filter((k) => p.contract!.perks[k] > 0).map((k) => (
                  <div key={k} className="row-between small"><span>{PERK_LABEL[k].title}</span><b>{PERK_LABEL[k].levels[p.contract!.perks[k]]}</b></div>
                ))}
                {p.contract.bonus.perPoint > 0 && <div className="row-between small"><span>Punkteprämie</span><b>{euro(p.contract.bonus.perPoint)}</b></div>}
                {p.contract.bonus.playoffs > 0 && <div className="row-between small"><span>Playoffprämie</span><b>{euro(p.contract.bonus.playoffs)}</b></div>}
                {p.contract.clauses.exit && <div className="row-between small"><span>Klausel</span><b>Ausstiegsklausel</b></div>}
                {p.contract.clauses.relegation && <div className="row-between small"><span>Klausel</span><b>Abstiegsklausel</b></div>}
                {p.contract.promises.map((pr) => (
                  <div key={pr.type} className="row-between small"><span>Versprechen: {PROMISE_LABEL[pr.type]}</span><b className={pr.status === 'ok' ? 'win' : 'loss'}>{pr.status === 'ok' ? 'eingehalten' : pr.status === 'risk' ? 'gefährdet' : 'gebrochen'}</b></div>
                ))}
              </>
            )}
            {p.nextContract && <div className="row-between small"><span>Vorvertrag</span><b>ab {(p.nextContract.fromSeason ?? 0)}/{String((p.nextContract.fromSeason ?? 0) + 1).slice(2)} · {euro(p.nextContract.salary)}</b></div>}
          </div>
        )}
        {view && (
          <div className="attr-group">
            <h4>Vertrag</h4>
            <div className="row-between small"><span>Status</span><b>{p.contract ? `unter Vertrag bis ${p.contract.untilSeason + 1}` : 'vereinslos'}</b></div>
          </div>
        )}
        <button className="btn primary block" onClick={onClose}>Schließen</button>
        <span hidden>{formatView(ov)}</span>
      </div>
    </div>
  );
}
