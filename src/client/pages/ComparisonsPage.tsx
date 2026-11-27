import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Edit3,
  ExternalLink,
  GitCompare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';
import { api } from '@client/lib/api';
import { onImeSafeEnter } from '@client/lib/ime';
import type { WordComparisonGroupDto } from '@shared/apiTypes';

interface EditableComparisonItem {
  vocabularyId: string | null;
  label: string;
  meaningVi: string;
  grammarDiff: string;
  usageContext: string;
  exampleEn: string;
  exampleVi: string;
  commonMistakeVi: string;
}

function emptyItem(): EditableComparisonItem {
  return {
    vocabularyId: null,
    label: '',
    meaningVi: '',
    grammarDiff: '',
    usageContext: '',
    exampleEn: '',
    exampleVi: '',
    commonMistakeVi: '',
  };
}

export function ComparisonsPage() {
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WordComparisonGroupDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WordComparisonGroupDto | null>(null);

  // Modal form state
  const [title, setTitle] = useState('');
  const [summaryVi, setSummaryVi] = useState('');
  const [items, setItems] = useState<EditableComparisonItem[]>([emptyItem(), emptyItem()]);
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const comparisonsQuery = useQuery({
    queryKey: ['comparisons'],
    queryFn: () => api.listComparisons(),
  });

  const vocabListQuery = useQuery({
    queryKey: ['vocabulary', 'all-for-comparisons'],
    queryFn: () => api.listVocabulary({ sort: 'alpha' }),
  });

  const filteredGroups = useMemo(() => {
    const groups = comparisonsQuery.data ?? [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.summaryVi.toLowerCase().includes(q) ||
        g.items.some(
          (it) =>
            it.label.toLowerCase().includes(q) ||
            it.meaningVi.toLowerCase().includes(q),
        ),
    );
  }, [comparisonsQuery.data, searchTerm]);

  const openCreateModal = () => {
    const initItems = [emptyItem(), emptyItem()];
    setEditingGroup(null);
    setTitle('');
    setSummaryVi('');
    setItems(initItems);
    setInitialSnapshot(JSON.stringify({ title: '', summaryVi: '', items: initItems }));
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (group: WordComparisonGroupDto) => {
    setEditingGroup(group);
    setTitle(group.title);
    setSummaryVi(group.summaryVi);
    const mapped = group.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((it) => ({
        vocabularyId: it.vocabularyId,
        label: it.label,
        meaningVi: it.meaningVi,
        grammarDiff: it.grammarDiff,
        usageContext: it.usageContext,
        exampleEn: it.exampleEn,
        exampleVi: it.exampleVi,
        commonMistakeVi: it.commonMistakeVi,
      }));
    while (mapped.length < 2) {
      mapped.push(emptyItem());
    }
    const clamped = mapped.slice(0, 4);
    setItems(clamped);
    setInitialSnapshot(
      JSON.stringify({ title: group.title, summaryVi: group.summaryVi, items: clamped }),
    );
    setFormError(null);
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        summaryVi: summaryVi.trim(),
        items: items.map((it) => ({
          vocabularyId: it.vocabularyId || null,
          label: it.label.trim(),
          meaningVi: it.meaningVi.trim(),
          grammarDiff: it.grammarDiff.trim(),
          usageContext: it.usageContext.trim(),
          exampleEn: it.exampleEn.trim(),
          exampleVi: it.exampleVi.trim(),
          commonMistakeVi: it.commonMistakeVi.trim(),
        })),
      };
      return editingGroup
        ? api.updateComparison(editingGroup.id, payload)
        : api.createComparison(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      setModalOpen(false);
      success(
        editingGroup
          ? `Đã cập nhật nhóm "${saved.title}"`
          : `Đã tạo nhóm so sánh "${saved.title}"`,
      );
    },
    onError: (err) => {
      setFormError(
        err instanceof Error ? err.message : 'Không thể lưu nhóm so sánh',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteComparison(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comparisons'] });
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      setDeleteTarget(null);
      setModalOpen(false);
      success('Đã xóa nhóm so sánh');
    },
    onError: (err) => {
      toastError(
        'Không thể xóa nhóm so sánh',
        err instanceof Error ? err.message : undefined,
      );
    },
  });

  const handleSubmitModal = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('Vui lòng nhập tiêu đề nhóm so sánh.');
      return;
    }
    if (items.length < 2 || items.length > 4) {
      setFormError('Mỗi nhóm so sánh cần từ 2 đến 4 từ.');
      return;
    }
    if (items.some((it) => !it.label.trim())) {
      setFormError('Vui lòng nhập nhãn từ tiếng Anh cho tất cả các cột.');
      return;
    }
    saveMutation.mutate();
  };

  const isFormDirty =
    modalOpen &&
    JSON.stringify({ title, summaryVi, items }) !== initialSnapshot;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/vocabulary"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--accent)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Thư viện từ vựng
        </Link>
      </div>

      <header className="flex flex-col gap-4 border-b border-[var(--border-hairline)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--ink-primary)]">
            So sánh từ dễ nhầm lẫn
          </h1>
          <p className="mt-1 text-[14px] text-[var(--ink-secondary)]">
            Đối chiếu song song nghĩa tiếng Việt, ngữ pháp, ngữ cảnh và lỗi thường gặp của người
            Việt giữa các cặp/nhóm từ hay nhầm.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={openCreateModal}
        >
          Tạo nhóm so sánh mới
        </Button>
      </header>

      {/* Search */}
      <search aria-label="Tìm nhóm so sánh từ">
        <div className="max-w-md">
          <Input
            label="Tìm cặp / nhóm từ"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={onImeSafeEnter(() => setSearchTerm((v) => v.trim()))}
            placeholder="Ví dụ: Affect vs Effect, borrow, kinh tế..."
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
      </search>

      {/* Content */}
      {comparisonsQuery.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
            />
          ))}
        </div>
      ) : comparisonsQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <AlertCircle className="mb-2 h-7 w-7 text-[var(--danger-ink)]" aria-hidden="true" />
            <p className="text-[14px] font-medium text-[var(--ink-primary)]">
              Không thể tải danh sách so sánh từ
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => comparisonsQuery.refetch()}
            >
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          icon={<GitCompare className="h-5 w-5" />}
          title={
            searchTerm.trim()
              ? 'Không tìm thấy nhóm so sánh phù hợp'
              : 'Chưa có nhóm so sánh từ dễ nhầm nào'
          }
          description={
            searchTerm.trim()
              ? 'Thử đổi từ khóa tìm kiếm hoặc tạo một nhóm so sánh mới.'
              : 'Tạo bảng đối chiếu các cặp từ dễ nhầm như Affect vs Effect, Economic vs Economical...'
          }
          actionLabel={searchTerm.trim() ? undefined : '+ Tạo nhóm so sánh mới'}
          onAction={searchTerm.trim() ? undefined : openCreateModal}
        />
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => {
            const orderedItems = group.items
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder);

            return (
              <Card key={group.id} elevated>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-[18px]">{group.title}</CardTitle>
                      <Badge tone="accent" size="sm">
                        {orderedItems.length} từ đối chiếu
                      </Badge>
                    </div>
                    {group.summaryVi ? (
                      <CardDescription>{group.summaryVi}</CardDescription>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={() => openEditModal(group)}
                    >
                      Chỉnh sửa
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Xóa nhóm so sánh ${group.title}`}
                      onClick={() => setDeleteTarget(group)}
                      className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="pt-4">
                  <ResponsiveTableRegion ariaLabel={`Ma trận so sánh ${group.title}`}>
                    <table className="w-full text-left text-[13.5px]">
                      <caption className="sr-only">
                        Bảng so sánh chi tiết cho nhóm {group.title}
                      </caption>
                      <thead>
                        <tr className="bg-[var(--bg-subtle)]">
                          <th
                            scope="col"
                            className="w-44 border-b border-[var(--border-hairline)] px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]"
                          >
                            Tiêu chí
                          </th>
                          {orderedItems.map((it) => (
                            <th
                              key={it.id}
                              scope="col"
                              className="min-w-[200px] border-b border-[var(--border-hairline)] px-4 py-3 text-[15px] font-semibold text-[var(--ink-primary)]"
                            >
                              {it.vocabularyId ? (
                                <Link
                                  to={`/vocabulary/${it.vocabularyId}`}
                                  className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline"
                                >
                                  <span>{it.label}</span>
                                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                              ) : (
                                <span>{it.label}</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        <tr className="border-b border-[var(--border-hairline)]">
                          <th
                            scope="row"
                            className="bg-[var(--bg-surface)] px-4 py-3 align-top font-medium text-[var(--ink-secondary)]"
                          >
                            Nghĩa tiếng Việt
                          </th>
                          {orderedItems.map((it) => (
                            <td
                              key={it.id}
                              data-label={it.label}
                              className="px-4 py-3 align-top font-medium text-[var(--ink-primary)]"
                            >
                              {it.meaningVi || '—'}
                            </td>
                          ))}
                        </tr>

                        <tr className="border-b border-[var(--border-hairline)]">
                          <th
                            scope="row"
                            className="bg-[var(--bg-surface)] px-4 py-3 align-top font-medium text-[var(--ink-secondary)]"
                          >
                            Khác biệt ngữ pháp
                          </th>
                          {orderedItems.map((it) => (
                            <td
                              key={it.id}
                              data-label={it.label}
                              className="px-4 py-3 align-top text-[var(--ink-secondary)]"
                            >
                              {it.grammarDiff || '—'}
                            </td>
                          ))}
                        </tr>

                        <tr className="border-b border-[var(--border-hairline)]">
                          <th
                            scope="row"
                            className="bg-[var(--bg-surface)] px-4 py-3 align-top font-medium text-[var(--ink-secondary)]"
                          >
                            Ngữ cảnh sử dụng
                          </th>
                          {orderedItems.map((it) => (
                            <td
                              key={it.id}
                              data-label={it.label}
                              className="px-4 py-3 align-top text-[var(--ink-secondary)]"
                            >
                              {it.usageContext || '—'}
                            </td>
                          ))}
                        </tr>

                        <tr className="border-b border-[var(--border-hairline)]">
                          <th
                            scope="row"
                            className="bg-[var(--bg-surface)] px-4 py-3 align-top font-medium text-[var(--ink-secondary)]"
                          >
                            Ví dụ (Anh – Việt)
                          </th>
                          {orderedItems.map((it) => (
                            <td
                              key={it.id}
                              data-label={it.label}
                              className="px-4 py-3 align-top"
                            >
                              {it.exampleEn || it.exampleVi ? (
                                <div className="space-y-1">
                                  {it.exampleEn ? (
                                    <p className="text-[var(--ink-primary)]">{it.exampleEn}</p>
                                  ) : null}
                                  {it.exampleVi ? (
                                    <p className="text-[12.5px] text-[var(--ink-muted)]">
                                      {it.exampleVi}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                          ))}
                        </tr>

                        <tr>
                          <th
                            scope="row"
                            className="bg-[var(--bg-surface)] px-4 py-3 align-top font-medium text-[var(--warning-ink)]"
                          >
                            Lỗi người Việt hay gặp
                          </th>
                          {orderedItems.map((it) => (
                            <td
                              key={it.id}
                              data-label={it.label}
                              className="px-4 py-3 align-top text-[var(--ink-secondary)]"
                            >
                              {it.commonMistakeVi ? (
                                <span className="inline-block rounded-[6px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-2.5 py-1 text-[12.5px] text-[var(--warning-ink)]">
                                  {it.commonMistakeVi}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </ResponsiveTableRegion>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Comparison Group Modal */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) setModalOpen(false);
        }}
        title={
          editingGroup ? `Chỉnh sửa nhóm "${editingGroup.title}"` : 'Tạo nhóm so sánh mới'
        }
        description="Thêm từ 2 đến 4 từ dễ nhầm lẫn để đối chiếu trực diện theo từng tiêu chí."
        size="xl"
        dirty={isFormDirty}
      >
        <form onSubmit={handleSubmitModal} className="space-y-5">
          {formError ? (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-[13px] text-[var(--danger-ink)]"
            >
              {formError}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Tiêu đề nhóm so sánh *"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Affect vs Effect"
            />
            <Input
              label="Tóm tắt điểm khác biệt chính"
              value={summaryVi}
              onChange={(e) => setSummaryVi(e.target.value)}
              placeholder="Affect thường là động từ (tác động); Effect thường là danh từ (kết quả)."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-[var(--ink-primary)]">
                Các từ cần so sánh ({items.length}/4)
              </p>
              {items.length < 4 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => setItems((prev) => [...prev, emptyItem()])}
                >
                  Thêm từ (tối đa 4)
                </Button>
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[var(--accent)]">
                      Từ #{idx + 1}
                    </span>
                    {items.length > 2 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Xóa từ thứ ${idx + 1}`}
                        onClick={() =>
                          setItems((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Từ / Nhãn cột *"
                      required
                      value={item.label}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...item, label: e.target.value };
                        setItems(next);
                      }}
                      placeholder="Ví dụ: affect (v)"
                    />
                    <Select
                      label="Liên kết từ trong thư viện"
                      value={item.vocabularyId ?? ''}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = {
                          ...item,
                          vocabularyId: e.target.value || null,
                        };
                        setItems(next);
                      }}
                      options={[
                        { value: '', label: 'Tự động khớp theo tên từ' },
                        ...(vocabListQuery.data ?? []).map((v) => ({
                          value: v.id,
                          label: `${v.word}${v.vietnameseMeaning ? ` — ${v.vietnameseMeaning}` : ''}`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Nghĩa tiếng Việt"
                      value={item.meaningVi}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...item, meaningVi: e.target.value };
                        setItems(next);
                      }}
                      placeholder="tác động, ảnh hưởng đến..."
                    />
                    <Input
                      label="Khác biệt ngữ pháp"
                      value={item.grammarDiff}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...item, grammarDiff: e.target.value };
                        setItems(next);
                      }}
                      placeholder="Ngoại động từ + O trực tiếp..."
                    />
                  </div>

                  <Input
                    label="Ngữ cảnh sử dụng"
                    value={item.usageContext}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...item, usageContext: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Dùng khi nhấn mạnh quá trình tác động..."
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Ví dụ (Tiếng Anh)"
                      value={item.exampleEn}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...item, exampleEn: e.target.value };
                        setItems(next);
                      }}
                    />
                    <Input
                      label="Dịch ví dụ (Tiếng Việt)"
                      value={item.exampleVi}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...item, exampleVi: e.target.value };
                        setItems(next);
                      }}
                    />
                  </div>

                  <Textarea
                    label="Lỗi người Việt hay gặp"
                    rows={2}
                    value={item.commonMistakeVi}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...item, commonMistakeVi: e.target.value };
                      setItems(next);
                    }}
                    placeholder="Ví dụ: Hay viết nhầm 'affect to something' thay vì 'affect something'."
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
            <div>
              {editingGroup ? (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setDeleteTarget(editingGroup)}
                  className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Xóa nhóm này
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" loading={saveMutation.isPending}>
                {editingGroup ? 'Lưu thay đổi' : 'Tạo nhóm so sánh'}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Xóa nhóm so sánh"
        description="Các từ vựng liên kết trong thư viện sẽ vẫn được giữ nguyên."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              autoFocus
              onClick={() => setDeleteTarget(null)}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              Xóa nhóm
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-[var(--ink-primary)]">
          Bạn có chắc muốn xóa nhóm so sánh{' '}
          <strong>&ldquo;{deleteTarget?.title}&rdquo;</strong>?
        </p>
      </Dialog>
    </div>
  );
}
