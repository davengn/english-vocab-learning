import type {
  ApiErrorResponse,
  BulkSessionVocabResponseDto,
  CollectionDto,
  DailyReviewDto,
  DashboardAnalyticsDto,
  DuplicateStrategy,
  GeneratedVocabQuizItemDto,
  GrammarCategoryDto,
  GrammarDifficulty,
  GrammarLearningStatus,
  GrammarQuestionType,
  GrammarTopicDetailDto,
  GrammarTopicListItemDto,
  ImportCommitResponseDto,
  ImportParseResponseDto,
  InsightsAnalyticsDto,
  MistakeCategory,
  MistakeDto,
  MistakeStatus,
  PracticeAttemptResponseDto,
  PracticeDomain,
  PracticeHistoryItemDto,
  PracticeQuestionDto,
  PracticeSessionDto,
  PracticeSetDto,
  SessionCompletionPreviewDto,
  SessionDetailDto,
  SessionSourceType,
  SessionSummaryDto,
  SettingsDto,
  SkillDirection,
  TagDto,
  VocabPracticeMode,
  VocabularyDetailDto,
  VocabularyListItemDto,
  WordComparisonGroupDto,
} from '../../shared/apiTypes';

export class ApiError extends Error {
  status: number;
  existingId?: string;
  details?: unknown;

  constructor(message: string, status: number, existingId?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.existingId = existingId;
    this.details = details;
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    let payload: ApiErrorResponse | null = null;
    try {
      payload = (await res.json()) as ApiErrorResponse;
    } catch {
      // ignore non-JSON body
    }
    throw new ApiError(
      payload?.error || `Lỗi máy chủ (${res.status})`,
      res.status,
      payload?.existingId,
      payload?.details,
    );
  }

  return (await res.json()) as T;
}

