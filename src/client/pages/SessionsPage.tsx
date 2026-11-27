import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  Calendar,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';
import { api } from '@client/lib/api';
import { onImeSafeEnter } from '@client/lib/ime';
import { cn, formatDateVi } from '@client/lib/utils';
import type { SessionSourceType, SessionSummaryDto } from '@shared/apiTypes';
import { SESSION_SOURCES, SESSION_SOURCE_LABELS, todayIsoDate } from '@shared/schemas';

export interface SessionsPageProps {
  onOpenCreateSession?: () => void;
}

type StatusFilter = 'all' | 'draft' | 'completed';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Bản nháp' },
  { value: 'completed', label: 'Đã hoàn thành' },
];

export function SessionsPage({ onOpenCreateSession }: SessionsPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<SessionSummaryDto | null>(null);

  // Fallback inline creation dialog when parent prop is not passed
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(todayIsoDate());
  const [newSource, setNewSource] = useState<SessionSourceType>('english_class');
  const [newLearningType, setNewLearningType] = useState('Từ vựng & Ngữ pháp');
  const [newNotes, setNewNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const sessionsQuery = useQuery({
    queryKey: [
      'sessions',
      {
        search: debouncedSearch,
        status: statusFilter,
        sourceType: sourceFilter,
      },
    ],
    queryFn: () =>
      api.listSessions({
        search: debouncedSearch || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        sourceType: sourceFilter || undefined,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success('Đã xóa buổi học');
      setDeleteTarget(null);
    },
    onError: (err) => {
      toastError(
        'Không thể xóa buổi học',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSession({
        title: newTitle.trim(),
        learningDate: newDate,
        sourceType: newSource,
        learningType: newLearningType.trim() || 'Tổng hợp',
        generalNotes: newNotes,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success('Đã tạo buổi học mới');
      setCreateOpen(false);
      setNewTitle('');
      setNewNotes('');
      navigate(`/sessions/${created.id}`);
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Không thể tạo buổi học');
    },
  });

  const handleOpenCreate = () => {
    if (onOpenCreateSession) {
      onOpenCreateSession();
    } else {
      setCreateError(null);
      setNewDate(todayIsoDate());
      setCreateOpen(true);
    }
  };

  const hasActiveFilters = Boolean(searchInput.trim() || statusFilter !== 'all' || sourceFilter);
  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--border-hairline)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--ink-primary)]">
            Buổi học & Ghi chép
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            Lưu trữ từ vựng, chủ điểm ngữ pháp và ghi chú lớp học theo từng buổi học cụ thể.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={handleOpenCreate}
        >
          Tạo buổi học mới
        </Button>
      </header>

      {/* Search and Filters */}
      <search aria-label="Tìm kiếm và lọc buổi học">
        <Card>
          <CardContent className="flex flex-col gap-4 pt-5">
            <div className="grid gap-3 md:grid-cols-[1fr_240px]">
              <Input
                label="Tìm buổi học"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={onImeSafeEnter(() => setDebouncedSearch(searchInput.trim()))}
                placeholder="Tìm theo tên buổi học, loại hình học hoặc ghi chú..."
                leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              />
              <Select
                label="Nguồn học"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                options={[
                  { value: '', label: 'Tất cả nguồn học' },
                  ...SESSION_SOURCES.map((src) => ({
                    value: src,
                    label: SESSION_SOURCE_LABELS[src],
                  })),
                ]}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                role="group"
                aria-label="Lọc theo trạng thái buổi học"
                className="flex flex-wrap items-center gap-2"
              >
                {STATUS_OPTIONS.map((opt) => {
                  const active = statusFilter === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(opt.value)}
                      className={cn(
                        'min-h-8 rounded-[8px] border px-3 text-[13px] font-medium transition-colors cursor-pointer',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                    setStatusFilter('all');
                    setSourceFilter('');
                  }}
                >
                  Xóa bộ lọc
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </search>

      {/* Sessions List */}
      {sessionsQuery.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
            />
          ))}
        </div>
      ) : sessionsQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <AlertCircle className="mb-2 h-7 w-7 text-[var(--danger-ink)]" aria-hidden="true" />
            <p className="text-[14px] font-medium text-[var(--ink-primary)]">
              Không thể tải danh sách buổi học
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => sessionsQuery.refetch()}
            >
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<NotebookPen className="h-5 w-5" />}
          title={
            hasActiveFilters
              ? 'Không tìm thấy buổi học phù hợp'
              : 'Bạn chưa tạo buổi học nào'
          }
          description={
            hasActiveFilters
              ? 'Thử đổi từ khóa tìm kiếm hoặc xóa bộ lọc trạng thái / nguồn học.'
              : 'Mỗi buổi học giúp bạn gom nhanh từ vựng mới, công thức ngữ pháp và ghi chú lớp học vào một nơi.'
          }
          actionLabel={hasActiveFilters ? undefined : '+ Tạo buổi học mới'}
          onAction={hasActiveFilters ? undefined : handleOpenCreate}
        />
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.id}>
              <Card className="transition-colors hover:border-[var(--border-strong)]">
                <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={session.status === 'completed' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {session.status === 'completed' ? 'Đã hoàn thành' : 'Bản nháp'}
                      </Badge>
                      <Badge tone="neutral" size="sm">
                        {SESSION_SOURCE_LABELS[session.sourceType]}
                      </Badge>
                      {session.learningType ? (
                        <Badge tone="accent" size="sm">
                          {session.learningType}
                        </Badge>
                      ) : null}
                    </div>

                    <h2 className="text-[17px] font-semibold leading-[1.35] text-[var(--ink-primary)]">
                      <Link
                        to={`/sessions/${session.id}`}
                        className="hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                      >
                        {session.title}
                      </Link>
                    </h2>

                    {session.generalNotes ? (
                      <p className="line-clamp-2 text-[13px] text-[var(--ink-secondary)]">
                        {session.generalNotes}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-4 pt-1 text-[12.5px] text-[var(--ink-muted)]">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDateVi(session.learningDate)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        {session.vocabCount} từ vựng
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
                        {session.grammarCount} ngữ pháp
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 sm:self-center">
                    <Link
                      to={`/sessions/${session.id}`}
                      className="inline-flex h-8 items-center rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-[13px] font-medium text-[var(--ink-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      Mở buổi học
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Xóa buổi học ${session.title}`}
                      onClick={() => setDeleteTarget(session)}
                      className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Xác nhận xóa buổi học"
        description="Hành động này chỉ xóa ghi chép buổi học; các từ vựng và chủ điểm ngữ pháp đã lưu vẫn được giữ nguyên trong thư viện."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              autoFocus
              onClick={() => setDeleteTarget(null)}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              Xóa buổi học
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--ink-primary)]">
          Bạn có chắc muốn xóa buổi học{' '}
          <strong>&ldquo;{deleteTarget?.title}&rdquo;</strong>?
        </p>
      </Dialog>

      {/* Fallback Create Session Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) setCreateOpen(false);
        }}
        title="Tạo buổi học mới"
        description="Ghi nhận toàn bộ từ vựng, chủ điểm ngữ pháp và ghi chú sau giờ học."
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTitle.trim()) {
              setCreateError('Vui lòng nhập tiêu đề buổi học.');
              return;
            }
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          {createError ? (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger-ink)]"
            >
              {createError}
            </div>
          ) : null}

          <Input
            label="Tiêu đề buổi học"
            required
            autoFocus
            value={newTitle}
            onChange={(e) => {
              setNewTitle(e.target.value);
              if (createError) setCreateError(null);
            }}
            placeholder="Ví dụ: Buổi 12 — IELTS Reading & Mệnh đề quan hệ"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Ngày học"
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <Select
              label="Nguồn học"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value as SessionSourceType)}
              options={SESSION_SOURCES.map((src) => ({
                value: src,
                label: SESSION_SOURCE_LABELS[src],
              }))}
            />
          </div>

          <Input
            label="Loại hình học"
            value={newLearningType}
            onChange={(e) => setNewLearningType(e.target.value)}
            placeholder="Ví dụ: IELTS Writing, Giao tiếp, Nghe Podcast..."
          />

          <Textarea
            label="Ghi chú ban đầu (tùy chọn)"
            rows={3}
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Tóm tắt trọng tâm bài học hôm nay..."
          />

          <div className="flex justify-end gap-2 border-t border-[var(--border-hairline)] pt-4">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" loading={createMutation.isPending}>
              Mở không gian buổi học
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
