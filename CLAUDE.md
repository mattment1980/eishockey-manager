# Hinweise für Claude

- Sprache im Spiel und in Doku: Deutsch. Code-Bezeichner: Englisch.
- Spiellogik gehört nach `packages/core` und bleibt frei von UI/DB-Abhängigkeiten (reine Funktionen, Zufall nur über `Rng` mit Startwert).
  Ausnahme: Was neue Spieler oder Staff erzeugt (Weltgenerator, Saisonwechsel, Ablauf der Sommerpause), liegt in `packages/data`, weil es den Generator braucht. Die eigentlichen Regeln (z. B. Entwicklung, Trainingslager) bleiben in `core`; `data` ruft sie nur auf.
- Datenformat ändert sich nur über `packages/schema`; bei Brüchen `SCHEMA_VERSION` erhöhen und Migration in `packages/data/src/io.ts` ergänzen.
- Engine-Parameter nur in `packages/core/src/engine/constants.ts` ändern und danach `pnpm sim calibrate 10` laufen lassen; Ergebnis in `docs/kalibrierung.md` festhalten.
- Vor jedem Commit: `pnpm typecheck && pnpm test`.
- Reine Umbauten (ohne gewollte Verhaltensänderung): vorher und nachher `pnpm fingerprint` – die Hashes müssen gleich bleiben.
- Keine realen Vereins-, Spieler- oder Ligamarken; nur Fantasienamen.

## Aufbau (Kurzfassung)

- `packages/core/src/engine/`: Match-Engine. `match.ts` hält Zustand und Ablauf; die Bereiche liegen als Methoden in eigenen Dateien (`lines`, `rules`, `modifiers`, `phases`, `shots`, `penalties`, `shootout`) und werden per `Object.assign` an die Klasse gehängt. Neue Methode = Funktion mit `this: MatchSim` in der passenden Datei exportieren.
- `packages/core/src/`: `competition.ts` (Spielplan, Serien), `standings.ts` (Tabelle, Form, Teamstatistik), `matchday.ts` (Ablauf eines Spieltags), dazu je Teilsystem eine Datei (economy, market, scouting, chemistry, condition, familiarity, offseason …). Formeln, die Engine und Anzeige teilen (z. B. `effectiveRating`, `formMoraleMod`), stehen in `ratings.ts`.
- `apps/web/src/store.tsx`: Spielstand. Jede Eingabe des Managers läuft als Aktion über `act`; während einer Simulation (`simulate`) werden Aktionen gemerkt und auf das Ergebnis erneut angewendet. Neue Eingaben deshalb immer als Aktion anlegen, nie direkt `setSave`.
- `apps/web/src/ui.tsx`: globale Fenster (Spielerprofil, Vereinskader) und Mouseover. Spieler- und Vereinsnamen immer über `PlayerName` / `ClubName` anzeigen; Tooltips über das Attribut `data-tip`.
- `apps/web/src/styles/`: `base.css` (Grundlagen), `views.css` (Ansichten), `components.css` (gemeinsame Bausteine), `features.css` (Markt-Baum, Sommerpause, Drag & Drop). Neue Regeln in die passende Datei, keine Überschreib-Blöcke am Ende anhängen.
- `tests/`: je Bereich eine Datei (`world`, `engine`, `season`, `market`, `team`), gemeinsame Testwelt in `helpers.ts`.
