# Events: Termine und Zufallsereignisse (Meilenstein 10)

Stand: 27.11.2026

## Entscheidungen von Matthias

- **Aktive Events (Termine)** plant der Manager beim Wochenstart. Jeder Termin ersetzt eine Trainingseinheit.
- **Passive Events (Zufallsereignisse)** kommen etwa alle 2–3 Wochen, meist mit 2–3 Antwortmöglichkeiten.
- Es gibt drei Bereiche: Mannschaft & Moral, Wirtschaft, Fans. Jedes Event hat Vor- und Nachteile.
- Das System soll einfach zu erweitern sein.

## Vorbilder

| Spiel | Was wir übernehmen |
|---|---|
| Football Manager | Teambuilding und soziales Engagement als planbare Termine; Mannschaftsbesprechungen können nach hinten losgehen und sind nur mit Abstand möglich |
| Hattrick | „Spiel der Saison“ mit Delle danach; Fans und Sponsoren haben eine eigene Stimmung |
| Anstoss 3 | Privatleben der Spieler als Ereignisse |
| Echte Vereine | Business-Spieltag, Autogrammstunde, Kindertag, Fanclub-Sternfahrt |

## Aufbau (`packages/core/src/events.ts`, `eventCatalog.ts`)

**Neues Event anlegen:** einen Eintrag in `TERMIN_LIST` oder `RANDOM_LIST` (`eventCatalog.ts`) ergänzen. Mehr ist nicht nötig.

- **Termin (`TerminDef`):**
  - Pflichtangaben: `id`, `category` (team/economy/fans), `label`, `pros`, `cons`
  - Optional:
    - `cost`
    - `cooldown` (Pause in Wochen)
    - `options` (Varianten, z. B. Ton der Besprechung)
    - `subject` (Spielerauswahl)
    - `blocked` (Grund, warum der Termin diese Woche nicht geht)
  - `resolve(ctx)` liefert Text, Ton und Wirkungen.
- **Zufallsereignis (`RandomDef`):**
  - `id`, `category`, `weight` (Häufigkeit), `cooldown`
  - `when` (wann es auftreten kann)
  - `subjects` (betroffene Spieler; `null` = passt gerade nicht)
  - `title` und `text`
  - `options` mit `label`, `hint` und `resolve`
  - `fallback` (Antwort des Co-Trainers ohne Entscheidung)
- **Wirkungen (`Effect`):**

  | Wirkung | Beschreibung |
  |---|---|
  | `morale`, `fitness`, `form` | Ziel: team, subject, subject2 oder others; bei Moral optional Trait-Faktoren, z. B. Diva ×−0,5 |
  | `chemistry`, `pairChemistry` | Reihenchemie bzw. Chemie zwischen den beiden Betroffenen |
  | `fans`, `sponsors`, `board` | Fanstimmung, Sponsorenzufriedenheit, Vorstandsvertrauen |
  | `money` | Einnahme oder Ausgabe in einer Kategorie des Monatsbuchs |
  | `attendance` | Zuschauerbonus für die nächsten Heimspiele |
  | `gameOfSeason` | nächstes Spiel wird zum „Spiel der Saison“ |
  | `familiarity` | Taktik-Eingespieltheit |

- **Kontext (`EventCtx`):** Welt, Verein, Kader, Betroffene, gewählte Variante, deterministischer Zufall (`roll`), Häufigkeit in den letzten Wochen (`recent`), Spiele und Heimspiele der Woche, Niederlagenserie.

## Ablauf

1. **Wochenstart (`startWeek`):**
   - Das Training läuft mit 3 Einheiten minus der Zahl der Termine.
   - Danach werden die Termine ausgewertet (`runWeekEvents`).
   - Mit etwas Glück kommt ein Zufallsereignis: frühestens 12 Tage nach dem letzten, sicher nach 24 Tagen, dazwischen mit 40 % je Woche.
2. **Offenes Zufallsereignis:** Eine Karte oben im Reiter Spieltag zeigt die Antworten. Die Spielknöpfe erscheinen erst nach der Entscheidung. Bei „Schnell weiter“ entscheidet der Co-Trainer (`fallback`).
3. **Termin-Plätze:** 2 pro Woche, bei 3 Spielen nur 1.
4. **Abnutzung:** Jede Wiederholung desselben Termins in den letzten 4 Wochen senkt die Wirkung auf 60 %. Manche Termine haben zusätzlich eine Pause.
5. **Ergebnisse:** Sie stehen unter „Vereinsleben“ im Reiter Verein und im Wochenrückblick, dazu als Nachricht.

## Stimmung im Umfeld (`Club.mood`)

Beide Werte laufen von 0 bis 100, normal ist 50.

- **Fanstimmung:**
  - Siege heben sie, Niederlagen senken sie. Deutliche Ergebnisse zählen mehr, Auswärtssiege etwas mehr.
  - Nach jedem Spiel pendelt sie um 2 % zur Mitte zurück.
  - Wirkung: Zuschauer bis ±10 % der Hallenkapazität.
- **Sponsorenzufriedenheit:**
  - Folgt langsam der Fanstimmung. Sponsorentermine heben sie.
  - Wirkung: Sponsoreneinnahmen ±8 %.
- **Über den Sommer** pendeln beide um 40 % zurück zur Mitte.
- **Vorbereitung:** Sponsoring (M11) und Stadionbetrieb (M12) bauen auf diesen Werten auf.

## Katalog zum Start

**12 Termine**

| Bereich | Termine |
|---|---|
| Mannschaft | Teamabend, Mannschaftsbesprechung (aufbauend/fordernd), Wellness-Kurztrip, Einzelgespräch, „Spiel der Saison“ |
| Wirtschaft | Werbedreh, Sondertrikot (Sponsorenabend, Kindertag und Ticketaktion sind seit M12a Spieltagsaktionen, siehe `docs/stadion.md`) |
| Fans | Autogrammstunde, Fanclub-Besuch, Kindertag, Ticketaktion, Öffentliches Training |

**15 Zufallsereignisse**

| Bereich | Ereignisse |
|---|---|
| Kabine | Nachts erwischt, Streit, Wunsch nach mehr Eiszeit, Grippewelle, Nachwuchs, Trauerfall, Lob vom Bundestrainer |
| Wirtschaft | Technik defekt, Doku, Sonderzahlung eines Partners, Energiekosten |
| Fans | Protest, Pyro, Choreo, Fanclub-Jubiläum |

## Offen / Ideen für später

- **Folgen nachverfolgen:** Bisher wird ein Versprechen aus „mehr Eiszeit in Aussicht stellen“ nicht geprüft. Später soll ein Bruch Moral kosten, wie bei Vertragsversprechen.
- **Sperre:** „Ein Spiel auf die Tribüne“ setzt den Spieler noch nicht automatisch aus.
- **KI-Vereine** haben noch keine eigenen Events, nur die Fanstimmung.
