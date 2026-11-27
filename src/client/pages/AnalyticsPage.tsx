import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookMarked,
  BookOpen,
  Clock,
  Flame,
  Target,
} from 'lucide-react';
import type { WeakWordDto } from '@shared/apiTypes';
import type { VocabMasteryStatus } from '@shared/srs';
import { VOCAB_STATUS_LABELS } from '@shared/schemas';
import { api } from '@client/lib/api';
import { cn, formatDateVi } from '@client/lib/utils';
import { Badge, type BadgeTone } from '@client/components/ui/Badge';
import { Card, CardContent } from '@client/components/ui/Card';
import { EmptyState } from '@client/components/ui/EmptyState';
import { ResponsiveTable, type ResponsiveTableColumn } from '@client/components/ui/ResponsiveTable';

const VOCAB_STATUS_TONE: Record<VocabMasteryStatus, BadgeTone> = {
  new: 'neutral',
  learning: 'warning',
  reviewing: 'info',
  mastered: 'success',
};

function shortDayLabel(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Pure DB-computed Learning Analytics & Insights page (zero AI, zero fabricated metrics).
 */
export function AnalyticsPage() {
  const [hoveredDayIso, setHoveredDayIso] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.getDashboardAnalytics(),
  });

  const insightsQuery = useQuery({
    queryKey: ['analytics', 'insights'],
    queryFn: () => api.getInsightsAnalytics(),
  });

  const dashboard = dashboardQuery.data;
  const insights = insightsQuery.data;

  const dailySeries = insights?.dailySeries ?? [];
  const maxDailyTotal = useMemo(() => {
    let max = 1;
    for (const d of dailySeries) {
      const total = d.vocabReviewedCount + d.exercisesCompletedCount;
      if (total > max) max = total;
    }
    return max;
  }, [dailySeries]);

  const totalVocabInDist = useMemo(
    () =>
      (insights?.vocabStatusDistribution ?? []).reduce((sum, item) => sum + item.count, 0),
    [insights?.vocabStatusDistribution],
  );

  const totalMistakesInDist = useMemo(
    () =>
      (insights?.mistakeCategoryDistribution ?? []).reduce((sum, item) => sum + item.count, 0),
    [insights?.mistakeCategoryDistribution],
  );

  const activeTooltipDay = useMemo(() => {
    if (!hoveredDayIso) return null;
    return dailySeries.find((d) => d.activityDate === hoveredDayIso) ?? null;
  }, [dailySeries, hoveredDayIso]);

  const directionColumns: ReadonlyArray<
    ResponsiveTableColumn<NonNullable<typeof insights>['directionBreakdown'][number]>
  > = [
    {
      key: 'label',
      header: 'Chiều kỹ năng',
      isRowHeader: true,
      render: (row) => <span className="font-medium text-[var(--ink-primary)]">{row.label}</span>,
    },
    {
      key: 'totalAttempts',
      header: 'Tổng lượt trả lời',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.totalAttempts}</span>,
    },
    {
      key: 'correctAttempts',
      header: 'Số lượt đúng',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.correctAttempts}</span>,
    },
    {
      key: 'accuracy',
      header: 'Độ chính xác',
      align: 'right',
      render: (row) => (
        <Badge
          tone={
            row.totalAttempts === 0
              ? 'neutral'
              : row.accuracy >= 80
                ? 'success'
                : row.accuracy >= 50
                  ? 'accent'
                  : 'warning'
          }
        >
          {row.totalAttempts > 0 ? `${row.accuracy}%` : 'Chưa có dữ liệu'}
        </Badge>
      ),
    },
  ];

  const forgottenWordColumns: ReadonlyArray<ResponsiveTableColumn<WeakWordDto>> = [
    {
      key: 'word',
      header: 'Từ vựng',
      isRowHeader: true,
      render: (row) => (
        <div>
          <Link
            to={`/vocabulary/${row.vocabularyId}`}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            {row.word}
          </Link>
          {row.vietnameseMeaning && (
            <p className="text-[12px] text-[var(--ink-secondary)]">{row.vietnameseMeaning}</p>
          )}
        </div>
      ),
    },
    {
      key: 'cefr',
      header: 'CEFR',
      render: (row) => (
        <Badge tone="info">{row.cefrLevel === 'unknown' ? '—' : row.cefrLevel}</Badge>
      ),
    },
    {
      key: 'lapses',
      header: 'Số lần quên',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-semibold text-[var(--danger-ink)]">{row.lapses}</span>
      ),
    },
    {
      key: 'minEaseFactor',
      header: 'Ease thấp nhất',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-[var(--ink-primary)]">
          {row.minEaseFactor.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'confidence',
      header: 'Độ tự tin',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.confidenceLevel}/5</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <Badge tone={VOCAB_STATUS_TONE[row.status]}>{VOCAB_STATUS_LABELS[row.status]}</Badge>
      ),
    },
    {
      key: 'action',
      header: 'Chi tiết',
      align: 'right',
      render: (row) => (
        <Link
          to={`/vocabulary/${row.vocabularyId}`}
          className="text-[12px] font-medium text-[var(--accent)] hover:underline"
        >
          Mở từ →
        </Link>
      ),
    },
  ];

  if (dashboardQuery.isLoading || insightsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-[var(--bg-subtle)]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard || !insights) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-5 w-5" />}
        title="Không thể tải dữ liệu thống kê"
        description="Vui lòng kiểm tra kết nối máy chủ và thử lại."
      />
    );
  }

  const todayMinutes = Math.round(dashboard.todayActivity.studySeconds / 60);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--ink-primary)]">
          Thống kê & Phân tích học tập
        </h1>
        <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
          Toàn bộ số liệu được tổng hợp trực tiếp từ lịch sử luyện tập, SM-2 và Ngân hàng lỗi sai trong cơ sở dữ liệu.
        </p>
      </div>

      {/* Top KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[12px] font-medium">Chuỗi ngày học</span>
              <Flame className="h-4 w-4 text-[var(--warning-ink)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[24px] font-semibold text-[var(--ink-primary)]">
              {dashboard.streak.currentStreak} ngày
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
              Kỷ lục: {dashboard.streak.longestStreak} · Tổng {dashboard.streak.totalActiveDays} ngày
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[12px] font-medium">Từ vựng thành thạo (2 chiều)</span>
              <BookOpen className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[24px] font-semibold text-[var(--ink-primary)]">
              {dashboard.counts.masteredVocabulary} / {dashboard.counts.totalVocabulary}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
              Đang đến hạn ôn: {dashboard.counts.dueVocabCount} thẻ
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[12px] font-medium">Chủ điểm ngữ pháp</span>
              <BookMarked className="h-4 w-4 text-[var(--info-ink)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[24px] font-semibold text-[var(--ink-primary)]">
              {dashboard.counts.learnedGrammarTopics} / {dashboard.counts.totalGrammarTopics}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
              Đến hạn ôn: {dashboard.counts.dueGrammarCount} chủ điểm
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[var(--ink-muted)]">
              <span className="text-[12px] font-medium">Thời gian hôm nay & Chính xác</span>
              <Clock className="h-4 w-4 text-[var(--success-ink)]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-[24px] font-semibold text-[var(--ink-primary)]">
              {todayMinutes} / {dashboard.settings.dailyTargetMinutes} phút
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
              Độ chính xác tổng: {dashboard.accuracy.overall}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recognition (EN -> VI) vs Active Recall (VI -> EN) */}
      <section className="space-y-4">
        <div>
          <h2 className="text-[18px] font-semibold text-[var(--ink-primary)]">
            Nhận diện (Anh → Việt) vs Nhớ chủ động (Việt → Anh)
          </h2>
          <p className="text-[13px] text-[var(--ink-secondary)]">
            Từ vựng chỉ đạt mức “Đã thành thạo” khi cả 2 chiều nhận diện và nhớ chủ động đều vững.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[var(--ink-primary)]">
                  Nhận diện (Anh → Việt)
                </span>
                <span className="text-[20px] font-semibold text-[var(--info-ink)]">
                  {dashboard.accuracy.recognitionEnToVi}%
                </span>
              </div>
              <progress
                value={dashboard.accuracy.recognitionEnToVi}
                max={100}
                aria-label="Độ chính xác nhận diện Anh sang Việt"
                className="h-2.5 w-full accent-[var(--info-ink)]"
              />
              <p className="text-[12px] text-[var(--ink-secondary)]">
                Khả năng đọc hiểu nghĩa khi bắt gặp từ tiếng Anh.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[var(--ink-primary)]">
                  Nhớ chủ động (Việt → Anh)
                </span>
                <span className="text-[20px] font-semibold text-[var(--accent)]">
                  {dashboard.accuracy.activeRecallViToEn}%
                </span>
              </div>
              <progress
                value={dashboard.accuracy.activeRecallViToEn}
                max={100}
                aria-label="Độ chính xác nhớ chủ động Việt sang Anh"
                className="h-2.5 w-full accent-[var(--accent)]"
              />
              <p className="text-[12px] text-[var(--ink-secondary)]">
                Khả năng tự gọi đúng từ tiếng Anh khi cần nói hoặc viết.
              </p>
            </CardContent>
          </Card>
        </div>

        <ResponsiveTable
          ariaLabel="Phân tích chi tiết theo từng chiều kỹ năng"
          columns={directionColumns}
          data={insights.directionBreakdown}
          getRowKey={(row) => row.direction}
        />
      </section>

      {/* 14-Day Activity Chart */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--ink-primary)]">
              Biểu đồ hoạt động 14 ngày gần nhất
            </h2>
            <p className="text-[13px] text-[var(--ink-secondary)]">
              Di chuột hoặc chạm vào từng ngày để xem số từ ôn, bài tập đã làm và số phút học.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[12px] text-[var(--ink-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[var(--accent)]" aria-hidden="true" />
              Từ vựng đã ôn
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#0369A1]" aria-hidden="true" />
              Bài tập hoàn thành
            </span>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-5">
            {/* Active Tooltip Strip */}
            <div
              role="status"
              className="flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2 text-[13px]"
            >
              {activeTooltipDay ? (
                <>
                  <span className="font-semibold text-[var(--ink-primary)]">
                    Ngày {formatDateVi(activeTooltipDay.activityDate)}
                  </span>
                  <span className="text-[var(--ink-secondary)]">
                    Từ vựng ôn: <strong>{activeTooltipDay.vocabReviewedCount}</strong> · Bài tập:{' '}
                    <strong>{activeTooltipDay.exercisesCompletedCount}</strong> · Thời gian:{' '}
                    <strong>{Math.round(activeTooltipDay.studySeconds / 60)} phút</strong>
                  </span>
                </>
              ) : (
                <span className="text-[var(--ink-muted)]">
                  Chạm hoặc di chuột vào cột ngày bên dưới để xem chi tiết từng ngày.
                </span>
              )}
            </div>

            {/* Minimalist HTML/CSS Bar Chart */}
            <div className="grid h-48 grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5 sm:gap-2.5 pt-4">
              {dailySeries.map((day) => {
                const vocabCount = day.vocabReviewedCount;
                const exCount = day.exercisesCompletedCount;
                const total = vocabCount + exCount;
                const minutes = Math.round(day.studySeconds / 60);

                const totalHeightPct =
                  total > 0 ? Math.max(8, Math.round((total / maxDailyTotal) * 100)) : 2;
                const vocabSharePct = total > 0 ? Math.round((vocabCount / total) * 100) : 0;
                const exSharePct = total > 0 ? 100 - vocabSharePct : 0;
                const isSelected = hoveredDayIso === day.activityDate;

                const tooltipText = `${formatDateVi(day.activityDate)}: ${vocabCount} từ vựng ôn, ${exCount} bài tập, ${minutes} phút`;

                return (
                  <div
                    key={day.activityDate}
                    className="group relative flex h-full flex-col items-center justify-end gap-1.5"
                  >
                    {/* Hover CSS Tooltip */}
                    <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-[var(--border-strong)] bg-[var(--ink-primary)] px-2 py-1 text-[11px] text-white shadow-sm group-hover:block group-focus-within:block">
                      {vocabCount} từ · {exCount} BT · {minutes}p
                    </div>

                    <button
                      type="button"
                      title={tooltipText}
                      aria-label={tooltipText}
                      onMouseEnter={() => setHoveredDayIso(day.activityDate)}
                      onFocus={() => setHoveredDayIso(day.activityDate)}
                      onClick={() => setHoveredDayIso(day.activityDate)}
                      className={cn(
                        'flex w-full flex-col justify-end overflow-hidden rounded-t-[4px] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                        total === 0 ? 'bg-[var(--border-hairline)]' : 'bg-[var(--bg-subtle)]',
                        isSelected && 'ring-2 ring-[var(--accent)] ring-offset-1',
                      )}
                      style={{ height: `${totalHeightPct}%` }}
                    >
                      {exSharePct > 0 && (
                        <span
                          className="block w-full bg-[#0369A1]"
                          style={{ height: `${exSharePct}%` }}
                        />
                      )}
                      {vocabSharePct > 0 && (
                        <span
                          className="block w-full bg-[var(--accent)]"
                          style={{ height: `${vocabSharePct}%` }}
                        />
                      )}
                    </button>

                    <span className="text-[10px] tabular-nums text-[var(--ink-muted)]">
                      {shortDayLabel(day.activityDate)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Vocab Status Distribution & Mistake Category Distribution */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-[17px] font-semibold text-[var(--ink-primary)]">
              Phân bố trạng thái từ vựng
            </h2>

            {totalVocabInDist === 0 ? (
              <p className="text-[13px] text-[var(--ink-muted)]">Chưa có từ vựng nào.</p>
            ) : (
              <div className="space-y-3">
                {insights.vocabStatusDistribution.map((item) => {
                  const pct =
                    totalVocabInDist > 0 ? Math.round((item.count / totalVocabInDist) * 100) : 0;
                  return (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-medium text-[var(--ink-primary)]">{item.label}</span>
                        <span className="tabular-nums text-[var(--ink-secondary)]">
                          {item.count} từ ({pct}%)
                        </span>
                      </div>
                      <progress
                        value={item.count}
                        max={totalVocabInDist}
                        aria-label={`${item.label}: ${item.count} từ`}
                        className="h-2 w-full accent-[var(--accent)]"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[17px] font-semibold text-[var(--ink-primary)]">
                Phân loại lỗi sai hay gặp
              </h2>
              <Link
                to="/review#mistake-bank"
                className="text-[12px] font-medium text-[var(--accent)] hover:underline"
              >
                Mở Ngân hàng lỗi sai →
              </Link>
            </div>

            {totalMistakesInDist === 0 ? (
              <p className="text-[13px] text-[var(--ink-muted)]">
                Chưa có lỗi sai nào được ghi nhận.
              </p>
            ) : (
              <div className="space-y-2.5">
                {insights.mistakeCategoryDistribution.map((item) => {
                  const pct =
                    totalMistakesInDist > 0
                      ? Math.round((item.count / totalMistakesInDist) * 100)
                      : 0;
                  return (
                    <div key={item.category} className="space-y-1">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-medium text-[var(--ink-primary)]">{item.label}</span>
                        <span className="tabular-nums text-[var(--ink-secondary)]">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <progress
                        value={item.count}
                        max={totalMistakesInDist}
                        aria-label={`${item.label}: ${item.count} lỗi`}
                        className="h-2 w-full accent-[#B45309]"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Weak Grammar Categories */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--ink-primary)]">
              Chủ điểm ngữ pháp cần củng cố
            </h2>
            <p className="text-[13px] text-[var(--ink-secondary)]">
              Sắp xếp theo độ chính xác trung bình thấp và số lần quên cao.
            </p>
          </div>
          <Link
            to="/practice?tab=grammar"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline"
          >
            Luyện ngữ pháp ngay
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {insights.weakGrammarCategories.length === 0 ? (
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="Chưa có dữ liệu luyện tập ngữ pháp"
            description="Hoàn thành vài câu hỏi ngữ pháp để xem phân tích nhóm kiến thức cần củng cố."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {insights.weakGrammarCategories.map((cat) => (
              <Card key={cat.categoryId}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-semibold text-[var(--ink-primary)]">
                        {cat.nameVi || cat.name}
                      </p>
                      <p className="text-[12px] text-[var(--ink-muted)]">
                        {cat.name} · {cat.topicCount} chủ điểm
                      </p>
                    </div>
                    <Badge
                      tone={
                        cat.avgAccuracy >= 80
                          ? 'success'
                          : cat.avgAccuracy >= 60
                            ? 'accent'
                            : 'warning'
                      }
                    >
                      {cat.avgAccuracy}% đúng
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[12px] text-[var(--ink-secondary)]">
                    <span>Quên: {cat.totalLapses} lần</span>
                    <span>Đến hạn: {cat.dueCount} chủ điểm</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-2.5 text-[12px]">
                    <Link
                      to={`/grammar?categoryId=${cat.categoryId}`}
                      className="font-medium text-[var(--ink-primary)] hover:text-[var(--accent)] hover:underline"
                    >
                      Xem bài học
                    </Link>
                    <Link
                      to="/practice?tab=grammar"
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      Luyện tập →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Frequently Forgotten Words Table */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--ink-primary)]">
              Từ vựng hay quên nhất
            </h2>
            <p className="text-[13px] text-[var(--ink-secondary)]">
              Những từ có số lần quên cao, hệ số ease factor giảm thấp hoặc độ tự tin thấp.
            </p>
          </div>
          <Link
            to="/practice?tab=vocab&source=weak"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline"
          >
            Luyện nhóm từ yếu
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <ResponsiveTable
          ariaLabel="Danh sách từ vựng hay quên nhất"
          columns={forgottenWordColumns}
          data={insights.frequentlyForgottenWords}
          getRowKey={(row) => row.vocabularyId}
          emptyState={
            <EmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Chưa ghi nhận từ vựng hay quên"
              description="Khi bạn ôn tập và đánh dấu 'Quên' hoặc 'Khó', các từ cần chú ý sẽ hiện ở đây."
            />
          }
        />
      </section>
    </div>
  );
}
