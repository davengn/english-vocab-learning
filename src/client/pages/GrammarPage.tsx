import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookMarked,
  Clock,
  FolderPlus,
  HelpCircle,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  CefrLevel,
  GrammarCategoryDto,
  GrammarDifficulty,
  GrammarLearningStatus,
} from '@shared/apiTypes';
import {
  CEFR_LEVELS,
  GRAMMAR_DIFFICULTIES,
  GRAMMAR_DIFFICULTY_LABELS,
  GRAMMAR_STATUS_LABELS,
} from '@shared/schemas';
import { api } from '@client/lib/api';
import { cn, formatRelativeDueVi } from '@client/lib/utils';
import { Badge, type BadgeTone } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';

const STATUS_BADGE_TONE: Record<GrammarLearningStatus, BadgeTone> = {
  not_started: 'neutral',
  learning: 'warning',
  practicing: 'info',
  mastered: 'success',
};

const DIFFICULTY_BADGE_TONE: Record<GrammarDifficulty, BadgeTone> = {
  beginner: 'success',
  intermediate: 'accent',
  advanced: 'warning',
};

/**
 * Grammar Knowledge Base index page with category sidebar, multi-faceted filters,
 * custom category CRUD, and full structured topic creation modal.
 */
export function GrammarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  // Filter state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    () => searchParams.get('categoryId') ?? '',
  );
  const [searchText, setSearchText] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [cefrFilter, setCefrFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [createTopicOpen, setCreateTopicOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<GrammarCategoryDto | null>(null);

  // Sync URL query params (?new=1 and ?categoryId=...)
  useEffect(() => {
    const urlCat = searchParams.get('categoryId');
    if (urlCat !== null && urlCat !== selectedCategoryId) {
      setSelectedCategoryId(urlCat);
    }
    if (searchParams.get('new') === '1') {
      setCreateTopicOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedCategoryId, setSearchParams]);

  // Queries
  const categoriesQuery = useQuery({
    queryKey: ['grammar-categories'],
    queryFn: () => api.listGrammarCategories(),
  });

  const topicsQuery = useQuery({
    queryKey: [
      'grammar-topics',
      selectedCategoryId,
      difficultyFilter,
      cefrFilter,
      statusFilter,
      searchText.trim(),
    ],
    queryFn: () =>
      api.listGrammarTopics({
        categoryId: selectedCategoryId || undefined,
        difficulty: difficultyFilter || undefined,
        cefrLevel: cefrFilter || undefined,
        learningStatus: statusFilter || undefined,
        search: searchText.trim() || undefined,
      }),
  });

  const categories = categoriesQuery.data ?? [];
  const topics = topicsQuery.data ?? [];

  const totalTopicCount = useMemo(
    () => categories.reduce((sum, cat) => sum + cat.topicCount, 0),
    [categories],
  );

  // Create Category Form State
  const [catName, setCatName] = useState('');
  const [catNameVi, setCatNameVi] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catError, setCatError] = useState<string | undefined>();
  const catNameRef = useRef<HTMLInputElement>(null);

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      api.createGrammarCategory({
        name: catName.trim(),
        nameVi: catNameVi.trim() || catName.trim(),
        description: catDesc.trim(),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['grammar-categories'] });
      success(`Đã thêm danh mục "${created.nameVi || created.name}"`);
      setCatName('');
      setCatNameVi('');
      setCatDesc('');
      setCatError(undefined);
      setCreateCategoryOpen(false);
      setSelectedCategoryId(created.id);
    },
    onError: (err) => {
      showError(
        'Không thể tạo danh mục',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api.deleteGrammarCategory(id),
    onSuccess: (_res, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['grammar-categories'] });
      queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      if (selectedCategoryId === deletedId) {
        setSelectedCategoryId('');
      }
      success('Đã xóa danh mục ngữ pháp');
      setCategoryToDelete(null);
    },
    onError: (err) => {
      showError(
        'Không thể xóa danh mục',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  // Create Topic Form State
  const [topicCategoryId, setTopicCategoryId] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [topicTitleVi, setTopicTitleVi] = useState('');
  const [topicDifficulty, setTopicDifficulty] = useState<GrammarDifficulty>('intermediate');
  const [topicCefr, setTopicCefr] = useState<CefrLevel>('B1');
  const [topicFormula, setTopicFormula] = useState('');
  const [topicExplanationVi, setTopicExplanationVi] = useState('');
  const [topicWhat, setTopicWhat] = useState('');
  const [topicWhy, setTopicWhy] = useState('');
  const [topicWhen, setTopicWhen] = useState('');
  const [topicHow, setTopicHow] = useState('');
  const [exSentence, setExSentence] = useState('');
  const [exTranslation, setExTranslation] = useState('');
  const [exHighlight, setExHighlight] = useState('');
  const [mistakeIncorrect, setMistakeIncorrect] = useState('');
  const [mistakeCorrect, setMistakeCorrect] = useState('');
  const [mistakeNote, setMistakeNote] = useState('');
  const [topicFormError, setTopicFormError] = useState<string | null>(null);
  const topicTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!createTopicOpen) return;
    if (selectedCategoryId) {
      setTopicCategoryId(selectedCategoryId);
    } else if (!topicCategoryId && categories.length > 0) {
      setTopicCategoryId(categories[0].id);
    }
  }, [createTopicOpen, selectedCategoryId, categories, topicCategoryId]);

  const resetTopicForm = () => {
    setTopicTitle('');
    setTopicTitleVi('');
    setTopicDifficulty('intermediate');
    setTopicCefr('B1');
    setTopicFormula('');
    setTopicExplanationVi('');
    setTopicWhat('');
    setTopicWhy('');
    setTopicWhen('');
    setTopicHow('');
    setExSentence('');
    setExTranslation('');
    setExHighlight('');
    setMistakeIncorrect('');
    setMistakeCorrect('');
    setMistakeNote('');
    setTopicFormError(null);
  };

  const isTopicFormDirty = Boolean(
    topicTitle.trim() ||
      topicTitleVi.trim() ||
      topicFormula.trim() ||
      topicExplanationVi.trim() ||
      exSentence.trim() ||
      mistakeIncorrect.trim(),
  );

  const createTopicMutation = useMutation({
    mutationFn: () => {
      const examples: Array<{
        englishSentence: string;
        vietnameseTranslation: string;
        structureHighlight: string;
        isCommonMistake: boolean;
        incorrectVersion: string;
        correctionNote: string;
      }> = [];

      if (exSentence.trim()) {
        examples.push({
          englishSentence: exSentence.trim(),
          vietnameseTranslation: exTranslation.trim(),
          structureHighlight: exHighlight.trim(),
          isCommonMistake: false,
          incorrectVersion: '',
          correctionNote: '',
        });
      }

      if (mistakeIncorrect.trim() || mistakeCorrect.trim()) {
        examples.push({
          englishSentence: mistakeCorrect.trim() || mistakeIncorrect.trim(),
          vietnameseTranslation: '',
          structureHighlight: '',
          isCommonMistake: true,
          incorrectVersion: mistakeIncorrect.trim(),
          correctionNote: mistakeNote.trim(),
        });
      }

      return api.createGrammarTopic({
        categoryId: topicCategoryId,
        title: topicTitle.trim(),
        titleVi: topicTitleVi.trim(),
        difficulty: topicDifficulty,
        cefrLevel: topicCefr,
        learningStatus: 'learning',
        formula: topicFormula.trim(),
        explanationVi: topicExplanationVi.trim(),
        whatItIs: topicWhat.trim(),
        whyUsed: topicWhy.trim(),
        whenUsed: topicWhen.trim(),
        howToRecognize: topicHow.trim(),
        examples,
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
      queryClient.invalidateQueries({ queryKey: ['grammar-categories'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success(`Đã tạo chủ điểm "${created.title}"`);
      resetTopicForm();
      setCreateTopicOpen(false);
      navigate(`/grammar/${created.id}`);
    },
    onError: (err) => {
      setTopicFormError(
        err instanceof Error ? err.message : 'Không thể tạo chủ điểm ngữ pháp.',
      );
    },
  });

  const handleCreateCategorySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      setCatError('Vui lòng nhập tên danh mục (tiếng Anh hoặc tiếng Việt).');
      catNameRef.current?.focus();
      return;
    }
    setCatError(undefined);
    createCategoryMutation.mutate();
  };

  const handleCreateTopicSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!topicCategoryId) {
      setTopicFormError('Vui lòng chọn danh mục ngữ pháp.');
      return;
    }
    if (!topicTitle.trim()) {
      setTopicFormError('Vui lòng nhập tên chủ điểm tiếng Anh.');
      topicTitleRef.current?.focus();
      return;
    }
    if (mistakeIncorrect.trim() && !mistakeCorrect.trim()) {
      setTopicFormError('Khi thêm lỗi thường gặp, vui lòng nhập cả câu đúng tương ứng.');
      return;
    }
    setTopicFormError(null);
    createTopicMutation.mutate();
  };

  const hasActiveFilters = Boolean(
    selectedCategoryId || searchText.trim() || difficultyFilter || cefrFilter || statusFilter,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--ink-primary)]">
            Kho kiến thức Ngữ pháp
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            Tài liệu học tập có cấu trúc rõ ràng: bản chất, công thức, dấu hiệu nhận biết, lỗi người Việt hay gặp và ghi chú cá nhân.
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setCreateTopicOpen(true)}
        >
          Tạo chủ điểm ngữ pháp
        </Button>
      </div>

      {/* Main 2-column Knowledge Base Layout */}
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left Category Sidebar */}
        <aside aria-label="Danh mục ngữ pháp" className="space-y-3">
          <div className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Danh mục ({categories.length})
              </span>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => setCreateCategoryOpen(true)}
              >
                Thêm danh mục
              </Button>
            </div>

            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('')}
                className={cn(
                  'flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors cursor-pointer',
                  selectedCategoryId === ''
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-inset ring-[var(--accent-border)]'
                    : 'text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]',
                )}
              >
                <span className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Tất cả chủ điểm</span>
                </span>
                <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-secondary)]">
                  {totalTopicCount}
                </span>
              </button>

              {categories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <div
                    key={cat.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-[8px] pr-1 transition-colors',
                      isSelected
                        ? 'bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent-border)]'
                        : 'hover:bg-[var(--bg-subtle)]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2 text-left cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'truncate text-[13px] font-medium',
                            isSelected ? 'text-[var(--accent)]' : 'text-[var(--ink-primary)]',
                          )}
                        >
                          {cat.nameVi || cat.name}
                        </p>
                        {cat.nameVi && cat.nameVi !== cat.name && (
                          <p className="truncate text-[11px] text-[var(--ink-muted)]">
                            {cat.name}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--bg-canvas)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-secondary)]">
                        {cat.topicCount}
                      </span>
                    </button>

                    {!cat.isSystem && (
                      <button
                        type="button"
                        aria-label={`Xóa danh mục ${cat.nameVi || cat.name}`}
                        onClick={() => setCategoryToDelete(cat)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Main Pane */}
        <div className="min-w-0 space-y-4">
          <search>
            <div className="grid gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_150px_130px_165px]">
              <Input
                type="search"
                aria-label="Tìm kiếm chủ điểm ngữ pháp"
                leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm tên chủ điểm, công thức, giải thích..."
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
              />

              <Select
                aria-label="Lọc theo độ khó"
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
                placeholder="Tất cả độ khó"
                options={GRAMMAR_DIFFICULTIES.map((d) => ({
                  value: d,
                  label: GRAMMAR_DIFFICULTY_LABELS[d],
                }))}
              />

              <Select
                aria-label="Lọc theo trình độ CEFR"
                value={cefrFilter}
                onChange={(e) => setCefrFilter(e.target.value)}
                placeholder="Tất cả CEFR"
                options={CEFR_LEVELS.map((lv) => ({
                  value: lv,
                  label: lv === 'unknown' ? 'Chưa phân loại' : lv,
                }))}
              />

              <Select
                aria-label="Lọc theo trạng thái học"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                placeholder="Tất cả trạng thái"
                options={(['not_started', 'learning', 'practicing', 'mastered'] as const).map(
                  (st) => ({
                    value: st,
                    label: GRAMMAR_STATUS_LABELS[st],
                  }),
                )}
              />
            </div>
          </search>

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[var(--ink-secondary)]">
              <span>Tìm thấy {topics.length} chủ điểm ngữ pháp</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedCategoryId('');
                  setSearchText('');
                  setDifficultyFilter('');
                  setCefrFilter('');
                  setStatusFilter('');
                }}
              >
                Xóa bộ lọc
              </Button>
            </div>
          )}

          {topicsQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
                />
              ))}
            </div>
          ) : topics.length === 0 ? (
            <EmptyState
              icon={<BookMarked className="h-5 w-5" />}
              title="Chưa có chủ điểm ngữ pháp phù hợp"
              description={
                hasActiveFilters
                  ? 'Thử bỏ bớt bộ lọc hoặc tạo một chủ điểm mới trong danh mục này.'
                  : 'Hãy tạo bài học ngữ pháp đầu tiên để ghi chép công thức và ví dụ.'
              }
              actionLabel="Tạo chủ điểm ngữ pháp"
              onAction={() => setCreateTopicOpen(true)}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {topics.map((topic) => {
                const formulaFirstLine = topic.formula
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .slice(0, 2)
                  .join(' · ');

                const nextReviewText = topic.reviewState
                  ? formatRelativeDueVi(topic.reviewState.nextReviewAt)
                  : null;
                const isDueNow =
                  topic.reviewState &&
                  new Date(topic.reviewState.nextReviewAt).getTime() <= Date.now();

                return (
                  <Card
                    key={topic.id}
                    className="flex flex-col justify-between transition-colors hover:border-[var(--border-strong)]"
                  >
                    <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">
                            {topic.categoryNameVi || topic.categoryName}
                          </Badge>
                          {topic.cefrLevel !== 'unknown' && (
                            <Badge tone="info">{topic.cefrLevel}</Badge>
                          )}
                          <Badge tone={DIFFICULTY_BADGE_TONE[topic.difficulty]}>
                            {GRAMMAR_DIFFICULTY_LABELS[topic.difficulty]}
                          </Badge>
                          <Badge tone={STATUS_BADGE_TONE[topic.learningStatus]}>
                            {GRAMMAR_STATUS_LABELS[topic.learningStatus]}
                          </Badge>
                        </div>

                        <div>
                          <Link
                            to={`/grammar/${topic.id}`}
                            className="text-[17px] font-semibold leading-[1.35] text-[var(--ink-primary)] hover:text-[var(--accent)] hover:underline"
                          >
                            {topic.title}
                          </Link>
                          {topic.titleVi && (
                            <p className="mt-0.5 text-[14px] font-medium text-[var(--ink-secondary)]">
                              {topic.titleVi}
                            </p>
                          )}
                        </div>

                        {formulaFirstLine && (
                          <pre className="formula overflow-x-auto rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-[12px] leading-[1.5] text-[var(--ink-primary)] whitespace-pre-wrap">
                            {formulaFirstLine}
                          </pre>
                        )}

                        {topic.explanationVi && (
                          <p className="line-clamp-2 text-[13px] leading-[1.55] text-[var(--ink-secondary)]">
                            {topic.explanationVi}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3 text-[12px] text-[var(--ink-muted)]">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            {topic.exampleCount} ví dụ
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            {topic.questionCount} câu hỏi
                          </span>
                          {nextReviewText && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 font-medium',
                                isDueNow ? 'text-[var(--warning-ink)]' : 'text-[var(--ink-muted)]',
                              )}
                            >
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              {nextReviewText}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            to={`/practice?tab=grammar&topicId=${topic.id}`}
                            className="font-medium text-[var(--accent)] hover:underline"
                          >
                            Luyện tập
                          </Link>
                          <Link
                            to={`/grammar/${topic.id}`}
                            className="font-medium text-[var(--ink-primary)] hover:text-[var(--accent)] hover:underline"
                          >
                            Xem bài học →
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Category Dialog */}
      <Dialog
        open={createCategoryOpen}
        onOpenChange={(open) => {
          setCreateCategoryOpen(open);
          if (!open) setCatError(undefined);
        }}
        title="Thêm danh mục ngữ pháp mới"
        description="Tạo nhóm chủ điểm riêng ngoài 16 danh mục mặc định của hệ thống."
        size="sm"
        dirty={Boolean(catName.trim() || catNameVi.trim() || catDesc.trim())}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateCategoryOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form="create-category-form"
              variant="primary"
              loading={createCategoryMutation.isPending}
            >
              Tạo danh mục
            </Button>
          </>
        }
      >
        <form id="create-category-form" onSubmit={handleCreateCategorySubmit} className="space-y-4">
          <Input
            ref={catNameRef}
            label="Tên danh mục (Tiếng Anh)"
            required
            error={catError}
            value={catName}
            onChange={(e) => {
              setCatName(e.target.value);
              if (catError && e.target.value.trim()) setCatError(undefined);
            }}
            placeholder="Ví dụ: IELTS Writing Structures"
          />
          <Input
            label="Tên hiển thị tiếng Việt"
            value={catNameVi}
            onChange={(e) => setCatNameVi(e.target.value)}
            placeholder="Ví dụ: Cấu trúc viết IELTS"
          />
          <Textarea
            label="Mô tả ngắn (tùy chọn)"
            rows={2}
            value={catDesc}
            onChange={(e) => setCatDesc(e.target.value)}
            placeholder="Ghi chú nội dung chính của danh mục này..."
          />
        </form>
      </Dialog>

      {/* Delete Custom Category Confirmation Dialog */}
      <Dialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => {
          if (!open) setCategoryToDelete(null);
        }}
        title="Xác nhận xóa danh mục"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCategoryToDelete(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteCategoryMutation.isPending}
              onClick={() => {
                if (categoryToDelete) {
                  deleteCategoryMutation.mutate(categoryToDelete.id);
                }
              }}
            >
              Xóa danh mục
            </Button>
          </>
        }
      >
        {categoryToDelete && (
          <p className="text-[14px] leading-[1.6] text-[var(--ink-secondary)]">
            Bạn chắc chắn muốn xóa danh mục{' '}
            <strong className="text-[var(--ink-primary)]">
              {categoryToDelete.nameVi || categoryToDelete.name}
            </strong>
            ?
            {categoryToDelete.topicCount > 0
              ? ` Lưu ý: ${categoryToDelete.topicCount} chủ điểm bên trong danh mục này cũng sẽ bị xóa.`
              : ''}
          </p>
        )}
      </Dialog>

      {/* Create New Grammar Topic Dialog */}
      <Dialog
        open={createTopicOpen}
        onOpenChange={(open) => {
          setCreateTopicOpen(open);
          if (!open) resetTopicForm();
        }}
        title="Tạo chủ điểm ngữ pháp mới"
        description="Ghi chép cấu trúc theo mô hình hiểu bản chất: Là gì, Tại sao dùng, Khi nào dùng và Dấu hiệu nhận biết."
        size="xl"
        dirty={isTopicFormDirty}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                resetTopicForm();
                setCreateTopicOpen(false);
              }}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              form="create-grammar-topic-form"
              variant="primary"
              loading={createTopicMutation.isPending}
            >
              Lưu & Mở bài học
            </Button>
          </>
        }
      >
        <form
          id="create-grammar-topic-form"
          onSubmit={handleCreateTopicSubmit}
          className="space-y-5"
        >
          {topicFormError && (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] text-[var(--danger-ink)]"
            >
              {topicFormError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Danh mục"
              required
              value={topicCategoryId}
              onChange={(e) => setTopicCategoryId(e.target.value)}
              options={categories.map((c) => ({
                value: c.id,
                label: c.nameVi ? `${c.nameVi} (${c.name})` : c.name,
              }))}
            />
            <Select
              label="Độ khó"
              value={topicDifficulty}
              onChange={(e) => setTopicDifficulty(e.target.value as GrammarDifficulty)}
              options={GRAMMAR_DIFFICULTIES.map((d) => ({
                value: d,
                label: GRAMMAR_DIFFICULTY_LABELS[d],
              }))}
            />
            <Select
              label="Trình độ CEFR"
              value={topicCefr}
              onChange={(e) => setTopicCefr(e.target.value as CefrLevel)}
              options={CEFR_LEVELS.map((lv) => ({
                value: lv,
                label: lv === 'unknown' ? 'Chưa phân loại' : lv,
              }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              ref={topicTitleRef}
              label="Tên chủ điểm (Tiếng Anh)"
              required
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              placeholder="Ví dụ: Past Perfect vs Past Simple"
            />
            <Input
              label="Tên tiếng Việt"
              value={topicTitleVi}
              onChange={(e) => setTopicTitleVi(e.target.value)}
              placeholder="Ví dụ: Thì Quá khứ hoàn thành & Quá khứ đơn"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              label="Công thức (Formula)"
              rows={3}
              className="formula"
              value={topicFormula}
              onChange={(e) => setTopicFormula(e.target.value)}
              placeholder="Khẳng định: S + had + V3/ed&#10;Phủ định: S + had not + V3/ed"
            />
            <Textarea
              label="Giải thích tổng quan (Tiếng Việt)"
              rows={3}
              value={topicExplanationVi}
              onChange={(e) => setTopicExplanationVi(e.target.value)}
              placeholder="Tóm tắt ngắn gọn ý nghĩa và chức năng chính..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea
              label="Là gì (What)"
              rows={2}
              value={topicWhat}
              onChange={(e) => setTopicWhat(e.target.value)}
              placeholder="Định nghĩa cốt lõi..."
            />
            <Textarea
              label="Tại sao dùng (Why)"
              rows={2}
              value={topicWhy}
              onChange={(e) => setTopicWhy(e.target.value)}
              placeholder="Mục đích giao tiếp của cấu trúc..."
            />
            <Textarea
              label="Khi nào dùng (When)"
              rows={2}
              value={topicWhen}
              onChange={(e) => setTopicWhen(e.target.value)}
              placeholder="Các tình huống áp dụng cụ thể..."
            />
            <Textarea
              label="Dấu hiệu nhận biết (How to recognize)"
              rows={2}
              value={topicHow}
              onChange={(e) => setTopicHow(e.target.value)}
              placeholder="Từ khóa thời gian, cấu trúc đi kèm..."
            />
          </div>

          <fieldset className="space-y-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)]/70 p-4">
            <legend className="px-1 text-[13px] font-semibold text-[var(--ink-primary)]">
              Ví dụ mở đầu (tùy chọn)
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Câu ví dụ tiếng Anh"
                value={exSentence}
                onChange={(e) => setExSentence(e.target.value)}
                placeholder="By the time we arrived, the train had left."
              />
              <Input
                label="Dịch tiếng Việt"
                value={exTranslation}
                onChange={(e) => setExTranslation(e.target.value)}
                placeholder="Khi chúng tôi tới, tàu đã rời đi rồi."
              />
              <Input
                label="Cụm cần tô sáng"
                value={exHighlight}
                onChange={(e) => setExHighlight(e.target.value)}
                placeholder="had left"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)]/40 p-4">
            <legend className="px-1 text-[13px] font-semibold text-[var(--warning-ink)]">
              Lỗi thường gặp của người Việt (tùy chọn)
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Câu sai thường gặp"
                value={mistakeIncorrect}
                onChange={(e) => setMistakeIncorrect(e.target.value)}
                placeholder="By the time we arrived, the train left."
              />
              <Input
                label="Câu đúng tương ứng"
                value={mistakeCorrect}
                onChange={(e) => setMistakeCorrect(e.target.value)}
                placeholder="By the time we arrived, the train had left."
              />
              <Input
                label="Ghi chú sửa lỗi"
                value={mistakeNote}
                onChange={(e) => setMistakeNote(e.target.value)}
                placeholder="Hành động xảy ra trước một mốc quá khứ dùng had + V3."
              />
            </div>
          </fieldset>
        </form>
      </Dialog>
    </div>
  );
}
