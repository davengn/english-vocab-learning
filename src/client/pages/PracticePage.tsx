import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  CheckSquare,
  Dumbbell,
  Edit3,
  History,
  Layers,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  GeneratedVocabQuizItemDto,
  GrammarQuestionType,
  PracticeDomain,
  PracticeHistoryItemDto,
  PracticeQuestionDto,
  PracticeSetDto,
  VocabPracticeMode,
} from '@shared/apiTypes';
import {
  GRAMMAR_DIFFICULTY_LABELS,
  GRAMMAR_QUESTION_TYPES,
  GRAMMAR_QUESTION_TYPE_LABELS,
  VOCAB_PRACTICE_MODES,
  VOCAB_PRACTICE_MODE_LABELS,
} from '@shared/schemas';
import { api } from '@client/lib/api';
import { cn, formatDateVi } from '@client/lib/utils';
import { GrammarPracticeRunner } from '@client/components/practice/GrammarPracticeRunner';
import { QuestionBuilderModal } from '@client/components/practice/QuestionBuilderModal';
import { VocabPracticeRunner } from '@client/components/practice/VocabPracticeRunner';
import { Badge } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { ResponsiveTable, type ResponsiveTableColumn } from '@client/components/ui/ResponsiveTable';
import { Select } from '@client/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/components/ui/Tabs';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';

type PracticeTab = 'vocab' | 'grammar' | 'builder' | 'history';
type VocabSource = 'due' | 'weak' | 'all' | 'collection' | 'session';
type GrammarPickMode = 'topic' | 'set' | 'type';

const VOCAB_MODE_DESCRIPTIONS: Record<VocabPracticeMode, string> = {
  en_to_vi: 'Nhìn từ tiếng Anh, chọn nghĩa tiếng Việt chính xác.',
  vi_to_en: 'Nhìn nghĩa tiếng Việt, nhớ chủ động sang từ tiếng Anh.',
  flashcard: 'Lật thẻ ghi nhớ 2 mặt kèm IPA, ví dụ và tự đánh giá SM-2.',
  fill_in_blank: 'Đọc câu ví dụ khuyết từ và điền đúng từ vào chỗ trống.',
  context_recognition: 'Chọn từ phù hợp nhất dựa trên ngữ cảnh sử dụng thực tế.',
  spelling: 'Nghe/đọc nghĩa + IPA và gõ chính xác từng chữ cái của từ.',
  collocation_match: 'Ghép đúng cụm kết hợp từ (collocation) tự nhiên.',
  sentence_production: 'Tự đặt 1 câu tiếng Anh và đối chiếu với câu mẫu (không AI).',
};

const DOMAIN_LABELS: Record<PracticeDomain, string> = {
  vocabulary: 'Từ vựng',
  grammar: 'Ngữ pháp',
  daily_review: 'Ôn tập hằng ngày',
  mistake_review: 'Sửa lỗi sai',
};

function formatModeLabel(mode: string): string {
  if ((VOCAB_PRACTICE_MODES as readonly string[]).includes(mode)) {
    return VOCAB_PRACTICE_MODE_LABELS[mode as VocabPracticeMode];
  }
  if ((GRAMMAR_QUESTION_TYPES as readonly string[]).includes(mode)) {
    return GRAMMAR_QUESTION_TYPE_LABELS[mode as GrammarQuestionType];
  }
  if (mode === 'mixed_grammar') return 'Ngữ pháp tổng hợp';
  return mode;
}

