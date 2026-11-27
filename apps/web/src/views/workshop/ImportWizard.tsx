import { useMemo, useState } from 'react';
import type { World } from '@ehm/schema';
import { overall, toDisplay1, refreshLineup, seedDevRef } from '@ehm/core';
import {
  parseCsv, autoMap, guessKind, PLAYER_FIELDS, CLUB_FIELDS, previewPlayers, previewClubs, applyPlayers, applyClubs,
  importWorldJson, rebuildWorld, type CsvTable, type Mapping, type CsvField,
} from '@ehm/data';
import { useStore } from '../../store.tsx';
import { fmt1 } from '../../format.ts';
import type { WorkshopMode } from './Workshop.tsx';

type Kind = 'players' | 'clubs';
type Mode = 'merge' | 'replace';

/**
 * Import-Assistent: Datei wählen → (CSV) Art und Modus wählen, Spalten zuordnen → Prüfung und Vorschau → Übernehmen.
 * JSON = kompletter Datensatz (nur vor Spielbeginn).
 */
export function ImportWizard({ mode: wsMode }: { mode: WorkshopMode }) {
  const { world, replaceWorld, editWorld } = useStore();
  const [file, setFile] = useState<string | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [json, setJson] = useState<{ world: World } | { errors: string[] } | null>(null);
  const [kind, setKind] = useState<Kind>('players');
  const [mode, setMode] = useState<Mode>('merge');
  const [map, setMap] = useState<Mapping>({});
  const [done, setDone] = useState<string | null>(null);
  const setup = wsMode === 'setup';

  const load = async (f: File) => {
    setDone(null);
    const text = await f.text();
    setFile(f.name);
    if (f.name.toLowerCase().endsWith('.json') || text.trim().startsWith('{')) {
      setTable(null);
      const r = importWorldJson(text);
      setJson(r.ok ? { world: r.world } : { errors: r.errors });
      return;
    }
    const t = parseCsv(text);
    const k = guessKind(t.headers);
    setJson(null);
    setTable(t);
    setKind(k);
    setMode('merge');
    setMap(autoMap(t.headers, k === 'players' ? PLAYER_FIELDS : CLUB_FIELDS));
  };
  const switchKind = (k: Kind) => { setKind(k); if (table) setMap(autoMap(table.headers, k === 'players' ? PLAYER_FIELDS : CLUB_FIELDS)); };

  const preview = useMemo(() => {
    if (!table) return null;
    return kind === 'players' ? previewPlayers(world, table, map, mode) : previewClubs(world, table, map, mode);
  }, [world, table, kind, map, mode]);
  const fatal = !!preview?.errors.some((e) => e.row === 0) || !preview?.items.length;

  const apply = () => {
    if (!preview || !table) return;
    if (kind === 'players') {
      const items = (preview as ReturnType<typeof previewPlayers>).items;
      if (setup) {
        const r = rebuildWorld(applyPlayers(world, items, mode));
        if (r.errors.length) return setDone(`Nicht übernommen: ${r.errors.slice(0, 3).join(' ')}`);
        replaceWorld(r.world);
      } else {
        editWorld((w) => {
          let next = seedDevRef(applyPlayers(w, items, 'merge'));
          for (const c of next.clubs) next = refreshLineup(next, c.id);
          return next;
        });
      }
    } else {
      const items = (preview as ReturnType<typeof previewClubs>).items;
      editWorld((w) => applyClubs(w, items));
    }
    setDone(`Übernommen: ${preview.items.length} Zeilen (${preview.creates} neu, ${preview.updates} geändert).`);
    setTable(null);
  };

  const fields = kind === 'players' ? PLAYER_FIELDS : CLUB_FIELDS;
  return (
    <div className="stack">
      <section className="card">
        <h3>Datei wählen</h3>
        <p className="muted small">
          CSV (Spieler oder Vereine, Trennzeichen ; oder ,) – Spalten werden automatisch erkannt und lassen sich zuordnen.
          {setup ? ' JSON = kompletter Datensatz.' : ' Im laufenden Spiel werden Daten nur ergänzt bzw. geändert (Zusammenführen).'}
          {' '}Vorlage: unter „Export“ die aktuellen Daten als CSV herunterladen, bearbeiten und wieder importieren.
        </p>
        <input type="file" accept=".csv,.txt,.json,text/csv,application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f); }} />
        {done && <p className="small">{done}</p>}
      </section>

      {json && (
        <section className="card">
          <h3>{file}</h3>
          {'errors' in json ? (
            <><p className="loss small">Die Datei ist kein gültiger Datensatz:</p><ul className="small">{json.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul></>
          ) : !setup ? (
            <p className="muted small">Ein kompletter Datensatz lässt sich nur vor Spielbeginn laden. Einen gesicherten Spielstand lädst du unter „Verein › Spielstand“.</p>
          ) : (
            <>
              <p className="small">Datensatz mit {json.world.clubs.length} Vereinen und {json.world.players.length} Spielern. Er ersetzt den aktuellen Datensatz; Spielplan und Aufstellungen werden neu aufgebaut.</p>
              <button className="btn primary" onClick={() => {
                const r = rebuildWorld(json.world);
                if (r.errors.length) return setDone(`Nicht übernommen: ${r.errors.slice(0, 3).join(' ')}`);
                replaceWorld(r.world); setJson(null); setDone('Datensatz übernommen.');
              }}>Datensatz übernehmen</button>
            </>
          )}
        </section>
      )}

      {table && preview && (
        <>
          <section className="card">
            <h3>{file} · {table.rows.length} Zeilen</h3>
            <div className="row-gap wrap">
              <div className="segmented small-seg">
                <button className={kind === 'players' ? 'on' : ''} onClick={() => switchKind('players')}>Spieler</button>
                <button className={kind === 'clubs' ? 'on' : ''} onClick={() => switchKind('clubs')}>Vereine</button>
              </div>
              <div className="segmented small-seg">
                <button className={mode === 'merge' ? 'on' : ''} onClick={() => setMode('merge')} data-tip="Bestehende Einträge werden über ID oder Name gefunden und nur in den zugeordneten Spalten geändert; Unbekannte werden neu angelegt.">Zusammenführen</button>
                {setup && <button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')} data-tip={kind === 'players' ? 'Alle Spieler werden durch die Datei ersetzt. Jeder Verein braucht danach einen spielfähigen Kader.' : 'Zeile für Zeile auf die bestehenden Vereine – so lässt sich die ganze Liga umbenennen (gleiche Anzahl nötig).'}>Ersetzen</button>}
              </div>
            </div>
          </section>

          <section className="card">
            <h3>Spalten zuordnen</h3>
            <div className="map-grid">
              {fields.map((f: CsvField) => (
                <label key={f.key} className={f.required ? 'req' : ''} data-tip={f.hint}>
                  <span>{f.label}{f.required ? ' *' : ''}</span>
                  <select value={map[f.key] ?? ''} onChange={(e) => setMap({ ...map, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">– nicht zuordnen –</option>
                    {table.headers.map((h, i) => <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="card">
            <h3>Prüfung und Vorschau</h3>
            <p className="small">{preview.items.length} gültige Zeilen · {preview.creates} neu · {preview.updates} ändern bestehende · {preview.errors.length} Hinweise/Fehler</p>
            {preview.errors.length > 0 && (
              <ul className="import-errors small">
                {preview.errors.slice(0, 25).map((e, i) => <li key={i}>{e.row ? `Zeile ${e.row}: ` : ''}{e.message}</li>)}
                {preview.errors.length > 25 && <li>… und {preview.errors.length - 25} weitere</li>}
              </ul>
            )}
            <div className="scroll-x">
              <table className="stats">
                {kind === 'players' ? (
                  <>
                    <thead><tr><th>Zeile</th><th>Name</th><th>Pos</th><th>Verein</th><th>Stärke</th><th></th></tr></thead>
                    <tbody>{(preview as ReturnType<typeof previewPlayers>).items.slice(0, 12).map((x) => (
                      <tr key={x.row}><td>{x.row}</td><td>{x.player.firstName} {x.player.lastName}</td><td>{x.player.position}</td>
                        <td>{x.player.contract ? world.clubs.find((c) => c.id === x.player.contract!.clubId)?.shortName : 'vereinslos'}</td>
                        <td>{fmt1(toDisplay1(overall(x.player)))}{x.existing && Math.round(overall(x.player)) !== Math.round(overall(x.existing)) ? ` (vorher ${fmt1(toDisplay1(overall(x.existing)))})` : ''}</td>
                        <td>{x.existing ? 'ändern' : 'neu'}</td></tr>
                    ))}</tbody>
                  </>
                ) : (
                  <>
                    <thead><tr><th>Zeile</th><th>Bisher</th><th>Neu</th><th>Kürzel</th></tr></thead>
                    <tbody>{(preview as ReturnType<typeof previewClubs>).items.slice(0, 16).map((x) => (
                      <tr key={x.row}><td>{x.row}</td><td>{x.target.name}</td><td>{x.club.name}</td><td>{x.club.shortName}</td></tr>
                    ))}</tbody>
                  </>
                )}
              </table>
            </div>
            <button className="btn primary" disabled={fatal} onClick={apply}>Übernehmen</button>
            {fatal && <p className="muted small">Erst Pflichtfelder zuordnen bzw. Fehler beheben.</p>}
          </section>
        </>
      )}
    </div>
  );
}
