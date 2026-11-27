# Übergabe – Stand der Entwicklung

Stand: 27.11.2026 · letzter Commit „Wochenablauf: Woche starten, dann Spieltage“

Dieses Dokument ist der Einstiegspunkt für jede neue Arbeitssitzung. Es fasst zusammen, was gebaut ist, wie der Code aufgebaut ist, was entschieden wurde und was als Nächstes kommt.

## Überblick

- **Repo:** https://github.com/mattment1980/eishockey-manager (Branch `main`)
- **Live:** GitHub Pages, Deploy automatisch bei jedem Push auf `main` (Workflow „Web-App auf GitHub Pages veröffentlichen“)
- **Ziel V1:** Einzelspieler-Testbuild mit einer Liga nach DEL2-Vorbild (14 Vereine, Fantasienamen), später Multiplayer mit privaten Ligen
- **Konzept-Dokumente:** im Claude-Projekt „DEL Eishockey Manager“ (feature-entscheidungen, spielerattribute-und-engine, taktik-und-coaching, chemie-und-charakter, wirtschaft-und-verein, markt-und-vertraege, spielerentwicklung, verletzungen-und-medizin, technik-und-datenmodell, mvp-umfang)

## Meilensteine

| Meilenstein | Inhalt | Status |
|---|---|---|
| 1 | Monorepo, Schemas, Zufallsgenerator, Weltgenerator | ✅ |
| 2 | Match-Engine v0, Kalibrierung | ✅ |
| 3 | Web-Oberfläche: Kader, Reihen, Taktik, Live-Spiel | ✅ |
| 4 | Saison: Spielplan, Tabelle, Pre-Playoffs, Playoffs, Playdowns | ✅ |
| 5a | Kalender, Wirtschaft, Scouting | ✅ |
| 5b | Markt & Verträge, Kaderplaner | ✅ |
| UI-Runde | Staff-Reiter, umschaltbare Kaderansichten, Markt-Filter | ✅ |
| 6a | Taktik je Situation: Special Teams, Torhüter raus, Matchups, Coaching-Regeln | ✅ |
| 6b | Chemie & Moral | ✅ |
| Aufräumrunde | Engine und Wettbewerb in Module, Eingaben während Simulation sicher, Spielstand-Sicherung, Formel an einer Stelle, Oberfläche/CSS/Tests aufgeteilt, Fingerabdruck-Prüfung | ✅ |
| Runde vor M7 | 14 Anpassungen (siehe unten): Spielerprofil überall, Mouseover, Fitness/Form/aktuelle Stärke, Talent, Markt mit Ligenbaum, Vereinskader, Form & Teamstatistik, Tooltips, Drag & Drop, Sommerpause, Taktik-Eingespieltheit | ✅ |
| 7 | Saisonwechsel & Daten: Alterung/Entwicklung, Nachwuchs, CSV-Import/Export, Datenwerkstatt | ✅ |
| 8 | Training: Wochenplan mit 3 Schwerpunkten und Intensität, Co-Trainer, Einzeltraining (siehe `docs/training.md`) | ✅ |
| 8b | Wochenablauf im Reiter Spieltag: Rückblick → „Woche starten“ (Training) → Spieltage der Woche | ✅ |
| **9** | **Verletzungen & medizinische Abteilung** (Konzept: „verletzungen-und-medizin“) | **als Nächstes** |
| 10 | Events: Zufallsereignisse und planbare Termine unter der Woche (Teamevent, Autogrammstunde …) mit Wirkung auf Moral, Frische, Zuschauer, Stimmung, Chemie | geplant |
| 11 | Sponsoring | geplant |
| 12a | Stadionbetrieb & Zuschauer: Catering, Eintrittspreise, Veranstaltungen (Sponsorenabend, Kindertag …) mit Einfluss auf die Zuschauer | geplant |
| 12b | Stadionausbau | geplant |
| nebenbei | Dominanz des stärksten Vereins, offene Kalibrierungspunkte, mehrere Spielstände, Vertragsgespräche/Transfermarkt in der Sommerpause | offen |
| später | Multiplayer (Server, Accounts, private Ligen) – bewusst hinten angestellt (Matthias, 27.11.2026) | später |
| später | Trait-Entwicklung, Manager-Karriere, Ligensystem u. a. | später |

## Technik

