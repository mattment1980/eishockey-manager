import { useEffect, type ReactNode } from 'react';

/** Fenster (Bottom-Sheet auf dem Handy, Dialog auf dem Desktop) mit Schließen-Button oben rechts und Esc */
export function Sheet({ onClose, label, children, wide }: { onClose: () => void; label: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={label}>
        <button className="sheet-x" onClick={onClose} aria-label="Schließen" data-tip="Schließen (Esc)">✕</button>
        {children}
      </div>
    </div>
  );
}
