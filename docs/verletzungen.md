# Verletzungen und medizinische Abteilung (Meilenstein 9)

Stand: 27.11.2026 – baut auf dem Konzept „verletzungen-und-medizin“ (Entwurf v0.1) auf

## Entscheidungen von Matthias

- Ausfälle ersetzt der Co-Trainer automatisch in der Aufstellung, der Manager bekommt einen Hinweis.
- Mannschaftsarzt, Physiotherapeut und Athletiktrainer sind eigene Staff-Rollen. Man stellt sie ein und bezahlt sie.
- Im Schnitt sind 1–2 Spieler je Team verletzt. 4 gleichzeitig ist schon selten.

## Umsetzung (`packages/core/src/injuries.ts`, `staff.ts`)

**Entstehung**

- **Im Spiel:** Das Risiko wird nach jeder Partie für jeden eingesetzten Spieler ausgewürfelt. Grundrisiko: 1,1 % bei 16 Minuten Eiszeit, skaliert mit der Eiszeit.
- **Risikofaktoren:**

  | Faktor | Wirkung |
  |---|---|
  | Anfälligkeit (verstecktes Merkmal) | ×0,55 bis ×1,7 |
  | Fitness unter 88 bzw. unter 80 | ×1,15 bzw. ×1,45 |
  | Alter ab 30 bzw. ab 33 | ×1,1 bzw. ×1,25 |
  | Gegner mit harter Spielweise / fairer Spielweise | ×1,25 / ×0,85 |
  | Torhüter | ×0,35 |
  | Athletiktrainer | siehe medizinische Abteilung |

- **Überlastung:** Einmal pro Trainingswoche gibt es ein Grundrisiko von 0,42 %. Es skaliert mit der Wochenbelastung hoch 1,5, im Trainingslager mit dem Faktor 1,5. Dazu kommen dieselben persönlichen Faktoren.

**Arten** (Ausfall in Tagen vor dem Physio-Faktor)

| Art | Tage | Rückfall | häufig durch |
|---|---|---|---|
| Prellung | 3–9 | 5 % | Spiel |
| Zerrung | 6–18 | 12 % | Training |
| Leistenprobleme | 7–24 | 15 % | Training |
| Rückenprobleme | 4–16 | 10 % | Training |
| Muskelfaserriss | 14–32 | 15 % | Training |
| Gehirnerschütterung | 7–38 | 25 % | Spiel |
| Bänderverletzung | 21–52 | 10 % | Spiel |
| Bruch | 28–63 | 5 % | Spiel |
| Schwere Verletzung | 100–190 | 5 % | Spiel (selten) |

**Verlauf**

- Der Spieler ist zunächst **verletzt**. Nach 72 % der Ausfallzeit ist er **angeschlagen**, danach **fit**.
- **Angeschlagen** spielt ein Spieler nur, wenn der Manager „Einsetzen“ wählt. Er spielt dann mit −15 Fitnesspunkten, das sind rund −4,5 % Leistung. Nach jedem Spiel droht ein Rückfall (Rückfallrate × 1,5 × Arzt-Faktor), der den Ausfall um die Hälfte der ursprünglichen Dauer verlängert.
- Die KI setzt angeschlagene Spieler nur in den Playoffs ein.

**Medizinische Abteilung**

Die Werte gehen von 1 bis 20. Bei 10 ist die Wirkung neutral.

| Rolle | Wirkung | bei Wert 20 | unbesetzt |
|---|---|---|---|
| Athletiktrainer | Verletzungsrisiko | −25 % | +30 % |
| Physiotherapeut | Ausfallzeit | −20 % | +25 % |
| Mannschaftsarzt | Rückfallrisiko | −30 % | +40 % |
| Mannschaftsarzt | Prognose (halbe Spannweite) | ±9 % | ±50 % |

**Aufstellung**

- Vor jedem Spieltag werden nicht einsatzfähige Spieler durch den besten freien Spieler derselben Gruppe ersetzt (`coverPlan`). Der Manager bekommt dazu eine Nachricht.
- Die KI stellt bei Ausfällen und nach Rückkehrern neu auf.
- Die Match-Engine bekommt nie einen verletzten Spieler.

**Staff-Markt**

- Je Rolle stehen vereinslose Kandidaten bereit. Der Markt wird jeden Sommer aufgefüllt.
- Das Gehalt richtet sich nach Rolle und Qualität. Verträge laufen über 1–3 Saisons.
- Höchstzahl je Rolle:

  | Rolle | Höchstzahl |
  |---|---|
  | Cheftrainer | 1 |
  | Co-Trainer | 2 |
  | Torwarttrainer | 1 |
  | Nachwuchstrainer | 1 |
  | Scouts | 3 |
  | Arzt, Physio, Athletiktrainer | je 1 |

- Entlassen kostet die Hälfte des Restgehalts als Abfindung.
- Staff-Verträge verlängern sich vorerst automatisch.

**Kalibrierung**

Gemessen über 2 Saisons mit 14 Vereinen:

| Verletzte gleichzeitig | Anteil der Zeit |
|---|---|
| 0 | 24 % |
| 1 | 32 % |
| 2 | 22 % |
| 3 | 13 % |
| 4 | 6 % |
| 5 oder mehr | 2–3 % |

- Im Schnitt sind 1,5–1,6 Spieler je Team verletzt.
- Etwa 16 Verletzungen je Team und Saison, davon rund 20 % durch Überlastung.

## Offen / später

- Verletzung mitten im Spiel mit Ticker-Meldung (der Spieler fällt für den Rest der Partie aus)
- Vertragsgespräche mit Staff
- Ersatzlizenz bei langzeitverletzten Importspielern
- Reha-Bereich als Infrastruktur (Stadionausbau)
