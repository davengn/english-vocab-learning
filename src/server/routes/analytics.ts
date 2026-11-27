import { Hono } from 'hono';
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import {
  dailyLearningActivity,
  grammarCategories,
  grammarReviewStates,
  grammarTopics,
  learningMistakes,
  learningSessions,
  practiceAttempts,
  sessionGrammar,
  sessionVocabulary,
  vocabulary,
  vocabularyReviewStates,
} from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import { getOrCreateSettings, serializeSettings } from './settings.js';
import {
  MISTAKE_CATEGORIES,
  MISTAKE_CATEGORY_LABELS,
  SKILL_DIRECTIONS,
  SKILL_DIRECTION_LABELS,
  VOCAB_STATUS_LABELS,
  todayIsoDate,
} from '../../shared/schemas.js';
import type {
  DailyActivityDto,
  DashboardAnalyticsDto,
  InsightsAnalyticsDto,
  MistakeDto,
  SessionSummaryDto,
  SkillDirection,
  WeakGrammarCategoryDto,
  WeakWordDto,
} from '../../shared/apiTypes.js';

function isActivityRowActive(row: typeof dailyLearningActivity.$inferSelect): boolean {
  return (
    row.vocabReviewedCount +
      row.vocabAddedCount +
      row.grammarReviewedCount +
      row.exercisesCompletedCount +
      row.mistakesReviewedCount >
      0 || row.studySeconds > 0
  );
}

function shiftIsoDate(baseDate: Date, deltaDays: number): string {
  const shifted = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + deltaDays,
  );
  return todayIsoDate(shifted);
}

function parseIsoToDayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function computeStreaks(
  rows: Array<typeof dailyLearningActivity.$inferSelect>,
  now: Date,
): { currentStreak: number; longestStreak: number; totalActiveDays: number } {
  const activeDates = Array.from(
    new Set(rows.filter(isActivityRowActive).map((r) => r.activityDate)),
  ).sort();

  if (activeDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
  }

  const activeSet = new Set(activeDates);
  const todayStr = todayIsoDate(now);
  const yesterdayStr = shiftIsoDate(now, -1);

  let currentStreak = 0;
  let cursor = activeSet.has(todayStr) ? 0 : activeSet.has(yesterdayStr) ? -1 : 1;
  if (cursor <= 0) {
    while (activeSet.has(shiftIsoDate(now, cursor))) {
      currentStreak += 1;
      cursor -= 1;
    }
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < activeDates.length; i++) {
    const prevDay = parseIsoToDayNumber(activeDates[i - 1]);
    const currDay = parseIsoToDayNumber(activeDates[i]);
    if (currDay - prevDay === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalActiveDays: activeDates.length,
  };
}

function zeroActivity(dateStr: string, targetMinutes: number): DailyActivityDto {
  return {
    activityDate: dateStr,
    vocabReviewedCount: 0,
    vocabAddedCount: 0,
    grammarReviewedCount: 0,
    exercisesCompletedCount: 0,
    exercisesCorrectCount: 0,
    mistakesReviewedCount: 0,
    studySeconds: 0,
    targetMinutesSnapshot: targetMinutes,
  };
}

function serializeActivity(
  row: typeof dailyLearningActivity.$inferSelect,
): DailyActivityDto {
  return {
    activityDate: row.activityDate,
    vocabReviewedCount: row.vocabReviewedCount,
    vocabAddedCount: row.vocabAddedCount,
    grammarReviewedCount: row.grammarReviewedCount,
    exercisesCompletedCount: row.exercisesCompletedCount,
    exercisesCorrectCount: row.exercisesCorrectCount,
    mistakesReviewedCount: row.mistakesReviewedCount,
    studySeconds: row.studySeconds,
    targetMinutesSnapshot: row.targetMinutesSnapshot,
  };
}

async function computeWeakGrammarCategories(
  db: AppDatabase,
  userId: string,
  now: Date,
): Promise<WeakGrammarCategoryDto[]> {
  const [categories, topics, grammarStates] = await Promise.all([
    db.select().from(grammarCategories).where(eq(grammarCategories.userId, userId)),
    db.select().from(grammarTopics).where(eq(grammarTopics.userId, userId)),
    db.select().from(grammarReviewStates).where(eq(grammarReviewStates.userId, userId)),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const stateByTopic = new Map(grammarStates.map((s) => [s.grammarTopicId, s]));

  const statsByCat = new Map<
    string,
    {
      topicCount: number;
      accuracySum: number;
      accuracyCount: number;
      totalLapses: number;
      dueCount: number;
    }
  >();

  for (const t of topics) {
    const entry = statsByCat.get(t.categoryId) ?? {
      topicCount: 0,
      accuracySum: 0,
      accuracyCount: 0,
      totalLapses: 0,
      dueCount: 0,
    };
    entry.topicCount += 1;

    const st = stateByTopic.get(t.id);
    if (st) {
      entry.totalLapses += st.lapses;
      if (st.nextReviewAt <= now) entry.dueCount += 1;
      if (st.repetitions > 0 || st.lapses > 0 || st.accuracyRate > 0) {
        entry.accuracySum += st.accuracyRate * 100;
        entry.accuracyCount += 1;
      }
    }
    statsByCat.set(t.categoryId, entry);
  }

  const results: WeakGrammarCategoryDto[] = [];
  for (const [catId, st] of statsByCat.entries()) {
    const cat = catMap.get(catId);
    if (!cat) continue;
    const avgAccuracy =
      st.accuracyCount > 0 ? Math.round(st.accuracySum / st.accuracyCount) : 0;
    results.push({
      categoryId: cat.id,
      name: cat.name,
      nameVi: cat.nameVi,
      topicCount: st.topicCount,
      avgAccuracy,
      totalLapses: st.totalLapses,
      dueCount: st.dueCount,
    });
  }

  results.sort((a, b) => {
    const aHasScore = a.avgAccuracy > 0 || a.totalLapses > 0 ? 1 : 0;
    const bHasScore = b.avgAccuracy > 0 || b.totalLapses > 0 ? 1 : 0;
    if (aHasScore !== bHasScore) return bHasScore - aHasScore;
    if (a.avgAccuracy !== b.avgAccuracy) return a.avgAccuracy - b.avgAccuracy;
    return b.totalLapses - a.totalLapses || b.dueCount - a.dueCount;
  });

  return results;
}

async function computeWeakWords(
  db: AppDatabase,
  userId: string,
  limit: number,
): Promise<WeakWordDto[]> {
  const [words, states] = await Promise.all([
    db.select().from(vocabulary).where(eq(vocabulary.userId, userId)),
    db.select().from(vocabularyReviewStates).where(eq(vocabularyReviewStates.userId, userId)),
  ]);

  const statesByVocab = new Map<
    string,
    { totalLapses: number; minEase: number }
  >();
  for (const st of states) {
    const prev = statesByVocab.get(st.vocabularyId) ?? {
      totalLapses: 0,
      minEase: st.easeFactor,
    };
    prev.totalLapses += st.lapses;
    if (st.easeFactor < prev.minEase) prev.minEase = st.easeFactor;
    statesByVocab.set(st.vocabularyId, prev);
  }

  const items: WeakWordDto[] = words.map((w) => {
    const agg = statesByVocab.get(w.id);
    return {
      vocabularyId: w.id,
      word: w.word,
      vietnameseMeaning: w.vietnameseMeaning,
      cefrLevel: w.cefrLevel,
      confidenceLevel: w.confidenceLevel,
      lapses: agg?.totalLapses ?? 0,
      minEaseFactor: agg?.minEase ?? 2.5,
      status: w.status,
    };
  });

  return items
    .filter((w) => w.lapses > 0 || w.minEaseFactor < 2.4 || w.confidenceLevel <= 2)
    .sort(
      (a, b) =>
        b.lapses - a.lapses ||
        a.minEaseFactor - b.minEaseFactor ||
        a.confidenceLevel - b.confidenceLevel,
    )
    .slice(0, limit);
}

async function computeAttemptAccuracyStats(db: AppDatabase, userId: string) {
  const rows = await db
    .select({
      direction: practiceAttempts.direction,
      total: sql<number>`count(*)::int`,
      correct: sql<number>`sum(case when ${practiceAttempts.isCorrect} then 1 else 0 end)::int`,
    })
    .from(practiceAttempts)
    .where(eq(practiceAttempts.userId, userId))
    .groupBy(practiceAttempts.direction);

  let totalAll = 0;
  let correctAll = 0;
  const byDir = new Map<SkillDirection, { total: number; correct: number }>();

  for (const r of rows) {
    const t = Number(r.total);
    const c = Number(r.correct);
    totalAll += t;
    correctAll += c;
    if (r.direction) {
      byDir.set(r.direction, { total: t, correct: c });
    }
  }

  const pct = (c: number, t: number) => (t > 0 ? Math.round((c / t) * 100) : 0);
  const enToVi = byDir.get('en_to_vi') ?? { total: 0, correct: 0 };
  const viToEn = byDir.get('vi_to_en') ?? { total: 0, correct: 0 };

  return {
    overall: pct(correctAll, totalAll),
    recognitionEnToVi: pct(enToVi.correct, enToVi.total),
    activeRecallViToEn: pct(viToEn.correct, viToEn.total),
    directionBreakdown: SKILL_DIRECTIONS.map((dir) => {
      const stats = byDir.get(dir) ?? { total: 0, correct: 0 };
      return {
        direction: dir,
        label: SKILL_DIRECTION_LABELS[dir],
        totalAttempts: stats.total,
        correctAttempts: stats.correct,
        accuracy: pct(stats.correct, stats.total),
      };
    }),
  };
}

export function createAnalyticsRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get('/analytics/dashboard', async (c) => {
    const userId = await getDefaultUserId(db);
    const now = new Date();
    const todayStr = todayIsoDate(now);

    const [
      settingsRow,
      activityRows,
      vocabRows,
      grammarRows,
      dueVocabRow,
      dueGrammarRow,
      activeMistakeRow,
      recentSessionRows,
      recentMistakeRows,
      weakGrammarCategories,
      weakWords,
      attemptStats,
    ] = await Promise.all([
      getOrCreateSettings(db, userId),
      db
        .select()
        .from(dailyLearningActivity)
        .where(eq(dailyLearningActivity.userId, userId)),
      db
        .select({ status: vocabulary.status })
        .from(vocabulary)
        .where(eq(vocabulary.userId, userId)),
      db
        .select({ learningStatus: grammarTopics.learningStatus })
        .from(grammarTopics)
        .where(eq(grammarTopics.userId, userId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vocabularyReviewStates)
        .where(
          and(
            eq(vocabularyReviewStates.userId, userId),
            lte(vocabularyReviewStates.nextReviewAt, now),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(grammarReviewStates)
        .where(
          and(
            eq(grammarReviewStates.userId, userId),
            lte(grammarReviewStates.nextReviewAt, now),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(learningMistakes)
        .where(
          and(
            eq(learningMistakes.userId, userId),
            eq(learningMistakes.status, 'active'),
          ),
        ),
      db
        .select()
        .from(learningSessions)
        .where(eq(learningSessions.userId, userId))
        .orderBy(desc(learningSessions.learningDate), desc(learningSessions.createdAt))
        .limit(5),
      db
        .select({
          mistake: learningMistakes,
          vocabularyWord: vocabulary.word,
          grammarTopicTitle: grammarTopics.title,
        })
        .from(learningMistakes)
        .leftJoin(vocabulary, eq(learningMistakes.vocabularyId, vocabulary.id))
        .leftJoin(grammarTopics, eq(learningMistakes.grammarTopicId, grammarTopics.id))
        .where(eq(learningMistakes.userId, userId))
        .orderBy(desc(learningMistakes.updatedAt))
        .limit(5),
      computeWeakGrammarCategories(db, userId, now),
      computeWeakWords(db, userId, 6),
      computeAttemptAccuracyStats(db, userId),
    ]);

    const todayRow = activityRows.find((r) => r.activityDate === todayStr);
    const todayActivity = todayRow
      ? serializeActivity(todayRow)
      : zeroActivity(todayStr, settingsRow.dailyTargetMinutes);

    const streak = computeStreaks(activityRows, now);

    // Session counts for recent sessions
    const recentSessionIds = recentSessionRows.map((s) => s.id);
    const [svCounts, sgCounts] =
      recentSessionIds.length > 0
        ? await Promise.all([
            db
              .select({
                sessionId: sessionVocabulary.sessionId,
                count: sql<number>`count(*)::int`,
              })
              .from(sessionVocabulary)
              .where(inArray(sessionVocabulary.sessionId, recentSessionIds))
              .groupBy(sessionVocabulary.sessionId),
            db
              .select({
                sessionId: sessionGrammar.sessionId,
                count: sql<number>`count(*)::int`,
              })
              .from(sessionGrammar)
              .where(inArray(sessionGrammar.sessionId, recentSessionIds))
              .groupBy(sessionGrammar.sessionId),
          ])
        : [[], []];

    const svMap = new Map(svCounts.map((r) => [r.sessionId, Number(r.count)]));
    const sgMap = new Map(sgCounts.map((r) => [r.sessionId, Number(r.count)]));

    const recentSessions: SessionSummaryDto[] = recentSessionRows.map((s) => ({
      id: s.id,
      title: s.title,
      learningDate: s.learningDate,
      sourceType: s.sourceType,
      learningType: s.learningType,
      generalNotes: s.generalNotes,
      status: s.status,
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      vocabCount: svMap.get(s.id) ?? 0,
      grammarCount: sgMap.get(s.id) ?? 0,
    }));

    const recentMistakes: MistakeDto[] = recentMistakeRows.map(
      ({ mistake: m, vocabularyWord, grammarTopicTitle }) => ({
        id: m.id,
        category: m.category,
        categoryLabel: MISTAKE_CATEGORY_LABELS[m.category],
        vocabularyId: m.vocabularyId,
        vocabularyWord,
        grammarTopicId: m.grammarTopicId,
        grammarTopicTitle,
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

    const dashboard: DashboardAnalyticsDto = {
      todayActivity,
      settings: serializeSettings(settingsRow),
      streak,
      counts: {
        totalVocabulary: vocabRows.length,
        masteredVocabulary: vocabRows.filter((v) => v.status === 'mastered').length,
        totalGrammarTopics: grammarRows.length,
        learnedGrammarTopics: grammarRows.filter(
          (g) => g.learningStatus !== 'not_started',
        ).length,
        dueVocabCount: Number(dueVocabRow[0]?.count ?? 0),
        dueGrammarCount: Number(dueGrammarRow[0]?.count ?? 0),
        activeMistakesCount: Number(activeMistakeRow[0]?.count ?? 0),
      },
      accuracy: {
        overall: attemptStats.overall,
        recognitionEnToVi: attemptStats.recognitionEnToVi,
        activeRecallViToEn: attemptStats.activeRecallViToEn,
      },
      weakGrammarCategories: weakGrammarCategories.slice(0, 5),
      weakWords,
      recentSessions,
      recentMistakes,
    };

    return c.json(dashboard);
  });

  app.get('/analytics/insights', async (c) => {
    const userId = await getDefaultUserId(db);
    const now = new Date();

    const [
      settingsRow,
      activityRows,
      vocabStatusCounts,
      mistakeCounts,
      frequentlyForgottenWords,
      weakGrammarCategories,
      attemptStats,
    ] = await Promise.all([
      getOrCreateSettings(db, userId),
      db
        .select()
        .from(dailyLearningActivity)
        .where(eq(dailyLearningActivity.userId, userId)),
      db
        .select({
          status: vocabulary.status,
          count: sql<number>`count(*)::int`,
        })
        .from(vocabulary)
        .where(eq(vocabulary.userId, userId))
        .groupBy(vocabulary.status),
      db
        .select({
          category: learningMistakes.category,
          count: sql<number>`count(*)::int`,
        })
        .from(learningMistakes)
        .where(eq(learningMistakes.userId, userId))
        .groupBy(learningMistakes.category),
      computeWeakWords(db, userId, 12),
      computeWeakGrammarCategories(db, userId, now),
      computeAttemptAccuracyStats(db, userId),
    ]);

    const activityByDate = new Map(activityRows.map((r) => [r.activityDate, r]));
    const dailySeries: DailyActivityDto[] = [];
    for (let offset = -13; offset <= 0; offset++) {
      const dateStr = shiftIsoDate(now, offset);
      const found = activityByDate.get(dateStr);
      dailySeries.push(
        found
          ? serializeActivity(found)
          : zeroActivity(dateStr, settingsRow.dailyTargetMinutes),
      );
    }

    const statusCountMap = new Map(
      vocabStatusCounts.map((r) => [r.status, Number(r.count)]),
    );
    const vocabStatusDistribution = (
      ['new', 'learning', 'reviewing', 'mastered'] as const
    ).map((status) => ({
      status,
      label: VOCAB_STATUS_LABELS[status],
      count: statusCountMap.get(status) ?? 0,
    }));

    const mistakeCountMap = new Map(
      mistakeCounts.map((r) => [r.category, Number(r.count)]),
    );
    const mistakeCategoryDistribution = MISTAKE_CATEGORIES.map((category) => ({
      category,
      label: MISTAKE_CATEGORY_LABELS[category],
      count: mistakeCountMap.get(category) ?? 0,
    })).sort((a, b) => b.count - a.count);

    const insights: InsightsAnalyticsDto = {
      dailySeries,
      vocabStatusDistribution,
      mistakeCategoryDistribution,
      frequentlyForgottenWords,
      weakGrammarCategories,
      directionBreakdown: attemptStats.directionBreakdown,
    };

    return c.json(insights);
  });

  return app;
}
