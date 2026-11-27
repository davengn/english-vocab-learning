import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Dumbbell,
  Edit3,
  GitCompare,
  HelpCircle,
  NotebookPen,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CefrLevel,
  GrammarDifficulty,
  GrammarLearningStatus,
  GrammarTopicDetailDto,
} from '@shared/apiTypes';
import {
  CEFR_LEVELS,
  GRAMMAR_DIFFICULTIES,
  GRAMMAR_DIFFICULTY_LABELS,
  GRAMMAR_QUESTION_TYPE_LABELS,
  GRAMMAR_STATUS_LABELS,
  SESSION_SOURCE_LABELS,
} from '@shared/schemas';
import { api } from '@client/lib/api';
import { cn, formatDateVi, formatRelativeDueVi, highlightTargetWord } from '@client/lib/utils';
import { QuestionBuilderModal } from '@client/components/practice/QuestionBuilderModal';
import { Badge, type BadgeTone } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';

interface EditableExample {
  englishSentence: string;
  vietnameseTranslation: string;
  structureHighlight: string;
  isCommonMistake: boolean;
  incorrectVersion: string;
  correctionNote: string;
}

interface EditableComparison {
  comparedTopicTitle: string;
  comparedTopicId: string | null;
  differenceVi: string;
  contextExampleA: string;
  contextExampleB: string;
  commonMistakeVi: string;
}

interface GrammarEditDraft {
  categoryId: string;
  title: string;
  titleVi: string;
  difficulty: GrammarDifficulty;
  cefrLevel: CefrLevel;
  learningStatus: GrammarLearningStatus;
  explanationVi: string;
  explanationEn: string;
  whatItIs: string;
  whyUsed: string;
  whenUsed: string;
  howToRecognize: string;
  formula: string;
  usageNotes: string;
  classNotes: string;
  personalExplanations: string;
  customExamples: string;
  openQuestions: string;
  examples: EditableExample[];
  comparisons: EditableComparison[];
}

const TOC_ITEMS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'explanation', label: 'Giải thích bản chất' },
  { id: 'structure', label: 'Công thức & Ví dụ' },
  { id: 'comparisons', label: 'So sánh cấu trúc' },
  { id: 'notes', label: 'Ghi chú cá nhân' },
  { id: 'links', label: 'Liên kết & Bài tập' },
] as const;

const STATUS_BADGE_TONE: Record<GrammarLearningStatus, BadgeTone> = {
  not_started: 'neutral',
  learning: 'warning',
  practicing: 'info',
  mastered: 'success',
};

function toDraft(topic: GrammarTopicDetailDto): GrammarEditDraft {
  return {
    categoryId: topic.categoryId,
    title: topic.title,
    titleVi: topic.titleVi,
    difficulty: topic.difficulty,
    cefrLevel: topic.cefrLevel,
    learningStatus: topic.learningStatus,
    explanationVi: topic.explanationVi,
    explanationEn: topic.explanationEn,
    whatItIs: topic.whatItIs,
    whyUsed: topic.whyUsed,
    whenUsed: topic.whenUsed,
    howToRecognize: topic.howToRecognize,
    formula: topic.formula,
    usageNotes: topic.usageNotes,
    classNotes: topic.classNotes,
    personalExplanations: topic.personalExplanations,
    customExamples: topic.customExamples,
    openQuestions: topic.openQuestions,
    examples: topic.examples.map((ex) => ({
      englishSentence: ex.englishSentence,
      vietnameseTranslation: ex.vietnameseTranslation,
      structureHighlight: ex.structureHighlight,
      isCommonMistake: ex.isCommonMistake,
      incorrectVersion: ex.incorrectVersion,
      correctionNote: ex.correctionNote,
    })),
    comparisons: topic.comparisons.map((cmp) => ({
      comparedTopicTitle: cmp.comparedTopicTitle,
      comparedTopicId: cmp.comparedTopicId,
      differenceVi: cmp.differenceVi,
      contextExampleA: cmp.contextExampleA,
      contextExampleB: cmp.contextExampleB,
      commonMistakeVi: cmp.commonMistakeVi,
    })),
  };
}

