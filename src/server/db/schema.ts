import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ============================================================================
// PostgreSQL Enums
// ============================================================================

export const sessionSourceEnum = pgEnum('session_source_type', [
  'english_class',
  'ielts_course',
  'textbook',
  'online_course',
  'youtube_podcast',
  'reading',
  'self_study',
  'other',
]);

export const sessionStatusEnum = pgEnum('session_status', ['draft', 'completed']);

export const sessionVocabAddViaEnum = pgEnum('session_vocab_added_via', [
  'quick_add',
  'bulk_paste',
  'import',
  'existing',
]);

export const cefrLevelEnum = pgEnum('cefr_level', [
  'A1',
  'A2',
  'B1',
  'B2',
  'C1',
  'C2',
  'unknown',
]);

export const registerEnum = pgEnum('vocab_register', ['formal', 'neutral', 'informal']);

export const toneEnum = pgEnum('vocab_tone', ['positive', 'negative', 'neutral']);

export const vocabStatusEnum = pgEnum('vocab_status', [
  'new',
  'learning',
  'reviewing',
  'mastered',
]);

export const vocabRelationTypeEnum = pgEnum('vocab_relation_type', [
  'synonym',
  'antonym',
  'word_family',
  'common_phrase',
  'phrasal_verb',
  'related_expression',
]);

export const grammarDifficultyEnum = pgEnum('grammar_difficulty', [
  'beginner',
  'intermediate',
  'advanced',
]);

export const grammarLearningStatusEnum = pgEnum('grammar_learning_status', [
  'not_started',
  'learning',
  'practicing',
  'mastered',
]);

export const practiceQuestionTypeEnum = pgEnum('practice_question_type', [
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
]);

export const practiceSetSourceEnum = pgEnum('practice_set_source', [
  'custom',
  'grammar_topic',
  'mistake_bank',
]);

export const practiceDomainEnum = pgEnum('practice_domain', [
  'vocabulary',
  'grammar',
  'daily_review',
  'mistake_review',
]);

export const skillDirectionEnum = pgEnum('skill_direction', [
  'en_to_vi',
  'vi_to_en',
  'context',
  'spelling',
]);

export const reviewStatusEnum = pgEnum('review_status', [
  'new',
  'learning',
  'review',
  'mastered',
]);

export const mistakeCategoryEnum = pgEnum('mistake_category', [
  'tense',
  'subject_verb_agreement',
  'articles',
  'prepositions',
  'word_order',
  'pluralization',
  'verb_forms',
  'vn_direct_translation',
  'vocabulary_usage',
]);

export const mistakeStatusEnum = pgEnum('mistake_status', [
  'active',
  'reviewed',
  'resolved',
]);

// ============================================================================
// Identity & Settings
// ============================================================================

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  dailyTargetMinutes: integer('daily_target_minutes').default(15).notNull(),
  dailyVocabTarget: integer('daily_vocab_target').default(20).notNull(),
  dailyGrammarTarget: integer('daily_grammar_target').default(2).notNull(),
  uiLanguage: text('ui_language').default('vi').notNull(),
  defaultReviewDirection: skillDirectionEnum('default_review_direction')
    .default('en_to_vi')
    .notNull(),
  keyboardShortcutsEnabled: boolean('keyboard_shortcuts_enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// Learning Sessions
// ============================================================================

export const learningSessions = pgTable(
  'learning_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    learningDate: text('learning_date').notNull(), // YYYY-MM-DD
    sourceType: sessionSourceEnum('source_type').default('self_study').notNull(),
    learningType: text('learning_type').default('Tổng hợp').notNull(),
    generalNotes: text('general_notes').default('').notNull(),
    status: sessionStatusEnum('status').default('draft').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_learning_sessions_user_date').on(table.userId, table.learningDate),
    index('idx_learning_sessions_status').on(table.userId, table.status),
  ],
);

// ============================================================================
// Vocabulary Library
// ============================================================================

