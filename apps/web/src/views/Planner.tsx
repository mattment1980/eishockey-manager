import { useState } from 'react';
import type { Player } from '@ehm/schema';
import { overall, toDisplay, ageOn, marketInfo, contractCost, TARGET, formatDate, payrollOf } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Negotiation } from '../components/Negotiation.tsx';
import { PlayerName, ClubName, useUi } from '../ui.tsx';
import { RatingBadge } from '../components/Badges.tsx';
import { euro } from '../labels.ts';

const group = (p: Player) => (p.position === 'G' ? 'G' : p.position === 'LD' || p.position === 'RD' ? 'D' : 'F');
const GROUP_LABEL = { F: 'Sturm', D: 'Verteidigung', G: 'Tor' } as const;

export function Planner() {
  const { world, club, clubById } = useStore();
  const [nego, setNego] = useState<Player | null>(null);
  const { openPlayer } = useUi();
  if (!club) return null;
  const season = world.season;
  const next = season + 1;
  const rules = world.countries[0].rules;
  const all = world.players;
  const staying = all.filter((p) => p.contract?.clubId === club.id && p.contract.untilSeason > season && !(p.nextContract && p.nextContract.clubId !== club.id));
  const arriving = all.filter((p) => p.nextContract?.clubId === club.id);
  const expiring = all.filter((p) => p.contract?.clubId === club.id && p.contract.untilSeason <= season && !p.nextContract);
  const leaving = all.filter((p) => p.contract?.clubId === club.id && p.nextContract && p.nextContract.clubId !== club.id);
  const nextRoster = [...staying, ...arriving];
  const imports = nextRoster.filter((p) => !p.nationalities.includes('DE')).length;
  const cost = staying.reduce((s, p) => s + contractCost(p.contract!), 0) + arriving.reduce((s, p) => s + contractCost(p.nextContract!), 0);
  const staff = payrollOf(world, club.id).staff;
  const open = world.market.offers.filter((o) => o.clubId === club.id && o.status === 'open');
  const negotiationsOpen = world.date >= `${season}-11-01` || world.competition!.finished;

  const row = (p: Player, extra: React.ReactNode, onClick?: () => void) => (
    <li key={p.id} onClick={onClick ?? (() => openPlayer(p.id))}>
      <span className={`pos pos-${p.position}`}>{p.position}</span>
      <div className="roster-main">
        <strong><PlayerName p={p} /></strong>
        <small className="muted">{ageOn(p.birthDate, world.date)} J · {extra}</small>
      </div>
      {p.contract?.clubId === club.id ? <RatingBadge p={p} /> : <span className="rating">{toDisplay(overall(p))}</span>}
    </li>
  );

  return (
    <div className="stack">
      <section className="card">
        <h3>Kader {next}/{String(next + 1).slice(2)}</h3>
        <div className="kpis inner">
          {(['F', 'D', 'G'] as const).map((g) => {
            const n = nextRoster.filter((p) => group(p) === g).length;
            return <div key={g} className="kpi"><span>{GROUP_LABEL[g]}</span><strong className={n < TARGET[g] ? 'loss' : ''}>{n} / {TARGET[g]}</strong></div>;
          })}
          <div className="kpi"><span>Ausländerlizenzen</span><strong className={imports > rules.importSlotsRoster ? 'loss' : ''}>{imports} / {rules.importSlotsRoster}</strong></div>
        </div>
        <div className="row-between small"><span>Gebundene Kosten (Spieler)</span><b>{euro(cost)}</b></div>
        <div className="row-between small"><span>Staff</span><b>{euro(staff)}</b></div>
        <div className="row-between small"><span>Gehaltsetat (aktuell)</span><b>{euro(club.finances.salaryBudget)}</b></div>
        <div className="meter big"><div className={cost + staff > club.finances.salaryBudget ? 'over' : ''} style={{ width: `${Math.min(100, ((cost + staff) / club.finances.salaryBudget) * 100)}%` }} /></div>
        <p className="muted small">{negotiationsOpen ? 'Verhandlungsphase läuft – andere Vereine bieten auch für deine Spieler mit auslaufendem Vertrag.' : `Verhandlungen über Vorverträge starten am 1. November. Offene Angebote: ${open.length}.`}</p>
      </section>

      <section className="card flush">
        <h3 className="card-title">Vertrag läuft aus ({expiring.length})</h3>
        <ul className="roster">
          {expiring.length === 0 && <li className="muted static">Keine.</li>}
          {expiring.sort((a, b) => overall(b) - overall(a)).map((p) => {
            const m = marketInfo(world, p, club.id);
            const others = m.interested - (m.myOffer ? 1 : 0);
            const extra = <>
              {m.myOffer ? <span className={`tag ${m.tendency.code === 'leading' ? 'pos' : m.tendency.code === 'behind' ? 'neg' : 'mix'}`}>Angebot läuft</span> : <span className="tag dim">kein Angebot</span>}
              {others > 0 && <span className="tag neg">{others} {others === 1 ? 'anderer Verein' : 'andere Vereine'}</span>}
              {m.decideBy && <span className="tag dim">bis {formatDate(m.decideBy)}</span>}
            </>;
            return row(p, extra, () => setNego(p));
          })}
        </ul>
        <p className="muted small pad">Antippen zum Verlängern. Eigene Spieler haben einen Loyalitätsbonus – gebrochene Versprechen schmälern ihn.</p>
      </section>

      <section className="card flush">
        <h3 className="card-title">Neuzugänge ({arriving.length})</h3>
        <ul className="roster">
          {arriving.length === 0 && <li className="muted static">Noch keine.</li>}
          {arriving.map((p) => row(p, <>{p.contract ? <>kommt von <ClubName c={clubById.get(p.contract.clubId)!} /></> : 'war vereinslos'} · {euro(p.nextContract!.salary)}</>))}
        </ul>
      </section>

      <section className="card flush">
        <h3 className="card-title">Abgänge ({leaving.length})</h3>
        <ul className="roster">
          {leaving.length === 0 && <li className="muted static">Keine.</li>}
          {leaving.map((p) => row(p, <>wechselt zu <ClubName c={clubById.get(p.nextContract!.clubId)!} full /></>))}
        </ul>
      </section>

      <section className="card flush">
        <h3 className="card-title">Unter Vertrag ({staying.length})</h3>
        <ul className="roster">
          {staying.sort((a, b) => overall(b) - overall(a)).map((p) => row(p, <>bis {p.contract!.untilSeason + 1} · {euro(p.contract!.salary)}</>))}
        </ul>
      </section>

      {nego && <Negotiation player={nego} onClose={() => setNego(null)} />}
    </div>
  );
}
