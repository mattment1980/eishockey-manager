# Stadionbetrieb & Zuschauer (Meilenstein 12a)

Stand: 27.11.2026

## Entscheidungen Matthias

1. **Drei Platzbereiche:** Stehplatz, Sitzplatz, Business/VIP – je eigener Preis, eigene Nachfrage und Preisempfindlichkeit.
2. **Spieltagsaktionen:** eigener Aktionsplatz je Heimspiel (kostet keine Trainingseinheit). Die bisherigen stadionbezogenen Termine (Kindertag, Ticketaktion/Familientag, Sponsorenabend/Business-Spieltag) sind dorthin umgezogen.
3. **Catering-Betrieb als Entscheidung:** Eigenbetrieb = Risiko und Ertrag; Pächter = sicheres Einkommen.
4. **Zuschauer wirken auf den Heimvorteil** – über die **Menge** (Auslastung) und die **Art** (Stimmung in der Halle).
5. **Dauerkarten** kommen später mit dem Ausbau der Sommerpause.

## Aufbau im Code

| Datei | Inhalt |
|---|---|
| `core/stadium.ts` | Parameter `ST`, Halle (`seatsOf`), Preise (`pricesOf`, `refPrices`, `changePrices`), Nachfrage (`homeGameForecast`), Heimvorteil (`homeEdgeOf`), Catering (`cateringOf`), Fanshop (`shopMonth`), Abrechnung (`settleHomeGame`), Planung (`expectedHomeGame`, `expectedShopSeason`), Geschäftsführer/KI (`stadiumMonth`, `strategyPrices`, `suggestAction`), Fanbasis (`fanBaseChange`), Laden alter Stände (`ensureStadium`) |
| `core/stadiumActions.ts` | Katalog der Spieltagsaktionen (`ACTIONS`). Neue Aktion = neuer Eintrag |
| `core/economy.ts` | bucht: Eintritt (`tickets`/`playoffs`), `catering`, `merch` (Fanshop), Kosten `matchday` (Wareneinsatz, Personal, Fanshop, Aktionen) |
| `core/matchday.ts` | Prognose je Heimspiel **vor** dem Anpfiff (`homeEdge` an die Engine), Abrechnung nach dem Spiel |
| `engine/constants.ts` | `HOME` (Standard ohne Zuschauer, z. B. CLI), `HOME_BASE`, `HOME_CROWD`, `HOME_ATMOS` |
| `data/transition.ts` | Fanbasis beim Saisonwechsel (Nachricht für den eigenen Verein) |
| `web/views/Stadium.tsx` | Reiter Verein › Stadion |

Schema v16: `Club.stadium` (Preise, Aufschläge, Catering, Fanshop, Leitlinie, Aktionen, Heimspiel-Berichte), `Club.rivals`, `Club.arena.seats`. Alte Spielstände bekommen beim Laden Platzaufteilung und Derby-Paare (`ensureStadium`).

## Nachfrage je Heimspiel

Grundnachfrage = Fanbasis × 76 × (0,5 + 0,4 × Fanbasis/100). Darauf wirken (additiv, als Prozent angezeigt):

| Faktor | Wirkung |
|---|---|
| Tabellenplatz | ±10 % (ab Spieltag 6) |
| Form (letzte 5) | ±6 % |
| Gegner | Fanbasis und Tabellenplatz des Gegners, etwa −4 … +8 % |
| Derby | +18 % (1 Rivale je Verein) |
| Wettbewerb | Playoffs +15 % + 6 % je Runde; Pre-Playoffs/Playdowns +10 % |
| Wochentag | Sa/So +4 %, Fr 0, Mo–Do −5 … −8 % |
| Saisonphase | Saisonauftakt +10 %, Feiertage (26.12.–6.1.) +8 %, November −4 % |
| Fanstimmung | ±12 % |
| Stars und Eigengewächse | −3 … +7 % |
| Events (Vereinsleben) | Zuschauerbonus aus M10 |
| Spieltagsaktion | je Bereich, mit Abnutzung |
| Zufall | ±4 % |

Je Bereich: Anteil der Plätze × Preisfaktor `(üblicher Preis / Preis)^Elastizität` (Steh 1,2 · Sitz 0,9 · Business 0,6), Stehplatz zusätzlich mit der Fanstimmung, Business mit der Sponsorenstimmung. In den Playoffs akzeptieren die Fans bis 25 % Aufschlag, bei Topspielen (Derby, Top 4, Playoffs) bis 10 %. Gästefans füllen einen Gästeblock im Stehplatzbereich (Derby ×2,2, Playoffs ×1,6). Überhang auf Stehplätzen weicht zu 35 % auf Sitzplätze aus; der Rest wird abgewiesen.

Übliche Preise: Steh 16 €, Sitz 25 €, Business 62 € × Profil (Konzern 1,14 … Aufsteiger 0,86). Hallenaufteilung nach Profil (z. B. Tradition 60/36/4 %, Konzern 42/50/8 %).

## Stimmung und Heimvorteil

Stimmung (0–100) = 5 + 35 × Auslastung + Stehplatzanteil (bis 25) + Fanstimmung + Derby 10 + Playoffs 6–14 + Gästeblock (bis 5) + Aktion.
Heimvorteil = `HOME_BASE` 0,010 + `HOME_CROWD` 0,025 × Auslastung + `HOME_ATMOS` 0,017 × Stimmung/100 → Spanne etwa 0,025–0,052, Liga-Schnitt ≈ 0,040 (= bisheriger fester Wert `HOME`). Heimsiege über 8 Testsaisons unverändert (57,6 % neu gegenüber 57,5 % vorher).

## Catering und Fanshop

