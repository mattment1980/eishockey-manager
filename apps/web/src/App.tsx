import { useState } from 'react';
import { useStore } from './store.tsx';
import { Crest } from './components/Crest.tsx';
import { ClubSelect } from './views/ClubSelect.tsx';
import { Overview } from './views/Overview.tsx';
import { Roster } from './views/Roster.tsx';
import { Lineup } from './views/Lineup.tsx';
import { TacticsView } from './views/Tactics.tsx';
import { MatchView } from './views/Match.tsx';

export type Tab = 'overview' | 'roster' | 'lineup' | 'tactics' | 'match';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Verein', icon: 'M4 10l8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z' },
  { id: 'roster', label: 'Kader', icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19c0-3 3-5 6-5s6 2 6 5M14 14c3 0 8 1 8 5' },
  { id: 'lineup', label: 'Reihen', icon: 'M4 6h16M4 12h16M4 18h16' },
  { id: 'tactics', label: 'Taktik', icon: 'M5 5l4 4m0-4L5 9M15 15l4 4m0-4l-4 4M7 17c4 0 4-10 10-10m0 0l-3-2m3 2l-2 3' },
  { id: 'match', label: 'Spiel', icon: 'M4 16c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3zm0 0v-2c0-2 3.6-3 8-3s8 1 8 3v2' },
];

export function App() {
  const { club } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  if (!club) return <ClubSelect />;

  return (
    <div className="app" style={{ ['--club' as string]: club.colors.primary }}>
      <header className="topbar">
        <Crest club={club} size={34} />
        <div className="topbar-title">
          <strong>{club.name}</strong>
          <span>Saison 2026/27 · Testliga</span>
        </div>
      </header>
      <main className="content">
        {tab === 'overview' && <Overview go={setTab} />}
        {tab === 'roster' && <Roster />}
        {tab === 'lineup' && <Lineup />}
        {tab === 'tactics' && <TacticsView />}
        {tab === 'match' && <MatchView />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