export const api = {
  // Settings
  getSettings: () => request<SettingsDto>('/settings'),
  updateSettings: (body: {
    dailyTargetMinutes?: number;
    dailyVocabTarget?: number;
    dailyGrammarTarget?: number;
    defaultReviewDirection?: SkillDirection;
    keyboardShortcutsEnabled?: boolean;
  }) =>
    request<SettingsDto>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // Sessions
  listSessions: (params?: { search?: string; status?: string; sourceType?: string }) =>
    request<SessionSummaryDto[]>(`/sessions${buildQuery(params ?? {})}`),
  createSession: (body: {
    title: string;
    learningDate: string;
    sourceType: SessionSourceType;
    learningType?: string;
    generalNotes?: string;
  }) =>
    request<SessionDetailDto>('/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getSession: (id: string) => request<SessionDetailDto>(`/sessions/${id}`),
  updateSession: (
    id: string,
    body: Partial<{
      title: string;
      learningDate: string;
      sourceType: SessionSourceType;
      learningType: string;
      generalNotes: string;
    }>,
  ) =>
    request<SessionDetailDto>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSession: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/sessions/${id}`, { method: 'DELETE' }),
  addSessionVocab: (
    sessionId: string,
    body: {
      vocabularyId?: string;
      word?: string;
      vietnameseMeaning?: string;
      ipa?: string;
      partOfSpeech?: string;
      cefrLevel?: string;
      englishDefinition?: string;
      exampleSentence?: string;
      exampleTranslation?: string;
      sessionNote?: string;
    },
  ) =>
    request<{
      item: SessionDetailDto['vocabulary'][number];
      isExisting: boolean;
      vocabularyId: string;
      session: SessionDetailDto;
    }>(`/sessions/${sessionId}/vocabulary`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  bulkAddSessionVocab: (
    sessionId: string,
    body: {
      rows: Array<{
        word: string;
        vietnameseMeaning?: string;
        ipa?: string;
        exampleSentence?: string;
        exampleTranslation?: string;
      }>;
      addedVia?: 'bulk_paste' | 'import';
      duplicateStrategy?: DuplicateStrategy;
    },
  ) =>
    request<BulkSessionVocabResponseDto>(`/sessions/${sessionId}/vocabulary/bulk`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeSessionVocab: (sessionId: string, vocabId: string) =>
    request<{ deleted: boolean; vocabularyId: string }>(
      `/sessions/${sessionId}/vocabulary/${vocabId}`,
      { method: 'DELETE' },
    ),
  addSessionGrammar: (
    sessionId: string,
    body:
      | { existingTopicId: string; sessionNote?: string }
      | {
          newTopic: {
            categoryId: string;
            title: string;
            titleVi?: string;
            difficulty?: GrammarDifficulty;
            cefrLevel?: string;
            formula?: string;
            explanationVi?: string;
            examples?: Array<{
              englishSentence: string;
              vietnameseTranslation?: string;
              isCommonMistake?: boolean;
              incorrectVersion?: string;
              correctionNote?: string;
            }>;
          };
          sessionNote?: string;
        },
  ) =>
    request<{
      item: SessionDetailDto['grammarTopics'][number] | null;
      topicId: string;
      session: SessionDetailDto;
    }>(`/sessions/${sessionId}/grammar`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeSessionGrammar: (sessionId: string, topicId: string) =>
    request<{ deleted: boolean; topicId: string }>(
      `/sessions/${sessionId}/grammar/${topicId}`,
      { method: 'DELETE' },
    ),
  getSessionCompletionPreview: (sessionId: string) =>
    request<SessionCompletionPreviewDto>(`/sessions/${sessionId}/completion-preview`),
  completeSession: (sessionId: string) =>
    request<SessionDetailDto>(`/sessions/${sessionId}/complete`, { method: 'POST' }),

  // Vocabulary
  listVocabulary: (params?: {
    search?: string;
    collectionId?: string;
    tagId?: string;
    cefrLevel?: string;
    partOfSpeech?: string;
    status?: string;
    favorite?: boolean;
    incomplete?: boolean;
    confidenceMax?: number;
    sessionId?: string;
    sort?: 'newest' | 'alpha' | 'confidence' | 'due';
  }) => request<VocabularyListItemDto[]>(`/vocabulary${buildQuery(params ?? {})}`),
  getVocabulary: (id: string) => request<VocabularyDetailDto>(`/vocabulary/${id}`),
  createVocabulary: (body: Record<string, unknown>) =>
    request<VocabularyDetailDto>('/vocabulary', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateVocabulary: (id: string, body: Record<string, unknown>) =>
    request<VocabularyDetailDto>(`/vocabulary/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteVocabulary: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/vocabulary/${id}`, { method: 'DELETE' }),
  parseVocabImport: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<ImportParseResponseDto>('/vocabulary/import/parse', {
      method: 'POST',
      body: fd,
    });
  },
  commitVocabImport: (body: {
    rows: Array<{
      word: string;
      vietnameseMeaning?: string;
      ipa?: string;
      partOfSpeech?: string;
      cefrLevel?: string;
      englishDefinition?: string;
      exampleSentence?: string;
      exampleTranslation?: string;
      personalNotes?: string;
      tags?: string[];
    }>;
    collectionId?: string;
    sessionId?: string;
    duplicateStrategy: DuplicateStrategy;
  }) =>
    request<ImportCommitResponseDto>('/vocabulary/import/commit', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Collections & Tags & Comparisons
  listCollections: () => request<CollectionDto[]>('/collections'),
  createCollection: (body: { name: string; description?: string }) =>
    request<CollectionDto>('/collections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteCollection: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/collections/${id}`, { method: 'DELETE' }),
  listTags: () => request<TagDto[]>('/tags'),
  createTag: (body: { name: string; color?: string }) =>
    request<TagDto>('/tags', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteTag: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/tags/${id}`, { method: 'DELETE' }),
  listComparisons: () => request<WordComparisonGroupDto[]>('/comparisons'),
  createComparison: (body: {
    title: string;
    summaryVi?: string;
    items: Array<{
      vocabularyId?: string | null;
      label: string;
      meaningVi?: string;
      grammarDiff?: string;
      usageContext?: string;
      exampleEn?: string;
      exampleVi?: string;
      commonMistakeVi?: string;
    }>;
  }) =>
    request<WordComparisonGroupDto>('/comparisons', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateComparison: (
    id: string,
    body: {
      title?: string;
      summaryVi?: string;
      items?: Array<{
        vocabularyId?: string | null;
        label: string;
        meaningVi?: string;
        grammarDiff?: string;
        usageContext?: string;
        exampleEn?: string;
        exampleVi?: string;
        commonMistakeVi?: string;
      }>;
    },
  ) =>
    request<WordComparisonGroupDto>(`/comparisons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteComparison: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/comparisons/${id}`, { method: 'DELETE' }),

  // Grammar
  listGrammarCategories: () => request<GrammarCategoryDto[]>('/grammar/categories'),
  createGrammarCategory: (body: { name: string; nameVi: string; description?: string }) =>
    request<GrammarCategoryDto>('/grammar/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteGrammarCategory: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/grammar/categories/${id}`, { method: 'DELETE' }),
  listGrammarTopics: (params?: {
    categoryId?: string;
    difficulty?: string;
    cefrLevel?: string;
    learningStatus?: string;
    search?: string;
  }) => request<GrammarTopicListItemDto[]>(`/grammar/topics${buildQuery(params ?? {})}`),
  getGrammarTopic: (id: string) => request<GrammarTopicDetailDto>(`/grammar/topics/${id}`),
  createGrammarTopic: (body: Record<string, unknown>) =>
    request<GrammarTopicDetailDto>('/grammar/topics', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateGrammarTopic: (id: string, body: Record<string, unknown>) =>
    request<GrammarTopicDetailDto>(`/grammar/topics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteGrammarTopic: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/grammar/topics/${id}`, { method: 'DELETE' }),

  // Practice
  listPracticeQuestions: (params?: {
    grammarTopicId?: string;
    questionType?: string;
    search?: string;
  }) => request<PracticeQuestionDto[]>(`/practice/questions${buildQuery(params ?? {})}`),
  createPracticeQuestion: (body: {
    grammarTopicId?: string | null;
    vocabularyId?: string | null;
    questionType: GrammarQuestionType;
    prompt: string;
    promptVi?: string;
    options?: string[];
    correctAnswer: string;
    acceptableAnswers?: string[];
    explanationVi?: string;
    difficulty?: GrammarDifficulty;
  }) =>
    request<PracticeQuestionDto>('/practice/questions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePracticeQuestion: (id: string, body: Record<string, unknown>) =>
    request<PracticeQuestionDto>(`/practice/questions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deletePracticeQuestion: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/practice/questions/${id}`, { method: 'DELETE' }),
  listPracticeSets: () => request<PracticeSetDto[]>('/practice/sets'),
  getPracticeSet: (id: string) => request<PracticeSetDto>(`/practice/sets/${id}`),
  createPracticeSet: (body: {
    title: string;
    description?: string;
    sourceType?: 'custom' | 'grammar_topic' | 'mistake_bank';
    questionIds: string[];
  }) =>
    request<PracticeSetDto>('/practice/sets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deletePracticeSet: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/practice/sets/${id}`, { method: 'DELETE' }),
  generateVocabQuiz: (body: {
    mode: VocabPracticeMode;
    source?: 'due' | 'all' | 'collection' | 'session' | 'weak';
    collectionId?: string;
    sessionId?: string;
    vocabularyIds?: string[];
    limit?: number;
  }) =>
    request<GeneratedVocabQuizItemDto[]>('/practice/vocabulary/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createPracticeSession: (body: {
    domain: PracticeDomain;
    mode: string;
    title: string;
    totalItems: number;
  }) =>
    request<PracticeSessionDto>('/practice/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recordPracticeAttempt: (
    sessionId: string,
    body: {
      vocabularyId?: string | null;
      grammarTopicId?: string | null;
      questionId?: string | null;
      mode: string;
      direction?: SkillDirection;
      userAnswer: string;
      expectedAnswer: string;
      isCorrect: boolean;
      selfRating?: 1 | 2 | 3 | 4;
      responseTimeMs?: number;
      saveMistake?: {
        category: MistakeCategory;
        explanationVi?: string;
        correctedExample?: string;
        sourceContext?: string;
      };
    },
  ) =>
    request<PracticeAttemptResponseDto>(`/practice/sessions/${sessionId}/attempts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  completePracticeSession: (
    sessionId: string,
    body: { durationSeconds: number; completedItems?: number; correctCount?: number },
  ) =>
    request<PracticeSessionDto>(`/practice/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listPracticeHistory: (limit = 20) =>
    request<PracticeHistoryItemDto[]>(`/practice/history?limit=${limit}`),

  // Daily Review & Mistakes
  getDailyReview: () => request<DailyReviewDto>('/daily-review'),
  listMistakes: (params?: { category?: string; status?: string; search?: string }) =>
    request<MistakeDto[]>(`/mistakes${buildQuery(params ?? {})}`),
  createMistake: (body: {
    category: MistakeCategory;
    vocabularyId?: string | null;
    grammarTopicId?: string | null;
    practiceAttemptId?: string | null;
    originalInput: string;
    correctedVersion: string;
    explanationVi?: string;
    correctedExample?: string;
    sourceContext?: string;
  }) =>
    request<MistakeDto>('/mistakes', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMistake: (
    id: string,
    body: Partial<{
      category: MistakeCategory;
      vocabularyId: string | null;
      grammarTopicId: string | null;
      originalInput: string;
      correctedVersion: string;
      explanationVi: string;
      correctedExample: string;
      sourceContext: string;
      status: MistakeStatus;
      markReviewed: boolean;
    }>,
  ) =>
    request<MistakeDto>(`/mistakes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteMistake: (id: string) =>
    request<{ deleted: boolean; id: string }>(`/mistakes/${id}`, { method: 'DELETE' }),
  createMistakePracticeSet: (body?: {
    title?: string;
    mistakeIds?: string[];
    category?: MistakeCategory;
  }) =>
    request<PracticeSetDto>('/mistakes/create-practice-set', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  // Analytics
  getDashboardAnalytics: () => request<DashboardAnalyticsDto>('/analytics/dashboard'),
  getInsightsAnalytics: () => request<InsightsAnalyticsDto>('/analytics/insights'),
};

export type { GrammarLearningStatus };
