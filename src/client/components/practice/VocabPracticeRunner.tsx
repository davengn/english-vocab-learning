import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeftRight,
  BookmarkPlus,
  CheckCircle2,
  Clock,
  Eye,
  Lightbulb,
  X,
  XCircle,
} from 'lucide-react';
import type {
  GeneratedVocabQuizItemDto,
  MistakeCategory,
  PracticeSessionDto,
  VocabPracticeMode,
} from '@shared/apiTypes';
import {
  MISTAKE_CATEGORIES,
  MISTAKE_CATEGORY_LABELS,
  VOCAB_PRACTICE_MODE_LABELS,
} from '@shared/schemas';
import { api } from '@client/lib/api';
import { isImeComposing, onImeSafeEnter } from '@client/lib/ime';
import {
  cn,
  hasOpenDialog,
  isEditableFocused,
  isOtherInteractiveFocused,
} from '@client/lib/utils';
import { Badge } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';

export interface VocabPracticeRunnerProps {
  items: GeneratedVocabQuizItemDto[];
  mode: VocabPracticeMode;
  title: string;
  onFinish: () => void;
}

const MC_MODES = new Set<VocabPracticeMode>([
  'en_to_vi',
  'vi_to_en',
  'context_recognition',
  'collocation_match',
]);

const SM2_BUTTONS: ReadonlyArray<{
  rating: 1 | 2 | 3 | 4;
  label: string;
  sublabel: string;
  toneClass: string;
}> = [
  {
    rating: 1,
    label: 'Quên',
    sublabel: 'Ôn lại sớm',
    toneClass:
      'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-ink)] hover:bg-[#FEE2E2]',
  },
  {
    rating: 2,
    label: 'Khó',
    sublabel: 'Nhớ chập chờn',
    toneClass:
      'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-ink)] hover:bg-[#FEF3C7]',
  },
  {
    rating: 3,
    label: 'Nhớ',
    sublabel: 'Đạt yêu cầu',
    toneClass:
      'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[#CCFBF1]',
  },
  {
    rating: 4,
    label: 'Rất dễ',
    sublabel: 'Giãn lịch xa',
    toneClass:
      'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)] hover:bg-[#DCFCE7]',
  },
];

const PRODUCTION_RATING_BUTTONS: ReadonlyArray<{
  rating: 1 | 2 | 3 | 4;
  label: string;
  toneClass: string;
}> = [
  {
    rating: 1,
    label: 'Chưa đạt',
    toneClass:
      'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-ink)] hover:bg-[#FEE2E2]',
  },
  {
    rating: 2,
    label: 'Cần sửa',
    toneClass:
      'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-ink)] hover:bg-[#FEF3C7]',
  },
  {
    rating: 3,
    label: 'Đạt',
    toneClass:
      'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[#CCFBF1]',
  },
  {
    rating: 4,
    label: 'Rất tốt',
    toneClass:
      'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)] hover:bg-[#DCFCE7]',
  },
];