function HighlightedSentence({ sentence, target }: { sentence: string; target: string }) {
  const segments = highlightTargetWord(sentence, target);
  return (
    <span>
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <mark
            key={idx}
            className="rounded bg-[var(--accent-soft)] px-1 py-0.5 font-semibold text-[var(--accent)]"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

/**
 * Amie-Docs-inspired 3-column structured Grammar Lesson detail page with sticky TOC scrollspy,
 * structured Vietnamese breakdown, inline learning status update, and full edit mode.
 */
export function GrammarDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GrammarEditDraft | null>(null);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const topicQuery = useQuery({
    queryKey: ['grammar-topic', id],
    queryFn: () => api.getGrammarTopic(id),
    enabled: Boolean(id),
  });

  const categoriesQuery = useQuery({
    queryKey: ['grammar-categories'],
    queryFn: () => api.listGrammarCategories(),
  });

  const topic = topicQuery.data;
  const categories = categoriesQuery.data ?? [];

  // Scrollspy tracking via IntersectionObserver for cross-browser TOC highlights
  useEffect(() => {
    if (!topic || isEditing) return;

    const sectionElements = TOC_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (sectionElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 },
    );

    sectionElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [topic, isEditing]);

  const statusMutation = useMutation({
    mutationFn: (learningStatus: GrammarLearningStatus) =>
      api.updateGrammarTopic(id, { learningStatus }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['grammar-topic', id], updated);
      queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success('Đã cập nhật trạng thái học');
    },
    onError: (err) => {
      showError(
        'Không thể cập nhật trạng thái',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: GrammarEditDraft) =>
      api.updateGrammarTopic(id, {
        ...payload,
        title: payload.title.trim(),
        titleVi: payload.titleVi.trim(),
        examples: payload.examples
          .filter((ex) => ex.englishSentence.trim())
          .map((ex) => ({
            ...ex,
            englishSentence: ex.englishSentence.trim(),
            vietnameseTranslation: ex.vietnameseTranslation.trim(),
            structureHighlight: ex.structureHighlight.trim(),
            incorrectVersion: ex.incorrectVersion.trim(),
            correctionNote: ex.correctionNote.trim(),
          })),
        comparisons: payload.comparisons
          .filter((cmp) => cmp.comparedTopicTitle.trim())
          .map((cmp) => ({
            ...cmp,
            comparedTopicTitle: cmp.comparedTopicTitle.trim(),
          })),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['grammar-topic', id], updated);
      queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
      queryClient.invalidateQueries({ queryKey: ['grammar-categories'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setIsEditing(false);
      setDraft(null);
      setEditError(null);
      success('Đã lưu bài học ngữ pháp');
    },
    onError: (err) => {
      setEditError(
        err instanceof Error ? err.message : 'Không thể lưu thay đổi bài học.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteGrammarTopic(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
      queryClient.invalidateQueries({ queryKey: ['grammar-categories'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success('Đã xóa chủ điểm ngữ pháp');
      navigate('/grammar');
    },
    onError: (err) => {
      showError(
        'Không thể xóa chủ điểm',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  if (topicQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--bg-subtle)]" />
        <div className="h-64 animate-pulse rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]" />
      </div>
    );
  }

  if (topicQuery.isError || !topic) {
    return (
      <EmptyState
        title="Không tìm thấy chủ điểm ngữ pháp"
        description="Bài học này có thể đã bị xóa hoặc đường dẫn không hợp lệ."
        actionLabel="Quay lại Kho ngữ pháp"
        onAction={() => navigate('/grammar')}
      />
    );
  }

  const standardExamples = topic.examples.filter((ex) => !ex.isCommonMistake);
  const mistakeExamples = topic.examples.filter(
    (ex) => ex.isCommonMistake || Boolean(ex.incorrectVersion.trim()),
  );

  const startEdit = () => {
    setDraft(toDraft(topic));
    setEditError(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditError(null);
    setIsEditing(false);
  };

  const handleEditSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) {
      setEditError('Tên chủ điểm tiếng Anh không được để trống.');
      return;
    }
    const invalidMistakeRow = draft.examples.find(
      (ex) => ex.isCommonMistake && ex.incorrectVersion.trim() && !ex.englishSentence.trim(),
    );
    if (invalidMistakeRow) {
      setEditError('Vui lòng nhập câu đúng chuẩn cho mỗi mục lỗi thường gặp.');
      return;
    }
    setEditError(null);
    updateMutation.mutate(draft);
  };

  const handleTocClick = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.focus({ preventScroll: true });
      setActiveSection(sectionId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-4">
        <Link
          to="/grammar"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quay lại Kho ngữ pháp
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {!isEditing ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={startEdit}
              >
                Chỉnh sửa bài học
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => navigate(`/practice?tab=grammar&topicId=${topic.id}`)}
              >
                Luyện chủ điểm này
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Xóa chủ điểm ngữ pháp"
                leftIcon={<Trash2 className="h-3.5 w-3.5 text-[var(--danger-ink)]" aria-hidden="true" />}
                onClick={() => setDeleteDialogOpen(true)}
              >
                Xóa
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={cancelEdit}
              >
                Hủy chỉnh sửa
              </Button>
              <Button
                type="submit"
                form="edit-grammar-form"
                variant="primary"
                size="sm"
                loading={updateMutation.isPending}
                leftIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                Lưu bài học
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content + Right TOC */}
      {isEditing && draft ? (
        <form id="edit-grammar-form" onSubmit={handleEditSubmit} className="max-w-[76ch] space-y-6">
          {editError && (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] text-[var(--danger-ink)]"
            >
              {editError}
            </div>
          )}

          {/* Core metadata */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                Thông tin tổng quan
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Tên chủ điểm (Tiếng Anh)"
                  required
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
                <Input
                  label="Tên tiếng Việt"
                  value={draft.titleVi}
                  onChange={(e) => setDraft({ ...draft, titleVi: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <Select
                  label="Danh mục"
                  value={draft.categoryId}
                  onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.nameVi || c.name,
                  }))}
                />
                <Select
                  label="Độ khó"
                  value={draft.difficulty}
                  onChange={(e) =>
                    setDraft({ ...draft, difficulty: e.target.value as GrammarDifficulty })
                  }
                  options={GRAMMAR_DIFFICULTIES.map((d) => ({
                    value: d,
                    label: GRAMMAR_DIFFICULTY_LABELS[d],
                  }))}
                />
                <Select
                  label="CEFR"
                  value={draft.cefrLevel}
                  onChange={(e) => setDraft({ ...draft, cefrLevel: e.target.value as CefrLevel })}
                  options={CEFR_LEVELS.map((lv) => ({
                    value: lv,
                    label: lv === 'unknown' ? 'Chưa phân loại' : lv,
                  }))}
                />
                <Select
                  label="Trạng thái học"
                  value={draft.learningStatus}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      learningStatus: e.target.value as GrammarLearningStatus,
                    })
                  }
                  options={(['not_started', 'learning', 'practicing', 'mastered'] as const).map(
                    (st) => ({
                      value: st,
                      label: GRAMMAR_STATUS_LABELS[st],
                    }),
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Explanations */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                Giải thích bản chất
              </h2>
              <Textarea
                label="Giải thích tiếng Việt"
                rows={3}
                value={draft.explanationVi}
                onChange={(e) => setDraft({ ...draft, explanationVi: e.target.value })}
              />
              <Textarea
                label="Giải thích tiếng Anh (tùy chọn)"
                rows={2}
                value={draft.explanationEn}
                onChange={(e) => setDraft({ ...draft, explanationEn: e.target.value })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea
                  label="Là gì (What)"
                  rows={2}
                  value={draft.whatItIs}
                  onChange={(e) => setDraft({ ...draft, whatItIs: e.target.value })}
                />
                <Textarea
                  label="Tại sao dùng (Why)"
                  rows={2}
                  value={draft.whyUsed}
                  onChange={(e) => setDraft({ ...draft, whyUsed: e.target.value })}
                />
                <Textarea
                  label="Khi nào dùng (When)"
                  rows={2}
                  value={draft.whenUsed}
                  onChange={(e) => setDraft({ ...draft, whenUsed: e.target.value })}
                />
                <Textarea
                  label="Dấu hiệu nhận biết (How to recognize)"
                  rows={2}
                  value={draft.howToRecognize}
                  onChange={(e) => setDraft({ ...draft, howToRecognize: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Structure, Examples & Mistakes */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                Công thức, Ví dụ & Lỗi thường gặp
              </h2>
              <Textarea
                label="Công thức (Formula)"
                rows={3}
                className="formula"
                value={draft.formula}
                onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
              />
              <Textarea
                label="Lưu ý sử dụng (Usage Notes)"
                rows={2}
                value={draft.usageNotes}
                onChange={(e) => setDraft({ ...draft, usageNotes: e.target.value })}
              />

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-semibold text-[var(--ink-primary)]">
                    Danh sách ví dụ & lỗi thường gặp ({draft.examples.length})
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        examples: [
                          ...draft.examples,
                          {
                            englishSentence: '',
                            vietnameseTranslation: '',
                            structureHighlight: '',
                            isCommonMistake: false,
                            incorrectVersion: '',
                            correctionNote: '',
                          },
                        ],
                      })
                    }
                  >
                    Thêm ví dụ
                  </Button>
                </div>

                {draft.examples.map((ex, idx) => (
                  <div
                    key={idx}
                    className="space-y-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--ink-primary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ex.isCommonMistake}
                          onChange={(e) => {
                            const next = [...draft.examples];
                            next[idx] = { ...ex, isCommonMistake: e.target.checked };
                            setDraft({ ...draft, examples: next });
                          }}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        <span>Đánh dấu là lỗi thường gặp</span>
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            examples: draft.examples.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-[var(--danger-ink)]" aria-hidden="true" />
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label={ex.isCommonMistake ? 'Câu đúng chuẩn (English)' : 'Câu ví dụ (English)'}
                        value={ex.englishSentence}
                        onChange={(e) => {
                          const next = [...draft.examples];
                          next[idx] = { ...ex, englishSentence: e.target.value };
                          setDraft({ ...draft, examples: next });
                        }}
                      />
                      <Input
                        label="Nghĩa tiếng Việt"
                        value={ex.vietnameseTranslation}
                        onChange={(e) => {
                          const next = [...draft.examples];
                          next[idx] = { ...ex, vietnameseTranslation: e.target.value };
                          setDraft({ ...draft, examples: next });
                        }}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Cụm cần tô sáng (highlight)"
                        value={ex.structureHighlight}
                        onChange={(e) => {
                          const next = [...draft.examples];
                          next[idx] = { ...ex, structureHighlight: e.target.value };
                          setDraft({ ...draft, examples: next });
                        }}
                      />
                      {ex.isCommonMistake && (
                        <Input
                          label="Câu sai người Việt hay viết"
                          value={ex.incorrectVersion}
                          onChange={(e) => {
                            const next = [...draft.examples];
                            next[idx] = { ...ex, incorrectVersion: e.target.value };
                            setDraft({ ...draft, examples: next });
                          }}
                        />
                      )}
                    </div>

                    {ex.isCommonMistake && (
                      <Input
                        label="Giải thích cách sửa lỗi"
                        value={ex.correctionNote}
                        onChange={(e) => {
                          const next = [...draft.examples];
                          next[idx] = { ...ex, correctionNote: e.target.value };
                          setDraft({ ...draft, examples: next });
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Comparisons */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                  So sánh cấu trúc ({draft.comparisons.length})
                </h2>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      comparisons: [
                        ...draft.comparisons,
                        {
                          comparedTopicTitle: '',
                          comparedTopicId: null,
                          differenceVi: '',
                          contextExampleA: '',
                          contextExampleB: '',
                          commonMistakeVi: '',
                        },
                      ],
                    })
                  }
                >
                  Thêm so sánh
                </Button>
              </div>

              {draft.comparisons.map((cmp, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      label="So sánh với cấu trúc"
                      wrapperClassName="flex-1"
                      value={cmp.comparedTopicTitle}
                      onChange={(e) => {
                        const next = [...draft.comparisons];
                        next[idx] = { ...cmp, comparedTopicTitle: e.target.value };
                        setDraft({ ...draft, comparisons: next });
                      }}
                      placeholder="Ví dụ: Past Simple (Quá khứ đơn)"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-5"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          comparisons: draft.comparisons.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--danger-ink)]" aria-hidden="true" />
                    </Button>
                  </div>

                  <Textarea
                    label="Điểm khác biệt cốt lõi (Tiếng Việt)"
                    rows={2}
                    value={cmp.differenceVi}
                    onChange={(e) => {
                      const next = [...draft.comparisons];
                      next[idx] = { ...cmp, differenceVi: e.target.value };
                      setDraft({ ...draft, comparisons: next });
                    }}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Ví dụ ngữ cảnh A"
                      value={cmp.contextExampleA}
                      onChange={(e) => {
                        const next = [...draft.comparisons];
                        next[idx] = { ...cmp, contextExampleA: e.target.value };
                        setDraft({ ...draft, comparisons: next });
                      }}
                    />
                    <Input
                      label="Ví dụ ngữ cảnh B"
                      value={cmp.contextExampleB}
                      onChange={(e) => {
                        const next = [...draft.comparisons];
                        next[idx] = { ...cmp, contextExampleB: e.target.value };
                        setDraft({ ...draft, comparisons: next });
                      }}
                    />
                  </div>

                  <Input
                    label="Nhầm lẫn phổ biến"
                    value={cmp.commonMistakeVi}
                    onChange={(e) => {
                      const next = [...draft.comparisons];
                      next[idx] = { ...cmp, commonMistakeVi: e.target.value };
                      setDraft({ ...draft, comparisons: next });
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Personal Notes */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                Ghi chú cá nhân
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea
                  label="Ghi chú trên lớp (Class Notes)"
                  rows={3}
                  value={draft.classNotes}
                  onChange={(e) => setDraft({ ...draft, classNotes: e.target.value })}
                />
                <Textarea
                  label="Cách hiểu của riêng bạn"
                  rows={3}
                  value={draft.personalExplanations}
                  onChange={(e) => setDraft({ ...draft, personalExplanations: e.target.value })}
                />
                <Textarea
                  label="Ví dụ tự đặt"
                  rows={3}
                  value={draft.customExamples}
                  onChange={(e) => setDraft({ ...draft, customExamples: e.target.value })}
                />
                <Textarea
                  label="Câu hỏi còn thắc mắc"
                  rows={3}
                  value={draft.openQuestions}
                  onChange={(e) => setDraft({ ...draft, openQuestions: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </form>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
          {/* Structured Lesson Document */}
          <article className="max-w-[72ch] space-y-10">
            {/* #overview */}
            <section id="overview" tabIndex={-1} className="scroll-mt-8 space-y-4 outline-none">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral" size="md">
                  {topic.categoryNameVi || topic.categoryName}
                </Badge>
                {topic.cefrLevel !== 'unknown' && (
                  <Badge tone="info" size="md">
                    {topic.cefrLevel}
                  </Badge>
                )}
                <Badge tone="accent" size="md">
                  {GRAMMAR_DIFFICULTY_LABELS[topic.difficulty]}
                </Badge>
                <Badge tone={STATUS_BADGE_TONE[topic.learningStatus]} size="md">
                  {GRAMMAR_STATUS_LABELS[topic.learningStatus]}
                </Badge>
              </div>

              <div>
                <h1 className="text-[28px] font-semibold leading-[1.25] tracking-tight text-[var(--ink-primary)]">
                  {topic.title}
                </h1>
                {topic.titleVi && (
                  <p className="mt-1.5 text-[17px] font-medium text-[var(--ink-secondary)]">
                    {topic.titleVi}
                  </p>
                )}
              </div>

              <div className="grid gap-4 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                <Select
                  label="Trạng thái nắm vững"
                  value={topic.learningStatus}
                  disabled={statusMutation.isPending}
                  onChange={(e) =>
                    statusMutation.mutate(e.target.value as GrammarLearningStatus)
                  }
                  options={(['not_started', 'learning', 'practicing', 'mastered'] as const).map(
                    (st) => ({
                      value: st,
                      label: GRAMMAR_STATUS_LABELS[st],
                    }),
                  )}
                />

                {topic.reviewState ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-[var(--border-hairline)] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                        Ôn tiếp theo
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-[var(--accent)]">
                        {formatRelativeDueVi(topic.reviewState.nextReviewAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                        Độ chính xác
                      </p>
                      <p className="mt-1 text-[13px] font-semibold text-[var(--ink-primary)]">
                        {Math.round(topic.reviewState.accuracyRate * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                        Chu kỳ / Ease
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-[var(--ink-primary)]">
                        {topic.reviewState.intervalDays}d · {topic.reviewState.easeFactor.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                        Lần quên
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-[var(--ink-primary)]">
                        {topic.reviewState.lapses} lần ({topic.reviewState.repetitions} lượt)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center text-[13px] text-[var(--ink-muted)]">
                    Chưa có lịch sử luyện tập SM-2. Hãy làm thử vài câu hỏi bên dưới.
                  </div>
                )}
              </div>
            </section>

            {/* #explanation */}
            <section id="explanation" tabIndex={-1} className="scroll-mt-8 space-y-4 outline-none">
              <h2 className="text-[20px] font-semibold text-[var(--ink-primary)]">
                Giải thích bản chất
              </h2>

              {topic.explanationVi && (
                <div className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
                  <p className="text-[15px] leading-[1.7] text-[var(--ink-primary)] whitespace-pre-line">
                    {topic.explanationVi}
                  </p>
                  {topic.explanationEn && (
                    <p className="mt-3 border-t border-[var(--border-hairline)] pt-3 text-[14px] italic leading-[1.6] text-[var(--ink-secondary)]">
                      {topic.explanationEn}
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { title: 'Là gì (What)', value: topic.whatItIs },
                  { title: 'Tại sao dùng (Why)', value: topic.whyUsed },
                  { title: 'Khi nào dùng (When)', value: topic.whenUsed },
                  { title: 'Dấu hiệu nhận biết (How)', value: topic.howToRecognize },
                ].map((block) => (
                  <div
                    key={block.title}
                    className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4"
                  >
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                      {block.title}
                    </p>
                    <p className="mt-1.5 text-[14px] leading-[1.6] text-[var(--ink-primary)] whitespace-pre-line">
                      {block.value || 'Chưa ghi chú mục này.'}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* #structure */}
            <section id="structure" tabIndex={-1} className="scroll-mt-8 space-y-5 outline-none">
              <h2 className="text-[20px] font-semibold text-[var(--ink-primary)]">
                Công thức & Ví dụ
              </h2>

              {topic.formula && (
                <div className="rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-soft)]/50 p-4">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Cấu trúc công thức
                  </p>
                  <pre className="formula overflow-x-auto text-[14px] leading-[1.7] text-[var(--ink-primary)] whitespace-pre-wrap">
                    {topic.formula}
                  </pre>
                </div>
              )}

              {topic.usageNotes && (
                <div className="rounded-[8px] border border-[var(--info-border)] bg-[var(--info-soft)] px-4 py-3 text-[14px] leading-[1.6] text-[var(--info-ink)]">
                  <strong className="font-semibold">Lưu ý quan trọng: </strong>
                  {topic.usageNotes}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                  Ví dụ minh họa ({standardExamples.length})
                </h3>
                {standardExamples.length === 0 ? (
                  <p className="text-[13px] text-[var(--ink-muted)]">
                    Chưa có câu ví dụ chuẩn nào. Nhấn “Chỉnh sửa bài học” để bổ sung.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {standardExamples.map((ex) => (
                      <div
                        key={ex.id}
                        className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3"
                      >
                        <p className="text-[15px] font-medium text-[var(--ink-primary)]">
                          <HighlightedSentence
                            sentence={ex.englishSentence}
                            target={ex.structureHighlight}
                          />
                        </p>
                        {ex.vietnameseTranslation && (
                          <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
                            {ex.vietnameseTranslation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Dedicated Common Mistakes Section */}
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-[16px] font-semibold text-[var(--warning-ink)]">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Lỗi thường gặp (Common Mistakes · {mistakeExamples.length})
                </h3>
                {mistakeExamples.length === 0 ? (
                  <p className="text-[13px] text-[var(--ink-muted)]">
                    Chưa ghi nhận lỗi phổ biến nào cho cấu trúc này.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {mistakeExamples.map((ex) => (
                      <div
                        key={ex.id}
                        className="space-y-2 rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-soft)]/45 p-4"
                      >
                        {ex.incorrectVersion && (
                          <div className="flex items-start gap-2 text-[14px] text-[var(--danger-ink)]">
                            <span className="font-semibold">Sai:</span>
                            <span className="line-through">{ex.incorrectVersion}</span>
                          </div>
                        )}
                        <div className="flex items-start gap-2 text-[14px] font-medium text-[var(--success-ink)]">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>Đúng: {ex.englishSentence}</span>
                        </div>
                        {ex.vietnameseTranslation && (
                          <p className="text-[13px] text-[var(--ink-secondary)]">
                            {ex.vietnameseTranslation}
                          </p>
                        )}
                        {ex.correctionNote && (
                          <p className="border-t border-[var(--warning-border)] pt-2 text-[13px] text-[var(--ink-primary)]">
                            {ex.correctionNote}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* #comparisons */}
            <section id="comparisons" tabIndex={-1} className="scroll-mt-8 space-y-4 outline-none">
              <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[var(--ink-primary)]">
                <GitCompare className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                So sánh cấu trúc
              </h2>

              {topic.comparisons.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)]">
                  Chưa có bảng so sánh với cấu trúc tương tự. Bạn có thể thêm trong phần chỉnh sửa.
                </p>
              ) : (
                <div className="space-y-4">
                  {topic.comparisons.map((cmp) => (
                    <Card key={cmp.id}>
                      <CardContent className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-[16px] font-semibold text-[var(--ink-primary)]">
                            {topic.title} <span className="text-[var(--ink-muted)]">vs</span>{' '}
                            {cmp.comparedTopicId ? (
                              <Link
                                to={`/grammar/${cmp.comparedTopicId}`}
                                className="text-[var(--accent)] hover:underline"
                              >
                                {cmp.comparedTopicTitle}
                              </Link>
                            ) : (
                              cmp.comparedTopicTitle
                            )}
                          </h3>
                        </div>

                        {cmp.differenceVi && (
                          <p className="text-[14px] leading-[1.6] text-[var(--ink-secondary)]">
                            {cmp.differenceVi}
                          </p>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                              Ngữ cảnh A
                            </p>
                            <p className="mt-1 text-[13px] font-medium text-[var(--ink-primary)]">
                              {cmp.contextExampleA || '—'}
                            </p>
                          </div>
                          <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--info-ink)]">
                              Ngữ cảnh B
                            </p>
                            <p className="mt-1 text-[13px] font-medium text-[var(--ink-primary)]">
                              {cmp.contextExampleB || '—'}
                            </p>
                          </div>
                        </div>

                        {cmp.commonMistakeVi && (
                          <p className="rounded-[6px] bg-[var(--warning-soft)] px-3 py-2 text-[13px] text-[var(--warning-ink)]">
                            <strong>Bẫy hay nhầm:</strong> {cmp.commonMistakeVi}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {/* #notes */}
            <section id="notes" tabIndex={-1} className="scroll-mt-8 space-y-4 outline-none">
              <h2 className="text-[20px] font-semibold text-[var(--ink-primary)]">
                Ghi chú cá nhân
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: 'Ghi chú từ lớp học', content: topic.classNotes },
                  { label: 'Cách tự diễn giải', content: topic.personalExplanations },
                  { label: 'Ví dụ tự đặt', content: topic.customExamples },
                  { label: 'Câu hỏi còn mở', content: topic.openQuestions },
                ].map((note) => (
                  <div
                    key={note.label}
                    className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4"
                  >
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      {note.label}
                    </p>
                    <p className="mt-1.5 text-[14px] leading-[1.6] text-[var(--ink-primary)] whitespace-pre-line">
                      {note.content || 'Chưa có ghi chú.'}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* #links */}
            <section id="links" tabIndex={-1} className="scroll-mt-8 space-y-6 outline-none">
              <h2 className="text-[20px] font-semibold text-[var(--ink-primary)]">
                Liên kết & Bài tập
              </h2>

              {/* Linked Sessions */}
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink-primary)]">
                  <NotebookPen className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                  Buổi học liên quan ({topic.linkedSessions.length})
                </h3>
                {topic.linkedSessions.length === 0 ? (
                  <p className="text-[13px] text-[var(--ink-muted)]">
                    Chủ điểm này chưa được gắn vào buổi học nào.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {topic.linkedSessions.map((sess) => (
                      <Link
                        key={sess.sessionId}
                        to={`/sessions/${sess.sessionId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3 hover:border-[var(--accent)]"
                      >
                        <div>
                          <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                            {sess.title}
                          </p>
                          <p className="text-[12px] text-[var(--ink-muted)]">
                            {formatDateVi(sess.learningDate)} · {SESSION_SOURCE_LABELS[sess.sourceType]}
                            {sess.sessionNote ? ` — ${sess.sessionNote}` : ''}
                          </p>
                        </div>
                        <span className="text-[12px] font-medium text-[var(--accent)]">
                          Mở buổi học →
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Practice Questions */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ink-primary)]">
                    <HelpCircle className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                    Câu hỏi luyện tập ({topic.linkedQuestions.length})
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={() => setQuestionModalOpen(true)}
                    >
                      Thêm câu hỏi cho chủ điểm này
                    </Button>
                    {topic.linkedQuestions.length > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon={<Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={() =>
                          navigate(`/practice?tab=grammar&topicId=${topic.id}&autostart=1`)
                        }
                      >
                        Luyện ngay
                      </Button>
                    )}
                  </div>
                </div>

                {topic.linkedQuestions.length === 0 ? (
                  <EmptyState
                    icon={<BookOpen className="h-5 w-5" />}
                    title="Chưa có câu hỏi nào cho chủ điểm này"
                    description="Tạo câu hỏi tự kiểm tra để củng cố cấu trúc qua 11 dạng bài tập khác nhau."
                    actionLabel="Thêm câu hỏi đầu tiên"
                    onAction={() => setQuestionModalOpen(true)}
                  />
                ) : (
                  <div className="space-y-2.5">
                    {topic.linkedQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">
                            {GRAMMAR_QUESTION_TYPE_LABELS[q.questionType]}
                          </Badge>
                          <Badge tone="accent">
                            {GRAMMAR_DIFFICULTY_LABELS[q.difficulty]}
                          </Badge>
                        </div>
                        <p className="mt-2 text-[14px] font-medium text-[var(--ink-primary)]">
                          {q.prompt}
                        </p>
                        <p className="mt-1 text-[13px] text-[var(--success-ink)]">
                          Đáp án: <span className="font-medium">{q.correctAnswer}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </article>

          {/* Right Sticky TOC ("Trong bài này") */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 space-y-4">
              <div className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                  Trong bài này
                </p>
                <nav aria-label="Trong bài này" className="space-y-1">
                  {TOC_ITEMS.map((item) => {
                    const isActive = activeSection === item.id;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        aria-current={isActive ? 'true' : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          handleTocClick(item.id);
                        }}
                        className={cn(
                          'flex items-center gap-2 border-l-2 py-1.5 pl-3 text-[13px] transition-colors',
                          isActive
                            ? 'border-[var(--accent)] font-semibold text-[var(--accent)]'
                            : 'border-transparent text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]',
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            isActive ? 'bg-[var(--accent)]' : 'bg-transparent',
                          )}
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                      </a>
                    );
                  })}
                </nav>
              </div>

              <div className="rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-soft)]/50 p-4 space-y-3">
                <p className="text-[13px] font-semibold text-[var(--ink-primary)]">
                  Sẵn sàng kiểm tra?
                </p>
                <p className="text-[12px] leading-[1.5] text-[var(--ink-secondary)]">
                  Hiện có {topic.linkedQuestions.length} câu hỏi gắn với chủ điểm này.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  leftIcon={<Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() =>
                    navigate(
                      `/practice?tab=grammar&topicId=${topic.id}${
                        topic.linkedQuestions.length > 0 ? '&autostart=1' : ''
                      }`,
                    )
                  }
                >
                  Luyện chủ điểm này
                </Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Question Builder Modal for this Topic */}
      <QuestionBuilderModal
        open={questionModalOpen}
        onOpenChange={setQuestionModalOpen}
        defaultGrammarTopicId={topic.id}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['grammar-topic', id] });
        }}
      />

      {/* Delete Topic Confirmation Modal */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Xác nhận xóa chủ điểm ngữ pháp"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Xóa chủ điểm
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[var(--ink-secondary)]">
          Bạn chắc chắn muốn xóa bài học{' '}
          <strong className="text-[var(--ink-primary)]">{topic.title}</strong>? Tất cả ví dụ,
          so sánh và lịch ôn SM-2 của chủ điểm này sẽ bị xóa.
        </p>
      </Dialog>
    </div>
  );
}
