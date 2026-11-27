import { useState } from 'react';
import type { Club, Fixture } from '@ehm/schema';
import {
  nextFixtureOf, matchInputFor, weekStatus, stageLabel, fixturesOfDay, isImport, formatDate, addDays,
  type MatchResult, type Side,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';
import { LiveMatch } from '../components/LiveMatch.tsx';
import { simMatch, simDay, simDays } from '../worker.ts';
import { Offseason } from './Offseason.tsx';
import { offseasonPhase } from '@ehm/data';
import { ClubName } from '../ui.tsx';
import { dm, WeekStrip, WeekInfo, WeekPlanning, NextGameTile, TableTile, SquadTile } from './Week.tsx';
import { PendingEventCard } from './Events.tsx';

const resultText = (f: Fixture) =>
  f.result ? `${f.result.score[0]}:${f.result.score[1]}${f.result.decidedIn === 'OT' ? ' n.V.' : f.result.decidedIn === 'SO' ? ' n.P.' : ''}` : '–';

export function Matchday({ onTraining, onLeague }: { onTraining: () => void; onLeague: () => void }) {
  const { world, club, byId, clubById, simulate, simulating, startWeek } = useStore();
  const [more, setMore] = useState(false);
  const [allNews, setAllNews] = useState(false);
  const [live, setLive] = useState<{ result: MatchResult; fixture: Fixture; sides: [Club, Club] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  }

  const playLive = () => run('live', async () => {
    if (!next) return;
    const input = { ...matchInputFor(world, next), keepEvents: true };
    const result = await simMatch(input);
    setLive({ result, fixture: next, sides: [clubById.get(next.home)!, clubById.get(next.away)!] });
  });

  const finishLive = () => run('finish', async () => {
    if (!live) return;
    await simulate((w) => simDay(w, { [live.fixture.id]: live.result }));
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

  // Wochenablauf: erst die Woche starten (Training), dann die Spieltage der Woche
  const week = weekStatus(world, club.id);
  const pending = !!club.events.pending;
  const needsStart = !!week?.needsStart;
  const lastDay = comp.day;
  const lastResults = lastDay > 0 ? fixturesOfDay(comp, lastDay) : [];
  const regularRunning = !comp.finalStandings;
  const mySeries = comp.series.filter((s) => s.high === club.id || s.low === club.id);
  const inActiveSeries = mySeries.some((s) => !s.winner);
  const place = comp.finalStandings ? comp.finalStandings.indexOf(club.id) + 1 : 0;
  const waitingForQuarter = !!comp.finalStandings && mySeries.length === 0 && place <= format.directPlayoffs[1];
  const eliminated = !!comp.finalStandings && !next && !inActiveSeries && !waitingForQuarter;
  const survived = eliminated && mySeries.some((s) => s.stage === 'playdowns') && comp.relegated !== club.id;
  const locked = !!busy || simulating;
  const status = !next ? (comp.relegated === club.id ? 'Abgestiegen' : survived ? 'Klassenerhalt geschafft' : eliminated ? 'Saison beendet – die übrigen Serien laufen noch' : waitingForQuarter ? `Platz ${place}: direkt im Viertelfinale – ihr wartet auf die Pre-Playoffs` : 'An diesem Spieltag spielfrei') : null;
  const step = needsStart ? 0 : 1;
  const week0 = week ? dm(week.start) : '';
  const week1 = week ? `${dm(addDays(week.start, 6))}${addDays(week.start, 6).slice(0, 4)}` : '';

  return (
    <div className="stack cockpit">
      <div className="cockpit-bar">
        <div className="cockpit-title">
          <b>{week ? `Woche ${week0} – ${week1}` : 'Spieltag'}</b>
          <span className="muted small">{stageLabel(comp)}</span>
        </div>
        {week && (
          <div className="cockpit-steps small" aria-label="Ablauf der Woche">
            <span className={step === 0 ? 'on' : 'done'}>1 Woche planen</span>
            <span className={step === 1 ? 'on' : ''}>2 Spiele</span>
          </div>
        )}
        <div className="cockpit-actions">
          {pending ? (
            <a className="btn primary" href="#entscheidung">Entscheidung offen ↓</a>
          ) : needsStart ? (
            <button className="btn primary" onClick={startWeek} disabled={locked}>Woche starten</button>
          ) : next ? (
            <>
              <button className="btn primary" onClick={playLive} disabled={locked || !lineupOk}>{busy === 'live' ? 'Lade …' : `Live: ${next.home === club.id ? 'gegen' : 'bei'} ${clubById.get(next.home === club.id ? next.away : next.home)!.shortName}`}</button>
              <button className="btn" onClick={() => run('day', () => simulate((w) => simDay(w)))} disabled={locked || !lineupOk}>{busy === 'day' ? 'Simuliere …' : 'Sofort'}</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => run('day', () => simulate((w) => simDay(w)))} disabled={locked}>{busy === 'day' ? 'Simuliere …' : 'Spieltag simulieren'}</button>
          )}
          <div className="cockpit-more">
            <button className="btn" onClick={() => setMore(!more)} aria-expanded={more} disabled={locked}>Schnell weiter ▾</button>
            {more && (
              <div className="cockpit-menu" onClick={() => setMore(false)}>
                {!next && !eliminated && <button onClick={() => run('own', () => simulate((w) => simDays(w, 100, { untilOwnGameOf: club.id })))}>Bis zum nächsten eigenen Spiel</button>}
                <button onClick={() => run('5', () => simulate((w) => simDays(w, 5)))} disabled={!lineupOk}>5 Spieltage</button>
                {regularRunning && <button onClick={() => run('reg', () => simulate((w) => simDays(w, 200, { untilRegularEnd: true })))} disabled={!lineupOk}>Bis Hauptrundenende</button>}
                {!regularRunning && <button onClick={() => run('all', () => simulate((w) => simDays(w, 200)))} disabled={!lineupOk}>Bis Saisonende</button>}
                <p className="muted small">Eigene Spiele laufen mit deiner Aufstellung und Taktik, das Training nach deinem Plan oder dem des Co-Trainers; offene Entscheidungen trifft der Co-Trainer.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="alert">Die Simulation wurde wegen eines Fehlers abgebrochen ({error}). Der Spielstand ist unverändert.</div>}
      {busy && busy !== 'live' && <p className="muted small">Simuliere …</p>}
      {next && !lineupOk && <div className="alert">Zu viele Ausländer aufgestellt ({importsDressed}/{rules.importSlotsGame}). Bitte unter „Reihen“ korrigieren.</div>}
      {status && <p className="cockpit-status small">{status}</p>}
      <div id="entscheidung"><PendingEventCard /></div>

      {week && <WeekStrip st={week} next={next} />}
      {week && <WeekInfo st={week} />}
      {week && <WeekPlanning st={week} onTraining={onTraining} />}

      <div className="cockpit-tiles">
        {next ? <NextGameTile fixture={next} /> : <section className="card tile"><h3>Nächstes Spiel</h3><p className="small muted">{status}</p></section>}
        <TableTile go={onLeague} />
        <SquadTile />
      </div>

      <div className="cockpit-bottom">
        {lastResults.length > 0 && (
          <section className="card flush">
            <h3 className="card-title">{lastResults[0].stage === 'regular' ? `Spieltag ${lastDay}` : 'Letzter Spieltag'} <span className="muted small">· {formatDate(lastResults[0].date)}</span></h3>
            <ul className="results compact">
              {lastResults.map((f) => {
                const h = clubById.get(f.home)!, a = clubById.get(f.away)!;
                const ser = seriesOf(f);
                const mine = f.home === club.id || f.away === club.id;
                return (
                  <li key={f.id} className={mine ? 'mine' : ''}>
                    <span className="res-team"><ClubName c={h} crest={18} /></span>
                    <b className="res-score">{resultText(f)}</b>
                    <span className="res-team right"><ClubName c={a} /><Crest club={a} size={18} /></span>
                    {ser && <small className="res-series muted">{ser.roundName}: {clubById.get(ser.high)!.shortName} {ser.winsHigh}:{ser.winsLow} {clubById.get(ser.low)!.shortName}{ser.winner ? ` – ${clubById.get(ser.winner)!.shortName} weiter` : ''}</small>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {world.market.news.length > 0 && (
          <section className="card flush">
            <div className="row-between card-title"><h3>Nachrichten</h3>{world.market.news.length > 6 && <button className="btn ghost small" onClick={() => setAllNews(!allNews)}>{allNews ? 'weniger' : 'alle anzeigen'}</button>}</div>
            <ul className="news">
              {world.market.news.slice(0, allNews ? 40 : 6).map((n, i) => (
                <li key={i} className={n.mine ? 'mine' : ''}><small className="muted">{formatDate(n.date)}</small><span>{n.text}</span></li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
