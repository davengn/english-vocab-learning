import type {
  CEFR_LEVELS,
  GRAMMAR_DIFFICULTIES,
  GRAMMAR_QUESTION_TYPES,
  MISTAKE_CATEGORIES,
  SESSION_SOURCES,
  SKILL_DIRECTIONS,
  VOCAB_PRACTICE_MODES,
} from './schemas.js';
import type { ReviewStatus, VocabMasteryStatus } from './srs.js';

export type SessionSourceType = (typeof SESSION_SOURCES)[number];
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type VocabRegister = 'formal' | 'neutral' | 'informal';
export type VocabTone = 'positive' | 'negative' | 'neutral';
export type VocabRelationType =
  | 'synonym'
  | 'antonym'
  | 'word_family'
  | 'common_phrase'
  | 'phrasal_verb'
  | 'related_expression';
export type SkillDirection = (typeof SKILL_DIRECTIONS)[number];
export type VocabPracticeMode = (typeof VOCAB_PRACTICE_MODES)[number];
export type GrammarDifficulty = (typeof GRAMMAR_DIFFICULTIES)[number];
export type GrammarLearningStatus = 'not_started' | 'learning' | 'practicing' | 'mastered';
export type GrammarQuestionType = (typeof GRAMMAR_QUESTION_TYPES)[number];
export type PracticeSetSourceType = 'custom' | 'grammar_topic' | 'mistake_bank';
export type PracticeDomain = 'vocabulary' | 'grammar' | 'daily_review' | 'mistake_review';
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];
export type MistakeStatus = 'active' | 'reviewed' | 'resolved';
export type SessionVocabAddedVia = 'quick_add' | 'bulk_paste' | 'import' | 'existing';
export type DuplicateStrategy = 'link_existing' | 'merge' | 'skip';

export interface ApiErrorResponse {
  error: string;
  details?: unknown;
  existingId?: string;
}

// ============================================================================
// Authentication
// ============================================================================

export interface AuthUserDto {
  username: string;
  name: string;
}

export interface AuthStatusDto {
  authenticated: boolean;
  user: AuthUserDto | null;
}

// ============================================================================
// Settings
// ============================================================================

export interface SettingsDto {
  id: string;
  userId: string;
  dailyTargetMinutes: number;
  dailyVocabTarget: number;
  dailyGrammarTarget: number;
  uiLanguage: string;
  defaultReviewDirection: SkillDirection;
  keyboardShortcutsEnabled: boolean;
  updatedAt: string;
}

// ============================================================================
// Review States & Sub-Entities
// ============================================================================

export interface ReviewStateDto {
  id: string;
  vocabularyId: string;
  skillDirection: SkillDirection;
  status: ReviewStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  lastRating: number | null;
  lastReviewedAt: string | null;
  nextReviewAt: string;
}

export interface GrammarReviewStateDto {
  id: string;
  grammarTopicId: string;
  status: ReviewStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  accuracyRate: number;
  lastReviewedAt: string | null;
  nextReviewAt: string;
}

export interface VocabularyExampleDto {
  id: string;
  vocabularyId: string;
  englishSentence: string;
  vietnameseTranslation: string;
  highlightText: string;
  sortOrder: number;
}

export interface CollocationDto {
  id: string;
  vocabularyId: string;
  phrase: string;
  vietnameseMeaning: string;
  exampleSentence: string;
  exampleTranslation: string;
}

export interface VocabularyRelationDto {
  id: string;
  vocabularyId: string;
  relatedVocabularyId: string | null;
  relationType: VocabRelationType;
  text: string;
  note: string;
}

export interface CollectionDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  wordCount: number;
}

export interface TagDto {
  id: string;
  name: string;
  slug: string;
  color: string;
  wordCount: number;
}

// ============================================================================
// Vocabulary
// ============================================================================

export interface VocabularyListItemDto {
  id: string;
  word: string;
  normalizedWord: string;
  ipa: string;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  englishDefinition: string;
  vietnameseMeaning: string;
  register: VocabRegister;
  tone: VocabTone;
  source: string;
  confidenceLevel: number;
  isFavorite: boolean;
  status: VocabMasteryStatus;
  isIncomplete: boolean;
  createdAt: string;
  updatedAt: string;
  collections: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string; slug: string; color: string }>;
  exampleCount: number;
  collocationCount: number;
  enToViState: ReviewStateDto | null;
  viToEnState: ReviewStateDto | null;
}

