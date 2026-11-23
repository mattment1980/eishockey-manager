# Eishockey-Manager

Browserbasierter Eishockey-Manager mit Fokus auf deutsches/europäisches Eishockey.
Fantasienamen, ereignisbasierte Match-Engine mit Text-Ticker und Live-Statistiken.

## Stand

| Meilenstein | Inhalt | Status |
|---|---|---|
| 1 Fundament | Monorepo, Schemas, Zufallsgenerator, Weltgenerator (DEL2-Modell, 14 Vereine) | ✅ |
| 2 Engine v0 + Kalibrierung | Ereignisbasierte Simulation, Ticker, Statistiken, Massensimulation | ✅ |
| 3 Oberfläche | Kader, Aufstellung, Taktik, Spiel mit Ticker | offen |
| 4 Saison | Spielplan, Tabelle, Pre-Playoffs, Playoffs, Playdowns, KI-Manager | offen |
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
pnpm sim season 7         # Komplette Hauptrunde mit Tabelle und Topscorern
pnpm sim calibrate 10     # Massensimulation mit Richtwerten
```

## Struktur

```
packages/schema   Datenschemas (Zod) und Typen – Welt → Land → Liga → Verein
packages/core     Spiellogik ohne UI/DB: Engine, Aufstellung, Spielplan, Tabelle
packages/data     Weltgenerator, DEL2-Modell-Konfiguration, Import/Export
apps/sim-cli      Kommandozeile für Simulation und Kalibrierung
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
