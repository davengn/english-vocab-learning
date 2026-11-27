import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import type {
  GrammarDifficulty,
  GrammarQuestionType,
  PracticeQuestionDto,
} from '@shared/apiTypes';
import {
  GRAMMAR_DIFFICULTIES,
  GRAMMAR_DIFFICULTY_LABELS,
  GRAMMAR_QUESTION_TYPES,
  GRAMMAR_QUESTION_TYPE_LABELS,
} from '@shared/schemas';
import { api } from '@client/lib/api';
import { Button } from '@client/components/ui/Button';
import { Dialog } from '@client/components/ui/Dialog';
import { Input } from '@client/components/ui/Input';
import { Select } from '@client/components/ui/Select';
import { Textarea } from '@client/components/ui/Textarea';
import { useToast } from '@client/components/ui/Toast';

export interface QuestionBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestion?: PracticeQuestionDto | null;
  defaultGrammarTopicId?: string | null;
  grammarTopics?: ReadonlyArray<{ id: string; title: string; titleVi: string }>;
  onSaved?: (question: PracticeQuestionDto) => void;
}

const OPTION_BASED_TYPES = new Set<GrammarQuestionType>([
  'multiple_choice',
  'contextual_selection',
  'error_identification',
  'word_ordering',
  'phrase_conjugation',
]);

