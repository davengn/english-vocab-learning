import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Edit3,
  FileSpreadsheet,
  Link2,
  NotebookPen,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ImportVocabModal } from '@client/components/modals/ImportVocabModal';
import { Badge } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { ResponsiveTableRegion } from '@client/components/ui/ResponsiveTable';
import { Select } from '@client/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@client/components/ui/Tabs';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';
import { api } from '@client/lib/api';
import { onImeSafeEnter } from '@client/lib/ime';
import { cn, formatDateVi, highlightTargetWord } from '@client/lib/utils';
import type {
  CefrLevel,
  DuplicateStrategy,
  GrammarDifficulty,
  SessionSourceType,
  SessionVocabularyItemDto,
} from '@shared/apiTypes';
import { parseBulkVocabulary } from '@shared/bulkParser';
import {
  CEFR_LEVELS,
  GRAMMAR_DIFFICULTIES,
  GRAMMAR_DIFFICULTY_LABELS,
  GRAMMAR_STATUS_LABELS,
  SESSION_SOURCES,
  SESSION_SOURCE_LABELS,
  normalizeWord,
} from '@shared/schemas';

const ADDED_VIA_LABELS = {
  quick_add: 'Thêm nhanh',
  bulk_paste: 'Dán hàng loạt',
  import: 'Nhập CSV/XLSX',
  existing: 'Từ có sẵn',
} as const;

type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SessionMetaSnapshot {
  title: string;
  learningDate: string;
  sourceType: SessionSourceType;
  learningType: string;
  generalNotes: string;
}

