# Eishockey-Manager

Browserbasierter Eishockey-Manager mit Fokus auf deutsches/europäisches Eishockey.
Fantasienamen, ereignisbasierte Match-Engine mit Text-Ticker und Live-Statistiken.

## Stand

| Meilenstein | Inhalt | Status |
|---|---|---|
| 1 Fundament | Monorepo, Schemas, Zufallsgenerator, Weltgenerator (DEL2-Modell, 14 Vereine) | ✅ |
| 2 Engine v0 + Kalibrierung | Ereignisbasierte Simulation, Ticker, Statistiken, Massensimulation | ✅ |
| 3 Oberfläche | Vereinswahl, Kader, Reihen, Taktik, Spiel mit Live-Ticker, Live-Stats und Schusskarte | ✅ |
| 4 Saison | Spielplan, Spieltage, Tabelle, Pre-Playoffs, Playoffs, Playdowns, Statistiken, KI-Torhüterrotation und Spielstile | ✅ |
| 5 Markt & Geld | Transfers, Verträge, Scouting, Wirtschaft | offen |
| 6 Coaching & Chemie | Coaching-Regeln, Matchups, Traits, Moral | offen |
| 7 Saisonwechsel & Daten | Entwicklung, Nachwuchs, Import/Export, Editor | offen |

## Schnellstart

```bash
pnpm install
pnpm test                 # Tests
pnpm typecheck            # Typprüfung
pnpm sim generate         # Welt erzeugen (welt-2026.json)
pnpm sim match 3          # Ein Spiel mit Ticker und Statistik
pnpm sim season 2026      # Komplette Saison inkl. Playoffs und Playdowns
pnpm sim calibrate 10     # Massensimulation mit Richtwerten
pnpm dev                  # Web-App lokal starten (http://localhost:5173)
pnpm build                # Web-App bauen (apps/web/dist)
```

Die Web-App wird bei jedem Push auf `main` per GitHub Actions auf GitHub Pages veröffentlicht
(einmalig in den Repository-Einstellungen unter Pages die Quelle „GitHub Actions“ wählen).

## Struktur

```
packages/schema   Datenschemas (Zod) und Typen – Welt → Land → Liga → Verein
packages/core     Spiellogik ohne UI/DB: Engine, Aufstellung, Spielplan, Tabelle
packages/data     Weltgenerator, DEL2-Modell-Konfiguration, Import/Export
apps/sim-cli      Kommandozeile für Simulation und Kalibrierung
apps/web          Browser-Oberfläche (React + Vite), Simulation im Web Worker
docs/             Kalibrierungsberichte
tests/            Vitest-Tests
```

## Engine in Kürze

Jeder Puckbesitz läuft als Ereigniskette: Bully → Breakout → neutrale Zone/Zoneneintritt
→ Angriffszone (Zyklus) → Schuss (geblockt, vorbei, gehalten, Rebound, Tor).
Jede Aktion ist ein Duell gewichteter Attribute (inkl. Frische, Form, Moral, Heimvorteil,
Tagesform, Taktik, personeller Überlegenheit). Alle Stellschrauben liegen in
`packages/core/src/engine/constants.ts`. Der Zufall ist deterministisch (Startwert),
jedes Spiel ist reproduzierbar.