function splitPromptTokens(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseAcceptableList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Native <dialog> modal for creating or editing a PracticeQuestion across all 10 grammar question types.
 */
export function QuestionBuilderModal({
  open,
  onOpenChange,
  initialQuestion = null,
  defaultGrammarTopicId = null,
  grammarTopics: providedTopics,
  onSaved,
}: QuestionBuilderModalProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const topicsQuery = useQuery({
    queryKey: ['grammar-topics', 'picker'],
    queryFn: () => api.listGrammarTopics(),
    enabled: open && !providedTopics,
  });

  const topics = providedTopics ?? topicsQuery.data ?? [];

  const [grammarTopicId, setGrammarTopicId] = useState<string>('');
  const [questionType, setQuestionType] = useState<GrammarQuestionType>('multiple_choice');
  const [difficulty, setDifficulty] = useState<GrammarDifficulty>('intermediate');
  const [prompt, setPrompt] = useState('');
  const [promptVi, setPromptVi] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [acceptableRaw, setAcceptableRaw] = useState('');
  const [explanationVi, setExplanationVi] = useState('');
  const [showOptionsEditor, setShowOptionsEditor] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ prompt?: string; correctAnswer?: string }>({});
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialQuestion) {
      setGrammarTopicId(initialQuestion.grammarTopicId ?? '');
      setQuestionType(initialQuestion.questionType);
      setDifficulty(initialQuestion.difficulty);
      setPrompt(initialQuestion.prompt);
      setPromptVi(initialQuestion.promptVi);
      setOptions(
        initialQuestion.options.length > 0
          ? initialQuestion.options
          : OPTION_BASED_TYPES.has(initialQuestion.questionType)
            ? ['', '', '', '']
            : [],
      );
      setCorrectAnswer(initialQuestion.correctAnswer);
      const extras = initialQuestion.acceptableAnswers.filter(
        (ans) => ans.trim() !== initialQuestion.correctAnswer.trim(),
      );
      setAcceptableRaw(extras.join('\n'));
      setExplanationVi(initialQuestion.explanationVi);
      setShowOptionsEditor(
        OPTION_BASED_TYPES.has(initialQuestion.questionType) || initialQuestion.options.length > 0,
      );
    } else {
      setGrammarTopicId(defaultGrammarTopicId ?? '');
      setQuestionType('multiple_choice');
      setDifficulty('intermediate');
      setPrompt('');
      setPromptVi('');
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
      setAcceptableRaw('');
      setExplanationVi('');
      setShowOptionsEditor(true);
    }
    setFieldErrors({});
    setIsDirty(false);
  }, [open, initialQuestion, defaultGrammarTopicId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const cleanedOptions = options.map((o) => o.trim()).filter(Boolean);
      const parsedAcceptable = parseAcceptableList(acceptableRaw);
      const allAcceptable = Array.from(new Set([correctAnswer.trim(), ...parsedAcceptable]));

      const payload = {
        grammarTopicId: grammarTopicId || null,
        vocabularyId: initialQuestion?.vocabularyId ?? null,
        questionType,
        difficulty,
        prompt: prompt.trim(),
        promptVi: promptVi.trim(),
        options: cleanedOptions,
        correctAnswer: correctAnswer.trim(),
        acceptableAnswers: allAcceptable,
        explanationVi: explanationVi.trim(),
      };

      if (initialQuestion) {
        return api.updatePracticeQuestion(initialQuestion.id, payload);
      }
      return api.createPracticeQuestion(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['practice-questions'] });
      queryClient.invalidateQueries({ queryKey: ['grammar-topics'] });
      if (saved.grammarTopicId) {
        queryClient.invalidateQueries({ queryKey: ['grammar-topic', saved.grammarTopicId] });
      }
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      success(initialQuestion ? 'Đã cập nhật câu hỏi' : 'Đã tạo câu hỏi mới');
      setIsDirty(false);
      onSaved?.(saved);
      onOpenChange(false);
    },
    onError: (err) => {
      showError(
        'Không thể lưu câu hỏi',
        err instanceof Error ? err.message : 'Vui lòng kiểm tra lại dữ liệu.',
      );
    },
  });

  const handleTypeChange = (nextType: GrammarQuestionType) => {
    setQuestionType(nextType);
    setIsDirty(true);
    const needsOptions = OPTION_BASED_TYPES.has(nextType);
    setShowOptionsEditor(needsOptions);
    if (needsOptions && options.length === 0) {
      setOptions(['', '', '', '']);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: { prompt?: string; correctAnswer?: string } = {};
    if (!prompt.trim()) {
      errors.prompt = 'Vui lòng nhập nội dung đề bài.';
    }
    if (!correctAnswer.trim()) {
      errors.correctAnswer = 'Vui lòng nhập đáp án đúng.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.prompt) {
        promptRef.current?.focus();
      }
      return;
    }
    setFieldErrors({});
    mutation.mutate();
  };

  const optionLabel =
    questionType === 'word_ordering'
      ? 'Các mảnh từ (Word bank)'
      : questionType === 'phrase_conjugation'
        ? 'Các mảnh cụm từ & động từ gợi ý (ví dụ: She | (work) | since 2022)'
        : questionType === 'error_identification'
          ? 'Các cụm từ trong câu để người học chọn lỗi'
          : 'Các phương án lựa chọn';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialQuestion ? 'Chỉnh sửa câu hỏi luyện tập' : 'Tạo câu hỏi luyện tập mới'}
      description="Hỗ trợ đầy đủ 11 dạng bài tập ngữ pháp tự kiểm tra, không dùng AI."
      size="lg"
      dirty={isDirty}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="submit" form="question-builder-form" variant="primary" loading={mutation.isPending}>
            {initialQuestion ? 'Lưu thay đổi' : 'Tạo câu hỏi'}
          </Button>
        </>
      }
    >
      <form id="question-builder-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Chủ điểm ngữ pháp"
            value={grammarTopicId}
            onChange={(e) => {
              setGrammarTopicId(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Không gắn chủ điểm"
            options={topics.map((t) => ({
              value: t.id,
              label: t.titleVi ? `${t.title} — ${t.titleVi}` : t.title,
            }))}
          />

          <Select
            label="Dạng câu hỏi"
            value={questionType}
            onChange={(e) => handleTypeChange(e.target.value as GrammarQuestionType)}
            options={GRAMMAR_QUESTION_TYPES.map((type) => ({
              value: type,
              label: GRAMMAR_QUESTION_TYPE_LABELS[type],
            }))}
          />

          <Select
            label="Độ khó"
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value as GrammarDifficulty);
              setIsDirty(true);
            }}
            options={GRAMMAR_DIFFICULTIES.map((diff) => ({
              value: diff,
              label: GRAMMAR_DIFFICULTY_LABELS[diff],
            }))}
          />
        </div>

        <Textarea
          ref={promptRef}
          label="Đề bài (Prompt)"
          required
          rows={3}
          value={prompt}
          error={fieldErrors.prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setIsDirty(true);
            if (fieldErrors.prompt && e.target.value.trim()) {
              setFieldErrors((prev) => ({ ...prev, prompt: undefined }));
            }
          }}
          placeholder={
            questionType === 'word_ordering'
              ? 'Ví dụ: Sắp xếp các từ thành câu hoàn chỉnh:'
              : questionType === 'fill_in_blank'
                ? 'Ví dụ: She ______ (live) here since 2020.'
                : 'Nhập câu hỏi hoặc câu gốc cần xử lý...'
          }
        />

        <Input
          label="Hướng dẫn tiếng Việt (tùy chọn)"
          value={promptVi}
          onChange={(e) => {
            setPromptVi(e.target.value);
            setIsDirty(true);
          }}
          placeholder="Ví dụ: Chọn đáp án đúng hoặc viết lại câu theo thì Hiện tại hoàn thành..."
        />

        <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-canvas)]/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-[var(--ink-primary)]">{optionLabel}</p>
              <p className="text-[12px] text-[var(--ink-muted)]">
                {OPTION_BASED_TYPES.has(questionType)
                  ? 'Nên nhập từ 2 đến 6 lựa chọn hoặc mảnh từ.'
                  : 'Không bắt buộc cho dạng tự luận / điền từ.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {questionType === 'phrase_conjugation' && prompt.trim() && (
                <Button
                  size="sm"
                  variant="subtle"
                  leftIcon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => {
                    const fragments = prompt
                      .split(/\s*\/\s*/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (fragments.length > 0) {
                      setOptions(fragments);
                      setShowOptionsEditor(true);
                      setIsDirty(true);
                    }
                  }}
                >
                  Tách mảnh theo dấu /
                </Button>
              )}
              {questionType === 'word_ordering' && (
                <Button
                  size="sm"
                  variant="subtle"
                  leftIcon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => {
                    const source = correctAnswer.trim() || prompt.trim();
                    const tokens = splitPromptTokens(source);
                    if (tokens.length > 0) {
                      setOptions(tokens);
                      setShowOptionsEditor(true);
                      setIsDirty(true);
                    }
                  }}
                >
                  Tách từ từ đáp án
                </Button>
              )}
              {questionType === 'error_identification' && (
                <Button
                  size="sm"
                  variant="subtle"
                  leftIcon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => {
                    const tokens = splitPromptTokens(prompt);
                    if (tokens.length > 0) {
                      setOptions(tokens);
                      setShowOptionsEditor(true);
                      setIsDirty(true);
                    }
                  }}
                >
                  Tách từ từ đề bài
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowOptionsEditor((v) => !v)}
              >
                {showOptionsEditor ? 'Thu gọn' : 'Mở danh sách lựa chọn'}
              </Button>
            </div>
          </div>

          {showOptionsEditor && (
            <div className="mt-3 space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 text-center text-xs font-medium text-[var(--ink-muted)]">
                    {idx + 1}.
                  </span>
                  <Input
                    aria-label={`Lựa chọn ${idx + 1}`}
                    wrapperClassName="flex-1"
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[idx] = e.target.value;
                      setOptions(next);
                      setIsDirty(true);
                    }}
                    placeholder={`Lựa chọn / mảnh ${idx + 1}`}
                  />
                  {OPTION_BASED_TYPES.has(questionType) &&
                    questionType !== 'word_ordering' &&
                    questionType !== 'phrase_conjugation' &&
                    opt.trim() && (
                      <Button
                        size="sm"
                        variant={correctAnswer.trim() === opt.trim() ? 'primary' : 'subtle'}
                        onClick={() => {
                          setCorrectAnswer(opt.trim());
                          setIsDirty(true);
                        }}
                      >
                        {correctAnswer.trim() === opt.trim() ? 'Đáp án đúng' : 'Chọn đúng'}
                      </Button>
                    )}
                  <button
                    type="button"
                    aria-label={`Xóa lựa chọn ${idx + 1}`}
                    onClick={() => {
                      setOptions((prev) => prev.filter((_, i) => i !== idx));
                      setIsDirty(true);
                    }}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}

              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => {
                  setOptions((prev) => [...prev, '']);
                  setIsDirty(true);
                }}
              >
                Thêm lựa chọn
              </Button>
            </div>
          )}
        </div>

        <Input
          label="Đáp án đúng chuẩn"
          required
          value={correctAnswer}
          error={fieldErrors.correctAnswer}
          onChange={(e) => {
            setCorrectAnswer(e.target.value);
            setIsDirty(true);
            if (fieldErrors.correctAnswer && e.target.value.trim()) {
              setFieldErrors((prev) => ({ ...prev, correctAnswer: undefined }));
            }
          }}
          placeholder="Nhập đáp án đúng chính xác..."
        />

        <Textarea
          label="Các biến thể đáp án chấp nhận thêm (tùy chọn)"
          hint="Ngăn cách bằng dấu phẩy hoặc xuống dòng (ví dụ: haven't finished, have not finished)"
          rows={2}
          value={acceptableRaw}
          onChange={(e) => {
            setAcceptableRaw(e.target.value);
            setIsDirty(true);
          }}
          placeholder="Biến thể 1&#10;Biến thể 2"
        />

        <Textarea
          label="Giải thích bằng tiếng Việt"
          rows={3}
          value={explanationVi}
          onChange={(e) => {
            setExplanationVi(e.target.value);
            setIsDirty(true);
          }}
          placeholder="Giải thích ngắn gọn tại sao đáp án này đúng và bẫy người Việt hay gặp..."
        />
      </form>
    </Dialog>
  );
}