- TypeScript, pnpm-Monorepo; Zod-Schemas mit Standardwerten und Migrationen; React + Vite; Spiel-Simulation im Web Worker; Speicherstand in `localStorage`; Tests mit Vitest; CLI mit tsx (`pnpm sim …`)
- Deterministischer Zufall (`Rng`, sfc32, mit Startwert) – jedes Spiel ist reproduzierbar
- Reine Umbauten werden mit `pnpm fingerprint` geprüft (Hash einer kompletten Saison mit festem Startwert muss gleich bleiben)
- Arbeitsregeln und Kurzbeschreibung des Aufbaus stehen in `CLAUDE.md` (Spiellogik nur in `packages/core`, Datenformat nur über `packages/schema` mit `SCHEMA_VERSION`, Engine-Parameter nur in `constants.ts` + Kalibrierung, vor jedem Commit `pnpm typecheck && pnpm test`, nur Fantasienamen)

### Pakete

| Paket | Inhalt |
|---|---|
| `packages/schema` | Datenmodell (Welt, Land, Liga, Verein, Spieler, Staff, Vertrag, Wettbewerb, Scouting, Markt, Matchplan, Coaching-Regeln, Chemie), aktuell **SCHEMA_VERSION 11** (v7: `Club.familiarity`, `World.offseason`, `FixtureResult.team`; v8: `Player.dev`, `Player.youthClub`; v9: `offseason.testDay`; v10: `offseason.reports` = Phasenberichte; v11: `Club.training`) |
| `packages/core` | Spiellogik: `engine/` (`match.ts` = Zustand und Ablauf; Bereiche als Methoden in `lines`, `rules`, `modifiers`, `phases`, `shots`, `penalties`, `shootout`; dazu `state`, `types`, `constants`), `competition.ts` (Spielplan, Serien), `standings.ts` (Tabelle, Form, Teamstatistik), `matchday.ts` (Ablauf eines Spieltags), `economy.ts`, `scouting.ts`, `market.ts`, `coaching.ts`, `chemistry.ts`, `condition.ts` (Fitness & Form), `familiarity.ts` (Taktik-Eingespieltheit), `offseason.ts` (Phasen, Trainingslager), `board.ts` (Saisonbilanz des Vorstands), `phaseReports.ts` (Kurzberichte der Sommerpause), `training.ts` (Wochenplan, Co-Trainer, Einzeltraining), `lineup.ts`, `ratings.ts` (u. a. `effectiveRating`, `talentStars`) |
| `packages/data` | Weltgenerator, Namen, Import/Export + Migration v1→v11 (`io.ts`), CSV mit Spaltenzuordnung (`csv.ts`), Datensatz-Neuaufbau (`rebuild.ts`), Nachwuchsjahrgang (`youth.ts`), Saisonwechsel (`transition.ts`), Sommerpause-Ablauf (`offseason.ts`) |
| `apps/web` | Oberfläche (8 Reiter: Verein, Kader, Reihen, Taktik, Training, Staff, Spieltag, Liga); `store.tsx` = Spielstand mit Aktions-Warteschlange (Eingaben während einer Simulation werden danach erneut angewendet), Export/Import als Datei; `ui.tsx` = globale Fenster (`components/PlayerProfile`, `ClubSheet`, `HoverLayer`), `PlayerName`/`ClubName` für klickbare Namen, `data-tip` für Tooltips; CSS in `styles/` (base, views, components, features) |
| `apps/sim-cli` | `pnpm sim generate | match | season | calibrate | seasons` |
| `tests/` | 50 Tests in 7 Dateien (world, engine, season, market, team, development, data) |

### Ablauf eines Spieltags (`playDay` in `matchday.ts`)

Monate abschließen → Entwicklung → **Training der Woche** → Spiele simulieren → Einnahmen buchen → Moral & Chemie → **Fitness, Form, Taktik-Eingespieltheit** → Scouting → Markt-Tick → nächsten Spieltag vorbereiten → **Erholung bis zum nächsten Spieltermin** (Fitness zeigt immer den Stand zum Anpfiff) → am Saisonende Prämien, Monate bis 1. August abschließen, Sommerpause Phase 0.

## Was im Spiel steckt

**Match-Engine:** ereignisbasiert (Bully, Breakout, Zoneneintritt, Angriffszone, Schuss, Rebound, Strafen, Wechsel, Ermüdung), logistische Duelle, Tagesform, Heimvorteil, Spielstandseffekte, Überzahl/Unterzahl, 3-gegen-3-Verlängerung, Penaltyschießen, Playoff-Verlängerung bis zur Entscheidung. Text-Ticker, Live-Statistiken je Spieler, Reihe und Mannschaft, Schusskarte, Reihen-Matrix.