function formatSecondsCompact(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}p ${s}s` : `${m}p`;
}

/**
 * Unified Practice Hub supporting 8 vocabulary modes, 10 grammar exercise types,
 * question & practice-set builder, and practice history table.
 */
export function PracticePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { success, warning, error: showError } = useToast();

  // Read URL initial params
  const urlTab = searchParams.get('tab');
  const urlMode = searchParams.get('mode');
  const urlSource = searchParams.get('source');
  const urlCollectionId = searchParams.get('collectionId') ?? '';
  const urlSessionId = searchParams.get('sessionId') ?? '';
  const urlVocabId = searchParams.get('vocabId') ?? '';
  const urlTopicId = searchParams.get('topicId') ?? '';
  const urlSetId = searchParams.get('setId') ?? '';
  const urlCategoryId = searchParams.get('categoryId') ?? '';

  const initialTab: PracticeTab =
    urlTab === 'vocab' || urlTab === 'grammar' || urlTab === 'builder' || urlTab === 'history'
      ? urlTab
      : urlTopicId || urlSetId || urlCategoryId
        ? 'grammar'
        : 'vocab';

  const [activeTab, setActiveTab] = useState<PracticeTab>(initialTab);
  const prevSearchRef = useRef<string>(searchParams.toString());

  // Active Runner States
  const [activeVocabSession, setActiveVocabSession] = useState<{
    items: GeneratedVocabQuizItemDto[];
    mode: VocabPracticeMode;
    title: string;
  } | null>(null);

  const [activeGrammarSession, setActiveGrammarSession] = useState<{
    questions: PracticeQuestionDto[];
    title: string;
    domain?: 'grammar' | 'mistake_review' | 'daily_review';
  } | null>(null);

  // Vocab Config State
  const [vocabMode, setVocabMode] = useState<VocabPracticeMode>(() =>
    urlMode && (VOCAB_PRACTICE_MODES as readonly string[]).includes(urlMode)
      ? (urlMode as VocabPracticeMode)
      : 'flashcard',
  );
  const [vocabSource, setVocabSource] = useState<VocabSource>(() => {
    if (urlSource && ['due', 'weak', 'all', 'collection', 'session'].includes(urlSource)) {
      return urlSource as VocabSource;
    }
    if (urlCollectionId) return 'collection';
    if (urlSessionId) return 'session';
    return 'due';
  });
  const [selectedCollectionId, setSelectedCollectionId] = useState(urlCollectionId);
  const [selectedSessionId, setSelectedSessionId] = useState(urlSessionId);
  const [scopedVocabId, setScopedVocabId] = useState(urlVocabId);
  const [vocabLimit, setVocabLimit] = useState<number>(10);
  const [isGeneratingVocab, setIsGeneratingVocab] = useState(false);

  // Grammar Config State
  const [grammarPickMode, setGrammarPickMode] = useState<GrammarPickMode>(() =>
    urlSetId ? 'set' : 'topic',
  );
  const [selectedTopicId, setSelectedTopicId] = useState(urlTopicId);
  const [selectedSetId, setSelectedSetId] = useState(urlSetId);
  const [selectedCategoryId, setSelectedCategoryId] = useState(urlCategoryId);
  const [selectedQuestionType, setSelectedQuestionType] =
    useState<GrammarQuestionType>('multiple_choice');
  const [grammarLimit, setGrammarLimit] = useState<number>(10);
  const [isLaunchingGrammar, setIsLaunchingGrammar] = useState(false);

  // Builder State
  const [builderSearch, setBuilderSearch] = useState('');
  const [builderTopicFilter, setBuilderTopicFilter] = useState('');
  const [builderTypeFilter, setBuilderTypeFilter] = useState('');
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<PracticeQuestionDto | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<PracticeQuestionDto | null>(null);

  const [createSetModalOpen, setCreateSetModalOpen] = useState(false);
  const [newSetTitle, setNewSetTitle] = useState('');
  const [newSetDesc, setNewSetDesc] = useState('');
  const [newSetQuestionIds, setNewSetQuestionIds] = useState<string[]>([]);
  const [setToDelete, setSetToDelete] = useState<PracticeSetDto | null>(null);

  // Sync URL params only when navigating externally with a changed query string
  useEffect(() => {
    const currentQs = searchParams.toString();
    if (currentQs === prevSearchRef.current) return;
    prevSearchRef.current = currentQs;

    const t = searchParams.get('tab');
    const m = searchParams.get('mode');
    const src = searchParams.get('source');
    const col = searchParams.get('collectionId') ?? '';
    const sess = searchParams.get('sessionId') ?? '';
    const vId = searchParams.get('vocabId') ?? '';
    const tId = searchParams.get('topicId') ?? '';
    const sId = searchParams.get('setId') ?? '';
    const cId = searchParams.get('categoryId') ?? '';

    const resolvedTab: PracticeTab =
      t === 'vocab' || t === 'grammar' || t === 'builder' || t === 'history'
        ? t
        : tId || sId || cId
          ? 'grammar'
          : 'vocab';

    setActiveVocabSession(null);
    setActiveGrammarSession(null);
    setActiveTab(resolvedTab);

    if (m && (VOCAB_PRACTICE_MODES as readonly string[]).includes(m)) {
      setVocabMode(m as VocabPracticeMode);
    }
    if (src && ['due', 'weak', 'all', 'collection', 'session'].includes(src)) {
      setVocabSource(src as VocabSource);
    } else if (col) {
      setVocabSource('collection');
    } else if (sess) {
      setVocabSource('session');
    } else if (currentQs === '') {
      setVocabSource('due');
    }

    setSelectedCollectionId(col);
    setSelectedSessionId(sess);
    setScopedVocabId(vId);
    setSelectedTopicId(tId);
    setSelectedSetId(sId);
    setSelectedCategoryId(cId);

    if (sId) {
      setGrammarPickMode('set');
    } else if (tId || cId || currentQs === '') {
      setGrammarPickMode('topic');
    }
  }, [searchParams]);

  // Queries
  const collectionsQuery = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.listCollections(),
  });
  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
  });
  const grammarCategoriesQuery = useQuery({
    queryKey: ['grammar-categories'],
    queryFn: () => api.listGrammarCategories(),
  });
  const grammarTopicsQuery = useQuery({
    queryKey: ['grammar-topics'],
    queryFn: () => api.listGrammarTopics(),
  });
  const practiceSetsQuery = useQuery({
    queryKey: ['practice-sets'],
    queryFn: () => api.listPracticeSets(),
  });
  const allQuestionsQuery = useQuery({
    queryKey: ['practice-questions', 'all'],
    queryFn: () => api.listPracticeQuestions(),
  });
  const builderQuestionsQuery = useQuery({
    queryKey: [
      'practice-questions',
      'builder',
      builderTopicFilter,
      builderTypeFilter,
      builderSearch.trim(),
    ],
    queryFn: () =>
      api.listPracticeQuestions({
        grammarTopicId: builderTopicFilter || undefined,
        questionType: builderTypeFilter || undefined,
        search: builderSearch.trim() || undefined,
      }),
    enabled: activeTab === 'builder',
  });
  const historyQuery = useQuery({
    queryKey: ['practice-history'],
    queryFn: () => api.listPracticeHistory(30),
    enabled: activeTab === 'history',
  });

  const collections = collectionsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const grammarCategories = grammarCategoriesQuery.data ?? [];
  const grammarTopics = grammarTopicsQuery.data ?? [];
  const practiceSets = practiceSetsQuery.data ?? [];
  const allQuestions = allQuestionsQuery.data ?? [];

  const filteredGrammarTopics = useMemo(
    () =>
      selectedCategoryId
        ? grammarTopics.filter((t) => t.categoryId === selectedCategoryId)
        : grammarTopics,
    [grammarTopics, selectedCategoryId],
  );
  const categoryTopicIds = useMemo(
    () => new Set(filteredGrammarTopics.map((t) => t.id)),
    [filteredGrammarTopics],
  );
  const selectedCategoryObj = useMemo(
    () => grammarCategories.find((c) => c.id === selectedCategoryId) ?? null,
    [grammarCategories, selectedCategoryId],
  );

  // Mutations for Builder
  const deleteQuestionMutation = useMutation({
    mutationFn: (id: string) => api.deletePracticeQuestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-questions'] });
      queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
      queryClient.invalidateQueries({ queryKey: ['practice-sets'] });
      success('Đã xóa câu hỏi');
      setQuestionToDelete(null);
    },
    onError: (err) => {
      showError('Không thể xóa câu hỏi', err instanceof Error ? err.message : undefined);
    },
  });

  const createSetMutation = useMutation({
    mutationFn: () =>
      api.createPracticeSet({
        title: newSetTitle.trim(),
        description: newSetDesc.trim(),
        sourceType: 'custom',
        questionIds: newSetQuestionIds,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['practice-sets'] });
      success(`Đã tạo bộ bài tập "${created.title}"`);
      setNewSetTitle('');
      setNewSetDesc('');
      setNewSetQuestionIds([]);
      setCreateSetModalOpen(false);
    },
    onError: (err) => {
      showError('Không thể tạo bộ bài tập', err instanceof Error ? err.message : undefined);
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: (id: string) => api.deletePracticeSet(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-sets'] });
      success('Đã xóa bộ bài tập');
      setSetToDelete(null);
    },
    onError: (err) => {
      showError('Không thể xóa bộ bài tập', err instanceof Error ? err.message : undefined);
    },
  });

  const startVocabPractice = useCallback(
    async (overrides?: {
      mode?: VocabPracticeMode;
      source?: VocabSource;
      collectionId?: string;
      sessionId?: string;
      vocabId?: string;
    }) => {
      const targetMode = overrides?.mode ?? vocabMode;
      const targetSource = overrides?.source ?? vocabSource;
      const targetCol = overrides?.collectionId ?? selectedCollectionId;
      const targetSess = overrides?.sessionId ?? selectedSessionId;
      const targetVocabId = overrides?.vocabId ?? scopedVocabId;

      if (!targetVocabId && targetSource === 'collection' && !targetCol) {
        warning('Vui lòng chọn một bộ sưu tập trước khi bắt đầu');
        return;
      }
      if (!targetVocabId && targetSource === 'session' && !targetSess) {
        warning('Vui lòng chọn một buổi học trước khi bắt đầu');
        return;
      }

      setIsGeneratingVocab(true);
      try {
        const items = await api.generateVocabQuiz({
          mode: targetMode,
          source: targetVocabId ? undefined : targetSource,
          collectionId: targetSource === 'collection' && targetCol ? targetCol : undefined,
          sessionId: targetSource === 'session' && targetSess ? targetSess : undefined,
          vocabularyIds: targetVocabId ? [targetVocabId] : undefined,
          limit: vocabLimit,
        });

        if (items.length === 0) {
          warning(
            'Chưa có từ vựng phù hợp với bộ lọc này',
            'Thử chuyển nguồn sang "Toàn bộ thư viện" hoặc thêm từ mới.',
          );
          return;
        }

        const sourceLabel = targetVocabId
          ? `Ôn từ "${items[0].word}"`
          : targetSource === 'due'
            ? 'Từ vựng đến hạn'
            : targetSource === 'weak'
              ? 'Từ vựng cần củng cố'
              : targetSource === 'collection'
                ? 'Theo bộ sưu tập'
                : targetSource === 'session'
                  ? 'Theo buổi học'
                  : 'Thư viện từ vựng';

        setActiveVocabSession({
          items,
          mode: targetMode,
          title: `${VOCAB_PRACTICE_MODE_LABELS[targetMode]} · ${sourceLabel}`,
        });
      } catch (err) {
        showError('Không thể tạo bài luyện từ vựng', err instanceof Error ? err.message : undefined);
      } finally {
        setIsGeneratingVocab(false);
      }
    },
    [
      scopedVocabId,
      selectedCollectionId,
      selectedSessionId,
      showError,
      vocabLimit,
      vocabMode,
      vocabSource,
      warning,
    ],
  );

  const startGrammarPractice = useCallback(
    async (overrides?: {
      pickMode?: GrammarPickMode;
      topicId?: string;
      setId?: string;
      categoryId?: string;
    }) => {
      const pick = overrides?.pickMode ?? grammarPickMode;
      const tId = overrides?.topicId ?? selectedTopicId;
      const sId = overrides?.setId ?? selectedSetId;
      const cId = overrides?.categoryId !== undefined ? overrides.categoryId : selectedCategoryId;

      setIsLaunchingGrammar(true);
      try {
        let questions: PracticeQuestionDto[] = [];
        let title = 'Luyện tập ngữ pháp';

        if (pick === 'set') {
          if (!sId) {
            warning('Vui lòng chọn một bộ bài tập');
            return;
          }
          const detail = await api.getPracticeSet(sId);
          questions = detail.questions ?? [];
          title = detail.title;
        } else if (pick === 'topic') {
          questions = await api.listPracticeQuestions({
            grammarTopicId: tId || undefined,
          });
          if (!tId && cId) {
            const topicIdsInCat = new Set(
              grammarTopics.filter((t) => t.categoryId === cId).map((t) => t.id),
            );
            questions = questions.filter(
              (q) => Boolean(q.grammarTopicId && topicIdsInCat.has(q.grammarTopicId)),
            );
          }
          const topicObj = grammarTopics.find((t) => t.id === tId);
          const resolvedTopicTitle = topicObj?.title ?? questions[0]?.grammarTopicTitle;
          const catObj = cId ? grammarCategories.find((cat) => cat.id === cId) : null;
          title = tId && resolvedTopicTitle
            ? `Ngữ pháp: ${resolvedTopicTitle}`
            : catObj
              ? `Danh mục: ${catObj.nameVi || catObj.name}`
              : 'Luyện tập Ngữ pháp tổng hợp';
        } else {
          questions = await api.listPracticeQuestions({
            questionType: selectedQuestionType,
          });
          title = `Dạng bài: ${GRAMMAR_QUESTION_TYPE_LABELS[selectedQuestionType]}`;
        }

        const sliced = questions.slice(0, grammarLimit);
        if (sliced.length === 0) {
          warning(
            'Chưa có câu hỏi nào phù hợp',
            'Bạn có thể tạo thêm câu hỏi trong tab Ngân hàng câu hỏi & Bộ bài tập.',
          );
          return;
        }

        setActiveGrammarSession({
          questions: sliced,
          title,
          domain: 'grammar',
        });
      } catch (err) {
        showError('Không thể tải câu hỏi ngữ pháp', err instanceof Error ? err.message : undefined);
      } finally {
        setIsLaunchingGrammar(false);
      }
    },
    [
      grammarCategories,
      grammarLimit,
      grammarPickMode,
      grammarTopics,
      selectedCategoryId,
      selectedQuestionType,
      selectedSetId,
      selectedTopicId,
      showError,
      warning,
    ],
  );

  // Handle ?autostart=1 once per autostart request
  const autoStartHandledRef = useRef<string | null>(null);
  useEffect(() => {
    const autostart = searchParams.get('autostart');
    if (autostart !== '1') {
      autoStartHandledRef.current = null;
      return;
    }

    if (urlCategoryId && !urlTopicId && !urlSetId && !grammarTopicsQuery.isSuccess) {
      return;
    }

    const signature = searchParams.toString();
    if (autoStartHandledRef.current === signature) return;
    autoStartHandledRef.current = signature;

    // Strip autostart from URL so refreshing or exiting won't auto-relaunch
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete('autostart');
    prevSearchRef.current = cleaned.toString();
    setSearchParams(cleaned, { replace: true });

    const effectiveTab: PracticeTab =
      urlTab === 'vocab' || urlTab === 'grammar' || urlTab === 'builder' || urlTab === 'history'
        ? urlTab
        : urlTopicId || urlSetId || urlCategoryId
          ? 'grammar'
          : 'vocab';

    if (effectiveTab === 'grammar') {
      if (urlSetId) {
        void startGrammarPractice({ pickMode: 'set', setId: urlSetId });
      } else {
        void startGrammarPractice({
          pickMode: 'topic',
          topicId: urlTopicId,
          categoryId: urlCategoryId,
        });
      }
    } else if (effectiveTab === 'vocab') {
      const m =
        urlMode && (VOCAB_PRACTICE_MODES as readonly string[]).includes(urlMode)
          ? (urlMode as VocabPracticeMode)
          : vocabMode;
      const src: VocabSource =
        urlSource && ['due', 'weak', 'all', 'collection', 'session'].includes(urlSource)
          ? (urlSource as VocabSource)
          : urlCollectionId
            ? 'collection'
            : urlSessionId
              ? 'session'
              : vocabSource;
      void startVocabPractice({
        mode: m,
        source: src,
        collectionId: urlCollectionId,
        sessionId: urlSessionId,
        vocabId: urlVocabId,
      });
    }
  }, [
    grammarTopicsQuery.isSuccess,
    searchParams,
    setSearchParams,
    startGrammarPractice,
    startVocabPractice,
    urlCategoryId,
    urlCollectionId,
    urlMode,
    urlSessionId,
    urlSetId,
    urlSource,
    urlTab,
    urlTopicId,
    urlVocabId,
    vocabMode,
    vocabSource,
  ]);

  const matchedGrammarCount = useMemo(() => {
    if (grammarPickMode === 'set') {
      const found = practiceSets.find((s) => s.id === selectedSetId);
      return found?.questionCount ?? 0;
    }
    if (grammarPickMode === 'topic') {
      if (selectedTopicId) {
        return allQuestions.filter((q) => q.grammarTopicId === selectedTopicId).length;
      }
      if (selectedCategoryId) {
        return allQuestions.filter((q) => q.grammarTopicId && categoryTopicIds.has(q.grammarTopicId))
          .length;
      }
      return allQuestions.length;
    }
    return allQuestions.filter((q) => q.questionType === selectedQuestionType).length;
  }, [
    allQuestions,
    categoryTopicIds,
    grammarPickMode,
    practiceSets,
    selectedCategoryId,
    selectedQuestionType,
    selectedSetId,
    selectedTopicId,
  ]);

  const historyColumns: ReadonlyArray<ResponsiveTableColumn<PracticeHistoryItemDto>> = [
    {
      key: 'title',
      header: 'Phiên luyện tập',
      isRowHeader: true,
      render: (row) => (
        <div>
          <p className="font-medium text-[var(--ink-primary)]">{row.title}</p>
          <p className="text-[12px] text-[var(--ink-muted)]">{formatModeLabel(row.mode)}</p>
        </div>
      ),
    },
    {
      key: 'startedAt',
      header: 'Ngày',
      render: (row) => <span>{formatDateVi(row.startedAt)}</span>,
    },
    {
      key: 'domain',
      header: 'Lĩnh vực',
      render: (row) => <Badge tone="neutral">{DOMAIN_LABELS[row.domain]}</Badge>,
    },
    {
      key: 'score',
      header: 'Điểm số',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-medium text-[var(--ink-primary)]">
          {row.correctCount}/{row.completedItems || row.totalItems}
        </span>
      ),
    },
    {
      key: 'accuracy',
      header: 'Chính xác',
      align: 'right',
      render: (row) => (
        <Badge
          tone={
            row.accuracyPercent >= 80
              ? 'success'
              : row.accuracyPercent >= 50
                ? 'accent'
                : 'warning'
          }
        >
          {row.accuracyPercent}%
        </Badge>
      ),
    },
    {
      key: 'duration',
      header: 'Thời lượng',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">{formatSecondsCompact(row.durationSeconds)}</span>
      ),
    },
  ];

  // Distraction-free Runner Views
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

  const handleTabChange = (nextTab: string) => {
    const casted = nextTab as PracticeTab;
    setActiveTab(casted);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', casted);
    prevSearchRef.current = nextParams.toString();
    setSearchParams(nextParams, { replace: true });
  };

  const clearScopedVocab = () => {
    setScopedVocabId('');
    if (searchParams.has('vocabId')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('vocabId');
      prevSearchRef.current = nextParams.toString();
      setSearchParams(nextParams, { replace: true });
    }
  };

  const clearCategoryFilter = () => {
    setSelectedCategoryId('');
    if (searchParams.has('categoryId')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('categoryId');
      prevSearchRef.current = nextParams.toString();
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleCreateSetSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newSetTitle.trim()) return;
    createSetMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--ink-primary)]">
          Trung tâm Luyện tập
        </h1>
        <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
          Rèn luyện chủ động 2 chiều với 8 chế độ từ vựng, 11 dạng bài tập ngữ pháp và bộ bài tập tự thiết kế.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label="Các khu vực luyện tập">
          <TabsTrigger value="vocab">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span>Luyện Từ vựng</span>
          </TabsTrigger>
          <TabsTrigger value="grammar">
            <Dumbbell className="h-4 w-4" aria-hidden="true" />
            <span>Luyện Ngữ pháp</span>
          </TabsTrigger>
          <TabsTrigger value="builder">
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>Ngân hàng câu hỏi & Bộ bài tập</span>
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4" aria-hidden="true" />
            <span>Lịch sử luyện tập</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Vocabulary Practice */}
        <TabsContent value="vocab" className="pt-5 space-y-6">
          {scopedVocabId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-[13px] text-[var(--accent)]">
              <span>Đang chọn luyện tập cho 1 từ vựng cụ thể đã liên kết.</span>
              <Button size="sm" variant="ghost" onClick={clearScopedVocab}>
                Bỏ chọn từ đơn lẻ
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
              1. Chọn chế độ luyện từ vựng (8 chế độ)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {VOCAB_PRACTICE_MODES.map((m) => {
                const selected = vocabMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setVocabMode(m)}
                    className={cn(
                      'flex flex-col items-start rounded-[10px] border p-4 text-left transition-colors cursor-pointer',
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[14px] font-semibold',
                        selected ? 'text-[var(--accent)]' : 'text-[var(--ink-primary)]',
                      )}
                    >
                      {VOCAB_PRACTICE_MODE_LABELS[m]}
                    </span>
                    <span className="mt-1 text-[12px] leading-[1.45] text-[var(--ink-secondary)]">
                      {VOCAB_MODE_DESCRIPTIONS[m]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                2. Nguồn từ vựng & Số lượng câu
              </h2>

              <div className="grid gap-4 sm:grid-cols-3">
                <Select
                  label="Nguồn từ vựng"
                  disabled={Boolean(scopedVocabId)}
                  value={vocabSource}
                  onChange={(e) => setVocabSource(e.target.value as VocabSource)}
                  options={[
                    { value: 'due', label: 'Từ đến hạn ôn tập (SM-2)' },
                    { value: 'weak', label: 'Từ hay quên / Độ tự tin thấp' },
                    { value: 'all', label: 'Toàn bộ thư viện từ vựng' },
                    { value: 'collection', label: 'Theo bộ sưu tập' },
                    { value: 'session', label: 'Theo buổi học' },
                  ]}
                />

                {vocabSource === 'collection' && !scopedVocabId && (
                  <Select
                    label="Chọn bộ sưu tập"
                    value={selectedCollectionId}
                    onChange={(e) => setSelectedCollectionId(e.target.value)}
                    placeholder="Chọn bộ sưu tập..."
                    options={collections.map((c) => ({
                      value: c.id,
                      label: `${c.name} (${c.wordCount})`,
                    }))}
                  />
                )}

                {vocabSource === 'session' && !scopedVocabId && (
                  <Select
                    label="Chọn buổi học"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    placeholder="Chọn buổi học..."
                    options={sessions.map((s) => ({
                      value: s.id,
                      label: `${s.title} (${formatDateVi(s.learningDate)})`,
                    }))}
                  />
                )}

                <Select
                  label="Số lượng câu mỗi phiên"
                  value={String(vocabLimit)}
                  onChange={(e) => setVocabLimit(Number(e.target.value))}
                  options={[
                    { value: '5', label: '5 câu (Nhanh ~3 phút)' },
                    { value: '10', label: '10 câu (Chuẩn ~7 phút)' },
                    { value: '15', label: '15 câu (~10 phút)' },
                    { value: '20', label: '20 câu (Chuyên sâu)' },
                  ]}
                />
              </div>

              <div className="flex justify-end border-t border-[var(--border-hairline)] pt-4">
                <Button
                  variant="primary"
                  size="lg"
                  loading={isGeneratingVocab}
                  leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => void startVocabPractice()}
                >
                  Bắt đầu luyện tập
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Grammar Practice */}
        <TabsContent value="grammar" className="pt-5 space-y-5">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                  Chọn nguồn bài tập ngữ pháp
                </h2>
                <p className="mt-0.5 text-[13px] text-[var(--ink-secondary)]">
                  Luyện theo từng chủ điểm kiến thức, theo bộ bài tập đã lưu hoặc lọc theo dạng bài.
                </p>
              </div>

              {selectedCategoryId && grammarPickMode === 'topic' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-[13px] text-[var(--accent)]">
                  <span>
                    Đang lọc theo danh mục:{' '}
                    <strong>
                      {selectedCategoryObj?.nameVi || selectedCategoryObj?.name || 'Ngữ pháp'}
                    </strong>
                  </span>
                  <Button size="sm" variant="ghost" onClick={clearCategoryFilter}>
                    Bỏ lọc danh mục
                  </Button>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    id: 'topic' as const,
                    title: 'Theo chủ điểm ngữ pháp',
                    desc: 'Chọn 1 chủ điểm cụ thể hoặc luyện tổng hợp.',
                  },
                  {
                    id: 'set' as const,
                    title: 'Theo bộ bài tập',
                    desc: 'Các bộ câu hỏi bạn đã nhóm sẵn hoặc tạo từ lỗi sai.',
                  },
                  {
                    id: 'type' as const,
                    title: 'Theo dạng bài tập (11 dạng)',
                    desc: 'Tập trung luyện riêng 1 kỹ năng như tìm lỗi sai, viết lại câu...',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGrammarPickMode(opt.id)}
                    className={cn(
                      'rounded-[8px] border p-3.5 text-left transition-colors cursor-pointer',
                      grammarPickMode === opt.id
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] hover:border-[var(--border-strong)]',
                    )}
                  >
                    <p
                      className={cn(
                        'text-[14px] font-semibold',
                        grammarPickMode === opt.id
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--ink-primary)]',
                      )}
                    >
                      {opt.title}
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">{opt.desc}</p>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {grammarPickMode === 'topic' && (
                  <Select
                    label="Chủ điểm ngữ pháp"
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.target.value)}
                    placeholder={
                      selectedCategoryId ? 'Tất cả chủ điểm trong danh mục' : 'Tất cả chủ điểm'
                    }
                    options={filteredGrammarTopics.map((t) => ({
                      value: t.id,
                      label: `${t.title}${t.titleVi ? ` (${t.titleVi})` : ''} · ${t.questionCount} câu`,
                    }))}
                  />
                )}

                {grammarPickMode === 'set' && (
                  <Select
                    label="Bộ bài tập"
                    value={selectedSetId}
                    onChange={(e) => setSelectedSetId(e.target.value)}
                    placeholder="Chọn bộ bài tập..."
                    options={practiceSets.map((s) => ({
                      value: s.id,
                      label: `${s.title} (${s.questionCount} câu)`,
                    }))}
                  />
                )}

                {grammarPickMode === 'type' && (
                  <Select
                    label="Dạng bài tập (11 dạng)"
                    value={selectedQuestionType}
                    onChange={(e) =>
                      setSelectedQuestionType(e.target.value as GrammarQuestionType)
                    }
                    options={GRAMMAR_QUESTION_TYPES.map((type) => ({
                      value: type,
                      label: GRAMMAR_QUESTION_TYPE_LABELS[type],
                    }))}
                  />
                )}

                <Select
                  label="Số câu tối đa mỗi phiên"
                  value={String(grammarLimit)}
                  onChange={(e) => setGrammarLimit(Number(e.target.value))}
                  options={[
                    { value: '5', label: '5 câu' },
                    { value: '10', label: '10 câu' },
                    { value: '15', label: '15 câu' },
                    { value: '20', label: '20 câu' },
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
                <span className="text-[13px] text-[var(--ink-secondary)]">
                  Có sẵn{' '}
                  <strong className="font-semibold text-[var(--ink-primary)]">
                    {matchedGrammarCount}
                  </strong>{' '}
                  câu hỏi phù hợp.
                </span>
                <Button
                  variant="primary"
                  size="lg"
                  loading={isLaunchingGrammar}
                  leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => void startGrammarPractice()}
                >
                  Bắt đầu luyện tập
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Question Bank & Practice Sets Builder */}
        <TabsContent value="builder" className="pt-5 space-y-8">
          {/* Practice Sets Section */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--ink-primary)]">
                  Bộ bài tập tự chọn ({practiceSets.length})
                </h2>
                <p className="text-[13px] text-[var(--ink-secondary)]">
                  Gom nhóm các câu hỏi trọng tâm thành bộ đề để ôn tập nhiều lần.
                </p>
              </div>
              <Button
                variant="secondary"
                leftIcon={<CheckSquare className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setCreateSetModalOpen(true)}
              >
                Tạo bộ bài tập mới
              </Button>
            </div>

            {practiceSets.length === 0 ? (
              <EmptyState
                title="Chưa có bộ bài tập nào"
                description="Chọn các câu hỏi bên dưới để đóng gói thành một bộ luyện tập riêng."
                actionLabel="Tạo bộ bài tập"
                onAction={() => setCreateSetModalOpen(true)}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {practiceSets.map((set) => (
                  <Card key={set.id}>
                    <CardContent className="flex h-full flex-col justify-between gap-4 p-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            tone={set.sourceType === 'mistake_bank' ? 'warning' : 'accent'}
                          >
                            {set.sourceType === 'mistake_bank'
                              ? 'Từ lỗi sai'
                              : set.sourceType === 'grammar_topic'
                                ? 'Theo chủ điểm'
                                : 'Tùy chỉnh'}
                          </Badge>
                          <span className="text-[12px] text-[var(--ink-muted)]">
                            {set.questionCount} câu
                          </span>
                        </div>
                        <h3 className="mt-2 text-[15px] font-semibold text-[var(--ink-primary)]">
                          {set.title}
                        </h3>
                        {set.description && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-[var(--ink-secondary)]">
                            {set.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-3">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={set.questionCount === 0}
                          leftIcon={<Play className="h-3.5 w-3.5" aria-hidden="true" />}
                          onClick={() =>
                            void startGrammarPractice({ pickMode: 'set', setId: set.id })
                          }
                        >
                          Luyện ngay
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Xóa bộ ${set.title}`}
                          onClick={() => setSetToDelete(set)}
                        >
                          <Trash2 className="h-4 w-4 text-[var(--danger-ink)]" aria-hidden="true" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Question Bank Section */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold text-[var(--ink-primary)]">
                  Ngân hàng câu hỏi ({builderQuestionsQuery.data?.length ?? allQuestions.length})
                </h2>
                <p className="text-[13px] text-[var(--ink-secondary)]">
                  Quản lý câu hỏi thủ công cho 11 dạng bài tập ngữ pháp.
                </p>
              </div>
              <Button
                variant="primary"
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  setEditingQuestion(null);
                  setQuestionModalOpen(true);
                }}
              >
                Tạo câu hỏi mới
              </Button>
            </div>

            <search>
              <div className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 sm:grid-cols-[minmax(0,1fr)_220px_220px]">
                <Input
                  type="search"
                  aria-label="Tìm câu hỏi"
                  leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
                  value={builderSearch}
                  onChange={(e) => setBuilderSearch(e.target.value)}
                  placeholder="Tìm theo đề bài, đáp án, giải thích..."
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <Select
                  aria-label="Lọc theo chủ điểm ngữ pháp"
                  value={builderTopicFilter}
                  onChange={(e) => setBuilderTopicFilter(e.target.value)}
                  placeholder="Tất cả chủ điểm"
                  options={grammarTopics.map((t) => ({
                    value: t.id,
                    label: t.title,
                  }))}
                />
                <Select
                  aria-label="Lọc theo dạng câu hỏi"
                  value={builderTypeFilter}
                  onChange={(e) => setBuilderTypeFilter(e.target.value)}
                  placeholder="Tất cả 11 dạng"
                  options={GRAMMAR_QUESTION_TYPES.map((type) => ({
                    value: type,
                    label: GRAMMAR_QUESTION_TYPE_LABELS[type],
                  }))}
                />
              </div>
            </search>

            {(builderQuestionsQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="Chưa tìm thấy câu hỏi nào"
                description="Tạo câu hỏi mới hoặc thay đổi điều kiện lọc."
                actionLabel="Tạo câu hỏi mới"
                onAction={() => {
                  setEditingQuestion(null);
                  setQuestionModalOpen(true);
                }}
              />
            ) : (
              <div className="space-y-3">
                {(builderQuestionsQuery.data ?? []).map((q) => (
                  <Card key={q.id}>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">
                            {GRAMMAR_QUESTION_TYPE_LABELS[q.questionType]}
                          </Badge>
                          <Badge tone="accent">
                            {GRAMMAR_DIFFICULTY_LABELS[q.difficulty]}
                          </Badge>
                          {q.grammarTopicTitle && (
                            <Badge tone="info">{q.grammarTopicTitle}</Badge>
                          )}
                        </div>
                        <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                          {q.prompt}
                        </p>
                        <p className="text-[13px] text-[var(--success-ink)]">
                          Đáp án đúng: <strong>{q.correctAnswer}</strong>
                        </p>
                        {q.explanationVi && (
                          <p className="text-[12px] text-[var(--ink-secondary)]">
                            {q.explanationVi}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
                          onClick={() => {
                            setEditingQuestion(q);
                            setQuestionModalOpen(true);
                          }}
                        >
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Xóa câu hỏi"
                          onClick={() => setQuestionToDelete(q)}
                        >
                          <Trash2 className="h-4 w-4 text-[var(--danger-ink)]" aria-hidden="true" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* Tab 4: Practice History */}
        <TabsContent value="history" className="pt-5">
          <ResponsiveTable
            ariaLabel="Lịch sử các phiên luyện tập"
            caption="Bảng lịch sử luyện tập gần đây"
            columns={historyColumns}
            data={historyQuery.data ?? []}
            getRowKey={(row) => row.id}
            emptyState={
              <EmptyState
                icon={<History className="h-5 w-5" />}
                title="Chưa có lịch sử luyện tập"
                description="Hãy hoàn thành một phiên luyện tập từ vựng hoặc ngữ pháp để ghi nhận tiến độ."
              />
            }
          />
        </TabsContent>
      </Tabs>

      {/* Question Builder Modal */}
      <QuestionBuilderModal
        open={questionModalOpen}
        onOpenChange={(open) => {
          setQuestionModalOpen(open);
          if (!open) setEditingQuestion(null);
        }}
        initialQuestion={editingQuestion}
        grammarTopics={grammarTopics}
      />

      {/* Delete Question Confirm */}
      <Dialog
        open={Boolean(questionToDelete)}
        onOpenChange={(open) => {
          if (!open) setQuestionToDelete(null);
        }}
        title="Xóa câu hỏi luyện tập"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setQuestionToDelete(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteQuestionMutation.isPending}
              onClick={() => {
                if (questionToDelete) deleteQuestionMutation.mutate(questionToDelete.id);
              }}
            >
              Xóa câu hỏi
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--ink-secondary)]">
          Bạn chắc chắn muốn xóa câu hỏi này khỏi Ngân hàng câu hỏi?
        </p>
      </Dialog>

      {/* Create Practice Set Modal */}
      <Dialog
        open={createSetModalOpen}
        onOpenChange={(open) => {
          setCreateSetModalOpen(open);
          if (!open) {
            setNewSetTitle('');
            setNewSetDesc('');
            setNewSetQuestionIds([]);
          }
        }}
        title="Tạo bộ bài tập mới"
        description="Chọn các câu hỏi bạn muốn gộp thành một bộ ôn tập riêng."
        size="lg"
        dirty={Boolean(newSetTitle.trim() || newSetQuestionIds.length > 0)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateSetModalOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form="create-practice-set-form"
              variant="primary"
              disabled={!newSetTitle.trim() || newSetQuestionIds.length === 0}
              loading={createSetMutation.isPending}
            >
              Lưu bộ bài tập ({newSetQuestionIds.length} câu)
            </Button>
          </>
        }
      >
        <form id="create-practice-set-form" onSubmit={handleCreateSetSubmit} className="space-y-4">
          <Input
            label="Tên bộ bài tập"
            required
            value={newSetTitle}
            onChange={(e) => setNewSetTitle(e.target.value)}
            placeholder="Ví dụ: Bộ ôn Hiện tại hoàn thành & Mạo từ"
          />
          <Textarea
            label="Mô tả ngắn (tùy chọn)"
            rows={2}
            value={newSetDesc}
            onChange={(e) => setNewSetDesc(e.target.value)}
            placeholder="Mục tiêu của bộ đề này..."
          />

          <div className="space-y-2">
            <p className="text-[13px] font-medium text-[var(--ink-primary)]">
              Chọn câu hỏi ({newSetQuestionIds.length} đã chọn)
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-[8px] border border-[var(--border-hairline)] p-3">
              {allQuestions.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)]">
                  Chưa có câu hỏi nào trong ngân hàng câu hỏi.
                </p>
              ) : (
                allQuestions.map((q) => {
                  const checked = newSetQuestionIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className={cn(
                        'flex items-start gap-3 rounded-[6px] border p-2.5 text-[13px] cursor-pointer',
                        checked
                          ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]/50'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-surface)]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewSetQuestionIds((prev) => [...prev, q.id]);
                          } else {
                            setNewSetQuestionIds((prev) => prev.filter((id) => id !== q.id));
                          }
                        }}
                        className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">
                            {GRAMMAR_QUESTION_TYPE_LABELS[q.questionType]}
                          </Badge>
                          {q.grammarTopicTitle && (
                            <span className="text-[11px] text-[var(--ink-muted)]">
                              {q.grammarTopicTitle}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-medium text-[var(--ink-primary)]">{q.prompt}</p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </form>
      </Dialog>

      {/* Delete Set Confirm */}
      <Dialog
        open={Boolean(setToDelete)}
        onOpenChange={(open) => {
          if (!open) setSetToDelete(null);
        }}
        title="Xóa bộ bài tập"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSetToDelete(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteSetMutation.isPending}
              onClick={() => {
                if (setToDelete) deleteSetMutation.mutate(setToDelete.id);
              }}
            >
              Xóa bộ bài tập
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--ink-secondary)]">
          Bạn chắc chắn muốn xóa bộ bài tập{' '}
          <strong className="text-[var(--ink-primary)]">{setToDelete?.title}</strong>? Các câu hỏi gốc vẫn được giữ lại.
        </p>
      </Dialog>
    </div>
  );
}
