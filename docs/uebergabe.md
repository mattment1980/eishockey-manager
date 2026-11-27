# Übergabe – Stand der Entwicklung

Stand: 27.11.2026 · letzter Commit „Meilenstein 12a: Stadionbetrieb & Zuschauer“

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
| 9 | Verletzungen & medizinische Abteilung, Staff-Markt (siehe `docs/verletzungen.md`) | ✅ |
| 10 | Events: Termine (ersetzen Trainingseinheiten) und Zufallsereignisse mit Entscheidung, Fanstimmung, Sponsorenzufriedenheit (siehe `docs/events.md`) | ✅ |
| 11 | Sponsoring: 9 Werbeflächen, 6 Partner-Typen, Verhandlung über 3 Runden mit Pflichtterminen, Geschäftsführer (siehe `docs/sponsoring.md`) | ✅ |
| 12a | Stadionbetrieb & Zuschauer: 3 Platzbereiche mit Preisen, Nachfragemodell, Catering (Eigenbetrieb/Pächter), Fanshop, Spieltagsaktionen, Heimvorteil aus Zuschauern (siehe `docs/stadion.md`) | ✅ |
| UI-Runde | Spieltag-Reiter als Wochencockpit (Kopfleiste mit Aktionen, Wochenstreifen Mo–So, Kacheln) | ✅ |
| **12b** | **Stadionausbau** | **als Nächstes** |
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
| `packages/schema` | Datenmodell (Welt, Land, Liga, Verein, Spieler, Staff, Vertrag, Wettbewerb, Scouting, Markt, Matchplan, Coaching-Regeln, Chemie), aktuell **SCHEMA_VERSION 16** (v7: `Club.familiarity`, `World.offseason`, `FixtureResult.team`; v8: `Player.dev`, `Player.youthClub`; v9: `offseason.testDay`; v10: `offseason.reports` = Phasenberichte; v11: `Club.training`; v12: `Player.career`, `World.archive`; v13: `Player.injury`, `Player.injuries`, Staff-Rollen Arzt/Physio/Athletik, `Staff.ratings.medical`; v14: `Club.mood`, `Club.events`; v15: `Club.sponsors`, `Staff.ratings.business`; v16: `Club.stadium`, `Club.rivals`, `Club.arena.seats`) |
| `packages/core` | Spiellogik: `engine/` (`match.ts` = Zustand und Ablauf; Bereiche als Methoden in `lines`, `rules`, `modifiers`, `phases`, `shots`, `penalties`, `shootout`; dazu `state`, `types`, `constants`), `competition.ts` (Spielplan, Serien), `standings.ts` (Tabelle, Form, Teamstatistik), `matchday.ts` (Ablauf eines Spieltags), `economy.ts`, `scouting.ts`, `market.ts`, `coaching.ts`, `chemistry.ts`, `condition.ts` (Fitness & Form), `familiarity.ts` (Taktik-Eingespieltheit), `offseason.ts` (Phasen, Trainingslager), `board.ts` (Saisonbilanz des Vorstands), `phaseReports.ts` (Kurzberichte der Sommerpause), `training.ts` (Wochenplan, Co-Trainer, Einzeltraining), `history.ts` (Saisonarchiv), `injuries.ts` (Verletzungen), `staff.ts` (Staff-Markt), `events.ts` + `eventCatalog.ts` (Termine, Zufallsereignisse, Stimmung), `sponsors.ts` (Sponsoring), `stadium.ts` + `stadiumActions.ts` (Zuschauer, Preise, Catering, Fanshop, Spieltagsaktionen, Heimvorteil), `lineup.ts`, `ratings.ts` (u. a. `effectiveRating`, `talentStars`) |
| `packages/data` | Weltgenerator, Namen, Import/Export + Migration v1→v15 (`io.ts`), CSV mit Spaltenzuordnung (`csv.ts`), Datensatz-Neuaufbau (`rebuild.ts`), Nachwuchsjahrgang (`youth.ts`), Saisonwechsel (`transition.ts`), Sommerpause-Ablauf (`offseason.ts`) |
| `apps/web` | Oberfläche (8 Reiter: Verein, Kader, Reihen, Taktik, Training, Staff, Spieltag, Liga); `store.tsx` = Spielstand mit Aktions-Warteschlange (Eingaben während einer Simulation werden danach erneut angewendet), Export/Import als Datei; `ui.tsx` = globale Fenster (`components/PlayerProfile`, `ClubSheet`, `HoverLayer`), `PlayerName`/`ClubName` für klickbare Namen, `data-tip` für Tooltips; CSS in `styles/` (base, views, components, features) |
| `apps/sim-cli` | `pnpm sim generate | match | season | calibrate | seasons` |
| `tests/` | 67 Tests in 8 Dateien (world, engine, season, market, team, development, data, stadium) |