**Taktik & Coaching:** Teamtaktik (Forecheck, Breakout, Eintritt, Angriffszone, Defensivzone, Gap, Tempo, Härte), PP/PK-Formationen und -Einheiten, Torhüter raus, Matchups (Heimteam mit letztem Wechsel), Coaching-Regeln (Bedingung → Aktion) mit 4–10 Regelplätzen je nach Trainerqualität, Coaching-Report.

**Chemie & Moral (6b):**
- Moral je Spieler nach jedem Spiel (Ergebnis, Eiszeit vs. Vertragsrolle, Tribüne, Torhüterleistung, Scorerpunkte, Traits, Trainer)
- Teamklima = gewichtete Moral (Kapitän doppelt) + Trainer-Motivation → verschiebt Tagesform leicht
- Reihenchemie wächst mit gemeinsamen Spielen, verblasst bei Trennung, plus Trait-Kompatibilität (bis ±3 %)
- Situative Traits in der Engine (Leader mit Ticker-Meldung, Big Game, Nervenbündel, Kämpfer, Schönwetter, Heimstark, Freigeist, Egoist, Hitzkopf); Trainer-Disziplin senkt Strafen; Gesamteffekt gedeckelt auf ±8 %
- UI: Kader › Kabine, Kapitänswahl und Chemie-Chips in „Reihen“

**Wirtschaft:** realistische Budgets, Monatsbuch (Ticketing, Catering, Sponsoren, Medien, Playoffs; Gehälter, Perks, Prämien, Staff, Halle, Reisen, Verwaltung), Zuschauer, Gehaltsbudget, Vorstandsziel und -vertrauen, Liquiditätsprognose.

**Scouting:** Kenntnis 0–400 Punkte (4 Stufen), wächst durch Liga-Vertrautheit, Spiele gegeneinander und Scout-Aufträge nach Region; Anzeige grob (sehr stark/stark/…) bis exakt.

**Markt & Verträge:** kaum Ablösen; Wettbieten um auslaufende/ausgelaufene Verträge; Kaderplanung ab November; Vorverträge; Perks (Auto, Wohnung u. a.), Prämien, Klauseln (Ausstieg, Abstieg), Versprechen (Bruch kostet Moral und Glaubwürdigkeit); Etat-Überziehung kostet Vorstandsvertrauen; Wechselfrist 2 Monate vor den Playoffs; KI-Markt wöchentlich; Filter im Markt.

**Runde vor M7 (27.11.2026):**
- Jeder Spielername ist klickbar (Profil) und zeigt beim Überfahren eine Kurzinfo (Position, Alter, Stärke, Talent, aktuelle Stärke, Fitness/Form/Moral, Charakter, Vertrag); alle Fenster haben oben rechts ein ✕ (und Esc)
- Fitness (sinkt mit Eiszeit, erholt sich an freien Tagen, Ausdauer/Assistenztrainer helfen) und Form (folgt den Leistungen, Beständigkeit dämpft) sind jetzt dynamisch; Anzeige der **aktuellen Stärke** mit einer Nachkommastelle in Reihen, Kader und Profil
- Talent = verstecktes Potenzial als 0,5–5 Sterne; je nach Scouting exakt, als Spanne oder unbekannt. (Wirkung auf die Entwicklungsgeschwindigkeit kommt mit M7.)
- Profil fremder Spieler: „Scoute diesen Spieler“ (Scouts reisen auch außerhalb ihrer Region, mit halber Ausbeute) und – falls möglich – Vertragsangebot
- Markt mit Ligenbaum: Schnellzugriff (Verhandelbar, Meine Angebote, Beobachtet), Deutschland › Liga › Vereine, Vereinslos, Ausland nach Region (vorerst nur vereinslose Auslandsspieler – ausländische Ligen folgen); auch gebundene Spieler sichtbar
- Liga: Vereine anklickbar (Kader nach Scouting-Stand), Form-Spalte (letzte 5), Reiter „Teams“ mit Allgemein / Special Teams / Spielkontrolle (sortierbar)
- Tooltips über `data-tip` für Symbole, Tags, Chips und Spaltenköpfe
- Reihen per Drag & Drop (Maus; am Handy über den Griff ⠿), Liste ▾ als Alternative
- Sommerpause in 8 Phasen: Saisonende → Saisonbilanz (Urlaub) → Vertragsgespräche → Transfermarkt → Sommertraining → Saisonwechsel & Trainingsauftakt → Trainingslager → Vorbereitungsspiele → Saisonstart. Trainingsphasen stärken Reihenchemie und Taktik-Eingespieltheit. Platz für Testspiele/Training später.
- Taktik-Eingespieltheit je System („forecheck:1-2-2“, „pp:umbrella“ …): wächst mit Spielen (Tempo abhängig von Trainer-Taktik und „Taktikfuchs“), verblasst ohne Einsatz und im Urlaub; Wirkung ±2,5 % (`FAMILIARITY_EFFECT`), Anzeige als Balken unter jeder Taktik-Option und in der Kabine. Reihen-Eingespieltheit = bisherige Chemie.

