# Training (Meilenstein 8)

Stand: 27.11.2026 – Entscheidungen von Matthias, umgesetzt im Branch `training`

## Entscheidungen

- **Wochenplan mit drei Schwerpunkten.** Jeder Schwerpunkt hat seine eigene Intensität: hart, mittel, locker oder Regeneration.
- **Harte Einheiten** kosten mehr Frische. Gibt es zu viele davon, kosten sie auch Moral. **Lockere Einheiten** und Regeneration geben Frische und Moral zurück.
- **Co-Trainer plant**, wenn der Manager nichts festlegt.
- **Einzeltraining** für bis zu 3 Spieler. Freie Plätze besetzt der Co-Trainer, entweder zufällig reihum oder nach einer Regel: Formschwache, Talente oder junge Spieler.

## Umsetzung (`packages/core/src/training.ts`)

**Schwerpunkte**

| Schwerpunkt | Wirkung |
|---|---|
| Athletik & Eislaufen | Entwicklung: Eislaufen, Beweglichkeit, Kraft, Ausdauer (Torhüter: Reflexe, Beweglichkeit) |
| Angriff & Abschluss | Entwicklung: Scheibenführung, Passspiel, Schuss, Bullys |
| Defensive & Zweikampf | Entwicklung: Stellungsspiel, Stockcheck, Körperspiel, Schüsse blocken |
| Spielverständnis (Video) | Entwicklung: Spielintelligenz, Antizipation, Nervenstärke, Einsatz (Torhüter: Konzentration, Nervenstärke) |
| Taktik & System | Eingespieltheit der gewählten Teamtaktik |
| Über- & Unterzahl | Eingespieltheit der PP- und PK-Formation |
| Reihen-Zusammenspiel | Chemie der aktuellen Reihen und Verteidigerpaare |
| Torhütertraining | Entwicklung der Torhüterwerte |

**Intensität je Einheit**

| Intensität | Belastung | Entwicklung | Fitness | Moral |
|---|---|---|---|---|
| Hart | 3 | 100 % | −2,6 (Ausdauer mildert) | −0,4 |
| Mittel | 2 | 70 % | −1,2 | 0 |
| Locker | 1 | 35 % | +0,3 | +0,7 |
| Regeneration | 0 | – | +3 | +0,4 |

**Zuschläge**

- Bei 2 harten Einheiten in einer Woche sinkt die Moral um 1,2, bei 3 um 3. Professionelle Spieler stecken das besser weg.
- Bei 3 Spielen in der Woche kostet jede harte Einheit zusätzlich Frische und Moral.
- Die Belastung der Woche (0–9) verändert das Erholungstempo zwischen den Spielen: neutral bei 5, ±4 % je Punkt, +5 % je Regenerationseinheit.

**Entwicklung**

- Der Trainingsumfang wirkt als Tempofaktor von 0,82 bis 1,15. Der Faktor wird in Spielerprofil und Kader unter „Tempo“ als „Training“ angezeigt.
- Die Schwerpunkte verschieben, welche Attribute wachsen. Die Gesamtmenge an Wachstum bleibt dabei gleich.
- Für Torhüter zählt das Teamtraining nur zur Hälfte.
- Einzeltraining gibt bis zu +22 % Tempo und ein starkes Gewicht auf den eigenen Schwerpunkt. Dazu kommen +0,5 Moral und etwas Frische-Verlust.

**Ablauf**

- Eine Trainingswoche beginnt am Montag. Ausgewertet wird sie vor dem ersten Spiel der Woche (`runTraining` in `playDay`).
- Das Log der Einheiten fließt in den monatlichen Entwicklungsschritt ein und wird danach geleert.

**Co-Trainer**

- Die Intensität richtet er nach dem Spielplan:

  | Spiele in der Woche | Einheiten |
  |---|---|
  | 0 | hart / hart / mittel |
  | 1 | hart / mittel / locker |
  | 2 | hart / mittel / Regeneration |
  | 3 | mittel / locker / Regeneration |

- Liegt die mittlere Fitness unter 84, geht er bei jeder Einheit eine Stufe zurück.
- Die Schwerpunkte richten sich nach den Baustellen: Taktik bei Eingespieltheit < 62, Special Teams < 58, Reihen bei Chemie < 52. Die übrigen Plätze wechseln Woche für Woche.

**Sommerpause**

- Trainingsauftakt: Eine Woche nach dem Wochenplan.
- Trainingslager: Jede Woche zählt anderthalbfach.
- Vorbereitung: Normale Wochen.

## Offen / später

- Testspiele in der Vorbereitung
- Trainingslager mit Ort, Kosten und Dauer
- Positionsumschulung im Einzeltraining
- Verletzungsrisiko durch Belastung (Meilenstein 9)
- Eigene Trainingsplätze bzw. zweite Eisfläche (Stadionausbau)
