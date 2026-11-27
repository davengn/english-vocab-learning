import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  SESSION_SOURCE_LABELS,
  SESSION_SOURCES,
  todayIsoDate,
} from '../../../shared/schemas';
import type { SessionSourceType } from '../../../shared/apiTypes';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../ui/Toast';

interface QuickCreateSessionModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickCreateSessionModal({ open, onClose }: QuickCreateSessionModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [learningDate, setLearningDate] = useState(todayIsoDate());
  const [sourceType, setSourceType] = useState<SessionSourceType>('english_class');
  const [learningType, setLearningType] = useState('Từ vựng & Ngữ pháp');
  const [generalNotes, setGeneralNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setLearningDate(todayIsoDate());
    setSourceType('english_class');
    setLearningType('Từ vựng & Ngữ pháp');
    setGeneralNotes('');
    setErrorMsg(null);
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.createSession({
        title: title.trim(),
        learningDate,
        sourceType,
        learningType: learningType.trim() || 'Tổng hợp',
        generalNotes,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast({
        tone: 'success',
        title: 'Đã tạo buổi học mới',
        description: 'Bạn có thể dán hàng loạt từ vựng và ghi chú ngữ pháp ngay bây giờ.',
      });
      reset();
      onClose();
      navigate(`/sessions/${created.id}`);
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo buổi học');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!title.trim()) {
      setErrorMsg('Vui lòng nhập tiêu đề buổi học.');
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Tạo buổi học mới"
      description="Ghi nhận toàn bộ từ vựng, chủ điểm ngữ pháp và ghi chú sau giờ học."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        <Input
          label="Tiêu đề buổi học *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ví dụ: Buổi 12 — IELTS Reading Environment & Present Perfect"
          autoFocus
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Ngày học"
            type="date"
            value={learningDate}
            onChange={(e) => setLearningDate(e.target.value)}
            required
          />
          <Select
            label="Nguồn học"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SessionSourceType)}
            options={SESSION_SOURCES.map((src) => ({
              value: src,
              label: SESSION_SOURCE_LABELS[src],
            }))}
          />
        </div>

        <Input
          label="Loại hình học"
          value={learningType}
          onChange={(e) => setLearningType(e.target.value)}
          placeholder="Ví dụ: IELTS Writing, Giao tiếp, Nghe Podcast, Đọc sách..."
        />

        <Textarea
          label="Ghi chú tổng quan ban đầu (tùy chọn)"
          rows={3}
          value={generalNotes}
          onChange={(e) => setGeneralNotes(e.target.value)}
          placeholder="Tóm tắt trọng tâm bài học hôm nay..."
        />

        <div className="flex justify-end gap-2 border-t border-[var(--border-hairline)] pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Hủy
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Mở không gian buổi học
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
