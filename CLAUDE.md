# Hinweise für Claude

- Sprache im Spiel und in Doku: Deutsch. Code-Bezeichner: Englisch.
- Spiellogik gehört nach `packages/core` und bleibt frei von UI/DB-Abhängigkeiten (reine Funktionen, Zufall nur über `Rng` mit Startwert).
- Datenformat ändert sich nur über `packages/schema`; bei Brüchen `SCHEMA_VERSION` erhöhen.
- Engine-Parameter nur in `packages/core/src/engine/constants.ts` ändern und danach `pnpm sim calibrate 10` laufen lassen; Ergebnis in `docs/kalibrierung.md` festhalten.
- Vor jedem Commit: `pnpm typecheck && pnpm test`.
- Keine realen Vereins-, Spieler- oder Ligamarken; nur Fantasienamen.