export interface LinkedSessionRefDto {
  sessionId: string;
  title: string;
  learningDate: string;
  sourceType: SessionSourceType;
  status: 'draft' | 'completed';
  sessionNote: string;
  addedVia?: SessionVocabAddedVia;
}

export interface WordComparisonItemDto {
  id: string;
  groupId: string;
  vocabularyId: string | null;
  label: string;
  meaningVi: string;
  grammarDiff: string;
  usageContext: string;
  exampleEn: string;
  exampleVi: string;
  commonMistakeVi: string;
  sortOrder: number;
}

export interface WordComparisonGroupDto {
  id: string;
  title: string;
  summaryVi: string;
  createdAt: string;
  updatedAt: string;
  items: WordComparisonItemDto[];
}

export interface VocabularyDetailDto extends VocabularyListItemDto {
  vietnameseExplanation: string;
  englishExplanation: string;
  nuance: string;
  usageContext: string;
  whenToUse: string;
  whenNotToUse: string;
  vnCommonMistakes: string;
  vnWrongCombinations: string;
  vnConfusingWords: string;
  vnTranslationTraps: string;
  personalNotes: string;
  examples: VocabularyExampleDto[];
  collocations: CollocationDto[];
  relations: VocabularyRelationDto[];
  linkedSessions: LinkedSessionRefDto[];
  reviewStates: ReviewStateDto[];
  comparisonGroups: WordComparisonGroupDto[];
}

// ============================================================================
// Import / Export
// ============================================================================

export interface ImportColumnMapping {
  word: string | null;
  vietnameseMeaning: string | null;
  ipa: string | null;
  partOfSpeech: string | null;
  cefrLevel: string | null;
  englishDefinition: string | null;
  exampleSentence: string | null;
  exampleTranslation: string | null;
  tags: string | null;
  notes: string | null;
}

export interface ImportParsedRowDto {
  rowIndex: number;
  word: string;
  normalizedWord: string;
  vietnameseMeaning: string;
  ipa: string;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  englishDefinition: string;
  exampleSentence: string;
  exampleTranslation: string;
  tags: string[];
  personalNotes: string;
  duplicateInDb: boolean;
  duplicateInFile: boolean;
  existingVocabId: string | null;
}

export interface ImportParseResponseDto {
  fileName: string;
  totalRows: number;
  truncated: boolean;
  headers: string[];
  rawRows: string[][];
  columnMapping: ImportColumnMapping;
  existingWords: Record<string, string>;
  previewRows: ImportParsedRowDto[];
}

export interface ImportCommitResponseDto {
  addedCount: number;
  mergedCount: number;
  linkedExistingCount: number;
  skippedCount: number;
  vocabularyIds: string[];
}

// ============================================================================
// Learning Sessions
// ============================================================================

export interface SessionSummaryDto {
  id: string;
  title: string;
  learningDate: string;
  sourceType: SessionSourceType;
  learningType: string;
  generalNotes: string;
  status: 'draft' | 'completed';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  vocabCount: number;
  grammarCount: number;
}

export interface SessionVocabularyItemDto {
  sessionLinkId: string;
  vocabularyId: string;
  word: string;
  normalizedWord: string;
  ipa: string;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  vietnameseMeaning: string;
  englishDefinition: string;
  status: VocabMasteryStatus;
  confidenceLevel: number;
  isIncomplete: boolean;
  addedVia: SessionVocabAddedVia;
  sessionNote: string;
  createdAt: string;
  examples: VocabularyExampleDto[];
  reviewStates: ReviewStateDto[];
}

export interface SessionGrammarItemDto {
  sessionLinkId: string;
  topicId: string;
  title: string;
  titleVi: string;
  categoryId: string;
  categoryName: string;
  categoryNameVi: string;
  difficulty: GrammarDifficulty;
  cefrLevel: CefrLevel;
  learningStatus: GrammarLearningStatus;
  formula: string;
  explanationVi: string;
  sessionNote: string;
}

export interface SessionDetailDto extends SessionSummaryDto {
  vocabulary: SessionVocabularyItemDto[];
  grammarTopics: SessionGrammarItemDto[];
}

