import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  Dumbbell,
  Edit3,
  HeartHandshake,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  GeneratedVocabQuizItemDto,
  MistakeCategory,
  MistakeDto,
  MistakeStatus,
  PracticeQuestionDto,
  VocabPracticeMode,
} from '@shared/apiTypes';
import {
  MISTAKE_CATEGORIES,
  MISTAKE_CATEGORY_LABELS,
  SKILL_DIRECTION_LABELS,
  VOCAB_PRACTICE_MODE_LABELS,
} from '@shared/schemas';
import { api } from '@client/lib/api';
import { cn, formatDateVi, formatRelativeDueVi } from '@client/lib/utils';
import { GrammarPracticeRunner } from '@client/components/practice/GrammarPracticeRunner';
import { VocabPracticeRunner } from '@client/components/practice/VocabPracticeRunner';
import { Badge, type BadgeTone } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';

const PRESET_MINUTES = [5, 10, 15, 20] as const;

const MISTAKE_STATUS_LABELS: Record<MistakeStatus, string> = {
  active: 'Cần ôn tập',
  reviewed: 'Đã ôn lại',
  resolved: 'Đã khắc phục',
};

const MISTAKE_STATUS_TONE: Record<MistakeStatus, BadgeTone> = {
  active: 'warning',
  reviewed: 'info',
  resolved: 'success',
};

/**
 * Unified 5-Step Daily Review Hub + Personal Mistake Bank with adaptive time targets
 * and 1-click correction practice generation.
 */