### Ablauf eines Spieltags (`playDay` in `matchday.ts`)

Monate abschließen → Entwicklung → **Training der Woche** (inkl. Überlastungsverletzungen) → Genesene zurück, Ausfälle ersetzen → Termine und Zufallsereignis (offene Entscheidung trifft der Co-Trainer) → **Zuschauerprognose je Heimspiel** (Nachfrage, Stimmung, Heimvorteil für die Engine) → Spiele simulieren → Einnahmen buchen und Heimspiel abrechnen (Catering, Spieltagsaktion) → Moral & Chemie → **Fitness, Form, Taktik-Eingespieltheit** → Verletzungen im Spiel und Rückfälle → Fan- und Sponsorenstimmung → Scouting → Markt-Tick → nächsten Spieltag vorbereiten → **Erholung bis zum nächsten Spieltermin** (Fitness zeigt immer den Stand zum Anpfiff) → am Saisonende Prämien, Monate bis 1. August abschließen, Sommerpause Phase 0.

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

**Wochenvorschau & Saisonarchiv (27.11.2026):**
- Wochenvorschau im Reiter Spieltag: bei offenen Spielen Tabellenplatz, Kaderstärke (rot/grün im Vergleich zum eigenen Team) und Form der letzten 5 Spiele des Gegners.
- Saisonarchiv (`core/history.ts`, `archiveSeason` am Anfang von `seasonTransition`): Tabelle, Endplatzierung, Meister/Absteiger und Mannschaftsstatistik (Hauptrunde/Nachsaison) je Saison in `world.archive`; Statistik jedes Spielers in `player.career`.
- Spielerprofil: Abschnitt „Statistik“ mit laufender Saison (*), vergangenen Saisons und Gesamt, umschaltbar Hauptrunde/Playoffs (Feldspieler Sp/T/V/P/+−/SM/Sch, Torhüter Sp/S/GT60/Fq/Shutout); auch bei fremden Spielern sichtbar.
- Liga › Teams: Auswahl der Saison (laufend oder archiviert) mit Meister und Absteiger.
- Archiviert wird ab diesem Stand beim nächsten Saisonwechsel; ältere Saisons laufender Spielstände sind nicht nachträglich verfügbar.

**Meilenstein 9 – Verletzungen & medizinische Abteilung (27.11.2026, Details `docs/verletzungen.md`):**
- Entscheidungen Matthias: Ausfälle ersetzt der Co-Trainer automatisch, der Manager bekommt einen Hinweis; Arzt, Physiotherapeut und Athletiktrainer werden eingestellt und bezahlt; im Schnitt 1–2 Verletzte je Team, 4 gleichzeitig ist selten.
- Verletzungen im Spiel (nach der Partie ausgewürfelt: Eiszeit, Anfälligkeit, Fitness, Alter, Härte des Gegners) und durch Überlastung im Training (Wochenbelastung). 9 Arten von Prellung bis schwerer Verletzung. Verletzt → angeschlagen (Manager kann ihn mit Abzug und Rückfallrisiko einsetzen) → fit. KI setzt Angeschlagene nur in den Playoffs ein.
- Medizinische Abteilung: Athletiktrainer senkt das Risiko, Physio verkürzt Ausfälle, Arzt senkt Rückfälle und macht Prognosen genauer. Unbesetzte Stellen kosten deutlich.
- Staff-Markt (Reiter Staff): vereinslose Trainer, Scouts und Mediziner einstellen (1–3 Saisons, Gehaltsforderung nach Qualität), entlassen mit Abfindung (halbes Restgehalt). Höchstzahl je Rolle. Staff-Verträge laufen vorerst automatisch weiter. Alte Spielstände bekommen beim Laden eine medizinische Abteilung.
- Anzeige: rotes/oranges ✚ an jedem Spielernamen, Lazarett-Karte im Wochenablauf (Schonen/Einsetzen, Rückkehrer), Gesundheit und Verletzungshistorie im Profil, Nachrichten bei Verletzung, Ersatz und Rückkehr.
- Langzeit-Balance unverändert (`pnpm sim seasons 10`: Ø Spieler 10,2–10,4, Top 50 ≈ 12,0, Ø Alter 26,6).
- Offen: Verletzung mitten im Spiel mit Ticker-Meldung (derzeit nach dem Spiel ausgewürfelt), Vertragsgespräche mit Staff, Ersatzlizenz bei Langzeitverletzung.

