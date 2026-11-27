import { OFFSEASON_PHASES, phaseDate, regularTable, formatDate } from '@ehm/core';
import { offseasonPhase } from '@ehm/data';
import { useStore } from '../store.tsx';
import { Crest } from '../components/Crest.tsx';
import { FamiliaritySummary } from './Tactics.tsx';
import { YouthDecisions } from './Youth.tsx';
import { TestDayShow } from '../components/testday/TestDayShow.tsx';
import { PhaseReportCard } from '../components/PhaseReportCard.tsx';
import { useEffect, useState } from 'react';

/** Sommerpause in Phasen: Saisonbilanz, Verhandlungen, Saisonwechsel, Trainingslager, Vorbereitung */
export function Offseason() {
  const { world, club, clubById, advanceOffseason } = useStore();
  const phase = offseasonPhase(world) ?? 0;
  const testDay = world.offseason?.testDay;
  const [showTests, setShowTests] = useState(false);
  const reports = world.offseason?.reports ?? {};
  // angezeigter Bericht: standardmäßig der der aktuellen Phase, ältere per Klick auf die Zeitleiste
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => setViewing(null), [phase]);
  // Beim Erreichen des Sommertrainings öffnet sich der Tag der Leistungstests von selbst
  useEffect(() => { if (testDay && !testDay.seen) setShowTests(true); }, [testDay?.seen, testDay?.lines.length]);
  if (!club) return null;
  const comp = world.competition!;
  const ph = OFFSEASON_PHASES[phase];
  const next = OFFSEASON_PHASES[phase + 1];
  const oldSeason = ph.newSeason ? world.season - 1 : world.season;
  const nextLabel = next ? `Weiter: ${next.name}` : 'Saison starten';
  const shown = viewing ?? (reports[ph.id] ? ph.id : null);
  const shownPhase = OFFSEASON_PHASES.find((p) => p.id === shown);
  const firstGame = !next || ph.newSeason ? comp.fixtures.find((f) => f.day === 1)?.date : null;

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Sommerpause</h2>
        <span className="muted small right">{formatDate(world.date)}</span>
      </div>

      <section className="card">
        <ol className="phases">
          {OFFSEASON_PHASES.map((p, i) => (
            <li key={p.id} className={`${i < phase ? 'done' : i === phase ? 'now' : ''}${reports[p.id] ? ' has-report' : ''}${shown === p.id ? ' viewing' : ''}`}
              onClick={reports[p.id] ? () => setViewing(p.id) : undefined}
              data-tip={`${p.name}${phaseDate(oldSeason, i) ? ` · ab ${formatDate(phaseDate(oldSeason, i)!)}` : ''}: ${p.text}${reports[p.id] ? ' – Klick zeigt den Bericht' : ''}`}>
              <i>{i < phase ? '✓' : i + 1}</i><span>{p.name}</span>
            </li>
          ))}
          <li className={phase >= OFFSEASON_PHASES.length ? 'now' : ''} data-tip="Erster Spieltag der neuen Saison"><i>▶</i><span>Saisonstart</span></li>
        </ol>
      </section>

      <section className="card">
        <div className="muted small">Phase {phase + 1} von {OFFSEASON_PHASES.length}</div>
        <h3>{ph.name}</h3>
        <p className="small">{ph.text}</p>
        {!ph.newSeason && phase > 0 && <p className="muted small">Der Markt läuft: Verlängerungen und Vorverträge unter <b>Kader › Planer</b> und <b>Kader › Markt</b>. Neue Verträge gelten ab dem Saisonwechsel.</p>}
        {ph.id === 'summer' && <p className="muted small">Im Sommertraining haben sich die Spieler weiterentwickelt – Junge legen zu, Ältere bauen ab. Die Ergebnisse gibt es beim Tag der Leistungstests, danach wartet der neue Nachwuchsjahrgang auf deine Entscheidung.</p>}
        {ph.id === 'summer' && <p className="muted small">Mit der nächsten Phase greift der Saisonwechsel: Verträge enden, Vorverträge treten in Kraft, neue vereinslose Spieler kommen auf den Markt.</p>}
        {ph.newSeason && <p className="muted small">Stelle jetzt Reihen und Taktik für die Saison ein – im Trainingslager und in der Vorbereitung spielen sich genau diese Reihen und Systeme ein.</p>}
        {firstGame && <p className="muted small">Erster Spieltag: {formatDate(firstGame, true)}</p>}
        <button className="btn primary big block" onClick={advanceOffseason}>{nextLabel}</button>
      </section>

      {shown && shownPhase && reports[shown] && (
        <PhaseReportCard title={`${shown === 'review' ? 'Der Vorstand bewertet die Saison' : `Bericht: ${shownPhase.name}`}${shown !== ph.id ? ' (frühere Phase)' : ''}`} report={reports[shown]} />
      )}

      {testDay && (
        <section className={`card td-teaser ${testDay.seen ? '' : 'fresh'}`}>
          <div className="row-between">
            <div>
              <h3>Tag der Leistungstests {!testDay.seen && <span className="badge-dot">neu</span>}</h3>
              <p className="muted small">Wie haben sich deine Spieler im Sommer entwickelt? Der Trainer stellt die Ergebnisse Spieler für Spieler vor – danach der neue Nachwuchsjahrgang.</p>
            </div>
            <button className={`btn ${testDay.seen ? '' : 'primary'}`} onClick={() => setShowTests(true)}>{testDay.seen ? 'Noch einmal ansehen' : 'Ergebnisse ansehen'}</button>
          </div>
        </section>
      )}
      {showTests && <TestDayShow onClose={() => setShowTests(false)} />}
      {phase === 0 && comp.finished && <SeasonSummary />}
      <YouthDecisions compact />
      {ph.newSeason && <FamiliaritySummary />}

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
      <span hidden>{clubById.size}</span>
    </div>
  );
}

function SeasonSummary() {
  const { world, club, clubById } = useStore();
  const comp = world.competition!;
  if (!club) return null;
  const table = regularTable(world);
  const place = table.findIndex((r) => r.clubId === club.id) + 1;
  const champ = clubById.get(comp.champion!)!;
  const releg = comp.relegated ? clubById.get(comp.relegated)! : null;
  const mySeries = comp.series.filter((s) => s.high === club.id || s.low === club.id);
  const lastSeries = mySeries[mySeries.length - 1];
  const outcome = comp.champion === club.id ? 'Meister! 🏆'
    : comp.relegated === club.id ? 'Abgestiegen'
    : lastSeries ? `${lastSeries.winner === club.id ? 'Gewonnen' : 'Aus'} in: ${lastSeries.roundName}` : '–';
  return (
    <>
      <section className="card champion">
        <Crest club={champ} size={84} />
        <div><div className="muted small">Meister {comp.year}/{String(comp.year + 1).slice(2)}</div><h2>{champ.name}</h2></div>
      </section>
      <section className="kpis">
        <div className="kpi"><span>Hauptrunde</span><strong>Platz {place}</strong></div>
        <div className="kpi"><span>Nachsaison</span><strong>{outcome}</strong></div>
        {releg && <div className="kpi"><span>Absteiger</span><strong>{releg.name}</strong></div>}
        <div className="kpi"><span>Vorstand</span><strong>{club.boardConfidence} % Vertrauen</strong></div>
      </section>
    </>
  );
}