export const vocabulary = pgTable(
  'vocabulary',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    word: text('word').notNull(),
    normalizedWord: text('normalized_word').notNull(),
    ipa: text('ipa').default('').notNull(),
    partOfSpeech: text('part_of_speech').default('other').notNull(),
    cefrLevel: cefrLevelEnum('cefr_level').default('unknown').notNull(),
    englishDefinition: text('english_definition').default('').notNull(),
    vietnameseMeaning: text('vietnamese_meaning').default('').notNull(),
    vietnameseExplanation: text('vietnamese_explanation').default('').notNull(),
    englishExplanation: text('english_explanation').default('').notNull(),
    nuance: text('nuance').default('').notNull(),
    register: registerEnum('register').default('neutral').notNull(),
    tone: toneEnum('tone').default('neutral').notNull(),
    usageContext: text('usage_context').default('').notNull(),
    whenToUse: text('when_to_use').default('').notNull(),
    whenNotToUse: text('when_not_to_use').default('').notNull(),
    vnCommonMistakes: text('vn_common_mistakes').default('').notNull(),
    vnWrongCombinations: text('vn_wrong_combinations').default('').notNull(),
    vnConfusingWords: text('vn_confusing_words').default('').notNull(),
    vnTranslationTraps: text('vn_translation_traps').default('').notNull(),
    personalNotes: text('personal_notes').default('').notNull(),
    source: text('source').default('').notNull(),
    confidenceLevel: integer('confidence_level').default(2).notNull(),
    isFavorite: boolean('is_favorite').default(false).notNull(),
    status: vocabStatusEnum('status').default('new').notNull(),
    isIncomplete: boolean('is_incomplete').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_vocabulary_user_normalized').on(table.userId, table.normalizedWord),
    index('idx_vocabulary_status').on(table.userId, table.status),
    index('idx_vocabulary_cefr').on(table.userId, table.cefrLevel),
  ],
);

export const vocabularyExamples = pgTable('vocabulary_examples', {
  id: uuid('id').defaultRandom().primaryKey(),
  vocabularyId: uuid('vocabulary_id')
    .notNull()
    .references(() => vocabulary.id, { onDelete: 'cascade' }),
  englishSentence: text('english_sentence').notNull(),
  vietnameseTranslation: text('vietnamese_translation').default('').notNull(),
  highlightText: text('highlight_text').default('').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
});

export const vocabularyRelations = pgTable('vocabulary_relations', {
  id: uuid('id').defaultRandom().primaryKey(),
  vocabularyId: uuid('vocabulary_id')
    .notNull()
    .references(() => vocabulary.id, { onDelete: 'cascade' }),
  relatedVocabularyId: uuid('related_vocabulary_id').references(() => vocabulary.id, {
    onDelete: 'set null',
  }),
  relationType: vocabRelationTypeEnum('relation_type').notNull(),
  text: text('text').notNull(),
  note: text('note').default('').notNull(),
});

export const collocations = pgTable('collocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  vocabularyId: uuid('vocabulary_id')
    .notNull()
    .references(() => vocabulary.id, { onDelete: 'cascade' }),
  phrase: text('phrase').notNull(),
  vietnameseMeaning: text('vietnamese_meaning').default('').notNull(),
  exampleSentence: text('example_sentence').default('').notNull(),
  exampleTranslation: text('example_translation').default('').notNull(),
});

export const vocabularyCollections = pgTable(
  'vocabulary_collections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').default('').notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_collections_user_slug').on(table.userId, table.slug)],
);

export const vocabularyCollectionItems = pgTable(
  'vocabulary_collection_items',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => vocabularyCollections.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id')
      .notNull()
      .references(() => vocabulary.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.vocabularyId] })],
);

export const vocabularyTags = pgTable(
  'vocabulary_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    color: text('color').default('#0F766E').notNull(),
  },
  (table) => [uniqueIndex('uq_tags_user_slug').on(table.userId, table.slug)],
);

export const vocabularyTagItems = pgTable(
  'vocabulary_tag_items',
  {
    tagId: uuid('tag_id')
      .notNull()
      .references(() => vocabularyTags.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id')
      .notNull()
      .references(() => vocabulary.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.tagId, table.vocabularyId] })],
);

export const sessionVocabulary = pgTable(
  'session_vocabulary',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => learningSessions.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id')
      .notNull()
      .references(() => vocabulary.id, { onDelete: 'cascade' }),
    addedVia: sessionVocabAddViaEnum('added_via').default('quick_add').notNull(),
    sessionNote: text('session_note').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_session_vocab').on(table.sessionId, table.vocabularyId)],
);

export const wordComparisonGroups = pgTable('word_comparison_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  summaryVi: text('summary_vi').default('').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const wordComparisonItems = pgTable('word_comparison_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => wordComparisonGroups.id, { onDelete: 'cascade' }),
  vocabularyId: uuid('vocabulary_id').references(() => vocabulary.id, {
    onDelete: 'set null',
  }),
  label: text('label').notNull(),
  meaningVi: text('meaning_vi').default('').notNull(),
  grammarDiff: text('grammar_diff').default('').notNull(),
  usageContext: text('usage_context').default('').notNull(),
  exampleEn: text('example_en').default('').notNull(),
  exampleVi: text('example_vi').default('').notNull(),
  commonMistakeVi: text('common_mistake_vi').default('').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
});

// ============================================================================
// Grammar Knowledge Base
// ============================================================================

export const grammarCategories = pgTable(
  'grammar_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameVi: text('name_vi').notNull(),
    slug: text('slug').notNull(),
    description: text('description').default('').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
  },
  (table) => [uniqueIndex('uq_grammar_categories_user_slug').on(table.userId, table.slug)],
);