export function SessionWorkspacePage() {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { success, error: toastError, info } = useToast();

  // Workspace tabs
  const [activeTab, setActiveTab] = useState('vocab');

  // Session header & notes editable draft with debounced autosave
  const [meta, setMeta] = useState<SessionMetaSnapshot>({
    title: '',
    learningDate: '',
    sourceType: 'english_class',
    learningType: '',
    generalNotes: '',
  });
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const hydratedSessionIdRef = useRef<string | null>(null);
  const lastSavedRef = useRef<SessionMetaSnapshot | null>(null);

  // Quick Add vocab bar
  const wordInputRef = useRef<HTMLInputElement>(null);
  const [qaWord, setQaWord] = useState('');
  const [qaMeaning, setQaMeaning] = useState('');
  const [qaIpa, setQaIpa] = useState('');
  const [qaExample, setQaExample] = useState('');

  // Link existing vocab
  const [existingVocabSearch, setExistingVocabSearch] = useState('');
  const [selectedExistingVocabId, setSelectedExistingVocabId] = useState('');

  // Inline edit state on session vocab rows
  const [editingVocabId, setEditingVocabId] = useState<string | null>(null);
  const [editMeaning, setEditMeaning] = useState('');
  const [editIpa, setEditIpa] = useState('');
  const [editExample, setEditExample] = useState('');
  const [editExampleVi, setEditExampleVi] = useState('');

  // Bulk paste collapsible section
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DuplicateStrategy>('link_existing');

  // Import CSV/Excel modal
  const [importOpen, setImportOpen] = useState(false);

  // Grammar Tab: Link existing vs Create new
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [existingGrammarNote, setExistingGrammarNote] = useState('');

  const [newGramCategoryId, setNewGramCategoryId] = useState('');
  const [newGramTitle, setNewGramTitle] = useState('');
  const [newGramTitleVi, setNewGramTitleVi] = useState('');
  const [newGramDifficulty, setNewGramDifficulty] =
    useState<GrammarDifficulty>('intermediate');
  const [newGramCefr, setNewGramCefr] = useState<CefrLevel>('B1');
  const [newGramFormula, setNewGramFormula] = useState('');
  const [newGramExplanation, setNewGramExplanation] = useState('');
  const [newGramExEn, setNewGramExEn] = useState('');
  const [newGramExVi, setNewGramExVi] = useState('');
  const [newGramMistakeWrong, setNewGramMistakeWrong] = useState('');
  const [newGramMistakeRight, setNewGramMistakeRight] = useState('');
  const [newGramMistakeNote, setNewGramMistakeNote] = useState('');
  const [newGrammarNote, setNewGrammarNote] = useState('');

  // Completion Modal
  const [completeModalOpen, setCompleteModalOpen] = useState(false);

  // Queries
  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id),
    enabled: Boolean(id),
  });

  const grammarTopicsQuery = useQuery({
    queryKey: ['grammar', 'topics'],
    queryFn: () => api.listGrammarTopics(),
  });

  const grammarCategoriesQuery = useQuery({
    queryKey: ['grammar', 'categories'],
    queryFn: () => api.listGrammarCategories(),
  });

  const vocabLibraryQuery = useQuery({
    queryKey: ['vocabulary', 'all-for-session'],
    queryFn: () => api.listVocabulary({ sort: 'alpha' }),
  });

  const completionPreviewQuery = useQuery({
    queryKey: ['session-completion-preview', id],
    queryFn: () => api.getSessionCompletionPreview(id),
    enabled: Boolean(id) && completeModalOpen,
  });

  // Hydrate meta once per session ID
  useEffect(() => {
    const s = sessionQuery.data;
    if (!s) return;
    if (hydratedSessionIdRef.current !== s.id) {
      const snapshot: SessionMetaSnapshot = {
        title: s.title,
        learningDate: s.learningDate,
        sourceType: s.sourceType,
        learningType: s.learningType,
        generalNotes: s.generalNotes,
      };
      hydratedSessionIdRef.current = s.id;
      lastSavedRef.current = snapshot;
      setMeta(snapshot);
      setAutosaveState('idle');
    }
  }, [sessionQuery.data]);

  // Default grammar category when loaded
  useEffect(() => {
    const cats = grammarCategoriesQuery.data;
    if (cats && cats.length > 0 && !newGramCategoryId) {
      setNewGramCategoryId(cats[0].id);
    }
  }, [grammarCategoriesQuery.data, newGramCategoryId]);

  const updateMetaMutation = useMutation({
    mutationFn: (payload: SessionMetaSnapshot) =>
      api.updateSession(id, {
        title: payload.title.trim(),
        learningDate: payload.learningDate,
        sourceType: payload.sourceType,
        learningType: payload.learningType.trim() || 'Tổng hợp',
        generalNotes: payload.generalNotes,
      }),
    onSuccess: (updated) => {
      lastSavedRef.current = {
        title: updated.title,
        learningDate: updated.learningDate,
        sourceType: updated.sourceType,
        learningType: updated.learningType,
        generalNotes: updated.generalNotes,
      };
      setAutosaveState('saved');
      queryClient.setQueryData(['session', id], updated);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: () => {
      setAutosaveState('error');
    },
  });

  // Debounced autosave when meta changes
  useEffect(() => {
    if (!id || !lastSavedRef.current) return;
    const prev = lastSavedRef.current;
    const changed =
      meta.title !== prev.title ||
      meta.learningDate !== prev.learningDate ||
      meta.sourceType !== prev.sourceType ||
      meta.learningType !== prev.learningType ||
      meta.generalNotes !== prev.generalNotes;

    if (!changed) return;

    if (!meta.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(meta.learningDate)) {
      return;
    }

    setAutosaveState('saving');
    const timer = window.setTimeout(() => {
      updateMetaMutation.mutate(meta);
    }, 600);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, id]);

  // Quick add vocab mutation
  const quickAddVocabMutation = useMutation({
    mutationFn: (payload: {
      vocabularyId?: string;
      word?: string;
      vietnameseMeaning?: string;
      ipa?: string;
      exampleSentence?: string;
    }) => api.addSessionVocab(id, payload),
    onSuccess: (res, vars) => {
      queryClient.setQueryData(['session', id], res.session);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });

      if (vars.vocabularyId) {
        success(`Đã liên kết "${res.item?.word ?? 'từ vựng'}" vào buổi học`);
        setSelectedExistingVocabId('');
      } else {
        if (res.isExisting) {
          info(
            `Đã liên kết "${res.item?.word ?? vars.word}" từ thư viện sẵn có`,
            'Không tạo bản sao trùng lặp.',
          );
        } else {
          success(`Đã thêm "${res.item?.word ?? vars.word}" vào buổi học`);
        }
        setQaWord('');
        setQaMeaning('');
        setQaIpa('');
        setQaExample('');
        window.requestAnimationFrame(() => {
          wordInputRef.current?.focus();
        });
      }
    },
    onError: (err) => {
      toastError(
        'Không thể thêm từ vào buổi học',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  // Inline update vocab mutation
  const inlineUpdateVocabMutation = useMutation({
    mutationFn: (args: {
      item: SessionVocabularyItemDto;
      vietnameseMeaning: string;
      ipa: string;
      newExample: string;
      newExampleVi: string;
    }) => {
      const nextExamples = args.newExample.trim()
        ? [
            ...args.item.examples.map((ex) => ({
              englishSentence: ex.englishSentence,
              vietnameseTranslation: ex.vietnameseTranslation,
              highlightText: ex.highlightText || args.item.word,
            })),
            {
              englishSentence: args.newExample.trim(),
              vietnameseTranslation: args.newExampleVi.trim(),
              highlightText: args.item.word,
            },
          ]
        : undefined;

      return api.updateVocabulary(args.item.vocabularyId, {
        vietnameseMeaning: args.vietnameseMeaning.trim(),
        ipa: args.ipa.trim(),
        ...(nextExamples ? { examples: nextExamples } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setEditingVocabId(null);
      success('Đã cập nhật thông tin từ vựng');
    },
    onError: (err) => {
      toastError(
        'Không thể cập nhật từ vựng',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const removeVocabMutation = useMutation({
    mutationFn: (vocabId: string) => api.removeSessionVocab(id, vocabId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      info('Đã gỡ từ khỏi buổi học', 'Từ vựng vẫn được giữ trong thư viện.');
    },
    onError: (err) => {
      toastError('Không thể gỡ từ vựng', err instanceof Error ? err.message : undefined);
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: (payload: {
      rows: Array<{
        word: string;
        vietnameseMeaning?: string;
        ipa?: string;
        exampleSentence?: string;
        exampleTranslation?: string;
      }>;
      duplicateStrategy: DuplicateStrategy;
    }) =>
      api.bulkAddSessionVocab(id, {
        rows: payload.rows,
        addedVia: 'bulk_paste',
        duplicateStrategy: payload.duplicateStrategy,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success(
        `Đã lưu ${res.addedCount + res.linkedExistingCount} từ vào buổi học`,
        `Thêm mới: ${res.addedCount} · Liên kết sẵn có: ${res.linkedExistingCount} · Bỏ qua: ${res.skippedCount}`,
      );
      setBulkText('');
    },
    onError: (err) => {
      toastError(
        'Không thể lưu danh sách hàng loạt',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const linkExistingGrammarMutation = useMutation({
    mutationFn: () =>
      api.addSessionGrammar(id, {
        existingTopicId: selectedTopicId,
        sessionNote: existingGrammarNote.trim(),
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(['session', id], res.session);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setSelectedTopicId('');
      setExistingGrammarNote('');
      success('Đã liên kết chủ điểm ngữ pháp vào buổi học');
    },
    onError: (err) => {
      toastError(
        'Không thể liên kết ngữ pháp',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const createAndLinkGrammarMutation = useMutation({
    mutationFn: () => {
      const examples: Array<{
        englishSentence: string;
        vietnameseTranslation?: string;
        isCommonMistake?: boolean;
        incorrectVersion?: string;
        correctionNote?: string;
      }> = [];

      if (newGramExEn.trim()) {
        examples.push({
          englishSentence: newGramExEn.trim(),
          vietnameseTranslation: newGramExVi.trim(),
          isCommonMistake: false,
        });
      }

      if (
        newGramMistakeWrong.trim() ||
        newGramMistakeRight.trim() ||
        newGramMistakeNote.trim()
      ) {
        const rightSentence =
          newGramMistakeRight.trim() || newGramExEn.trim() || newGramTitle.trim();
        examples.push({
          englishSentence: rightSentence,
          vietnameseTranslation: '',
          isCommonMistake: true,
          incorrectVersion: newGramMistakeWrong.trim(),
          correctionNote: newGramMistakeNote.trim(),
        });
      }

      return api.addSessionGrammar(id, {
        newTopic: {
          categoryId: newGramCategoryId,
          title: newGramTitle.trim(),
          titleVi: newGramTitleVi.trim(),
          difficulty: newGramDifficulty,
          cefrLevel: newGramCefr,
          formula: newGramFormula.trim(),
          explanationVi: newGramExplanation.trim(),
          examples,
        },
        sessionNote: newGrammarNote.trim(),
      });
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['session', id], res.session);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['grammar'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setNewGramTitle('');
      setNewGramTitleVi('');
      setNewGramFormula('');
      setNewGramExplanation('');
      setNewGramExEn('');
      setNewGramExVi('');
      setNewGramMistakeWrong('');
      setNewGramMistakeRight('');
      setNewGramMistakeNote('');
      setNewGrammarNote('');
      success('Đã tạo chủ điểm ngữ pháp mới và liên kết vào buổi học');
    },
    onError: (err) => {
      toastError(
        'Không thể tạo chủ điểm ngữ pháp',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const removeGrammarMutation = useMutation({
    mutationFn: (topicId: string) => api.removeSessionGrammar(id, topicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      info('Đã gỡ chủ điểm ngữ pháp khỏi buổi học');
    },
    onError: (err) => {
      toastError('Không thể gỡ ngữ pháp', err instanceof Error ? err.message : undefined);
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: () => api.completeSession(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(['session', id], updated);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      setCompleteModalOpen(false);
      success(
        'Đã hoàn thành buổi học!',
        'Từ vựng và ngữ pháp đã được đồng bộ vào lịch ôn tập thông minh.',
      );
    },
    onError: (err) => {
      toastError(
        'Không thể hoàn thành buổi học',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  // Bulk preview memo
  const bulkParseResult = useMemo(() => parseBulkVocabulary(bulkText), [bulkText]);

  const existingLibraryByNorm = useMemo(() => {
    const map = new Map<string, { id: string; word: string; vietnameseMeaning: string }>();
    for (const v of vocabLibraryQuery.data ?? []) {
      map.set(v.normalizedWord, {
        id: v.id,
        word: v.word,
        vietnameseMeaning: v.vietnameseMeaning,
      });
    }
    return map;
  }, [vocabLibraryQuery.data]);

  const sessionVocabNormSet = useMemo(() => {
    const set = new Set<string>();
    for (const v of sessionQuery.data?.vocabulary ?? []) {
      set.add(normalizeWord(v.word));
    }
    return set;
  }, [sessionQuery.data?.vocabulary]);

  const bulkExistingDbCount = useMemo(
    () =>
      bulkParseResult.rows.filter(
        (r) => !r.isDuplicateInBatch && existingLibraryByNorm.has(r.normalizedWord),
      ).length,
    [bulkParseResult.rows, existingLibraryByNorm],
  );

  const validBulkRows = useMemo(
    () => bulkParseResult.rows.filter((r) => !r.isDuplicateInBatch),
    [bulkParseResult.rows],
  );

  // Filter linkable existing vocabulary not yet in session
  const linkableExistingVocab = useMemo(() => {
    const term = normalizeWord(existingVocabSearch);
    return (vocabLibraryQuery.data ?? [])
      .filter((v) => !sessionVocabNormSet.has(v.normalizedWord))
      .filter((v) => {
        if (!term) return true;
        return (
          v.normalizedWord.includes(term) ||
          v.vietnameseMeaning.toLowerCase().includes(term)
        );
      })
      .slice(0, 60);
  }, [vocabLibraryQuery.data, sessionVocabNormSet, existingVocabSearch]);

  // Filter linkable grammar topics not yet in session
  const linkedTopicIds = useMemo(
    () => new Set((sessionQuery.data?.grammarTopics ?? []).map((g) => g.topicId)),
    [sessionQuery.data?.grammarTopics],
  );

  const linkableGrammarTopics = useMemo(
    () => (grammarTopicsQuery.data ?? []).filter((t) => !linkedTopicIds.has(t.id)),
    [grammarTopicsQuery.data, linkedTopicIds],
  );

  const handleQuickAddSubmit = () => {
    if (!qaWord.trim() || quickAddVocabMutation.isPending) return;
    quickAddVocabMutation.mutate({
      word: qaWord.trim(),
      vietnameseMeaning: qaMeaning.trim(),
      ipa: qaIpa.trim(),
      exampleSentence: qaExample.trim(),
    });
  };

  const startInlineEdit = (item: SessionVocabularyItemDto) => {
    setEditingVocabId(item.vocabularyId);
    setEditMeaning(item.vietnameseMeaning);
    setEditIpa(item.ipa);
    setEditExample('');
    setEditExampleVi('');
  };

  const saveInlineEdit = (item: SessionVocabularyItemDto) => {
    if (inlineUpdateVocabMutation.isPending) return;
    inlineUpdateVocabMutation.mutate({
      item,
      vietnameseMeaning: editMeaning,
      ipa: editIpa,
      newExample: editExample,
      newExampleVi: editExampleVi,
    });
  };

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-32 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]" />
        <div className="h-96 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]" />
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="mb-2 h-8 w-8 text-[var(--danger-ink)]" aria-hidden="true" />
          <h1 className="text-[18px] font-semibold text-[var(--ink-primary)]">
            Không tìm thấy buổi học
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            {sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : 'Buổi học không tồn tại hoặc đã bị xóa.'}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to="/sessions"
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 text-[14px] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              ← Quay lại danh sách
            </Link>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => sessionQuery.refetch()}
            >
              Thử lại
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const session = sessionQuery.data;
  const isCompleted = session.status === 'completed';

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb + Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/sessions"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Danh sách buổi học
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <span
            role="status"
            className={cn(
              'inline-flex items-center gap-1.5 text-[12.5px]',
              autosaveState === 'error'
                ? 'text-[var(--danger-ink)]'
                : autosaveState === 'saving'
                  ? 'text-[var(--ink-muted)]'
                  : 'text-[var(--success-ink)]',
            )}
          >
            {autosaveState === 'saving' ? (
              <>Đang lưu...</>
            ) : autosaveState === 'saved' ? (
              <>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Đã tự động lưu
              </>
            ) : autosaveState === 'error' ? (
              <>Chưa tự động lưu được</>
            ) : null}
          </span>

          {isCompleted ? (
            <Link
              to={`/practice?tab=vocab&sessionId=${session.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3.5 text-[13.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Luyện từ vựng buổi này
            </Link>
          ) : (
            <Button
              variant="primary"
              size="md"
              leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setCompleteModalOpen(true)}
            >
              Hoàn thành buổi học
            </Button>
          )}
        </div>
      </div>

      {/* Completed Banner */}
      {isCompleted ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--success-border)] bg-[var(--success-soft)] px-4 py-3 text-[13.5px] text-[var(--success-ink)]"
        >
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Đã hoàn thành{session.completedAt ? ` (${formatDateVi(session.completedAt)})` : ''} —
              Có thể tiếp tục bổ sung từ vựng, ngữ pháp và ghi chú bất cứ lúc nào.
            </span>
          </div>
        </div>
      ) : null}

      {/* Editable Session Header Card */}
      <Card elevated>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={isCompleted ? 'success' : 'warning'} size="md">
                {isCompleted ? 'Đã hoàn thành' : 'Bản nháp'}
              </Badge>
              <span className="text-[12.5px] text-[var(--ink-muted)]">
                {session.vocabCount} từ vựng · {session.grammarCount} chủ điểm ngữ pháp
              </span>
            </div>
            <h1 className="sr-only">{meta.title || session.title}</h1>
          </div>

          <div className="grid gap-3 md:grid-cols-12">
            <Input
              label="Tiêu đề buổi học"
              wrapperClassName="md:col-span-5"
              value={meta.title}
              onChange={(e) => setMeta((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Tên buổi học..."
              required
            />
            <Input
              label="Ngày học"
              type="date"
              wrapperClassName="md:col-span-2"
              value={meta.learningDate}
              onChange={(e) =>
                setMeta((prev) => ({ ...prev, learningDate: e.target.value }))
              }
              required
            />
            <Select
              label="Nguồn học"
              wrapperClassName="md:col-span-3"
              value={meta.sourceType}
              onChange={(e) =>
                setMeta((prev) => ({
                  ...prev,
                  sourceType: e.target.value as SessionSourceType,
                }))
              }
              options={SESSION_SOURCES.map((src) => ({
                value: src,
                label: SESSION_SOURCE_LABELS[src],
              }))}
            />
            <Input
              label="Loại hình học"
              wrapperClassName="md:col-span-2"
              value={meta.learningType}
              onChange={(e) =>
                setMeta((prev) => ({ ...prev, learningType: e.target.value }))
              }
              placeholder="IELTS, Giao tiếp..."
            />
          </div>
        </CardContent>
      </Card>

      {/* 3 Workspace Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} ariaLabel="Không gian buổi học">
        <TabsList>
          <TabsTrigger value="vocab">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span>Từ vựng</span>
            <Badge tone="neutral" size="sm">
              {session.vocabCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="grammar">
            <BookMarked className="h-4 w-4" aria-hidden="true" />
            <span>Ngữ pháp</span>
            <Badge tone="neutral" size="sm">
              {session.grammarCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="notes">
            <NotebookPen className="h-4 w-4" aria-hidden="true" />
            <span>Ghi chú</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: VOCABULARY */}
        <TabsContent value="vocab" className="space-y-5 pt-5">
          {/* Quick Add Bar */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Thêm từ nhanh (Quick Add)</CardTitle>
                  <CardDescription>
                    Nhập từ tiếng Anh rồi nhấn <kbd className="formula">Enter</kbd> để lưu ngay
                    (cho phép lưu từ chưa có nghĩa để bổ sung sau).
                  </CardDescription>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => setImportOpen(true)}
                >
                  Nhập CSV / Excel
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleQuickAddSubmit();
                }}
                className="grid gap-3 md:grid-cols-12 md:items-end"
              >
                <Input
                  ref={wordInputRef}
                  label="Từ / Cụm từ tiếng Anh *"
                  wrapperClassName="md:col-span-3"
                  value={qaWord}
                  onChange={(e) => setQaWord(e.target.value)}
                  onKeyDown={onImeSafeEnter(handleQuickAddSubmit)}
                  placeholder="Ví dụ: exacerbate"
                  required
                />
                <Input
                  label="Nghĩa tiếng Việt"
                  wrapperClassName="md:col-span-3"
                  value={qaMeaning}
                  onChange={(e) => setQaMeaning(e.target.value)}
                  onKeyDown={onImeSafeEnter(handleQuickAddSubmit)}
                  placeholder="làm trầm trọng thêm (tùy chọn)"
                />
                <Input
                  label="IPA"
                  wrapperClassName="md:col-span-2"
                  className="ipa"
                  value={qaIpa}
                  onChange={(e) => setQaIpa(e.target.value)}
                  onKeyDown={onImeSafeEnter(handleQuickAddSubmit)}
                  placeholder="/ɪɡˈzæs.ə.beɪt/"
                />
                <Input
                  label="Câu ví dụ"
                  wrapperClassName="md:col-span-3"
                  value={qaExample}
                  onChange={(e) => setQaExample(e.target.value)}
                  onKeyDown={onImeSafeEnter(handleQuickAddSubmit)}
                  placeholder="Ví dụ ngữ cảnh (tùy chọn)"
                />
                <div className="md:col-span-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="w-full"
                    loading={quickAddVocabMutation.isPending}
                    disabled={!qaWord.trim()}
                    aria-label="Thêm từ vào buổi học"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </form>

              {/* Link Existing Library Word */}
              {linkableExistingVocab.length > 0 || existingVocabSearch ? (
                <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-3.5 sm:flex-row sm:items-end">
                  <Input
                    label="Liên kết từ đã có trong thư viện"
                    wrapperClassName="sm:w-56"
                    value={existingVocabSearch}
                    onChange={(e) => setExistingVocabSearch(e.target.value)}
                    placeholder="Lọc từ sẵn có..."
                  />
                  <Select
                    label="Chọn từ vựng"
                    wrapperClassName="flex-1"
                    value={selectedExistingVocabId}
                    onChange={(e) => setSelectedExistingVocabId(e.target.value)}
                    placeholder="— Chọn từ có sẵn để gắn vào buổi học —"
                    options={linkableExistingVocab.map((v) => ({
                      value: v.id,
                      label: `${v.word}${v.vietnameseMeaning ? ` — ${v.vietnameseMeaning}` : ''}`,
                    }))}
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={!selectedExistingVocabId}
                    loading={quickAddVocabMutation.isPending}
                    leftIcon={<Link2 className="h-4 w-4" aria-hidden="true" />}
                    onClick={() => {
                      if (selectedExistingVocabId) {
                        quickAddVocabMutation.mutate({
                          vocabularyId: selectedExistingVocabId,
                        });
                      }
                    }}
                  >
                    Liên kết
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Bulk Paste Collapsible Section */}
          <Card>
            <div className="flex items-center justify-between px-5 py-3.5">
              <button
                type="button"
                aria-expanded={bulkOpen}
                aria-controls="bulk-paste-panel"
                onClick={() => setBulkOpen((v) => !v)}
                className="flex flex-1 items-center justify-between gap-3 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-[6px]"
              >
                <span className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink-primary)]">
                  <ClipboardPaste className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                  Dán hàng loạt nhiều dòng (Bulk Paste)
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ink-muted)]">
                  <span>Hỗ trợ Tab, dấu -, :, | hoặc mỗi dòng 1 từ</span>
                  {bulkOpen ? (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
              </button>
            </div>

            {bulkOpen ? (
              <CardContent
                id="bulk-paste-panel"
                className="space-y-4 border-t border-[var(--border-hairline)] pt-4"
              >
                <Textarea
                  label="Danh sách từ vựng (mỗi từ một dòng)"
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`Ví dụ:\nmeticulous\ttỉ mỉ\t/məˈtɪk.jə.ləs/\tShe is meticulous about details.\nubiquitous - phổ biến khắp nơi\nameliorate : cải thiện\nprocrastinate`}
                />

                {bulkParseResult.totalNonEmptyLines > 0 ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="accent" size="md">
                          {validBulkRows.length} từ hợp lệ
                        </Badge>
                        {bulkParseResult.duplicateInBatchCount > 0 ? (
                          <Badge tone="warning" size="md">
                            {bulkParseResult.duplicateInBatchCount} trùng trong đoạn dán (sẽ bỏ qua)
                          </Badge>
                        ) : null}
                        {bulkExistingDbCount > 0 ? (
                          <Badge tone="info" size="md">
                            {bulkExistingDbCount} từ đã có trong thư viện
                          </Badge>
                        ) : null}
                        {bulkParseResult.incompleteCount > 0 ? (
                          <Badge tone="warning" size="md">
                            {bulkParseResult.incompleteCount} từ chưa có nghĩa
                          </Badge>
                        ) : null}
                      </div>

                      <div className="w-full sm:w-72">
                        <Select
                          label="Khi gặp từ đã có trong thư viện"
                          value={duplicateStrategy}
                          onChange={(e) =>
                            setDuplicateStrategy(e.target.value as DuplicateStrategy)
                          }
                          options={[
                            {
                              value: 'link_existing',
                              label: 'Giữ từ cũ & liên kết vào buổi học',
                            },
                            {
                              value: 'merge',
                              label: 'Bổ sung nghĩa/IPA còn thiếu vào từ cũ',
                            },
                            { value: 'skip', label: 'Bỏ qua từ đã tồn tại' },
                          ]}
                        />
                      </div>
                    </div>

                    <ResponsiveTableRegion
                      ariaLabel="Xem trước danh sách từ vựng dán hàng loạt"
                      maxHeight="280px"
                    >
                      <table className="w-full text-left text-[12.5px]">
                        <thead>
                          <tr className="bg-[var(--bg-subtle)] text-[var(--ink-secondary)]">
                            <th scope="col" className="border-b border-[var(--border-hairline)] px-3 py-2">
                              Dòng
                            </th>
                            <th scope="col" className="border-b border-[var(--border-hairline)] px-3 py-2">
                              Từ tiếng Anh
                            </th>
                            <th scope="col" className="border-b border-[var(--border-hairline)] px-3 py-2">
                              Nghĩa tiếng Việt
                            </th>
                            <th scope="col" className="border-b border-[var(--border-hairline)] px-3 py-2">
                              IPA / Ví dụ
                            </th>
                            <th scope="col" className="border-b border-[var(--border-hairline)] px-3 py-2">
                              Kiểm tra
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkParseResult.rows.map((row) => {
                            const inDb = existingLibraryByNorm.has(row.normalizedWord);
                            const inSession = sessionVocabNormSet.has(row.normalizedWord);
                            return (
                              <tr
                                key={`${row.rowNumber}-${row.normalizedWord}`}
                                className={cn(
                                  'border-b border-[var(--border-hairline)] last:border-b-0',
                                  row.isDuplicateInBatch && 'opacity-55',
                                )}
                              >
                                <td className="px-3 py-2 text-[var(--ink-muted)]">
                                  {row.rowNumber}
                                </td>
                                <th
                                  scope="row"
                                  className="bg-[var(--bg-surface)] px-3 py-2 font-medium text-[var(--ink-primary)]"
                                >
                                  {row.word}
                                </th>
                                <td data-label="Nghĩa" className="px-3 py-2 text-[var(--ink-secondary)]">
                                  {row.vietnameseMeaning || (
                                    <span className="italic text-[var(--ink-muted)]">
                                      Chưa có nghĩa
                                    </span>
                                  )}
                                </td>
                                <td data-label="IPA / Ví dụ" className="px-3 py-2 text-[var(--ink-muted)]">
                                  {row.ipa ? (
                                    <span className="ipa mr-2">{row.ipa}</span>
                                  ) : null}
                                  {row.exampleSentence || (!row.ipa ? '—' : '')}
                                </td>
                                <td data-label="Kiểm tra" className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {row.isDuplicateInBatch ? (
                                      <Badge tone="danger" size="sm">
                                        Trùng trong đoạn dán
                                      </Badge>
                                    ) : null}
                                    {!row.isDuplicateInBatch && inSession ? (
                                      <Badge tone="neutral" size="sm">
                                        Đã có trong buổi học
                                      </Badge>
                                    ) : null}
                                    {!row.isDuplicateInBatch && inDb && !inSession ? (
                                      <Badge tone="info" size="sm">
                                        Đã có trong thư viện
                                      </Badge>
                                    ) : null}
                                    {row.isIncomplete ? (
                                      <Badge tone="warning" size="sm">
                                        Thiếu nghĩa
                                      </Badge>
                                    ) : null}
                                    {!row.isDuplicateInBatch && !inDb && !row.isIncomplete ? (
                                      <Badge tone="success" size="sm">
                                        Từ mới
                                      </Badge>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </ResponsiveTableRegion>

                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setBulkText('')}>
                        Xóa nội dung
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        disabled={validBulkRows.length === 0}
                        loading={bulkAddMutation.isPending}
                        onClick={() =>
                          bulkAddMutation.mutate({
                            rows: validBulkRows.map((r) => ({
                              word: r.word,
                              vietnameseMeaning: r.vietnameseMeaning,
                              ipa: r.ipa,
                              exampleSentence: r.exampleSentence,
                              exampleTranslation: r.exampleTranslation,
                            })),
                            duplicateStrategy,
                          })
                        }
                      >
                        Lưu tất cả hợp lệ vào buổi học ({validBulkRows.length})
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            ) : null}
          </Card>

          {/* Session Vocabulary List with Inline Editing */}
          <Card>
            <CardHeader>
              <CardTitle>Từ vựng trong buổi học ({session.vocabulary.length})</CardTitle>
              <CardDescription>
                Nhấn biểu tượng chỉnh sửa trên từng dòng để bổ sung nghĩa tiếng Việt, IPA hoặc thêm
                câu ví dụ ngay tại chỗ.
              </CardDescription>
            </CardHeader>

            <CardContent>
              {session.vocabulary.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-5 w-5" />}
                  title="Buổi học chưa có từ vựng nào"
                  description="Dùng thanh Thêm từ nhanh phía trên hoặc mở phần Dán hàng loạt / Nhập CSV."
                />
              ) : (
                <ul className="divide-y divide-[var(--border-hairline)]">
                  {session.vocabulary.map((item) => {
                    const isEditing = editingVocabId === item.vocabularyId;
                    return (
                      <li key={item.sessionLinkId} className="py-3.5 first:pt-0 last:pb-0">
                        {isEditing ? (
                          <div className="space-y-3 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)]/30 p-3.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[14px] font-semibold text-[var(--ink-primary)]">
                                Đang sửa nhanh: {item.word}
                              </p>
                              <div className="flex gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingVocabId(null)}
                                >
                                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                                  Hủy
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  loading={inlineUpdateVocabMutation.isPending}
                                  leftIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
                                  onClick={() => saveInlineEdit(item)}
                                >
                                  Lưu
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                label="Nghĩa tiếng Việt"
                                autoFocus
                                value={editMeaning}
                                onChange={(e) => setEditMeaning(e.target.value)}
                                onKeyDown={onImeSafeEnter(() => saveInlineEdit(item))}
                                placeholder="Nhập nghĩa tiếng Việt..."
                              />
                              <Input
                                label="Phiên âm IPA"
                                className="ipa"
                                value={editIpa}
                                onChange={(e) => setEditIpa(e.target.value)}
                                onKeyDown={onImeSafeEnter(() => saveInlineEdit(item))}
                                placeholder="/.../"
                              />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input
                                label="Thêm câu ví dụ mới (tùy chọn)"
                                value={editExample}
                                onChange={(e) => setEditExample(e.target.value)}
                                onKeyDown={onImeSafeEnter(() => saveInlineEdit(item))}
                                placeholder="English sentence..."
                              />
                              <Input
                                label="Dịch câu ví dụ (tùy chọn)"
                                value={editExampleVi}
                                onChange={(e) => setEditExampleVi(e.target.value)}
                                onKeyDown={onImeSafeEnter(() => saveInlineEdit(item))}
                                placeholder="Nghĩa tiếng Việt của câu..."
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  to={`/vocabulary/${item.vocabularyId}`}
                                  className="text-[15px] font-semibold text-[var(--ink-primary)] hover:text-[var(--accent)]"
                                >
                                  {item.word}
                                </Link>
                                {item.ipa ? (
                                  <span className="ipa text-[13px] text-[var(--ink-muted)]">
                                    {item.ipa}
                                  </span>
                                ) : null}
                                {item.cefrLevel !== 'unknown' ? (
                                  <Badge tone="neutral" size="sm">
                                    {item.cefrLevel}
                                  </Badge>
                                ) : null}
                                {item.isIncomplete ? (
                                  <Badge tone="warning" size="sm">
                                    Còn thiếu nghĩa
                                  </Badge>
                                ) : null}
                                <span className="text-[11px] text-[var(--ink-muted)]">
                                  · {ADDED_VIA_LABELS[item.addedVia]}
                                </span>
                              </div>

                              <p className="text-[13.5px] text-[var(--ink-secondary)]">
                                {item.vietnameseMeaning || (
                                  <span className="italic text-[var(--ink-muted)]">
                                    Chưa có nghĩa tiếng Việt — nhấn sửa nhanh để bổ sung
                                  </span>
                                )}
                              </p>

                              {item.examples[0] ? (
                                <p className="text-[12.5px] text-[var(--ink-muted)]">
                                  Ví dụ:{' '}
                                  {highlightTargetWord(
                                    item.examples[0].englishSentence,
                                    item.examples[0].highlightText || item.word,
                                  ).map((seg, idx) =>
                                    seg.highlighted ? (
                                      <mark
                                        key={idx}
                                        className="rounded bg-[var(--accent-soft)] px-0.5 font-medium text-[var(--accent)]"
                                      >
                                        {seg.text}
                                      </mark>
                                    ) : (
                                      <span key={idx}>{seg.text}</span>
                                    ),
                                  )}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Sửa nhanh từ ${item.word}`}
                                onClick={() => startInlineEdit(item)}
                              >
                                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                                Sửa nhanh
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Gỡ từ ${item.word} khỏi buổi học`}
                                loading={removeVocabMutation.isPending}
                                onClick={() => removeVocabMutation.mutate(item.vocabularyId)}
                                className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: GRAMMAR */}
        <TabsContent value="grammar" className="space-y-5 pt-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Panel A: Link existing grammar topic */}
            <Card>
              <CardHeader>
                <CardTitle>Chọn chủ điểm ngữ pháp có sẵn</CardTitle>
                <CardDescription>
                  Liên kết một chủ điểm đã có trong kho ngữ pháp kèm ghi chú riêng cho buổi học này.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (selectedTopicId) linkExistingGrammarMutation.mutate();
                  }}
                  className="space-y-4"
                >
                  <Select
                    label="Chủ điểm ngữ pháp"
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.target.value)}
                    placeholder="— Chọn chủ điểm ngữ pháp —"
                    options={linkableGrammarTopics.map((t) => ({
                      value: t.id,
                      label: `${t.title}${t.titleVi ? ` (${t.titleVi})` : ''} · ${t.categoryNameVi || t.categoryName}`,
                    }))}
                  />
                  <Textarea
                    label="Ghi chú riêng cho buổi học (tùy chọn)"
                    rows={3}
                    value={existingGrammarNote}
                    onChange={(e) => setExistingGrammarNote(e.target.value)}
                    placeholder="Ví dụ: Thầy lưu ý trường hợp ngoại lệ với động từ tri giác..."
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!selectedTopicId}
                    loading={linkExistingGrammarMutation.isPending}
                    leftIcon={<Link2 className="h-4 w-4" aria-hidden="true" />}
                  >
                    Liên kết vào buổi học
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Panel B: Create new grammar topic inline */}
            <Card>
              <CardHeader>
                <CardTitle>Tạo chủ điểm ngữ pháp mới ngay tại chỗ</CardTitle>
                <CardDescription>
                  Tự động thêm vào kho ngữ pháp cá nhân và gắn vào buổi học hiện tại.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newGramCategoryId || !newGramTitle.trim()) return;
                    createAndLinkGrammarMutation.mutate();
                  }}
                  className="space-y-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select
                      label="Danh mục *"
                      wrapperClassName="sm:col-span-2"
                      required
                      value={newGramCategoryId}
                      onChange={(e) => setNewGramCategoryId(e.target.value)}
                      options={(grammarCategoriesQuery.data ?? []).map((cat) => ({
                        value: cat.id,
                        label: cat.nameVi || cat.name,
                      }))}
                    />
                    <Select
                      label="CEFR"
                      value={newGramCefr}
                      onChange={(e) => setNewGramCefr(e.target.value as CefrLevel)}
                      options={CEFR_LEVELS.map((lv) => ({
                        value: lv,
                        label: lv === 'unknown' ? 'Khác' : lv,
                      }))}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Tên chủ điểm (Tiếng Anh) *"
                      required
                      value={newGramTitle}
                      onChange={(e) => setNewGramTitle(e.target.value)}
                      placeholder="Present Perfect Continuous"
                    />
                    <Input
                      label="Tên tiếng Việt"
                      value={newGramTitleVi}
                      onChange={(e) => setNewGramTitleVi(e.target.value)}
                      placeholder="Hiện tại hoàn thành tiếp diễn"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      label="Công thức (Formula)"
                      wrapperClassName="sm:col-span-2"
                      className="formula"
                      value={newGramFormula}
                      onChange={(e) => setNewGramFormula(e.target.value)}
                      placeholder="S + have/has + been + V-ing"
                    />
                    <Select
                      label="Độ khó"
                      value={newGramDifficulty}
                      onChange={(e) =>
                        setNewGramDifficulty(e.target.value as GrammarDifficulty)
                      }
                      options={GRAMMAR_DIFFICULTIES.map((d) => ({
                        value: d,
                        label: GRAMMAR_DIFFICULTY_LABELS[d],
                      }))}
                    />
                  </div>

                  <Textarea
                    label="Giải thích tiếng Việt"
                    rows={2}
                    value={newGramExplanation}
                    onChange={(e) => setNewGramExplanation(e.target.value)}
                    placeholder="Diễn tả hành động bắt đầu trong quá khứ và còn tiếp tục..."
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Ví dụ tiếng Anh"
                      value={newGramExEn}
                      onChange={(e) => setNewGramExEn(e.target.value)}
                      placeholder="I have been studying for two hours."
                    />
                    <Input
                      label="Dịch ví dụ (Việt)"
                      value={newGramExVi}
                      onChange={(e) => setNewGramExVi(e.target.value)}
                      placeholder="Tôi đã học liên tục được 2 tiếng."
                    />
                  </div>

                  <div className="space-y-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
                    <p className="text-[12px] font-medium text-[var(--ink-secondary)]">
                      Lỗi thường gặp & cách sửa (tùy chọn)
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <Input
                        label="Câu hay viết sai"
                        value={newGramMistakeWrong}
                        onChange={(e) => setNewGramMistakeWrong(e.target.value)}
                        placeholder="I am studying since 2 hours."
                      />
                      <Input
                        label="Câu sửa đúng"
                        value={newGramMistakeRight}
                        onChange={(e) => setNewGramMistakeRight(e.target.value)}
                        placeholder="I have been studying for 2 hours."
                      />
                    </div>
                    <Input
                      label="Ghi chú sửa lỗi (Tiếng Việt)"
                      value={newGramMistakeNote}
                      onChange={(e) => setNewGramMistakeNote(e.target.value)}
                      placeholder="Dùng Present Perfect Continuous với 'for + khoảng thời gian'."
                    />
                  </div>

                  <Input
                    label="Ghi chú cho buổi học này (tùy chọn)"
                    value={newGrammarNote}
                    onChange={(e) => setNewGrammarNote(e.target.value)}
                    placeholder="Lưu ý thêm từ buổi học..."
                  />

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!newGramCategoryId || !newGramTitle.trim()}
                    loading={createAndLinkGrammarMutation.isPending}
                    leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                  >
                    Tạo & liên kết vào buổi học
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Linked Grammar Topics List */}
          <Card>
            <CardHeader>
              <CardTitle>
                Chủ điểm ngữ pháp trong buổi học ({session.grammarTopics.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {session.grammarTopics.length === 0 ? (
                <EmptyState
                  icon={<BookMarked className="h-5 w-5" />}
                  title="Chưa liên kết chủ điểm ngữ pháp nào"
                  description="Chọn chủ điểm có sẵn hoặc tạo nhanh một chủ điểm ngữ pháp mới ở phía trên."
                />
              ) : (
                <ul className="space-y-3">
                  {session.grammarTopics.map((topic) => (
                    <li
                      key={topic.sessionLinkId}
                      className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="neutral" size="sm">
                              {topic.categoryNameVi || topic.categoryName}
                            </Badge>
                            <Badge tone="accent" size="sm">
                              {GRAMMAR_STATUS_LABELS[topic.learningStatus]}
                            </Badge>
                            <Badge tone="info" size="sm">
                              {GRAMMAR_DIFFICULTY_LABELS[topic.difficulty]} · {topic.cefrLevel}
                            </Badge>
                          </div>

                          <div>
                            <Link
                              to={`/grammar/${topic.topicId}`}
                              className="text-[16px] font-semibold text-[var(--ink-primary)] hover:text-[var(--accent)]"
                            >
                              {topic.title}
                            </Link>
                            {topic.titleVi ? (
                              <p className="text-[13px] text-[var(--ink-secondary)]">
                                {topic.titleVi}
                              </p>
                            ) : null}
                          </div>

                          {topic.formula ? (
                            <p className="formula inline-block rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[13px] text-[var(--ink-primary)]">
                              {topic.formula}
                            </p>
                          ) : null}

                          {topic.explanationVi ? (
                            <p className="text-[13.5px] text-[var(--ink-secondary)]">
                              {topic.explanationVi}
                            </p>
                          ) : null}

                          {topic.sessionNote ? (
                            <p className="rounded-[6px] border border-[var(--accent-border)] bg-[var(--accent-soft)]/50 px-3 py-1.5 text-[12.5px] text-[var(--ink-primary)]">
                              <strong>Ghi chú buổi học:</strong> {topic.sessionNote}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            to={`/grammar/${topic.topicId}`}
                            className="inline-flex h-8 items-center rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-[12.5px] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                          >
                            Mở chi tiết →
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Gỡ chủ điểm ${topic.title} khỏi buổi học`}
                            loading={removeGrammarMutation.isPending}
                            onClick={() => removeGrammarMutation.mutate(topic.topicId)}
                            className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: NOTES */}
        <TabsContent value="notes" className="pt-5">
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Ghi chú lớp học, thắc mắc và quan sát cá nhân</CardTitle>
                <CardDescription>
                  Mọi thay đổi được tự động lưu sau khi bạn ngừng gõ.
                </CardDescription>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={updateMetaMutation.isPending}
                leftIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => updateMetaMutation.mutate(meta)}
              >
                Lưu ghi chú ngay
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea
                label="Ghi chú lớp học, thắc mắc và quan sát cá nhân"
                rows={14}
                value={meta.generalNotes}
                onChange={(e) =>
                  setMeta((prev) => ({ ...prev, generalNotes: e.target.value }))
                }
                placeholder="Ghi lại lời giải thích của giáo viên, thắc mắc cần tra thêm, lỗi phát âm hoặc điểm cần chú ý khi viết/nói..."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import CSV / Excel Modal */}
      <ImportVocabModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        sessionId={id}
      />

      {/* Pre-Completion Preview Modal */}
      <Dialog
        open={completeModalOpen}
        onOpenChange={(open) => setCompleteModalOpen(open)}
        title="Kiểm tra trước khi hoàn thành buổi học"
        description="Xem lại danh sách từ vựng và ngữ pháp trước khi đồng bộ vào lịch ôn tập SM-2."
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCompleteModalOpen(false)}
            >
              Tiếp tục chỉnh sửa
            </Button>
            <Button
              variant="primary"
              disabled={updateMetaMutation.isPending}
              loading={completeSessionMutation.isPending}
              leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => completeSessionMutation.mutate()}
            >
              Xác nhận hoàn thành buổi học
            </Button>
          </>
        }
      >
        {completionPreviewQuery.isLoading ? (
          <div className="space-y-3 py-4" aria-busy="true">
            <div className="h-14 animate-pulse rounded-[8px] bg-[var(--bg-subtle)]" />
            <div className="h-24 animate-pulse rounded-[8px] bg-[var(--bg-subtle)]" />
          </div>
        ) : completionPreviewQuery.isError || !completionPreviewQuery.data ? (
          <p className="text-[13.5px] text-[var(--danger-ink)]">
            Không thể tải bản xem trước hoàn thành buổi học.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
                <p className="text-[12px] text-[var(--ink-muted)]">Từ vựng sẽ đồng bộ ôn tập</p>
                <p className="mt-1 text-[22px] font-semibold text-[var(--ink-primary)]">
                  {completionPreviewQuery.data.vocabCount} từ
                </p>
                <p className="text-[12px] text-[var(--ink-secondary)]">
                  Tạo lịch ôn 2 chiều (Anh → Việt & Việt → Anh)
                </p>
              </div>
              <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
                <p className="text-[12px] text-[var(--ink-muted)]">Ngữ pháp sẽ đồng bộ ôn tập</p>
                <p className="mt-1 text-[22px] font-semibold text-[var(--ink-primary)]">
                  {completionPreviewQuery.data.grammarCount} chủ điểm
                </p>
                <p className="text-[12px] text-[var(--ink-secondary)]">
                  Đưa vào lịch luyện tập nhắc lại ngắt quãng
                </p>
              </div>
            </div>

            {completionPreviewQuery.data.duplicateWarnings.length > 0 ? (
              <div className="rounded-[8px] border border-[var(--info-border)] bg-[var(--info-soft)] p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--info-ink)]">
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  Từ đã từng xuất hiện ở buổi học trước (
                  {completionPreviewQuery.data.duplicateWarnings.length})
                </p>
                <p className="mt-1 text-[12.5px] text-[var(--ink-secondary)]">
                  Các từ này được giữ liên kết chung, không tạo trùng trong thư viện:
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {completionPreviewQuery.data.duplicateWarnings.map((dup) => (
                    <li key={dup.existingVocabId}>
                      <Link
                        to={`/vocabulary/${dup.existingVocabId}`}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--info-border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-primary)] hover:text-[var(--accent)]"
                      >
                        {dup.word} ({dup.sessionCount} buổi)
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {completionPreviewQuery.data.incompleteEntries.length > 0 ? (
              <div className="rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--warning-ink)]">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Từ vựng còn thiếu thông tin (
                  {completionPreviewQuery.data.incompleteEntries.length})
                </p>
                <p className="mt-1 text-[12.5px] text-[var(--ink-secondary)]">
                  Bạn vẫn có thể hoàn thành buổi học ngay và bổ sung nghĩa hoặc ví dụ sau:
                </p>
                <ul className="mt-2 space-y-1 text-[12.5px]">
                  {completionPreviewQuery.data.incompleteEntries.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/vocabulary/${entry.id}`}
                        className="font-semibold text-[var(--ink-primary)] underline hover:text-[var(--accent)]"
                      >
                        {entry.word}
                      </Link>
                      <span className="text-[var(--ink-secondary)]">
                        — thiếu {entry.missingFields.join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {completionPreviewQuery.data.vocabCount === 0 &&
            completionPreviewQuery.data.grammarCount === 0 ? (
              <p className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-[13px] text-[var(--ink-secondary)]">
                Buổi học này chưa có từ vựng hoặc ngữ pháp nào, nhưng bạn vẫn có thể đánh dấu hoàn
                thành để lưu ghi chú buổi học.
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
    </div>
  );
}
