import { Hono } from 'hono';
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDatabase } from '../db/index.js';
import {
  grammarTopics,
  learningMistakes,
  practiceQuestions,
  practiceSetQuestions,
  practiceSets,
  vocabulary,
} from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import { recordDailyActivity } from '../lib/helpers.js';
import {
  MISTAKE_CATEGORIES,
  MISTAKE_CATEGORY_LABELS,
  mistakeInputSchema,
  normalizeUnicode,
} from '../../shared/schemas.js';
import type {
  MistakeCategory,
  MistakeDto,
  MistakeStatus,
  PracticeQuestionDto,
  PracticeSetDto,
} from '../../shared/apiTypes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function serializeMistake(
  m: typeof learningMistakes.$inferSelect,
  vocabularyWord: string | null,
  grammarTopicTitle: string | null,
): MistakeDto {
  return {
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
  };
}

async function fetchMistakeById(
  db: AppDatabase,
  userId: string,
  id: string,
): Promise<MistakeDto | null> {
  const [row] = await db
    .select({
      mistake: learningMistakes,
      vocabularyWord: vocabulary.word,
      grammarTopicTitle: grammarTopics.title,
    })
    .from(learningMistakes)
    .leftJoin(vocabulary, eq(learningMistakes.vocabularyId, vocabulary.id))
    .leftJoin(grammarTopics, eq(learningMistakes.grammarTopicId, grammarTopics.id))
    .where(and(eq(learningMistakes.id, id), eq(learningMistakes.userId, userId)))
    .limit(1);

  if (!row) return null;
  return serializeMistake(row.mistake, row.vocabularyWord, row.grammarTopicTitle);
}

const mistakeUpdateSchema = mistakeInputSchema.partial().extend({
  status: z.enum(['active', 'reviewed', 'resolved']).optional(),
  markReviewed: z.boolean().optional(),
});

const createPracticeSetFromMistakesSchema = z.object({
  title: z.string().trim().optional(),
  mistakeIds: z.array(z.string().uuid()).optional(),
  category: z.enum(MISTAKE_CATEGORIES).optional(),
});

