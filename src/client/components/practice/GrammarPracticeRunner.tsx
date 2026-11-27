import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BookmarkPlus,
  BookMarked,
  CheckCircle2,
  Clock,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  MistakeCategory,
  PracticeQuestionDto,
  PracticeSessionDto,
} from '@shared/apiTypes';
import {
  GRAMMAR_DIFFICULTY_LABELS,
  GRAMMAR_QUESTION_TYPE_LABELS,
  MISTAKE_CATEGORIES,
  MISTAKE_CATEGORY_LABELS,
} from '@shared/schemas';
import { api } from '@client/lib/api';
import { isImeComposing, onImeSafeEnter } from '@client/lib/ime';
import { cn } from '@client/lib/utils';
import { Badge } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';

export interface GrammarPracticeRunnerProps {
  questions: PracticeQuestionDto[];
  title: string;
  domain?: 'grammar' | 'mistake_review' | 'daily_review';
  onFinish: () => void;
}

interface WordTile {
  id: number;
  text: string;
}

function normalizeGrammarAnswer(value: string, stripTrailingPunct = false): string {
  let normalized = value
    .normalize('NFC')
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (stripTrailingPunct) {
    normalized = normalized.replace(/[.!?]+$/g, '').trim();
  }
  return normalized;
}

function checkDeterministicGrammarAnswer(
  question: PracticeQuestionDto,
  userAnswer: string,
): boolean {
  const rawUser = normalizeGrammarAnswer(userAnswer, false);
  const relaxedUser = normalizeGrammarAnswer(userAnswer, true);
  if (!rawUser) return false;

  const candidates = [question.correctAnswer, ...question.acceptableAnswers].filter(Boolean);
  for (const cand of candidates) {
    if (normalizeGrammarAnswer(cand, false) === rawUser) return true;
    if (normalizeGrammarAnswer(cand, true) === relaxedUser) return true;
  }
  return false;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildScrambledTiles(question: PracticeQuestionDto): WordTile[] {
  const sourceTokens =
    question.options.length > 0
      ? question.options
      : question.correctAnswer.trim().split(/\s+/).filter(Boolean);

  const tiles: WordTile[] = sourceTokens.map((text, id) => ({ id, text }));
  if (tiles.length <= 1) return tiles;

  const scrambled = [...tiles].sort((a, b) => {
    const ha = hashSeed(`${question.id}:${a.id}:${a.text}`);
    const hb = hashSeed(`${question.id}:${b.id}:${b.text}`);
    return ha - hb;
  });

  // Ensure scrambled order differs from exact target sentence if possible
  const targetNorm = normalizeGrammarAnswer(question.correctAnswer, true);
  const scrambledNorm = normalizeGrammarAnswer(scrambled.map((t) => t.text).join(' '), true);
  if (scrambledNorm === targetNorm && scrambled.length >= 2) {
    const first = scrambled[0];
    scrambled[0] = scrambled[scrambled.length - 1];
    scrambled[scrambled.length - 1] = first;
  }

  return scrambled;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function isEditableFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (active as HTMLElement).isContentEditable
  );
}

/**
 * Distraction-free interactive runner supporting all 10 deterministic grammar question types
 * plus 1-click saving to the Personal Mistake Bank.
 */
