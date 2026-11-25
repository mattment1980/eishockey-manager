import { useMemo } from 'react';
import {
  liquidityForecast, payrollOf, CATEGORY_LABEL, INCOME, EXPENSE, GOAL_LABEL, formatMonth, formatDate,
  type LedgerCategory,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { euro } from '../labels.ts';

const mio = (v: number) => `${(v / 1e6).toFixed(2).replace('.', ',')} Mio €`;

export function Finances() {
  const { world, club } = useStore();
  const forecast = useMemo(() => (club ? liquidityForecast(world, club.id) : []), [world, club]);
  if (!club) return null;
  const f = club.finances;
  const pay = payrollOf(world, club.id);
  const payroll = pay.players + pay.perks + pay.staff;
  const usage = payroll / Math.max(1, f.salaryBudget);
  const totals = new Map<LedgerCategory, number>();
  for (const m of f.ledger) for (const [k, v] of Object.entries(m.items)) totals.set(k as LedgerCategory, (totals.get(k as LedgerCategory) ?? 0) + v);
  const inc = INCOME.reduce((s, k) => s + (totals.get(k) ?? 0), 0);
  const exp = EXPENSE.reduce((s, k) => s + (totals.get(k) ?? 0), 0);
  const att = f.attendance;
  const avg = att.length ? att.reduce((a, b) => a + b, 0) / att.length : 0;
  const end = forecast[forecast.length - 1];
  const comp = world.competition!;

  return (
    <div className="stack">
      <section className="kpis">
        <div className="kpi"><span>Kontostand</span><strong className={f.balance < 0 ? 'loss' : ''}>{euro(f.balance)}</strong></div>
        <div className="kpi"><span>Prognose Saisonende</span><strong className={end && end.balance < 0 ? 'loss' : ''}>{end ? euro(end.balance) : '–'}</strong></div>
        <div className="kpi"><span>Ergebnis bisher</span><strong className={inc + exp < 0 ? 'loss' : 'win'}>{euro(inc + exp)}</strong></div>
        <div className="kpi"><span>Etat</span><strong>{mio(f.budget)}</strong></div>
      </section>

      <section className="card">
        <h3>Liquidität</h3>
        <LiquidityChart data={forecast} today={world.date.slice(0, 7)} />
        <p className="muted small">Linie: Kontostand (gestrichelt = Prognose). Balken: Monatsergebnis.</p>
      </section>

      <section className="card">
        <h3>Gehaltsetat</h3>
        <div className="row-between small"><span>Spieler</span><b>{euro(pay.players)}</b></div>
        <div className="row-between small"><span>Nebenleistungen</span><b>{euro(pay.perks)}</b></div>
        <div className="row-between small"><span>Staff</span><b>{euro(pay.staff)}</b></div>
        <div className="row-between small"><span>Gesamt / Etat</span><b>{euro(payroll)} / {euro(f.salaryBudget)}</b></div>
        <div className="meter big"><div className={usage > 1 ? 'over' : ''} style={{ width: `${Math.min(100, usage * 100)}%` }} /></div>
        {usage > 1 && <p className="small loss">Etat um {Math.round((usage - 1) * 100)} % überzogen – kostet monatlich Vorstandsvertrauen.</p>}
        <p className="muted small">Wechselfrist für Sofortverpflichtungen: {formatDate(comp.transferDeadline)}</p>
      </section>

      <section className="card">
        <h3>Vorstand</h3>
        <div className="row-between small"><span>Saisonziel</span><b>{club.seasonGoal ? GOAL_LABEL[club.seasonGoal] : '–'}</b></div>
        <div className="row-between small"><span>Vertrauen</span><b>{club.boardConfidence} %</b></div>
        <div className="meter big"><div className={club.boardConfidence < 35 ? 'over' : ''} style={{ width: `${club.boardConfidence}%` }} /></div>
        <p className="muted small">Steigt mit Tabellenplatz und solider Kasse, sinkt bei Etatüberziehung und negativem Kontostand.</p>
      </section>

      <section className="card">
        <h3>Zuschauer</h3>
        <div className="row-between small"><span>Heimspiele</span><b>{att.length}</b></div>
        <div className="row-between small"><span>Durchschnitt</span><b>{Math.round(avg).toLocaleString('de-DE')}</b></div>
        <div className="row-between small"><span>Auslastung</span><b>{att.length ? Math.round((avg / club.arena.capacity) * 100) : 0} %</b></div>
        <div className="row-between small"><span>Ticketpreis (Ø)</span><b>{euro(f.ticketPrice)}</b></div>
      </section>

      <section className="card flush">
        <h3 className="card-title">Einnahmen & Ausgaben (Saison)</h3>
        <table className="stats">
          <tbody>
            {INCOME.map((k) => <tr key={k}><td>{CATEGORY_LABEL[k]}</td><td className="win">{euro(totals.get(k) ?? 0)}</td></tr>)}
            <tr className="sum"><td><b>Einnahmen</b></td><td><b>{euro(inc)}</b></td></tr>
            {EXPENSE.map((k) => <tr key={k}><td>{CATEGORY_LABEL[k]}</td><td className="loss">{euro(totals.get(k) ?? 0)}</td></tr>)}
            <tr className="sum"><td><b>Ausgaben</b></td><td><b>{euro(exp)}</b></td></tr>
          </tbody>
        </table>
        <p className="muted small pad">Sponsoring {euro(f.sponsorIncome)} und Medien {euro(f.mediaIncome)} pro Saison, monatlich verbucht.</p>
      </section>
    </div>
  );
}

function LiquidityChart({ data, today }: { data: { month: string; income: number; expense: number; balance: number; actual: boolean }[]; today: string }) {
  if (data.length === 0) return <p className="muted small">Noch keine Daten.</p>;
  const W = 340, H = 170, padL = 6, padR = 6, top = 10, bottom = 24;
  const vals = data.flatMap((d) => [d.balance, d.income + d.expense, 0]);
  const max = Math.max(...vals), min = Math.min(...vals);
  const y = (v: number) => top + ((max - v) / Math.max(1, max - min)) * (H - top - bottom);
  const step = (W - padL - padR) / data.length;
  const x = (i: number) => padL + step * i + step / 2;
  const actual = data.filter((d) => d.actual || d.month <= today);
  const line = (list: typeof data, offset: number) => list.map((d, i) => `${i ? 'L' : 'M'}${x(i + offset).toFixed(1)} ${y(d.balance).toFixed(1)}`).join(' ');
  const splitAt = Math.max(0, actual.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Liquiditätsverlauf">
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" />
      {data.map((d, i) => {
        const net = d.income + d.expense;
        const y0 = y(0), y1 = y(net);
        return <rect key={d.month} x={x(i) - step * 0.3} width={step * 0.6} y={Math.min(y0, y1)} height={Math.max(1, Math.abs(y1 - y0))} fill={net >= 0 ? 'var(--good)' : 'var(--goal)'} opacity={d.actual ? 0.8 : 0.35} rx="1.5" />;
      })}
      <path d={line(data.slice(0, splitAt + 1), 0)} fill="none" stroke="var(--ice)" strokeWidth="2" />
      <path d={line(data.slice(splitAt), splitAt)} fill="none" stroke="var(--ice)" strokeWidth="2" strokeDasharray="4 4" />
      {data.map((d, i) => (i % 2 === 0 ? <text key={d.month} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted)">{formatMonth(d.month, true)}</text> : null))}
    </svg>
  );
}