export function DailyReviewPage() {
  const queryClient = useQueryClient();
  const { success, warning, error: showError } = useToast();

  // Active Practice Runners
  const [activeVocabSession, setActiveVocabSession] = useState<{
    items: GeneratedVocabQuizItemDto[];
    mode: VocabPracticeMode;
    title: string;
  } | null>(null);

  const [activeGrammarSession, setActiveGrammarSession] = useState<{
    questions: PracticeQuestionDto[];
    title: string;
    domain: 'daily_review' | 'mistake_review';
  } | null>(null);

  // Target Minutes UI State
  const [customMinutesMode, setCustomMinutesMode] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState('25');

  // Quick Vocab Review Mode for Step 1 & Step 2
  const [dueVocabMode, setDueVocabMode] = useState<VocabPracticeMode>('flashcard');
  const [isStartingVocab, setIsStartingVocab] = useState<'due' | 'difficult' | null>(null);
  const [isCreatingMistakeSet, setIsCreatingMistakeSet] = useState(false);

  // Mistake Bank Filters
  const [mistakeSearch, setMistakeSearch] = useState('');
  const [mistakeCategoryFilter, setMistakeCategoryFilter] = useState<string>('');
  const [mistakeStatusFilter, setMistakeStatusFilter] = useState<string>('');

  // Mistake Create / Edit Modal
  const [mistakeModalOpen, setMistakeModalOpen] = useState(false);
  const [editingMistake, setEditingMistake] = useState<MistakeDto | null>(null);
  const [mistakeToDelete, setMistakeToDelete] = useState<MistakeDto | null>(null);

  // Form Fields
  const [formCategory, setFormCategory] = useState<MistakeCategory>('tense');
  const [formOriginal, setFormOriginal] = useState('');
  const [formCorrected, setFormCorrected] = useState('');
  const [formExplanation, setFormExplanation] = useState('');
  const [formExample, setFormExample] = useState('');
  const [formSourceContext, setFormSourceContext] = useState('');
  const [formVocabId, setFormVocabId] = useState('');
  const [formGrammarTopicId, setFormGrammarTopicId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const dailyReviewQuery = useQuery({
    queryKey: ['daily-review'],
    queryFn: () => api.getDailyReview(),
  });

  const mistakesQuery = useQuery({
    queryKey: ['mistakes', mistakeCategoryFilter, mistakeStatusFilter, mistakeSearch.trim()],
    queryFn: () =>
      api.listMistakes({
        category: mistakeCategoryFilter || undefined,
        status: mistakeStatusFilter || undefined,
        search: mistakeSearch.trim() || undefined,
      }),
  });

  const grammarTopicsQuery = useQuery({
    queryKey: ['grammar-topics', 'mistake-picker'],
    queryFn: () => api.listGrammarTopics(),
    enabled: mistakeModalOpen,
  });

  const vocabPickerQuery = useQuery({
    queryKey: ['vocabulary', 'mistake-picker'],
    queryFn: () => api.listVocabulary({ sort: 'alpha' }),
    enabled: mistakeModalOpen,
  });

  const settings = settingsQuery.data;
  const review = dailyReviewQuery.data;
  const mistakes = mistakesQuery.data ?? [];

  useEffect(() => {
    if (settings) {
      const isPreset = (PRESET_MINUTES as readonly number[]).includes(settings.dailyTargetMinutes);
      setCustomMinutesMode(!isPreset);
      setCustomMinutesInput(String(settings.dailyTargetMinutes));
    }
  }, [settings]);

  const updateTargetMutation = useMutation({
    mutationFn: (dailyTargetMinutes: number) =>
      api.updateSettings({ dailyTargetMinutes }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success(`Đã cập nhật mục tiêu mỗi ngày: ${updated.dailyTargetMinutes} phút`);
    },
    onError: (err) => {
      showError('Không thể cập nhật mục tiêu thời gian', err instanceof Error ? err.message : undefined);
    },
  });

  const saveMistakeMutation = useMutation({
    mutationFn: () => {
      const payload = {
        category: formCategory,
        vocabularyId: formVocabId || null,
        grammarTopicId: formGrammarTopicId || null,
        originalInput: formOriginal.trim(),
        correctedVersion: formCorrected.trim(),
        explanationVi: formExplanation.trim(),
        correctedExample: formExample.trim(),
        sourceContext: formSourceContext.trim(),
      };
      if (editingMistake) {
        return api.updateMistake(editingMistake.id, payload);
      }
      return api.createMistake(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mistakes'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success(editingMistake ? 'Đã cập nhật lỗi sai' : 'Đã ghi nhận lỗi sai mới');
      setMistakeModalOpen(false);
      setEditingMistake(null);
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu lỗi sai.');
    },
  });

  const updateMistakeStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MistakeStatus }) =>
      api.updateMistake(id, { status }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['mistakes'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success(`Đã chuyển trạng thái sang "${MISTAKE_STATUS_LABELS[vars.status]}"`);
    },
    onError: (err) => {
      showError('Không thể cập nhật trạng thái', err instanceof Error ? err.message : undefined);
    },
  });

  const deleteMistakeMutation = useMutation({
    mutationFn: (id: string) => api.deleteMistake(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mistakes'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success('Đã xóa lỗi sai');
      setMistakeToDelete(null);
    },
    onError: (err) => {
      showError('Không thể xóa lỗi sai', err instanceof Error ? err.message : undefined);
    },
  });

  const openCreateMistakeModal = () => {
    setEditingMistake(null);
    setFormCategory((mistakeCategoryFilter as MistakeCategory) || 'tense');
    setFormOriginal('');
    setFormCorrected('');
    setFormExplanation('');
    setFormExample('');
    setFormSourceContext('');
    setFormVocabId('');
    setFormGrammarTopicId('');
    setFormError(null);
    setMistakeModalOpen(true);
  };

  const openEditMistakeModal = (m: MistakeDto) => {
    setEditingMistake(m);
    setFormCategory(m.category);
    setFormOriginal(m.originalInput);
    setFormCorrected(m.correctedVersion);
    setFormExplanation(m.explanationVi);
    setFormExample(m.correctedExample);
    setFormSourceContext(m.sourceContext);
    setFormVocabId(m.vocabularyId ?? '');
    setFormGrammarTopicId(m.grammarTopicId ?? '');
    setFormError(null);
    setMistakeModalOpen(true);
  };

  const handleSaveMistakeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formOriginal.trim() || !formCorrected.trim()) {
      setFormError('Vui lòng nhập đầy đủ phần bị sai và cách sửa đúng.');
      return;
    }
    setFormError(null);
    saveMistakeMutation.mutate();
  };

  const handleStartVocabReview = async (kind: 'due' | 'difficult') => {
    if (!review) return;
    const rawList = kind === 'due' ? review.dueVocabulary : review.difficultVocabulary;
    const uniqueIds = Array.from(new Set(rawList.map((item) => item.vocabularyId)));
    if (uniqueIds.length === 0) {
      warning('Hiện không có từ nào trong danh sách này.');
      return;
    }

    const mode: VocabPracticeMode = kind === 'due' ? dueVocabMode : 'vi_to_en';
    setIsStartingVocab(kind);
    try {
      const items = await api.generateVocabQuiz({
        mode,
        vocabularyIds: uniqueIds,
        limit: uniqueIds.length,
      });
      if (items.length === 0) {
        warning('Không tạo được bài ôn từ vựng.');
        return;
      }
      setActiveVocabSession({
        items,
        mode,
        title:
          kind === 'due'
            ? `Ôn từ vựng đến hạn (${VOCAB_PRACTICE_MODE_LABELS[mode]})`
            : 'Luyện từ vựng khó / hay quên',
      });
    } catch (err) {
      showError('Không thể bắt đầu phiên ôn tập', err instanceof Error ? err.message : undefined);
    } finally {
      setIsStartingVocab(null);
    }
  };

  const handleCreateAndRunMistakeSet = async () => {
    setIsCreatingMistakeSet(true);
    try {
      const set = await api.createMistakePracticeSet({
        category: mistakeCategoryFilter
          ? (mistakeCategoryFilter as MistakeCategory)
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['practice-sets'] });
      const questions = set.questions ?? [];
      if (questions.length === 0) {
        warning('Chưa có câu hỏi nào được tạo từ Ngân hàng lỗi sai.');
        return;
      }
      setActiveGrammarSession({
        questions,
        title: set.title,
        domain: 'mistake_review',
      });
    } catch (err) {
      showError(
        'Không thể tạo bộ luyện tập từ lỗi sai',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setIsCreatingMistakeSet(false);
    }
  };

  const uniqueDueVocabPreview = useMemo(() => {
    if (!review) return [];
    const seen = new Set<string>();
    return review.dueVocabulary.filter((item) => {
      if (seen.has(item.vocabularyId)) return false;
      seen.add(item.vocabularyId);
      return true;
    });
  }, [review]);

  // Active Runners
  if (activeVocabSession) {
    return (
      <VocabPracticeRunner
        items={activeVocabSession.items}
        mode={activeVocabSession.mode}
        title={activeVocabSession.title}
        onFinish={() => setActiveVocabSession(null)}
      />
    );
  }

  if (activeGrammarSession) {
    return (
      <GrammarPracticeRunner
        questions={activeGrammarSession.questions}
        title={activeGrammarSession.title}
        domain={activeGrammarSession.domain}
        onFinish={() => setActiveGrammarSession(null)}
      />
    );
  }

  const currentTargetMinutes = settings?.dailyTargetMinutes ?? review?.targetMinutes ?? 15;

  return (
    <div className="space-y-8">
      {/* Header + Daily Target Minutes */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--ink-primary)]">
            Ôn tập hôm nay & Ngân hàng lỗi sai
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            Quy trình 5 bước vừa sức mỗi ngày theo thuật toán SM-2 và danh sách lỗi hay mắc của riêng bạn.
          </p>
        </div>

        <div className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-secondary)]">
            <Clock className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            Mục tiêu thời gian hôm nay
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_MINUTES.map((mins) => {
              const active = !customMinutesMode && currentTargetMinutes === mins;
              return (
                <button
                  key={mins}
                  type="button"
                  disabled={updateTargetMutation.isPending}
                  onClick={() => {
                    setCustomMinutesMode(false);
                    updateTargetMutation.mutate(mins);
                  }}
                  className={cn(
                    'rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer',
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-primary)] hover:border-[var(--border-strong)]',
                  )}
                >
                  {mins} phút
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomMinutesMode((v) => !v)}
              className={cn(
                'rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer',
                customMinutesMode
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-primary)] hover:border-[var(--border-strong)]',
              )}
            >
              Tùy chỉnh
            </button>
          </div>

          {customMinutesMode && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = Number(customMinutesInput);
                if (Number.isFinite(parsed) && parsed >= 5 && parsed <= 240) {
                  updateTargetMutation.mutate(Math.round(parsed));
                }
              }}
              className="mt-2 flex items-center gap-2"
            >
              <Input
                type="number"
                min={5}
                max={240}
                aria-label="Số phút tùy chỉnh"
                wrapperClassName="w-24"
                value={customMinutesInput}
                onChange={(e) => setCustomMinutesInput(e.target.value)}
              />
              <Button type="submit" size="sm" variant="primary" loading={updateTargetMutation.isPending}>
                Lưu
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* Gentle Break-Recovery Overload Banner */}
      {review?.isOverloaded && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3.5 text-[var(--ink-primary)]"
        >
          <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div className="space-y-1 text-[13px] leading-[1.55]">
            <p className="font-semibold text-[var(--accent)]">
              Nhịp học nhẹ nhàng sau ngày bận rộn
            </p>
            <p className="text-[var(--ink-secondary)]">
              Hiện có <strong>{review.totalDueVocabCount}</strong> mục từ vựng đang đến hạn, nhưng bạn không cần ôn hết trong một lần. Hệ thống đã lọc sẵn{' '}
              <strong>{review.recommendedVocabCount}</strong> từ ưu tiên nhất vừa với mục tiêu{' '}
              <strong>{review.targetMinutes} phút</strong> hôm nay. Làm xong chừng này đã là rất tốt rồi!
            </p>
          </div>
        </div>
      )}

      {/* 5-Step Daily Review Workflow */}
      <section aria-label="Quy trình ôn tập 5 bước" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-[var(--ink-primary)]">
            Lộ trình ôn tập 5 bước hôm nay
          </h2>
          {review && (
            <span className="text-[13px] text-[var(--ink-secondary)]">
              Ngân sách: ~{review.targetMinutes} phút
            </span>
          )}
        </div>

        {dailyReviewQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
              />
            ))}
          </div>
        ) : review ? (
          <div className="space-y-4">
            {/* Step 1: Due Vocabulary */}
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="accent">Bước 1</Badge>
                      <h3 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                        Ôn từ vựng đến hạn
                      </h3>
                      <Badge tone={review.dueVocabulary.length > 0 ? 'warning' : 'success'}>
                        {review.dueVocabulary.length} thẻ đến hạn
                      </Badge>
                    </div>
                    <p className="text-[13px] text-[var(--ink-secondary)]">
                      Ưu tiên các từ quá hạn, hay quên và từ dễ nhầm lẫn ở cả 2 chiều Anh ↔ Việt.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      aria-label="Chế độ ôn từ đến hạn"
                      value={dueVocabMode}
                      onChange={(e) => setDueVocabMode(e.target.value as VocabPracticeMode)}
                      wrapperClassName="w-44"
                      options={[
                        { value: 'flashcard', label: 'Flashcard' },
                        { value: 'en_to_vi', label: 'Anh → Việt' },
                        { value: 'vi_to_en', label: 'Việt → Anh' },
                        { value: 'fill_in_blank', label: 'Điền vào chỗ trống' },
                        { value: 'spelling', label: 'Luyện chính tả' },
                      ]}
                    />
                    <Button
                      variant="primary"
                      disabled={review.dueVocabulary.length === 0}
                      loading={isStartingVocab === 'due'}
                      leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
                      onClick={() => void handleStartVocabReview('due')}
                    >
                      Ôn ngay ({uniqueDueVocabPreview.length} từ)
                    </Button>
                  </div>
                </div>

                {uniqueDueVocabPreview.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {uniqueDueVocabPreview.slice(0, 8).map((item) => (
                      <Link
                        key={item.reviewStateId}
                        to={`/vocabulary/${item.vocabularyId}`}
                        className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-[13px] hover:border-[var(--accent)]"
                      >
                        <span className="font-semibold text-[var(--ink-primary)]">{item.word}</span>
                        <span className="text-[12px] text-[var(--ink-muted)]">
                          {SKILL_DIRECTION_LABELS[item.skillDirection].split(' ')[0]} ·{' '}
                          {formatRelativeDueVi(item.nextReviewAt)}
                        </span>
                      </Link>
                    ))}
                    {uniqueDueVocabPreview.length > 8 && (
                      <span className="inline-flex items-center px-2 text-[12px] text-[var(--ink-muted)]">
                        +{uniqueDueVocabPreview.length - 8} từ khác
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--success-ink)]">
                    Bạn đã hoàn thành toàn bộ từ vựng đến hạn hôm nay!
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Difficult Vocabulary */}
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">Bước 2</Badge>
                      <h3 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                        Từ vựng khó / hay quên
                      </h3>
                      <Badge tone={review.difficultVocabulary.length > 0 ? 'danger' : 'success'}>
                        {review.difficultVocabulary.length} từ
                      </Badge>
                    </div>
                    <p className="text-[13px] text-[var(--ink-secondary)]">
                      Những từ có số lần quên cao, ease factor thấp hoặc độ tự tin dưới mức trung bình.
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    disabled={review.difficultVocabulary.length === 0}
                    loading={isStartingVocab === 'difficult'}
                    leftIcon={<Dumbbell className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => void handleStartVocabReview('difficult')}
                  >
                    Luyện từ khó ({review.difficultVocabulary.length})
                  </Button>
                </div>

                {review.difficultVocabulary.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {review.difficultVocabulary.slice(0, 6).map((item) => (
                      <Link
                        key={item.vocabularyId}
                        to={`/vocabulary/${item.vocabularyId}`}
                        className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 hover:border-[var(--border-strong)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--ink-primary)]">
                            {item.word}
                          </span>
                          <span className="text-[11px] font-medium text-[var(--danger-ink)]">
                            Quên {item.lapses} lần
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-[var(--ink-secondary)]">
                          {item.vietnameseMeaning || item.englishDefinition}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--ink-muted)]">
                    Hiện chưa có từ nào bị đánh dấu khó hoặc hay quên.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Step 3: Due Grammar Topics */}
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">Bước 3</Badge>
                      <h3 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                        Ôn lại ngữ pháp đến hạn
                      </h3>
                      <Badge tone={review.dueGrammar.length > 0 ? 'warning' : 'success'}>
                        {review.dueGrammar.length} chủ điểm
                      </Badge>
                    </div>
                    <p className="text-[13px] text-[var(--ink-secondary)]">
                      Đọc lướt lại công thức, dấu hiệu nhận biết và ví dụ cốt lõi để giữ chắc nền tảng.
                    </p>
                  </div>
                </div>

                {review.dueGrammar.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {review.dueGrammar.map((g) => (
                      <div
                        key={g.reviewStateId}
                        className="flex flex-col justify-between gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge tone="neutral">{g.categoryNameVi || g.categoryName}</Badge>
                            <span className="text-[12px] text-[var(--ink-muted)]">
                              Độ chính xác: {Math.round(g.accuracyRate * 100)}%
                            </span>
                          </div>
                          <div>
                            <p className="text-[15px] font-semibold text-[var(--ink-primary)]">
                              {g.title}
                            </p>
                            {g.titleVi && (
                              <p className="text-[13px] text-[var(--ink-secondary)]">{g.titleVi}</p>
                            )}
                          </div>
                          {g.formula && (
                            <pre className="formula overflow-x-auto rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-2 text-[12px] text-[var(--ink-primary)] whitespace-pre-wrap">
                              {g.formula}
                            </pre>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Link
                            to={`/grammar/${g.topicId}`}
                            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
                            Mở nhanh bài học
                          </Link>
                          <Link
                            to={`/practice?tab=grammar&topicId=${g.topicId}`}
                            className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--accent-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[#CCFBF1]"
                          >
                            Luyện chủ điểm →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--success-ink)]">
                    Không có chủ điểm ngữ pháp nào quá hạn hôm nay.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Step 4 & Step 5 side-by-side */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">Bước 4</Badge>
                      <h3 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                        Bài tập ngữ pháp đề xuất
                      </h3>
                    </div>
                    <p className="text-[13px] text-[var(--ink-secondary)]">
                      Có{' '}
                      <strong className="text-[var(--ink-primary)]">
                        {review.recommendedGrammarExercises.length}
                      </strong>{' '}
                      câu hỏi được chọn từ các chủ điểm đến hạn hoặc có độ chính xác dưới 75%.
                    </p>
                  </div>

                  <div className="pt-2">
                    <Button
                      variant="primary"
                      disabled={review.recommendedGrammarExercises.length === 0}
                      leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
                      onClick={() =>
                        setActiveGrammarSession({
                          questions: review.recommendedGrammarExercises,
                          title: 'Bài tập ngữ pháp đề xuất hôm nay',
                          domain: 'daily_review',
                        })
                      }
                    >
                      Làm bài tập ({review.recommendedGrammarExercises.length} câu)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">Bước 5</Badge>
                      <h3 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                        Ôn Ngân hàng lỗi sai
                      </h3>
                      <Badge tone={review.activeMistakes.length > 0 ? 'warning' : 'success'}>
                        {review.activeMistakes.length} lỗi cần ôn
                      </Badge>
                    </div>
                    <p className="text-[13px] text-[var(--ink-secondary)]">
                      Biến các lỗi bạn từng mắc thành bài tập sửa câu chủ động để tránh lặp lại cùng một lỗi.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button
                      variant="primary"
                      disabled={review.activeMistakes.length === 0}
                      loading={isCreatingMistakeSet}
                      leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                      onClick={() => void handleCreateAndRunMistakeSet()}
                    >
                      Luyện sửa lỗi ngay
                    </Button>
                    <a
                      href="#mistake-bank"
                      className="inline-flex h-9 items-center rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-[13px] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                    >
                      Xem danh sách lỗi ↓
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </section>

      {/* Personal Mistake Bank Section */}
      <section id="mistake-bank" className="space-y-4 border-t border-[var(--border-hairline)] pt-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-semibold text-[var(--ink-primary)]">
              Ngân hàng lỗi sai cá nhân
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--ink-secondary)]">
              Phân loại 9 nhóm lỗi tiếng Anh hay gặp của người Việt, ghi chú cách sửa và tạo bài tập sửa lỗi chỉ với 1 chạm.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={openCreateMistakeModal}
            >
              Ghi nhận lỗi sai mới
            </Button>
            <Button
              variant="primary"
              loading={isCreatingMistakeSet}
              disabled={mistakes.filter((m) => m.status !== 'resolved').length === 0}
              leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              onClick={() => void handleCreateAndRunMistakeSet()}
            >
              Tạo bộ luyện tập từ lỗi sai
            </Button>
          </div>
        </div>

        {/* Mistake Filters */}
        <search>
          <div className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 sm:grid-cols-[minmax(0,1fr)_240px_190px]">
            <Input
              type="search"
              aria-label="Tìm kiếm lỗi sai"
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              value={mistakeSearch}
              onChange={(e) => setMistakeSearch(e.target.value)}
              placeholder="Tìm câu sai, cách sửa đúng, giải thích..."
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />

            <Select
              aria-label="Lọc theo nhóm lỗi"
              value={mistakeCategoryFilter}
              onChange={(e) => setMistakeCategoryFilter(e.target.value)}
              placeholder="Tất cả 9 nhóm lỗi"
              options={MISTAKE_CATEGORIES.map((cat) => ({
                value: cat,
                label: MISTAKE_CATEGORY_LABELS[cat],
              }))}
            />

            <Select
              aria-label="Lọc theo trạng thái lỗi"
              value={mistakeStatusFilter}
              onChange={(e) => setMistakeStatusFilter(e.target.value)}
              placeholder="Tất cả trạng thái"
              options={[
                { value: 'active', label: MISTAKE_STATUS_LABELS.active },
                { value: 'reviewed', label: MISTAKE_STATUS_LABELS.reviewed },
                { value: 'resolved', label: MISTAKE_STATUS_LABELS.resolved },
              ]}
            />
          </div>
        </search>

        {/* Mistake Cards */}
        {mistakesQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
              />
            ))}
          </div>
        ) : mistakes.length === 0 ? (
          <EmptyState
            icon={<AlertCircle className="h-5 w-5" />}
            title="Chưa có lỗi sai nào phù hợp"
            description="Khi làm bài tập sai hoặc tự phát hiện lỗi trong lúc viết/nói, hãy lưu vào đây để luyện sửa lại."
            actionLabel="Ghi nhận lỗi sai mới"
            onAction={openCreateMistakeModal}
          />
        ) : (
          <div className="space-y-3">
            {mistakes.map((m) => (
              <Card key={m.id}>
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{m.categoryLabel}</Badge>
                      <Badge tone={MISTAKE_STATUS_TONE[m.status]}>
                        {MISTAKE_STATUS_LABELS[m.status]}
                      </Badge>
                      {m.vocabularyWord && m.vocabularyId && (
                        <Link
                          to={`/vocabulary/${m.vocabularyId}`}
                          className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-primary)] hover:border-[var(--accent)]"
                        >
                          <BookOpen className="h-3 w-3" aria-hidden="true" />
                          {m.vocabularyWord}
                        </Link>
                      )}
                      {m.grammarTopicTitle && m.grammarTopicId && (
                        <Link
                          to={`/grammar/${m.grammarTopicId}`}
                          className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:underline"
                        >
                          <BookMarked className="h-3 w-3" aria-hidden="true" />
                          {m.grammarTopicTitle}
                        </Link>
                      )}
                    </div>

                    <span className="text-[12px] text-[var(--ink-muted)]">
                      Đã ôn {m.reviewCount} lần · {formatDateVi(m.updatedAt)}
                    </span>
                  </div>

                  <div className="grid gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--danger-ink)]">
                        Câu / Cách dùng sai
                      </p>
                      <p className="mt-1 text-[14px] text-[var(--danger-ink)] line-through">
                        {m.originalInput}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--success-ink)]">
                        Cách sửa đúng
                      </p>
                      <p className="mt-1 text-[14px] font-medium text-[var(--success-ink)]">
                        {m.correctedVersion}
                      </p>
                    </div>
                  </div>

                  {(m.explanationVi || m.correctedExample || m.sourceContext) && (
                    <div className="space-y-1 text-[13px] text-[var(--ink-secondary)]">
                      {m.explanationVi && (
                        <p>
                          <strong className="text-[var(--ink-primary)]">Giải thích:</strong>{' '}
                          {m.explanationVi}
                        </p>
                      )}
                      {m.correctedExample && (
                        <p>
                          <strong className="text-[var(--ink-primary)]">Ví dụ chuẩn:</strong>{' '}
                          {m.correctedExample}
                        </p>
                      )}
                      {m.sourceContext && (
                        <p className="text-[12px] text-[var(--ink-muted)]">
                          Ngữ cảnh: {m.sourceContext}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.status !== 'reviewed' && (
                        <Button
                          size="sm"
                          variant="subtle"
                          leftIcon={<CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />}
                          onClick={() =>
                            updateMistakeStatusMutation.mutate({ id: m.id, status: 'reviewed' })
                          }
                        >
                          Đã ôn lại
                        </Button>
                      )}
                      {m.status !== 'resolved' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<CheckCircle2 className="h-3.5 w-3.5 text-[var(--success-ink)]" aria-hidden="true" />}
                          onClick={() =>
                            updateMistakeStatusMutation.mutate({ id: m.id, status: 'resolved' })
                          }
                        >
                          Đã khắc phục
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                          onClick={() =>
                            updateMistakeStatusMutation.mutate({ id: m.id, status: 'active' })
                          }
                        >
                          Mở lại để ôn
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={() => openEditMistakeModal(m)}
                      >
                        Sửa ghi chú
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Xóa lỗi sai"
                        onClick={() => setMistakeToDelete(m)}
                      >
                        <Trash2 className="h-4 w-4 text-[var(--danger-ink)]" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Create / Edit Mistake Modal */}
      <Dialog
        open={mistakeModalOpen}
        onOpenChange={(open) => {
          setMistakeModalOpen(open);
          if (!open) setEditingMistake(null);
        }}
        title={editingMistake ? 'Chỉnh sửa mục lỗi sai' : 'Ghi nhận lỗi sai mới'}
        description="Lưu lại câu viết/nói sai và cách diễn đạt tự nhiên để ôn sửa lại."
        size="lg"
        dirty={Boolean(formOriginal.trim() || formCorrected.trim())}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMistakeModalOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form="mistake-form"
              variant="primary"
              loading={saveMistakeMutation.isPending}
            >
              {editingMistake ? 'Lưu cập nhật' : 'Lưu vào Ngân hàng lỗi sai'}
            </Button>
          </>
        }
      >
        <form id="mistake-form" onSubmit={handleSaveMistakeSubmit} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] text-[var(--danger-ink)]"
            >
              {formError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Nhóm lỗi"
              required
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value as MistakeCategory)}
              options={MISTAKE_CATEGORIES.map((cat) => ({
                value: cat,
                label: MISTAKE_CATEGORY_LABELS[cat],
              }))}
            />
            <Select
              label="Gắn chủ điểm ngữ pháp (tùy chọn)"
              value={formGrammarTopicId}
              onChange={(e) => setFormGrammarTopicId(e.target.value)}
              placeholder="Không gắn"
              options={(grammarTopicsQuery.data ?? []).map((t) => ({
                value: t.id,
                label: t.title,
              }))}
            />
            <Select
              label="Gắn từ vựng (tùy chọn)"
              value={formVocabId}
              onChange={(e) => setFormVocabId(e.target.value)}
              placeholder="Không gắn"
              options={(vocabPickerQuery.data ?? []).slice(0, 100).map((v) => ({
                value: v.id,
                label: v.word,
              }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              label="Câu / Cụm từ bị sai"
              required
              rows={2}
              value={formOriginal}
              onChange={(e) => setFormOriginal(e.target.value)}
              placeholder="Ví dụ: Lack of sleep affects to my concentration."
            />
            <Textarea
              label="Cách sửa đúng"
              required
              rows={2}
              value={formCorrected}
              onChange={(e) => setFormCorrected(e.target.value)}
              placeholder="Ví dụ: Lack of sleep affects my concentration."
            />
          </div>

          <Textarea
            label="Giải thích bằng tiếng Việt"
            rows={2}
            value={formExplanation}
            onChange={(e) => setFormExplanation(e.target.value)}
            placeholder="Ví dụ: Động từ 'affect' đi trực tiếp với tân ngữ, không thêm giới từ 'to'."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Ví dụ đúng mở rộng (tùy chọn)"
              value={formExample}
              onChange={(e) => setFormExample(e.target.value)}
              placeholder="Ví dụ: Cold weather adversely affects crops."
            />
            <Input
              label="Nguồn / Ngữ cảnh (tùy chọn)"
              value={formSourceContext}
              onChange={(e) => setFormSourceContext(e.target.value)}
              placeholder="Ví dụ: IELTS Writing Task 2 / Buổi học thứ 3"
            />
          </div>
        </form>
      </Dialog>

      {/* Delete Mistake Confirm */}
      <Dialog
        open={Boolean(mistakeToDelete)}
        onOpenChange={(open) => {
          if (!open) setMistakeToDelete(null);
        }}
        title="Xác nhận xóa lỗi sai"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMistakeToDelete(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteMistakeMutation.isPending}
              onClick={() => {
                if (mistakeToDelete) deleteMistakeMutation.mutate(mistakeToDelete.id);
              }}
            >
              Xóa
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--ink-secondary)]">
          Bạn chắc chắn muốn xóa mục lỗi sai này khỏi Ngân hàng lỗi sai cá nhân?
        </p>
      </Dialog>
    </div>
  );
}