function normalizeAnswer(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Distraction-free interactive runner supporting all 8 deterministic vocabulary practice modes with SM-2 rating.
 */
export function VocabPracticeRunner({ items, mode, title, onFinish }: VocabPracticeRunnerProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Per-item interaction state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [productionSentence, setProductionSentence] = useState('');
  const [isFlipped, setIsFlipped] = useState(false);
  const [flashcardSide, setFlashcardSide] = useState<'en_to_vi' | 'vi_to_en'>('en_to_vi');
  const [hasChecked, setHasChecked] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [isSubmittingAttempt, setIsSubmittingAttempt] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  // Optional save-to-mistake-bank drawer when wrong
  const [saveMistakeOpen, setSaveMistakeOpen] = useState(false);
  const [mistakeCategory, setMistakeCategory] = useState<MistakeCategory>('vocabulary_usage');
  const [mistakeNote, setMistakeNote] = useState('');

  const sessionInitRef = useRef<Promise<PracticeSessionDto> | null>(null);
  const itemStartRef = useRef<number>(Date.now());
  const sessionCompletedRef = useRef(false);
  const cardButtonRef = useRef<HTMLDivElement | null>(null);

  const currentItem = items[currentIndex];
  const isMcMode = MC_MODES.has(mode) && (currentItem?.options.length ?? 0) > 1;
  const isTypedMode =
    mode === 'fill_in_blank' ||
    mode === 'spelling' ||
    (MC_MODES.has(mode) && (currentItem?.options.length ?? 0) <= 1);

  // Create persistent practice session once on mount (StrictMode-safe)
  useEffect(() => {
    if (items.length === 0) return;
    if (!sessionInitRef.current) {
      sessionInitRef.current = api.createPracticeSession({
        domain: 'vocabulary',
        mode,
        title,
        totalItems: items.length,
      });
    }
    let mounted = true;
    sessionInitRef.current
      .then((session) => {
        if (mounted) setSessionId(session.id);
      })
      .catch((err) => {
        if (mounted) {
          showError(
            'Không thể khởi tạo phiên luyện tập',
            err instanceof Error ? err.message : undefined,
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, [items.length, mode, title, showError]);

  // Elapsed timer
  useEffect(() => {
    if (isFinished || items.length === 0) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isFinished, items.length]);

  const resetItemState = useCallback(() => {
    setSelectedOption(null);
    setTypedAnswer('');
    setProductionSentence('');
    setIsFlipped(false);
    setHasChecked(false);
    setIsCurrentCorrect(null);
    setShowHint(false);
    setSaveMistakeOpen(false);
    setMistakeCategory('vocabulary_usage');
    setMistakeNote('');
    itemStartRef.current = Date.now();
  }, []);

  const finalizeSession = useCallback(
    async (finalCompleted: number, finalCorrect: number) => {
      if (sessionCompletedRef.current) return;
      sessionCompletedRef.current = true;
      setIsFinished(true);

      const activeSessionId = sessionId ?? (await sessionInitRef.current?.then((s) => s.id).catch(() => null));
      if (activeSessionId) {
        try {
          await api.completePracticeSession(activeSessionId, {
            durationSeconds: elapsedSeconds,
            completedItems: finalCompleted,
            correctCount: finalCorrect,
          });
        } catch {
          // Summary still shown locally
        }
      }

      queryClient.invalidateQueries({ queryKey: ['practice-history'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      if (saveMistakeOpen) {
        queryClient.invalidateQueries({ queryKey: ['mistakes'] });
      }
    },
    [elapsedSeconds, queryClient, saveMistakeOpen, sessionId],
  );

  const handleSelectMcOption = useCallback(
    (option: string) => {
      if (!currentItem || hasChecked) return;
      const accepted = new Set(
        [currentItem.correctAnswer, ...currentItem.acceptableAnswers]
          .map(normalizeAnswer)
          .filter(Boolean),
      );
      const correct = accepted.has(normalizeAnswer(option));
      setSelectedOption(option);
      setIsCurrentCorrect(correct);
      setHasChecked(true);
    },
    [currentItem, hasChecked],
  );

  const handleCheckTyped = useCallback(() => {
    if (!currentItem || hasChecked) return;
    const cleaned = normalizeAnswer(typedAnswer);
    if (!cleaned) return;
    const accepted = new Set(
      [currentItem.correctAnswer, ...currentItem.acceptableAnswers, currentItem.word]
        .filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i)
        .map(normalizeAnswer),
    );
    // In en_to_vi fallback mode, only compare against correctAnswer & acceptableAnswers (not English word)
    const targetAccepted =
      mode === 'en_to_vi'
        ? new Set(
            [currentItem.correctAnswer, ...currentItem.acceptableAnswers]
              .map(normalizeAnswer)
              .filter(Boolean),
          )
        : accepted;

    setIsCurrentCorrect(targetAccepted.has(cleaned));
    setHasChecked(true);
  }, [currentItem, hasChecked, mode, typedAnswer]);

  const handleCompareProduction = useCallback(() => {
    if (!productionSentence.trim()) return;
    setHasChecked(true);
  }, [productionSentence]);

  const handleSubmitRating = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!currentItem || isSubmittingAttempt) return;
      setIsSubmittingAttempt(true);

      const responseTimeMs = Math.max(0, Date.now() - itemStartRef.current);
      const isCorrect =
        mode === 'flashcard' || mode === 'sentence_production'
          ? rating >= 3
          : Boolean(isCurrentCorrect);

      const userAnswer =
        mode === 'flashcard'
          ? rating >= 3
            ? 'Đã nhớ'
            : 'Chưa nhớ'
          : mode === 'sentence_production'
            ? productionSentence.trim()
            : isMcMode
              ? selectedOption ?? ''
              : typedAnswer.trim();

      const expectedAnswer =
        mode === 'sentence_production'
          ? currentItem.exampleSentence || currentItem.correctAnswer
          : currentItem.correctAnswer;

      try {
        const activeSessionId =
          sessionId ?? (await sessionInitRef.current?.then((s) => s.id));
        if (activeSessionId) {
          await api.recordPracticeAttempt(activeSessionId, {
            vocabularyId: currentItem.vocabularyId,
            mode: currentItem.mode,
            direction: mode === 'flashcard' ? flashcardSide : currentItem.direction,
            userAnswer,
            expectedAnswer,
            isCorrect,
            selfRating: rating,
            responseTimeMs,
            ...(saveMistakeOpen
              ? {
                  saveMistake: {
                    category: mistakeCategory,
                    explanationVi:
                      mistakeNote.trim() ||
                      currentItem.explanationVi ||
                      currentItem.vietnameseMeaning,
                    correctedExample: currentItem.exampleSentence,
                    sourceContext: `Luyện từ vựng: ${VOCAB_PRACTICE_MODE_LABELS[mode]}`,
                  },
                }
              : {}),
          });
          if (saveMistakeOpen) {
            queryClient.invalidateQueries({ queryKey: ['mistakes'] });
            success('Đã lưu vào Ngân hàng lỗi sai');
          }
        }
      } catch (err) {
        showError(
          'Lỗi khi lưu kết quả câu này',
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        setIsSubmittingAttempt(false);
      }

      const nextCompleted = completedCount + 1;
      const nextCorrect = correctCount + (isCorrect ? 1 : 0);
      setCompletedCount(nextCompleted);
      setCorrectCount(nextCorrect);

      if (currentIndex + 1 >= items.length) {
        await finalizeSession(nextCompleted, nextCorrect);
      } else {
        setCurrentIndex((prev) => prev + 1);
        resetItemState();
      }
    },
    [
      completedCount,
      correctCount,
      currentIndex,
      currentItem,
      finalizeSession,
      flashcardSide,
      isCurrentCorrect,
      isMcMode,
      isSubmittingAttempt,
      items.length,
      mistakeCategory,
      mistakeNote,
      mode,
      productionSentence,
      queryClient,
      resetItemState,
      saveMistakeOpen,
      selectedOption,
      sessionId,
      showError,
      success,
      typedAnswer,
    ],
  );

  // Keyboard shortcuts (Space to flip flashcard, 1-4 for options / SM-2 rating)
  useEffect(() => {
    if (isFinished || !currentItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (hasOpenDialog()) return;
      if (isEditableFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (mode === 'flashcard') {
        if (e.code === 'Space') {
          if (isOtherInteractiveFocused(cardButtonRef.current)) return;
          e.preventDefault();
          setIsFlipped((v) => !v);
          return;
        }
        if (e.key.toLowerCase() === 'h') {
          e.preventDefault();
          setShowHint((v) => !v);
          return;
        }
        if (isFlipped && ['1', '2', '3', '4'].includes(e.key)) {
          e.preventDefault();
          handleSubmitRating(Number(e.key) as 1 | 2 | 3 | 4);
        }
        return;
      }

      if (isMcMode && !hasChecked && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (currentItem.options[idx]) {
          e.preventDefault();
          handleSelectMcOption(currentItem.options[idx]);
        }
        return;
      }

      if (hasChecked && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        handleSubmitRating(Number(e.key) as 1 | 2 | 3 | 4);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentItem,
    handleSelectMcOption,
    handleSubmitRating,
    hasChecked,
    isFinished,
    isFlipped,
    isMcMode,
    mode,
  ]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[680px] py-6">
        <EmptyState
          title="Chưa có từ vựng phù hợp để luyện tập"
          description="Hãy thêm từ mới vào thư viện hoặc đổi nguồn từ vựng khác."
          actionLabel="Quay lại"
          onAction={onFinish}
        />
      </div>
    );
  }

  if (isFinished) {
    const accuracyPercent =
      completedCount > 0 ? Math.round((correctCount / completedCount) * 100) : 0;

    return (
      <div className="mx-auto max-w-[680px] py-4">
        <Card elevated>
          <CardContent className="space-y-6 p-6 sm:p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success-ink)]">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </div>

            <div>
              <Badge tone="accent" size="md">
                {VOCAB_PRACTICE_MODE_LABELS[mode]}
              </Badge>
              <h2 className="mt-3 text-[22px] font-semibold text-[var(--ink-primary)]">
                Hoàn thành phiên luyện tập!
              </h2>
              <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">{title}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4">
              <div>
                <p className="text-[12px] text-[var(--ink-muted)]">Độ chính xác</p>
                <p className="mt-1 text-[22px] font-semibold text-[var(--accent)]">
                  {accuracyPercent}%
                </p>
              </div>
              <div>
                <p className="text-[12px] text-[var(--ink-muted)]">Đã hoàn thành</p>
                <p className="mt-1 text-[22px] font-semibold text-[var(--ink-primary)]">
                  {correctCount}/{completedCount}
                </p>
              </div>
              <div>
                <p className="text-[12px] text-[var(--ink-muted)]">Thời gian</p>
                <p className="mt-1 text-[22px] font-semibold text-[var(--ink-primary)]">
                  {formatDuration(elapsedSeconds)}
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[var(--ink-secondary)]">
              Lịch ôn tập SM-2 của từng từ đã được cập nhật theo đánh giá của bạn.
            </p>

            <div className="flex justify-center">
              <Button variant="primary" size="lg" onClick={onFinish}>
                Hoàn tất
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px] space-y-4 py-2">
      {/* Top Runner Header */}
      <div className="space-y-2.5 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone="accent">{VOCAB_PRACTICE_MODE_LABELS[mode]}</Badge>
            <span className="text-[13px] font-medium text-[var(--ink-primary)]">
              Câu {currentIndex + 1} / {items.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[13px] tabular-nums text-[var(--ink-secondary)]">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDuration(elapsedSeconds)}
            </span>

            {!confirmExit ? (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<X className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  if (completedCount > 0) {
                    setConfirmExit(true);
                  } else {
                    onFinish();
                  }
                }}
              >
                Thoát
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    await finalizeSession(completedCount, correctCount);
                    onFinish();
                  }}
                >
                  Lưu & Thoát
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmExit(false)}>
                  Tiếp tục
                </Button>
              </div>
            )}
          </div>
        </div>

        <progress
          value={completedCount}
          max={items.length}
          aria-label="Tiến độ phiên luyện tập từ vựng"
          className="h-2 w-full accent-[var(--accent)]"
        />
      </div>

      {/* Main Practice Card */}
      <Card elevated>
        <CardContent className="space-y-6 p-6 sm:p-8">
          {/* Prompt Area */}
          {mode === 'flashcard' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentItem.partOfSpeech && currentItem.partOfSpeech !== 'other' && (
                    <Badge tone="neutral">{currentItem.partOfSpeech}</Badge>
                  )}
                  {currentItem.cefrLevel !== 'unknown' && (
                    <Badge tone="info">{currentItem.cefrLevel}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => setShowHint((v) => !v)}
                  >
                    {showHint ? 'Ẩn gợi ý' : 'Gợi ý (H)'}
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    leftIcon={<ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => {
                      setIsFlipped(false);
                      setShowHint(false);
                      setFlashcardSide((s) => (s === 'en_to_vi' ? 'vi_to_en' : 'en_to_vi'));
                    }}
                  >
                    {flashcardSide === 'en_to_vi' ? 'Mặt trước: Anh' : 'Mặt trước: Việt'}
                  </Button>
                </div>
              </div>

              <div className="flashcard-scene">
                <div
                  ref={cardButtonRef}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isFlipped}
                  aria-label={
                    isFlipped
                      ? `Mặt sau thẻ ${currentItem.word}. Nhấn để lật lại`
                      : `Mặt trước thẻ ${currentItem.word}. Nhấn hoặc bấm Space để lật`
                  }
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, a')) return;
                    setIsFlipped((v) => !v);
                  }}
                  onKeyDown={(e) => {
                    if (isImeComposing(e)) return;
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setIsFlipped((v) => !v);
                    }
                  }}
                  className={cn(
                    'flashcard-card cursor-pointer rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
                    isFlipped && 'is-flipped',
                  )}
                >
                  {/* FRONT */}
                  <div className="flashcard-face flex min-h-[270px] flex-col justify-between rounded-[12px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-6 text-center">
                    <p className="text-left text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      {flashcardSide === 'en_to_vi' ? 'Thuật ngữ (EN)' : 'Nghĩa tiếng Việt'}
                    </p>

                    <div className="my-auto py-4">
                      <h2
                        className={cn(
                          'font-semibold tracking-tight text-[var(--ink-primary)]',
                          flashcardSide === 'en_to_vi' ? 'text-[30px]' : 'text-[22px]',
                        )}
                      >
                        {flashcardSide === 'en_to_vi'
                          ? currentItem.word
                          : currentItem.vietnameseMeaning || currentItem.correctAnswer}
                      </h2>
                      {flashcardSide === 'en_to_vi' && currentItem.ipa && (
                        <p className="ipa mt-1.5 text-[16px] text-[var(--ink-secondary)]">
                          {currentItem.ipa}
                        </p>
                      )}
                      {showHint && (
                        <div className="mx-auto mt-4 max-w-md rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-[13px] text-[var(--warning-ink)]">
                          <span className="font-medium">Gợi ý: </span>
                          {flashcardSide === 'vi_to_en'
                            ? `${currentItem.word[0] ?? ''}${'_'.repeat(Math.max(2, currentItem.word.length - 1))} ${currentItem.ipa}`
                            : currentItem.englishDefinition || currentItem.hint || currentItem.partOfSpeech}
                        </div>
                      )}
                    </div>

                    <p className="text-[12px] text-[var(--ink-muted)]">
                      Nhấn vào thẻ hoặc phím Space để lật xem đáp án
                    </p>
                  </div>

                  {/* BACK */}
                  <div className="flashcard-face flashcard-face-back flex min-h-[270px] flex-col justify-between rounded-[12px] border border-[var(--accent-border)] bg-[var(--bg-canvas)] p-5 text-left">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                      {flashcardSide === 'en_to_vi' ? 'Nghĩa tiếng Việt' : 'Từ tiếng Anh'}
                    </p>

                    <div className="my-auto space-y-3 py-3">
                      <div className="text-center">
                        <p className="text-[22px] font-semibold text-[var(--accent)]">
                          {flashcardSide === 'en_to_vi'
                            ? currentItem.vietnameseMeaning || currentItem.correctAnswer
                            : currentItem.word}
                        </p>
                        <p className="mt-1 text-[13.5px] text-[var(--ink-secondary)]">
                          <span className="font-medium text-[var(--ink-primary)]">
                            {currentItem.word}
                          </span>
                          {currentItem.ipa ? (
                            <span className="ipa ml-2 text-[var(--ink-muted)]">{currentItem.ipa}</span>
                          ) : null}
                        </p>
                      </div>

                      {currentItem.englishDefinition && (
                        <p className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-[13.5px] text-[var(--ink-primary)]">
                          {currentItem.englishDefinition}
                        </p>
                      )}

                      {currentItem.exampleSentence && (
                        <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
                          <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                            “{currentItem.exampleSentence}”
                          </p>
                          {currentItem.exampleTranslation && (
                            <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
                              {currentItem.exampleTranslation}
                            </p>
                          )}
                        </div>
                      )}

                      {currentItem.collocationPhrase && (
                        <p className="text-[13px] text-[var(--ink-secondary)]">
                          <span className="font-medium text-[var(--ink-primary)]">Collocation:</span>{' '}
                          {currentItem.collocationPhrase}
                          {currentItem.collocationMeaning ? ` — ${currentItem.collocationMeaning}` : ''}
                        </p>
                      )}

                      {currentItem.explanationVi && (
                        <p className="text-[13px] text-[var(--ink-secondary)]">
                          <span className="font-medium text-[var(--ink-primary)]">Ghi chú:</span>{' '}
                          {currentItem.explanationVi}
                        </p>
                      )}
                    </div>

                    <p className="text-right text-[12px] text-[var(--ink-muted)]">
                      Chọn mức nhớ bên dưới (phím 1–4)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentItem.cefrLevel !== 'unknown' && (
                    <Badge tone="info">{currentItem.cefrLevel}</Badge>
                  )}
                  {currentItem.partOfSpeech && currentItem.partOfSpeech !== 'other' && (
                    <Badge tone="neutral">{currentItem.partOfSpeech}</Badge>
                  )}
                </div>

                {currentItem.hint && !hasChecked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => setShowHint((v) => !v)}
                  >
                    {showHint ? 'Ẩn gợi ý' : 'Xem gợi ý'}
                  </Button>
                )}
              </div>

              <h2 className="text-[20px] font-semibold leading-[1.45] text-[var(--ink-primary)]">
                {currentItem.prompt}
              </h2>

              {currentItem.promptSubtext && (
                <p
                  className={cn(
                    'text-[14px] text-[var(--ink-secondary)]',
                    mode === 'en_to_vi' && 'ipa',
                  )}
                >
                  {currentItem.promptSubtext}
                </p>
              )}

              {showHint && currentItem.hint && (
                <div className="rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3.5 py-2.5 text-[13px] text-[var(--warning-ink)]">
                  {currentItem.hint}
                </div>
              )}
            </div>
          )}

          {/* Mode Interaction Area */}
          {isMcMode && (
            <div className="space-y-2.5">
              {currentItem.options.map((opt, idx) => {
                const isSelected = selectedOption === opt;
                const isAnswerOption =
                  normalizeAnswer(opt) === normalizeAnswer(currentItem.correctAnswer);

                return (
                  <button
                    key={`${opt}-${idx}`}
                    type="button"
                    disabled={hasChecked}
                    onClick={() => handleSelectMcOption(opt)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-[8px] border px-4 py-3 text-left text-[15px] transition-colors cursor-pointer disabled:cursor-default',
                      !hasChecked &&
                        'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50',
                      hasChecked &&
                        isAnswerOption &&
                        'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)] font-medium',
                      hasChecked &&
                        isSelected &&
                        !isAnswerOption &&
                        'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-ink)]',
                      hasChecked &&
                        !isSelected &&
                        !isAnswerOption &&
                        'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-muted)] opacity-70',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[12px] font-semibold text-[var(--ink-secondary)]">
                        {idx + 1}
                      </span>
                      <span>{opt}</span>
                    </span>
                    {hasChecked && isAnswerOption && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-ink)]" aria-hidden="true" />
                    )}
                    {hasChecked && isSelected && !isAnswerOption && (
                      <XCircle className="h-4 w-4 shrink-0 text-[var(--danger-ink)]" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
              {!hasChecked && (
                <p className="text-[12px] text-[var(--ink-muted)]">
                  Mẹo: Nhấn phím <kbd className="formula">1</kbd>–<kbd className="formula">4</kbd> để chọn nhanh.
                </p>
              )}
            </div>
          )}

          {isTypedMode && !hasChecked && (
            <div className="space-y-3">
              <Input
                label="Nhập câu trả lời của bạn"
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                onKeyDown={onImeSafeEnter(handleCheckTyped)}
                placeholder="Gõ đáp án rồi nhấn Enter..."
                autoFocus
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  disabled={!typedAnswer.trim()}
                  onClick={handleCheckTyped}
                >
                  Kiểm tra đáp án
                </Button>
              </div>
            </div>
          )}

          {mode === 'sentence_production' && !hasChecked && (
            <div className="space-y-3">
              <Textarea
                label="Viết một câu tiếng Anh hoàn chỉnh sử dụng từ này"
                hint="Tự rèn luyện đặt câu chủ động (không chấm bằng AI)."
                rows={3}
                value={productionSentence}
                onChange={(e) => setProductionSentence(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isImeComposing(e)) {
                    e.preventDefault();
                    handleCompareProduction();
                  }
                }}
                placeholder={`Ví dụ: Đặt câu với "${currentItem.word}"...`}
                autoFocus
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-[var(--ink-muted)]">
                  <kbd className="formula">⌘/Ctrl + Enter</kbd> để đối chiếu
                </span>
                <Button
                  variant="primary"
                  leftIcon={<Eye className="h-4 w-4" aria-hidden="true" />}
                  disabled={!productionSentence.trim()}
                  onClick={handleCompareProduction}
                >
                  So sánh với câu mẫu
                </Button>
              </div>
            </div>
          )}

          {/* Post-check Feedback + SM-2 Rating Bar */}
          {hasChecked && mode === 'sentence_production' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
                  <p className="text-[12px] font-medium text-[var(--ink-muted)]">Câu bạn đã viết</p>
                  <p className="mt-1.5 text-[14px] leading-[1.55] text-[var(--ink-primary)]">
                    {productionSentence}
                  </p>
                </div>
                <div className="rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)]/50 p-3.5">
                  <p className="text-[12px] font-medium text-[var(--accent)]">Câu mẫu tham khảo</p>
                  <p className="mt-1.5 text-[14px] font-medium leading-[1.55] text-[var(--ink-primary)]">
                    {currentItem.exampleSentence || currentItem.correctAnswer}
                  </p>
                  {currentItem.exampleTranslation && (
                    <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
                      {currentItem.exampleTranslation}
                    </p>
                  )}
                </div>
              </div>

              {currentItem.explanationVi && (
                <p className="text-[13px] text-[var(--ink-secondary)]">
                  <span className="font-medium text-[var(--ink-primary)]">Lưu ý ngữ cảnh:</span>{' '}
                  {currentItem.explanationVi}
                </p>
              )}

              <p className="text-[12px] text-[var(--ink-muted)]">
                Tự đối chiếu câu bạn viết với câu mẫu đã lưu (tự đánh giá trung thực, không dùng AI).
              </p>

              <div>
                <p className="mb-2 text-[13px] font-medium text-[var(--ink-primary)]">
                  Tự đánh giá câu của bạn:
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PRODUCTION_RATING_BUTTONS.map((btn) => (
                    <button
                      key={btn.rating}
                      type="button"
                      disabled={isSubmittingAttempt}
                      onClick={() => handleSubmitRating(btn.rating)}
                      className={cn(
                        'flex flex-col items-center rounded-[8px] border px-3 py-2.5 text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50',
                        btn.toneClass,
                      )}
                    >
                      <span>
                        {btn.rating} · {btn.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {hasChecked && mode !== 'sentence_production' && (
            <div className="space-y-4">
              <div
                role="status"
                className={cn(
                  'rounded-[8px] border px-4 py-3',
                  isCurrentCorrect
                    ? 'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)]'
                    : 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-ink)]',
                )}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {isCurrentCorrect ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{isCurrentCorrect ? 'Chính xác!' : 'Chưa chính xác'}</span>
                </div>

                {!isCurrentCorrect && isTypedMode && typedAnswer.trim() && (
                  <p className="mt-1 text-[13px]">
                    Bạn nhập: <span className="line-through">{typedAnswer}</span>
                  </p>
                )}

                <p className="mt-1 text-[14px] text-[var(--ink-primary)]">
                  Đáp án đúng:{' '}
                  <strong className="font-semibold">
                    {currentItem.correctAnswer}
                  </strong>
                  {currentItem.word !== currentItem.correctAnswer
                    ? ` (${currentItem.word})`
                    : ''}
                </p>
              </div>

              {(currentItem.exampleSentence || currentItem.explanationVi || currentItem.collocationPhrase) && (
                <div className="space-y-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5 text-[13px]">
                  {currentItem.exampleSentence && (
                    <div>
                      <p className="font-medium text-[var(--ink-primary)]">
                        {currentItem.exampleSentence}
                      </p>
                      {currentItem.exampleTranslation && (
                        <p className="text-[var(--ink-secondary)]">
                          {currentItem.exampleTranslation}
                        </p>
                      )}
                    </div>
                  )}
                  {currentItem.collocationPhrase && (
                    <p className="text-[var(--ink-secondary)]">
                      <span className="font-medium text-[var(--ink-primary)]">Collocation:</span>{' '}
                      {currentItem.collocationPhrase}
                      {currentItem.collocationMeaning ? ` (${currentItem.collocationMeaning})` : ''}
                    </p>
                  )}
                  {currentItem.explanationVi && (
                    <p className="text-[var(--ink-secondary)]">{currentItem.explanationVi}</p>
                  )}
                </div>
              )}

              {!isCurrentCorrect && (
                <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
                  <button
                    type="button"
                    onClick={() => setSaveMistakeOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] cursor-pointer"
                  >
                    <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
                    {saveMistakeOpen
                      ? 'Sẽ tự động lưu vào Ngân hàng lỗi sai khi chấm điểm ✓'
                      : 'Lưu lỗi này vào Ngân hàng lỗi sai'}
                  </button>

                  {saveMistakeOpen && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Select
                        label="Nhóm lỗi"
                        value={mistakeCategory}
                        onChange={(e) => setMistakeCategory(e.target.value as MistakeCategory)}
                        options={MISTAKE_CATEGORIES.map((cat) => ({
                          value: cat,
                          label: MISTAKE_CATEGORY_LABELS[cat],
                        }))}
                      />
                      <Input
                        label="Ghi chú tiếng Việt"
                        value={mistakeNote}
                        onChange={(e) => setMistakeNote(e.target.value)}
                        placeholder="Lý do hay nhầm..."
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SM-2 Rating Bar */}
          {((mode === 'flashcard' && isFlipped) || (mode !== 'flashcard' && mode !== 'sentence_production' && hasChecked)) && (
            <div className="border-t border-[var(--border-hairline)] pt-4">
              <p className="mb-2.5 text-[13px] font-medium text-[var(--ink-primary)]">
                Đánh giá mức độ ghi nhớ (SM-2) — phím <kbd className="formula">1</kbd>–<kbd className="formula">4</kbd>:
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SM2_BUTTONS.map((btn) => (
                  <button
                    key={btn.rating}
                    type="button"
                    disabled={isSubmittingAttempt}
                    onClick={() => handleSubmitRating(btn.rating)}
                    className={cn(
                      'flex flex-col items-center rounded-[8px] border px-3 py-2.5 text-center transition-colors cursor-pointer disabled:opacity-50',
                      btn.toneClass,
                    )}
                  >
                    <span className="text-[13px] font-semibold">
                      {btn.rating} {btn.label}
                    </span>
                    <span className="mt-0.5 text-[11px] opacity-80">{btn.sublabel}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
