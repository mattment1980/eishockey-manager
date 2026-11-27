import { useState } from 'react';
import { stageLabel, OFFSEASON_PHASES } from '@ehm/core';
import { useStore } from './store.tsx';
import { Crest } from './components/Crest.tsx';
import { ClubSelect } from './views/ClubSelect.tsx';
import { Overview } from './views/Overview.tsx';
import { Roster } from './views/Roster.tsx';
import { Lineup } from './views/Lineup.tsx';
import { TacticsView } from './views/Tactics.tsx';
import { TrainingView } from './views/Training.tsx';
import { Matchday } from './views/Matchday.tsx';
import { League } from './views/League.tsx';
import { StaffView } from './views/StaffView.tsx';
import { UiProvider } from './ui.tsx';
import { Workshop } from './views/workshop/Workshop.tsx';

export type Tab = 'overview' | 'roster' | 'lineup' | 'tactics' | 'training' | 'staff' | 'match' | 'league' | 'data';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Verein', icon: 'M4 10l8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z' },
  { id: 'roster', label: 'Kader', icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19c0-3 3-5 6-5s6 2 6 5M14 14c3 0 8 1 8 5' },
  { id: 'lineup', label: 'Reihen', icon: 'M4 6h16M4 12h16M4 18h16' },
  { id: 'tactics', label: 'Taktik', icon: 'M5 5l4 4m0-4L5 9M15 15l4 4m0-4l-4 4M7 17c4 0 4-10 10-10m0 0l-3-2m3 2l-2 3' },
  { id: 'training', label: 'Training', icon: 'M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12' },
  { id: 'staff', label: 'Staff', icon: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1M17 4l1.5 1.5L21 3' },
  { id: 'match', label: 'Spieltag', icon: 'M4 16c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3zm0 0v-2c0-2 3.6-3 8-3s8 1 8 3v2' },
  { id: 'league', label: 'Liga', icon: 'M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4M12 13v4m-4 3h8l-1-3H9z' },
];

export function App() {
  const { club, world, simulating, saveError } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [setupWorkshop, setSetupWorkshop] = useState(false);
  if (!club) {
    if (!setupWorkshop) return <UiProvider><ClubSelect onWorkshop={() => setSetupWorkshop(true)} /></UiProvider>;
    return (
      <UiProvider>
        <div className="app"><main className="content"><Workshop mode="setup" onClose={() => setSetupWorkshop(false)} /></main></div>
      </UiProvider>
    );
  }

  return (
    <UiProvider>
    <div className="app" style={{ ['--club' as string]: club.colors.primary }}>
      <header className="topbar">
        <Crest club={club} size={34} />
        <div className="topbar-title">
          <strong>{club.name}</strong>
          <span>Saison {world.competition!.year}/{String(world.competition!.year + 1).slice(2)} · {world.offseason || world.competition!.finished ? `Sommerpause · ${OFFSEASON_PHASES[world.offseason?.phase ?? 0].name}` : stageLabel(world.competition!)}</span>
        </div>
        {simulating && <span className="sim-badge" data-tip="Spieltage werden im Hintergrund berechnet. Du kannst weiter Aufstellung, Markt und Scouting bedienen – deine Eingaben bleiben erhalten.">Simuliere …</span>}
      </header>
      {saveError && <div className="alert save-alert">{saveError}</div>}
      <main className="content">
        {tab === 'overview' && <Overview go={setTab} />}
        {tab === 'roster' && <Roster />}
        {tab === 'lineup' && <Lineup />}
        {tab === 'tactics' && <TacticsView />}
        {tab === 'training' && <TrainingView />}
        {tab === 'match' && <Matchday />}
        {tab === 'league' && <League />}
        {tab === 'staff' && <StaffView />}
        {tab === 'data' && <Workshop mode="game" onClose={() => setTab('overview')} />}
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
    </UiProvider>
  );
}