**Meilenstein 7 (27.11.2026):**
- **Entwicklung** (`core/development.ts`): monatlich September–April kleine Schritte, im Sommertraining der große Schritt. Wachstum = Lücke zum Potenzial × Jahresrate (`DEV.YEAR_RATE` 0,19) × Faktoren: Talent (0,5★ = 0,6 … 5★ = 1,32), Eiszeit (Tribüne 0,7, viel Eiszeit bis 1,15), Entwicklungstrainer (0,85–1,15, „Ausbilder“ +10 % bis 23), Mentor im Team (+8 % bis 23), Einstellung (Professionalität, „Perfektionist“ +10 %). Physis wächst früh und baut ab 30 ab, Technik ab 32, Mentales ab 36; Torhüter zwei Jahre später. Entwicklungssprünge im Sommer möglich. Ganzzahlige Werte über deterministisches Runden.
- **Anzeige:** Pfeile an den Attributen und an der Gesamtstärke (seit Saisonbeginn), Verlaufslinie, Tempo mit Aufschlüsselung, Kader-Ansicht „Entwicklung“, Sommer-Nachrichten (Sprünge, Abbau).
- **Karriereende:** Vereinslose ab 33 zunehmend, ab 35 sicher; mit Vertrag ab 36 (25 %), ab 38 sicher.
- **Nachwuchsjahrgang** (`core/youth.ts`, `data/youth.ts`): jeder Verein im Sommertraining 4 Talente (16–18 J., +1 bei Entwicklungstrainer ≥ 14), fester Ligamaßstab plus Ausbildungsverein und Trainer. KI übernimmt höchstens 1 (ab Potenzial 11), Manager entscheidet in Kader › Nachwuchs oder in der Sommerpause (Fördervertrag 3 Jahre, 12.000 €). Offene Talente werden beim Saisonwechsel vereinslos.
- **Langzeit-Balance** (`pnpm sim seasons 10`): Ø Spielerstärke 10,2 → 10,4, Top 50 12,2 → 11,9, Ø Alter 26,5–27,3, Vereinsstärke 10–12 über 10 Saisons stabil. Beobachtung: Falkenstein (Profil „corporate“, höchstes Grundniveau) wird in der Simulation fast jedes Jahr Meister – prüfen, ob Etat/Markt die Dominanz zu wenig bremsen.
- **Datenwerkstatt** (Startbildschirm und Verein › Spielstand): Vereine (Name, Kürzel, Farben, Halle, Profil, Etat) und Spieler (alle Werte, Vertrag, Charakter, Potenzial; anlegen/löschen) vor Spielbeginn; im laufenden Spiel nur Namen/Farben. Vorlage im Browser speichern und bei der Vereinswahl laden.
- **Import/Export:** CSV für Spieler und Vereine (Trennzeichen automatisch, Werte 1–20, deutsche/englische Kopfzeilen automatisch erkannt, frei zuordenbar), Prüfung je Zeile, Vorschau, Zusammenführen (über ID oder Name) oder Ersetzen (vor Spielbeginn; Vereine zeilenweise umbenennen). Einfache Listen (Name, Position, Verein, Stärke, Alter) reichen – fehlende Werte werden passend erzeugt. JSON = kompletter Datensatz.

