import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  BookMarked,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  NotebookPen,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/components/ui/Card';
import { EmptyState } from '@client/components/ui/EmptyState';
import { useToast } from '@client/components/ui/Toast';
import { api } from '@client/lib/api';
import { cn, formatDateVi } from '@client/lib/utils';
import { SESSION_SOURCE_LABELS, VOCAB_STATUS_LABELS } from '@shared/schemas';

export interface DashboardPageProps {
  onOpenQuickAddVocab?: () => void;
  onOpenCreateSession?: () => void;
}

const DAILY_TARGET_OPTIONS = [5, 10, 15, 20, 30] as const;

const MISTAKE_STATUS_DISPLAY = {
  active: { label: 'Cần lưu ý', tone: 'warning' as const },
  reviewed: { label: 'Đã xem lại', tone: 'info' as const },
  resolved: { label: 'Đã khắc phục', tone: 'success' as const },
};

function getStreakEncouragement(currentStreak: number, totalActiveDays: number): string {
  if (currentStreak === 0 && totalActiveDays === 0) {
    return 'Hôm nay là một khởi đầu nhẹ nhàng — chỉ cần ôn vài từ hoặc ghi chép 1 buổi học là bạn đã bắt đầu hành trình.';
  }
  if (currentStreak === 0 && totalActiveDays > 0) {
    return `Chào mừng bạn quay lại! Bạn đã tích lũy ${totalActiveDays} ngày học. Cứ tiếp tục theo nhịp riêng của mình, không áp lực.`;
  }
  if (currentStreak === 1) {
    return 'Bạn đã mở đầu nhịp học hôm nay rồi — giữ sự đều đặn nhẹ nhàng mỗi ngày nhé.';
  }
  return `Bạn đang giữ nhịp học ${currentStreak} ngày liên tiếp. Duy trì vừa sức để kiến thức thấm tự nhiên.`;
}

