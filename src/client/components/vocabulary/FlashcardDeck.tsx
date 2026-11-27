import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ExternalLink,
  Lightbulb,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Shuffle,
  Star,
  Undo2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SkillDirection, VocabularyListItemDto } from '@shared/apiTypes';
import { PART_OF_SPEECH_OPTIONS, VOCAB_STATUS_LABELS } from '@shared/schemas';
import { api } from '@client/lib/api';
import { isImeComposing } from '@client/lib/ime';
import {
  cn,
  hasOpenDialog,
  highlightTargetWord,
  isEditableFocused,
  isOtherInteractiveFocused,
} from '@client/lib/utils';
import { Badge } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { useToast } from '@client/components/ui/Toast';

export interface FlashcardDeckProps {
  items: VocabularyListItemDto[];
  collectionTitle?: string;
  onToggleFavorite: (item: VocabularyListItemDto) => void;
}

interface DecisionEntry {
  index: number;
  vocabId: string;
  outcome: 'known' | 'learning';
}

const POS_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PART_OF_SPEECH_OPTIONS.map((o) => [o.value, o.label]),
);

function buildFirstLetterHint(item: VocabularyListItemDto, direction: SkillDirection): string {
  if (direction === 'vi_to_en') {
    const letters = item.word
      .split(/\s+/)
      .map((part) => {
        if (part.length <= 1) return part;
        return `${part[0]}${'_'.repeat(Math.min(part.length - 1, 7))}`;
      })
      .join(' ');
    return item.ipa ? `${letters}  ·  ${item.ipa}` : letters;
  }

  if (item.englishDefinition) {
    return item.englishDefinition;
  }
  const pos = POS_LABEL_MAP[item.partOfSpeech] ?? item.partOfSpeech;
  return item.ipa ? `${pos} · ${item.ipa}` : pos;
}

function shuffleItems<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Quizlet-style interactive 3D flashcard deck with vertical rotateX flip,
 * Still Learning / Know sorting, Undo, Shuffle, Autoplay, Hint, and SM-2 sync.
 */