**Sommerpause: Berichte je Phase (27.11.2026):**
- **Saisonbilanz des Vorstands** (`core/board.ts`): Noten von „sehr gut“ bis „mangelhaft“ für Sportlich (erreichte Runde gegen Saisonziel), Finanzen (Saisonergebnis im Verhältnis zum Etat, Gehaltsrahmen), Kaderplanung (Rang Kaderstärke gegen Rang Gehaltskosten), Junge Spieler (Entwicklung bis 23 J.) und Zuschauer (Auslastung gegen Erwartung). Gewichte `BOARD_WEIGHTS` (Sport 7, Finanzen 4, Kader 2, Jugend 1, Zuschauer 1 Punkt je Notenstufe, gedeckelt ±25) ergeben die Veränderung des Vorstandsvertrauens; Gesamturteil in einem Satz („Sportlich stark – aber finanziell zu teuer erkauft.“) und Aussage zur Position des Managers. Ersetzt die frühere pauschale ±12 nach dem letzten Spiel; gilt für alle Vereine der Liga.
- **Kurzberichte** (`core/phaseReports.ts`) für den eigenen Verein: Vertragsgespräche (verlängert / offen / gehen / Neuzugänge), Transfermarkt (Zu- und Abgänge, ohne Anschlussvertrag, Bilanz, größte Wechsel der Liga), Sommertraining (Kaderstärke vorher/nachher, Gewinner/Verlierer, Nachwuchsjahrgang), Saisonwechsel (Kadergröße, Ausländerlizenzen, Gehaltsrahmen, Rang Kaderstärke, neues Ziel, Karriereenden), Trainingslager und Vorbereitung (Reihen-Chemie und Taktik-Eingespieltheit vorher/nachher, Experten-Tipp mit Favoriten).
- Ablage in `world.offseason.reports` (Spieler als IDs, Anzeige über `PlayerName`); Anzeige als Karte unter der Phase, frühere Berichte per Klick auf die Zeitleiste.

**Meilenstein 8 – Training (27.11.2026, Details `docs/training.md`):**
- Reiter **Training**: Wochenplan mit 3 Schwerpunkten (Athletik, Angriff, Defensive, Video, Taktik, Über-/Unterzahl, Reihen, Torhüter), je Schwerpunkt eigene Intensität (hart, mittel, locker, Regeneration); „Co-Trainer plant“ oder „Selbst planen“ (Plan beibehalten oder nur eine Woche); Vorschau Belastung, Fitness, Moral mit Warnungen; Rückblick auf die letzte Woche.
- Wirkung: Entwicklungstempo 0,82–1,15 und Richtung (Schwerpunkte verschieben das Wachstum auf passende Attribute), Eingespieltheit und Reihenchemie, Fitness und Erholungstempo, Moral (zwei/drei harte Einheiten drücken die Stimmung).
- Einzeltraining für bis zu 3 Spieler (bis +22 % Tempo im Schwerpunkt, +Moral); freie Plätze besetzt der Co-Trainer nach Regel (reihum, Formschwache, Talente, junge Spieler).
- KI-Vereine trainieren nach dem Co-Trainer-Plan. Sommerpause: Trainingsauftakt eine Woche, Trainingslager-Wochen zählen anderthalbfach.
- Langzeit-Balance unverändert (`pnpm sim seasons 10`: Ø Spieler 10,2–10,4, Top 50 ≈ 12,0, Ø Alter 26,7–27,9); Kalibrierung unverändert.
- **Wochenablauf** (Wunsch Matthias): Der Reiter Spieltag hat zwei Phasen. Zu Wochenbeginn zeigt er den Rückblick auf die letzte Woche (Ergebnisse, Fitness/Moral/Form Ø vorher → jetzt), die Spiele der neuen Woche und den Trainingsplan (Link „Training anpassen“). „Woche starten“ wertet das Training aller Vereine aus (`startWeek`), danach werden die Spieltage der Woche einzeln gespielt (Live oder sofort). Die Spielknöpfe erscheinen erst nach dem Start, wenn der eigene Verein in der Woche spielt (`weekStatus().needsStart`). „Schnell weiter“ läuft ohne Halt, das Training läuft dabei automatisch mit. Kaderschnitt zu Wochenbeginn steht in `training.week.before`. Der Wochenstart ist der Ort für Verletzungs-Entscheidungen (M9) und Termine unter der Woche (M10).

**Saisonwechsel (bisher):** Verträge, Klauseln, Karriereende, neue freie Spieler, KI-Kaderauffüllung, Nachwuchs für den menschlichen Verein, neue Aufstellungen, Chemie-Saat, Moral pendelt sich ein. Alterung/Entwicklung siehe Meilenstein 7.

### Sommerpause – Ausbaustand der Phasen

Festgehalten am 27.11.2026 (Matthias): Die Phasen, die bisher nur Platzhalter sind, werden in der Planung als eigene Aufgabe sauber ausprogrammiert.