function ProgressBar({
  value,
  max,
  label,
  tone = 'accent',
}: {
  value: number;
  max: number;
  label: string;
  tone?: 'accent' | 'info' | 'success' | 'warning';
}) {
  const safeMax = Math.max(1, max);
  const percent = Math.min(100, Math.max(0, Math.round((value / safeMax) * 100)));

  const fillClass =
    tone === 'info'
      ? 'bg-[var(--info-ink)]'
      : tone === 'success'
        ? 'bg-[var(--success-ink)]'
        : tone === 'warning'
          ? 'bg-[var(--warning-ink)]'
          : 'bg-[var(--accent)]';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.min(value, safeMax)}
      className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]"
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', fillClass)}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function DashboardPage({
  onOpenQuickAddVocab,
  onOpenCreateSession,
}: DashboardPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.getDashboardAnalytics(),
  });

  const updateTargetMutation = useMutation({
    mutationFn: (dailyTargetMinutes: number) => api.updateSettings({ dailyTargetMinutes }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      success(`Đã đặt mục tiêu ${updated.dailyTargetMinutes} phút/ngày`);
    },
    onError: (err) => {
      toastError(
        'Không thể cập nhật mục tiêu học',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  if (dashboardQuery.isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-20 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-44 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] lg:col-span-2" />
          <div className="h-44 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <div
              key={k}
              className="h-28 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="mb-3 h-8 w-8 text-[var(--danger-ink)]" aria-hidden="true" />
          <h1 className="text-[18px] font-semibold text-[var(--ink-primary)]">
            Không thể tải dữ liệu tổng quan
          </h1>
          <p className="mt-1 max-w-md text-[14px] text-[var(--ink-secondary)]">
            {dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : 'Đã có sự cố khi kết nối với máy chủ.'}
          </p>
          <Button
            variant="primary"
            className="mt-4"
            leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            onClick={() => dashboardQuery.refetch()}
          >
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const {
    todayActivity,
    settings,
    streak,
    counts,
    accuracy,
    weakGrammarCategories,
    weakWords,
    recentSessions,
    recentMistakes,
  } = dashboardQuery.data;

  const todayReviewedItems =
    todayActivity.vocabReviewedCount +
    todayActivity.grammarReviewedCount +
    todayActivity.exercisesCompletedCount;
  const dailyItemTarget = Math.max(1, settings.dailyVocabTarget + settings.dailyGrammarTarget);
  const progressPercent = Math.min(100, Math.round((todayReviewedItems / dailyItemTarget) * 100));
  const totalDueCount = counts.dueVocabCount + counts.dueGrammarCount;
  const studiedMinutesToday = Math.round(todayActivity.studySeconds / 60);

  const recallGap = accuracy.recognitionEnToVi - accuracy.activeRecallViToEn;

  return (
    <div className="space-y-6">
      {/* Editorial Header & Primary Actions */}
      <header className="flex flex-col gap-4 border-b border-[var(--border-hairline)] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--accent)]">
            Không gian học cá nhân
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[var(--ink-primary)] sm:text-[28px]">
            Tổng quan học tập hôm nay
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            {totalDueCount > 0
              ? `Hôm nay có ${counts.dueVocabCount} lượt từ vựng và ${counts.dueGrammarCount} chủ điểm ngữ pháp đến hạn ôn tập.`
              : 'Lịch ôn tập hôm nay đã gọn gàng. Bạn có thể ghi chép buổi học mới hoặc luyện tập thêm.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() =>
              onOpenCreateSession ? onOpenCreateSession() : navigate('/sessions')
            }
          >
            Tạo buổi học
          </Button>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() =>
              onOpenQuickAddVocab ? onOpenQuickAddVocab() : navigate('/vocabulary')
            }
          >
            Thêm từ vựng
          </Button>
          <Link
            to="/review"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--accent)] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Bắt đầu ôn tập hôm nay
          </Link>
        </div>
      </header>

      {/* Row 1: Daily Review Target Progress + Non-Punitive Streak */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card elevated className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                Tiến độ mục tiêu hôm nay
              </CardTitle>
              <CardDescription>
                Đã hoàn thành <strong>{todayReviewedItems}</strong> / {dailyItemTarget} lượt ôn tập
                và bài luyện hôm nay ({progressPercent}%)
              </CardDescription>
            </div>
            <Badge tone={progressPercent >= 100 ? 'success' : 'accent'} size="md">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {studiedMinutesToday} / {settings.dailyTargetMinutes} phút
            </Badge>
          </CardHeader>

          <CardContent className="space-y-4">
            <ProgressBar
              value={todayReviewedItems}
              max={dailyItemTarget}
              label="Tiến độ ôn tập hôm nay"
              tone={progressPercent >= 100 ? 'success' : 'accent'}
            />

            <div className="grid gap-2.5 text-[13px] sm:grid-cols-3">
              <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2">
                <span className="text-[var(--ink-muted)]">Từ vựng đã ôn</span>
                <p className="mt-0.5 font-semibold text-[var(--ink-primary)]">
                  {todayActivity.vocabReviewedCount} / {settings.dailyVocabTarget} lượt
                </p>
              </div>
              <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2">
                <span className="text-[var(--ink-muted)]">Ngữ pháp đã ôn</span>
                <p className="mt-0.5 font-semibold text-[var(--ink-primary)]">
                  {todayActivity.grammarReviewedCount} / {settings.dailyGrammarTarget} chủ điểm
                </p>
              </div>
              <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2">
                <span className="text-[var(--ink-muted)]">Từ mới thêm hôm nay</span>
                <p className="mt-0.5 font-semibold text-[var(--ink-primary)]">
                  {todayActivity.vocabAddedCount} từ
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-3.5">
              <span className="text-[13px] font-medium text-[var(--ink-secondary)]">
                Chọn thời lượng mục tiêu mỗi ngày:
              </span>
              <div
                role="group"
                aria-label="Mục tiêu thời gian học mỗi ngày"
                className="flex flex-wrap gap-1.5"
              >
                {DAILY_TARGET_OPTIONS.map((mins) => {
                  const selected = settings.dailyTargetMinutes === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      aria-pressed={selected}
                      disabled={updateTargetMutation.isPending}
                      onClick={() => updateTargetMutation.mutate(mins)}
                      className={cn(
                        'min-h-8 rounded-[8px] border px-3 text-[13px] font-medium transition-colors cursor-pointer',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
                      )}
                    >
                      {mins} phút
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Non-Punitive Streak Card */}
        <Card elevated className="flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Flame
                  className={cn(
                    'h-4 w-4',
                    streak.currentStreak > 0 ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]',
                  )}
                  aria-hidden="true"
                />
                Nhịp độ học tập
              </CardTitle>
              <Badge tone="neutral" size="sm">
                Không phạt khi nghỉ
              </Badge>
            </div>
            <CardDescription className="pt-1 text-[13px] leading-[1.55]">
              {getStreakEncouragement(streak.currentStreak, streak.totalActiveDays)}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-3 gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-center">
              <div>
                <p className="text-[20px] font-semibold text-[var(--accent)]">
                  {streak.currentStreak}
                </p>
                <p className="text-[11px] text-[var(--ink-muted)]">Chuỗi hiện tại</p>
              </div>
              <div className="border-x border-[var(--border-hairline)]">
                <p className="text-[20px] font-semibold text-[var(--ink-primary)]">
                  {streak.longestStreak}
                </p>
                <p className="text-[11px] text-[var(--ink-muted)]">Kỷ lục ngày</p>
              </div>
              <div>
                <p className="text-[20px] font-semibold text-[var(--ink-primary)]">
                  {streak.totalActiveDays}
                </p>
                <p className="text-[11px] text-[var(--ink-muted)]">Tổng ngày học</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Row 2: 4 KPI Cards */}
      <section aria-label="Chỉ số học tập tổng quát" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[13px] font-medium">Tổng từ vựng</span>
              <BookOpen className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[28px] font-semibold tracking-tight text-[var(--ink-primary)]">
              {counts.totalVocabulary}
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
              {counts.dueVocabCount} lượt đang đến hạn ôn
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[13px] font-medium">Từ đã thành thạo</span>
              <CheckCircle2 className="h-4 w-4 text-[var(--success-ink)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[28px] font-semibold tracking-tight text-[var(--ink-primary)]">
              {counts.masteredVocabulary}
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
              {counts.totalVocabulary > 0
                ? `${Math.round((counts.masteredVocabulary / counts.totalVocabulary) * 100)}% thành thạo cả 2 chiều`
                : 'Cần vững cả Anh → Việt & Việt → Anh'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[13px] font-medium">Chủ điểm ngữ pháp đã học</span>
              <BookMarked className="h-4 w-4 text-[var(--info-ink)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[28px] font-semibold tracking-tight text-[var(--ink-primary)]">
              {counts.learnedGrammarTopics}{' '}
              <span className="text-[16px] font-normal text-[var(--ink-muted)]">
                / {counts.totalGrammarTopics}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
              {counts.dueGrammarCount} chủ điểm cần ôn lại
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[13px] font-medium">Độ chính xác luyện tập</span>
              <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[28px] font-semibold tracking-tight text-[var(--ink-primary)]">
              {accuracy.overall}%
            </p>
            <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
              {counts.activeMistakesCount} lỗi sai đang cần chú ý
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Row 3: Bidirectional Recall + Weak Areas */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Bidirectional Recall Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Ghi nhớ hai chiều (Bidirectional Recall)</CardTitle>
              <Link
                to="/analytics"
                className="text-[13px] font-medium text-[var(--accent)] hover:underline"
              >
                Chi tiết →
              </Link>
            </div>
            <CardDescription>
              So sánh khả năng nhận diện nghĩa khi đọc và khả năng tự gọi từ khi diễn đạt.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-[var(--ink-primary)]">
                  Nhận diện (Anh → Việt)
                </span>
                <span className="font-semibold text-[var(--accent)]">
                  {accuracy.recognitionEnToVi}%
                </span>
              </div>
              <ProgressBar
                value={accuracy.recognitionEnToVi}
                max={100}
                label="Độ chính xác chiều Anh sang Việt"
                tone="accent"
              />
              <p className="text-[12px] text-[var(--ink-muted)]">
                Nhìn từ tiếng Anh và nhận biết đúng nghĩa tiếng Việt trong ngữ cảnh.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-[var(--ink-primary)]">
                  Nhớ chủ động (Việt → Anh)
                </span>
                <span className="font-semibold text-[var(--info-ink)]">
                  {accuracy.activeRecallViToEn}%
                </span>
              </div>
              <ProgressBar
                value={accuracy.activeRecallViToEn}
                max={100}
                label="Độ chính xác chiều Việt sang Anh"
                tone="info"
              />
              <p className="text-[12px] text-[var(--ink-muted)]">
                Từ ý tiếng Việt nhớ lại chính xác từ tiếng Anh, chính tả và collocation.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2.5 text-[13px]">
              <span className="text-[var(--ink-secondary)]">
                {recallGap >= 15
                  ? 'Nhận diện đang vượt trội hơn nhớ chủ động — thử luyện thêm Việt → Anh nhé.'
                  : 'Hai chiều đang phát triển khá cân bằng.'}
              </span>
              <Link
                to="/practice?tab=vocab"
                className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
              >
                Luyện ngay
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Weak Areas Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Điểm cần củng cố</CardTitle>
              <Link
                to="/practice?tab=vocab&source=weak"
                className="text-[13px] font-medium text-[var(--accent)] hover:underline"
              >
                Luyện từ yếu →
              </Link>
            </div>
            <CardDescription>
              Các nhóm ngữ pháp có độ chính xác thấp và những từ vựng hay quên gần đây.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Nhóm ngữ pháp cần chú ý
              </h3>
              {weakGrammarCategories.length === 0 ? (
                <p className="rounded-[8px] border border-dashed border-[var(--border-hairline)] px-3 py-2.5 text-[13px] text-[var(--ink-muted)]">
                  Chưa có dữ liệu điểm yếu ngữ pháp — hãy làm bài tập ở mục Luyện tập.
                </p>
              ) : (
                <ul className="space-y-2">
                  {weakGrammarCategories.slice(0, 3).map((cat) => (
                    <li
                      key={cat.categoryId}
                      className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/grammar?categoryId=${cat.categoryId}`}
                          className="block truncate text-[13px] font-medium text-[var(--ink-primary)] hover:text-[var(--accent)]"
                        >
                          {cat.nameVi || cat.name}
                        </Link>
                        <p className="text-[12px] text-[var(--ink-muted)]">
                          {cat.topicCount} chủ điểm · {cat.dueCount} đến hạn · {cat.totalLapses} lần nhầm
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={cat.avgAccuracy < 60 ? 'warning' : 'neutral'} size="sm">
                          {cat.avgAccuracy}%
                        </Badge>
                        <Link
                          to={`/practice?tab=grammar&categoryId=${cat.categoryId}`}
                          className="text-[12px] font-medium text-[var(--accent)] hover:underline"
                        >
                          Luyện
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Từ vựng hay quên
              </h3>
              {weakWords.length === 0 ? (
                <p className="rounded-[8px] border border-dashed border-[var(--border-hairline)] px-3 py-2.5 text-[13px] text-[var(--ink-muted)]">
                  Chưa có từ vựng nào gặp khó khăn.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {weakWords.slice(0, 6).map((w) => (
                    <li key={w.vocabularyId}>
                      <Link
                        to={`/vocabulary/${w.vocabularyId}`}
                        className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 transition-colors hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)]/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[var(--ink-primary)]">
                            {w.word}
                          </p>
                          <p className="truncate text-[12px] text-[var(--ink-secondary)]">
                            {w.vietnameseMeaning || VOCAB_STATUS_LABELS[w.status]}
                          </p>
                        </div>
                        <Badge tone="warning" size="sm">
                          {w.lapses > 0 ? `${w.lapses} quên` : `Tin ${w.confidenceLevel}/5`}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Row 4: Recent Sessions & Recent Mistakes */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                Buổi học gần đây
              </CardTitle>
              <Link
                to="/sessions"
                className="text-[13px] font-medium text-[var(--accent)] hover:underline"
              >
                Tất cả buổi học →
              </Link>
            </div>
          </CardHeader>

          <CardContent>
            {recentSessions.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-5 w-5" />}
                title="Chưa có buổi học nào"
                description="Tạo buổi học đầu tiên để ghi lại từ vựng, ngữ pháp và ghi chú sau mỗi giờ học."
                actionLabel="Tạo buổi học mới"
                onAction={() =>
                  onOpenCreateSession ? onOpenCreateSession() : navigate('/sessions')
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {recentSessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      to={`/sessions/${session.id}`}
                      className="flex items-start justify-between gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-canvas)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-[var(--ink-primary)]">
                          {session.title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                          {formatDateVi(session.learningDate)} ·{' '}
                          {SESSION_SOURCE_LABELS[session.sourceType]} · {session.vocabCount} từ ·{' '}
                          {session.grammarCount} ngữ pháp
                        </p>
                      </div>
                      <Badge
                        tone={session.status === 'completed' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {session.status === 'completed' ? 'Đã hoàn thành' : 'Bản nháp'}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[var(--warning-ink)]" aria-hidden="true" />
                Lỗi sai gần đây
              </CardTitle>
              <Link
                to="/review#mistake-bank"
                className="text-[13px] font-medium text-[var(--accent)] hover:underline"
              >
                Luyện sửa lỗi →
              </Link>
            </div>
          </CardHeader>

          <CardContent>
            {recentMistakes.length === 0 ? (
              <EmptyState
                title="Chưa ghi nhận lỗi sai nào"
                description="Các câu viết sai hoặc lỗi nhầm lẫn trong lúc luyện tập sẽ được lưu lại tại đây để bạn theo dõi tiến bộ."
              />
            ) : (
              <ul className="space-y-2.5">
                {recentMistakes.map((mistake) => {
                  const statusMeta = MISTAKE_STATUS_DISPLAY[mistake.status];
                  return (
                    <li
                      key={mistake.id}
                      className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone="neutral" size="sm">
                          {mistake.categoryLabel}
                        </Badge>
                        <Badge tone={statusMeta.tone} size="sm">
                          {statusMeta.label}
                        </Badge>
                      </div>

                      <div className="mt-1.5 text-[13px]">
                        <span className="text-[var(--danger-ink)] line-through">
                          {mistake.originalInput}
                        </span>
                        <span className="mx-1.5 text-[var(--ink-muted)]">→</span>
                        <span className="font-medium text-[var(--success-ink)]">
                          {mistake.correctedVersion}
                        </span>
                      </div>

                      {(mistake.vocabularyId || mistake.grammarTopicId) && (
                        <div className="mt-1.5 flex flex-wrap gap-3 text-[12px]">
                          {mistake.vocabularyId && mistake.vocabularyWord ? (
                            <Link
                              to={`/vocabulary/${mistake.vocabularyId}`}
                              className="font-medium text-[var(--accent)] hover:underline"
                            >
                              Từ: {mistake.vocabularyWord} →
                            </Link>
                          ) : null}
                          {mistake.grammarTopicId && mistake.grammarTopicTitle ? (
                            <Link
                              to={`/grammar/${mistake.grammarTopicId}`}
                              className="font-medium text-[var(--accent)] hover:underline"
                            >
                              Ngữ pháp: {mistake.grammarTopicTitle} →
                            </Link>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