**Meilenstein 10 – Events (27.11.2026, Details `docs/events.md`):**
- Entscheidungen Matthias: Termine ersetzen je eine Trainingseinheit; Zufallsereignisse etwa alle 2–3 Wochen; Bereiche Mannschaft, Wirtschaft, Fans; jedes Event mit Vor- und Nachteilen; leicht erweiterbar.
- Katalog als Daten in `core/eventCatalog.ts` (12 Termine, 15 Zufallsereignisse); Ablauf und Wirkungen (`Effect`) in `core/events.ts`. Neues Event = neuer Eintrag.
- Wochenstart: „Termin planen“ (2 Plätze, bei 3 Spielen 1; Abnutzung bei Wiederholung, Pausen), Zufallsereignis als Karte im Reiter Spieltag mit Antworten; Spielknöpfe erst nach der Entscheidung, „Schnell weiter“ lässt den Co-Trainer entscheiden.
- Neue Werte Fanstimmung (Zuschauer bis ±10 % der Halle) und Sponsorenzufriedenheit (Sponsoreneinnahmen ±8 %), Anzeige im Reiter Verein; „Vereinsleben“ listet die Ergebnisse.
- Langzeit-Balance unverändert (`pnpm sim seasons 10`).

**Meilenstein 11 – Sponsoring (27.11.2026, Details `docs/sponsoring.md`):**
- Entscheidungen Matthias: 7 Bereiche (9 Flächen), Verhandeln über 3 Runden, Geschäftsführer gleich mit, Pflichttermine Teil der Verhandlung.
- Verträge je Fläche mit Grundbetrag, Boni (Playoffs, Halbfinale, Titel, Top 6, Zuschauerschnitt), Pflichtterminen, Laufzeit, Abstiegsklausel; sechs Partner-Typen mit eigenen Wünschen und eigener Zufriedenheit. Daten und Ablauf in `core/sponsors.ts` (`SLOT`, `TYPE`, `SPON`).
- Einnahmen kommen jetzt aus den Verträgen (`sponsorAnnual`) statt aus `finances.sponsorIncome`; Boni in der Saisonbilanz. Pflichttermine über „Sponsorenabend“/„Werbedreh“.
- Sommerpause: Angebote in den Vertragsgesprächen (`sponsorSummer`), Saisonwechsel unterschreibt Offenes (`sponsorKickoff`, Notlösung für leere Flächen). Geschäftsführer (`manager`, `ratings.business`) auf dem Staff-Markt (`MARKET_ROLES`), kann delegiert verhandeln.
- Reiter Verein › Sponsoren. Langzeit-Balance unverändert.

**Meilenstein 12a – Stadionbetrieb & Zuschauer (27.11.2026, Details `docs/stadion.md`):**
- Entscheidungen Matthias: 3 Platzbereiche (Steh, Sitz, Business/VIP); Spieltagsaktionen mit eigenem Platz je Heimspiel, stadionbezogene Termine (Kindertag, Familientag, Business-Spieltag) dorthin verschoben; Catering Eigenbetrieb (Risiko/Ertrag) oder Pächter (sicher); Zuschauer wirken über Menge und Stimmung auf den Heimvorteil; Dauerkarten später mit der Sommerpause.
- Nachfrage je Bereich aus Fanbasis, Tabelle, Form, Gegner, Derby (1 Rivale je Verein), Wettbewerb, Wochentag, Saisonphase, Fanstimmung, Stars/Eigengewächsen, Events, Aktion und Preis (Steh am preisempfindlichsten); Gästeblock; Abgewiesene bei Überhang.
- Heimvorteil der Engine je Spiel (`MatchInput.homeEdge`, `HOME_BASE`/`HOME_CROWD`/`HOME_ATMOS`), Schnitt 0,040 wie bisher; Kalibrierung unverändert.
- Catering je Kopf (Angebot, Preisniveau, Wartezeiten, Sieg/Derby/Playoffs), Fanshop monatlich; neue Buchungskategorien `merch` und `matchday`. Saisonplanung aus den erwarteten Spieltagserlösen.
- 10 Spieltagsaktionen in `core/stadiumActions.ts`; Business-Spieltag zählt als Sponsor-Pflichttermin. Geschäftsführer: Preise nach Leitlinie, Aktionen planen. KI: Preise nach Profil.
- Fanbasis ändert sich beim Saisonwechsel (±3). Reiter Verein › Stadion (Prognose mit Faktoren, Preise mit Vorschau, Catering/Fanshop, Aktionsplan, Heimspiel-Berichte).
- Langzeit-Balance unverändert (`pnpm sim seasons 10`); Wirtschaftsprüfung mit `npx tsx scripts/econ-check.ts 4 2026`.

