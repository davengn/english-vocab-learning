import { and, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import {
  dailyLearningActivity,
  grammarReviewStates,
  userSettings,
  vocabulary,
  vocabularyReviewStates,
} from '../db/schema.js';
import { todayIsoDate } from '../../shared/schemas.js';
import { computeWordMasteryStatus } from '../../shared/srs.js';

export async function ensureVocabularyReviewStates(
  db: AppDatabase,
  userId: string,
  vocabularyId: string,
): Promise<void> {
  const existing = await db
    .select({ skillDirection: vocabularyReviewStates.skillDirection })
    .from(vocabularyReviewStates)
    .where(
      and(
        eq(vocabularyReviewStates.userId, userId),
        eq(vocabularyReviewStates.vocabularyId, vocabularyId),
      ),
    );

  const present = new Set(existing.map((e) => e.skillDirection));
  const directionsToCreate = (['en_to_vi', 'vi_to_en'] as const).filter(
    (dir) => !present.has(dir),
  );

  if (directionsToCreate.length > 0) {
    await db.insert(vocabularyReviewStates).values(
      directionsToCreate.map((dir) => ({
        userId,
        vocabularyId,
        skillDirection: dir,
        status: 'new' as const,
        easeFactor: 2.5,
        intervalDays: 0,
        repetitions: 0,
        lapses: 0,
        nextReviewAt: new Date(),
      })),
    );
  }
}

export async function ensureGrammarReviewState(
  db: AppDatabase,
  userId: string,
  grammarTopicId: string,
): Promise<void> {
  const existing = await db
    .select({ id: grammarReviewStates.id })
    .from(grammarReviewStates)
    .where(
      and(
        eq(grammarReviewStates.userId, userId),
        eq(grammarReviewStates.grammarTopicId, grammarTopicId),
      ),
    )
    .limit(1);

  if (!existing[0]) {
    await db.insert(grammarReviewStates).values({
      userId,
      grammarTopicId,
      status: 'new',
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      accuracyRate: 0,
      nextReviewAt: new Date(),
    });
  }
}

export async function syncWordMasteryStatus(
  db: AppDatabase,
  userId: string,
  vocabularyId: string,
): Promise<void> {
  const states = await db
    .select({
      skillDirection: vocabularyReviewStates.skillDirection,
      status: vocabularyReviewStates.status,
      repetitions: vocabularyReviewStates.repetitions,
      lapses: vocabularyReviewStates.lapses,
    })
    .from(vocabularyReviewStates)
    .where(
      and(
        eq(vocabularyReviewStates.userId, userId),
        eq(vocabularyReviewStates.vocabularyId, vocabularyId),
      ),
    );

  const mastery = computeWordMasteryStatus(states);
  await db
    .update(vocabulary)
    .set({ status: mastery, updatedAt: new Date() })
    .where(eq(vocabulary.id, vocabularyId));
}

export async function recordDailyActivity(
  db: AppDatabase,
  userId: string,
  deltas: {
    vocabReviewedCount?: number;
    vocabAddedCount?: number;
    grammarReviewedCount?: number;
    exercisesCompletedCount?: number;
    exercisesCorrectCount?: number;
    mistakesReviewedCount?: number;
    studySeconds?: number;
  },
  dateStr = todayIsoDate(),
): Promise<void> {
  const settings = await db
    .select({ dailyTargetMinutes: userSettings.dailyTargetMinutes })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const targetMinutes = settings[0]?.dailyTargetMinutes ?? 15;

  const existing = await db
    .select()
    .from(dailyLearningActivity)
    .where(
      and(
        eq(dailyLearningActivity.userId, userId),
        eq(dailyLearningActivity.activityDate, dateStr),
      ),
    )
    .limit(1);

  if (!existing[0]) {
    await db.insert(dailyLearningActivity).values({
      userId,
      activityDate: dateStr,
      vocabReviewedCount: deltas.vocabReviewedCount ?? 0,
      vocabAddedCount: deltas.vocabAddedCount ?? 0,
      grammarReviewedCount: deltas.grammarReviewedCount ?? 0,
      exercisesCompletedCount: deltas.exercisesCompletedCount ?? 0,
      exercisesCorrectCount: deltas.exercisesCorrectCount ?? 0,
      mistakesReviewedCount: deltas.mistakesReviewedCount ?? 0,
      studySeconds: deltas.studySeconds ?? 0,
      targetMinutesSnapshot: targetMinutes,
    });
    return;
  }

  await db
    .update(dailyLearningActivity)
    .set({
      vocabReviewedCount: sql`${dailyLearningActivity.vocabReviewedCount} + ${deltas.vocabReviewedCount ?? 0}`,
      vocabAddedCount: sql`${dailyLearningActivity.vocabAddedCount} + ${deltas.vocabAddedCount ?? 0}`,
      grammarReviewedCount: sql`${dailyLearningActivity.grammarReviewedCount} + ${deltas.grammarReviewedCount ?? 0}`,
      exercisesCompletedCount: sql`${dailyLearningActivity.exercisesCompletedCount} + ${deltas.exercisesCompletedCount ?? 0}`,
      exercisesCorrectCount: sql`${dailyLearningActivity.exercisesCorrectCount} + ${deltas.exercisesCorrectCount ?? 0}`,
      mistakesReviewedCount: sql`${dailyLearningActivity.mistakesReviewedCount} + ${deltas.mistakesReviewedCount ?? 0}`,
      studySeconds: sql`${dailyLearningActivity.studySeconds} + ${deltas.studySeconds ?? 0}`,
      targetMinutesSnapshot: targetMinutes,
    })
    .where(eq(dailyLearningActivity.id, existing[0].id));
}