export interface SessionCompletionPreviewDto {
  vocabCount: number;
  grammarCount: number;
  duplicateWarnings: Array<{
    word: string;
    existingVocabId: string;
    sessionCount: number;
  }>;
  incompleteEntries: Array<{
    id: string;
    word: string;
    missingFields: string[];
  }>;
}

export interface BulkSessionVocabResponseDto {
  addedCount: number;
  linkedExistingCount: number;
  skippedCount: number;
  items: SessionVocabularyItemDto[];
}

// ============================================================================
// Grammar Knowledge Base
// ============================================================================

export interface GrammarCategoryDto {
  id: string;
  name: string;
  nameVi: string;
  slug: string;
  description: string;
  sortOrder: number;
  isSystem: boolean;
  topicCount: number;
}

export interface GrammarExampleDto {
  id: string;
  topicId: string;
  englishSentence: string;
  vietnameseTranslation: string;
  structureHighlight: string;
  isCommonMistake: boolean;
  incorrectVersion: string;
  correctionNote: string;
  sortOrder: number;
}

export interface GrammarComparisonDto {
  id: string;
  topicId: string;
  comparedTopicTitle: string;
  comparedTopicId: string | null;
  differenceVi: string;
  contextExampleA: string;
  contextExampleB: string;
  commonMistakeVi: string;
}

export interface GrammarTopicListItemDto {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryNameVi: string;
  title: string;
  titleVi: string;
  slug: string;
  difficulty: GrammarDifficulty;
  cefrLevel: CefrLevel;
  learningStatus: GrammarLearningStatus;
  formula: string;
  explanationVi: string;
  createdAt: string;
  updatedAt: string;
  exampleCount: number;
  questionCount: number;
  reviewState: GrammarReviewStateDto | null;
}

export interface GrammarTopicDetailDto extends GrammarTopicListItemDto {
  explanationEn: string;
  whatItIs: string;
  whyUsed: string;
  whenUsed: string;
  howToRecognize: string;
  usageNotes: string;
  classNotes: string;
  personalExplanations: string;
  customExamples: string;
  openQuestions: string;
  relatedTopicIds: string[];
  examples: GrammarExampleDto[];
  comparisons: GrammarComparisonDto[];
  linkedSessions: LinkedSessionRefDto[];
  linkedQuestions: PracticeQuestionDto[];
}

// ============================================================================
// Practice Engine
// ============================================================================

