import { useMemo, useState } from 'react';
import type { Player, Terms, Perks, PromiseType, Contract } from '@ehm/schema';
import {
  expectedSalary, expectedRole, offerUtility, perkCost, availability, marketInfo, formatDate, ageOn,
  PERK_COST, PERK_LABEL, ROLE_LABEL, PROMISE_LABEL, type OfferResponse,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { Sheet } from './Sheet.tsx';
import { euro } from '../labels.ts';

const ROLES: Contract['role'][] = ['star', 'top', 'regular', 'depth', 'prospect'];
const group = (p: Player) => (p.position === 'G' ? 'G' : p.position === 'LD' || p.position === 'RD' ? 'D' : 'F');

function defaultTerms(world: ReturnType<typeof useStore>['world'], p: Player): Terms {
  const imp = !p.nationalities.includes('DE');
  const age = ageOn(p.birthDate, world.date);
  return {
    salary: Math.round(expectedSalary(world, p) / 1000) * 1000,
    years: age >= 31 ? 1 : 2,
    role: expectedRole(world, p),
    perks: imp ? { housing: 1, car: 1, flights: 1, family: 0, extras: 0 } : { housing: 0, car: 0, flights: 0, family: 0, extras: 0 },
    bonus: { perPoint: 0, playoffs: 0 },
    clauses: { exit: false, relegation: false },
    promises: [],
  };
}

function verdict(u: number): { text: string; tone: string } {
  if (u < -0.35) return { text: 'deutlich unter seinen Vorstellungen', tone: 'loss' };
  if (u < -0.1) return { text: 'reicht ihm vermutlich nicht', tone: 'loss' };
  if (u < 0.05) return { text: 'knapp – könnte reichen', tone: 'warn' };
  if (u < 0.25) return { text: 'faires Angebot', tone: 'win' };
  return { text: 'sehr attraktiv', tone: 'win' };
}

export function Negotiation({ player, onClose }: { player: Player; onClose: () => void }) {
  const { world, club, makeOffer, withdraw } = useStore();
  const info = club ? marketInfo(world, player, club.id) : null;
  const [t, setT] = useState<Terms>(() => info?.myOffer?.terms ?? defaultTerms(world, player));
  const [resp, setResp] = useState<OfferResponse | null>(null);
  const av = club ? availability(world, player, club.id) : null;
  const exp = expectedSalary(world, player);
  const u = useMemo(() => (club && av?.ok ? offerUtility(world, player, club.id, t, av.forSeason) : 0), [world, player, club, t, av]);
  if (!club || !av) return null;
  const v = verdict(u);
  const cost = t.salary + perkCost(t.perks);
  const set = <K extends keyof Terms>(k: K, val: Terms[K]) => setT((x) => ({ ...x, [k]: val }));
  const setPerk = (k: keyof Perks, val: number) => setT((x) => ({ ...x, perks: { ...x.perks, [k]: val } }));
  const togglePromise = (pt: PromiseType) => setT((x) => ({ ...x, promises: x.promises.includes(pt) ? x.promises.filter((y) => y !== pt) : [...x.promises, pt] }));
  const g = group(player);
  const promiseOptions: PromiseType[] = g === 'G' ? ['starter', 'playoffs'] : g === 'D' ? ['top4D', 'pp1', 'playoffs'] : ['top6F', 'pp1', 'playoffs'];
  const own = player.contract?.clubId === club.id;

  return (
    <Sheet onClose={onClose} label="Vertragsangebot">
        <div className="muted small">{own ? 'Vertragsverlängerung' : 'Vertragsangebot'} · gültig ab {av.ok ? `${av.forSeason}/${String(av.forSeason + 1).slice(2)}${av.immediate ? ' (sofort)' : ''}` : '–'}</div>
        <h2>{player.firstName} {player.lastName}</h2>
        {!av.ok ? (
          <p className="alert">{player.lastName} {av.reason}.</p>
        ) : (
          <>
            <div className="nego-info small">
              <span>Gehaltsvorstellung laut Berater: <b>ca. {euro(exp)}</b></span>
              <span>Erwartete Rolle: <b>{ROLE_LABEL[expectedRole(world, player)]}</b></span>
              {info && <span>Interessenten: <b>{info.interested}</b>{info.topClub ? ' (darunter ein Topclub)' : ''}{info.decideBy ? ` · Entscheidung bis ${formatDate(info.decideBy)}` : ''}</span>}
              {info?.tendency.text && <span>{info.tendency.text}</span>}
            </div>

            <div className="field">
              <span>Jahresgehalt: <b>{euro(t.salary)}</b></span>
              <input type="range" min={Math.round(exp * 0.5 / 1000) * 1000} max={Math.round(exp * 1.8 / 1000) * 1000} step={1000} value={t.salary} onChange={(e) => set('salary', Number(e.target.value))} />
            </div>
            <div className="nego-row">
              <span>Laufzeit</span>
              <div className="segmented small-seg">
                {[1, 2, 3].map((y) => <button key={y} className={t.years === y ? 'on' : ''} onClick={() => set('years', y)}>{y} {y === 1 ? 'Jahr' : 'Jahre'}</button>)}
              </div>
            </div>
            <div className="nego-row">
              <span>Rolle</span>
              <div className="segmented small-seg">
                {ROLES.map((r) => <button key={r} className={t.role === r ? 'on' : ''} onClick={() => set('role', r)}>{ROLE_LABEL[r]}</button>)}
              </div>
            </div>

            <h4>Nebenleistungen</h4>
            {(Object.keys(PERK_COST) as (keyof Perks)[]).map((k) => (
              <div key={k} className="nego-row">
                <span>{PERK_LABEL[k].title}</span>
                <div className="segmented small-seg">
                  {PERK_LABEL[k].levels.map((l, i) => <button key={l} className={t.perks[k] === i ? 'on' : ''} onClick={() => setPerk(k, i)}>{l}</button>)}
                </div>
              </div>
            ))}
            <p className="muted small">Kosten Nebenleistungen: {euro(perkCost(t.perks))} pro Jahr. Importspieler schätzen Wohnung und Heimflüge besonders, Familien Haus und Schule.</p>

            <h4>Prämien</h4>
            <div className="nego-row">
              <span>Pro Scorerpunkt</span>
              <div className="segmented small-seg">
                {[0, 250, 500, 1000].map((v) => <button key={v} className={t.bonus.perPoint === v ? 'on' : ''} onClick={() => set('bonus', { ...t.bonus, perPoint: v })}>{v ? euro(v) : 'keine'}</button>)}
              </div>
            </div>
            <div className="nego-row">
              <span>Viertelfinale erreicht</span>
              <div className="segmented small-seg">
                {[0, 5000, 10000, 20000].map((v) => <button key={v} className={t.bonus.playoffs === v ? 'on' : ''} onClick={() => set('bonus', { ...t.bonus, playoffs: v })}>{v ? euro(v) : 'keine'}</button>)}
              </div>
            </div>

            <h4>Klauseln</h4>
            <label className="check"><input type="checkbox" checked={t.clauses.exit} onChange={(e) => set('clauses', { ...t.clauses, exit: e.target.checked })} /> Ausstiegsklausel (darf für eine stärkere Liga gehen)</label>
            <label className="check"><input type="checkbox" checked={t.clauses.relegation} onChange={(e) => set('clauses', { ...t.clauses, relegation: e.target.checked })} /> Abstiegsklausel (Vertrag endet bei Abstieg)</label>

            <h4>Versprechen</h4>
            {promiseOptions.map((pt) => (
              <label key={pt} className="check"><input type="checkbox" checked={t.promises.includes(pt)} onChange={() => togglePromise(pt)} /> {PROMISE_LABEL[pt]}</label>
            ))}
            <p className="muted small">Versprechen machen das Angebot attraktiver. Werden sie gebrochen, sinken Moral und eure Glaubwürdigkeit.</p>

            <div className="nego-summary">
              <div className="row-between"><span>Kosten pro Jahr (ohne Prämien)</span><b>{euro(cost)}</b></div>
              <div className="row-between"><span>Einschätzung</span><b className={v.tone}>{v.text}</b></div>
            </div>

            {resp && <div className={`alert ${resp.kind === 'accepted' ? 'ok' : ''}`}>{resp.text}</div>}
            <div className="btn-row">
              <button className="btn primary big" disabled={resp?.kind === 'accepted' || resp?.kind === 'blocked'} onClick={() => {
                const r = makeOffer(player.id, t);
                setResp(r);
                if (r.demand && (r.kind === 'lowball' || r.kind === 'insulted')) setT((x) => ({ ...x }));
              }}>{info?.myOffer ? 'Angebot ändern' : 'Angebot abgeben'}</button>
              {info?.myOffer ? (
                <button className="btn big" onClick={() => { withdraw(player.id); onClose(); }}>Zurückziehen</button>
              ) : (
                <button className="btn big" onClick={onClose}>Abbrechen</button>
              )}
            </div>
          </>
        )}
    </Sheet>
  );
}
