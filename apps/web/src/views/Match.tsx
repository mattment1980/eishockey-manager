import { useEffect, useMemo, useRef, useState } from 'react';
import type { Club } from '@ehm/schema';
import { simulateMatch, teamStrength, isImport, toDisplay, type MatchInput, type MatchResult, type Side, type TeamInput } from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';
import { Rink } from '../components/Rink.tsx';
import { computeLive, cutIndex, type LiveUnit } from '../live.ts';
import { mmss, pct } from '../labels.ts';

type Speed = 'slow' | 'normal' | 'fast';
const SPEED: Record<Speed, number> = { slow: 20, normal: 45, fast: 150 }; // Spielsekunden pro Sekunde
type LiveTab = 'ticker' | 'team' | 'lines' | 'players' | 'map';

function runInWorker(input: MatchInput): Promise<MatchResult> {
  return new Promise((resolve) => {
    try {
      const w = new Worker(new URL('../sim.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<MatchResult>) => { resolve(e.data); w.terminate(); };
      w.onerror = () => { w.terminate(); resolve(simulateMatch(input)); };
      w.postMessage(input);
    } catch {
      resolve(simulateMatch(input));
    }
  });
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
const visible = (c: Club) => (luminance(c.colors.primary) < 0.12 ? c.colors.secondary : c.colors.primary);

export function MatchView() {
  const { world, club, players, byId, addResult } = useStore();
  const opponents = world.clubs.filter((c) => c.id !== club?.id);
  const [oppId, setOppId] = useState(opponents[0]?.id ?? '');
  const [home, setHome] = useState(true);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [sides, setSides] = useState<[Club, Club] | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [tab, setTab] = useState<LiveTab>('ticker');
  const [loading, setLoading] = useState(false);
  const saved = useRef(false);

  const opp = world.clubs.find((c) => c.id === oppId)!;
  const plan = club?.matchplan;
  const rules = world.countries[0].rules;
  const importsDressed = plan ? [...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies].filter((id) => isImport(byId.get(id)!, 'DE')).length : 0;

  const endT = result ? Math.max(...result.events.map((e) => e.t), ...result.ticker.map((t) => t.t)) : 0;
  const finished = !!result && now >= endT;

  // Wiedergabe
  useEffect(() => {
    if (!playing || !result) return;
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
  }, [playing, speed, result, endT]);

  useEffect(() => {
    if (finished && result && sides && !saved.current) {
      saved.current = true;
      setPlaying(false);
      addResult({ date: world.date, homeId: sides[0].id, awayId: sides[1].id, score: result.score, decidedIn: result.decidedIn });
    }
  }, [finished, result, sides, addResult, world.date]);

  const evCut = result ? cutIndex(result.events, now) : 0;
  const live = useMemo(() => (result ? computeLive(result.events, evCut) : null), [result, evCut]);

  if (!club || !plan) return null;

  async function start() {
    if (!club || !plan) return;
    const mine: TeamInput = { clubId: club.id, name: club.name, shortName: club.shortName, plan, players };
    const theirs: TeamInput = { clubId: opp.id, name: opp.name, shortName: opp.shortName, plan: opp.matchplan!, players: world.players.filter((p) => p.contract?.clubId === opp.id) };
    setLoading(true);
    const res = await runInWorker({
      home: home ? mine : theirs, away: home ? theirs : mine,
      seed: Math.floor(Math.random() * 2 ** 31), phase: 'regular', format: world.leagues[0].format,
    });
    saved.current = false;
    setSides(home ? [club, opp] : [opp, club]);
    setResult(res);
    setNow(0);
    setTab('ticker');
    setPlaying(true);
    setLoading(false);
  }

  // ---------------------------------------------------------- Vorbereitung
  if (!result || !sides || !live) {
    const sMine = teamStrength(plan, byId), sOpp = teamStrength(opp.matchplan!, byId);
    return (
      <div className="stack">
        <h2>Testspiel</h2>
        <section className="card">
          <label className="field">
            <span>Gegner</span>
            <select className="select" value={oppId} onChange={(e) => setOppId(e.target.value)}>
              {opponents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="segmented" style={{ marginTop: 12 }}>
            <button className={home ? 'on' : ''} onClick={() => setHome(true)}>Heimspiel</button>
            <button className={!home ? 'on' : ''} onClick={() => setHome(false)}>Auswärtsspiel</button>
          </div>
        </section>
        <section className="card versus">
          <div className="vs-team"><Crest club={home ? club : opp} size={64} /><strong>{(home ? club : opp).shortName}</strong></div>
          <div className="vs-mid">
            <div className="muted small">Kaderstärke</div>
            <div className="vs-bars">
              <span>{toDisplay(home ? sMine : sOpp)}</span>
              <div className="duo"><div style={{ width: `${50 + ((home ? sMine - sOpp : sOpp - sMine) / 2)}%` }} /></div>
              <span>{toDisplay(home ? sOpp : sMine)}</span>
            </div>
            <div className="muted small">{home ? 'Heim' : 'Gast'} gegen {home ? 'Gast' : 'Heim'}</div>
          </div>
          <div className="vs-team"><Crest club={home ? opp : club} size={64} /><strong>{(home ? opp : club).shortName}</strong></div>
        </section>
        {importsDressed > rules.importSlotsGame ? (
          <div className="alert">Zu viele Ausländer aufgestellt ({importsDressed}/{rules.importSlotsGame}). Bitte unter „Reihen“ korrigieren.</div>
        ) : (
          <button className="btn primary big block" onClick={start} disabled={loading}>{loading ? 'Simuliere …' : 'Anpfiff'}</button>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------- Live
  const mySide: Side = sides[0].id === club.id ? 0 : 1;
  const starts = result.events.filter((e) => e.type === 'periodStart');
  const current = [...starts].reverse().find((e) => e.t <= now) ?? starts[0];
  const periodNo = current?.period ?? 1;
  const periodLen = periodNo > 3 ? world.leagues[0].format.regularOvertime.minutes * 60 : 1200;
  const elapsed = Math.min(periodLen, Math.max(0, now - (current?.t ?? 0)));
  const periodName = periodNo <= 3 ? `${periodNo}. Drittel` : 'Verlängerung';
  const shownScore: [number, number] = finished ? result.score : [live.teams[0].goals, live.teams[1].goals];
  const tickerNow = result.ticker.slice(0, cutIndex(result.ticker, now)).reverse();
  const colors: [string, string] = mySide === 0 ? [visible(sides[0]), '#94a3b8'] : ['#94a3b8', visible(sides[1])];
  const nameOf = (id: string) => { const p = byId.get(id); return p ? `${p.firstName[0]}. ${p.lastName}` : id; };

  return (
    <div className="stack">
      <section className="scoreboard">
        <div className="sb-team"><Crest club={sides[0]} size={48} /><span>{sides[0].shortName}</span></div>
        <div className="sb-mid">
          <div className="sb-score">{shownScore[0]}<span>:</span>{shownScore[1]}</div>
          <div className="sb-clock">
            {finished ? `Ende${result.decidedIn === 'OT' ? ' n.V.' : result.decidedIn === 'SO' ? ' n.P.' : ''}` : `${periodName} · ${mmss(elapsed)}`}
          </div>
        </div>
        <div className="sb-team"><Crest club={sides[1]} size={48} /><span>{sides[1].shortName}</span></div>
      </section>

      <div className="controls">
        {!finished && <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Weiter'}</button>}
        {!finished && (
          <div className="segmented small-seg">
            {(['slow', 'normal', 'fast'] as Speed[]).map((s) => (
              <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s === 'slow' ? 'Langsam' : s === 'normal' ? 'Normal' : 'Schnell'}</button>
            ))}
          </div>
        )}
        {!finished && <button className="btn ghost" onClick={() => setNow(endT)}>Ergebnis</button>}
        {finished && <button className="btn primary" onClick={() => { setResult(null); setSides(null); }}>Neues Spiel</button>}
      </div>

      <div className="tabs">
        {([['ticker', 'Ticker'], ['team', 'Team'], ['lines', 'Reihen'], ['players', 'Spieler'], ['map', 'Schüsse']] as [LiveTab, string][]).map(([id, l]) => (
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
          <h3>{club.shortName}: Reihen bei 5-gegen-5</h3>
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

      {tab === 'map' && (
        <section className="card">
          <Rink events={result.events.slice(0, evCut)} colors={colors} mySide={mySide} />
        </section>
      )}
    </div>
  );
}

function TeamTable({ live, names, result }: { live: NonNullable<ReturnType<typeof computeLive>>; names: [string, string]; result: MatchResult | null }) {
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