export const grammarTopics = pgTable(
  'grammar_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => grammarCategories.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    titleVi: text('title_vi').default('').notNull(),
    slug: text('slug').notNull(),
    difficulty: grammarDifficultyEnum('difficulty').default('intermediate').notNull(),
    cefrLevel: cefrLevelEnum('cefr_level').default('B1').notNull(),
    learningStatus: grammarLearningStatusEnum('learning_status')
      .default('learning')
      .notNull(),
    explanationVi: text('explanation_vi').default('').notNull(),
    explanationEn: text('explanation_en').default('').notNull(),
    whatItIs: text('what_it_is').default('').notNull(),
    whyUsed: text('why_used').default('').notNull(),
    whenUsed: text('when_used').default('').notNull(),
    howToRecognize: text('how_to_recognize').default('').notNull(),
    formula: text('formula').default('').notNull(),
    usageNotes: text('usage_notes').default('').notNull(),
    classNotes: text('class_notes').default('').notNull(),
    personalExplanations: text('personal_explanations').default('').notNull(),
    customExamples: text('custom_examples').default('').notNull(),
    openQuestions: text('open_questions').default('').notNull(),
    relatedTopicIds: jsonb('related_topic_ids').$type<string[]>().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_grammar_topics_user_slug').on(table.userId, table.slug),
    index('idx_grammar_topics_category').on(table.userId, table.categoryId),
  ],
);

export const grammarExamples = pgTable('grammar_examples', {
  id: uuid('id').defaultRandom().primaryKey(),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => grammarTopics.id, { onDelete: 'cascade' }),
  englishSentence: text('english_sentence').notNull(),
  vietnameseTranslation: text('vietnamese_translation').default('').notNull(),
  structureHighlight: text('structure_highlight').default('').notNull(),
  isCommonMistake: boolean('is_common_mistake').default(false).notNull(),
  incorrectVersion: text('incorrect_version').default('').notNull(),
  correctionNote: text('correction_note').default('').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
});

export const grammarComparisons = pgTable('grammar_comparisons', {
  id: uuid('id').defaultRandom().primaryKey(),
  topicId: uuid('topic_id')
    .notNull()
    .references(() => grammarTopics.id, { onDelete: 'cascade' }),
  comparedTopicTitle: text('compared_topic_title').notNull(),
  comparedTopicId: uuid('compared_topic_id').references(() => grammarTopics.id, {
    onDelete: 'set null',
  }),
  differenceVi: text('difference_vi').default('').notNull(),
  contextExampleA: text('context_example_a').default('').notNull(),
  contextExampleB: text('context_example_b').default('').notNull(),
  commonMistakeVi: text('common_mistake_vi').default('').notNull(),
});

export const sessionGrammar = pgTable(
  'session_grammar',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => learningSessions.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => grammarTopics.id, { onDelete: 'cascade' }),
    sessionNote: text('session_note').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('uq_session_grammar').on(table.sessionId, table.topicId)],
);

// ============================================================================
// Practice Engine & Sets
// ============================================================================

export const practiceQuestions = pgTable(
  'practice_questions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    grammarTopicId: uuid('grammar_topic_id').references(() => grammarTopics.id, {
      onDelete: 'set null',
    }),
    vocabularyId: uuid('vocabulary_id').references(() => vocabulary.id, {
      onDelete: 'set null',
    }),
    questionType: practiceQuestionTypeEnum('question_type').notNull(),
    prompt: text('prompt').notNull(),
    promptVi: text('prompt_vi').default('').notNull(),
    options: jsonb('options').$type<string[]>().default([]).notNull(),
    correctAnswer: text('correct_answer').notNull(),
    acceptableAnswers: jsonb('acceptable_answers').$type<string[]>().default([]).notNull(),
    explanationVi: text('explanation_vi').default('').notNull(),
    difficulty: grammarDifficultyEnum('difficulty').default('intermediate').notNull(),
    isCustom: boolean('is_custom').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_practice_questions_topic').on(table.userId, table.grammarTopicId),
    index('idx_practice_questions_type').on(table.userId, table.questionType),
  ],
);

export const practiceSets = pgTable('practice_sets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').default('').notNull(),
  sourceType: practiceSetSourceEnum('source_type').default('custom').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const practiceSetQuestions = pgTable(
  'practice_set_questions',
  {
    setId: uuid('set_id')
      .notNull()
      .references(() => practiceSets.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => practiceQuestions.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.setId, table.questionId] })],
);

