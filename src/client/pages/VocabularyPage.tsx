import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BookOpen,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderPlus,
  GitCompare,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Star,
  Table2,
  Tag,
  Trash2,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ImportVocabModal } from '@client/components/modals/ImportVocabModal';
import { FlashcardDeck } from '@client/components/vocabulary/FlashcardDeck';
import { Badge, type BadgeTone } from '@client/components/ui/Badge';
import { Button } from '@client/components/ui/Button';
import { Card, CardContent } from '@client/components/ui/Card';
import { Dialog } from '@client/components/ui/Dialog';
import { EmptyState } from '@client/components/ui/EmptyState';
import { Input } from '@client/components/ui/Input';
import { ResponsiveTable, type ResponsiveTableColumn } from '@client/components/ui/ResponsiveTable';
import { Select } from '@client/components/ui/Select';
import { useToast } from '@client/components/ui/Toast';
import { api } from '@client/lib/api';
import { onImeSafeEnter } from '@client/lib/ime';
import { cn, formatRelativeDueVi } from '@client/lib/utils';
import type { CollectionDto, ReviewStateDto, VocabularyListItemDto } from '@shared/apiTypes';
import {
  CEFR_LEVELS,
  PART_OF_SPEECH_OPTIONS,
  VOCAB_STATUS_LABELS,
} from '@shared/schemas';

export interface VocabularyPageProps {
  onOpenQuickAddVocab?: () => void;
}

type VocabSort = 'newest' | 'alpha' | 'confidence' | 'due';

const POS_SHORT_MAP: Record<string, string> = Object.fromEntries(
  PART_OF_SPEECH_OPTIONS.map((o) => [o.value, o.label]),
);

const REVIEW_STATE_DISPLAY: Record<
  'new' | 'learning' | 'review' | 'mastered',
  { label: string; tone: BadgeTone }
> = {
  new: { label: 'Mới', tone: 'neutral' },
  learning: { label: 'Đang học', tone: 'warning' },
  review: { label: 'Đang ôn', tone: 'info' },
  mastered: { label: 'Thành thạo', tone: 'success' },
};

function DirectionChip({
  prefix,
  state,
}: {
  prefix: 'E→V' | 'V→E';
  state: ReviewStateDto | null;
}) {
  const status = state?.status ?? 'new';
  const meta = REVIEW_STATE_DISPLAY[status];
  const dueText = state ? formatRelativeDueVi(state.nextReviewAt) : 'Chưa có lịch';

  return (
    <Badge
      tone={meta.tone}
      size="sm"
      aria-label={`${prefix === 'E→V' ? 'Anh sang Việt' : 'Việt sang Anh'}: ${meta.label} (${dueText})`}
    >
      <span className="font-semibold">{prefix}</span>
      <span>· {meta.label}</span>
    </Badge>
  );
}