**Wochencockpit im Reiter Spieltag (28.11.2026, Variante A gewählt von Matthias):**
- Feste Kopfleiste: Woche, Wettbewerbsstand, Ablauf (1 Woche planen → 2 Spiele) und nur die gerade passenden Knöpfe (Woche starten / Live gegen … / Sofort / Spieltag simulieren; bei offenem Zufallsereignis „Entscheidung offen ↓“), „Schnell weiter“ als Ausklappmenü.
- Wochenstreifen Mo–So: Trainingseinheiten und Termine auf den spielfreien Tagen, Spiele mit Gegner und Ergebnis, nächstes Spiel hervorgehoben, Spieltagsaktion direkt am Heimspiel wählbar, Zuschauer nach dem Heimspiel.
- Eine Zeile Rückblick (Vorwoche) bzw. Stand der Woche (Training erledigt, Fitness/Moral/Form vorher → jetzt); Planung (Training | Termine) nebeneinander nur vor dem Wochenstart.
- Kacheln: Nächstes Spiel (Stärke, Form des Gegners, Zuschauerprognose), Tabellenausschnitt bzw. Serien in der Nachsaison, Kabine (Fitness/Moral/Form, Lazarett mit Schonen/Einsetzen). Darunter letzter Spieltag und Nachrichten (6, „alle anzeigen“). Vereinsleben steht in den Nachrichten und unter Verein.
- Code: `views/Matchday.tsx` (Ablauf, Kopfleiste), `views/Week.tsx` (Streifen, Planung, Kacheln), Styles im Block „Spieltag-Cockpit“ in `views.css`. Live-Spiel unverändert.

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
- Stadion (M12a): 3 Platzbereiche, Spieltagsaktionen je Heimspiel, Catering Eigenbetrieb/Pächter, Zuschauer-Menge und -Stimmung wirken auf den Heimvorteil, Dauerkarten später

## Nächste Schritte

1. **Als Nächstes (Reihenfolge Matthias, 28.11.2026):** ~~Wochencockpit~~ (erledigt) → Sommerpause ausprogrammieren (Vertragsgespräche, Transfermarkt, Trainingslager, Vorbereitungsspiele, Dauerkarten) → 12b Stadionausbau
2. **Meilenstein 12b – Stadionausbau** (Plätze je Bereich, Komfort, Logen, Bauzeit, Finanzierung; Nachfrage-Überhang aus 12a als Grundlage)
3. Neu vorgemerkt (28.11.2026, später mit den offenen Punkten): **Jugendarbeit mit Investition** – mehr Geld in die Nachwuchsarbeit (Akademie, Jugendtrainer) = bessere Nachwuchsjahrgänge; **Spielfeld-Grafik im Live-Spiel** – Eisfläche parallel zum Ticker, auf der man sieht, wo sich das Spiel gerade abspielt, Schüsse und Tore als Punkte
4. Offen aus M12a: Dauerkarten (mit Sommerpause), Spieltagsaktionen für KI-Vereine, Rivalitäten in der Datenwerkstatt, Zuschauer/Stimmung im Live-Ticker
5. Offen aus dem Training: Testspiele in der Vorbereitung, Trainingslager mit Ort/Kosten, Positionsumschulung
6. Offen aus M9: Verletzung im Spiel mit Ticker, Staff-Vertragsgespräche
7. Offen aus M10: Eiszeit-Versprechen nachverfolgen, Sperre automatisch, Events für KI-Vereine
8. Offen aus M11: Sponsorenzeile in den Phasenberichten, Partner mit Bedingungen
9. Später mit der grafischen Aufbereitung: Sponsoren als eigene Einträge mit Logos (erzeugt oder hochgeladen), Anzeige auf Trikot, Bande, Halle (Details `docs/sponsoring.md`)
10. Nebenbei: Dominanz des stärksten Vereins, Kalibrierung (leeres Tor, Überzahl- und Fangquote), mehrere Spielstände, Vertragsgespräche und Transfermarkt in der Sommerpause
11. Multiplayer später
