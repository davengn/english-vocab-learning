import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type {
  DuplicateStrategy,
  ImportColumnMapping,
  ImportParseResponseDto,
} from '../../../shared/apiTypes';
import { normalizeWord } from '../../../shared/schemas';
import { api } from '../../lib/api';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';

interface ImportVocabModalProps {
  open: boolean;
  onClose: () => void;
  sessionId?: string;
  collectionId?: string;
  onImported?: () => void;
}

const MAPPING_FIELDS: Array<{ key: keyof ImportColumnMapping; label: string }> = [
  { key: 'word', label: 'Từ tiếng Anh *' },
  { key: 'vietnameseMeaning', label: 'Nghĩa tiếng Việt' },
  { key: 'ipa', label: 'Phiên âm IPA' },
  { key: 'partOfSpeech', label: 'Từ loại' },
  { key: 'cefrLevel', label: 'CEFR' },
  { key: 'englishDefinition', label: 'Định nghĩa tiếng Anh' },
  { key: 'exampleSentence', label: 'Ví dụ (Anh)' },
  { key: 'exampleTranslation', label: 'Dịch ví dụ (Việt)' },
  { key: 'notes', label: 'Ghi chú' },
];

export function ImportVocabModal({
  open,
  onClose,
  sessionId,
  collectionId,
  onImported,
}: ImportVocabModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [parsed, setParsed] = useState<ImportParseResponseDto | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('link_existing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setParsed(null);
    setMapping(null);
    setSelectedRows(new Set());
    setDuplicateStrategy('link_existing');
    setErrorMsg(null);
  };

  const parseMutation = useMutation({
    mutationFn: (file: File) => api.parseVocabImport(file),
    onSuccess: (data) => {
      setErrorMsg(null);
      setParsed(data);
      setMapping(data.columnMapping);
      setSelectedRows(new Set(data.rawRows.map((_, i) => i)));
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể đọc tệp CSV/XLSX');
    },
  });

  const mappedRows = useMemo(() => {
    if (!parsed || !mapping) return [];
    const colIndex = (header: string | null) => (header ? parsed.headers.indexOf(header) : -1);
    const idxWord = colIndex(mapping.word);
    const idxMeaning = colIndex(mapping.vietnameseMeaning);
    const idxIpa = colIndex(mapping.ipa);
    const idxPos = colIndex(mapping.partOfSpeech);
    const idxCefr = colIndex(mapping.cefrLevel);
    const idxDef = colIndex(mapping.englishDefinition);
    const idxEx = colIndex(mapping.exampleSentence);
    const idxExVi = colIndex(mapping.exampleTranslation);
    const idxNotes = colIndex(mapping.notes);

    const seenInFile = new Set<string>();
    return parsed.rawRows.map((cells, rowIndex) => {
      const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');
      const word = get(idxWord);
      const norm = word ? normalizeWord(word) : '';
      const duplicateInFile = norm ? seenInFile.has(norm) : false;
      if (norm) seenInFile.add(norm);
      const duplicateInDb = norm ? Boolean(parsed.existingWords[norm]) : false;

      return {
        rowIndex,
        word,
        vietnameseMeaning: get(idxMeaning),
        ipa: get(idxIpa),
        partOfSpeech: get(idxPos) || 'other',
        cefrLevel: get(idxCefr) || 'unknown',
        englishDefinition: get(idxDef),
        exampleSentence: get(idxEx),
        exampleTranslation: get(idxExVi),
        personalNotes: get(idxNotes),
        duplicateInDb,
        duplicateInFile,
        isValid: word.length > 0,
      };
    });
  }, [parsed, mapping]);

  const commitMutation = useMutation({
    mutationFn: () => {
      const chosen = mappedRows.filter((r) => selectedRows.has(r.rowIndex) && r.isValid);
      return api.commitVocabImport({
        rows: chosen.map((r) => ({
          word: r.word,
          vietnameseMeaning: r.vietnameseMeaning,
          ipa: r.ipa,
          partOfSpeech: r.partOfSpeech,
          cefrLevel: r.cefrLevel,
          englishDefinition: r.englishDefinition,
          exampleSentence: r.exampleSentence,
          exampleTranslation: r.exampleTranslation,
          personalNotes: r.personalNotes,
        })),
        collectionId,
        sessionId,
        duplicateStrategy,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      }
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast({
        tone: 'success',
        title: `Nhập thành công ${res.addedCount + res.mergedCount + res.linkedExistingCount} từ`,
        description: `Thêm mới: ${res.addedCount} · Gộp/Liên kết: ${res.mergedCount + res.linkedExistingCount} · Bỏ qua: ${res.skippedCount}`,
      });
      reset();
      onImported?.();
      onClose();
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể nhập dữ liệu');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseMutation.mutate(file);
    }
  };

  const toggleRow = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const validSelectedCount = mappedRows.filter(
    (r) => selectedRows.has(r.rowIndex) && r.isValid,
  ).length;

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Nhập từ vựng từ CSV / Excel (.xlsx)"
      description="Ánh xạ cột tường minh, kiểm tra trùng lặp và chọn lọc dòng trước khi lưu."
      size="xl"
    >
      <div className="space-y-4">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {!parsed ? (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)]/50 px-6 py-10 text-center transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/40">
            <FileSpreadsheet className="mb-3 h-9 w-9 text-[var(--accent)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--ink-primary)]">
              Chọn tệp CSV hoặc Excel (.xlsx) từ máy tính
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Hỗ trợ bảng có dòng tiêu đề (Word, Meaning, IPA, Example...). Tối đa 200 dòng mỗi lần nhập.
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--ink-primary)]">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {parseMutation.isPending ? 'Đang đọc tệp...' : 'Chọn tệp'}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 px-3.5 py-2.5">
              <div className="text-sm">
                <span className="font-medium text-[var(--ink-primary)]">{parsed.fileName}</span>
                <span className="ml-2 text-xs text-[var(--ink-muted)]">
                  ({parsed.totalRows} dòng dữ liệu)
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                Chọn tệp khác
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {MAPPING_FIELDS.map((field) => (
                <Select
                  key={field.key}
                  label={field.label}
                  value={mapping?.[field.key] ?? ''}
                  onChange={(e) =>
                    setMapping((prev) =>
                      prev ? { ...prev, [field.key]: e.target.value || null } : prev,
                    )
                  }
                  options={[
                    { value: '', label: '— Không ánh xạ —' },
                    ...parsed.headers.map((h) => ({ value: h, label: h })),
                  ]}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-full sm:w-72">
                <Select
                  label="Xử lý khi trùng từ trong thư viện"
                  value={duplicateStrategy}
                  onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
                  options={[
                    { value: 'link_existing', label: 'Giữ nguyên từ cũ & chỉ liên kết' },
                    { value: 'merge', label: 'Bổ sung các trường còn thiếu vào từ cũ' },
                    { value: 'skip', label: 'Bỏ qua các từ đã tồn tại' },
                  ]}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRows(new Set(mappedRows.map((r) => r.rowIndex)))}
                >
                  Chọn tất cả
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedRows(new Set())}>
                  Bỏ chọn
                </Button>
              </div>
            </div>

            <div className="max-h-64 overflow-auto rounded-lg border border-[var(--border-hairline)]">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-[var(--bg-subtle)] text-[var(--ink-secondary)]">
                  <tr>
                    <th className="w-9 px-3 py-2">Chọn</th>
                    <th className="px-3 py-2">Từ tiếng Anh</th>
                    <th className="px-3 py-2">Nghĩa tiếng Việt</th>
                    <th className="px-3 py-2">IPA</th>
                    <th className="px-3 py-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)] bg-[var(--bg-surface)]">
                  {mappedRows.map((r) => (
                    <tr key={r.rowIndex} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(r.rowIndex)}
                          disabled={!r.isValid}
                          onChange={() => toggleRow(r.rowIndex)}
                          aria-label={`Chọn dòng ${r.rowIndex + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--ink-primary)]">
                        {r.word || <span className="text-red-600">(Thiếu từ)</span>}
                      </td>
                      <td className="px-3 py-2 text-[var(--ink-secondary)]">
                        {r.vietnameseMeaning || '—'}
                      </td>
                      <td className="ipa px-3 py-2 text-[var(--ink-muted)]">{r.ipa || '—'}</td>
                      <td className="px-3 py-2">
                        {!r.isValid ? (
                          <Badge tone="danger" size="sm">
                            Thiếu từ
                          </Badge>
                        ) : r.duplicateInDb ? (
                          <Badge tone="warning" size="sm">
                            Đã có trong thư viện
                          </Badge>
                        ) : r.duplicateInFile ? (
                          <Badge tone="warning" size="sm">
                            Trùng trong tệp
                          </Badge>
                        ) : (
                          <Badge tone="success" size="sm">
                            Từ mới
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
              <p className="text-xs text-[var(--ink-secondary)]">
                Đã chọn <strong>{validSelectedCount}</strong> / {mappedRows.length} dòng hợp lệ
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    reset();
                    onClose();
                  }}
                >
                  Hủy
                </Button>
                <Button
                  variant="primary"
                  disabled={validSelectedCount === 0}
                  loading={commitMutation.isPending}
                  onClick={() => commitMutation.mutate()}
                >
                  Nhập {validSelectedCount} từ đã chọn
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
