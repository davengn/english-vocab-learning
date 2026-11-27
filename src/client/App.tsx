import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import type { AuthStatusDto } from '../shared/apiTypes';
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
import { LoginPage } from './pages/LoginPage';

export function App() {
  const queryClient = useQueryClient();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const authQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getAuthMe(),
    retry: false,
    staleTime: 60_000,
  });

  const isAuthenticated = authQuery.data?.authenticated === true;

  const clearClientSession = useCallback(() => {
    setQuickAddOpen(false);
    setCreateSessionOpen(false);
    setCommandOpen(false);
    queryClient.setQueryData<AuthStatusDto>(['auth', 'me'], {
      authenticated: false,
      user: null,
    });
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== 'auth',
    });
  }, [queryClient]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearClientSession();
    };
    window.addEventListener('elos:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('elos:unauthorized', handleUnauthorized);
  }, [clearClientSession]);

  const handleLoginSuccess = useCallback(
    (status: AuthStatusDto) => {
      queryClient.setQueryData(['auth', 'me'], status);
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'auth',
      });
    },
    [queryClient],
  );

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await api.logout();
    } catch {
      // Clear local session state even if network request fails
    } finally {
      clearClientSession();
      setIsLoggingOut(false);
    }
  }, [clearClientSession, isLoggingOut]);

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.getDashboardAnalytics(),
    enabled: isAuthenticated,
  });

  if (authQuery.isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--bg-canvas)] px-4 text-[var(--ink-secondary)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  const dueCount =
    (dashboardQuery.data?.counts.dueVocabCount ?? 0) +
    (dashboardQuery.data?.counts.dueGrammarCount ?? 0);

  return (
    <>
      <AppShell
        dueCount={dueCount}
        currentUser={authQuery.data?.user ?? null}
        onLogout={handleLogout}
        isLoggingOut={isLoggingOut}
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
