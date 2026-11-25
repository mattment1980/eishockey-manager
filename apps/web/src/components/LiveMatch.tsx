import { useEffect, useMemo, useState } from 'react';
import type { Club, LeagueFormat, Matchplan } from '@ehm/schema';
import type { MatchResult, Side } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from './Crest.tsx';
import { Rink } from './Rink.tsx';
import { computeLive, cutIndex, type LiveUnit } from '../live.ts';
import { mmss, pct } from '../labels.ts';

type Speed = 'slow' | 'normal' | 'fast';
const SPEED: Record<Speed, number> = { slow: 20, normal: 45, fast: 150 }; // Spielsekunden pro Sekunde
type LiveTab = 'ticker' | 'team' | 'lines' | 'players' | 'map' | 'coach';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
const visible = (c: Club) => (luminance(c.colors.primary) < 0.12 ? c.colors.secondary : c.colors.primary);

interface Props {
  result: MatchResult;
  sides: [Club, Club];
  mySide: Side;
  plan: Matchplan;
  format: LeagueFormat;
  playoff: boolean;
  subtitle?: string;
  doneLabel: string;
  onDone: () => void;
  busy?: boolean;
}

export function LiveMatch({ result, sides, mySide, plan, format, playoff, subtitle, doneLabel, onDone, busy }: Props) {
  const { byId } = useStore();
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [tab, setTab] = useState<LiveTab>('ticker');

  const endT = useMemo(() => Math.max(...result.events.map((e) => e.t), ...result.ticker.map((t) => t.t)), [result]);
  const finished = now >= endT;

  useEffect(() => {
    if (!playing || finished) return;
    let last = performance.now();
    let raf = 0;
    const loop = (ts: number) => {
      const dt = (ts - last) / 1000;
      last = ts;
      setNow((n) => Math.min(endT, n + dt * SPEED[speed]));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, endT, finished]);

  const evCut = cutIndex(result.events, now);
  const live = useMemo(() => computeLive(result.events, evCut), [result, evCut]);

  const starts = result.events.filter((e) => e.type === 'periodStart');
  const current = [...starts].reverse().find((e) => e.t <= now) ?? starts[0];
  const periodNo = current?.period ?? 1;
  const periodLen = periodNo > 3 && !playoff ? format.regularOvertime.minutes * 60 : 1200;
  const elapsed = Math.min(periodLen, Math.max(0, now - (current?.t ?? 0)));
  const periodName = periodNo <= 3 ? `${periodNo}. Drittel` : playoff ? `${periodNo - 3}. Verlängerung` : 'Verlängerung';
  const shownScore: [number, number] = finished ? result.score : [live.teams[0].goals, live.teams[1].goals];
  const tickerNow = result.ticker.slice(0, cutIndex(result.ticker, now)).reverse();
  const colors: [string, string] = mySide === 0 ? [visible(sides[0]), '#94a3b8'] : ['#94a3b8', visible(sides[1])];
  const nameOf = (id: string) => { const p = byId.get(id); return p ? `${p.firstName[0]}. ${p.lastName}` : id; };
  const me = sides[mySide];

  return (
    <div className="stack">
      <section className="scoreboard">
        {subtitle && <div className="sb-sub">{subtitle}</div>}
        <div className="sb-team"><Crest club={sides[0]} size={48} /><span>{sides[0].shortName}</span></div>
        <div className="sb-mid">
          <div className="sb-score">{shownScore[0]}<span>:</span>{shownScore[1]}</div>
          <div className="sb-clock">
            {finished ? `Ende${result.decidedIn === 'OT' ? ' n.V.' : result.decidedIn === 'SO' ? ' n.P.' : ''}` : `${periodName} · ${mmss(elapsed)}`}
          </div>
        </div>
        <div className="sb-team"><Crest club={sides[1]} size={48} /><span>{sides[1].shortName}</span></div>
      </section>

      {!finished ? (
        <div className="controls">
          <div className="segmented small-seg">
            {(['slow', 'normal', 'fast'] as Speed[]).map((s) => (
              <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s === 'slow' ? 'Langsam' : s === 'normal' ? 'Normal' : 'Schnell'}</button>
            ))}
          </div>
          <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Weiter'}</button>
          <button className="btn ghost" onClick={() => setNow(endT)}>Zum Ergebnis</button>
        </div>
      ) : (
        <button className="btn primary big block" onClick={onDone} disabled={busy}>{busy ? 'Simuliere übrige Spiele …' : doneLabel}</button>
      )}

      <div className="tabs">
        {([['ticker', 'Ticker'], ['team', 'Team'], ['lines', 'Reihen'], ['players', 'Spieler'], ['map', 'Schüsse'], ['coach', 'Coaching']] as [LiveTab, string][]).map(([id, l]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === 'ticker' && (
        <section className="card flush">
          <ul className="ticker">
            {tickerNow.length === 0 && <li className="muted">Gleich geht's los …</li>}
            {tickerNow.map((t, i) => (
              <li key={i} className={`tk-${t.type}`}>
                <span className="tk-time">{t.period <= 3 ? `${t.period}.` : 'OT'} {t.clock}</span>
                <span className="tk-text">{t.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'team' && <TeamTable live={live} names={[sides[0].shortName, sides[1].shortName]} result={finished ? result : null} />}

      {tab === 'lines' && (
        <section className="card">
          <h3>{me.shortName}: Reihen bei 5-gegen-5</h3>
          <UnitTable title="Sturm" units={live.lines[mySide]} labels={plan.forwardLines.map((l, i) => `${i + 1}: ${l.map((id) => byId.get(id)?.lastName).join(' – ')}`)} toi={finished ? result.lineStats[mySide].lines.map((u) => u.toi) : null} />
          <UnitTable title="Verteidigung" units={live.pairs[mySide]} labels={plan.defensePairs.map((l, i) => `${i + 1}: ${l.map((id) => byId.get(id)?.lastName).join(' – ')}`)} toi={finished ? result.lineStats[mySide].pairs.map((u) => u.toi) : null} />
          <p className="muted small">Corsi = Schussversuche für:gegen, xG = erwartete Tore, während die Einheit auf dem Eis ist.</p>
        </section>
      )}

      {tab === 'players' && (
        <section className="card flush">
          <table className="stats">
            <thead><tr><th>Spieler</th><th>T</th><th>A</th><th>S</th><th>xG</th>{finished && <th>+/-</th>}{finished && <th>Eis</th>}<th>Chk</th><th>SM</th></tr></thead>
            <tbody>
              {[...new Set([...plan.forwardLines.flat(), ...plan.defensePairs.flat()])]
                .map((id) => ({ id, s: live.players.get(id) ?? { g: 0, a: 0, sog: 0, att: 0, hits: 0, pim: 0, xg: 0 }, f: result.playerStats.find((p) => p.playerId === id) }))
                .sort((x, y) => y.s.g + y.s.a - (x.s.g + x.s.a) || y.s.xg - x.s.xg)
                .map(({ id, s, f }) => (
                  <tr key={id}>
                    <td>{nameOf(id)}</td><td>{s.g}</td><td>{s.a}</td><td>{s.sog}</td><td>{s.xg.toFixed(2).replace('.', ',')}</td>
                    {finished && <td>{f ? (f.plusMinus > 0 ? '+' : '') + f.plusMinus : ''}</td>}
                    {finished && <td>{f ? mmss(f.toi) : ''}</td>}
                    <td>{s.hits}</td><td>{s.pim}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {finished && (
            <div className="goalie-line">
              {result.playerStats.filter((p) => p.team === mySide && p.shotsAgainst > 0).map((g) => (
                <span key={g.playerId}>Torhüter {nameOf(g.playerId)}: {g.saves}/{g.shotsAgainst} Paraden ({pct(g.saves / g.shotsAgainst)})</span>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'coach' && (
        <section className="card">
          <h3>Coaching-Regeln {me.shortName}</h3>
          {!finished && (
            <ul className="plain small">
              {tickerNow.filter((t) => t.type === 'coach' && t.team === mySide).map((t, i) => <li key={i}><span className="muted">{t.period <= 3 ? `${t.period}.` : 'OT'} {t.clock}</span> {t.text}</li>)}
              {tickerNow.filter((t) => t.type === 'coach' && t.team === mySide).length === 0 && <li className="muted">Noch keine Regel ausgelöst. Den vollständigen Bericht gibt es nach dem Spiel.</li>}
            </ul>
          )}
          {finished && (
            <table className="stats">
              <thead><tr><th>Regel</th><th>×</th><th>Zeit</th><th>Tore</th><th>Schüsse</th></tr></thead>
              <tbody>
                {result.rules.filter((r) => r.team === mySide).map((r) => (
                  <tr key={r.ruleId} className={r.activations ? '' : 'dim-row'}>
                    <td>{r.name}</td><td>{r.activations}</td><td>{r.activeSeconds ? mmss(r.activeSeconds) : '–'}</td>
                    <td>{r.activations ? `${r.goalsFor}:${r.goalsAgainst}` : '–'}</td><td>{r.activations ? `${r.shotsFor}:${r.shotsAgainst}` : '–'}</td>
                  </tr>
                ))}
                {result.rules.filter((r) => r.team === mySide).length === 0 && <tr><td colSpan={5} className="muted">Keine Regeln aktiv.</td></tr>}
              </tbody>
            </table>
          )}
          {finished && (
            <>
              <h3 style={{ marginTop: 16 }}>Reihe gegen Reihe (5-gegen-5)</h3>
              <p className="muted small">Gemeinsame Eiszeit deiner Sturmreihen gegen die gegnerischen Reihen, darunter Schussversuche für:gegen.</p>
              <table className="stats matrix">
                <thead><tr><th>{me.shortName} ↓ / Gegner →</th>{[0, 1, 2, 3].map((k) => <th key={k}>R{k + 1}</th>)}</tr></thead>
                <tbody>
                  {[0, 1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td>Reihe {i + 1}</td>
                      {[0, 1, 2, 3].map((k) => {
                        const [h, a] = mySide === 0 ? [i, k] : [k, i];
                        const toi = result.lineMatrix.toi[h][a];
                        const sf = mySide === 0 ? result.lineMatrix.shotsHome[h][a] : result.lineMatrix.shotsAway[h][a];
                        const sa = mySide === 0 ? result.lineMatrix.shotsAway[h][a] : result.lineMatrix.shotsHome[h][a];
                        return <td key={k} className={sf + sa >= 4 ? (sf / (sf + sa) >= 0.55 ? 'good' : sf / (sf + sa) <= 0.45 ? 'bad' : '') : ''}>{mmss(toi)}<div className="muted small">{sf}:{sa}</div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {finished && (result.emptyNetGoals[0] + result.emptyNetGoals[1] > 0) && <p className="muted small">Tore ins leere Tor: {sides[0].shortName} {result.emptyNetGoals[0]}, {sides[1].shortName} {result.emptyNetGoals[1]}</p>}
        </section>
      )}

      {tab === 'map' && (
        <section className="card">
          <Rink events={result.events.slice(0, evCut)} colors={colors} mySide={mySide} />
        </section>
      )}
    </div>
  );
}

function TeamTable({ live, names, result }: { live: ReturnType<typeof computeLive>; names: [string, string]; result: MatchResult | null }) {
  const [a, b] = live.teams;
  const rows: [string, string | number, string | number, number?, number?][] = [
    ['Tore', a.goals, b.goals],
    ['Schüsse aufs Tor', a.sog, b.sog, a.sog, b.sog],
    ['Schussversuche (Corsi)', a.attempts, b.attempts, a.attempts, b.attempts],
    ['Expected Goals (xG)', a.xg.toFixed(2).replace('.', ','), b.xg.toFixed(2).replace('.', ','), a.xg, b.xg],
    ['Geblockte Schüsse', a.blocked, b.blocked],
    ['Überzahl', `${a.ppg}/${a.pp}`, `${b.ppg}/${b.pp}`],
    ['Strafminuten', a.pim, b.pim],
    ['Bullys', a.faceoffs, b.faceoffs, a.faceoffs, b.faceoffs],
    ['Breakout sauber', a.breakouts ? pct(a.breakoutsClean / a.breakouts) : '–', b.breakouts ? pct(b.breakoutsClean / b.breakouts) : '–', a.breakouts ? a.breakoutsClean / a.breakouts : 0, b.breakouts ? b.breakoutsClean / b.breakouts : 0],
    ['Kontrollierte Eintritte', `${a.entryCtlOk}/${a.entryCtl}`, `${b.entryCtlOk}/${b.entryCtl}`],
    ['Dump-ins zurückerobert', `${a.dumpsOk}/${a.dumps}`, `${b.dumpsOk}/${b.dumps}`],
    ['Checks', a.hits, b.hits],
    ['Puckverluste', a.giveaways, b.giveaways],
  ];
  if (result) rows.push(['Zeit in Angriffszone', mmss(result.teamStats[0].ozoneTime), mmss(result.teamStats[1].ozoneTime)]);
  return (
    <section className="card">
      <div className="cmp-head"><span>{names[0]}</span><span /><span>{names[1]}</span></div>
      {rows.map(([label, x, y, nx, ny]) => (
        <div key={label} className="cmp-row">
          <div className="cmp-vals"><b>{x}</b><span>{label}</span><b>{y}</b></div>
          {nx !== undefined && ny !== undefined && nx + ny > 0 && (
            <div className="cmp-bar"><div style={{ width: `${(nx / (nx + ny)) * 100}%` }} /></div>
          )}
        </div>
      ))}
    </section>
  );
}

function UnitTable({ title, units, labels, toi }: { title: string; units: LiveUnit[]; labels: string[]; toi: number[] | null }) {
  return (
    <table className="stats units">
      <thead><tr><th>{title}</th><th>Corsi</th><th>xG</th><th>Tore</th>{toi && <th>Eis</th>}</tr></thead>
      <tbody>
        {units.map((u, i) => {
          const share = u.cf + u.ca ? u.cf / (u.cf + u.ca) : 0.5;
          return (
            <tr key={i}>
              <td className="unit-name">{labels[i]}</td>
              <td className={share >= 0.55 ? 'good' : share <= 0.45 ? 'bad' : ''}>{u.cf}:{u.ca}</td>
              <td>{u.xgf.toFixed(1).replace('.', ',')}:{u.xga.toFixed(1).replace('.', ',')}</td>
              <td>{u.gf}:{u.ga}</td>
              {toi && <td>{mmss(toi[i])}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
