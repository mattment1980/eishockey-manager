import { useMemo, useState } from 'react';
import type { Club, Fixture, Stand, StandValues, World } from '@ehm/schema';
import { STANDS } from '@ehm/schema';
import {
  homeGameForecast, seatsOf, pricesOf, refPrices, cateringMode, cateringSwitchNow, businessManager, actionBlocked, actionFor,
  ACTIONS, actionDef, ST, STAND_LABEL, ATMOSPHERE_LABEL, MOOD_LABEL, ENGINE_CONSTANTS, formatDate, type GameForecast,
} from '@ehm/core';
import { useStore } from '../store.tsx';
import { ClubName } from '../ui.tsx';

function Opp({ id }: { id: string }) {
  const { clubById } = useStore();
  const c = clubById.get(id);
  return c ? <ClubName c={c} /> : <span>{id}</span>;
}
import { euro } from '../labels.ts';

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;
const num = (v: number) => Math.round(v).toLocaleString('de-DE');
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const tk = (v: number) => `${Math.round(v / 1000).toLocaleString('de-DE')} T€`;
/** Heimvorteil im Verhältnis zum Liga-Standard */
const edgeText = (e: number) => {
  const r = e / ENGINE_CONSTANTS.HOME;
  return `${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)} % ggü. Standard`;
};

function homeFixtures(world: World, club: Club): Fixture[] {
  return (world.competition?.fixtures ?? []).filter((f) => f.home === club.id && !f.result).sort((a, b) => a.day - b.day);
}

/** Verein › Stadion: Eintrittspreise, Catering, Fanshop, Spieltagsaktionen, Heimspiel-Berichte */
export function StadiumView() {
  const { world, club } = useStore();
  if (!club) return null;
  const games = club.stadium.games;
  const total = (g: { attendance: StandValues }) => g.attendance.standing + g.attendance.seated + g.attendance.business;
  const avg = games.length ? games.reduce((t, g) => t + total(g), 0) / games.length : 0;
  const atm = games.length ? games.reduce((t, g) => t + g.atmosphere, 0) / games.length : 0;
  const edge = games.length ? games.reduce((t, g) => t + g.homeEdge, 0) / games.length : 0;
  const sold = games.filter((g) => total(g) >= club.arena.capacity * 0.98).length;
  const next = homeFixtures(world, club);

  return (
    <div className="stack">
      <section className="kpis">
        <div className="kpi" data-tip={`${club.arena.name}: ${num(club.arena.capacity)} Plätze`}><span>Ø Zuschauer</span><strong>{games.length ? `${num(avg)} (${Math.round((avg / club.arena.capacity) * 100)} %)` : '–'}</strong></div>
        <div className="kpi" data-tip="Ausverkaufte Heimspiele (mindestens 98 % der Plätze belegt)"><span>Ausverkauft</span><strong>{sold} von {games.length}</strong></div>
        <div className="kpi" data-tip="Stimmung in der Halle (0–100): Auslastung, Stehplatzanteil, Fanstimmung, Derby, Playoffs, Aktionen"><span>Stimmung Ø</span><strong>{games.length ? `${ATMOSPHERE_LABEL(atm)} (${Math.round(atm)})` : '–'}</strong></div>
        <div className="kpi" data-tip="Heimvorteil in der Spiel-Engine aus Menge (Auslastung) und Art (Stimmung) der Zuschauer"><span>Heimvorteil Ø</span><strong>{games.length ? edgeText(edge) : '–'}</strong></div>
        <div className="kpi" data-tip="Fanbasis (langfristig, ändert sich beim Saisonwechsel) und Fanstimmung (kurzfristig)"><span>Fanbasis / Stimmung</span><strong>{Math.round(club.fanBase)} / {MOOD_LABEL(club.mood.fans)}</strong></div>
      </section>

      {next[0] && <NextGame club={club} fixture={next[0]} />}
      <Prices key={JSON.stringify(pricesOf(club))} club={club} />
      <Catering club={club} />
      <Actions club={club} fixtures={next.slice(0, 10)} />
      <Reports club={club} />
    </div>
  );
}

