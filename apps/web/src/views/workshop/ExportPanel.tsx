import { exportPlayersCsv, exportClubsCsv, exportWorldJson } from '@ehm/data';
import { useStore } from '../../store.tsx';
import { download } from '../../download.ts';

/** Daten als CSV (für Tabellenkalkulation) oder kompletten Datensatz als JSON herunterladen */
export function ExportPanel() {
  const { world } = useStore();
  const stamp = world.date;
  return (
    <section className="card">
      <h3>Export</h3>
      <p className="muted small">CSV-Dateien lassen sich in Excel oder LibreOffice öffnen (Trennzeichen Semikolon, Werte 1–20 mit Komma), bearbeiten und unter „Import“ wieder einlesen – auch als Vorlage für eigene Namens- oder Datenpakete.</p>
      <div className="row-gap wrap">
        <button className="btn" onClick={() => download(`spieler_${stamp}.csv`, exportPlayersCsv(world), 'text/csv')}>Spieler (CSV)</button>
        <button className="btn" onClick={() => download(`vereine_${stamp}.csv`, exportClubsCsv(world), 'text/csv')}>Vereine (CSV)</button>
        <button className="btn" onClick={() => download(`datensatz_${stamp}.json`, exportWorldJson(world), 'application/json')}>Kompletter Datensatz (JSON)</button>
      </div>
    </section>
  );
}
