import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Check,
  Edit3,
  FolderOpen,
  GitCompare,
  Layers,
  NotebookPen,
  Play,
  Plus,
  RefreshCw,
  Save,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, type BadgeTone } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { Input } from '@client/components/ui/Input';
import { ResponsiveTableRegion } from '@client/components/ui/ResponsiveTable';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';
import { ApiError, api } from '@client/lib/api';
import { onImeSafeEnter } from '@client/lib/ime';
import { cn, formatDateVi, formatRelativeDueVi, highlightTargetWord } from '@client/lib/utils';
import type {
  CefrLevel,
  VocabRegister,
  VocabRelationType,
  VocabTone,
  VocabularyDetailDto,
} from '@shared/apiTypes';
import {
  CEFR_LEVELS,
  PART_OF_SPEECH_OPTIONS,
  REGISTER_LABELS,
  SESSION_SOURCE_LABELS,
  SKILL_DIRECTIONS,
  SKILL_DIRECTION_LABELS,
  TONE_LABELS,
  VOCAB_STATUS_LABELS,
} from '@shared/schemas';

const RELATION_TYPE_LABELS: Record<VocabRelationType, string> = {
  synonym: 'Từ đồng nghĩa (Synonyms)',
  antonym: 'Từ trái nghĩa (Antonyms)',
  word_family: 'Gia đình từ (Word family)',
  phrasal_verb: 'Cụm động từ (Phrasal verbs)',
  common_phrase: 'Cụm từ thông dụng (Common phrases)',
  related_expression: 'Diễn đạt liên quan',
};

const RELATION_TYPES = Object.keys(RELATION_TYPE_LABELS) as VocabRelationType[];

const POS_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PART_OF_SPEECH_OPTIONS.map((o) => [o.value, o.label]),
);

const REVIEW_STATUS_DISPLAY: Record<
  'new' | 'learning' | 'review' | 'mastered',
  { label: string; tone: BadgeTone }
> = {
  new: { label: 'Mới', tone: 'neutral' },
  learning: { label: 'Đang học', tone: 'warning' },
  review: { label: 'Đang ôn', tone: 'info' },
  mastered: { label: 'Thành thạo', tone: 'success' },
};

interface EditableExample {
  englishSentence: string;
  vietnameseTranslation: string;
  highlightText: string;
}

interface EditableCollocation {
  phrase: string;
  vietnameseMeaning: string;
  exampleSentence: string;
  exampleTranslation: string;
}

interface EditableRelation {
  relationType: VocabRelationType;
  text: string;
  note: string;
}

interface VocabEditDraft {
  word: string;
  ipa: string;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  englishDefinition: string;
  vietnameseMeaning: string;
  confidenceLevel: number;
  isFavorite: boolean;
  vietnameseExplanation: string;
  englishExplanation: string;
  nuance: string;
  register: VocabRegister;
  tone: VocabTone;
  usageContext: string;
  whenToUse: string;
  whenNotToUse: string;
  examples: EditableExample[];
  collocations: EditableCollocation[];
  relations: EditableRelation[];
  vnCommonMistakes: string;
  vnWrongCombinations: string;
  vnConfusingWords: string;
  vnTranslationTraps: string;
  personalNotes: string;
  source: string;
  collectionIds: string[];
  tagNames: string[];
}

function buildDraftFromVocab(v: VocabularyDetailDto): VocabEditDraft {
  return {
    word: v.word,
    ipa: v.ipa,
    partOfSpeech: v.partOfSpeech || 'other',
    cefrLevel: v.cefrLevel,
    englishDefinition: v.englishDefinition,
    vietnameseMeaning: v.vietnameseMeaning,
    confidenceLevel: v.confidenceLevel,
    isFavorite: v.isFavorite,
    vietnameseExplanation: v.vietnameseExplanation,
    englishExplanation: v.englishExplanation,
    nuance: v.nuance,
    register: v.register,
    tone: v.tone,
    usageContext: v.usageContext,
    whenToUse: v.whenToUse,
    whenNotToUse: v.whenNotToUse,
    examples: v.examples.map((ex) => ({
      englishSentence: ex.englishSentence,
      vietnameseTranslation: ex.vietnameseTranslation,
      highlightText: ex.highlightText,
    })),
    collocations: v.collocations.map((col) => ({
      phrase: col.phrase,
      vietnameseMeaning: col.vietnameseMeaning,
      exampleSentence: col.exampleSentence,
      exampleTranslation: col.exampleTranslation,
    })),
    relations: v.relations.map((rel) => ({
      relationType: rel.relationType,
      text: rel.text,
      note: rel.note,
    })),
    vnCommonMistakes: v.vnCommonMistakes,
    vnWrongCombinations: v.vnWrongCombinations,
    vnConfusingWords: v.vnConfusingWords,
    vnTranslationTraps: v.vnTranslationTraps,
    personalNotes: v.personalNotes,
    source: v.source,
    collectionIds: v.collections.map((c) => c.id),
    tagNames: v.tags.map((t) => t.name),
  };
}

