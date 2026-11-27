import { useState } from 'react';
import type { Club, Fixture } from '@ehm/schema';
import {
  nextFixtureOf, matchInputFor, stageLabel, fixturesOfDay, regularTable, teamStrength, isImport, toDisplay, formatDate,
  type MatchResult, type Side,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';
import { LiveMatch } from '../components/LiveMatch.tsx';
import { simMatch, simDay, simDays } from '../worker.ts';
import { Offseason } from './Offseason.tsx';
import { offseasonPhase } from '@ehm/data';
import { ClubName } from '../ui.tsx';

const resultText = (f: Fixture) =>
  f.result ? `${f.result.score[0]}:${f.result.score[1]}${f.result.decidedIn === 'OT' ? ' n.V.' : f.result.decidedIn === 'SO' ? ' n.P.' : ''}` : '–';

export function Matchday() {
  const { world, club, byId, clubById, applyWorld } = useStore();
  const [live, setLive] = useState<{ result: MatchResult; fixture: Fixture; sides: [Club, Club] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const comp = world.competition!;
  if (!club || !club.matchplan) return null;
  const plan = club.matchplan;
  const rules = world.countries[0].rules;
  const format = world.leagues[0].format;
  const next = nextFixtureOf(comp, club.id);
  const importsDressed = [...plan.forwardLines.flat(), ...plan.defensePairs.flat(), ...plan.goalies].filter((id) => isImport(byId.get(id)!, 'DE')).length;
  const lineupOk = importsDressed <= rules.importSlotsGame;
  const seriesOf = (f: Fixture) => comp.series.find((s) => s.id === f.seriesId);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  }

  const playLive = () => run('live', async () => {
    if (!next) return;
    const input = { ...matchInputFor(world, next), keepEvents: true };
    const result = await simMatch(input);
    setLive({ result, fixture: next, sides: [clubById.get(next.home)!, clubById.get(next.away)!] });
  });

  const finishLive = () => run('finish', async () => {
    if (!live) return;
    applyWorld(await simDay(world, { [live.fixture.id]: live.result }));
    setLive(null);
  });

  if (live) {
    const ser = seriesOf(live.fixture);
    return (
      <LiveMatch
        result={live.result}
        sides={live.sides}
        mySide={(live.sides[0].id === club.id ? 0 : 1) as Side}
        plan={plan}
        format={format}
        playoff={live.fixture.stage !== 'regular'}
        subtitle={ser ? `${ser.roundName} · Spiel ${live.fixture.gameNo}` : `Spieltag ${live.fixture.day}`}
        doneLabel="Spieltag abschließen"
        onDone={finishLive}
        busy={busy === 'finish'}
      />
    );
  }

  // --- Sommerpause (Saisonende bis Saisonstart)
  if (offseasonPhase(world) !== null) return <Offseason />;

  const lastDay = comp.day;
  const lastResults = lastDay > 0 ? fixturesOfDay(comp, lastDay) : [];
  const regularRunning = !comp.finalStandings;
  const mySeries = comp.series.filter((s) => s.high === club.id || s.low === club.id);
  const inActiveSeries = mySeries.some((s) => !s.winner);
  const place = comp.finalStandings ? comp.finalStandings.indexOf(club.id) + 1 : 0;
  const waitingForQuarter = !!comp.finalStandings && mySeries.length === 0 && place <= format.directPlayoffs[1];
  const eliminated = !!comp.finalStandings && !next && !inActiveSeries && !waitingForQuarter;
  const survived = eliminated && mySeries.some((s) => s.stage === 'playdowns') && comp.relegated !== club.id;

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Spieltag</h2>
        <span className="muted small right">{stageLabel(comp)}<br />{formatDate(comp.fixtures.find((f) => f.day === comp.day + 1)?.date ?? world.date, true)}</span>
      </div>

      {next ? (
        <NextGame fixture={next} club={club} seriesInfo={seriesOf(next)} />
      ) : (
        <section className="card">
          <h3>{comp.relegated === club.id ? 'Abgestiegen' : survived ? 'Klassenerhalt geschafft' : eliminated ? 'Für euch ist die Saison beendet' : waitingForQuarter ? 'Direkt im Viertelfinale' : 'Spielfrei'}</h3>
          <p className="muted small">
            {eliminated ? 'Die übrigen Serien laufen noch. Du kannst sie simulieren.'
              : waitingForQuarter ? `Platz ${place} nach der Hauptrunde – ihr wartet, bis die Pre-Playoffs entschieden sind.`
              : 'An diesem Spieltag seid ihr nicht im Einsatz.'}
          </p>
        </section>
      )}

      {next && !lineupOk && <div className="alert">Zu viele Ausländer aufgestellt ({importsDressed}/{rules.importSlotsGame}). Bitte unter „Reihen“ korrigieren.</div>}

      {next ? (
        <div className="btn-row">
          <button className="btn primary big" onClick={playLive} disabled={!!busy || !lineupOk}>{busy === 'live' ? 'Lade …' : 'Live spielen'}</button>
          <button className="btn big" onClick={() => run('day', async () => applyWorld(await simDay(world)))} disabled={!!busy || !lineupOk}>
            {busy === 'day' ? 'Simuliere …' : 'Sofort simulieren'}
          </button>
        </div>
      ) : (
        <button className="btn primary big block" onClick={() => run('day', async () => applyWorld(await simDay(world)))} disabled={!!busy}>
          {busy === 'day' ? 'Simuliere …' : 'Spieltag simulieren'}
        </button>
      )}

      <section className="card">
        <h3>Schnell weiter</h3>
        <div className="segmented">
          {!next && !eliminated && <button onClick={() => run('own', async () => applyWorld(await simDays(world, 100, { untilOwnGameOf: club.id })))} disabled={!!busy}>Bis zum nächsten Spiel</button>}
          <button onClick={() => run('5', async () => applyWorld(await simDays(world, 5)))} disabled={!!busy || !lineupOk}>5 Spieltage</button>
          {regularRunning && <button onClick={() => run('reg', async () => applyWorld(await simDays(world, 200, { untilRegularEnd: true })))} disabled={!!busy || !lineupOk}>Bis Hauptrundenende</button>}
          {!regularRunning && <button onClick={() => run('all', async () => applyWorld(await simDays(world, 200)))} disabled={!!busy || !lineupOk}>Bis Saisonende</button>}
        </div>
        {busy && busy !== 'live' && <p className="muted small hint">Simuliere …</p>}
        <p className="muted small hint">Eigene Spiele werden dabei mit deiner aktuellen Aufstellung und Taktik simuliert.</p>
      </section>

      {world.market.news.length > 0 && (
        <section className="card flush">
          <h3 className="card-title">Nachrichten</h3>
          <ul className="news">
            {world.market.news.slice(0, 8).map((n, i) => (
              <li key={i} className={n.mine ? 'mine' : ''}><small className="muted">{formatDate(n.date)}</small><span>{n.text}</span></li>
            ))}
          </ul>
        </section>
      )}

      {lastResults.length > 0 && (
        <section className="card flush">
          <h3 className="card-title">Ergebnisse {lastResults[0].stage === 'regular' ? `Spieltag ${lastDay}` : 'letzter Spieltag'} <span className="muted small">· {formatDate(lastResults[0].date)}</span></h3>
          <ul className="results">
            {lastResults.map((f) => {
              const h = clubById.get(f.home)!, a = clubById.get(f.away)!;
              const ser = seriesOf(f);
              const mine = f.home === club.id || f.away === club.id;
              return (
                <li key={f.id} className={mine ? 'mine' : ''}>
                  <span className="res-team"><ClubName c={h} crest={22} /></span>
                  <b className="res-score">{resultText(f)}</b>
                  <span className="res-team right"><ClubName c={a} /><Crest club={a} size={22} /></span>
                  {ser && <small className="res-series muted">{ser.roundName}: {clubById.get(ser.high)!.shortName} {ser.winsHigh}:{ser.winsLow} {clubById.get(ser.low)!.shortName}{ser.winner ? ` – ${clubById.get(ser.winner)!.shortName} weiter` : ''}</small>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function NextGame({ fixture, club, seriesInfo }: { fixture: Fixture; club: Club; seriesInfo?: { roundName: string; high: string; winsHigh: number; winsLow: number } }) {
  const { world, byId, clubById } = useStore();
  const home = clubById.get(fixture.home)!, away = clubById.get(fixture.away)!;
  const opp = home.id === club.id ? away : home;
  const sHome = teamStrength(home.matchplan!, byId), sAway = teamStrength(away.matchplan!, byId);
  const table = regularTable(world);
  const rank = (id: string) => table.findIndex((r) => r.clubId === id) + 1;
  let seriesText = '';
  if (seriesInfo) {
    const iAmHigh = seriesInfo.high === club.id;
    const [me, them] = iAmHigh ? [seriesInfo.winsHigh, seriesInfo.winsLow] : [seriesInfo.winsLow, seriesInfo.winsHigh];
    seriesText = `${seriesInfo.roundName} · Spiel ${fixture.gameNo} · Serie ${me}:${them}`;
  }
  return (
    <section className="card versus-card">
      <div className="muted small center">{seriesText || `Spieltag ${fixture.day} · ${home.id === club.id ? 'Heimspiel' : 'Auswärtsspiel'}`} · {formatDate(fixture.date, true)}</div>
      <div className="versus">
        <div className="vs-team"><Crest club={home} size={60} /><strong>{home.shortName}</strong><small className="muted">{rank(home.id)}. Platz</small></div>
        <div className="vs-mid">
          <div className="muted small">Kaderstärke</div>
          <div className="vs-bars">
            <span data-tip="Kaderstärke der Aufstellung (1–20)">{toDisplay(sHome)}</span>
            <div className="duo"><div style={{ width: `${50 + (sHome - sAway) / 2}%` }} /></div>
            <span>{toDisplay(sAway)}</span>
          </div>
          <div className="muted small">gegen <ClubName c={opp} full /></div>
        </div>
        <div className="vs-team"><Crest club={away} size={60} /><strong>{away.shortName}</strong><small className="muted">{rank(away.id)}. Platz</small></div>
      </div>
    </section>
  );
}