function StandBars({ fc }: { fc: GameForecast }) {
  return (
    <div className="st-bars">
      {STANDS.map((s) => {
        const seats = fc.seats[s], att = fc.attendance[s], want = fc.demand[s];
        const full = want > seats;
        return (
          <div key={s} className="st-bar-row small">
            <span className="st-bar-label">{STAND_LABEL[s]}</span>
            <span className="attr-bar st-bar"><span className={full ? 'hi' : att / seats > 0.7 ? 'mid' : 'lo'} style={{ width: `${Math.min(100, (att / seats) * 100)}%` }} /></span>
            <span className="st-bar-num">{num(att)} / {num(seats)}{full ? <b className="up"> · ausverkauft (+{num(want - seats)})</b> : ''}{s === 'standing' && fc.away ? <span className="muted"> · davon {num(fc.away)} Gäste</span> : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function NextGame({ club, fixture }: { club: Club; fixture: Fixture }) {
  const { world } = useStore();
  const fc = useMemo(() => homeGameForecast(world, fixture), [world, fixture]);
  const action = actionFor(world, club, fixture);
  return (
    <section className="card">
      <div className="row-between">
        <h3>Nächstes Heimspiel: <Opp id={fixture.away} /></h3>
        <span className="muted small">{formatDate(fixture.date, true)}{fc.derby ? ' · Derby' : ''}{action ? ` · Aktion: ${action.label}` : ''}</span>
      </div>
      <p className="small">Prognose <b>{num(fc.total)}</b> Zuschauer ({Math.round(fc.fill * 100)} %), Stimmung <b>{ATMOSPHERE_LABEL(fc.atmosphere)}</b> ({Math.round(fc.atmosphere)}), Heimvorteil {edgeText(fc.homeEdge)}, Eintritt ca. {tk(fc.tickets)}.</p>
      <StandBars fc={fc} />
      <div className="st-factors small">
        <span className="muted">Grundnachfrage {num(fc.base)} (Fanbasis {Math.round(club.fanBase)})</span>
        {fc.factors.map((f) => <span key={f.key} className={`tag ${f.pct > 0 ? 'up' : 'down'}`}>{f.label} {pct(f.pct)}</span>)}
      </div>
      <p className="muted small">Die Prognose rechnet mit dem heutigen Stand (Tabelle, Form, Stimmung). Preise wirken je Bereich: Stehplätze reagieren am stärksten, Business-Plätze am wenigsten.</p>
    </section>
  );
}

function Prices({ club }: { club: Club }) {
  const { world, setTicketPrices, setStadium } = useStore();
  const cur = pricesOf(club), ref = refPrices(club), seats = seatsOf(club);
  const [draft, setDraft] = useState<StandValues>(cur);
  const gm = businessManager(world, club.id);
  const delegated = club.stadium.delegate && !!gm;
  const changed = STANDS.some((s) => draft[s] !== cur[s]);
  const next = homeFixtures(world, club)[0];
  const preview = useMemo(() => {
    if (!next || !changed) return null;
    const w = { ...world, clubs: world.clubs.map((c) => (c.id === club.id ? { ...c, stadium: { ...c.stadium, prices: draft } } : c)) };
    return { now: homeGameForecast(world, next), then: homeGameForecast(w, next) };
  }, [world, club.id, draft, changed, next]);
  return (
    <section className="card">
      <div className="row-between">
        <h3>Eintrittspreise</h3>
        <span className="muted small">Ø {euro(club.finances.ticketPrice)} je Platz</span>
      </div>
      <div className="st-prices">
        {STANDS.map((s: Stand) => (
          <label key={s} className="small">
            <span>{STAND_LABEL[s]} <span className="muted">({num(seats[s])} Plätze · üblich {euro(Math.round(ref[s]))})</span></span>
            <input type="number" min={1} max={500} step={0.5} value={draft[s]} disabled={delegated}
              onChange={(e) => setDraft({ ...draft, [s]: Number(e.target.value) || 1 })} />
          </label>
        ))}
      </div>
      {preview && (
        <p className="small">Nächstes Heimspiel: {num(preview.now.total)} → <b>{num(preview.then.total)}</b> Zuschauer, Eintritt {tk(preview.now.tickets)} → <b>{tk(preview.then.tickets)}</b>.
          {STANDS.reduce((t, s) => t + seats[s] * (draft[s] - cur[s]), 0) > 0 ? ' Preiserhöhungen verärgern die Fans.' : ''}</p>
      )}
      {!delegated && (
        <div className="sp-actions">
          <button className="btn small primary" disabled={!changed} onClick={() => setTicketPrices(draft)}>Preise übernehmen</button>
          <button className="btn small" disabled={!changed} onClick={() => setDraft(cur)}>Zurücksetzen</button>
          <button className="btn small" onClick={() => setDraft({ standing: Math.round(ref.standing * 2) / 2, seated: Math.round(ref.seated * 2) / 2, business: Math.round(ref.business * 2) / 2 })}>übliche Preise</button>
        </div>
      )}
      <div className="st-row small">
        <span data-tip="Aufschlag in den Playoffs. Bis 25 % akzeptieren die Fans ohne Nachfrageverlust.">Playoff-Aufschlag</span>
        <div className="segmented small-seg">
          {[0, 0.1, 0.25, 0.4].map((v) => <button key={v} className={club.stadium.playoffSurcharge === v ? 'on' : ''} onClick={() => setStadium({ playoffSurcharge: v })}>{Math.round(v * 100)} %</button>)}
        </div>
      </div>
      <div className="st-row small">
        <span data-tip="Aufschlag bei Derbys, Playoffs und Spielen gegen Top-4-Teams. Bis 10 % ohne Nachfrageverlust.">Topspiel-Zuschlag</span>
        <div className="segmented small-seg">
          {[0, 0.1, 0.2].map((v) => <button key={v} className={club.stadium.topSurcharge === v ? 'on' : ''} onClick={() => setStadium({ topSurcharge: v })}>{Math.round(v * 100)} %</button>)}
        </div>
      </div>
      {gm ? (
        <>
          <label className="check small">
            <input type="checkbox" checked={club.stadium.delegate} onChange={(e) => setStadium({ delegate: e.target.checked })} />
            Der Geschäftsführer ({gm.staff.firstName} {gm.staff.lastName}) setzt die Preise monatlich nach der Leitlinie
          </label>
          <div className="segmented small-seg">
            {(Object.keys(ST.STRATEGY) as (keyof typeof ST.STRATEGY)[]).map((k) => (
              <button key={k} className={club.stadium.strategy === k ? 'on' : ''} onClick={() => setStadium({ strategy: k })}>{ST.STRATEGY[k].label}</button>
            ))}
          </div>
        </>
      ) : <p className="muted small">Ohne Geschäftsführer setzt du die Preise selbst (Staff-Markt im Reiter Staff).</p>}
    </section>
  );
}

function Catering({ club }: { club: Club }) {
  const { world, setStadium, setCateringMode } = useStore();
  const mode = cateringMode(club);
  const cat = club.stadium.catering;
  const now = cateringSwitchNow(world, club);
  const sum = (k: string) => club.finances.ledger.reduce((t, m) => t + (m.items[k] ?? 0), 0);
  const costs = club.stadium.games.reduce((t, g) => t + g.costs, 0);
  return (
    <section className="card">
      <h3>Catering &amp; Fanshop</h3>
      <div className="st-row small">
        <span>Betrieb</span>
        <div className="segmented small-seg">
          <button className={mode === 'own' ? 'on' : ''} onClick={() => setCateringMode('own')} data-tip="Umsatz gehört dem Verein, dafür Wareneinsatz, Personal und Störfälle – lohnt bei voller Halle">Eigenbetrieb</button>
          <button className={mode === 'lease' ? 'on' : ''} onClick={() => setCateringMode('lease')} data-tip="Feste Pacht je Heimspiel plus 8 % vom Umsatz – sicher, aber weniger Ertrag bei voller Halle">Pächter</button>
        </div>
      </div>
      {cat.nextMode && <p className="small">Wechsel zu <b>{cat.nextMode === 'own' ? 'Eigenbetrieb' : 'Pächter'}</b> zur nächsten Saison vorgemerkt.</p>}
      {!now && !cat.nextMode && <p className="muted small">In der laufenden Saison gilt der Vertrag – ein Wechsel greift zur nächsten Saison.</p>}
      <p className="muted small">{mode === 'own' ? 'Eigenbetrieb: Risiko und Ertrag. Einnahmen schwanken mit den Zuschauern, Personal kostet auch bei leerer Halle, gelegentlich Störungen (Kühlung, Kassen).' : 'Pächter: sicheres Einkommen. Feste Pacht je Heimspiel plus kleine Umsatzbeteiligung – unabhängig davon, wie voll die Halle ist.'}</p>
      <div className="st-row small">
        <span data-tip="Sortiment: Premium steigert die Ausgaben je Kopf und verkürzt Wartezeiten bei voller Halle, kostet aber mehr">Angebot</span>
        <div className="segmented small-seg">
          {(Object.keys(ST.LEVEL) as (keyof typeof ST.LEVEL)[]).map((k) => <button key={k} className={cat.level === k ? 'on' : ''} onClick={() => setStadium({ catering: { level: k } })}>{ST.LEVEL[k].label}</button>)}
        </div>
      </div>
      <div className="st-row small">
        <span data-tip="Preise an den Ständen: günstig freut die Fans, teuer bringt mehr je Kopf und kostet Stimmung">Preisniveau</span>
        <div className="segmented small-seg">
          {(Object.keys(ST.PRICING) as (keyof typeof ST.PRICING)[]).map((k) => <button key={k} className={cat.pricing === k ? 'on' : ''} onClick={() => setStadium({ catering: { pricing: k } })}>{ST.PRICING[k].label}</button>)}
        </div>
      </div>
      <div className="st-row small">
        <span data-tip="Größerer Fanshop: mehr Umsatz, höhere Fixkosten je Monat">Fanshop</span>
        <div className="segmented small-seg">
          {(Object.keys(ST.SHOP) as (keyof typeof ST.SHOP)[]).map((k) => <button key={k} className={club.stadium.shop === k ? 'on' : ''} onClick={() => setStadium({ shop: k })}>{ST.SHOP[k].label}</button>)}
        </div>
      </div>
      <div className="row-between small"><span>Catering {mode === 'own' ? 'Umsatz' : 'Pacht'} (Saison)</span><b>{euro(sum('catering'))}</b></div>
      <div className="row-between small"><span>Spieltagskosten (Catering, Aktionen)</span><b>{euro(costs ? -costs : 0)}</b></div>
      <div className="row-between small"><span>Fanshop Umsatz</span><b>{euro(sum('merch'))}</b></div>
    </section>
  );
}

function Actions({ club, fixtures }: { club: Club; fixtures: Fixture[] }) {
  const { world, setMatchdayAction, setStadium } = useStore();
  const gm = businessManager(world, club.id);
  if (!fixtures.length) return null;
  return (
    <section className="card">
      <div className="row-between">
        <h3>Spieltagsaktionen</h3>
        <span className="muted small">eine Aktion je Heimspiel · kostet keine Trainingseinheit</span>
      </div>
      {gm && (
        <label className="check small">
          <input type="checkbox" checked={club.stadium.autoActions} onChange={(e) => setStadium({ autoActions: e.target.checked })} />
          Der Geschäftsführer plant Aktionen, wo du nichts festlegst (Saisonauftakt, Derbys, Pflichttermine, schwache Nachfrage)
        </label>
      )}
      <table className="stats st-actions">
        <thead><tr><th>Datum</th><th>Gegner</th><th>Aktion</th><th data-tip="Prognose mit der gewählten Aktion">Zuschauer</th><th>Stimmung</th></tr></thead>
        <tbody>
          {fixtures.map((f) => {
            const chosen = club.stadium.actions[f.id] ?? '';
            const auto = !chosen ? actionFor(world, club, f) : null;
            const fc = homeGameForecast(world, f);
            return (
              <tr key={f.id}>
                <td>{shortDate(f.date)}</td>
                <td><Opp id={f.away} />{fc.derby ? <span className="tag">Derby</span> : null}</td>
                <td>
                  <select value={chosen} onChange={(e) => setMatchdayAction(f.id, e.target.value || null)}
                    data-tip={chosen ? `${actionDef(chosen)?.pros} – Nachteil: ${actionDef(chosen)?.cons}` : undefined}>
                    <option value="">{auto ? `– (Geschäftsführer: ${auto.label})` : '– keine –'}</option>
                    {ACTIONS.map((a) => {
                      const why = actionBlocked(world, club, f, a);
                      return <option key={a.id} value={a.id} disabled={!!why}>{a.label}{a.cost ? ` (${tk(a.cost)})` : ''}{why ? ` – ${why}` : ''}</option>;
                    })}
                  </select>
                </td>
                <td>{num(fc.total)} ({Math.round(fc.fill * 100)} %)</td>
                <td>{ATMOSPHERE_LABEL(fc.atmosphere)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">Wiederholte Aktionen wirken schwächer (letzte 4 Heimspiele). Der Business-Spieltag zählt als Pflichttermin für einen Sponsor.</p>
    </section>
  );
}

function Reports({ club }: { club: Club }) {
  const games = [...club.stadium.games].reverse();
  if (!games.length) return <section className="card"><h3>Heimspiele</h3><p className="muted small">Noch kein Heimspiel in dieser Saison.</p></section>;
  return (
    <section className="card">
      <h3>Heimspiele der Saison</h3>
      <div className="scroll-x">
        <table className="stats">
          <thead><tr><th>Datum</th><th>Gegner</th><th data-tip="Steh / Sitz / Business">Zuschauer</th><th>Auslastung</th><th data-tip="keine Karte mehr bekommen">Abgewiesen</th><th>Stimmung</th><th>Eintritt</th><th>Catering</th><th>Kosten</th><th>Aktion</th></tr></thead>
          <tbody>
            {games.map((g) => {
              const t = g.attendance.standing + g.attendance.seated + g.attendance.business;
              return (
                <tr key={g.fixtureId}>
                  <td>{shortDate(g.date)}</td>
                  <td><Opp id={g.opponent} />{g.derby ? ' (D)' : ''}{g.playoffs ? ' (PO)' : ''}</td>
                  <td data-tip={`Steh ${num(g.attendance.standing)} (davon ${num(g.away)} Gäste) · Sitz ${num(g.attendance.seated)} · Business ${num(g.attendance.business)}${g.free ? ` · ${num(g.free)} Freikarten` : ''}`}>{num(t)}</td>
                  <td>{Math.round((t / club.arena.capacity) * 100)} %</td>
                  <td>{g.turnedAway ? num(g.turnedAway) : '–'}</td>
                  <td>{Math.round(g.atmosphere)}</td>
                  <td>{tk(g.tickets)}</td>
                  <td>{tk(g.catering)}</td>
                  <td>{g.costs ? tk(g.costs) : '–'}</td>
                  <td>{g.actionId ? actionDef(g.actionId)?.label ?? g.actionId : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
