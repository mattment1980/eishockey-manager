import type { Player } from '@ehm/schema';
import { GOALIE_ATTRIBUTES } from '@ehm/schema';
import {
  overall, toDisplay, toDisplay1, effectiveRating, ageOn, talentStars, formLabel, fitnessLabel, PERK_LABEL, PROMISE_LABEL, ROLE_LABEL,
  attrChange, ovrChange, devFactors, type PlayerView, type AttrView,
} from '@ehm/core';
import type { World } from '@ehm/schema';
import { DevArrow, DevSparkline } from './DevArrow.tsx';
import { DevTempo } from './DevTempo.tsx';
import type { Perks } from '@ehm/schema';
import type { ReactNode } from 'react';
import { SKATER_GROUPS, SKATER_LABEL, GOALIE_LABEL, TRAIT_LABEL, POSITION_LABEL, NATION_LABEL, euro } from '../labels.ts';
import { KnowledgeDots } from './KnowledgeDots.tsx';
import { Talent } from './Talent.tsx';
import { Sheet } from './Sheet.tsx';
import { CareerStats } from './CareerStats.tsx';
import { fmt1 } from '../format.ts';

const CAT_WIDTH: Record<string, number> = { 'sehr schwach': 25, schwach: 42, solide: 58, stark: 74, 'sehr stark': 90 };
export const moodLabel = (m: number) => (m >= 75 ? 'euphorisch' : m >= 62 ? 'gut' : m >= 48 ? 'okay' : m >= 35 ? 'gereizt' : 'unzufrieden');

function Bar({ label, view, change }: { label: string; view: AttrView; change?: number }) {
  if ('exact' in view) {
    const d = view.exact;
    const tone = d >= 15 ? 'hi' : d >= 11 ? 'mid' : d >= 7 ? 'lo' : 'bad';
    return (
      <div className="attr">
        <span>{label}</span>
        <div className="attr-bar"><div className={tone} style={{ width: `${d * 5}%` }} /></div>
        <b className={tone}>{d}<DevArrow delta={change} /></b>
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
  /** Welt (für Entwicklungsfaktoren eigener Spieler) */
  world?: World;
  onClose: () => void;
  /** Ansicht nach Scouting-Kenntnis (fehlt = alles exakt, eigener Spieler) */
  view?: PlayerView;
  clubName?: ReactNode;
  /** Zusätzliche Aktionen (Scouting, Angebot …) */
  children?: ReactNode;
}

export function PlayerSheet({ player, date, onClose, view, clubName, children, world }: Props) {
  const p = player;
  const age = ageOn(p.birthDate, date);
  const exact = (v: number): AttrView => ({ exact: toDisplay(v) });
  const attrView = (k: string, raw: number) => (view ? view.attrs[k] : exact(raw));
  const traits = view ? p.traits.slice(0, view.traitsVisible) : p.traits;
  const hiddenTraits = view ? Math.max(0, p.traits.length - view.traitsVisible) : 0;
  const ov = view?.overall;
  const base = overall(p);
  const talent = view ? view.talent : { stars: talentStars(p.hidden.potential) };

  return (
    <Sheet onClose={onClose} label={`${p.firstName} ${p.lastName}`}>
      <div className="sheet-head">
        <div>
          <div className="muted small">{POSITION_LABEL[p.position]} · {p.shoots === 'L' ? 'schießt links' : 'schießt rechts'}</div>
          <h2>{p.firstName} {p.lastName}</h2>
          <div className="muted small">
            {age} Jahre · {p.nationalities.map((n) => NATION_LABEL[n] ?? n).join(' / ')}{clubName ? <> · {clubName}</> : ''}
          </div>
          <div className="sheet-talent"><span className="muted small">Talent</span> <Talent view={talent} /></div>
        </div>
        {ov ? (
          <div className="big-rating" data-tip="Gesamtstärke laut Scouting">
            {'exact' in ov ? ov.exact : 'range' in ov ? `${ov.range[0]}–${ov.range[1]}` : '~'}
            <small>{'category' in ov ? ov.category : 'Gesamt'}</small>
          </div>
        ) : (
          <div className="big-rating" data-tip="Grundstärke auf der Position; darunter die aktuelle Stärke mit Fitness, Form und Moral">
            {fmt1(toDisplay1(base))}
            <small>aktuell {fmt1(toDisplay1(effectiveRating(p, base)))}</small>
          </div>
        )}
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
      {view && <p className="small muted">Entwicklung: {view.potential}</p>}
      {children}

      {!view && (
        <div className="cond-grid">
          <div data-tip="Fitness zum nächsten Spiel (Erholung bis dahin ist eingerechnet). Sinkt mit der Eiszeit, erholt sich an spielfreien Tagen. Jeder Prozentpunkt unter 100 kostet 0,3 % Leistung."><span>Fitness</span><b>{Math.round(p.condition.fitness)} %</b><small>{fitnessLabel(p.condition.fitness)}</small></div>
          <div data-tip="Form folgt den Leistungen der letzten Spiele (50 = normal)"><span>Form</span><b>{Math.round(p.condition.form)}</b><small>{formLabel(p.condition.form)}</small></div>
          <div data-tip="Moral hängt von Ergebnissen, Eiszeit, Rolle und Versprechen ab"><span>Moral</span><b>{Math.round(p.condition.morale)}</b><small>{moodLabel(p.condition.morale)}</small></div>
        </div>
      )}

      {!view && world && (
        <div className="dev-box">
          <div className="row-between">
            <span><b>Entwicklung</b> <span className="muted small">seit Saisonbeginn</span> <DevArrow delta={ovrChange(p)} always /></span>
            <span className="small">Tempo <DevTempo f={devFactors(world, p, date)} /></span>
          </div>
          <DevSparkline values={p.dev.history.map((h) => h.ovr)} />
          <p className="muted small">Monatlich kleine Schritte während der Saison, im Sommer der große Schritt. Pfeile an den Werten zeigen die Veränderung seit Saisonbeginn.</p>
        </div>
      )}

      {(traits.length > 0 || hiddenTraits > 0) && (
        <div className="traits">
          {traits.map((t) => (
            <span key={t.id} className={`trait ${TRAIT_LABEL[t.id].tone}`} data-tip={TRAIT_LABEL[t.id].text}>{TRAIT_LABEL[t.id].name}</span>
          ))}
          {hiddenTraits > 0 && <span className="trait unknown" data-tip="Weitere Charakterzüge – mehr Scouting nötig">+ {hiddenTraits} unbekannt</span>}
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
          {GOALIE_ATTRIBUTES.map((k) => <Bar key={k} label={GOALIE_LABEL[k]} view={attrView(k, p.goalie![k])} change={view ? undefined : attrChange(p, k, true)} />)}
        </div>
      ) : (
        SKATER_GROUPS.map((g) => (
          <div key={g.title} className="attr-group">
            <h4>{g.title}</h4>
            {g.keys.map((k) => <Bar key={k} label={SKATER_LABEL[k]} view={attrView(k, p.skater[k])} change={view ? undefined : attrChange(p, k)} />)}
          </div>
        ))
      ))}

      <CareerStats player={p} />

      {!view && (
        <div className="attr-group">
          <h4>Vertrag</h4>
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
          {p.nextContract && <div className="row-between small"><span>Vorvertrag</span><b>ab {p.nextContract.fromSeason ?? ''}</b></div>}
        </div>
      )}
    </Sheet>
  );
}
