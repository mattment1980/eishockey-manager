import { useState } from 'react';
import { useStore } from '../../store.tsx';
import { ClubEditor } from './ClubEditor.tsx';
import { PlayerEditor } from './PlayerEditor.tsx';
import { ImportWizard } from './ImportWizard.tsx';
import { ExportPanel } from './ExportPanel.tsx';

export type WorkshopMode = 'setup' | 'game';
type Tab = 'clubs' | 'players' | 'import' | 'export';

/**
 * Datenwerkstatt.
 * - Vor Spielbeginn („setup“): Vereine und Spieler frei bearbeiten, importieren, als Vorlage speichern.
 * - Im laufenden Spiel („game“): nur Namen und Farben ändern; Import nur als Ergänzung (Zusammenführen).
 */
export function Workshop({ mode, onClose }: { mode: WorkshopMode; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('clubs');
  const { saveTemplate } = useStore();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack workshop">
      <div className="row-between">
        <div>
          <h2>Datenwerkstatt</h2>
          <p className="muted small">
            {mode === 'setup'
              ? 'Datensatz vor dem Spielstart bearbeiten: Vereine, Spieler und Werte. Danach Verein wählen und loslegen.'
              : 'Im laufenden Spiel lassen sich nur Namen und Farben ändern. Importe ergänzen den Spielstand (Zusammenführen).'}
          </p>
        </div>
        <button className="btn" onClick={onClose}>{mode === 'setup' ? 'Zur Vereinswahl' : 'Fertig'}</button>
      </div>
      <div className="tabs">
        {([['clubs', 'Vereine'], ['players', 'Spieler'], ['import', 'Import'], ['export', 'Export']] as [Tab, string][]).map(([id, l]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>
      {tab === 'clubs' && <ClubEditor mode={mode} />}
      {tab === 'players' && <PlayerEditor mode={mode} />}
      {tab === 'import' && <ImportWizard mode={mode} />}
      {tab === 'export' && <ExportPanel />}
      {mode === 'setup' && (
        <section className="card">
          <h3>Vorlage</h3>
          <p className="muted small">Den bearbeiteten Datensatz im Browser als Vorlage speichern – bei „Neues Spiel“ lässt er sich wieder laden. Für andere Geräte: unter „Export“ als Datei sichern.</p>
          <button className="btn" onClick={() => setMsg(saveTemplate() ?? 'Vorlage gespeichert.')}>Als Vorlage speichern</button>
          {msg && <p className="small">{msg}</p>}
        </section>
      )}
    </div>
  );
}
