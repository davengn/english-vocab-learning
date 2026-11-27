import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CEFR_LEVELS, PART_OF_SPEECH_OPTIONS } from '../../../shared/schemas';
import { api, ApiError } from '../../lib/api';
import { isImeComposing } from '../../lib/ime';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../ui/Toast';

interface QuickAddVocabModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickAddVocabModal({ open, onClose }: QuickAddVocabModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [word, setWord] = useState('');
  const [vietnameseMeaning, setVietnameseMeaning] = useState('');
  const [ipa, setIpa] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('noun');
  const [cefrLevel, setCefrLevel] = useState<(typeof CEFR_LEVELS)[number]>('B1');
  const [exampleSentence, setExampleSentence] = useState('');
  const [exampleTranslation, setExampleTranslation] = useState('');
  const [vnCommonMistakes, setVnCommonMistakes] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDirty = Boolean(word.trim() || vietnameseMeaning.trim() || exampleSentence.trim());

  const resetForm = () => {
    setWord('');
    setVietnameseMeaning('');
    setIpa('');
    setPartOfSpeech('noun');
    setCefrLevel('B1');
    setExampleSentence('');
    setExampleTranslation('');
    setVnCommonMistakes('');
    setDuplicateId(null);
    setErrorMsg(null);
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.createVocabulary({
        word: word.trim(),
        vietnameseMeaning: vietnameseMeaning.trim(),
        ipa: ipa.trim(),
        partOfSpeech,
        cefrLevel,
        vnCommonMistakes: vnCommonMistakes.trim(),
        examples: exampleSentence.trim()
          ? [
              {
                englishSentence: exampleSentence.trim(),
                vietnameseTranslation: exampleTranslation.trim(),
                highlightText: word.trim(),
              },
            ]
          : [],
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['vocabulary'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      toast({
        tone: 'success',
        title: `Đã thêm từ "${created.word}" vào thư viện`,
        description: 'Từ mới đã được đưa vào lịch ôn tập 2 chiều.',
      });
      resetForm();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setDuplicateId(err.existingId ?? null);
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu từ vựng');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    setErrorMsg(null);
    setDuplicateId(null);
    if (!word.trim()) {
      setErrorMsg('Vui lòng nhập từ hoặc cụm từ tiếng Anh.');
      return;
    }
    mutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isImeComposing(e)) {
      e.preventDefault();
      if (mutation.isPending) return;
      if (!word.trim()) {
        setErrorMsg('Vui lòng nhập từ hoặc cụm từ tiếng Anh.');
        return;
      }
      mutation.mutate();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="Thêm từ vựng nhanh"
      description="Bạn có thể lưu trước từ còn thiếu nghĩa và bổ sung chi tiết sau."
      dirty={isDirty}
      size="lg"
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            <p>{errorMsg}</p>
            {duplicateId && (
              <Link
                to={`/vocabulary/${duplicateId}`}
                onClick={() => {
                  resetForm();
                  onClose();
                }}
                className="mt-1 inline-block font-medium text-[var(--accent)] underline"
              >
                Mở trang chi tiết của từ đã tồn tại →
              </Link>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Từ / Cụm từ tiếng Anh *"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Ví dụ: meticulous, make a decision..."
            autoFocus
            required
          />
          <Input
            label="Phiên âm IPA"
            value={ipa}
            onChange={(e) => setIpa(e.target.value)}
            placeholder="/məˈtɪk.jə.ləs/"
            className="ipa"
          />
        </div>

        <Input
          label="Nghĩa tiếng Việt"
          value={vietnameseMeaning}
          onChange={(e) => setVietnameseMeaning(e.target.value)}
          placeholder="tỉ mỉ, cẩn thận từng chi tiết"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Từ loại"
            value={partOfSpeech}
            onChange={(e) => setPartOfSpeech(e.target.value)}
            options={PART_OF_SPEECH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <Select
            label="Trình độ CEFR"
            value={cefrLevel}
            onChange={(e) => setCefrLevel(e.target.value as (typeof CEFR_LEVELS)[number])}
            options={CEFR_LEVELS.map((lv) => ({
              value: lv,
              label: lv === 'unknown' ? 'Chưa phân loại' : lv,
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Câu ví dụ (Tiếng Anh)"
            value={exampleSentence}
            onChange={(e) => setExampleSentence(e.target.value)}
            placeholder="She is meticulous about details."
          />
          <Input
            label="Dịch ví dụ (Tiếng Việt)"
            value={exampleTranslation}
            onChange={(e) => setExampleTranslation(e.target.value)}
            placeholder="Cô ấy rất tỉ mỉ về chi tiết."
          />
        </div>

        <Textarea
          label="Lưu ý lỗi người Việt hay gặp (tùy chọn)"
          rows={2}
          value={vnCommonMistakes}
          onChange={(e) => setVnCommonMistakes(e.target.value)}
          placeholder="Ví dụ: Không dùng 'affect to', đi thẳng với tân ngữ..."
        />

        <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
          <span className="text-xs text-[var(--ink-muted)]">
            Mẹo: Nhấn <kbd className="formula">⌘/Ctrl + Enter</kbd> để lưu nhanh
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                resetForm();
                onClose();
              }}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              Lưu từ vựng
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