| Phase | Was heute passiert | Stand |
|---|---|---|
| Saisonende | Meister, Abstieg, Prämien, Abschluss der Monate | fertig |
| Saisonbilanz | Bewertung durch den Vorstand mit Vertrauen, Urlaub (Fitness, Form, Moral, Eingespieltheit) | fertig |
| Vertragsgespräche | nur Markt-Zeitraum bis 25.05. + Bericht | **Platzhalter** – keine eigenen Gespräche (z. B. Spielerwünsche, Rollen, Gehaltsforderungen, Abwanderungsdruck) |
| Transfermarkt | nur Markt-Zeitraum bis 20.06. + Bericht | **Platzhalter** – keine eigene Marktdynamik (z. B. Transferphase der KI, Ausland, letzte freie Spieler, Deadline) |
| Sommertraining | Entwicklungsschritt, Tag der Leistungstests, Nachwuchsjahrgang | fertig (Trainingsschwerpunkte noch nicht wählbar) |
| Saisonwechsel & Trainingsauftakt | Verträge, Karriereende, Kaderauffüllung, neues Ziel | fertig |
| Trainingslager | Wochenplan aus dem Training wirkt anderthalbfach, dazu pauschaler Zuwachs bei Chemie | teilweise – noch ohne Ort/Kosten/Dauer und Verletzungsrisiko |
| Vorbereitungsspiele | pauschaler Zuwachs bei Chemie und Eingespieltheit | **Platzhalter** – keine echten Testspiele (Gegner wählen, Spiele simulieren, Reihen testen) |

## Kalibrierung (10 Saisons, siehe `docs/kalibrierung.md`)

Tore ≈ 3,06 je Team, Schüsse 30,9, Corsi 59,5, Fangquote 90,1 %, Überzahlquote 16,7 %, Verlängerung 21,0 %, Heimsiege 55,7 %, Corsi > 2:1 in 9,6 % der Spiele, klarer Favorit gewinnt 72,5 % (kleine Stichprobe). Neu: `FITNESS_EFFECT` 0,003, `FAMILIARITY_EFFECT` 0,025.

Offene Punkte: Tore ins leere Tor zu selten (0,15 statt 0,3–0,5 je Spiel), Überzahlquote und Fangquote am unteren Rand, Ein-Tor-Spiele etwas zu selten, zu viele einseitige Corsi-Spiele.

## Entscheidungen von Matthias (Kurzfassung)

- Fantasienamen + Editor + komfortabler Datenimport
- Multiplayer-fähig angelegt, zuerst private Ligen; übrige Vereine KI; Ligen modular zuschaltbar; Manager können Vereine wechseln
- Hierarchie Welt → Land → Liga → Verein
- Text-Ticker mit Live-Stats (Reihen, Probleme, Breakout usw.)
- Taktik vorher als Regeln festlegen, dann laufen lassen
- Attribute 1–20, grob sichtbar, über Scouting genauer (4 Stufen)
- Zufall moderat: Favorit gewinnt meistens, aber nicht immer
- Traits ändern sich über die Karriere (Trainer, Mitspieler, Mentoren)
- Chemie-System mit Charakteren von Spielern und Staff, kombiniert mit Moral
- Wirtschaft realistisch; Geschäftsführer optional; Hallenausbau später
- V1 Einzelspieler-Test mit DEL2-Modell
- Spielerentwicklung hybrid: monatlich kleine Schritte + großer Schritt im Sommer
- Reihenfolge ab 27.11.2026: Training → Verletzungen & Medizin → Events → Sponsoring → Stadionbetrieb & Zuschauer → Stadionausbau; Multiplayer hinten angestellt

## Nächste Schritte

1. **Meilenstein 9 – Verletzungen & medizinische Abteilung** (baut auf der Belastung aus dem Training auf; `training.week.load` liegt bereit)
2. Offen aus dem Training: Testspiele in der Vorbereitung, Trainingslager mit Ort/Kosten, Positionsumschulung
3. Meilenstein 10 – Events
4. Meilenstein 11 – Sponsoring
5. Meilenstein 12a/b – Stadionbetrieb & Zuschauer, danach Stadionausbau
6. Nebenbei: Dominanz des stärksten Vereins, Kalibrierung (leeres Tor, Überzahl- und Fangquote), mehrere Spielstände, Vertragsgespräche und Transfermarkt in der Sommerpause
7. Multiplayer später
