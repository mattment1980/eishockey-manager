# Sponsoring (Meilenstein 11)

Stand: 27.11.2026 · Code: `packages/core/src/sponsors.ts`, Ansicht `apps/web/src/views/Sponsors.tsx` (Verein › Sponsoren)

## Entscheidungen Matthias

- 7 Bereiche mit 9 Werbeflächen
- Verhandeln über bis zu 3 Runden
- Geschäftsführer wird gleich mit eingeführt (Staff-Rolle `manager`, Wert `business`)
- Pflichttermine sind Teil der Verhandlung

## Werbeflächen

| Fläche | Bereich | Anteil am Sponsoring | Pflichttermine |
|---|---|---|---|
| Hauptsponsor | Trikotbrust | 27 % | 2–4 |
| Business-Club | Sponsorenpool & Logen | 17,5 % | 1–2 |
| Bande | Bandenpool | 15 % | 0–1 |
| Hallenname | Namensrecht der Halle | 12 % | 1–3 |
| Eisfläche | Mittelkreis & Bullypunkte | 9 % | 1–2 |
| Trikotärmel, Helm, Hose | Trikot | je ca. 5 % | 0–1 |
| Ausrüster | Ausrüstung & Teamkleidung | 5 % | 0–1 |

Die Summe der Anteile entspricht dem bisherigen Planwert `finances.sponsorIncome` des Vereins. Der Business-Club schwankt zusätzlich mit der Sponsorenstimmung (×0,8 bis ×1,2).

## Partner-Typen

| Typ | Will | Zahlt | Zufriedenheit hängt ab von |
|---|---|---|---|
| Regionaler Mittelständler | Fannähe, Treue | etwas unter Schnitt | Fanstimmung, verzeiht Durststrecken |
| Konzern | Erfolg, Sichtbarkeit | gut, hoher Bonusanteil | Tabellenplatz gegen Saisonziel; Abstiegsklausel |
| Brauerei | volle Halle | Schnitt | Auslastung; Bonus nach Zuschauerschnitt |
| Autohaus | Spieler in der Werbung | etwas unter Schnitt | erledigte Pflichttermine |
| Bank / Versicherung | sauberes Image | etwas über Schnitt | Skandale der letzten 60 Tage (Feiern, Pyro, Streit, Protest) |
| Start-up | Aufmerksamkeit | sehr gut | Fanstimmung; kann pleitegehen (ca. 1,2 % pro Monat); Abstiegsklausel |

Neue Typen oder Flächen: Einträge in `TYPE` bzw. `SLOT` ergänzen. Die Namen sind Fantasienamen aus Wortlisten und sind je Verein eindeutig.

## Vertrag

Ein Vertrag besteht aus:
- Grundbetrag pro Saison (monatlich gebucht)
- Boni: Playoffs, Halbfinale, Meisterschaft, Top 6 der Hauptrunde, Zuschauerschnitt; ausgezahlt nach der Saison in der Saisonbilanz
- Pflichttermine pro Saison
- Laufzeit
- gegebenenfalls Abstiegsklausel

**Pflichttermine** erledigt man über die Termine „Sponsorenabend“ und „Werbedreh“ beim Wochenstart. Gutgeschrieben wird dem Partner mit dem größten Rückstand. Jeder nicht erledigte Termin kostet am Saisonende 12 Punkte Zufriedenheit.

**Zufriedenheit** (0–100, Start 60–65) bewegt sich monatlich in Richtung eines Zielwerts. Dieser setzt sich zusammen aus der Sponsorenstimmung und dem Typ-Wunsch. Unter 15 steigt der Partner aus.

## Ablauf in der Saison

- **Monatlich** (`sponsorMonth`):
  - Zufriedenheit anpassen
  - Start-up-Pleiten
  - Ausstiege
  - abgelaufene Angebote entfernen
  - Angebote für freie Flächen: 35 % Chance je Fläche, Wert ×0,75
- **Saisonende** (`sponsorSeasonEnd`): Boni auszahlen, Strafen für fehlende Termine verrechnen.
- **Vertragsgespräche in der Sommerpause** (`sponsorSummer`):
  - Absteiger verlieren Partner mit Klausel.
  - Für jede auslaufende oder freie Fläche gibt es 2–3 neue Angebote.
  - Ein zufriedener bisheriger Partner (ab 40) bietet eine Verlängerung an.
  - Die Angebote gelten bis zum Saisonwechsel.
- **Saisonwechsel** (`sponsorKickoff`, vor `seasonTransition`):
  - Was noch offen ist, unterschreibt der Geschäftsführer (wenn delegiert) oder der Vorstand (sichere Variante).
  - Flächen ohne Angebot bekommen eine Notlösung zu 75 %.
  - Abgelaufene Verträge werden entfernt.
  - Ergebnis: Jeder Verein startet mit allen 9 Flächen belegt.

## Verhandeln

Je Angebot kann man in bis zu 3 Runden den Grundbetrag fordern (wie angeboten bis +40 %) und die Zahl der Pflichttermine.

- Jeder Partner hat eine verdeckte Schmerzgrenze (`limit`, je Typ 5–30 % über dem Angebot). Ein guter Geschäftsführer hebt sie an (+0,4 % je Punkt `business`).
- Liegt die Forderung im Rahmen, ist der Vertrag sofort geschlossen.
- Sonst kommt ein Gegenangebot: halber Weg zur Grenze und 1 Termin weniger. Je nach Gier der Forderung und Geduld des Typs kann der Partner aber auch abspringen.
- Nach der 3. Runde gilt das letzte Wort des Partners: annehmen oder ablehnen.

## Geschäftsführer

Neue Staff-Rolle (Markt im Reiter Staff), Hauptwert „Wirtschaft“ (`ratings.business`).

- Mit Geschäftsführer kann man die Sponsorensuche delegieren. Er unterschreibt dann sofort und holt je nach Können 15–75 % des Spielraums bis zur Schmerzgrenze heraus.
- Strategien:
  - **sicher**: hoher Grundbetrag
  - **ausgewogen**
  - **auf Boni**: setzt auf Erfolg
- Ohne Geschäftsführer verhandelt man selbst. Offene Flächen unterschreibt sonst der Vorstand zum Saisonwechsel, sicher, aber ohne Verhandlung.

KI-Vereine entscheiden sofort mit der ausgewogenen Strategie und 25 % Spielraum.

## Balance

- Im Schnitt erreichen die Verträge 88–95 % des Planwerts, dazu Boni für erfolgreiche Vereine.
- `pnpm sim seasons 10` ist unverändert stabil: Ø Spieler 10,2–10,4, Top 50 ≈ 12, Alter ≈ 26,8.

## Offen / Ideen

- Sponsorenevent im Stadion (12a) als weiterer Pflichttermin
- Partner, die Bedingungen stellen (z. B. Nachwuchsspieler einsetzen)
- Sponsorenlinie in den Phasenberichten