function HighlightedSentence({
  sentence,
  target,
}: {
  sentence: string;
  target: string;
}) {
  return (
    <>
      {highlightTargetWord(sentence, target).map((seg, idx) =>
        seg.highlighted ? (
          <mark
            key={idx}
            className="rounded bg-[var(--accent-soft)] px-1 font-medium text-[var(--accent)]"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function ViewField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  const clean = value?.trim();
  return (
    <div className="space-y-1">
      <dt className="text-[12px] font-medium text-[var(--ink-muted)]">{label}</dt>
      <dd
        className={cn(
          'text-[14px] leading-[1.55] text-[var(--ink-primary)]',
          multiline && 'whitespace-pre-line',
        )}
      >
        {clean ? (
          clean
        ) : (
          <span className="italic text-[var(--ink-muted)]">Chưa cập nhật</span>
        )}
      </dd>
    </div>
  );
}

export function VocabularyDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError, info } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<VocabEditDraft | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Quick example add in View mode
  const [quickExOpen, setQuickExOpen] = useState(false);
  const [quickExEn, setQuickExEn] = useState('');
  const [quickExVi, setQuickExVi] = useState('');

  const vocabQuery = useQuery({
    queryKey: ['vocabulary', 'detail', id],
    queryFn: () => api.getVocabulary(id),
    enabled: Boolean(id),
  });

  const collectionsQuery = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.listCollections(),
  });

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.listTags(),
  });

  useEffect(() => {
    setIsEditing(false);
    setFormError(null);
    setConflictId(null);
    setDeleteDialogOpen(false);
    setQuickExOpen(false);
    setQuickExEn('');
    setQuickExVi('');
    setNewTagInput('');
  }, [id]);

  useEffect(() => {
    if (vocabQuery.data && !isEditing) {
      setDraft(buildDraftFromVocab(vocabQuery.data));
    }
  }, [vocabQuery.data, isEditing]);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.updateVocabulary(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['vocabulary', 'detail', id], updated);
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setDraft(buildDraftFromVocab(updated));
      setFormError(null);
      setConflictId(null);
      setIsEditing(false);
      success(`Đã lưu thay đổi cho "${updated.word}"`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setConflictId(err.existingId ?? null);
        setFormError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : 'Không thể lưu thay đổi');
      }
      toastError('Lưu thay đổi thất bại', err instanceof Error ? err.message : undefined);
    },
  });

  const quickPatchMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.updateVocabulary(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['vocabulary', 'detail', id], updated);
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setDraft(buildDraftFromVocab(updated));
    },
    onError: (err) => {
      toastError('Không thể cập nhật', err instanceof Error ? err.message : undefined);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteVocabulary(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      success('Đã xóa từ vựng khỏi thư viện');
      navigate('/vocabulary');
    },
    onError: (err) => {
      toastError('Không thể xóa từ vựng', err instanceof Error ? err.message : undefined);
    },
  });

  const groupedRelations = useMemo(() => {
    const map = new Map<VocabRelationType, VocabularyDetailDto['relations']>();
    for (const rel of vocabQuery.data?.relations ?? []) {
      const list = map.get(rel.relationType) ?? [];
      list.push(rel);
      map.set(rel.relationType, list);
    }
    return map;
  }, [vocabQuery.data?.relations]);

  const handleSaveFullEdit = () => {
    if (!draft) return;
    setFormError(null);
    setConflictId(null);
    if (!draft.word.trim()) {
      setFormError('Từ tiếng Anh không được để trống.');
      return;
    }

    updateMutation.mutate({
      word: draft.word.trim(),
      ipa: draft.ipa.trim(),
      partOfSpeech: draft.partOfSpeech || 'other',
      cefrLevel: draft.cefrLevel,
      englishDefinition: draft.englishDefinition.trim(),
      vietnameseMeaning: draft.vietnameseMeaning.trim(),
      confidenceLevel: draft.confidenceLevel,
      isFavorite: draft.isFavorite,
      vietnameseExplanation: draft.vietnameseExplanation.trim(),
      englishExplanation: draft.englishExplanation.trim(),
      nuance: draft.nuance.trim(),
      register: draft.register,
      tone: draft.tone,
      usageContext: draft.usageContext.trim(),
      whenToUse: draft.whenToUse.trim(),
      whenNotToUse: draft.whenNotToUse.trim(),
      examples: draft.examples
        .filter((ex) => ex.englishSentence.trim().length > 0)
        .map((ex) => ({
          englishSentence: ex.englishSentence.trim(),
          vietnameseTranslation: ex.vietnameseTranslation.trim(),
          highlightText: ex.highlightText.trim() || draft.word.trim(),
        })),
      collocations: draft.collocations
        .filter((col) => col.phrase.trim().length > 0)
        .map((col) => ({
          phrase: col.phrase.trim(),
          vietnameseMeaning: col.vietnameseMeaning.trim(),
          exampleSentence: col.exampleSentence.trim(),
          exampleTranslation: col.exampleTranslation.trim(),
        })),
      relations: draft.relations
        .filter((rel) => rel.text.trim().length > 0)
        .map((rel) => ({
          relationType: rel.relationType,
          text: rel.text.trim(),
          note: rel.note.trim(),
        })),
      vnCommonMistakes: draft.vnCommonMistakes.trim(),
      vnWrongCombinations: draft.vnWrongCombinations.trim(),
      vnConfusingWords: draft.vnConfusingWords.trim(),
      vnTranslationTraps: draft.vnTranslationTraps.trim(),
      personalNotes: draft.personalNotes.trim(),
      source: draft.source.trim(),
      collectionIds: draft.collectionIds,
      tagNames: draft.tagNames.map((t) => t.trim()).filter(Boolean),
    });
  };

  const addTagFromInput = () => {
    if (!draft) return;
    const names = newTagInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const existingLower = new Set(draft.tagNames.map((t) => t.toLowerCase()));
    const merged = [...draft.tagNames];
    for (const n of names) {
      if (!existingLower.has(n.toLowerCase())) {
        merged.push(n);
        existingLower.add(n.toLowerCase());
      }
    }
    setDraft({ ...draft, tagNames: merged });
    setNewTagInput('');
  };

  if (vocabQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-28 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]" />
        <div className="h-64 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]" />
      </div>
    );
  }

  if (vocabQuery.isError || !vocabQuery.data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <AlertCircle className="mb-2 h-8 w-8 text-[var(--danger-ink)]" aria-hidden="true" />
          <h1 className="text-[18px] font-semibold text-[var(--ink-primary)]">
            Không tìm thấy từ vựng
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            {vocabQuery.error instanceof Error
              ? vocabQuery.error.message
              : 'Từ vựng không tồn tại hoặc đã bị xóa.'}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to="/vocabulary"
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 text-[14px] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              ← Quay lại thư viện
            </Link>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => vocabQuery.refetch()}
            >
              Thử lại
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const vocab = vocabQuery.data;
  const allCollections = collectionsQuery.data ?? [];
  const allTags = tagsQuery.data ?? [];

  const handleQuickAddExample = () => {
    if (!quickExEn.trim()) return;
    const nextExamples = [
      ...vocab.examples.map((ex) => ({
        englishSentence: ex.englishSentence,
        vietnameseTranslation: ex.vietnameseTranslation,
        highlightText: ex.highlightText || vocab.word,
      })),
      {
        englishSentence: quickExEn.trim(),
        vietnameseTranslation: quickExVi.trim(),
        highlightText: vocab.word,
      },
    ];
    quickPatchMutation.mutate(
      { examples: nextExamples },
      {
        onSuccess: () => {
          setQuickExEn('');
          setQuickExVi('');
          setQuickExOpen(false);
          success('Đã thêm câu ví dụ mới');
        },
      },
    );
  };

  const handleQuickRemoveExample = (indexToRemove: number) => {
    const nextExamples = vocab.examples
      .filter((_, idx) => idx !== indexToRemove)
      .map((ex) => ({
        englishSentence: ex.englishSentence,
        vietnameseTranslation: ex.vietnameseTranslation,
        highlightText: ex.highlightText || vocab.word,
      }));
    quickPatchMutation.mutate(
      { examples: nextExamples },
      {
        onSuccess: () => {
          info('Đã xóa câu ví dụ');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/vocabulary"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Thư viện từ vựng
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/practice?tab=vocab&vocabId=${vocab.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3.5 text-[13.5px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Luyện từ này (Anh → Việt & Việt → Anh)
          </Link>

          {isEditing ? (
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setDraft(buildDraftFromVocab(vocab));
                  setFormError(null);
                  setConflictId(null);
                  setIsEditing(false);
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Hủy chỉnh sửa
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={updateMutation.isPending}
                leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
                onClick={handleSaveFullEdit}
              >
                Lưu thay đổi
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="md"
                leftIcon={<Edit3 className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  setDraft(buildDraftFromVocab(vocab));
                  setIsEditing(true);
                }}
              >
                Chỉnh sửa chi tiết
              </Button>
              <Button
                variant="ghost"
                size="md"
                aria-label={`Xóa từ vựng ${vocab.word}`}
                onClick={() => setDeleteDialogOpen(true)}
                className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Header Hero */}
      <header className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={vocab.status === 'mastered' ? 'success' : 'accent'}
                size="md"
              >
                {VOCAB_STATUS_LABELS[vocab.status]}
              </Badge>
              {vocab.cefrLevel !== 'unknown' ? (
                <Badge tone="info" size="md">
                  CEFR {vocab.cefrLevel}
                </Badge>
              ) : null}
              {vocab.partOfSpeech && vocab.partOfSpeech !== 'other' ? (
                <Badge tone="neutral" size="md">
                  {POS_LABEL_MAP[vocab.partOfSpeech] ?? vocab.partOfSpeech}
                </Badge>
              ) : null}
              {vocab.isIncomplete ? (
                <Badge tone="warning" size="md">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Thiếu nghĩa / định nghĩa
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-[28px] font-semibold tracking-tight text-[var(--ink-primary)] sm:text-[32px]">
                {vocab.word}
              </h1>
              {vocab.ipa ? (
                <span className="ipa text-[17px] text-[var(--ink-secondary)]">{vocab.ipa}</span>
              ) : null}
            </div>

            <p className="text-[16px] text-[var(--ink-primary)]">
              {vocab.vietnameseMeaning || (
                <span className="italic text-[var(--ink-muted)]">
                  Chưa có nghĩa tiếng Việt — nhấn &ldquo;Chỉnh sửa chi tiết&rdquo; để bổ sung
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              aria-pressed={vocab.isFavorite}
              aria-label={
                vocab.isFavorite ? 'Bỏ khỏi danh sách yêu thích' : 'Thêm vào yêu thích'
              }
              onClick={() =>
                quickPatchMutation.mutate({ isFavorite: !vocab.isFavorite })
              }
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-medium transition-colors cursor-pointer',
                vocab.isFavorite
                  ? 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-ink)]'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]',
              )}
            >
              <Star
                className={cn('h-4 w-4', vocab.isFavorite && 'fill-current')}
                aria-hidden="true"
              />
              {vocab.isFavorite ? 'Đã yêu thích' : 'Yêu thích'}
            </button>
          </div>
        </div>
      </header>

      {formError ? (
        <div
          role="alert"
          className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13.5px] text-[var(--danger-ink)]"
        >
          <p>{formError}</p>
          {conflictId ? (
            <Link
              to={`/vocabulary/${conflictId}`}
              className="mt-1 inline-block font-medium text-[var(--accent)] underline"
            >
              Mở từ vựng đã tồn tại →
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* SECTION 1: THÔNG TIN CƠ BẢN */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            1. Thông tin cơ bản
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing && draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  label="Từ / Cụm từ tiếng Anh *"
                  required
                  value={draft.word}
                  onChange={(e) => setDraft({ ...draft, word: e.target.value })}
                />
                <Input
                  label="Phiên âm IPA"
                  className="ipa"
                  value={draft.ipa}
                  onChange={(e) => setDraft({ ...draft, ipa: e.target.value })}
                  placeholder="/.../"
                />
                <Select
                  label="Từ loại"
                  value={draft.partOfSpeech}
                  onChange={(e) => setDraft({ ...draft, partOfSpeech: e.target.value })}
                  options={PART_OF_SPEECH_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                />
                <Select
                  label="Trình độ CEFR"
                  value={draft.cefrLevel}
                  onChange={(e) =>
                    setDraft({ ...draft, cefrLevel: e.target.value as CefrLevel })
                  }
                  options={CEFR_LEVELS.map((lv) => ({
                    value: lv,
                    label: lv === 'unknown' ? 'Chưa phân loại' : lv,
                  }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Nghĩa tiếng Việt"
                  value={draft.vietnameseMeaning}
                  onChange={(e) =>
                    setDraft({ ...draft, vietnameseMeaning: e.target.value })
                  }
                />
                <Input
                  label="Định nghĩa tiếng Anh (English definition)"
                  value={draft.englishDefinition}
                  onChange={(e) =>
                    setDraft({ ...draft, englishDefinition: e.target.value })
                  }
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-hairline)] pt-3.5">
                <div className="space-y-1.5">
                  <span className="block text-[13px] font-medium text-[var(--ink-primary)]">
                    Mức độ tự tin (1–5)
                  </span>
                  <div role="group" aria-label="Chọn mức độ tự tin" className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        aria-pressed={draft.confidenceLevel === lv}
                        onClick={() => setDraft({ ...draft, confidenceLevel: lv })}
                        className={cn(
                          'h-8 w-8 rounded-[6px] border text-[13px] font-medium transition-colors cursor-pointer',
                          draft.confidenceLevel === lv
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]',
                        )}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-medium text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={draft.isFavorite}
                    onChange={(e) => setDraft({ ...draft, isFavorite: e.target.checked })}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Đánh dấu từ yêu thích
                </label>
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ViewField label="Từ tiếng Anh" value={vocab.word} />
              <ViewField label="Phiên âm IPA" value={vocab.ipa} />
              <ViewField
                label="Từ loại & Trình độ"
                value={`${POS_LABEL_MAP[vocab.partOfSpeech] ?? vocab.partOfSpeech} · ${vocab.cefrLevel === 'unknown' ? 'Chưa phân loại' : vocab.cefrLevel}`}
              />
              <ViewField label="Nghĩa tiếng Việt" value={vocab.vietnameseMeaning} />
              <ViewField label="Định nghĩa tiếng Anh" value={vocab.englishDefinition} />
              <div className="space-y-1">
                <dt className="text-[12px] font-medium text-[var(--ink-muted)]">
                  Độ tự tin & Trạng thái thành thạo
                </dt>
                <dd className="flex flex-wrap items-center gap-3">
                  <div role="group" aria-label="Cập nhật nhanh mức độ tự tin" className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        aria-pressed={vocab.confidenceLevel === lv}
                        aria-label={`Đặt độ tự tin ${lv} trên 5`}
                        onClick={() => quickPatchMutation.mutate({ confidenceLevel: lv })}
                        className={cn(
                          'h-6 w-6 rounded-full border text-[11.5px] font-medium transition-colors cursor-pointer',
                          lv <= vocab.confidenceLevel
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)]',
                        )}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                  <Badge tone="neutral" size="sm">
                    {VOCAB_STATUS_LABELS[vocab.status]}
                  </Badge>
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: NGHĨA & CÁCH DÙNG */}
      <Card>
        <CardHeader>
          <CardTitle>2. Nghĩa & Cách dùng</CardTitle>
          <CardDescription>
            Hiểu sâu sắc thái nghĩa, ngữ cảnh và ranh giới sử dụng tự nhiên.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEditing && draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea
                  label="Giải thích chi tiết tiếng Việt"
                  rows={3}
                  value={draft.vietnameseExplanation}
                  onChange={(e) =>
                    setDraft({ ...draft, vietnameseExplanation: e.target.value })
                  }
                />
                <Textarea
                  label="Giải thích tiếng Anh (English explanation)"
                  rows={3}
                  value={draft.englishExplanation}
                  onChange={(e) =>
                    setDraft({ ...draft, englishExplanation: e.target.value })
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Sắc thái nghĩa (Nuance)"
                  value={draft.nuance}
                  onChange={(e) => setDraft({ ...draft, nuance: e.target.value })}
                />
                <Select
                  label="Mức độ trang trọng (Register)"
                  value={draft.register}
                  onChange={(e) =>
                    setDraft({ ...draft, register: e.target.value as VocabRegister })
                  }
                  options={(['formal', 'neutral', 'informal'] as const).map((r) => ({
                    value: r,
                    label: REGISTER_LABELS[r],
                  }))}
                />
                <Select
                  label="Sắc thái cảm xúc (Tone)"
                  value={draft.tone}
                  onChange={(e) =>
                    setDraft({ ...draft, tone: e.target.value as VocabTone })
                  }
                  options={(['positive', 'neutral', 'negative'] as const).map((t) => ({
                    value: t,
                    label: TONE_LABELS[t],
                  }))}
                />
              </div>

              <Textarea
                label="Ngữ cảnh sử dụng (Usage context)"
                rows={2}
                value={draft.usageContext}
                onChange={(e) => setDraft({ ...draft, usageContext: e.target.value })}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea
                  label="Khi nào NÊN dùng (When to use)"
                  rows={2}
                  value={draft.whenToUse}
                  onChange={(e) => setDraft({ ...draft, whenToUse: e.target.value })}
                />
                <Textarea
                  label="Khi nào KHÔNG nên dùng (When NOT to use)"
                  rows={2}
                  value={draft.whenNotToUse}
                  onChange={(e) => setDraft({ ...draft, whenNotToUse: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <ViewField
                label="Giải thích chi tiết tiếng Việt"
                value={vocab.vietnameseExplanation}
                multiline
              />
              <ViewField
                label="Giải thích tiếng Anh"
                value={vocab.englishExplanation}
                multiline
              />
              <ViewField label="Sắc thái nghĩa (Nuance)" value={vocab.nuance} />
              <ViewField
                label="Mức độ trang trọng & Sắc thái (Register / Tone)"
                value={`${REGISTER_LABELS[vocab.register]} · ${TONE_LABELS[vocab.tone]}`}
              />
              <div className="sm:col-span-2">
                <ViewField
                  label="Ngữ cảnh sử dụng"
                  value={vocab.usageContext}
                  multiline
                />
              </div>
              <ViewField label="Khi nào NÊN dùng" value={vocab.whenToUse} multiline />
              <ViewField
                label="Khi nào KHÔNG nên dùng"
                value={vocab.whenNotToUse}
                multiline
              />
            </dl>
          )}
        </CardContent>
      </Card>

      {/* SECTION 3: VÍ DỤ CÂU */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>3. Ví dụ câu ({vocab.examples.length})</CardTitle>
            <CardDescription>
              Từ mục tiêu được làm nổi bật tự động trong câu ví dụ thực tế.
            </CardDescription>
          </div>
          {isEditing && draft ? (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() =>
                setDraft({
                  ...draft,
                  examples: [
                    ...draft.examples,
                    {
                      englishSentence: '',
                      vietnameseTranslation: '',
                      highlightText: draft.word,
                    },
                  ],
                })
              }
            >
              Thêm ví dụ
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => setQuickExOpen((v) => !v)}
            >
              Thêm ví dụ
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {isEditing && draft ? (
            draft.examples.length === 0 ? (
              <p className="text-[13.5px] text-[var(--ink-muted)]">
                Chưa có ví dụ nào. Nhấn &ldquo;Thêm ví dụ&rdquo; để tạo câu mẫu.
              </p>
            ) : (
              <div className="space-y-3">
                {draft.examples.map((ex, idx) => (
                  <div
                    key={idx}
                    className="grid gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5 sm:grid-cols-12 sm:items-end"
                  >
                    <Input
                      label="Câu tiếng Anh *"
                      wrapperClassName="sm:col-span-5"
                      value={ex.englishSentence}
                      onChange={(e) => {
                        const next = [...draft.examples];
                        next[idx] = { ...ex, englishSentence: e.target.value };
                        setDraft({ ...draft, examples: next });
                      }}
                      placeholder="English example sentence..."
                    />
                    <Input
                      label="Dịch tiếng Việt"
                      wrapperClassName="sm:col-span-4"
                      value={ex.vietnameseTranslation}
                      onChange={(e) => {
                        const next = [...draft.examples];
                        next[idx] = { ...ex, vietnameseTranslation: e.target.value };
                        setDraft({ ...draft, examples: next });
                      }}
                      placeholder="Bản dịch tiếng Việt..."
                    />
                    <Input
                      label="Cụm cần nhấn mạnh"
                      wrapperClassName="sm:col-span-2"
                      value={ex.highlightText}
                      onChange={(e) => {
                        const next = [...draft.examples];
                        next[idx] = { ...ex, highlightText: e.target.value };
                        setDraft({ ...draft, examples: next });
                      }}
                      placeholder={draft.word}
                    />
                    <div className="sm:col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Xóa ví dụ ${idx + 1}`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            examples: draft.examples.filter((_, i) => i !== idx),
                          })
                        }
                        className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              {quickExOpen ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleQuickAddExample();
                  }}
                  className="grid gap-3 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)]/30 p-3.5 sm:grid-cols-12 sm:items-end"
                >
                  <Input
                    label="Câu ví dụ tiếng Anh *"
                    wrapperClassName="sm:col-span-5"
                    autoFocus
                    required
                    value={quickExEn}
                    onChange={(e) => setQuickExEn(e.target.value)}
                    placeholder="Nhập câu tiếng Anh có chứa từ này..."
                  />
                  <Input
                    label="Dịch tiếng Việt"
                    wrapperClassName="sm:col-span-5"
                    value={quickExVi}
                    onChange={(e) => setQuickExVi(e.target.value)}
                    placeholder="Nghĩa tiếng Việt..."
                  />
                  <div className="flex gap-1.5 sm:col-span-2 sm:justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuickExOpen(false)}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={quickPatchMutation.isPending}
                      disabled={!quickExEn.trim()}
                    >
                      Lưu
                    </Button>
                  </div>
                </form>
              ) : null}

              {vocab.examples.length === 0 ? (
                <p className="text-[13.5px] text-[var(--ink-muted)]">
                  Chưa có câu ví dụ nào cho từ này.
                </p>
              ) : (
                <ul className="space-y-3">
                  {vocab.examples.map((ex, idx) => (
                    <li
                      key={ex.id}
                      className="flex items-start justify-between gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-3"
                    >
                      <div className="space-y-1">
                        <p className="text-[14.5px] leading-[1.55] text-[var(--ink-primary)]">
                          <HighlightedSentence
                            sentence={ex.englishSentence}
                            target={ex.highlightText || vocab.word}
                          />
                        </p>
                        {ex.vietnameseTranslation ? (
                          <p className="text-[13px] text-[var(--ink-secondary)]">
                            {ex.vietnameseTranslation}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Xóa ví dụ ${idx + 1}`}
                        onClick={() => handleQuickRemoveExample(idx)}
                        className="shrink-0 text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* SECTION 4: MỐI QUAN HỆ TỪ & COLLOCATIONS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            4. Mối quan hệ từ & Collocations
          </CardTitle>
          <CardDescription>
            Từ đồng nghĩa, trái nghĩa, họ từ (word family), cụm động từ và cụm kết hợp tự nhiên.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Relations */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-[var(--ink-primary)]">
                Mối quan hệ từ
              </h3>
              {isEditing && draft ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      relations: [
                        ...draft.relations,
                        { relationType: 'synonym', text: '', note: '' },
                      ],
                    })
                  }
                >
                  Thêm quan hệ từ
                </Button>
              ) : null}
            </div>

            {isEditing && draft ? (
              draft.relations.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)]">
                  Chưa có từ đồng nghĩa, trái nghĩa hay họ từ nào.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {draft.relations.map((rel, idx) => (
                    <div
                      key={idx}
                      className="grid gap-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 sm:grid-cols-12 sm:items-end"
                    >
                      <Select
                        label="Loại quan hệ"
                        wrapperClassName="sm:col-span-4"
                        value={rel.relationType}
                        onChange={(e) => {
                          const next = [...draft.relations];
                          next[idx] = {
                            ...rel,
                            relationType: e.target.value as VocabRelationType,
                          };
                          setDraft({ ...draft, relations: next });
                        }}
                        options={RELATION_TYPES.map((t) => ({
                          value: t,
                          label: RELATION_TYPE_LABELS[t],
                        }))}
                      />
                      <Input
                        label="Từ / Cụm từ *"
                        wrapperClassName="sm:col-span-4"
                        value={rel.text}
                        onChange={(e) => {
                          const next = [...draft.relations];
                          next[idx] = { ...rel, text: e.target.value };
                          setDraft({ ...draft, relations: next });
                        }}
                        placeholder="Ví dụ: thorough, careless..."
                      />
                      <Input
                        label="Ghi chú phân biệt"
                        wrapperClassName="sm:col-span-3"
                        value={rel.note}
                        onChange={(e) => {
                          const next = [...draft.relations];
                          next[idx] = { ...rel, note: e.target.value };
                          setDraft({ ...draft, relations: next });
                        }}
                        placeholder="Khác biệt nhẹ..."
                      />
                      <div className="sm:col-span-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Xóa quan hệ từ ${idx + 1}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              relations: draft.relations.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : vocab.relations.length === 0 ? (
              <p className="text-[13px] text-[var(--ink-muted)]">
                Chưa ghi nhận từ đồng nghĩa, trái nghĩa, word family hoặc cụm động từ nào.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {RELATION_TYPES.filter((type) => groupedRelations.has(type)).map((type) => (
                  <div
                    key={type}
                    className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3"
                  >
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      {RELATION_TYPE_LABELS[type]}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {(groupedRelations.get(type) ?? []).map((rel) => (
                        <li
                          key={rel.id}
                          className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[13px]"
                        >
                          {rel.relatedVocabularyId ? (
                            <Link
                              to={`/vocabulary/${rel.relatedVocabularyId}`}
                              className="font-medium text-[var(--accent)] hover:underline"
                            >
                              {rel.text}
                            </Link>
                          ) : (
                            <span className="font-medium text-[var(--ink-primary)]">
                              {rel.text}
                            </span>
                          )}
                          {rel.note ? (
                            <span className="text-[12px] text-[var(--ink-muted)]">
                              ({rel.note})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collocations */}
          <div className="space-y-3 border-t border-[var(--border-hairline)] pt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-[var(--ink-primary)]">
                Collocations ({vocab.collocations.length})
              </h3>
              {isEditing && draft ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      collocations: [
                        ...draft.collocations,
                        {
                          phrase: '',
                          vietnameseMeaning: '',
                          exampleSentence: '',
                          exampleTranslation: '',
                        },
                      ],
                    })
                  }
                >
                  Thêm Collocation
                </Button>
              ) : null}
            </div>

            {isEditing && draft ? (
              draft.collocations.length === 0 ? (
                <p className="text-[13px] text-[var(--ink-muted)]">
                  Chưa có collocation nào.
                </p>
              ) : (
                <div className="space-y-3">
                  {draft.collocations.map((col, idx) => (
                    <div
                      key={idx}
                      className="space-y-2.5 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                    >
                      <div className="grid gap-3 sm:grid-cols-12 sm:items-end">
                        <Input
                          label="Cụm Collocation *"
                          wrapperClassName="sm:col-span-5"
                          value={col.phrase}
                          onChange={(e) => {
                            const next = [...draft.collocations];
                            next[idx] = { ...col, phrase: e.target.value };
                            setDraft({ ...draft, collocations: next });
                          }}
                          placeholder="Ví dụ: pay meticulous attention to"
                        />
                        <Input
                          label="Nghĩa tiếng Việt"
                          wrapperClassName="sm:col-span-6"
                          value={col.vietnameseMeaning}
                          onChange={(e) => {
                            const next = [...draft.collocations];
                            next[idx] = { ...col, vietnameseMeaning: e.target.value };
                            setDraft({ ...draft, collocations: next });
                          }}
                          placeholder="chú ý tỉ mỉ đến..."
                        />
                        <div className="sm:col-span-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Xóa collocation ${idx + 1}`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                collocations: draft.collocations.filter((_, i) => i !== idx),
                              })
                            }
                            className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          label="Ví dụ (Anh)"
                          value={col.exampleSentence}
                          onChange={(e) => {
                            const next = [...draft.collocations];
                            next[idx] = { ...col, exampleSentence: e.target.value };
                            setDraft({ ...draft, collocations: next });
                          }}
                        />
                        <Input
                          label="Dịch ví dụ (Việt)"
                          value={col.exampleTranslation}
                          onChange={(e) => {
                            const next = [...draft.collocations];
                            next[idx] = { ...col, exampleTranslation: e.target.value };
                            setDraft({ ...draft, collocations: next });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : vocab.collocations.length === 0 ? (
              <p className="text-[13px] text-[var(--ink-muted)]">
                Chưa có collocation nào cho từ này.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {vocab.collocations.map((col) => (
                  <li
                    key={col.id}
                    className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                  >
                    <p className="text-[14.5px] font-semibold text-[var(--ink-primary)]">
                      {col.phrase}
                    </p>
                    {col.vietnameseMeaning ? (
                      <p className="mt-0.5 text-[13px] font-medium text-[var(--accent)]">
                        {col.vietnameseMeaning}
                      </p>
                    ) : null}
                    {col.exampleSentence ? (
                      <div className="mt-2 border-t border-[var(--border-hairline)] pt-2 text-[12.5px]">
                        <p className="text-[var(--ink-primary)]">
                          <HighlightedSentence
                            sentence={col.exampleSentence}
                            target={col.phrase}
                          />
                        </p>
                        {col.exampleTranslation ? (
                          <p className="mt-0.5 text-[var(--ink-muted)]">
                            {col.exampleTranslation}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 5: GHI CHÚ CHO NGƯỜI VIỆT */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--warning-ink)]" aria-hidden="true" />
            5. Ghi chú cho người Việt
          </CardTitle>
          <CardDescription>
            Tổng hợp lỗi dùng từ phổ biến, kết hợp sai và bẫy dịch từ tiếng Việt sang tiếng Anh.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEditing && draft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                label="Lỗi người Việt hay gặp"
                rows={3}
                value={draft.vnCommonMistakes}
                onChange={(e) =>
                  setDraft({ ...draft, vnCommonMistakes: e.target.value })
                }
              />
              <Textarea
                label="Kết hợp từ sai thường gặp"
                rows={3}
                value={draft.vnWrongCombinations}
                onChange={(e) =>
                  setDraft({ ...draft, vnWrongCombinations: e.target.value })
                }
              />
              <Textarea
                label="Từ dễ gây nhầm lẫn"
                rows={3}
                value={draft.vnConfusingWords}
                onChange={(e) =>
                  setDraft({ ...draft, vnConfusingWords: e.target.value })
                }
              />
              <Textarea
                label="Bẫy dịch sát nghĩa Việt → Anh"
                rows={3}
                value={draft.vnTranslationTraps}
                onChange={(e) =>
                  setDraft({ ...draft, vnTranslationTraps: e.target.value })
                }
              />
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <ViewField
                label="Lỗi người Việt hay gặp"
                value={vocab.vnCommonMistakes}
                multiline
              />
              <ViewField
                label="Kết hợp từ sai thường gặp"
                value={vocab.vnWrongCombinations}
                multiline
              />
              <ViewField
                label="Từ dễ gây nhầm lẫn"
                value={vocab.vnConfusingWords}
                multiline
              />
              <ViewField
                label="Bẫy dịch sát nghĩa Việt → Anh"
                value={vocab.vnTranslationTraps}
                multiline
              />
            </dl>
          )}
        </CardContent>
      </Card>

      {/* SECTION 6: THÔNG TIN CÁ NHÂN & LỊCH SỬ HỌC */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            6. Thông tin cá nhân & Lịch sử học
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Personal notes, Source, Collections, Tags */}
          {isEditing && draft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Textarea
                  label="Ghi chú cá nhân"
                  rows={3}
                  value={draft.personalNotes}
                  onChange={(e) =>
                    setDraft({ ...draft, personalNotes: e.target.value })
                  }
                />
                <Input
                  label="Nguồn học / Nguồn gốc từ"
                  value={draft.source}
                  onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                  placeholder="Ví dụ: Buổi 5, Reading IELTS Cambridge..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="space-y-2 rounded-[8px] border border-[var(--border-hairline)] p-3.5">
                  <legend className="px-1 text-[13px] font-medium text-[var(--ink-primary)]">
                    Bộ sưu tập
                  </legend>
                  <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
                    {allCollections.map((col) => {
                      const checked = draft.collectionIds.includes(col.id);
                      return (
                        <label
                          key={col.id}
                          className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--ink-primary)]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...draft.collectionIds, col.id]
                                : draft.collectionIds.filter((cid) => cid !== col.id);
                              setDraft({ ...draft, collectionIds: nextIds });
                            }}
                            className="h-4 w-4 accent-[var(--accent)]"
                          />
                          <span className="truncate">{col.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="space-y-2.5 rounded-[8px] border border-[var(--border-hairline)] p-3.5">
                  <p className="text-[13px] font-medium text-[var(--ink-primary)]">
                    Nhãn chủ đề (Tags)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.tagNames.map((tName) => (
                      <span
                        key={tName}
                        className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[12px] font-medium text-[var(--accent)]"
                      >
                        {tName}
                        <button
                          type="button"
                          aria-label={`Bỏ nhãn ${tName}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              tagNames: draft.tagNames.filter((t) => t !== tName),
                            })
                          }
                          className="hover:text-[var(--danger-ink)] cursor-pointer"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Thêm nhãn mới"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={onImeSafeEnter(addTagFromInput)}
                      placeholder="Nhập nhãn rồi nhấn Enter..."
                    />
                    <Button variant="secondary" size="md" onClick={addTagFromInput}>
                      Thêm
                    </Button>
                  </div>
                  {allTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {allTags
                        .filter((t) => !draft.tagNames.includes(t.name))
                        .slice(0, 8)
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                tagNames: [...draft.tagNames, t.name],
                              })
                            }
                            className="rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11.5px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
                          >
                            + {t.name}
                          </button>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <ViewField label="Ghi chú cá nhân" value={vocab.personalNotes} multiline />
                <ViewField label="Nguồn học" value={vocab.source} />
              </dl>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-muted)]">
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Bộ sưu tập
                  </p>
                  {vocab.collections.length === 0 ? (
                    <p className="text-[13px] italic text-[var(--ink-muted)]">
                      Chưa thuộc bộ sưu tập nào
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {vocab.collections.map((col) => (
                        <Link
                          key={col.id}
                          to={`/vocabulary?collectionId=${col.id}`}
                          className="inline-flex items-center rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--ink-primary)] hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                        >
                          {col.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-muted)]">
                    <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                    Nhãn (Tags)
                  </p>
                  {vocab.tags.length === 0 ? (
                    <p className="text-[13px] italic text-[var(--ink-muted)]">Chưa gắn nhãn</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {vocab.tags.map((tag) => (
                        <Link
                          key={tag.id}
                          to={`/vocabulary?tagId=${tag.id}`}
                          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--ink-primary)] hover:border-[var(--accent-border)]"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: tag.color || '#0F766E' }}
                            aria-hidden="true"
                          />
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Linked Learning Sessions */}
          <div className="space-y-2.5 border-t border-[var(--border-hairline)] pt-5">
            <h3 className="text-[14px] font-semibold text-[var(--ink-primary)]">
              Buổi học có chứa từ này ({vocab.linkedSessions.length})
            </h3>
            {vocab.linkedSessions.length === 0 ? (
              <p className="text-[13px] text-[var(--ink-muted)]">
                Từ vựng này chưa gắn với buổi học cụ thể nào.
              </p>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {vocab.linkedSessions.map((s) => (
                  <li key={s.sessionId}>
                    <Link
                      to={`/sessions/${s.sessionId}`}
                      className="block rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2.5 transition-colors hover:border-[var(--accent-border)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13.5px] font-medium text-[var(--ink-primary)]">
                          {s.title}
                        </span>
                        <Badge
                          tone={s.status === 'completed' ? 'success' : 'warning'}
                          size="sm"
                        >
                          {s.status === 'completed' ? 'Hoàn thành' : 'Nháp'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-[var(--ink-muted)]">
                        {formatDateVi(s.learningDate)} · {SESSION_SOURCE_LABELS[s.sourceType]}
                      </p>
                      {s.sessionNote ? (
                        <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                          Ghi chú: {s.sessionNote}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Independent Per-Direction SM-2 Schedule Table */}
          <div className="space-y-2.5 border-t border-[var(--border-hairline)] pt-5">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[var(--ink-primary)]">
              <CalendarClock className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              Lịch ôn tập SM-2 độc lập theo từng chiều kỹ năng
            </h3>
            <p className="text-[12.5px] text-[var(--ink-secondary)]">
              Từ chỉ đạt trạng thái &ldquo;Đã thành thạo&rdquo; khi cả hai chiều Anh → Việt và
              Việt → Anh đều đạt mức thành thạo.
            </p>

            <ResponsiveTableRegion ariaLabel="Lịch ôn tập SM-2 theo từng chiều">
              <table className="w-full text-left text-[13px]">
                <caption className="sr-only">
                  Trạng thái ôn tập lặp lại ngắt quãng SM-2 cho 4 chiều của từ {vocab.word}
                </caption>
                <thead>
                  <tr className="bg-[var(--bg-subtle)] text-[12px] text-[var(--ink-secondary)]">
                    <th scope="col" className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
                      Chiều kỹ năng
                    </th>
                    <th scope="col" className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
                      Trạng thái
                    </th>
                    <th scope="col" className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
                      Khoảng cách
                    </th>
                    <th scope="col" className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
                      Hệ số (EF)
                    </th>
                    <th scope="col" className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
                      Lặp / Quên
                    </th>
                    <th scope="col" className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
                      Ôn gần nhất
                    </th>
                    <th scope="col" className="border-b border-[var(--border-hairline)] px-3.5 py-2.5">
                      Đến hạn tiếp theo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SKILL_DIRECTIONS.map((dir) => {
                    const st = vocab.reviewStates.find((r) => r.skillDirection === dir);
                    const statusMeta = REVIEW_STATUS_DISPLAY[st?.status ?? 'new'];
                    return (
                      <tr
                        key={dir}
                        className="border-b border-[var(--border-hairline)] last:border-b-0"
                      >
                        <th
                          scope="row"
                          className="bg-[var(--bg-surface)] px-3.5 py-2.5 font-medium text-[var(--ink-primary)]"
                        >
                          {SKILL_DIRECTION_LABELS[dir]}
                        </th>
                        <td data-label="Trạng thái" className="px-3.5 py-2.5">
                          <Badge tone={statusMeta.tone} size="sm">
                            {statusMeta.label}
                          </Badge>
                        </td>
                        <td data-label="Khoảng cách" className="px-3.5 py-2.5 text-[var(--ink-secondary)]">
                          {st ? `${st.intervalDays} ngày` : '0 ngày'}
                        </td>
                        <td data-label="Hệ số (EF)" className="formula px-3.5 py-2.5 text-[var(--ink-secondary)]">
                          {st ? st.easeFactor.toFixed(2) : '2.50'}
                        </td>
                        <td data-label="Lặp / Quên" className="px-3.5 py-2.5 text-[var(--ink-secondary)]">
                          {st ? `${st.repetitions} / ${st.lapses}` : '0 / 0'}
                        </td>
                        <td data-label="Ôn gần nhất" className="px-3.5 py-2.5 text-[var(--ink-muted)]">
                          {st?.lastReviewedAt ? formatDateVi(st.lastReviewedAt) : 'Chưa ôn'}
                        </td>
                        <td data-label="Đến hạn tiếp theo" className="px-3.5 py-2.5">
                          {st ? (
                            <span className="font-medium text-[var(--ink-primary)]">
                              {formatRelativeDueVi(st.nextReviewAt)}{' '}
                              <span className="text-[12px] font-normal text-[var(--ink-muted)]">
                                ({formatDateVi(st.nextReviewAt)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-[var(--ink-muted)]">Chưa lên lịch</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTableRegion>
          </div>

          {/* Linked Comparison Groups */}
          <div className="space-y-2.5 border-t border-[var(--border-hairline)] pt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[var(--ink-primary)]">
                <GitCompare className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                Nhóm so sánh từ dễ nhầm ({vocab.comparisonGroups.length})
              </h3>
              <Link
                to="/vocabulary/comparisons"
                className="text-[13px] font-medium text-[var(--accent)] hover:underline"
              >
                Mở tất cả bảng so sánh →
              </Link>
            </div>
            {vocab.comparisonGroups.length === 0 ? (
              <p className="text-[13px] text-[var(--ink-muted)]">
                Từ này chưa nằm trong nhóm so sánh từ dễ nhầm nào.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {vocab.comparisonGroups.map((group) => (
                  <li
                    key={group.id}
                    className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[14.5px] font-semibold text-[var(--ink-primary)]">
                        {group.title}
                      </p>
                      <Link
                        to="/vocabulary/comparisons"
                        className="text-[12.5px] font-medium text-[var(--accent)] hover:underline"
                      >
                        Xem ma trận so sánh →
                      </Link>
                    </div>
                    {group.summaryVi ? (
                      <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
                        {group.summaryVi}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.items.map((it) =>
                        it.vocabularyId ? (
                          <Link
                            key={it.id}
                            to={`/vocabulary/${it.vocabularyId}`}
                            className={cn(
                              'rounded-[6px] border px-2 py-0.5 text-[12px] font-medium',
                              it.vocabularyId === vocab.id
                                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:border-[var(--accent-border)]',
                            )}
                          >
                            {it.label}
                          </Link>
                        ) : (
                          <Badge key={it.id} tone="neutral" size="sm">
                            {it.label}
                          </Badge>
                        ),
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {isEditing ? (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[10px] border border-[var(--accent-border)] bg-[var(--bg-surface)] px-4 py-3 shadow-[0_6px_20px_rgba(28,25,23,0.1)]">
          <span className="text-[13px] font-medium text-[var(--ink-secondary)]">
            Đang ở chế độ chỉnh sửa chi tiết cho từ <strong>{vocab.word}</strong>
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDraft(buildDraftFromVocab(vocab));
                setIsEditing(false);
              }}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={updateMutation.isPending}
              leftIcon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={handleSaveFullEdit}
            >
              Lưu thay đổi
            </Button>
          </div>
        </div>
      ) : null}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Xóa từ vựng khỏi thư viện"
        description="Toàn bộ ví dụ, collocation và lịch sử ôn tập SM-2 của từ này sẽ bị xóa vĩnh viễn."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              autoFocus
              onClick={() => setDeleteDialogOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Xóa từ vựng
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--ink-primary)]">
          Bạn có chắc muốn xóa từ <strong>&ldquo;{vocab.word}&rdquo;</strong>?
        </p>
      </Dialog>
    </div>
  );
}
