import { useState } from 'react';
import type { SponsorDeal, SponsorOffer, SponsorBonus } from '@ehm/schema';
import { SLOT, SLOT_ORDER, TYPE, BONUS_LABEL, SPON, activeDeals, dealOf, sponsorAnnual, openSponsorTermine, businessManager, offerValue, seasonLabel, SPONSOR_LABEL } from '@ehm/core';
import { useStore } from '../store.tsx';
import { euro } from '../labels.ts';

const STRATEGY = { safe: 'Sicheres Geld', balanced: 'Ausgewogen', bonus: 'Hohe Boni' } as const;
const tk = (v: number) => `${Math.round(v / 1000).toLocaleString('de-DE')} T€`;

function Bonuses({ list }: { list: SponsorBonus[] }) {
  if (!list.length) return <span className="muted small">keine Boni</span>;
  return (
    <span className="sp-bonuses">
      {list.map((b, i) => (
        <span key={i} className="tag" data-tip={b.kind === 'attendance' ? `Zuschauerschnitt mindestens ${Math.round((b.threshold ?? 0) * 100)} % der Halle` : BONUS_LABEL[b.kind]}>
          {BONUS_LABEL[b.kind]}{b.kind === 'attendance' ? ` ≥ ${Math.round((b.threshold ?? 0) * 100)} %` : ''}: +{tk(b.amount)}
        </span>
      ))}
    </span>
  );
}

/** Verein › Sponsoren: Flächen, Partner, Angebote und Verhandlungen */
export function SponsorsView() {
  const { world, club, setSponsorPolicy } = useStore();
  if (!club) return null;
  const season = world.season;
  const deals = activeDeals(club, season);
  const fix = sponsorAnnual(club, season);
  const bonusMax = deals.reduce((s, d) => s + d.bonuses.reduce((a, b) => a + b.amount, 0), 0);
  const termineOpen = openSponsorTermine(club, season);
  const termineAll = deals.reduce((s, d) => s + d.termine, 0);
  const gm = businessManager(world, club.id);
  const offers = club.sponsors.offers;
  const nextSeason = world.offseason ? season + 1 : season;

  return (
    <div className="stack">
      <section className="kpis">
        <div className="kpi" data-tip="Summe der Grundbeträge pro Saison (Business-Club schwankt mit der Sponsorenstimmung)"><span>Sponsoring fix</span><strong>{euro(Math.round(fix))}</strong></div>
        <div className="kpi" data-tip="Alle Boni zusammen, wenn jedes Ziel erreicht wird"><span>Boni möglich</span><strong>{euro(bonusMax)}</strong></div>
        <div className="kpi" data-tip="Pflichttermine der Partner in dieser Saison. Erfüllt werden sie mit der Spieltagsaktion „Business-Spieltag“ (Verein › Stadion) und dem Termin „Werbedreh“ beim Wochenstart. Fehlende Termine kosten am Saisonende Zufriedenheit."><span>Pflichttermine offen</span><strong className={termineOpen > 0 ? '' : 'up'}>{termineOpen} von {termineAll}</strong></div>
        <div className="kpi"><span>Sponsoren-Stimmung</span><strong>{SPONSOR_LABEL(club.mood.sponsors)} ({Math.round(club.mood.sponsors)})</strong></div>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Geschäftsführer</h3>
          {gm && <span className="muted small">{gm.staff.firstName} {gm.staff.lastName} · Vermarktung {gm.skill}</span>}
        </div>
        {gm ? (
          <>
            <label className="check small">
              <input type="checkbox" checked={club.sponsors.delegate} onChange={(e) => setSponsorPolicy({ delegate: e.target.checked })} />
              Der Geschäftsführer verhandelt und unterschreibt selbst (nach der Leitlinie unten)
            </label>
            <div className="segmented small-seg">
              {(Object.keys(STRATEGY) as (keyof typeof STRATEGY)[]).map((k) => (
                <button key={k} className={club.sponsors.strategy === k ? 'on' : ''} onClick={() => setSponsorPolicy({ strategy: k })}>{STRATEGY[k]}</button>
              ))}
            </div>
            <p className="muted small">Ein guter Geschäftsführer holt mehr aus Verhandlungen heraus – auch wenn du selbst verhandelst, hebt er die Schmerzgrenze der Partner leicht an.</p>
          </>
        ) : (
          <p className="small">Kein Geschäftsführer angestellt – du verhandelst selbst. Kandidaten findest du im Reiter <b>Staff</b> auf dem Staff-Markt. Offene Flächen unterschreibt sonst zum Saisonwechsel der Vorstand (sicheres Geld, ohne Verhandlung).</p>
        )}
      </section>

      {offers.length > 0 && <p className="alert small">{offers.length} {offers.length === 1 ? 'Angebot wartet' : 'Angebote warten'} auf eine Entscheidung{world.offseason ? ' – Verträge gelten ab der neuen Saison' : ''}.</p>}

      {SLOT_ORDER.map((slot) => {
        const deal = dealOf(club, slot, season);
        const nextDeal = world.offseason ? dealOf(club, slot, nextSeason) : deal;
        const slotOffers = offers.filter((o) => o.slot === slot).sort((a, b) => offerValue(b) - offerValue(a));
        return (
          <section key={slot} className={`card sp-slot${!deal ? ' empty' : ''}`}>
            <div className="row-between">
              <div>
                <h3>{SLOT[slot].label}</h3>
                <div className="muted small">{SLOT[slot].area} · üblicher Anteil {Math.round(SLOT[slot].share * 100)} % des Sponsorings</div>
              </div>
              {deal && deal.untilSeason <= season && <span className="tag warn-tag">läuft aus</span>}
              {!deal && <span className="tag">frei</span>}
            </div>
            {deal && <DealRow d={deal} />}
            {world.offseason && nextDeal && nextDeal !== deal && <p className="small">Ab {seasonLabel(nextSeason)}: <b>{nextDeal.name}</b> ({tk(nextDeal.base)} pro Saison)</p>}
            {slotOffers.map((o) => <OfferRow key={`${o.id}-${o.round}`} o={o} />)}
          </section>
        );
      })}
      <p className="muted small">Pflichttermine erledigst du mit der Spieltagsaktion „Business-Spieltag“ (Verein › Stadion) oder dem Termin „Werbedreh“ beim Wochenstart (Reiter Spieltag). Boni werden nach der Saison ausgezahlt.</p>
    </div>
  );
}

