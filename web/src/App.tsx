import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AmbientBackground } from './components/AmbientBackground';
import { Header } from './components/Header';
import { FloatingDock } from './components/FloatingDock';
import { TopStoriesFeed } from './components/TopStoriesFeed';
import { CurrentAffairsFeed } from './components/CurrentAffairsFeed';
import { DiscoverFeed } from './components/DiscoverFeed';
import { EditorialDashboard } from './components/EditorialDashboard';
import { StudyCanvasModal } from './components/StudyCanvasModal';
import { SettingsModal } from './components/SettingsModal';

const MainLayout: React.FC = () => {
  const { activeTab, focusMode } = useApp();

  return (
    <AmbientBackground>
      {/* Top Header */}
      {!focusMode && activeTab !== 'editorial_dashboard' && <Header />}

      {/* Main Tab Content */}
      {/* Bottom padding on phones so the last story is not hidden behind the section bar */}
      <main className={`flex-1 w-full ${!focusMode && activeTab !== 'editorial_dashboard' ? 'pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0' : ''}`}>
        {activeTab === 'top_stories' && <TopStoriesFeed />}
        {activeTab === 'current_affairs' && <CurrentAffairsFeed />}
        {activeTab === 'discover' && <DiscoverFeed />}
        {activeTab === 'editorial_dashboard' && <EditorialDashboard />}
      </main>

      {/* Bottom Floating Navigation Dock */}
      {!focusMode && activeTab !== 'editorial_dashboard' && <FloatingDock />}

      {/* Modals & Overlays */}
      <StudyCanvasModal />
      <SettingsModal />
    </AmbientBackground>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
};

export default App;