export function FlashcardDeck({
  items,
  collectionTitle,
  onToggleFavorite,
}: FlashcardDeckProps) {
  const queryClient = useQueryClient();
  const { error: showError } = useToast();

  // Deck ordering & subset round state
  const [deckOrderIds, setDeckOrderIds] = useState<string[]>(() => items.map((i) => i.id));
  const [isShuffled, setIsShuffled] = useState(false);
  const [direction, setDirection] = useState<'en_to_vi' | 'vi_to_en'>('en_to_vi');
  const [trackProgress, setTrackProgress] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [autoplay, setAutoplay] = useState(false);

  // Per-round progress state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [knownIds, setKnownIds] = useState<Set<string>>(() => new Set());
  const [learningIds, setLearningIds] = useState<Set<string>>(() => new Set());
  const [history, setHistory] = useState<DecisionEntry[]>([]);
  const [roundComplete, setRoundComplete] = useState(false);
  const [roundNumber, setRoundNumber] = useState(1);

  // Real DB practice session tracking for SM-2 persistence
  const sessionIdRef = useRef<string | null>(null);
  const sessionInitPromiseRef = useRef<Promise<string | null> | null>(null);
  const cardStartRef = useRef<number>(Date.now());
  const roundStartRef = useRef<number>(Date.now());
  const sessionCompletedRef = useRef(false);
  const roundRevisionRef = useRef(0);
  const cardButtonRef = useRef<HTMLDivElement | null>(null);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const itemsSignature = useMemo(() => items.map((i) => i.id).join('|'), [items]);

  // Reset deck cleanly when external filter changes the available card set
  useEffect(() => {
    const baseIds = items.map((i) => i.id);
    setDeckOrderIds(isShuffled ? shuffleItems(baseIds) : baseIds);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setKnownIds(new Set());
    setLearningIds(new Set());
    setHistory([]);
    setRoundComplete(false);
    setRoundNumber(1);
    setAutoplay(false);
    sessionIdRef.current = null;
    sessionInitPromiseRef.current = null;
    sessionCompletedRef.current = false;
    roundRevisionRef.current += 1;
    cardStartRef.current = Date.now();
    roundStartRef.current = Date.now();
  }, [itemsSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const deckCards = useMemo(() => {
    return deckOrderIds
      .map((id) => itemsById.get(id))
      .filter((item): item is VocabularyListItemDto => Boolean(item));
  }, [deckOrderIds, itemsById]);

  const currentCard = deckCards[currentIndex] ?? null;

  // Lazy-fetch rich details (examples, collocations, Vietnamese notes) for current card
  const detailQuery = useQuery({
    queryKey: ['vocabulary', 'detail', currentCard?.id ?? 'none'],
    queryFn: () => api.getVocabulary(currentCard!.id),
    enabled: Boolean(currentCard?.id),
    staleTime: 60_000,
  });

  const ensurePracticeSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (sessionInitPromiseRef.current) return sessionInitPromiseRef.current;

    sessionInitPromiseRef.current = api
      .createPracticeSession({
        domain: 'vocabulary',
        mode: 'flashcard',
        title: collectionTitle
          ? `Flashcard: ${collectionTitle} (Vòng ${roundNumber})`
          : `Flashcard từ vựng (Vòng ${roundNumber})`,
        totalItems: deckCards.length || 1,
      })
      .then((sess) => {
        sessionIdRef.current = sess.id;
        return sess.id;
      })
      .catch(() => null);

    return sessionInitPromiseRef.current;
  }, [collectionTitle, deckCards.length, roundNumber]);

  const finalizeDbSession = useCallback(
    async (finalKnownCount: number, totalCompleted: number) => {
      const sid =
        sessionIdRef.current ??
        (sessionInitPromiseRef.current ? await sessionInitPromiseRef.current : null);
      if (!sid || sessionCompletedRef.current) return;
      sessionCompletedRef.current = true;
      const durationSeconds = Math.max(1, Math.round((Date.now() - roundStartRef.current) / 1000));
      try {
        await api.completePracticeSession(sid, {
          durationSeconds,
          completedItems: totalCompleted,
          correctCount: finalKnownCount,
        });
        queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
        queryClient.invalidateQueries({ queryKey: ['daily-review'] });
        queryClient.invalidateQueries({ queryKey: ['analytics'] });
        queryClient.invalidateQueries({ queryKey: ['practice-history'] });
      } catch {
        sessionCompletedRef.current = false;
      }
    },
    [queryClient],
  );

  const advanceTo = useCallback((nextIdx: number) => {
    setIsFlipped(false);
    setShowHint(false);
    setCurrentIndex(nextIdx);
    cardStartRef.current = Date.now();
  }, []);

  const recordOutcome = useCallback(
    async (outcome: 'known' | 'learning', explicitRating?: 1 | 2 | 3 | 4) => {
      if (!currentCard || roundComplete) return;
      setAutoplay(false);

      const nextKnown = new Set(knownIds);
      const nextLearning = new Set(learningIds);
      if (outcome === 'known') {
        nextKnown.add(currentCard.id);
        nextLearning.delete(currentCard.id);
      } else {
        nextLearning.add(currentCard.id);
        nextKnown.delete(currentCard.id);
      }

      setKnownIds(nextKnown);
      setLearningIds(nextLearning);
      setHistory((prev) => [
        ...prev,
        { index: currentIndex, vocabId: currentCard.id, outcome },
      ]);

      const rating: 1 | 2 | 3 | 4 = explicitRating ?? (outcome === 'known' ? 3 : 1);
      const isCorrect = outcome === 'known';
      const responseTimeMs = Math.max(0, Date.now() - cardStartRef.current);
      const isLastCard = currentIndex + 1 >= deckCards.length;
      const opRevision = roundRevisionRef.current;

      // Persist SM-2 rating asynchronously without blocking card snap
      void (async () => {
        try {
          const sid = await ensurePracticeSession();
          if (sid) {
            await api.recordPracticeAttempt(sid, {
              vocabularyId: currentCard.id,
              mode: 'flashcard',
              direction,
              userAnswer: isCorrect ? 'Đã thuộc' : 'Đang học',
              expectedAnswer:
                direction === 'en_to_vi' ? currentCard.vietnameseMeaning : currentCard.word,
              isCorrect,
              selfRating: rating,
              responseTimeMs,
            });
          }
          if (isLastCard && roundRevisionRef.current === opRevision) {
            await finalizeDbSession(nextKnown.size, deckCards.length);
          }
        } catch (err) {
          showError(
            'Không thể lưu tiến độ thẻ vào lịch ôn tập',
            err instanceof Error ? err.message : undefined,
          );
        }
      })();

      if (isLastCard) {
        setRoundComplete(true);
        setIsFlipped(false);
      } else {
        advanceTo(currentIndex + 1);
      }
    },
    [
      advanceTo,
      currentCard,
      currentIndex,
      deckCards.length,
      direction,
      ensurePracticeSession,
      finalizeDbSession,
      knownIds,
      learningIds,
      roundComplete,
      showError,
    ],
  );

  const handleBrowseStep = useCallback(
    (delta: -1 | 1) => {
      if (deckCards.length === 0) return;
      const next = currentIndex + delta;
      if (next < 0) return;
      if (next >= deckCards.length) {
        setRoundComplete(true);
        return;
      }
      advanceTo(next);
    },
    [advanceTo, currentIndex, deckCards.length],
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    setAutoplay(false);
    const last = history[history.length - 1];
    const remaining = history.slice(0, -1);

    const rebuiltKnown = new Set<string>();
    const rebuiltLearning = new Set<string>();
    for (const entry of remaining) {
      if (entry.outcome === 'known') {
        rebuiltKnown.add(entry.vocabId);
        rebuiltLearning.delete(entry.vocabId);
      } else {
        rebuiltLearning.add(entry.vocabId);
        rebuiltKnown.delete(entry.vocabId);
      }
    }

    setHistory(remaining);
    setKnownIds(rebuiltKnown);
    setLearningIds(rebuiltLearning);
    setRoundComplete(false);
    setIsFlipped(false);
    setShowHint(false);
    setCurrentIndex(last.index);
    sessionCompletedRef.current = false;
    roundRevisionRef.current += 1;
    cardStartRef.current = Date.now();
  }, [history]);

  const handleToggleShuffle = useCallback(() => {
    setAutoplay(false);
    const activeIds = deckCards.map((c) => c.id);
    if (!isShuffled) {
      setDeckOrderIds(shuffleItems(activeIds));
      setIsShuffled(true);
    } else {
      const currentSet = new Set(activeIds);
      setDeckOrderIds(items.map((i) => i.id).filter((id) => currentSet.has(id)));
      setIsShuffled(false);
    }
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setKnownIds(new Set());
    setLearningIds(new Set());
    setHistory([]);
    setRoundComplete(false);
    sessionIdRef.current = null;
    sessionInitPromiseRef.current = null;
    sessionCompletedRef.current = false;
    roundRevisionRef.current += 1;
    cardStartRef.current = Date.now();
    roundStartRef.current = Date.now();
  }, [deckCards, isShuffled, items]);

  const startSubsetRound = useCallback(
    (mode: 'learning_only' | 'all') => {
      setAutoplay(false);
      const nextIds =
        mode === 'learning_only'
          ? deckOrderIds.filter((id) => learningIds.has(id))
          : items.map((i) => i.id);
      const ordered = isShuffled ? shuffleItems(nextIds) : nextIds;
      setDeckOrderIds(ordered);
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowHint(false);
      setKnownIds(new Set());
      setLearningIds(new Set());
      setHistory([]);
      setRoundComplete(false);
      setRoundNumber((r) => (mode === 'learning_only' ? r + 1 : 1));
      sessionIdRef.current = null;
      sessionInitPromiseRef.current = null;
      sessionCompletedRef.current = false;
      roundRevisionRef.current += 1;
      cardStartRef.current = Date.now();
      roundStartRef.current = Date.now();
    },
    [deckOrderIds, isShuffled, items, learningIds],
  );

  // Autoplay timer (Quizlet Play mode)
  useEffect(() => {
    if (!autoplay || roundComplete || !currentCard) return;
    const delay = isFlipped ? 3400 : 2800;
    const timer = window.setTimeout(() => {
      if (!isFlipped) {
        setIsFlipped(true);
      } else if (currentIndex + 1 < deckCards.length) {
        advanceTo(currentIndex + 1);
      } else {
        setAutoplay(false);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [advanceTo, autoplay, currentCard, currentIndex, deckCards.length, isFlipped, roundComplete]);

  // Quizlet Keyboard Shortcuts (Space, Arrows, 1/2, H, S, Z, Esc in focus mode)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (hasOpenDialog()) return;
      if (isEditableFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Escape' && focusMode) {
        e.preventDefault();
        setFocusMode(false);
        return;
      }

      if (e.key.toLowerCase() === 'z' && history.length > 0) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (roundComplete || !currentCard) return;

      if (e.code === 'Space') {
        if (isOtherInteractiveFocused(cardButtonRef.current)) return;
        e.preventDefault();
        setAutoplay(false);
        setIsFlipped((v) => !v);
        return;
      }

      if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setShowHint((v) => !v);
        return;
      }

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        onToggleFavorite(currentCard);
        return;
      }

      if (trackProgress) {
        if (e.key === 'ArrowLeft' || e.key === '1') {
          e.preventDefault();
          void recordOutcome('learning', 1);
        } else if (e.key === 'ArrowRight' || e.key === '2') {
          e.preventDefault();
          void recordOutcome('known', 3);
        }
      } else {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleBrowseStep(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleBrowseStep(1);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentCard,
    focusMode,
    handleBrowseStep,
    handleUndo,
    history.length,
    onToggleFavorite,
    recordOutcome,
    roundComplete,
    trackProgress,
  ]);

  if (deckCards.length === 0) {
    return null;
  }

  const detail = detailQuery.data;
  const firstExample = detail?.examples?.[0] ?? null;
  const firstCollocation = detail?.collocations?.[0] ?? null;

  const frontMainText = currentCard
    ? direction === 'en_to_vi'
      ? currentCard.word
      : currentCard.vietnameseMeaning || '(Chưa có nghĩa tiếng Việt)'
    : '';

  const backMainText = currentCard
    ? direction === 'en_to_vi'
      ? currentCard.vietnameseMeaning || '(Chưa có nghĩa tiếng Việt)'
      : currentCard.word
    : '';

  const deckBody = (
    <div className={cn('mx-auto w-full space-y-4', focusMode ? 'max-w-[780px]' : 'max-w-[760px]')}>
      {/* Top Progress Strip */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {trackProgress ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-1 text-[12.5px] font-medium text-[var(--warning-ink)]">
              <span>{learningIds.size}</span>
              <span>Đang học</span>
            </div>
          ) : (
            <span className="text-[12.5px] text-[var(--ink-muted)]">
              Chế độ xem thẻ tự do
            </span>
          )}

          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink-secondary)]">
            {roundNumber > 1 ? (
              <Badge tone="warning" size="sm">
                Vòng {roundNumber} · Thẻ còn đang học
              </Badge>
            ) : null}
            <span>
              {roundComplete ? deckCards.length : currentIndex + 1} / {deckCards.length}
            </span>
          </div>

          {trackProgress ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--success-border)] bg-[var(--success-soft)] px-3 py-1 text-[12.5px] font-medium text-[var(--success-ink)]">
              <span>{knownIds.size}</span>
              <span>Đã thuộc</span>
            </div>
          ) : (
            <span className="text-[12.5px] text-[var(--ink-muted)]">
              {direction === 'en_to_vi' ? 'Anh → Việt' : 'Việt → Anh'}
            </span>
          )}
        </div>

        <progress
          value={roundComplete ? deckCards.length : currentIndex}
          max={deckCards.length}
          aria-label="Tiến độ lượt học flashcard"
          className="h-1.5 w-full accent-[var(--accent)]"
        />
      </div>

      {/* Round Complete Screen (Quizlet style) */}
      {roundComplete ? (
        <Card elevated>
          <CardContent className="space-y-6 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success-ink)]">
              <Check className="h-6 w-6" aria-hidden="true" />
            </div>

            <div>
              <h2 className="text-[22px] font-semibold text-[var(--ink-primary)]">
                {!trackProgress
                  ? 'Hoàn thành lượt xem thẻ'
                  : learningIds.size === 0
                    ? 'Tuyệt vời! Bạn đã nắm hết các thẻ trong lượt này'
                    : `Hoàn thành lượt học · Còn ${learningIds.size} thẻ cần ôn tiếp`}
              </h2>
              <p className="mt-1 text-[13.5px] text-[var(--ink-secondary)]">
                {trackProgress
                  ? 'Kết quả đã được đồng bộ vào lịch ôn tập ngắt quãng SM-2 hai chiều.'
                  : 'Bạn đã xem hết tất cả các thẻ trong lượt này (chế độ xem tự do, không ghi đè lịch SM-2).'}
              </p>
            </div>

            {trackProgress ? (
              <div className="mx-auto grid max-w-md grid-cols-2 gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4">
                <div>
                  <p className="text-[12px] text-[var(--ink-muted)]">Đã thuộc</p>
                  <p className="mt-1 text-[24px] font-semibold text-[var(--success-ink)]">
                    {knownIds.size}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-[var(--ink-muted)]">Đang học</p>
                  <p className="mt-1 text-[24px] font-semibold text-[var(--warning-ink)]">
                    {learningIds.size}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-3">
              {learningIds.size > 0 ? (
                <Button
                  variant="primary"
                  size="lg"
                  leftIcon={<RotateCw className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => startSubsetRound('learning_only')}
                >
                  Học tiếp {learningIds.size} thẻ còn đang học
                </Button>
              ) : null}
              <Button
                variant={learningIds.size > 0 ? 'secondary' : 'primary'}
                size="lg"
                leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
                onClick={() => startSubsetRound('all')}
              >
                Học lại toàn bộ ({items.length} thẻ)
              </Button>
              {history.length > 0 ? (
                <Button
                  variant="ghost"
                  size="md"
                  leftIcon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
                  onClick={handleUndo}
                >
                  Quay lại thẻ cuối
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : currentCard ? (
        <>
          {/* 3D Flip Card Stage */}
          <div className="flashcard-scene">
            <div
              ref={cardButtonRef}
              role="button"
              tabIndex={0}
              aria-pressed={isFlipped}
              aria-label={
                isFlipped
                  ? `Mặt sau của thẻ ${currentCard.word}. Nhấn để lật lại mặt trước`
                  : `Mặt trước của thẻ ${currentCard.word}. Nhấn để lật xem đáp án`
              }
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button, a')) return;
                setAutoplay(false);
                setIsFlipped((v) => !v);
              }}
              onKeyDown={(e) => {
                if (isImeComposing(e)) return;
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setAutoplay(false);
                  setIsFlipped((v) => !v);
                }
              }}
              className={cn(
                'flashcard-card cursor-pointer rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]',
                isFlipped && 'is-flipped',
              )}
            >
              {/* FRONT FACE */}
              <div className="flashcard-face flex min-h-[330px] flex-col justify-between rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[0_2px_10px_rgba(28,25,23,0.05)] sm:min-h-[360px] sm:p-7">
                {/* Top Card Chrome */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      {direction === 'en_to_vi' ? 'Thuật ngữ (EN)' : 'Nghĩa tiếng Việt'}
                    </span>
                    {currentCard.cefrLevel !== 'unknown' ? (
                      <Badge tone="info" size="sm">
                        {currentCard.cefrLevel}
                      </Badge>
                    ) : null}
                    {currentCard.partOfSpeech && currentCard.partOfSpeech !== 'other' ? (
                      <Badge tone="neutral" size="sm">
                        {currentCard.partOfSpeech}
                      </Badge>
                    ) : null}
                    {currentCard.isFavorite ? null : null}
                  </div>

                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setShowHint((v) => !v)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer',
                        showHint
                          ? 'bg-[var(--warning-soft)] text-[var(--warning-ink)]'
                          : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]',
                      )}
                      aria-label="Hiện gợi ý (phím H)"
                    >
                      <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Gợi ý</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleFavorite(currentCard)}
                      aria-label={
                        currentCard.isFavorite
                          ? `Bỏ đánh dấu sao từ ${currentCard.word}`
                          : `Đánh dấu sao từ ${currentCard.word}`
                      }
                      aria-pressed={currentCard.isFavorite}
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors cursor-pointer',
                        currentCard.isFavorite
                          ? 'text-[#D97706] hover:bg-[var(--warning-soft)]'
                          : 'text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
                      )}
                    >
                      <Star
                        className={cn('h-4 w-4', currentCard.isFavorite && 'fill-current')}
                        aria-hidden="true"
                      />
                    </button>

                    <Link
                      to={`/vocabulary/${currentCard.id}`}
                      aria-label={`Xem chi tiết từ ${currentCard.word}`}
                      className="inline-flex h-8 items-center gap-1 rounded-[8px] px-2 text-[12px] font-medium text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                {/* Front Center Content */}
                <div className="my-auto flex flex-col items-center justify-center py-6 text-center">
                  <p
                    className={cn(
                      'font-semibold tracking-tight text-[var(--ink-primary)]',
                      direction === 'en_to_vi'
                        ? 'text-[30px] sm:text-[36px]'
                        : 'text-[22px] sm:text-[26px] leading-[1.4]',
                    )}
                  >
                    {frontMainText}
                  </p>

                  {direction === 'en_to_vi' && currentCard.ipa ? (
                    <p className="ipa mt-2 text-[16px] text-[var(--ink-muted)]">
                      {currentCard.ipa}
                    </p>
                  ) : null}

                  {showHint ? (
                    <div className="mt-4 max-w-md rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3.5 py-2 text-[13px] text-[var(--warning-ink)]">
                      <span className="font-medium">Gợi ý: </span>
                      <span className={direction === 'vi_to_en' ? 'ipa' : ''}>
                        {buildFirstLetterHint(currentCard, direction)}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Front Footer */}
                <div className="flex items-center justify-between text-[12px] text-[var(--ink-muted)]">
                  <span>{VOCAB_STATUS_LABELS[currentCard.status]}</span>
                  <span>Nhấn vào thẻ hoặc Space để lật</span>
                </div>
              </div>

              {/* BACK FACE */}
              <div className="flashcard-face flashcard-face-back flex min-h-[330px] flex-col justify-between rounded-[14px] border border-[var(--accent-border)] bg-[var(--bg-surface)] p-5 shadow-[0_2px_10px_rgba(28,25,23,0.05)] sm:min-h-[360px] sm:p-7">
                {/* Top Back Chrome */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    {direction === 'en_to_vi' ? 'Đáp án · Nghĩa tiếng Việt' : 'Đáp án · Tiếng Anh'}
                  </span>
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(currentCard)}
                      aria-label={
                        currentCard.isFavorite
                          ? `Bỏ đánh dấu sao từ ${currentCard.word}`
                          : `Đánh dấu sao từ ${currentCard.word}`
                      }
                      aria-pressed={currentCard.isFavorite}
                      className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors cursor-pointer',
                        currentCard.isFavorite
                          ? 'text-[#D97706] hover:bg-[var(--warning-soft)]'
                          : 'text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
                      )}
                    >
                      <Star
                        className={cn('h-4 w-4', currentCard.isFavorite && 'fill-current')}
                        aria-hidden="true"
                      />
                    </button>
                    <Link
                      to={`/vocabulary/${currentCard.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                    >
                      <span>Chi tiết 6 mục</span>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>

                {/* Back Answer & Rich Context */}
                <div className="my-auto space-y-3.5 py-4">
                  <div className="text-center">
                    <p
                      className={cn(
                        'font-semibold text-[var(--accent)]',
                        direction === 'vi_to_en'
                          ? 'text-[28px] sm:text-[32px]'
                          : 'text-[22px] sm:text-[25px]',
                      )}
                    >
                      {backMainText}
                    </p>
                    <p className="mt-1 text-[13.5px] text-[var(--ink-secondary)]">
                      <span className="font-medium text-[var(--ink-primary)]">
                        {currentCard.word}
                      </span>
                      {currentCard.ipa ? (
                        <span className="ipa ml-2 text-[var(--ink-muted)]">{currentCard.ipa}</span>
                      ) : null}
                    </p>
                  </div>

                  {currentCard.englishDefinition ? (
                    <p className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2 text-[13.5px] text-[var(--ink-secondary)]">
                      {currentCard.englishDefinition}
                    </p>
                  ) : null}

                  {firstExample ? (
                    <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/55 px-3.5 py-2.5 text-[13.5px]">
                      <p className="font-medium text-[var(--ink-primary)]">
                        “
                        {highlightTargetWord(
                          firstExample.englishSentence,
                          firstExample.highlightText || currentCard.word,
                        ).map((seg, i) =>
                          seg.highlighted ? (
                            <mark
                              key={i}
                              className="rounded bg-[var(--accent-soft)] px-1 font-semibold text-[var(--accent)]"
                            >
                              {seg.text}
                            </mark>
                          ) : (
                            <span key={i}>{seg.text}</span>
                          ),
                        )}
                        ”
                      </p>
                      {firstExample.vietnameseTranslation ? (
                        <p className="mt-1 text-[12.5px] text-[var(--ink-secondary)]">
                          {firstExample.vietnameseTranslation}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {firstCollocation || detail?.vnCommonMistakes ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {firstCollocation ? (
                        <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-[12.5px]">
                          <span className="font-medium text-[var(--ink-muted)]">Collocation: </span>
                          <span className="font-medium text-[var(--ink-primary)]">
                            {firstCollocation.phrase}
                          </span>
                          {firstCollocation.vietnameseMeaning ? (
                            <span className="text-[var(--ink-secondary)]">
                              {' '}
                              — {firstCollocation.vietnameseMeaning}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {detail?.vnCommonMistakes ? (
                        <div className="rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)]/70 px-3 py-2 text-[12.5px] text-[var(--warning-ink)]">
                          <span className="font-semibold">Lưu ý: </span>
                          <span>{detail.vnCommonMistakes}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Back Footer */}
                <div className="flex items-center justify-between text-[12px] text-[var(--ink-muted)]">
                  <span>Nhấn vào thẻ để quay lại mặt trước</span>
                  <span>
                    {trackProgress
                      ? 'Phím 1 / ← Đang học · 2 / → Đã thuộc'
                      : 'Phím ← / → Chuyển thẻ'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quizlet Sorting / Navigation Controls */}
          {trackProgress ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 sm:gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => void recordOutcome('learning', 1)}
                  className="border-[var(--warning-border)] bg-[var(--bg-surface)] text-[var(--warning-ink)] hover:bg-[var(--warning-soft)]"
                  leftIcon={<X className="h-4 w-4" aria-hidden="true" />}
                >
                  <span>Đang học</span>
                  <kbd className="formula ml-1 hidden rounded border border-[var(--warning-border)] px-1.5 py-0.5 text-[11px] sm:inline">
                    ←
                  </kbd>
                </Button>

                <Button
                  variant="ghost"
                  size="md"
                  disabled={history.length === 0}
                  onClick={handleUndo}
                  aria-label="Hoàn tác thẻ vừa phân loại (phím Z)"
                  title="Hoàn tác (Z)"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                </Button>

                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => void recordOutcome('known', 3)}
                  className="border-[var(--success-border)] bg-[var(--bg-surface)] text-[var(--success-ink)] hover:bg-[var(--success-soft)]"
                  rightIcon={
                    <kbd className="formula ml-1 hidden rounded border border-[var(--success-border)] px-1.5 py-0.5 text-[11px] sm:inline">
                      →
                    </kbd>
                  }
                  leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                >
                  <span>Đã thuộc</span>
                </Button>
              </div>

              {isFlipped ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  <span className="mr-1 text-[11.5px] text-[var(--ink-muted)]">
                    Đánh giá chi tiết SM-2:
                  </span>
                  <button
                    type="button"
                    onClick={() => void recordOutcome('learning', 1)}
                    className="rounded-[6px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--danger-ink)] hover:bg-[#FEE2E2] cursor-pointer"
                  >
                    Quên
                  </button>
                  <button
                    type="button"
                    onClick={() => void recordOutcome('learning', 2)}
                    className="rounded-[6px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--warning-ink)] hover:bg-[#FEF3C7] cursor-pointer"
                  >
                    Khó
                  </button>
                  <button
                    type="button"
                    onClick={() => void recordOutcome('known', 3)}
                    className="rounded-[6px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--accent)] hover:bg-[#CCFBF1] cursor-pointer"
                  >
                    Nhớ
                  </button>
                  <button
                    type="button"
                    onClick={() => void recordOutcome('known', 4)}
                    className="rounded-[6px] border border-[var(--success-border)] bg-[var(--success-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--success-ink)] hover:bg-[#DCFCE7] cursor-pointer"
                  >
                    Rất dễ
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                disabled={currentIndex === 0}
                onClick={() => handleBrowseStep(-1)}
                leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              >
                Thẻ trước
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => handleBrowseStep(1)}
                rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                {currentIndex + 1 >= deckCards.length ? 'Kết thúc lượt' : 'Thẻ tiếp theo'}
              </Button>
            </div>
          )}

          {/* Quizlet Utility Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="subtle"
                size="sm"
                leftIcon={<ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => {
                  setIsFlipped(false);
                  setShowHint(false);
                  setDirection((d) => (d === 'en_to_vi' ? 'vi_to_en' : 'en_to_vi'));
                }}
              >
                {direction === 'en_to_vi' ? 'Mặt trước: Anh' : 'Mặt trước: Việt'}
              </Button>

              <Button
                variant={isShuffled ? 'primary' : 'ghost'}
                size="sm"
                leftIcon={<Shuffle className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={handleToggleShuffle}
              >
                Xáo trộn
              </Button>

              <Button
                variant={autoplay ? 'primary' : 'ghost'}
                size="sm"
                leftIcon={
                  autoplay ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )
                }
                onClick={() => setAutoplay((v) => !v)}
              >
                {autoplay ? 'Đang chạy' : 'Tự động lật'}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-1 text-[12.5px] font-medium text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]">
                <input
                  type="checkbox"
                  checked={trackProgress}
                  onChange={(e) => setTrackProgress(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span>Theo dõi tiến độ</span>
              </label>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFocusMode((v) => !v)}
                aria-label={focusMode ? 'Thoát chế độ tập trung' : 'Mở chế độ tập trung'}
                leftIcon={
                  focusMode ? (
                    <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )
                }
              >
                {focusMode ? 'Thu gọn' : 'Tập trung'}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );

  if (focusMode) {
    return (
      <div
        role="region"
        aria-label="Không gian học Flashcard tập trung"
        className="fixed inset-0 z-40 flex flex-col justify-center overflow-y-auto bg-[var(--bg-canvas)] px-4 py-8 sm:px-6"
      >
        <div className="mx-auto mb-4 flex w-full max-w-[780px] items-center justify-between">
          <p className="text-[14px] font-semibold text-[var(--ink-primary)]">
            {collectionTitle ? `Flashcard · ${collectionTitle}` : 'Học Flashcard'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => setFocusMode(false)}
          >
            Thoát tập trung (Esc)
          </Button>
        </div>
        {deckBody}
      </div>
    );
  }

  return deckBody;
}
