import { z } from 'zod';

export function normalizeWord(word: string): string {
  return word.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeUnicode(text: string): string {
  return text.normalize('NFC').trim();
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

export function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// Enum Definitions & Vietnamese Display Maps
// ============================================================================

export const SESSION_SOURCES = [
  'english_class',
  'ielts_course',
  'textbook',
  'online_course',
  'youtube_podcast',
  'reading',
  'self_study',
  'other',
] as const;

export const SESSION_SOURCE_LABELS: Record<(typeof SESSION_SOURCES)[number], string> = {
  english_class: 'Lớp học tiếng Anh',
  ielts_course: 'Khóa học IELTS',
  textbook: 'Giáo trình / Sách',
  online_course: 'Khóa học online',
  youtube_podcast: 'YouTube / Podcast',
  reading: 'Đọc sách / Báo',
  self_study: 'Tự học',
  other: 'Khác',
};

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown'] as const;

export const PART_OF_SPEECH_OPTIONS = [
  { value: 'noun', label: 'Danh từ (n)' },
  { value: 'verb', label: 'Động từ (v)' },
  { value: 'adjective', label: 'Tính từ (adj)' },
  { value: 'adverb', label: 'Trạng từ (adv)' },
  { value: 'phrasal_verb', label: 'Cụm động từ (phr.v)' },
  { value: 'preposition', label: 'Giới từ (prep)' },
  { value: 'conjunction', label: 'Liên từ (conj)' },
  { value: 'idiom', label: 'Thành ngữ / Cụm cố định' },
  { value: 'collocation', label: 'Collocation' },
  { value: 'other', label: 'Khác' },
] as const;

export const REGISTER_LABELS = {
  formal: 'Trang trọng',
  neutral: 'Trung tính',
  informal: 'Thân mật / Đời thường',
} as const;

export const TONE_LABELS = {
  positive: 'Tích cực',
  neutral: 'Trung tính',
  negative: 'Tiêu cực',
} as const;

export const VOCAB_STATUS_LABELS = {
  new: 'Mới',
  learning: 'Đang học',
  reviewing: 'Đang ôn tập',
  mastered: 'Đã thành thạo',
} as const;

export const SKILL_DIRECTIONS = ['en_to_vi', 'vi_to_en', 'context', 'spelling'] as const;

export const SKILL_DIRECTION_LABELS: Record<(typeof SKILL_DIRECTIONS)[number], string> = {
  en_to_vi: 'Anh → Việt (Nhận diện)',
  vi_to_en: 'Việt → Anh (Nhớ chủ động)',
  context: 'Ngữ cảnh sử dụng',
  spelling: 'Chính tả',
};

export const VOCAB_PRACTICE_MODES = [
  'en_to_vi',
  'vi_to_en',
  'flashcard',
  'fill_in_blank',
  'context_recognition',
  'spelling',
  'collocation_match',
  'sentence_production',
] as const;

export const VOCAB_PRACTICE_MODE_LABELS: Record<(typeof VOCAB_PRACTICE_MODES)[number], string> = {
  en_to_vi: 'Anh → Việt',
  vi_to_en: 'Việt → Anh',
  flashcard: 'Flashcard',
  fill_in_blank: 'Điền vào chỗ trống',
  context_recognition: 'Nhận diện ngữ cảnh',
  spelling: 'Luyện chính tả',
  collocation_match: 'Ghép Collocation',
  sentence_production: 'Đặt câu tự kiểm tra',
};

export const GRAMMAR_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

export const GRAMMAR_DIFFICULTY_LABELS: Record<(typeof GRAMMAR_DIFFICULTIES)[number], string> = {
  beginner: 'Cơ bản',
  intermediate: 'Trung cấp',
  advanced: 'Nâng cao',
};

export const GRAMMAR_STATUS_LABELS = {
  not_started: 'Chưa học',
  learning: 'Đang học',
  practicing: 'Đang luyện tập',
  mastered: 'Đã thành thạo',
} as const;

export const GRAMMAR_QUESTION_TYPES = [
  'multiple_choice',
  'fill_in_blank',
  'error_identification',
  'sentence_transformation',
  'sentence_completion',
  'word_ordering',
  'phrase_conjugation',
  'vi_to_en',
  'en_to_vi',
  'contextual_selection',
  'sentence_correction',
] as const;

export const GRAMMAR_QUESTION_TYPE_LABELS: Record<
  (typeof GRAMMAR_QUESTION_TYPES)[number],
  string
> = {
  multiple_choice: 'Trắc nghiệm (Multiple choice)',
  fill_in_blank: 'Điền vào chỗ trống',
  error_identification: 'Tìm lỗi sai',
  sentence_transformation: 'Viết lại câu (Transformation)',
  sentence_completion: 'Hoàn thành câu',
  word_ordering: 'Sắp xếp từ thành câu',
  phrase_conjugation: 'Ghép cụm từ & Chia thì thành câu',
  vi_to_en: 'Dịch Việt → Anh',
  en_to_vi: 'Dịch Anh → Việt',
  contextual_selection: 'Chọn ngữ pháp theo ngữ cảnh',
  sentence_correction: 'Sửa câu sai',
};

export const MISTAKE_CATEGORIES = [
  'tense',
  'subject_verb_agreement',
  'articles',
  'prepositions',
  'word_order',
  'pluralization',
  'verb_forms',
  'vn_direct_translation',
  'vocabulary_usage',
] as const;

export const MISTAKE_CATEGORY_LABELS: Record<(typeof MISTAKE_CATEGORIES)[number], string> = {
  tense: 'Lỗi chia thì (Tenses)',
  subject_verb_agreement: 'Hòa hợp chủ – vị',
  articles: 'Mạo từ (a / an / the)',
  prepositions: 'Giới từ',
  word_order: 'Trật tự từ',
  pluralization: 'Số ít / Số nhiều',
  verb_forms: 'Dạng động từ (V-ing / to-V / V3)',
  vn_direct_translation: 'Dịch sát nghĩa Việt → Anh',
  vocabulary_usage: 'Dùng sai từ / Collocation',
};

// ============================================================================
// Zod Request Validation Schemas
// ============================================================================

export const createSessionSchema = z.object({
  title: z.string().trim().min(1, 'Vui lòng nhập tên buổi học'),
  learningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày học không hợp lệ'),
  sourceType: z.enum(SESSION_SOURCES).default('self_study'),
  learningType: z.string().trim().default('Tổng hợp'),
  generalNotes: z.string().default(''),
});

export const updateSessionSchema = createSessionSchema.partial();

export const quickAddVocabularySchema = z.object({
  word: z.string().trim().min(1, 'Vui lòng nhập từ hoặc cụm từ tiếng Anh'),
  vietnameseMeaning: z.string().trim().default(''),
  ipa: z.string().trim().default(''),
  partOfSpeech: z.string().trim().default('other'),
  cefrLevel: z.enum(CEFR_LEVELS).default('unknown'),
  englishDefinition: z.string().trim().default(''),
  exampleSentence: z.string().trim().default(''),
  exampleTranslation: z.string().trim().default(''),
  sessionNote: z.string().trim().default(''),
});

export const vocabularyInputSchema = z.object({
  word: z.string().trim().min(1, 'Từ tiếng Anh là bắt buộc'),
  ipa: z.string().trim().default(''),
  partOfSpeech: z.string().trim().default('other'),
  cefrLevel: z.enum(CEFR_LEVELS).default('unknown'),
  englishDefinition: z.string().default(''),
  vietnameseMeaning: z.string().default(''),
  vietnameseExplanation: z.string().default(''),
  englishExplanation: z.string().default(''),
  nuance: z.string().default(''),
  register: z.enum(['formal', 'neutral', 'informal']).default('neutral'),
  tone: z.enum(['positive', 'negative', 'neutral']).default('neutral'),
  usageContext: z.string().default(''),
  whenToUse: z.string().default(''),
  whenNotToUse: z.string().default(''),
  vnCommonMistakes: z.string().default(''),
  vnWrongCombinations: z.string().default(''),
  vnConfusingWords: z.string().default(''),
  vnTranslationTraps: z.string().default(''),
  personalNotes: z.string().default(''),
  source: z.string().default(''),
  confidenceLevel: z.number().int().min(1).max(5).default(2),
  isFavorite: z.boolean().default(false),
  examples: z
    .array(
      z.object({
        englishSentence: z.string().trim().min(1),
        vietnameseTranslation: z.string().default(''),
        highlightText: z.string().default(''),
      }),
    )
    .optional(),
  collocations: z
    .array(
      z.object({
        phrase: z.string().trim().min(1),
        vietnameseMeaning: z.string().default(''),
        exampleSentence: z.string().default(''),
        exampleTranslation: z.string().default(''),
      }),
    )
    .optional(),
  relations: z
    .array(
      z.object({
        relationType: z.enum([
          'synonym',
          'antonym',
          'word_family',
          'common_phrase',
          'phrasal_verb',
          'related_expression',
        ]),
        text: z.string().trim().min(1),
        note: z.string().default(''),
      }),
    )
    .optional(),
  collectionIds: z.array(z.string().uuid()).optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
});

export const grammarTopicInputSchema = z.object({
  categoryId: z.string().uuid('Vui lòng chọn danh mục ngữ pháp'),
  title: z.string().trim().min(1, 'Tên chủ điểm tiếng Anh là bắt buộc'),
  titleVi: z.string().trim().default(''),
  difficulty: z.enum(GRAMMAR_DIFFICULTIES).default('intermediate'),
  cefrLevel: z.enum(CEFR_LEVELS).default('B1'),
  learningStatus: z
    .enum(['not_started', 'learning', 'practicing', 'mastered'])
    .default('learning'),
  explanationVi: z.string().default(''),
  explanationEn: z.string().default(''),
  whatItIs: z.string().default(''),
  whyUsed: z.string().default(''),
  whenUsed: z.string().default(''),
  howToRecognize: z.string().default(''),
  formula: z.string().default(''),
  usageNotes: z.string().default(''),
  classNotes: z.string().default(''),
  personalExplanations: z.string().default(''),
  customExamples: z.string().default(''),
  openQuestions: z.string().default(''),
  relatedTopicIds: z.array(z.string().uuid()).optional(),
  examples: z
    .array(
      z.object({
        englishSentence: z.string().trim().min(1),
        vietnameseTranslation: z.string().default(''),
        structureHighlight: z.string().default(''),
        isCommonMistake: z.boolean().default(false),
        incorrectVersion: z.string().default(''),
        correctionNote: z.string().default(''),
      }),
    )
    .optional(),
  comparisons: z
    .array(
      z.object({
        comparedTopicTitle: z.string().trim().min(1),
        comparedTopicId: z.string().uuid().nullable().optional(),
        differenceVi: z.string().default(''),
        contextExampleA: z.string().default(''),
        contextExampleB: z.string().default(''),
        commonMistakeVi: z.string().default(''),
      }),
    )
    .optional(),
});

export const practiceQuestionInputSchema = z.object({
  grammarTopicId: z.string().uuid().nullable().optional(),
  vocabularyId: z.string().uuid().nullable().optional(),
  questionType: z.enum(GRAMMAR_QUESTION_TYPES),
  prompt: z.string().trim().min(1, 'Vui lòng nhập đề bài'),
  promptVi: z.string().default(''),
  options: z.array(z.string()).default([]),
  correctAnswer: z.string().trim().min(1, 'Vui lòng nhập đáp án đúng'),
  acceptableAnswers: z.array(z.string()).default([]),
  explanationVi: z.string().default(''),
  difficulty: z.enum(GRAMMAR_DIFFICULTIES).default('intermediate'),
});

export const mistakeInputSchema = z.object({
  category: z.enum(MISTAKE_CATEGORIES),
  vocabularyId: z.string().uuid().nullable().optional(),
  grammarTopicId: z.string().uuid().nullable().optional(),
  practiceAttemptId: z.string().uuid().nullable().optional(),
  originalInput: z.string().trim().min(1, 'Vui lòng nhập câu hoặc từ bị sai'),
  correctedVersion: z.string().trim().min(1, 'Vui lòng nhập cách sửa đúng'),
  explanationVi: z.string().default(''),
  correctedExample: z.string().default(''),
  sourceContext: z.string().default(''),
});

export const settingsUpdateSchema = z.object({
  dailyTargetMinutes: z.number().int().min(1).max(240).optional(),
  dailyVocabTarget: z.number().int().min(1).max(200).optional(),
  dailyGrammarTarget: z.number().int().min(1).max(30).optional(),
  defaultReviewDirection: z.enum(SKILL_DIRECTIONS).optional(),
  keyboardShortcutsEnabled: z.boolean().optional(),
});