function DealRow({ d }: { d: SponsorDeal }) {
  const sat = Math.round(d.satisfaction);
  const tone = sat >= 65 ? 'hi' : sat >= 45 ? 'mid' : sat >= 25 ? 'lo' : 'bad';
  return (
    <div className="sp-deal">
      <div className="sp-deal-head">
        <b>{d.name}</b> <span className="tag" data-tip={TYPE[d.type].wants}>{TYPE[d.type].label}</span>
        {d.relegationExit && <span className="tag" data-tip="Der Partner steigt bei einem Abstieg aus">Abstiegsklausel</span>}
      </div>
      <div className="sp-deal-grid small">
        <span><span className="muted">Grundbetrag</span> <b>{tk(d.base)}</b>/Saison</span>
        <span><span className="muted">bis</span> {seasonLabel(d.untilSeason)}</span>
        <span data-tip="Pflichttermine in dieser Saison (erledigt / vereinbart)"><span className="muted">Termine</span> {d.termineDone}/{d.termine}</span>
        <span className="sp-sat" data-tip={`Zufriedenheit ${sat} – unter ${SPON.QUIT_BELOW} kündigt der Partner. ${TYPE[d.type].wants}.`}>
          <span className="muted">Zufriedenheit</span>
          <span className="attr-bar"><span className={tone} style={{ width: `${sat}%` }} /></span>
        </span>
      </div>
      <Bonuses list={d.bonuses} />
    </div>
  );
}

function OfferRow({ o }: { o: SponsorOffer }) {
  const { acceptSponsor, rejectSponsor, negotiateSponsor } = useStore();
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(Math.round((o.base * 1.1) / 1000) * 1000);
  const [termine, setTermine] = useState(o.termine);
  const final = o.round >= SPON.MAX_ROUNDS;
  return (
    <div className="sp-offer">
      <div className="sp-deal-head">
        <span className="muted small">Angebot</span> <b>{o.name}</b> <span className="tag" data-tip={TYPE[o.type].wants}>{TYPE[o.type].label}</span>
        {o.relegationExit && <span className="tag" data-tip="Der Partner steigt bei einem Abstieg aus">Abstiegsklausel</span>}
        <span className="muted small">· Runde {o.round}/{SPON.MAX_ROUNDS}</span>
      </div>
      <div className="sp-deal-grid small">
        <span><span className="muted">Grundbetrag</span> <b>{tk(o.base)}</b>/Saison</span>
        <span><span className="muted">Laufzeit</span> {o.years} {o.years === 1 ? 'Saison' : 'Saisons'}</span>
        <span><span className="muted">Pflichttermine</span> {o.termine} pro Saison</span>
      </div>
      <Bonuses list={o.bonuses} />
      {o.reply && <p className="small sp-reply">„{o.reply}“</p>}
      <div className="sp-actions">
        <button className="btn small primary" onClick={() => acceptSponsor(o.id)}>Annehmen</button>
        {!final && <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Abbrechen' : 'Verhandeln …'}</button>}
        <button className="btn ghost small" onClick={() => rejectSponsor(o.id)}>Ablehnen</button>
      </div>
      {open && !final && (
        <div className="sp-negotiate small">
          <label>Grundbetrag fordern{' '}
            <select className="select" value={base} onChange={(e) => setBase(Number(e.target.value))}>
              {[1, 1.05, 1.1, 1.15, 1.2, 1.3, 1.4].map((f) => { const v = Math.round((o.base * f) / 1000) * 1000; return <option key={f} value={v}>{tk(v)} ({f === 1 ? 'wie angeboten' : `+${Math.round((f - 1) * 100)} %`})</option>; })}
            </select>
          </label>
          <label>Pflichttermine{' '}
            <select className="select" value={termine} onChange={(e) => setTermine(Number(e.target.value))}>
              {Array.from({ length: o.termine + 2 }, (_, i) => i).map((n) => <option key={n} value={n}>{n}{n < o.termine ? ' (weniger – kostet Spielraum)' : n > o.termine ? ' (mehr – gibt Spielraum)' : ''}</option>)}
            </select>
          </label>
          <button className="btn small primary" onClick={() => { negotiateSponsor(o.id, { base, termine }); setOpen(false); }}>Forderung stellen</button>
          <span className="muted">Je höher die Forderung, desto größer das Risiko, dass der Partner abspringt. Nach der 3. Runde gilt sein letztes Wort.</span>
        </div>
      )}
    </div>
  );
}