- Ausgaben je Kopf: Steh 8 €, Sitz 9 €, Business 30 € (Sponsorenstimmung) × Angebot (Basis 0,85 / Standard 1 / Premium 1,2) × Preisniveau (günstig 0,9 / normal 1 / teuer 1,08) × Sieg, Derby, Playoffs, Aktion; ab 90 % Auslastung Wartezeiten (Premium halbiert den Abschlag). Preisniveau wirkt je Heimspiel leicht auf die Fanstimmung.
- **Eigenbetrieb:** Umsatz gehört dem Verein; Wareneinsatz 34–42 %, Personal 0,9 € je Platz und Heimspiel (auch bei leerer Halle), 4 % Störfall je Heimspiel (3–9 T€). Geschäftsführer senkt die Kosten leicht.
- **Pächter:** feste Pacht 2,2 € je Platz und Heimspiel (nach Angebotsstufe) plus 8 % vom Umsatz.
- Faustregel: Bei voller Halle bringt der Eigenbetrieb rund 15–25 % mehr, bei ~60 % Auslastung ist der Pächter besser.
- Wechsel des Modells sofort vor dem ersten Heimspiel einer Saison und in der Sommerpause, sonst zur nächsten Saison (`nextMode`).
- **Fanshop** (monatlich): Fanbasis × 380 € × Größe (klein/normal/groß) × Erfolg × Saisonkurve (September, Dezember, Playoffs stark; Sommer schwach); Wareneinsatz 45 % + Fixkosten 2/4/7 T€.

## Spieltagsaktionen

| Aktion | Wirkung | Nachteil |
|---|---|---|
| Familientag | Steh/Sitz +16/22 % Nachfrage, Fans, Fanbasis | 30 % Rabatt auf Steh- und Sitzplätze; nur Hauptrunde |
| Kindertag | Fanbasis +0,8, Vorstand, Moral, Freikarten 5 % | 8 T€ |
| Business-Spieltag / Sponsorenabend | Business +35 %, 25 T€, Sponsorenstimmung, **Pflichttermin** | Spieler: Frische, etwas Moral; ruhigere Halle |
| Fan-Tag mit Choreo | Stimmung +14 (Heimvorteil), Fans | 5 T€, Pause 4 Heimspiele |
| Studenten- und Azubitag | junge Zuschauer, Fanbasis | Rabatt; am Wochenende halbe Wirkung |
| Retro-Spiel | Fanshop-Verkauf, Nachfrage | 12 T€, Flop bei schlechter Stimmung |
| Benefizspiel | Sponsoren, Vorstand, Fans | 20 % der Ticketeinnahmen gespendet |
| Ehrung einer Vereinslegende | Nachfrage, Stimmung, Moral | 6 T€, einmal pro Saison |
| Licht- und Lasershow | Nachfrage, Stimmung | 15 T€; nur Saisonauftakt, Derby, Playoffs |
| Freikarten für Vereine und Schulen | 20 % der Halle zusätzlich (ohne Eintritt), Fanbasis | kein Eintrittsgeld |

Wiederholungen in den letzten 4 Heimspielen schwächen die Wirkung (×0,6 je Wiederholung). Mit Geschäftsführer kann „Aktionen planen“ eingeschaltet werden (Vorschlag: Saisonauftakt → Lichtshow, Derby → Fan-Tag, offene Pflichttermine → Business-Spieltag, schwache Nachfrage → Familientag/Freikarten, sonst regelmäßig Kindertag).

## Geschäftsführer und KI

- Leitlinie fanfreundlich (90 % des üblichen Preises) / ausgewogen / gewinnorientiert (112 %); monatliche Anpassung nach den letzten Heimspielen (ausverkauft → +5 %, unter 60 % → −4 %), begrenzt auf 75–140 % des üblichen Preises.
- KI-Vereine: Leitlinie nach Profil (Konzern gewinnorientiert, Ausbildungsverein/Aufsteiger fanfreundlich), Catering-Modell nach Profil (Tradition/Konzern Eigenbetrieb), keine Spieltagsaktionen.
- Preiserhöhungen kosten Fanstimmung (bis −8), Senkungen bringen etwas (bis +3).

## Fanbasis

Beim Saisonwechsel höchstens ±3 Punkte: Zuschauerzuspruch (Nachfrage gegen 80 % der Halle), Endplatzierung, Fanstimmung, Familien-/Nachwuchsaktionen, Erlebnis (Stimmung), leichte Rückkehr zur Mitte. Überfüllte Hallen mit vielen Abgewiesenen kosten etwas (Argument für 12b Stadionausbau).

## Balance (`npx tsx scripts/econ-check.ts 4 2026`)

| | vorher | M12a |
|---|---|---|
| Ø Auslastung | 73 % | 77–79 % |
| Ganz ausverkauft | – | ≈ 12 % der Spiele |
| Heimsiege (8 Saisons, 2 Startwerte) | 57,5 % | 57,6 % |
| Ø Heimvorteil | 0,040 fest | 0,040 (0,025–0,052) |
| Catering + Merch netto je Verein | ≈ 460 T€ | ≈ 500 T€ |

Die Saisonplanung rechnet die erwarteten Spieltagserlöse aus den aktuellen Preisen (`expectedHomeGame` × `PLAN_UPLIFT`), die Sponsorenplanung gleicht aus. Langzeit-Balance (`pnpm sim seasons 10`) unverändert.

## Offen

- Dauerkarten (mit dem Ausbau der Sommerpause; Geld vorab, Grundauslastung)
- Spieltagsaktionen für KI-Vereine
- Rivalitäten in der Datenwerkstatt bearbeiten (derzeit feste Paare aus dem Startwert)
- Zuschauerzahl und Stimmung im Live-Ticker
- 12b Stadionausbau: Plätze je Bereich, Komfort, Logen, Bauzeit, Finanzierung