export function GrammarPracticeRunner({
  questions,
  title,
  domain = 'grammar',
  onFinish,
}: GrammarPracticeRunnerProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  // Per-question interaction state
  const [selectedChoice, setSelectedChoice] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [placedTileIds, setPlacedTileIds] = useState<number[]>([]);
  const [useTypedOrdering, setUseTypedOrdering] = useState(false);

  const [hasChecked, setHasChecked] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [isSubmittingAttempt, setIsSubmittingAttempt] = useState(false);
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);

  // Mistake Bank inline save drawer
  const [mistakeDrawerOpen, setMistakeDrawerOpen] = useState(false);
  const [mistakeSaved, setMistakeSaved] = useState(false);
  const [isSavingMistake, setIsSavingMistake] = useState(false);
  const [mistakeCategory, setMistakeCategory] = useState<MistakeCategory>('tense');
  const [mistakeOriginal, setMistakeOriginal] = useState('');
  const [mistakeCorrected, setMistakeCorrected] = useState('');
  const [mistakeExplanation, setMistakeExplanation] = useState('');

  const sessionInitRef = useRef<Promise<PracticeSessionDto> | null>(null);
  const itemStartRef = useRef<number>(Date.now());
  const sessionCompletedRef = useRef(false);

  const currentQuestion = questions[currentIndex];

  const scrambledTiles = useMemo(() => {
    if (!currentQuestion || currentQuestion.questionType !== 'word_ordering') return [];
    return buildScrambledTiles(currentQuestion);
  }, [currentQuestion]);

  const errorSegments = useMemo(() => {
    if (!currentQuestion || currentQuestion.questionType !== 'error_identification') return [];
    if (currentQuestion.options.length > 0) return currentQuestion.options;
    return currentQuestion.prompt.split(/\s+/).filter(Boolean);
  }, [currentQuestion]);

  const phraseFragments = useMemo(() => {
    if (!currentQuestion || currentQuestion.questionType !== 'phrase_conjugation') return [];
    const raw =
      currentQuestion.options.length > 0
        ? currentQuestion.options
        : currentQuestion.prompt.split(/\s*\/\s*/).filter(Boolean);
    return raw.map((text, idx) => {
      const trimmed = text.trim();
      const needsConjugation = /^\(.*\)$/.test(trimmed);
      return {
        id: `${currentQuestion.id}-frag-${idx}`,
        text: trimmed,
        insertText: needsConjugation ? trimmed.slice(1, -1).trim() : trimmed,
        needsConjugation,
      };
    });
  }, [currentQuestion]);

  const assembledSentence = useMemo(() => {
    if (useTypedOrdering) return typedAnswer;
    const tileMap = new Map(scrambledTiles.map((t) => [t.id, t.text]));
    return placedTileIds
      .map((id) => tileMap.get(id))
      .filter((t): t is string => Boolean(t))
      .join(' ');
  }, [placedTileIds, scrambledTiles, typedAnswer, useTypedOrdering]);

  useEffect(() => {
    if (questions.length === 0) return;
    if (!sessionInitRef.current) {
      const mode =
        questions.length === 1
          ? questions[0].questionType
          : domain === 'mistake_review'
            ? 'sentence_correction'
            : 'mixed_grammar';
      sessionInitRef.current = api.createPracticeSession({
        domain,
        mode,
        title,
        totalItems: questions.length,
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
            'Không thể tạo phiên luyện tập ngữ pháp',
            err instanceof Error ? err.message : undefined,
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [domain, questions, title, showError]);

  useEffect(() => {
    if (isFinished || questions.length === 0) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isFinished, questions.length]);

  const resetQuestionState = useCallback(() => {
    setSelectedChoice('');
    setTypedAnswer('');
    setPlacedTileIds([]);
    setUseTypedOrdering(false);
    setHasChecked(false);
    setIsCurrentCorrect(null);
    setLastAttemptId(null);
    setMistakeDrawerOpen(false);
    setMistakeSaved(false);
    setMistakeCategory('tense');
    setMistakeOriginal('');
    setMistakeCorrected('');
    setMistakeExplanation('');
    itemStartRef.current = Date.now();
  }, []);

  const currentUserAnswer = useMemo(() => {
    if (!currentQuestion) return '';
    switch (currentQuestion.questionType) {
      case 'multiple_choice':
      case 'contextual_selection':
      case 'error_identification':
        return selectedChoice;
      case 'word_ordering':
        return assembledSentence;
      default:
        return typedAnswer;
    }
  }, [assembledSentence, currentQuestion, selectedChoice, typedAnswer]);

  const canCheck = Boolean(currentUserAnswer.trim()) && !hasChecked && !isSubmittingAttempt;

  const handleCheckAnswer = useCallback(async () => {
    if (!currentQuestion || hasChecked || isSubmittingAttempt) return;
    const answer = currentUserAnswer.trim();
    if (!answer) return;

    const correct = checkDeterministicGrammarAnswer(currentQuestion, answer);
    const responseTimeMs = Math.max(0, Date.now() - itemStartRef.current);

    setIsCurrentCorrect(correct);
    setHasChecked(true);
    setCompletedCount((prev) => prev + 1);
    if (correct) {
      setCorrectCount((prev) => prev + 1);
    }

    // Pre-fill Mistake Bank drawer fields
    setMistakeOriginal(answer);
    setMistakeCorrected(currentQuestion.correctAnswer);
    setMistakeExplanation(currentQuestion.explanationVi);

    setIsSubmittingAttempt(true);
    try {
      const activeSessionId =
        sessionId ?? (await sessionInitRef.current?.then((s) => s.id));
      if (activeSessionId) {
        const direction =
          currentQuestion.questionType === 'vi_to_en'
            ? 'vi_to_en'
            : currentQuestion.questionType === 'en_to_vi'
              ? 'en_to_vi'
              : 'context';
        const resp = await api.recordPracticeAttempt(activeSessionId, {
          grammarTopicId: currentQuestion.grammarTopicId,
          vocabularyId: currentQuestion.vocabularyId,
          questionId: currentQuestion.id,
          mode: currentQuestion.questionType,
          direction,
          userAnswer: answer,
          expectedAnswer: currentQuestion.correctAnswer,
          isCorrect: correct,
          responseTimeMs,
        });
        setLastAttemptId(resp.attempt.id);
      }
    } catch (err) {
      showError(
        'Không thể ghi lại kết quả câu hỏi',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setIsSubmittingAttempt(false);
    }
  }, [currentQuestion, currentUserAnswer, hasChecked, isSubmittingAttempt, sessionId, showError]);

  const finalizeSession = useCallback(async () => {
    if (sessionCompletedRef.current) return;
    sessionCompletedRef.current = true;
    setIsFinished(true);

    const activeSessionId =
      sessionId ?? (await sessionInitRef.current?.then((s) => s.id).catch(() => null));
    if (activeSessionId) {
      try {
        await api.completePracticeSession(activeSessionId, {
          durationSeconds: elapsedSeconds,
          completedItems: completedCount,
          correctCount,
        });
      } catch {
        // Summary remains visible
      }
    }

    queryClient.invalidateQueries({ queryKey: ['practice-history'] });
    queryClient.invalidateQueries({ queryKey: ['daily-review'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
    queryClient.invalidateQueries({ queryKey: ['grammar-topic'] });
  }, [completedCount, correctCount, elapsedSeconds, queryClient, sessionId]);

  const handleNext = useCallback(async () => {
    if (currentIndex + 1 >= questions.length) {
      await finalizeSession();
    } else {
      setCurrentIndex((prev) => prev + 1);
      resetQuestionState();
    }
  }, [currentIndex, finalizeSession, questions.length, resetQuestionState]);

  const handleSaveMistake = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentQuestion || isSavingMistake) return;
    if (!mistakeOriginal.trim() || !mistakeCorrected.trim()) return;

    setIsSavingMistake(true);
    try {
      await api.createMistake({
        category: mistakeCategory,
        vocabularyId: currentQuestion.vocabularyId,
        grammarTopicId: currentQuestion.grammarTopicId,
        practiceAttemptId: lastAttemptId,
        originalInput: mistakeOriginal.trim(),
        correctedVersion: mistakeCorrected.trim(),
        explanationVi: mistakeExplanation.trim(),
        correctedExample: currentQuestion.correctAnswer,
        sourceContext: title,
      });
      setMistakeSaved(true);
      setMistakeDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ['mistakes'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success('Đã lưu vào Ngân hàng lỗi sai cá nhân');
    } catch (err) {
      showError(
        'Không thể lưu lỗi sai',
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setIsSavingMistake(false);
    }
  };

  // Keyboard shortcuts 1-4 for choice questions when not typing in inputs
  useEffect(() => {
    if (isFinished || !currentQuestion) return;
    const isChoiceType =
      currentQuestion.questionType === 'multiple_choice' ||
      currentQuestion.questionType === 'contextual_selection';
    if (!isChoiceType || hasChecked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (isEditableFocused()) return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (currentQuestion.options[idx]) {
          e.preventDefault();
          setSelectedChoice(currentQuestion.options[idx]);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentQuestion, hasChecked, isFinished]);

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-[680px] py-6">
        <EmptyState
          title="Chưa có câu hỏi ngữ pháp nào"
          description="Hãy tạo thêm câu hỏi trong Ngân hàng câu hỏi hoặc chọn chủ điểm khác."
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
                Hoàn thành bài luyện tập
              </Badge>
              <h2 className="mt-3 text-[22px] font-semibold text-[var(--ink-primary)]">
                {title}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4">
              <div>
                <p className="text-[12px] text-[var(--ink-muted)]">Độ chính xác</p>
                <p className="mt-1 text-[22px] font-semibold text-[var(--accent)]">
                  {accuracyPercent}%
                </p>
              </div>
              <div>
                <p className="text-[12px] text-[var(--ink-muted)]">Số câu đúng</p>
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
              Kết quả và lịch ôn SM-2 cho các chủ điểm ngữ pháp liên quan đã được cập nhật.
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

  const qType = currentQuestion.questionType;
  const isLongTextType =
    qType === 'sentence_transformation' ||
    qType === 'vi_to_en' ||
    qType === 'en_to_vi' ||
    qType === 'sentence_correction' ||
    qType === 'phrase_conjugation';

  return (
    <div className="mx-auto max-w-[680px] space-y-4 py-2">
      {/* Top Runner Header */}
      <div className="space-y-2.5 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{GRAMMAR_QUESTION_TYPE_LABELS[qType]}</Badge>
            <span className="text-[13px] font-medium text-[var(--ink-primary)]">
              Câu {currentIndex + 1} / {questions.length}
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
                    await finalizeSession();
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
          max={questions.length}
          aria-label="Tiến độ bài tập ngữ pháp"
          className="h-2 w-full accent-[var(--accent)]"
        />
      </div>

      {/* Question Card */}
      <Card elevated>
        <CardContent className="space-y-5 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{GRAMMAR_DIFFICULTY_LABELS[currentQuestion.difficulty]}</Badge>
            {currentQuestion.grammarTopicTitle && (
              <Badge tone="info">{currentQuestion.grammarTopicTitle}</Badge>
            )}
          </div>

          <div>
            {currentQuestion.promptVi && (
              <p className="mb-1.5 text-[13px] font-medium text-[var(--ink-secondary)]">
                {currentQuestion.promptVi}
              </p>
            )}
            <h2 className="text-[18px] font-semibold leading-[1.5] text-[var(--ink-primary)]">
              {currentQuestion.prompt}
            </h2>
          </div>

          {/* 1 & 9: multiple_choice & contextual_selection */}
          {(qType === 'multiple_choice' || qType === 'contextual_selection') && (
            <fieldset className="space-y-2.5" disabled={hasChecked}>
              <legend className="sr-only">Chọn một đáp án đúng</legend>
              {currentQuestion.options.map((opt, idx) => {
                const isSelected = selectedChoice === opt;
                const isAnswerOption =
                  normalizeGrammarAnswer(opt) ===
                  normalizeGrammarAnswer(currentQuestion.correctAnswer);

                return (
                  <label
                    key={`${opt}-${idx}`}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[8px] border px-4 py-3 text-[14px] transition-colors cursor-pointer',
                      hasChecked && 'cursor-default',
                      !hasChecked &&
                        isSelected &&
                        'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-primary)] font-medium',
                      !hasChecked &&
                        !isSelected &&
                        'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-canvas)]',
                      hasChecked &&
                        isAnswerOption &&
                        'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)] font-medium',
                      hasChecked &&
                        isSelected &&
                        !isAnswerOption &&
                        'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-ink)]',
                    )}
                  >
                    <input
                      type="radio"
                      name={`grammar-q-${currentQuestion.id}`}
                      value={opt}
                      checked={isSelected}
                      onChange={() => setSelectedChoice(opt)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-canvas)] text-[11px] font-semibold text-[var(--ink-muted)]">
                      {idx + 1}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </label>
                );
              })}
            </fieldset>
          )}

          {/* 3: error_identification */}
          {qType === 'error_identification' && (
            <div className="space-y-2.5">
              <p className="text-[13px] font-medium text-[var(--ink-secondary)]">
                Nhấn chọn từ hoặc cụm từ chứa lỗi sai:
              </p>
              <div className="flex flex-wrap gap-2">
                {errorSegments.map((seg, idx) => {
                  const isSelected = selectedChoice === seg;
                  const isAnswer =
                    normalizeGrammarAnswer(seg) ===
                    normalizeGrammarAnswer(currentQuestion.correctAnswer);

                  return (
                    <button
                      key={`${seg}-${idx}`}
                      type="button"
                      disabled={hasChecked}
                      onClick={() => setSelectedChoice(seg)}
                      className={cn(
                        'rounded-[8px] border px-3.5 py-2 text-[14px] font-medium transition-colors cursor-pointer disabled:cursor-default',
                        !hasChecked &&
                          isSelected &&
                          'border-[var(--accent)] bg-[var(--accent)] text-white',
                        !hasChecked &&
                          !isSelected &&
                          'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]',
                        hasChecked &&
                          isAnswer &&
                          'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-ink)]',
                        hasChecked &&
                          isSelected &&
                          !isAnswer &&
                          'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-ink)]',
                      )}
                    >
                      {seg}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6: word_ordering */}
          {qType === 'word_ordering' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[var(--ink-secondary)]">
                  {useTypedOrdering
                    ? 'Nhập câu đã sắp xếp:'
                    : 'Nhấn các mảnh từ để ghép câu hoàn chỉnh:'}
                </span>
                <div className="flex items-center gap-2">
                  {!hasChecked && !useTypedOrdering && placedTileIds.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={() => setPlacedTileIds([])}
                    >
                      Đặt lại
                    </Button>
                  )}
                  {!hasChecked && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (!useTypedOrdering && assembledSentence) {
                          setTypedAnswer(assembledSentence);
                        }
                        setUseTypedOrdering((v) => !v);
                      }}
                    >
                      {useTypedOrdering ? 'Dùng thẻ từ' : 'Gõ trực tiếp'}
                    </Button>
                  )}
                </div>
              </div>

              {useTypedOrdering ? (
                <Input
                  aria-label="Câu đã sắp xếp"
                  value={typedAnswer}
                  disabled={hasChecked}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  onKeyDown={onImeSafeEnter(handleCheckAnswer)}
                  placeholder="Nhập câu hoàn chỉnh..."
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              ) : (
                <>
                  {/* Assembled answer zone */}
                  <div className="min-h-14 rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)] p-3">
                    {placedTileIds.length === 0 ? (
                      <p className="text-[13px] text-[var(--ink-muted)]">
                        Chạm các từ bên dưới để đưa vào đây theo đúng thứ tự...
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {placedTileIds.map((tileId) => {
                          const tile = scrambledTiles.find((t) => t.id === tileId);
                          if (!tile) return null;
                          return (
                            <button
                              key={tileId}
                              type="button"
                              disabled={hasChecked}
                              onClick={() =>
                                setPlacedTileIds((prev) => prev.filter((id) => id !== tileId))
                              }
                              className="rounded-[6px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 text-[14px] font-medium text-[var(--accent)] hover:bg-[#CCFBF1] cursor-pointer disabled:cursor-default"
                            >
                              {tile.text}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Available bank */}
                  <div className="flex flex-wrap gap-2">
                    {scrambledTiles.map((tile) => {
                      const isUsed = placedTileIds.includes(tile.id);
                      return (
                        <button
                          key={tile.id}
                          type="button"
                          disabled={hasChecked || isUsed}
                          onClick={() => setPlacedTileIds((prev) => [...prev, tile.id])}
                          className={cn(
                            'rounded-[6px] border px-3 py-1.5 text-[14px] font-medium transition-colors cursor-pointer disabled:cursor-default',
                            isUsed
                              ? 'border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)] opacity-40'
                              : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50',
                          )}
                        >
                          {tile.text}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 2 & 5: fill_in_blank & sentence_completion */}
          {(qType === 'fill_in_blank' || qType === 'sentence_completion') && (
            <Input
              label="Nhập phần điền vào chỗ trống"
              value={typedAnswer}
              disabled={hasChecked}
              onChange={(e) => setTypedAnswer(e.target.value)}
              onKeyDown={onImeSafeEnter(handleCheckAnswer)}
              placeholder="Gõ đáp án rồi nhấn Enter..."
              autoFocus
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
            />
          )}

          {/* 7b: phrase_conjugation (Ghép cụm từ & Chia thì thành câu) */}
          {qType === 'phrase_conjugation' && phraseFragments.length > 0 && (
            <div className="space-y-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-medium text-[var(--ink-secondary)]">
                  Mảnh gợi ý (nhấn để chèn xuống ô bên dưới, phần màu vàng cần chia thì):
                </p>
                {!hasChecked && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setTypedAnswer(phraseFragments.map((f) => f.insertText).join(' '))
                      }
                    >
                      Chèn tất cả
                    </Button>
                    {typedAnswer.trim() ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setTypedAnswer('')}
                      >
                        Xóa nháp
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {phraseFragments.map((frag) => (
                  <button
                    key={frag.id}
                    type="button"
                    disabled={hasChecked}
                    onClick={() =>
                      setTypedAnswer((prev) =>
                        prev.trim()
                          ? `${prev.replace(/\s+$/, '')} ${frag.insertText} `
                          : `${frag.insertText} `,
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-[8px] border px-3 py-1.5 text-[13.5px] font-medium transition-colors cursor-pointer disabled:cursor-default',
                      frag.needsConjugation
                        ? 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-ink)] hover:bg-[#FEF3C7]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/50',
                    )}
                  >
                    <span>{frag.text}</span>
                    {frag.needsConjugation ? (
                      <span className="rounded bg-white/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        Chia thì
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4, 7, 8, 10, 11: sentence_transformation, vi_to_en, en_to_vi, sentence_correction, phrase_conjugation */}
          {isLongTextType && (
            <Textarea
              label="Câu trả lời của bạn"
              hint={
                qType === 'en_to_vi'
                  ? 'Dịch sang tiếng Việt tự nhiên'
                  : qType === 'phrase_conjugation'
                    ? 'Ghép các cụm từ, chia đúng thì và viết thành câu hoàn chỉnh (Ctrl/⌘ + Enter để kiểm tra)'
                    : 'Nhấn Ctrl/⌘ + Enter hoặc nút Kiểm tra đáp án'
              }
              rows={3}
              value={typedAnswer}
              disabled={hasChecked}
              onChange={(e) => setTypedAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isImeComposing(e)) {
                  e.preventDefault();
                  handleCheckAnswer();
                }
              }}
              placeholder="Nhập câu hoàn chỉnh..."
              autoFocus
              autoCorrect={qType === 'en_to_vi' ? 'on' : 'off'}
              spellCheck={qType === 'en_to_vi'}
            />
          )}

          {/* Action button before check */}
          {!hasChecked && (
            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                disabled={!canCheck}
                onClick={handleCheckAnswer}
              >
                Kiểm tra đáp án
              </Button>
            </div>
          )}

          {/* Post-check Feedback */}
          {hasChecked && (
            <div className="space-y-4 border-t border-[var(--border-hairline)] pt-5">
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
                  <span>{isCurrentCorrect ? 'Chính xác!' : 'Chưa đúng rồi'}</span>
                </div>

                <p className="mt-1.5 text-[14px] text-[var(--ink-primary)]">
                  Đáp án chuẩn:{' '}
                  <strong className="font-semibold">{currentQuestion.correctAnswer}</strong>
                </p>

                {currentQuestion.acceptableAnswers.length > 1 && (
                  <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                    Cũng chấp nhận:{' '}
                    {currentQuestion.acceptableAnswers
                      .filter((a) => a !== currentQuestion.correctAnswer)
                      .join(' · ')}
                  </p>
                )}
              </div>

              {currentQuestion.explanationVi && (
                <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5 text-[13px] leading-[1.6] text-[var(--ink-secondary)]">
                  <p className="font-medium text-[var(--ink-primary)]">Giải thích chi tiết</p>
                  <p className="mt-1 whitespace-pre-line">{currentQuestion.explanationVi}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {currentQuestion.grammarTopicId && (
                    <Link
                      to={`/grammar/${currentQuestion.grammarTopicId}`}
                      className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                    >
                      <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
                      {currentQuestion.grammarTopicTitle || 'Xem bài học ngữ pháp'}
                    </Link>
                  )}

                  {!mistakeSaved ? (
                    <Button
                      size="sm"
                      variant={!isCurrentCorrect ? 'secondary' : 'ghost'}
                      leftIcon={<BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={() => setMistakeDrawerOpen((v) => !v)}
                    >
                      Lưu vào Ngân hàng lỗi sai
                    </Button>
                  ) : (
                    <Badge tone="success" size="md">
                      Đã lưu vào Ngân hàng lỗi sai ✓
                    </Badge>
                  )}
                </div>

                <Button
                  variant="primary"
                  rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  onClick={handleNext}
                >
                  {currentIndex + 1 >= questions.length ? 'Xem tổng kết' : 'Câu tiếp theo'}
                </Button>
              </div>

              {/* Inline Mistake Bank Save Form */}
              {mistakeDrawerOpen && !mistakeSaved && (
                <form
                  onSubmit={handleSaveMistake}
                  className="space-y-3 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-[var(--ink-primary)]">
                      Lưu vào Ngân hàng lỗi sai cá nhân
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMistakeDrawerOpen(false)}
                    >
                      Đóng
                    </Button>
                  </div>

                  <Select
                    label="Nhóm lỗi"
                    value={mistakeCategory}
                    onChange={(e) => setMistakeCategory(e.target.value as MistakeCategory)}
                    options={MISTAKE_CATEGORIES.map((cat) => ({
                      value: cat,
                      label: MISTAKE_CATEGORY_LABELS[cat],
                    }))}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Câu / đáp án sai"
                      required
                      value={mistakeOriginal}
                      onChange={(e) => setMistakeOriginal(e.target.value)}
                    />
                    <Input
                      label="Cách sửa đúng"
                      required
                      value={mistakeCorrected}
                      onChange={(e) => setMistakeCorrected(e.target.value)}
                    />
                  </div>

                  <Textarea
                    label="Giải thích ngắn để nhớ"
                    rows={2}
                    value={mistakeExplanation}
                    onChange={(e) => setMistakeExplanation(e.target.value)}
                  />

                  <div className="flex justify-end gap-2">
                    <Button type="submit" variant="primary" size="sm" loading={isSavingMistake}>
                      Lưu lỗi sai
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
