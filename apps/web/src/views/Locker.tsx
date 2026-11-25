import { useMemo, useState } from 'react';
import type { Player } from '@ehm/schema';
import { teamClimate, climateIssues, captainOf, unitChemistry, hasTrait } from '@ehm/core';
import { useStore } from '../store.tsx';
import { PlayerSheet } from '../components/PlayerSheet.tsx';
import { TRAIT_LABEL } from '../labels.ts';

export const chemLabel = (c: number) => (c >= 75 ? 'eingespielt' : c >= 58 ? 'gut' : c >= 42 ? 'neutral' : c >= 28 ? 'holprig' : 'Reibung');
export const chemClass = (c: number) => (c >= 58 ? 'top' : c < 42 ? 'low' : '');
const moodLabel = (m: number) => (m >= 75 ? 'Euphorisch' : m >= 62 ? 'Gut' : m >= 48 ? 'Okay' : m >= 35 ? 'Gereizt' : 'Unzufrieden');

/** Kabine: Teamklima, Moral, Reihenchemie und Konflikte */
export function Locker() {
  const { world, club, players, byId } = useStore();
  const [sheet, setSheet] = useState<Player | null>(null);
  const plan = club?.matchplan;
  const data = useMemo(() => {
    if (!club || !plan) return null;
    return {
      climate: teamClimate(world, club.id),
      issues: climateIssues(world, club.id),
      captain: captainOf(world, club),
      lines: plan.forwardLines.map((l) => unitChemistry(world, l, byId)),
      pairs: plan.defensePairs.map((l) => unitChemistry(world, l, byId)),
    };
  }, [world, club, plan, byId]);
  if (!club || !plan || !data) return null;
  const sorted = [...players].sort((a, b) => a.condition.morale - b.condition.morale);
  const personality = players.filter((p) => p.traits.some((t) => t.strength >= 50 && ['leader', 'diva', 'egoist', 'freigeist', 'hitzkopf', 'kabinenclown', 'teamplayer'].includes(t.id)));
  const unit = (ids: string[]) => ids.map((id) => byId.get(id)?.lastName ?? '?').join(' – ');

  return (
    <div className="stack">
      <section className="card">
        <div className="row-between"><h3>Teamklima</h3><b className="rating">{data.climate}</b></div>
        <div className="meter big"><div style={{ width: `${data.climate}%` }} /></div>
        <p className="muted small">{moodLabel(data.climate)} · Kapitän: {data.captain ? `${data.captain.firstName} ${data.captain.lastName}` : '–'}{plan.captain ? '' : ' (automatisch)'} · Das Klima verschiebt die Tagesform der ganzen Mannschaft leicht.</p>
      </section>

      {data.issues.length > 0 && (
        <section className="card">
          <h3>Hinweise</h3>
          <ul className="plain">{data.issues.map((i, k) => <li key={k} className={i.level === 'bad' ? 'neg small' : 'small'}>{i.level === 'bad' ? '⚠ ' : '• '}{i.text}</li>)}</ul>
        </section>
      )}

      <section className="card">
        <h3>Reihenchemie</h3>
        <ul className="plain">
          {plan.forwardLines.map((l, i) => (
            <li key={`f${i}`} className="row-between small"><span>{i + 1}. Sturm · {unit(l)}</span><span className={`chip ${chemClass(data.lines[i])}`}>{chemLabel(data.lines[i])}</span></li>
          ))}
          {plan.defensePairs.map((l, i) => (
            <li key={`d${i}`} className="row-between small"><span>{i + 1}. Verteidigung · {unit(l)}</span><span className={`chip ${chemClass(data.pairs[i])}`}>{chemLabel(data.pairs[i])}</span></li>
          ))}
        </ul>
        <p className="muted small">Chemie wächst mit jedem gemeinsamen Spiel und hängt von den Charakteren ab. Eingespielte Reihen spielen bis zu 3 % besser, Reibung kostet entsprechend.</p>
      </section>

      <section className="card">
        <h3>Moral</h3>
        <ul className="plain">
          {sorted.map((p) => (
            <li key={p.id} className="row-between small" onClick={() => setSheet(p)}>
              <span>{p.firstName[0]}. {p.lastName} <span className="muted">· {p.position}</span></span>
              <span className="row-gap"><span className="muted">{moodLabel(p.condition.morale)}</span>
                <span className="meter" style={{ width: 70, display: 'inline-block' }}><div style={{ width: `${p.condition.morale}%`, background: p.condition.morale < 40 ? 'var(--goal)' : undefined }} /></span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Charaktere</h3>
        <ul className="plain">
          {personality.map((p) => (
            <li key={p.id} className="row-between small" onClick={() => setSheet(p)}>
              <span>{p.firstName[0]}. {p.lastName}</span>
              <span>{p.traits.filter((t) => t.strength >= 50).map((t) => <span key={t.id} className={`chip ${TRAIT_LABEL[t.id].tone === 'pos' ? 'top' : TRAIT_LABEL[t.id].tone === 'neg' ? 'low' : ''}`}>{TRAIT_LABEL[t.id].name}</span>)}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">{personality.some((p) => hasTrait(p, 'diva')) ? 'Diven reagieren empfindlich auf Tribüne und wenig Eiszeit. ' : ''}Leader pushen ihre Reihe bei Rückstand im letzten Drittel und in den Playoffs.</p>
      </section>
      {sheet && <PlayerSheet player={sheet} date={world.date} onClose={() => setSheet(null)} />}
    </div>
  );
}
