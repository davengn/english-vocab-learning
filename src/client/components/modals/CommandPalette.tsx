import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookMarked, BookOpen, NotebookPen, Play, Plus, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { isImeComposing } from '../../lib/ime';
import { Dialog } from '../ui/Dialog';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenQuickAddVocab: () => void;
  onOpenCreateSession: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onOpenQuickAddVocab,
  onOpenCreateSession,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const vocabQuery = useQuery({
    queryKey: ['command-vocab', query],
    queryFn: () => api.listVocabulary({ search: query || undefined }),
    enabled: open,
  });

  const grammarQuery = useQuery({
    queryKey: ['command-grammar', query],
    queryFn: () => api.listGrammarTopics({ search: query || undefined }),
    enabled: open,
  });

  const sessionsQuery = useQuery({
    queryKey: ['command-sessions', query],
    queryFn: () => api.listSessions({ search: query || undefined }),
    enabled: open,
  });

  const actions = useMemo(
    () => [
      {
        id: 'act-review',
        label: 'Bắt đầu ôn tập hôm nay',
        icon: Play,
        run: () => navigate('/review'),
      },
      {
        id: 'act-add-vocab',
        label: 'Thêm từ vựng mới',
        icon: Plus,
        run: () => onOpenQuickAddVocab(),
      },
      {
        id: 'act-add-session',
        label: 'Tạo buổi học mới',
        icon: NotebookPen,
        run: () => onOpenCreateSession(),
      },
      {
        id: 'act-compare',
        label: 'So sánh từ dễ nhầm (Affect vs Effect...)',
        icon: BookOpen,
        run: () => navigate('/vocabulary/comparisons'),
      },
    ],
    [navigate, onOpenCreateSession, onOpenQuickAddVocab],
  );

  const vocabResults = (vocabQuery.data ?? []).slice(0, 5);
  const grammarResults = (grammarQuery.data ?? []).slice(0, 4);
  const sessionResults = (sessionsQuery.data ?? []).slice(0, 4);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} title="Tìm kiếm & Điều hướng nhanh" size="lg">
      <div className="space-y-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isImeComposing(e)) {
                e.preventDefault();
                if (vocabResults[0]) {
                  handleClose();
                  navigate(`/vocabulary/${vocabResults[0].id}`);
                } else if (grammarResults[0]) {
                  handleClose();
                  navigate(`/grammar/${grammarResults[0].id}`);
                } else if (sessionResults[0]) {
                  handleClose();
                  navigate(`/sessions/${sessionResults[0].id}`);
                }
              }
            }}
            placeholder="Tìm từ vựng, chủ điểm ngữ pháp hoặc buổi học..."
            autoFocus
            className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {!query.trim() && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Thao tác nhanh
              </p>
              <div className="space-y-1">
                {actions.map((act) => {
                  const Icon = act.icon;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => {
                        handleClose();
                        act.run();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                    >
                      <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                      <span>{act.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {vocabResults.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Từ vựng ({vocabResults.length})
              </p>
              <div className="space-y-1">
                {vocabResults.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      handleClose();
                      navigate(`/vocabulary/${v.id}`);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-[var(--ink-primary)]">{v.word}</span>
                      {v.ipa && (
                        <span className="ipa ml-2 text-xs text-[var(--ink-muted)]">{v.ipa}</span>
                      )}
                      <p className="truncate text-xs text-[var(--ink-secondary)]">
                        {v.vietnameseMeaning || 'Chưa có nghĩa tiếng Việt'}
                      </p>
                    </div>
                    <BookOpen className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {grammarResults.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Ngữ pháp ({grammarResults.length})
              </p>
              <div className="space-y-1">
                {grammarResults.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      handleClose();
                      navigate(`/grammar/${g.id}`);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ink-primary)]">
                        {g.title}
                      </p>
                      <p className="truncate text-xs text-[var(--ink-secondary)]">
                        {g.titleVi || g.categoryNameVi}
                      </p>
                    </div>
                    <BookMarked className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {sessionResults.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Buổi học ({sessionResults.length})
              </p>
              <div className="space-y-1">
                {sessionResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      handleClose();
                      navigate(`/sessions/${s.id}`);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ink-primary)]">
                        {s.title}
                      </p>
                      <p className="text-xs text-[var(--ink-muted)]">
                        {s.learningDate} · {s.vocabCount} từ · {s.grammarCount} ngữ pháp
                      </p>
                    </div>
                    <NotebookPen className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim() &&
            vocabResults.length === 0 &&
            grammarResults.length === 0 &&
            sessionResults.length === 0 && (
              <p className="py-6 text-center text-sm text-[var(--ink-muted)]">
                Không tìm thấy kết quả phù hợp với &ldquo;{query}&rdquo;.
              </p>
            )}
        </div>
      </div>
    </Dialog>
  );
}