export const practiceSessions = pgTable('practice_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  domain: practiceDomainEnum('domain').notNull(),
  mode: text('mode').notNull(),
  title: text('title').notNull(),
  totalItems: integer('total_items').default(0).notNull(),
  completedItems: integer('completed_items').default(0).notNull(),
  correctCount: integer('correct_count').default(0).notNull(),
  durationSeconds: integer('duration_seconds').default(0).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const practiceAttempts = pgTable(
  'practice_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    practiceSessionId: uuid('practice_session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id').references(() => vocabulary.id, {
      onDelete: 'set null',
    }),
    grammarTopicId: uuid('grammar_topic_id').references(() => grammarTopics.id, {
      onDelete: 'set null',
    }),
    questionId: uuid('question_id').references(() => practiceQuestions.id, {
      onDelete: 'set null',
    }),
    mode: text('mode').notNull(),
    direction: skillDirectionEnum('direction'),
    userAnswer: text('user_answer').default('').notNull(),
    expectedAnswer: text('expected_answer').default('').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    selfRating: integer('self_rating'), // 1-4 SM-2 rating
    responseTimeMs: integer('response_time_ms').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_practice_attempts_user_created').on(table.userId, table.createdAt),
    index('idx_practice_attempts_vocab').on(table.vocabularyId),
    index('idx_practice_attempts_grammar').on(table.grammarTopicId),
  ],
);

// ============================================================================
// Spaced Repetition, Personal Mistake Bank & Daily Activity
// ============================================================================

export const vocabularyReviewStates = pgTable(
  'vocabulary_review_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id')
      .notNull()
      .references(() => vocabulary.id, { onDelete: 'cascade' }),
    skillDirection: skillDirectionEnum('skill_direction').notNull(),
    status: reviewStatusEnum('status').default('new').notNull(),
    easeFactor: real('ease_factor').default(2.5).notNull(),
    intervalDays: integer('interval_days').default(0).notNull(),
    repetitions: integer('repetitions').default(0).notNull(),
    lapses: integer('lapses').default(0).notNull(),
    lastRating: integer('last_rating'),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_vocab_review_direction').on(
      table.userId,
      table.vocabularyId,
      table.skillDirection,
    ),
    index('idx_vocab_review_due').on(table.userId, table.nextReviewAt),
  ],
);

export const grammarReviewStates = pgTable(
  'grammar_review_states',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    grammarTopicId: uuid('grammar_topic_id')
      .notNull()
      .references(() => grammarTopics.id, { onDelete: 'cascade' }),
    status: reviewStatusEnum('status').default('new').notNull(),
    easeFactor: real('ease_factor').default(2.5).notNull(),
    intervalDays: integer('interval_days').default(0).notNull(),
    repetitions: integer('repetitions').default(0).notNull(),
    lapses: integer('lapses').default(0).notNull(),
    accuracyRate: real('accuracy_rate').default(0).notNull(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    nextReviewAt: timestamp('next_review_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_grammar_review_topic').on(table.userId, table.grammarTopicId),
    index('idx_grammar_review_due').on(table.userId, table.nextReviewAt),
  ],
);

export const learningMistakes = pgTable(
  'learning_mistakes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: mistakeCategoryEnum('category').notNull(),
    vocabularyId: uuid('vocabulary_id').references(() => vocabulary.id, {
      onDelete: 'set null',
    }),
    grammarTopicId: uuid('grammar_topic_id').references(() => grammarTopics.id, {
      onDelete: 'set null',
    }),
    practiceAttemptId: uuid('practice_attempt_id').references(() => practiceAttempts.id, {
      onDelete: 'set null',
    }),
    originalInput: text('original_input').notNull(),
    correctedVersion: text('corrected_version').notNull(),
    explanationVi: text('explanation_vi').default('').notNull(),
    correctedExample: text('corrected_example').default('').notNull(),
    sourceContext: text('source_context').default('').notNull(),
    status: mistakeStatusEnum('status').default('active').notNull(),
    reviewCount: integer('review_count').default(0).notNull(),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_mistakes_user_status').on(table.userId, table.status),
    index('idx_mistakes_user_category').on(table.userId, table.category),
  ],
);

export const dailyLearningActivity = pgTable(
  'daily_learning_activity',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityDate: text('activity_date').notNull(), // YYYY-MM-DD
    vocabReviewedCount: integer('vocab_reviewed_count').default(0).notNull(),
    vocabAddedCount: integer('vocab_added_count').default(0).notNull(),
    grammarReviewedCount: integer('grammar_reviewed_count').default(0).notNull(),
    exercisesCompletedCount: integer('exercises_completed_count').default(0).notNull(),
    exercisesCorrectCount: integer('exercises_correct_count').default(0).notNull(),
    mistakesReviewedCount: integer('mistakes_reviewed_count').default(0).notNull(),
    studySeconds: integer('study_seconds').default(0).notNull(),
    targetMinutesSnapshot: integer('target_minutes_snapshot').default(15).notNull(),
  },
  (table) => [uniqueIndex('uq_daily_activity_user_date').on(table.userId, table.activityDate)],
);
