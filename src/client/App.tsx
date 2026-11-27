import React, { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { AppShell } from './components/layout/AppShell';
import { QuickAddVocabModal } from './components/modals/QuickAddVocabModal';
import { QuickCreateSessionModal } from './components/modals/QuickCreateSessionModal';
import { CommandPalette } from './components/modals/CommandPalette';
import { DashboardPage } from './pages/DashboardPage';
import { SessionsPage } from './pages/SessionsPage';
import { SessionWorkspacePage } from './pages/SessionWorkspacePage';
import { VocabularyPage } from './pages/VocabularyPage';
import { VocabularyDetailPage } from './pages/VocabularyDetailPage';
import { ComparisonsPage } from './pages/ComparisonsPage';
import { GrammarPage } from './pages/GrammarPage';
import { GrammarDetailPage } from './pages/GrammarDetailPage';
import { PracticePage } from './pages/PracticePage';
import { DailyReviewPage } from './pages/DailyReviewPage';
import { AnalyticsPage } from './pages/AnalyticsPage';

export function App() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.getDashboardAnalytics(),
  });

  const dueCount =
    (dashboardQuery.data?.counts.dueVocabCount ?? 0) +
    (dashboardQuery.data?.counts.dueGrammarCount ?? 0);

  return (
    <>
      <AppShell
        dueCount={dueCount}
        onOpenQuickAddVocab={() => setQuickAddOpen(true)}
        onOpenCreateSession={() => setCreateSessionOpen(true)}
        onOpenCommandPalette={() => setCommandOpen(true)}
      >
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                onOpenQuickAddVocab={() => setQuickAddOpen(true)}
                onOpenCreateSession={() => setCreateSessionOpen(true)}
              />
            }
          />
          <Route
            path="/sessions"
            element={<SessionsPage onOpenCreateSession={() => setCreateSessionOpen(true)} />}
          />
          <Route path="/sessions/:id" element={<SessionWorkspacePage />} />
          <Route
            path="/vocabulary"
            element={<VocabularyPage onOpenQuickAddVocab={() => setQuickAddOpen(true)} />}
          />
          <Route path="/vocabulary/comparisons" element={<ComparisonsPage />} />
          <Route path="/vocabulary/:id" element={<VocabularyDetailPage />} />
          <Route path="/grammar" element={<GrammarPage />} />
          <Route path="/grammar/:id" element={<GrammarDetailPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/review" element={<DailyReviewPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>

      <QuickAddVocabModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <QuickCreateSessionModal
        open={createSessionOpen}
        onClose={() => setCreateSessionOpen(false)}
      />
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onOpenQuickAddVocab={() => setQuickAddOpen(true)}
        onOpenCreateSession={() => setCreateSessionOpen(true)}
      />
    </>
  );
}

export default App;
