import { useRef, useState } from 'react';
import { useStore } from '../store.tsx';

function ask(text: string): boolean {
  try { return window.confirm(text); } catch { return true; }
}

/** Spielstand: automatisch im Browser, dazu Sicherung als Datei herunterladen und wieder laden */
export function SaveCard() {
  const { world, club, exportSave, importSave, newGame, saveError } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const download = () => {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eishockey-manager_${club?.shortName ?? 'spiel'}_${world.date}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({ ok: true, text: 'Sicherung heruntergeladen.' });
  };

  const load = async (f: File) => {
    if (!ask('Sicherung laden? Der aktuelle Spielstand wird ersetzt.')) return;
    const errors = importSave(await f.text());
    setMsg(errors.length ? { ok: false, text: `Die Datei konnte nicht geladen werden: ${errors.slice(0, 3).join('; ')}` } : { ok: true, text: 'Sicherung geladen.' });
  };

  return (
    <section className="card">
      <h3>Spielstand</h3>
      <p className="muted small">
        {saveError ?? 'Wird automatisch in diesem Browser gespeichert.'} Eine Sicherung als Datei schützt vor Verlust (Browserdaten gelöscht, anderes Gerät) und lässt sich jederzeit wieder laden.
      </p>
      <div className="row-gap wrap">
        <button className="btn" onClick={download}>Sicherung herunterladen</button>
        <button className="btn" onClick={() => file.current?.click()}>Sicherung laden …</button>
        <button className="btn ghost" onClick={() => { if (ask('Neues Spiel beginnen? Der aktuelle Spielstand wird gelöscht.')) newGame(); }}>Neues Spiel beginnen</button>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f); }} />
      {msg && <p className={`small ${msg.ok ? 'win' : 'loss'}`}>{msg.text}</p>}
    </section>
  );
}