export function createMistakesRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get('/mistakes', async (c) => {
    const userId = await getDefaultUserId(db);
    const category = c.req.query('category');
    const status = c.req.query('status');
    const search = normalizeUnicode(c.req.query('search') ?? '');

    const conditions = [eq(learningMistakes.userId, userId)];

    if (
      category &&
      (MISTAKE_CATEGORIES as readonly string[]).includes(category)
    ) {
      conditions.push(eq(learningMistakes.category, category as MistakeCategory));
    }
    if (
      status &&
      (['active', 'reviewed', 'resolved'] as const).includes(status as MistakeStatus)
    ) {
      conditions.push(eq(learningMistakes.status, status as MistakeStatus));
    }
    if (search) {
      const pattern = `%${search}%`;
      const cond = or(
        ilike(learningMistakes.originalInput, pattern),
        ilike(learningMistakes.correctedVersion, pattern),
        ilike(learningMistakes.explanationVi, pattern),
        ilike(learningMistakes.correctedExample, pattern),
        ilike(learningMistakes.sourceContext, pattern),
      );
      if (cond) conditions.push(cond);
    }

    const rows = await db
      .select({
        mistake: learningMistakes,
        vocabularyWord: vocabulary.word,
        grammarTopicTitle: grammarTopics.title,
      })
      .from(learningMistakes)
      .leftJoin(vocabulary, eq(learningMistakes.vocabularyId, vocabulary.id))
      .leftJoin(grammarTopics, eq(learningMistakes.grammarTopicId, grammarTopics.id))
      .where(and(...conditions))
      .orderBy(desc(learningMistakes.updatedAt));

    return c.json(
      rows.map((r) => serializeMistake(r.mistake, r.vocabularyWord, r.grammarTopicTitle)),
    );
  });

  app.post('/mistakes', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = mistakeInputSchema.parse(body);

    const [created] = await db
      .insert(learningMistakes)
      .values({
        userId,
        category: parsed.category,
        vocabularyId: parsed.vocabularyId ?? null,
        grammarTopicId: parsed.grammarTopicId ?? null,
        practiceAttemptId: parsed.practiceAttemptId ?? null,
        originalInput: normalizeUnicode(parsed.originalInput),
        correctedVersion: normalizeUnicode(parsed.correctedVersion),
        explanationVi: normalizeUnicode(parsed.explanationVi),
        correctedExample: normalizeUnicode(parsed.correctedExample),
        sourceContext: normalizeUnicode(parsed.sourceContext),
        status: 'active',
      })
      .returning();

    const dto = await fetchMistakeById(db, userId, created.id);
    return c.json(dto, 201);
  });

  app.post('/mistakes/create-practice-set', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json().catch(() => ({}));
    const parsed = createPracticeSetFromMistakesSchema.parse(body);

    const conditions = [eq(learningMistakes.userId, userId)];
    if (parsed.mistakeIds && parsed.mistakeIds.length > 0) {
      conditions.push(inArray(learningMistakes.id, parsed.mistakeIds));
    } else {
      if (parsed.category) {
        conditions.push(eq(learningMistakes.category, parsed.category));
      }
      conditions.push(
        inArray(learningMistakes.status, ['active', 'reviewed']),
      );
    }

    const mistakesList = await db
      .select()
      .from(learningMistakes)
      .where(and(...conditions))
      .orderBy(desc(learningMistakes.updatedAt))
      .limit(30);

    if (mistakesList.length === 0) {
      return c.json(
        { error: 'Không có lỗi sai phù hợp để tạo bộ luyện tập' },
        400,
      );
    }

    const title = parsed.title?.trim()
      ? normalizeUnicode(parsed.title)
      : parsed.category
        ? `Ôn tập lỗi: ${MISTAKE_CATEGORY_LABELS[parsed.category]}`
        : 'Bộ bài tập từ Ngân hàng lỗi sai cá nhân';

    const [createdSet] = await db
      .insert(practiceSets)
      .values({
        userId,
        title,
        description: `Tạo từ ${mistakesList.length} lỗi sai đã lưu để sửa lại câu chính xác.`,
        sourceType: 'mistake_bank',
      })
      .returning();

    const createdQuestions: PracticeQuestionDto[] = [];

    for (let idx = 0; idx < mistakesList.length; idx++) {
      const m = mistakesList[idx];
      const explanationParts = [
        m.explanationVi.trim(),
        m.correctedExample.trim() ? `Ví dụ chuẩn: ${m.correctedExample.trim()}` : '',
      ].filter(Boolean);

      const [q] = await db
        .insert(practiceQuestions)
        .values({
          userId,
          grammarTopicId: m.grammarTopicId ?? null,
          vocabularyId: m.vocabularyId ?? null,
          questionType: 'sentence_correction',
          prompt: m.originalInput,
          promptVi: `Sửa lỗi (${MISTAKE_CATEGORY_LABELS[m.category]}) thành câu/từ đúng:`,
          options: [],
          correctAnswer: m.correctedVersion,
          acceptableAnswers: Array.from(
            new Set([m.correctedVersion, m.correctedExample].filter(Boolean)),
          ),
          explanationVi: explanationParts.join('\n'),
          difficulty: 'intermediate',
          isCustom: true,
        })
        .returning();

      await db.insert(practiceSetQuestions).values({
        setId: createdSet.id,
        questionId: q.id,
        sortOrder: idx,
      });

      createdQuestions.push({
        id: q.id,
        grammarTopicId: q.grammarTopicId,
        grammarTopicTitle: null,
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
      });
    }

    const dto: PracticeSetDto = {
      id: createdSet.id,
      title: createdSet.title,
      description: createdSet.description,
      sourceType: createdSet.sourceType,
      createdAt: createdSet.createdAt.toISOString(),
      questionCount: createdQuestions.length,
      questionIds: createdQuestions.map((q) => q.id),
      questions: createdQuestions,
    };

    return c.json(dto, 201);
  });

  app.patch('/mistakes/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy mục lỗi sai' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(learningMistakes)
      .where(and(eq(learningMistakes.id, id), eq(learningMistakes.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy mục lỗi sai' }, 404);
    }

    const body = await c.req.json();
    const parsed = mistakeUpdateSchema.parse(body);
    const now = new Date();

    const isReviewTransition =
      Boolean(parsed.markReviewed) ||
      (parsed.status !== undefined &&
        parsed.status !== existing.status &&
        (parsed.status === 'reviewed' || parsed.status === 'resolved'));

    const nextStatus =
      parsed.status ??
      (parsed.markReviewed && existing.status === 'active' ? 'reviewed' : undefined);

    await db
      .update(learningMistakes)
      .set({
        ...(parsed.category !== undefined ? { category: parsed.category } : {}),
        ...(parsed.vocabularyId !== undefined
          ? { vocabularyId: parsed.vocabularyId }
          : {}),
        ...(parsed.grammarTopicId !== undefined
          ? { grammarTopicId: parsed.grammarTopicId }
          : {}),
        ...(parsed.originalInput !== undefined
          ? { originalInput: normalizeUnicode(parsed.originalInput) }
          : {}),
        ...(parsed.correctedVersion !== undefined
          ? { correctedVersion: normalizeUnicode(parsed.correctedVersion) }
          : {}),
        ...(parsed.explanationVi !== undefined
          ? { explanationVi: normalizeUnicode(parsed.explanationVi) }
          : {}),
        ...(parsed.correctedExample !== undefined
          ? { correctedExample: normalizeUnicode(parsed.correctedExample) }
          : {}),
        ...(parsed.sourceContext !== undefined
          ? { sourceContext: normalizeUnicode(parsed.sourceContext) }
          : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(isReviewTransition
          ? {
              reviewCount: existing.reviewCount + 1,
              lastReviewedAt: now,
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(learningMistakes.id, id));

    if (isReviewTransition) {
      await recordDailyActivity(db, userId, { mistakesReviewedCount: 1 });
    }

    const dto = await fetchMistakeById(db, userId, id);
    return c.json(dto);
  });

  app.delete('/mistakes/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy mục lỗi sai' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(learningMistakes)
      .where(and(eq(learningMistakes.id, id), eq(learningMistakes.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy mục lỗi sai' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  return app;
}
