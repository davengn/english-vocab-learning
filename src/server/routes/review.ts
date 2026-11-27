import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, lt, lte, or } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import {
  grammarCategories,
  grammarReviewStates,
  grammarTopics,
  learningMistakes,
  practiceQuestions,
  vocabulary,
  vocabularyCollectionItems,
  vocabularyCollections,
  vocabularyExamples,
  vocabularyReviewStates,
} from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import { getOrCreateSettings } from './settings.js';
import { MISTAKE_CATEGORY_LABELS } from '../../shared/schemas.js';
import { buildDailyTargetCap, scoreReviewPriority } from '../../shared/srs.js';
import type {
  DailyReviewDto,
  DailyReviewGrammarItemDto,
  DailyReviewVocabItemDto,
  MistakeDto,
  PracticeQuestionDto,
  VocabularyExampleDto,
} from '../../shared/apiTypes.js';

export function createReviewRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get('/daily-review', async (c) => {
    const userId = await getDefaultUserId(db);
    const settings = await getOrCreateSettings(db, userId);

    const minutesParam = Number(c.req.query('minutes'));
    const targetMinutes =
      Number.isFinite(minutesParam) && minutesParam >= 5 && minutesParam <= 240
        ? Math.round(minutesParam)
        : settings.dailyTargetMinutes;

    const now = new Date();

    // Determine which words belong to the Confusing Words collection
    const confusingLinks = await db
      .select({ vocabularyId: vocabularyCollectionItems.vocabularyId })
      .from(vocabularyCollectionItems)
      .innerJoin(
        vocabularyCollections,
        eq(vocabularyCollectionItems.collectionId, vocabularyCollections.id),
      )
      .where(
        and(
          eq(vocabularyCollections.userId, userId),
          eq(vocabularyCollections.slug, 'confusing-words'),
        ),
      );
    const confusingSet = new Set(confusingLinks.map((l) => l.vocabularyId));

    // 1. Due vocabulary states
    const dueRows = await db
      .select({
        state: vocabularyReviewStates,
        vocab: vocabulary,
      })
      .from(vocabularyReviewStates)
      .innerJoin(vocabulary, eq(vocabularyReviewStates.vocabularyId, vocabulary.id))
      .where(
        and(
          eq(vocabularyReviewStates.userId, userId),
          lte(vocabularyReviewStates.nextReviewAt, now),
        ),
      );

    // 2. Difficult vocabulary states
    const difficultRows = await db
      .select({
        state: vocabularyReviewStates,
        vocab: vocabulary,
      })
      .from(vocabularyReviewStates)
      .innerJoin(vocabulary, eq(vocabularyReviewStates.vocabularyId, vocabulary.id))
      .where(
        and(
          eq(vocabularyReviewStates.userId, userId),
          or(
            sqlOrLapsesOrEase(vocabularyReviewStates, vocabulary),
          ),
        ),
      );

    const allNeededVocabIds = Array.from(
      new Set([
        ...dueRows.map((r) => r.vocab.id),
        ...difficultRows.map((r) => r.vocab.id),
      ]),
    );

    const exByVocab = new Map<string, VocabularyExampleDto[]>();
    if (allNeededVocabIds.length > 0) {
      const exRows = await db
        .select()
        .from(vocabularyExamples)
        .where(inArray(vocabularyExamples.vocabularyId, allNeededVocabIds))
        .orderBy(asc(vocabularyExamples.sortOrder));
      for (const ex of exRows) {
        const list = exByVocab.get(ex.vocabularyId) ?? [];
        list.push({
          id: ex.id,
          vocabularyId: ex.vocabularyId,
          englishSentence: ex.englishSentence,
          vietnameseTranslation: ex.vietnameseTranslation,
          highlightText: ex.highlightText,
          sortOrder: ex.sortOrder,
        });
        exByVocab.set(ex.vocabularyId, list);
      }
    }

    const toReviewVocabItem = (row: {
      state: typeof vocabularyReviewStates.$inferSelect;
      vocab: typeof vocabulary.$inferSelect;
    }): DailyReviewVocabItemDto => {
      const isConfusing =
        confusingSet.has(row.vocab.id) || Boolean(row.vocab.vnConfusingWords.trim());
      const priorityScore = scoreReviewPriority({
        nextReviewAt: row.state.nextReviewAt,
        lapses: row.state.lapses,
        confidenceLevel: row.vocab.confidenceLevel,
        easeFactor: row.state.easeFactor,
        isConfusing,
        now,
      });

      return {
        reviewStateId: row.state.id,
        vocabularyId: row.vocab.id,
        word: row.vocab.word,
        ipa: row.vocab.ipa,
        partOfSpeech: row.vocab.partOfSpeech,
        cefrLevel: row.vocab.cefrLevel,
        vietnameseMeaning: row.vocab.vietnameseMeaning,
        englishDefinition: row.vocab.englishDefinition,
        confidenceLevel: row.vocab.confidenceLevel,
        vnConfusingWords: row.vocab.vnConfusingWords,
        vnCommonMistakes: row.vocab.vnCommonMistakes,
        skillDirection: row.state.skillDirection,
        status: row.state.status,
        easeFactor: row.state.easeFactor,
        intervalDays: row.state.intervalDays,
        repetitions: row.state.repetitions,
        lapses: row.state.lapses,
        nextReviewAt: row.state.nextReviewAt.toISOString(),
        priorityScore,
        examples: exByVocab.get(row.vocab.id) ?? [],
      };
    };

    const sortedDue = dueRows
      .map(toReviewVocabItem)
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const { recommendedCount, isOverloaded } = buildDailyTargetCap(
      sortedDue.length,
      targetMinutes,
    );
    const dueVocabulary = sortedDue.slice(0, recommendedCount);

    // Deduplicate difficult vocabulary by vocabularyId keeping highest priority direction
    const difficultByWord = new Map<string, DailyReviewVocabItemDto>();
    for (const item of difficultRows.map(toReviewVocabItem)) {
      const prev = difficultByWord.get(item.vocabularyId);
      if (!prev || item.priorityScore > prev.priorityScore) {
        difficultByWord.set(item.vocabularyId, item);
      }
    }
    const difficultVocabulary = Array.from(difficultByWord.values())
      .sort((a, b) => b.lapses - a.lapses || a.easeFactor - b.easeFactor || a.confidenceLevel - b.confidenceLevel)
      .slice(0, 15);

    // 3. Due grammar topics
    const dueGrammarRows = await db
      .select({
        state: grammarReviewStates,
        topic: grammarTopics,
        categoryName: grammarCategories.name,
        categoryNameVi: grammarCategories.nameVi,
      })
      .from(grammarReviewStates)
      .innerJoin(grammarTopics, eq(grammarReviewStates.grammarTopicId, grammarTopics.id))
      .innerJoin(grammarCategories, eq(grammarTopics.categoryId, grammarCategories.id))
      .where(
        and(
          eq(grammarReviewStates.userId, userId),
          lte(grammarReviewStates.nextReviewAt, now),
        ),
      )
      .orderBy(asc(grammarReviewStates.nextReviewAt));

    const dueGrammar: DailyReviewGrammarItemDto[] = dueGrammarRows
      .slice(0, Math.max(settings.dailyGrammarTarget * 2, 4))
      .map(({ state, topic, categoryName, categoryNameVi }) => ({
        reviewStateId: state.id,
        topicId: topic.id,
        title: topic.title,
        titleVi: topic.titleVi,
        categoryName,
        categoryNameVi,
        formula: topic.formula,
        explanationVi: topic.explanationVi,
        status: state.status,
        easeFactor: state.easeFactor,
        intervalDays: state.intervalDays,
        repetitions: state.repetitions,
        lapses: state.lapses,
        accuracyRate: state.accuracyRate,
        nextReviewAt: state.nextReviewAt.toISOString(),
      }));

    // 4. Recommended grammar exercises from due or weak grammar topics
    const weakGrammarStates = await db
      .select({ grammarTopicId: grammarReviewStates.grammarTopicId })
      .from(grammarReviewStates)
      .where(
        and(
          eq(grammarReviewStates.userId, userId),
          lte(grammarReviewStates.accuracyRate, 0.75),
        ),
      );
    const targetTopicIds = Array.from(
      new Set([
        ...dueGrammar.map((g) => g.topicId),
        ...weakGrammarStates.map((w) => w.grammarTopicId),
      ]),
    );

    let recommendedGrammarExercises: PracticeQuestionDto[] = [];
    if (targetTopicIds.length > 0) {
      const qRows = await db
        .select({
          question: practiceQuestions,
          topicTitle: grammarTopics.title,
        })
        .from(practiceQuestions)
        .leftJoin(grammarTopics, eq(practiceQuestions.grammarTopicId, grammarTopics.id))
        .where(
          and(
            eq(practiceQuestions.userId, userId),
            inArray(practiceQuestions.grammarTopicId, targetTopicIds),
          ),
        )
        .orderBy(desc(practiceQuestions.createdAt))
        .limit(12);

      recommendedGrammarExercises = qRows.map(({ question: q, topicTitle }) => ({
        id: q.id,
        grammarTopicId: q.grammarTopicId,
        grammarTopicTitle: topicTitle,
        vocabularyId: q.vocabularyId,
        questionType: q.questionType,
        prompt: q.prompt,
        promptVi: q.promptVi,
        options: q.options,
        correctAnswer: q.correctAnswer,
        acceptableAnswers: q.acceptableAnswers,
        explanationVi: q.explanationVi,
        difficulty: q.difficulty,
        isCustom: q.isCustom,
        createdAt: q.createdAt.toISOString(),
        updatedAt: q.updatedAt.toISOString(),
      }));
    }

    // 5. Active mistakes
    const mistakeRows = await db
      .select({
        mistake: learningMistakes,
        vocabWord: vocabulary.word,
        topicTitle: grammarTopics.title,
      })
      .from(learningMistakes)
      .leftJoin(vocabulary, eq(learningMistakes.vocabularyId, vocabulary.id))
      .leftJoin(grammarTopics, eq(learningMistakes.grammarTopicId, grammarTopics.id))
      .where(
        and(
          eq(learningMistakes.userId, userId),
          eq(learningMistakes.status, 'active'),
        ),
      )
      .orderBy(desc(learningMistakes.updatedAt))
      .limit(10);

    const activeMistakes: MistakeDto[] = mistakeRows.map(
      ({ mistake: m, vocabWord, topicTitle }) => ({
        id: m.id,
        category: m.category,
        categoryLabel: MISTAKE_CATEGORY_LABELS[m.category],
        vocabularyId: m.vocabularyId,
        vocabularyWord: vocabWord,
        grammarTopicId: m.grammarTopicId,
        grammarTopicTitle: topicTitle,
        practiceAttemptId: m.practiceAttemptId,
        originalInput: m.originalInput,
        correctedVersion: m.correctedVersion,
        explanationVi: m.explanationVi,
        correctedExample: m.correctedExample,
        sourceContext: m.sourceContext,
        status: m.status,
        reviewCount: m.reviewCount,
        lastReviewedAt: m.lastReviewedAt ? m.lastReviewedAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }),
    );

    const response: DailyReviewDto = {
      targetMinutes,
      dailyVocabTarget: settings.dailyVocabTarget,
      dailyGrammarTarget: settings.dailyGrammarTarget,
      totalDueVocabCount: sortedDue.length,
      recommendedVocabCount: recommendedCount,
      isOverloaded,
      dueVocabulary,
      difficultVocabulary,
      dueGrammar,
      recommendedGrammarExercises,
      activeMistakes,
    };

    return c.json(response);
  });

  return app;
}

function sqlOrLapsesOrEase(
  states: typeof vocabularyReviewStates,
  vocab: typeof vocabulary,
) {
  return or(
    gte(states.lapses, 1),
    lt(states.easeFactor, 2.3),
    lte(vocab.confidenceLevel, 2),
  );
}