function ConfidenceDots({ level }: { level: number }) {
  const safe = Math.min(5, Math.max(1, level));
  return (
    <div
      className="inline-flex items-center gap-1"
      aria-label={`Độ tự tin ${safe} trên 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn(
            'h-2 w-2 rounded-full transition-colors',
            n <= safe ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
          )}
        />
      ))}
      <span className="ml-1 text-[11.5px] text-[var(--ink-muted)]">{safe}/5</span>
    </div>
  );
}

export function VocabularyPage({ onOpenQuickAddVocab }: VocabularyPageProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success, error: toastError, info } = useToast();

  // Filter states
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') ?? '');
  const [selectedCollectionId, setSelectedCollectionId] = useState(
    searchParams.get('collectionId') ?? '',
  );
  const [selectedTagId, setSelectedTagId] = useState(searchParams.get('tagId') ?? '');
  const [cefrFilter, setCefrFilter] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [sortBy, setSortBy] = useState<VocabSort>('newest');
  const [viewMode, setViewMode] = useState<'flashcard' | 'table'>(() =>
    searchParams.get('view') === 'table' ? 'table' : 'flashcard',
  );
  const prevSearchParamsRef = useRef<string>(searchParams.toString());

  // Sync URL query params when navigated externally (e.g. collection/tag/search links)
  useEffect(() => {
    const currentQs = searchParams.toString();
    if (currentQs === prevSearchParamsRef.current) return;
    prevSearchParamsRef.current = currentQs;

    const urlSearch = searchParams.get('search') ?? '';
    setSearchInput(urlSearch);
    setDebouncedSearch(urlSearch.trim());
    setSelectedCollectionId(searchParams.get('collectionId') ?? '');
    setSelectedTagId(searchParams.get('tagId') ?? '');
    setViewMode(searchParams.get('view') === 'table' ? 'table' : 'flashcard');
  }, [searchParams]);

  const handleChangeViewMode = (nextMode: 'flashcard' | 'table') => {
    setViewMode(nextMode);
    const next = new URLSearchParams(searchParams);
    if (nextMode === 'flashcard') {
      next.delete('view');
    } else {
      next.set('view', 'table');
    }
    prevSearchParamsRef.current = next.toString();
    setSearchParams(next, { replace: true });
  };

  // Collection creation & deletion
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [deleteCollectionTarget, setDeleteCollectionTarget] =
    useState<CollectionDto | null>(null);

  // Modals
  const [importOpen, setImportOpen] = useState(false);
  const [fallbackAddOpen, setFallbackAddOpen] = useState(false);
  const [fbWord, setFbWord] = useState('');
  const [fbMeaning, setFbMeaning] = useState('');
  const [fbIpa, setFbIpa] = useState('');
  const [fbError, setFbError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Queries
  const collectionsQuery = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.listCollections(),
  });

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.listTags(),
  });

  const vocabQuery = useQuery({
    queryKey: [
      'vocabulary',
      'list',
      {
        search: debouncedSearch,
        collectionId: selectedCollectionId,
        tagId: selectedTagId,
        cefrLevel: cefrFilter,
        partOfSpeech: posFilter,
        status: statusFilter,
        favorite: favoriteOnly,
        incomplete: incompleteOnly,
        sort: sortBy,
      },
    ],
    queryFn: () =>
      api.listVocabulary({
        search: debouncedSearch || undefined,
        collectionId: selectedCollectionId || undefined,
        tagId: selectedTagId || undefined,
        cefrLevel: cefrFilter || undefined,
        partOfSpeech: posFilter || undefined,
        status: statusFilter || undefined,
        favorite: favoriteOnly || undefined,
        incomplete: incompleteOnly || undefined,
        sort: sortBy,
      }),
  });

  const sortedCollections = useMemo(
    () =>
      (collectionsQuery.data ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [collectionsQuery.data],
  );

  // Export URL matching current filters (uses live searchInput so immediate CSV click stays in sync)
  const exportCsvUrl = useMemo(() => {
    const sp = new URLSearchParams();
    const effectiveSearch = searchInput.trim();
    if (effectiveSearch) sp.set('search', effectiveSearch);
    if (selectedCollectionId) sp.set('collectionId', selectedCollectionId);
    if (selectedTagId) sp.set('tagId', selectedTagId);
    if (cefrFilter) sp.set('cefrLevel', cefrFilter);
    if (posFilter) sp.set('partOfSpeech', posFilter);
    if (statusFilter) sp.set('status', statusFilter);
    if (favoriteOnly) sp.set('favorite', 'true');
    if (incompleteOnly) sp.set('incomplete', 'true');
    const qs = sp.toString();
    return `/api/vocabulary/export.csv${qs ? `?${qs}` : ''}`;
  }, [
    searchInput,
    selectedCollectionId,
    selectedTagId,
    cefrFilter,
    posFilter,
    statusFilter,
    favoriteOnly,
    incompleteOnly,
  ]);

  // Mutations
  const toggleFavoriteMutation = useMutation({
    mutationFn: (item: VocabularyListItemDto) =>
      api.updateVocabulary(item.id, { isFavorite: !item.isFavorite }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      info(
        updated.isFavorite
          ? `Đã đánh dấu yêu thích "${updated.word}"`
          : `Đã bỏ yêu thích "${updated.word}"`,
      );
    },
    onError: (err) => {
      toastError(
        'Không thể cập nhật trạng thái yêu thích',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const createCollectionMutation = useMutation({
    mutationFn: () =>
      api.createCollection({
        name: newCollectionName.trim(),
        description: newCollectionDesc.trim(),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      setNewCollectionName('');
      setNewCollectionDesc('');
      setCreatingCollection(false);
      setSelectedCollectionId(created.id);
      success(`Đã tạo bộ sưu tập "${created.name}"`);
    },
    onError: (err) => {
      toastError(
        'Không thể tạo bộ sưu tập',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: (id: string) => api.deleteCollection(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      if (selectedCollectionId === deletedId) {
        setSelectedCollectionId('');
      }
      setDeleteCollectionTarget(null);
      success('Đã xóa bộ sưu tập');
    },
    onError: (err) => {
      toastError(
        'Không thể xóa bộ sưu tập',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const fallbackCreateVocabMutation = useMutation({
    mutationFn: () =>
      api.createVocabulary({
        word: fbWord.trim(),
        vietnameseMeaning: fbMeaning.trim(),
        ipa: fbIpa.trim(),
        ...(selectedCollectionId ? { collectionIds: [selectedCollectionId] } : {}),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setFbWord('');
      setFbMeaning('');
      setFbIpa('');
      setFbError(null);
      setFallbackAddOpen(false);
      success(`Đã thêm từ "${created.word}" vào thư viện`);
    },
    onError: (err) => {
      setFbError(err instanceof Error ? err.message : 'Không thể thêm từ vựng');
    },
  });

  const handleOpenAddVocab = () => {
    if (onOpenQuickAddVocab) {
      onOpenQuickAddVocab();
    } else {
      setFbError(null);
      setFallbackAddOpen(true);
    }
  };

  const resetAllFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedCollectionId('');
    setSelectedTagId('');
    setCefrFilter('');
    setPosFilter('');
    setStatusFilter('');
    setFavoriteOnly(false);
    setIncompleteOnly(false);
    setSortBy('newest');
    if (searchParams.toString()) {
      prevSearchParamsRef.current = '';
      setSearchParams({});
    }
  };

  const hasActiveFilters = Boolean(
    searchInput.trim() ||
      selectedCollectionId ||
      selectedTagId ||
      cefrFilter ||
      posFilter ||
      statusFilter ||
      favoriteOnly ||
      incompleteOnly,
  );

  const columns: ReadonlyArray<ResponsiveTableColumn<VocabularyListItemDto>> = [
    {
      key: 'word',
      header: 'Từ vựng',
      isRowHeader: true,
      render: (row) => (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/vocabulary/${row.id}`}
              className="text-[14.5px] font-semibold text-[var(--ink-primary)] hover:text-[var(--accent)]"
            >
              {row.word}
            </Link>
            {row.ipa ? (
              <span className="ipa text-[12.5px] font-normal text-[var(--ink-muted)]">
                {row.ipa}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {row.partOfSpeech && row.partOfSpeech !== 'other' ? (
              <Badge tone="neutral" size="sm">
                {POS_SHORT_MAP[row.partOfSpeech] ?? row.partOfSpeech}
              </Badge>
            ) : null}
            {row.cefrLevel !== 'unknown' ? (
              <Badge tone="accent" size="sm">
                {row.cefrLevel}
              </Badge>
            ) : null}
            {row.isIncomplete ? (
              <Badge tone="warning" size="sm">
                Thiếu thông tin
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'meaning',
      header: 'Nghĩa tiếng Việt',
      render: (row) => (
        <div className="max-w-xs space-y-0.5">
          <p className="text-[13.5px] text-[var(--ink-primary)]">
            {row.vietnameseMeaning || (
              <span className="italic text-[var(--ink-muted)]">Chưa có nghĩa tiếng Việt</span>
            )}
          </p>
          {row.englishDefinition ? (
            <p className="line-clamp-1 text-[12px] text-[var(--ink-muted)]">
              {row.englishDefinition}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'directions',
      header: 'Ôn tập 2 chiều',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <DirectionChip prefix="E→V" state={row.enToViState} />
          <DirectionChip prefix="V→E" state={row.viToEnState} />
        </div>
      ),
    },
    {
      key: 'confidence',
      header: 'Độ tự tin',
      render: (row) => <ConfidenceDots level={row.confidenceLevel} />,
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            aria-pressed={row.isFavorite}
            aria-label={
              row.isFavorite
                ? `Bỏ yêu thích từ ${row.word}`
                : `Đánh dấu yêu thích từ ${row.word}`
            }
            onClick={() => toggleFavoriteMutation.mutate(row)}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-transparent transition-colors cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              row.isFavorite
                ? 'text-[var(--warning-ink)] hover:bg-[var(--warning-soft)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
            )}
          >
            <Star
              className={cn('h-4 w-4', row.isFavorite && 'fill-current')}
              aria-hidden="true"
            />
          </button>
          <Link
            to={`/vocabulary/${row.id}`}
            className="inline-flex h-8 items-center rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 text-[12.5px] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
          >
            Chi tiết →
          </Link>
        </div>
      ),
    },
  ];

  const items = vocabQuery.data ?? [];
  const tags = tagsQuery.data ?? [];
  const activeCollectionName = useMemo(
    () => sortedCollections.find((c) => c.id === selectedCollectionId)?.name,
    [sortedCollections, selectedCollectionId],
  );

  return (
    <div className="space-y-6">
      {/* Header & Top Action Buttons */}
      <header className="flex flex-col gap-4 border-b border-[var(--border-hairline)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--ink-primary)]">
            Thư viện từ vựng
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            Quản lý từ vựng theo bộ sưu tập, nhãn chủ đề và tiến độ ghi nhớ hai chiều.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/vocabulary/comparisons"
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-[13.5px] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <GitCompare className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            So sánh từ dễ nhầm
          </Link>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setImportOpen(true)}
          >
            Nhập CSV/XLSX
          </Button>
          <a
            href={exportCsvUrl}
            download="vocabulary-export.csv"
            className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-[13.5px] font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Xuất CSV
          </a>
          <Button
            variant="primary"
            size="md"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={handleOpenAddVocab}
          >
            Thêm từ vựng
          </Button>
        </div>
      </header>

      {/* Main Split: Left Collections & Tags Rail + Right Table Area */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left Collections Rail */}
        <aside
          aria-label="Bộ sưu tập và nhãn từ vựng"
          className="w-full shrink-0 space-y-5 lg:w-64"
        >
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                  Bộ sưu tập
                </h2>
                <button
                  type="button"
                  onClick={() => setCreatingCollection((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer"
                >
                  <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  + Tạo mới
                </button>
              </div>

              {creatingCollection ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newCollectionName.trim()) {
                      createCollectionMutation.mutate();
                    }
                  }}
                  className="space-y-2 rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)]/30 p-2.5"
                >
                  <Input
                    label="Tên bộ sưu tập *"
                    autoFocus
                    required
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Ví dụ: IELTS Speaking Part 2"
                  />
                  <Input
                    label="Mô tả (tùy chọn)"
                    value={newCollectionDesc}
                    onChange={(e) => setNewCollectionDesc(e.target.value)}
                    placeholder="Ghi chú ngắn..."
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreatingCollection(false)}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={!newCollectionName.trim()}
                      loading={createCollectionMutation.isPending}
                    >
                      Lưu
                    </Button>
                  </div>
                </form>
              ) : null}

              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    aria-pressed={!selectedCollectionId}
                    onClick={() => setSelectedCollectionId('')}
                    className={cn(
                      'flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[13px] font-medium transition-colors cursor-pointer',
                      !selectedCollectionId
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
                    )}
                  >
                    <span>Tất cả từ vựng</span>
                  </button>
                </li>

                {sortedCollections.map((col) => {
                  const active = selectedCollectionId === col.id;
                  return (
                    <li key={col.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedCollectionId(col.id)}
                        className={cn(
                          'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer',
                          active
                            ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                            : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
                        )}
                      >
                        <span className="truncate">{col.name}</span>
                        <span className="shrink-0 text-[11.5px] text-[var(--ink-muted)]">
                          {col.wordCount}
                        </span>
                      </button>
                      {!col.isSystem ? (
                        <button
                          type="button"
                          aria-label={`Xóa bộ sưu tập ${col.name}`}
                          onClick={() => setDeleteCollectionTarget(col)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Tags Filter Pills */}
          <Card>
            <CardContent className="space-y-3 pt-4">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                Nhãn chủ đề (Tags)
              </h2>
              {tags.length === 0 ? (
                <p className="text-[12.5px] text-[var(--ink-muted)]">
                  Chưa có nhãn nào. Bạn có thể gắn nhãn trong trang chi tiết từng từ.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={!selectedTagId}
                    onClick={() => setSelectedTagId('')}
                    className={cn(
                      'rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer',
                      !selectedTagId
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]',
                    )}
                  >
                    Tất cả
                  </button>
                  {tags.map((tag) => {
                    const active = selectedTagId === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedTagId(active ? '' : tag.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer',
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]',
                        )}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: tag.color || '#0F766E' }}
                          aria-hidden="true"
                        />
                        <span>{tag.name}</span>
                        <span className="text-[11px] text-[var(--ink-muted)]">
                          ({tag.wordCount})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Right Main Content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Search & Filter Toolbar */}
          <search aria-label="Tìm kiếm và lọc từ vựng">
            <Card>
              <CardContent className="space-y-3.5 pt-4">
                <div className="grid gap-3 md:grid-cols-12">
                  <Input
                    label="Tìm kiếm từ vựng"
                    wrapperClassName="md:col-span-5"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={onImeSafeEnter(() => setDebouncedSearch(searchInput.trim()))}
                    placeholder="Tìm từ tiếng Anh, nghĩa tiếng Việt, định nghĩa..."
                    leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
                  />
                  <Select
                    label="Trình độ CEFR"
                    wrapperClassName="md:col-span-2"
                    value={cefrFilter}
                    onChange={(e) => setCefrFilter(e.target.value)}
                    options={[
                      { value: '', label: 'Tất cả' },
                      ...CEFR_LEVELS.map((lv) => ({
                        value: lv,
                        label: lv === 'unknown' ? 'Chưa phân loại' : lv,
                      })),
                    ]}
                  />
                  <Select
                    label="Từ loại"
                    wrapperClassName="md:col-span-3"
                    value={posFilter}
                    onChange={(e) => setPosFilter(e.target.value)}
                    options={[
                      { value: '', label: 'Tất cả từ loại' },
                      ...PART_OF_SPEECH_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      })),
                    ]}
                  />
                  <Select
                    label="Sắp xếp"
                    wrapperClassName="md:col-span-2"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as VocabSort)}
                    options={[
                      { value: 'newest', label: 'Mới nhất' },
                      { value: 'alpha', label: 'A–Z' },
                      { value: 'confidence', label: 'Tự tin thấp trước' },
                      { value: 'due', label: 'Đến hạn ôn tập' },
                    ]}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-44">
                      <Select
                        aria-label="Lọc theo trạng thái thành thạo"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        options={[
                          { value: '', label: 'Mọi trạng thái' },
                          { value: 'new', label: VOCAB_STATUS_LABELS.new },
                          { value: 'learning', label: VOCAB_STATUS_LABELS.learning },
                          { value: 'reviewing', label: VOCAB_STATUS_LABELS.reviewing },
                          { value: 'mastered', label: VOCAB_STATUS_LABELS.mastered },
                        ]}
                      />
                    </div>

                    <button
                      type="button"
                      aria-pressed={favoriteOnly}
                      onClick={() => setFavoriteOnly((v) => !v)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-medium transition-colors cursor-pointer',
                        favoriteOnly
                          ? 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-ink)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]',
                      )}
                    >
                      <Star
                        className={cn('h-3.5 w-3.5', favoriteOnly && 'fill-current')}
                        aria-hidden="true"
                      />
                      Yêu thích
                    </button>

                    <button
                      type="button"
                      aria-pressed={incompleteOnly}
                      onClick={() => setIncompleteOnly((v) => !v)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] font-medium transition-colors cursor-pointer',
                        incompleteOnly
                          ? 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-ink)]'
                          : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]',
                      )}
                    >
                      Thiếu thông tin
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--ink-muted)]">
                    <span>{items.length} từ vựng</span>
                    {hasActiveFilters ? (
                      <Button variant="ghost" size="sm" onClick={resetAllFilters}>
                        Xóa bộ lọc
                      </Button>
                    ) : null}
                    <div
                      role="group"
                      aria-label="Chế độ hiển thị từ vựng"
                      className="inline-flex rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5"
                    >
                      <button
                        type="button"
                        aria-pressed={viewMode === 'flashcard'}
                        onClick={() => handleChangeViewMode('flashcard')}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium transition-colors cursor-pointer',
                          viewMode === 'flashcard'
                            ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]',
                        )}
                      >
                        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                        Flashcard
                      </button>
                      <button
                        type="button"
                        aria-pressed={viewMode === 'table'}
                        onClick={() => handleChangeViewMode('table')}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium transition-colors cursor-pointer',
                          viewMode === 'table'
                            ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-xs'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]',
                        )}
                      >
                        <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Bảng chi tiết
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </search>

          {/* Vocabulary Table */}
          {vocabQuery.isLoading ? (
            <div className="space-y-2.5" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
                />
              ))}
            </div>
          ) : vocabQuery.isError ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 text-center">
                <AlertCircle className="mb-2 h-7 w-7 text-[var(--danger-ink)]" aria-hidden="true" />
                <p className="text-[14px] font-medium text-[var(--ink-primary)]">
                  Không thể tải danh sách từ vựng
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => vocabQuery.refetch()}
                >
                  Thử lại
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === 'flashcard' ? (
            items.length === 0 ? (
              <Card>
                <CardContent className="py-10">
                  <EmptyState
                    icon={<BookOpen className="h-5 w-5" />}
                    title={
                      hasActiveFilters
                        ? 'Không có từ vựng nào khớp với bộ lọc'
                        : 'Thư viện từ vựng đang trống'
                    }
                    description={
                      hasActiveFilters
                        ? 'Thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn một số bộ lọc.'
                        : 'Thêm từ vựng đầu tiên hoặc nhập nhanh từ CSV/Excel.'
                    }
                    actionLabel={hasActiveFilters ? undefined : 'Thêm từ vựng'}
                    onAction={hasActiveFilters ? undefined : handleOpenAddVocab}
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8">
                {/* Quizlet-style Interactive Flashcard Deck */}
                <FlashcardDeck
                  items={items}
                  collectionTitle={activeCollectionName}
                  onToggleFavorite={(item) => toggleFavoriteMutation.mutate(item)}
                />

                {/* Quizlet-style "Terms in this set" List Below Deck */}
                <section aria-labelledby="terms-in-set-heading" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2
                      id="terms-in-set-heading"
                      className="text-[16px] font-semibold text-[var(--ink-primary)]"
                    >
                      Thuật ngữ trong bộ này ({items.length})
                    </h2>
                    <Link
                      to={`/practice?tab=vocab&mode=flashcard${
                        selectedCollectionId
                          ? `&source=collection&collectionId=${selectedCollectionId}`
                          : '&source=all'
                      }`}
                      className="text-[13px] font-medium text-[var(--accent)] hover:underline"
                    >
                      Mở phòng luyện tập toàn màn hình →
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {items.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-col gap-3 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3.5 transition-colors hover:border-[var(--border-strong)] sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 sm:w-[38%] sm:border-r sm:border-[var(--border-hairline)] sm:pr-4">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <Link
                              to={`/vocabulary/${row.id}`}
                              className="text-[15px] font-semibold text-[var(--ink-primary)] hover:text-[var(--accent)] hover:underline"
                            >
                              {row.word}
                            </Link>
                            {row.ipa ? (
                              <span className="ipa text-[12.5px] text-[var(--ink-muted)]">
                                {row.ipa}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {row.cefrLevel !== 'unknown' ? (
                              <Badge tone="info" size="sm">
                                {row.cefrLevel}
                              </Badge>
                            ) : null}
                            {row.partOfSpeech && row.partOfSpeech !== 'other' ? (
                              <span className="text-[11.5px] text-[var(--ink-muted)]">
                                {POS_SHORT_MAP[row.partOfSpeech] ?? row.partOfSpeech}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="text-[14px] text-[var(--ink-primary)]">
                              {row.vietnameseMeaning || (
                                <span className="italic text-[var(--ink-muted)]">
                                  Chưa bổ sung nghĩa tiếng Việt
                                </span>
                              )}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <DirectionChip prefix="E→V" state={row.enToViState} />
                              <DirectionChip prefix="V→E" state={row.viToEnState} />
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={
                                row.isFavorite
                                  ? `Bỏ yêu thích từ ${row.word}`
                                  : `Đánh dấu yêu thích từ ${row.word}`
                              }
                              aria-pressed={row.isFavorite}
                              onClick={() => toggleFavoriteMutation.mutate(row)}
                              className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors cursor-pointer',
                                row.isFavorite
                                  ? 'text-[#D97706] hover:bg-[var(--warning-soft)]'
                                  : 'text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
                              )}
                            >
                              <Star
                                className={cn('h-4 w-4', row.isFavorite && 'fill-current')}
                                aria-hidden="true"
                              />
                            </button>
                            <Link
                              to={`/vocabulary/${row.id}`}
                              aria-label={`Xem chi tiết ${row.word}`}
                              className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-[var(--border-hairline)] px-2.5 text-[12px] font-medium text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                            >
                              <span>Chi tiết</span>
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )
          ) : (
            <ResponsiveTable
              ariaLabel="Danh sách từ vựng"
              caption="Danh sách từ vựng cá nhân cùng tiến độ ôn tập hai chiều"
              columns={columns}
              data={items}
              getRowKey={(row) => row.id}
              emptyState={
                <EmptyState
                  icon={<BookOpen className="h-5 w-5" />}
                  title={
                    hasActiveFilters
                      ? 'Không có từ vựng nào khớp với bộ lọc'
                      : 'Thư viện từ vựng đang trống'
                  }
                  description={
                    hasActiveFilters
                      ? 'Thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn một số bộ lọc.'
                      : 'Thêm từ vựng đầu tiên hoặc nhập nhanh từ CSV/Excel.'
                  }
                  actionLabel={hasActiveFilters ? undefined : 'Thêm từ vựng'}
                  onAction={hasActiveFilters ? undefined : handleOpenAddVocab}
                />
              }
            />
          )}
        </div>
      </div>

      {/* Import CSV / XLSX Modal */}
      <ImportVocabModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        collectionId={selectedCollectionId || undefined}
      />

      {/* Delete Custom Collection Confirmation */}
      <Dialog
        open={Boolean(deleteCollectionTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteCollectionTarget(null);
        }}
        title="Xóa bộ sưu tập"
        description="Các từ vựng bên trong vẫn được giữ nguyên trong thư viện, chỉ xóa nhóm phân loại này."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              autoFocus
              onClick={() => setDeleteCollectionTarget(null)}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteCollectionMutation.isPending}
              onClick={() => {
                if (deleteCollectionTarget) {
                  deleteCollectionMutation.mutate(deleteCollectionTarget.id);
                }
              }}
            >
              Xóa bộ sưu tập
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--ink-primary)]">
          Bạn có chắc muốn xóa bộ sưu tập{' '}
          <strong>&ldquo;{deleteCollectionTarget?.name}&rdquo;</strong>?
        </p>
      </Dialog>

      {/* Fallback Quick Add Vocab Dialog */}
      <Dialog
        open={fallbackAddOpen}
        onOpenChange={(open) => {
          if (!open) setFallbackAddOpen(false);
        }}
        title="Thêm từ vựng mới"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!fbWord.trim()) {
              setFbError('Vui lòng nhập từ tiếng Anh.');
              return;
            }
            fallbackCreateVocabMutation.mutate();
          }}
          className="space-y-4"
        >
          {fbError ? (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger-ink)]"
            >
              {fbError}
            </div>
          ) : null}

          <Input
            label="Từ / Cụm từ tiếng Anh *"
            autoFocus
            required
            value={fbWord}
            onChange={(e) => setFbWord(e.target.value)}
            placeholder="Ví dụ: meticulous"
          />
          <Input
            label="Nghĩa tiếng Việt"
            value={fbMeaning}
            onChange={(e) => setFbMeaning(e.target.value)}
            placeholder="tỉ mỉ, cẩn thận"
          />
          <Input
            label="Phiên âm IPA"
            className="ipa"
            value={fbIpa}
            onChange={(e) => setFbIpa(e.target.value)}
            placeholder="/məˈtɪk.jə.ləs/"
          />

          <div className="flex justify-end gap-2 border-t border-[var(--border-hairline)] pt-4">
            <Button variant="secondary" onClick={() => setFallbackAddOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={fallbackCreateVocabMutation.isPending}
            >
              Lưu từ vựng
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