export interface PracticeQuestionDto {
  id: string;
  grammarTopicId: string | null;
  grammarTopicTitle: string | null;
  vocabularyId: string | null;
  questionType: GrammarQuestionType;
  prompt: string;
  promptVi: string;
  options: string[];
  correctAnswer: string;
  acceptableAnswers: string[];
  explanationVi: string;
  difficulty: GrammarDifficulty;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeSetDto {
  id: string;
  title: string;
  description: string;
  sourceType: PracticeSetSourceType;
  createdAt: string;
  questionCount: number;
  questionIds: string[];
  questions?: PracticeQuestionDto[];
}

export interface GeneratedVocabQuizItemDto {
  vocabularyId: string;
  word: string;
  ipa: string;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  vietnameseMeaning: string;
  englishDefinition: string;
  mode: VocabPracticeMode;
  direction: SkillDirection;
  prompt: string;
  promptSubtext: string;
  hint: string;
  options: string[];
  correctAnswer: string;
  acceptableAnswers: string[];
  exampleSentence: string;
  exampleTranslation: string;
  collocationPhrase: string;
  collocationMeaning: string;
  explanationVi: string;
}

export interface PracticeSessionDto {
  id: string;
  domain: PracticeDomain;
  mode: string;
  title: string;
  totalItems: number;
  completedItems: number;
  correctCount: number;
  durationSeconds: number;
  startedAt: string;
  completedAt: string | null;
}

export interface PracticeHistoryItemDto extends PracticeSessionDto {
  accuracyPercent: number;
}

export interface PracticeAttemptDto {
  id: string;
  practiceSessionId: string;
  vocabularyId: string | null;
  grammarTopicId: string | null;
  questionId: string | null;
  mode: string;
  direction: SkillDirection | null;
  userAnswer: string;
  expectedAnswer: string;
  isCorrect: boolean;
  selfRating: number | null;
  responseTimeMs: number;
  createdAt: string;
}

export interface PracticeAttemptResponseDto {
  attempt: PracticeAttemptDto;
  updatedVocabReviewState: ReviewStateDto | null;
  updatedGrammarReviewState: GrammarReviewStateDto | null;
  savedMistake: MistakeDto | null;
}

// ============================================================================
// Mistakes & Daily Review
// ============================================================================

export interface MistakeDto {
  id: string;
  category: MistakeCategory;
  categoryLabel: string;
  vocabularyId: string | null;
  vocabularyWord: string | null;
  grammarTopicId: string | null;
  grammarTopicTitle: string | null;
  practiceAttemptId: string | null;
  originalInput: string;
  correctedVersion: string;
  explanationVi: string;
  correctedExample: string;
  sourceContext: string;
  status: MistakeStatus;
  reviewCount: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyReviewVocabItemDto {
  reviewStateId: string;
  vocabularyId: string;
  word: string;
  ipa: string;
  partOfSpeech: string;
  cefrLevel: CefrLevel;
  vietnameseMeaning: string;
  englishDefinition: string;
  confidenceLevel: number;
  vnConfusingWords: string;
  vnCommonMistakes: string;
  skillDirection: SkillDirection;
  status: ReviewStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  nextReviewAt: string;
  priorityScore: number;
  examples: VocabularyExampleDto[];
}

export interface DailyReviewGrammarItemDto {
  reviewStateId: string;
  topicId: string;
  title: string;
  titleVi: string;
  categoryName: string;
  categoryNameVi: string;
  formula: string;
  explanationVi: string;
  status: ReviewStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  accuracyRate: number;
  nextReviewAt: string;
}

export interface DailyReviewDto {
  targetMinutes: number;
  dailyVocabTarget: number;
  dailyGrammarTarget: number;
  totalDueVocabCount: number;
  recommendedVocabCount: number;
  isOverloaded: boolean;
  dueVocabulary: DailyReviewVocabItemDto[];
  difficultVocabulary: DailyReviewVocabItemDto[];
  dueGrammar: DailyReviewGrammarItemDto[];
  recommendedGrammarExercises: PracticeQuestionDto[];
  activeMistakes: MistakeDto[];
}

// ============================================================================
// Analytics
// ============================================================================

export interface DailyActivityDto {
  activityDate: string;
  vocabReviewedCount: number;
  vocabAddedCount: number;
  grammarReviewedCount: number;
  exercisesCompletedCount: number;
  exercisesCorrectCount: number;
  mistakesReviewedCount: number;
  studySeconds: number;
  targetMinutesSnapshot: number;
}

export interface WeakGrammarCategoryDto {
  categoryId: string;
  name: string;
  nameVi: string;
  topicCount: number;
  avgAccuracy: number;
  totalLapses: number;
  dueCount: number;
}

export interface WeakWordDto {
  vocabularyId: string;
  word: string;
  vietnameseMeaning: string;
  cefrLevel: CefrLevel;
  confidenceLevel: number;
  lapses: number;
  minEaseFactor: number;
  status: VocabMasteryStatus;
}

export interface DashboardAnalyticsDto {
  todayActivity: DailyActivityDto;
  settings: SettingsDto;
  streak: {
    currentStreak: number;
    longestStreak: number;
    totalActiveDays: number;
  };
  counts: {
    totalVocabulary: number;
    masteredVocabulary: number;
    totalGrammarTopics: number;
    learnedGrammarTopics: number;
    dueVocabCount: number;
    dueGrammarCount: number;
    activeMistakesCount: number;
  };
  accuracy: {
    overall: number;
    recognitionEnToVi: number;
    activeRecallViToEn: number;
  };
  weakGrammarCategories: WeakGrammarCategoryDto[];
  weakWords: WeakWordDto[];
  recentSessions: SessionSummaryDto[];
  recentMistakes: MistakeDto[];
}

export interface InsightsAnalyticsDto {
  dailySeries: DailyActivityDto[];
  vocabStatusDistribution: Array<{
    status: VocabMasteryStatus;
    label: string;
    count: number;
  }>;
  mistakeCategoryDistribution: Array<{
    category: MistakeCategory;
    label: string;
    count: number;
  }>;
  frequentlyForgottenWords: WeakWordDto[];
  weakGrammarCategories: WeakGrammarCategoryDto[];
  directionBreakdown: Array<{
    direction: SkillDirection;
    label: string;
    totalAttempts: number;
    correctAttempts: number;
    accuracy: number;
  }>;
}
