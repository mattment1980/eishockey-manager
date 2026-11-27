# Übergabe – Stand der Entwicklung

Stand: 27.11.2026 · letzter Commit „M6b: Chemie & Moral“ (f4b6928)

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
| **7** | **Saisonwechsel & Daten: Alterung/Entwicklung, Nachwuchs, CSV-Import/Export, Editor** | **als Nächstes** |
| V1.5 | Multiplayer (Server, Accounts, private Ligen) | später |
| V2 | Verletzungen & Medizin, Training, Trait-Entwicklung, Manager-Karriere, Ligensystem u. a. | später |

## Technik

- TypeScript, pnpm-Monorepo; Zod-Schemas mit Standardwerten und Migrationen; React + Vite; Spiel-Simulation im Web Worker; Speicherstand in `localStorage`; Tests mit Vitest; CLI mit tsx (`pnpm sim …`)
- Deterministischer Zufall (`Rng`, sfc32, mit Startwert) – jedes Spiel ist reproduzierbar
- Arbeitsregeln stehen in `CLAUDE.md` (Spiellogik nur in `packages/core`, Datenformat nur über `packages/schema` mit `SCHEMA_VERSION`, Engine-Parameter nur in `constants.ts` + Kalibrierung, vor jedem Commit `pnpm typecheck && pnpm test`, nur Fantasienamen)

### Pakete

| Paket | Inhalt |
|---|---|
| `packages/schema` | Datenmodell (Welt, Land, Liga, Verein, Spieler, Staff, Vertrag, Wettbewerb, Scouting, Markt, Matchplan, Coaching-Regeln, Chemie), aktuell **SCHEMA_VERSION 6** |
| `packages/core` | Spiellogik: `engine/` (match.ts, types.ts, constants.ts), `competition.ts` (Spielplan, Spieltag, Playoffs), `economy.ts`, `scouting.ts`, `market.ts`, `coaching.ts`, `chemistry.ts`, `lineup.ts`, `ratings.ts` |
| `packages/data` | Weltgenerator, Namen, Import/Export + Migration v1→v6 (`io.ts`), Saisonwechsel (`transition.ts`) |
| `apps/web` | Oberfläche (7 Reiter: Verein, Kader, Reihen, Taktik, Staff, Spieltag, Liga) |
| `apps/sim-cli` | `pnpm sim generate | match | season | calibrate | seasons` |
| `tests/core.test.ts` | 26 Tests |

### Ablauf eines Spieltags (`playDay`)

Monate abschließen → Spiele simulieren → Einnahmen buchen → **Moral & Chemie aktualisieren** → Scouting → Markt-Tick → nächsten Spieltag vorbereiten → am Saisonende Saisonbewertung und Monate bis 1. August abschließen.

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

**Saisonwechsel (bisher):** Verträge, Klauseln, Karriereende, neue freie Spieler, KI-Kaderauffüllung, Nachwuchs für den menschlichen Verein, neue Aufstellungen, Chemie-Saat, Moral pendelt sich ein. **Noch nicht:** Alterung/Entwicklung der Spielerwerte.

## Kalibrierung (10 Saisons, siehe `docs/kalibrierung.md`)

Tore ≈ 3,09 je Team, Schüsse 31,0, Corsi 59,5, Fangquote 90,0 %, Überzahlquote 16,9 %, Verlängerung 20,0 %, Heimsiege 55,6 %, Corsi > 2:1 in 9,7 % der Spiele, klarer Favorit gewinnt 77,5 % (kleine Stichprobe).

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
- Verletzungen und medizinische Abteilung: vorgemerkt für V2

## Nächster Schritt: Meilenstein 7

1. Alterung und Spielerentwicklung (monatlich klein, Sommer groß; Potenzial, Alter, Eiszeit, Trainer/Ausbilder, Mentoren, Perfektionist) – Konzept im Projekt-Dokument „spielerentwicklung“
2. Nachwuchsjahrgang für alle Vereine
3. CSV-/JSON-Import und -Export mit Validierung und Vorschau
4. Einfacher Editor für Spieler und Vereine
5. Optional: Kalibrierungs-Punkt „Torhüter raus“ der KI nachschärfen
