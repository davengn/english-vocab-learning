import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDatabase } from '../db/index.js';
import {
  grammarCategories,
  grammarComparisons,
  grammarExamples,
  grammarReviewStates,
  grammarTopics,
  learningSessions,
  practiceQuestions,
  sessionGrammar,
} from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import { ensureGrammarReviewState } from '../lib/helpers.js';
import {
  CEFR_LEVELS,
  GRAMMAR_DIFFICULTIES,
  grammarTopicInputSchema,
  normalizeUnicode,
  slugify,
} from '../../shared/schemas.js';
import type {
  CefrLevel,
  GrammarCategoryDto,
  GrammarDifficulty,
  GrammarLearningStatus,
  GrammarReviewStateDto,
  GrammarTopicDetailDto,
  GrammarTopicListItemDto,
  LinkedSessionRefDto,
  PracticeQuestionDto,
} from '../../shared/apiTypes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function serializeGrammarReviewState(
  row: typeof grammarReviewStates.$inferSelect,
): GrammarReviewStateDto {
  return {
    id: row.id,
    grammarTopicId: row.grammarTopicId,
    status: row.status,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    accuracyRate: row.accuracyRate,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    nextReviewAt: row.nextReviewAt.toISOString(),
  };
}

async function ensureUniqueCategorySlug(
  db: AppDatabase,
  userId: string,
  name: string,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let idx = 1;
  while (true) {
    const existing = await db
      .select({ id: grammarCategories.id })
      .from(grammarCategories)
      .where(
        and(eq(grammarCategories.userId, userId), eq(grammarCategories.slug, candidate)),
      )
      .limit(1);
    if (!existing[0]) return candidate;
    idx += 1;
    candidate = `${base}-${idx}`;
  }
}

async function ensureUniqueTopicSlug(
  db: AppDatabase,
  userId: string,
  title: string,
): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let idx = 1;
  while (true) {
    const existing = await db
      .select({ id: grammarTopics.id })
      .from(grammarTopics)
      .where(and(eq(grammarTopics.userId, userId), eq(grammarTopics.slug, candidate)))
      .limit(1);
    if (!existing[0]) return candidate;
    idx += 1;
    candidate = `${base}-${idx}`;
  }
}

export async function buildGrammarTopicDetail(
  db: AppDatabase,
  userId: string,
  topicId: string,
): Promise<GrammarTopicDetailDto | null> {
  const [row] = await db
    .select({
      topic: grammarTopics,
      categoryName: grammarCategories.name,
      categoryNameVi: grammarCategories.nameVi,
    })
    .from(grammarTopics)
    .innerJoin(grammarCategories, eq(grammarTopics.categoryId, grammarCategories.id))
    .where(and(eq(grammarTopics.id, topicId), eq(grammarTopics.userId, userId)))
    .limit(1);

  if (!row) return null;

  const [examples, comparisons, sessionLinks, questions, reviewRows] = await Promise.all([
    db
      .select()
      .from(grammarExamples)
      .where(eq(grammarExamples.topicId, topicId))
      .orderBy(asc(grammarExamples.sortOrder)),
    db
      .select()
      .from(grammarComparisons)
      .where(eq(grammarComparisons.topicId, topicId)),
    db
      .select({
        sessionId: learningSessions.id,
        title: learningSessions.title,
        learningDate: learningSessions.learningDate,
        sourceType: learningSessions.sourceType,
        status: learningSessions.status,
        sessionNote: sessionGrammar.sessionNote,
      })
      .from(sessionGrammar)
      .innerJoin(learningSessions, eq(sessionGrammar.sessionId, learningSessions.id))
      .where(eq(sessionGrammar.topicId, topicId))
      .orderBy(desc(learningSessions.learningDate)),
    db
      .select()
      .from(practiceQuestions)
      .where(
        and(
          eq(practiceQuestions.userId, userId),
          eq(practiceQuestions.grammarTopicId, topicId),
        ),
      )
      .orderBy(desc(practiceQuestions.createdAt)),
    db
      .select()
      .from(grammarReviewStates)
      .where(
        and(
          eq(grammarReviewStates.userId, userId),
          eq(grammarReviewStates.grammarTopicId, topicId),
        ),
      )
      .limit(1),
  ]);

  const t = row.topic;
  const linkedSessions: LinkedSessionRefDto[] = sessionLinks.map((s) => ({
    sessionId: s.sessionId,
    title: s.title,
    learningDate: s.learningDate,
    sourceType: s.sourceType,
    status: s.status,
    sessionNote: s.sessionNote,
  }));

  const linkedQuestions: PracticeQuestionDto[] = questions.map((q) => ({
    id: q.id,
    grammarTopicId: q.grammarTopicId,
    grammarTopicTitle: t.title,
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

  return {
    id: t.id,
    categoryId: t.categoryId,
    categoryName: row.categoryName,
    categoryNameVi: row.categoryNameVi,
    title: t.title,
    titleVi: t.titleVi,
    slug: t.slug,
    difficulty: t.difficulty,
    cefrLevel: t.cefrLevel,
    learningStatus: t.learningStatus,
    formula: t.formula,
    explanationVi: t.explanationVi,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    exampleCount: examples.length,
    questionCount: linkedQuestions.length,
    reviewState: reviewRows[0] ? serializeGrammarReviewState(reviewRows[0]) : null,
    explanationEn: t.explanationEn,
    whatItIs: t.whatItIs,
    whyUsed: t.whyUsed,
    whenUsed: t.whenUsed,
    howToRecognize: t.howToRecognize,
    usageNotes: t.usageNotes,
    classNotes: t.classNotes,
    personalExplanations: t.personalExplanations,
    customExamples: t.customExamples,
    openQuestions: t.openQuestions,
    relatedTopicIds: t.relatedTopicIds,
    examples: examples.map((ex) => ({
      id: ex.id,
      topicId: ex.topicId,
      englishSentence: ex.englishSentence,
      vietnameseTranslation: ex.vietnameseTranslation,
      structureHighlight: ex.structureHighlight,
      isCommonMistake: ex.isCommonMistake,
      incorrectVersion: ex.incorrectVersion,
      correctionNote: ex.correctionNote,
      sortOrder: ex.sortOrder,
    })),
    comparisons: comparisons.map((cmp) => ({
      id: cmp.id,
      topicId: cmp.topicId,
      comparedTopicTitle: cmp.comparedTopicTitle,
      comparedTopicId: cmp.comparedTopicId,
      differenceVi: cmp.differenceVi,
      contextExampleA: cmp.contextExampleA,
      contextExampleB: cmp.contextExampleB,
      commonMistakeVi: cmp.commonMistakeVi,
    })),
    linkedSessions,
    linkedQuestions,
  };
}

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên danh mục'),
  nameVi: z.string().trim().default(''),
  description: z.string().default(''),
});

const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  sortOrder: z.number().int().min(0).optional(),
});

export function createGrammarRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get('/grammar/categories', async (c) => {
    const userId = await getDefaultUserId(db);
    const categories = await db
      .select()
      .from(grammarCategories)
      .where(eq(grammarCategories.userId, userId))
      .orderBy(asc(grammarCategories.sortOrder), asc(grammarCategories.name));

    const counts =
      categories.length > 0
        ? await db
            .select({
              categoryId: grammarTopics.categoryId,
              count: sql<number>`count(*)::int`,
            })
            .from(grammarTopics)
            .where(
              inArray(
                grammarTopics.categoryId,
                categories.map((cat) => cat.id),
              ),
            )
            .groupBy(grammarTopics.categoryId)
        : [];
    const countMap = new Map(counts.map((r) => [r.categoryId, Number(r.count)]));

    const result: GrammarCategoryDto[] = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      nameVi: cat.nameVi,
      slug: cat.slug,
      description: cat.description,
      sortOrder: cat.sortOrder,
      isSystem: cat.isSystem,
      topicCount: countMap.get(cat.id) ?? 0,
    }));

    return c.json(result);
  });

  app.post('/grammar/categories', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = categoryCreateSchema.parse(body);

    const name = normalizeUnicode(parsed.name);
    const nameVi = normalizeUnicode(parsed.nameVi) || name;
    const slug = await ensureUniqueCategorySlug(db, userId, name);

    const [created] = await db
      .insert(grammarCategories)
      .values({
        userId,
        name,
        nameVi,
        slug,
        description: normalizeUnicode(parsed.description),
        sortOrder: 100,
        isSystem: false,
      })
      .returning();

    return c.json(
      {
        id: created.id,
        name: created.name,
        nameVi: created.nameVi,
        slug: created.slug,
        description: created.description,
        sortOrder: created.sortOrder,
        isSystem: created.isSystem,
        topicCount: 0,
      } satisfies GrammarCategoryDto,
      201,
    );
  });

  app.patch('/grammar/categories/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy danh mục ngữ pháp' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(grammarCategories)
      .where(and(eq(grammarCategories.id, id), eq(grammarCategories.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy danh mục ngữ pháp' }, 404);
    }

    const body = await c.req.json();
    const parsed = categoryUpdateSchema.parse(body);

    const [updated] = await db
      .update(grammarCategories)
      .set({
        ...(parsed.name !== undefined ? { name: normalizeUnicode(parsed.name) } : {}),
        ...(parsed.nameVi !== undefined
          ? { nameVi: normalizeUnicode(parsed.nameVi) }
          : {}),
        ...(parsed.description !== undefined
          ? { description: normalizeUnicode(parsed.description) }
          : {}),
        ...(parsed.sortOrder !== undefined ? { sortOrder: parsed.sortOrder } : {}),
      })
      .where(eq(grammarCategories.id, id))
      .returning();

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(grammarTopics)
      .where(eq(grammarTopics.categoryId, id));

    return c.json({
      id: updated.id,
      name: updated.name,
      nameVi: updated.nameVi,
      slug: updated.slug,
      description: updated.description,
      sortOrder: updated.sortOrder,
      isSystem: updated.isSystem,
      topicCount: Number(countRow?.count ?? 0),
    } satisfies GrammarCategoryDto);
  });

  app.delete('/grammar/categories/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy danh mục ngữ pháp' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(grammarCategories)
      .where(and(eq(grammarCategories.id, id), eq(grammarCategories.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy danh mục ngữ pháp' }, 404);
    }
    if (existing.isSystem) {
      return c.json({ error: 'Không thể xóa danh mục ngữ pháp mặc định của hệ thống' }, 400);
    }

    await db.delete(grammarCategories).where(eq(grammarCategories.id, id));
    return c.json({ deleted: true, id });
  });

  app.get('/grammar/topics', async (c) => {
    const userId = await getDefaultUserId(db);
    const categoryId = c.req.query('categoryId');
    const difficulty = c.req.query('difficulty');
    const cefrLevel = c.req.query('cefrLevel');
    const learningStatus = c.req.query('learningStatus');
    const search = normalizeUnicode(c.req.query('search') ?? '');

    const conditions = [eq(grammarTopics.userId, userId)];

    if (isUuid(categoryId)) {
      conditions.push(eq(grammarTopics.categoryId, categoryId));
    }
    if (
      difficulty &&
      (GRAMMAR_DIFFICULTIES as readonly string[]).includes(difficulty)
    ) {
      conditions.push(eq(grammarTopics.difficulty, difficulty as GrammarDifficulty));
    }
    if (cefrLevel && (CEFR_LEVELS as readonly string[]).includes(cefrLevel)) {
      conditions.push(eq(grammarTopics.cefrLevel, cefrLevel as CefrLevel));
    }
    if (
      learningStatus &&
      (['not_started', 'learning', 'practicing', 'mastered'] as const).includes(
        learningStatus as GrammarLearningStatus,
      )
    ) {
      conditions.push(
        eq(grammarTopics.learningStatus, learningStatus as GrammarLearningStatus),
      );
    }
    if (search) {
      const pattern = `%${search}%`;
      const cond = or(
        ilike(grammarTopics.title, pattern),
        ilike(grammarTopics.titleVi, pattern),
        ilike(grammarTopics.explanationVi, pattern),
        ilike(grammarTopics.formula, pattern),
      );
      if (cond) conditions.push(cond);
    }

    const rows = await db
      .select({
        topic: grammarTopics,
        categoryName: grammarCategories.name,
        categoryNameVi: grammarCategories.nameVi,
      })
      .from(grammarTopics)
      .innerJoin(grammarCategories, eq(grammarTopics.categoryId, grammarCategories.id))
      .where(and(...conditions))
      .orderBy(asc(grammarCategories.sortOrder), desc(grammarTopics.updatedAt));

    if (rows.length === 0) return c.json([]);

    const topicIds = rows.map((r) => r.topic.id);

    const [exCounts, qCounts, reviewRows] = await Promise.all([
      db
        .select({
          topicId: grammarExamples.topicId,
          count: sql<number>`count(*)::int`,
        })
        .from(grammarExamples)
        .where(inArray(grammarExamples.topicId, topicIds))
        .groupBy(grammarExamples.topicId),
      db
        .select({
          grammarTopicId: practiceQuestions.grammarTopicId,
          count: sql<number>`count(*)::int`,
        })
        .from(practiceQuestions)
        .where(
          and(
            eq(practiceQuestions.userId, userId),
            inArray(practiceQuestions.grammarTopicId, topicIds),
          ),
        )
        .groupBy(practiceQuestions.grammarTopicId),
      db
        .select()
        .from(grammarReviewStates)
        .where(
          and(
            eq(grammarReviewStates.userId, userId),
            inArray(grammarReviewStates.grammarTopicId, topicIds),
          ),
        ),
    ]);

    const exMap = new Map(exCounts.map((r) => [r.topicId, Number(r.count)]));
    const qMap = new Map(
      qCounts
        .filter((r) => r.grammarTopicId !== null)
        .map((r) => [r.grammarTopicId as string, Number(r.count)]),
    );
    const reviewMap = new Map(
      reviewRows.map((r) => [r.grammarTopicId, serializeGrammarReviewState(r)]),
    );

    const result: GrammarTopicListItemDto[] = rows.map(
      ({ topic: t, categoryName, categoryNameVi }) => ({
        id: t.id,
        categoryId: t.categoryId,
        categoryName,
        categoryNameVi,
        title: t.title,
        titleVi: t.titleVi,
        slug: t.slug,
        difficulty: t.difficulty,
        cefrLevel: t.cefrLevel,
        learningStatus: t.learningStatus,
        formula: t.formula,
        explanationVi: t.explanationVi,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        exampleCount: exMap.get(t.id) ?? 0,
        questionCount: qMap.get(t.id) ?? 0,
        reviewState: reviewMap.get(t.id) ?? null,
      }),
    );

    return c.json(result);
  });

  app.post('/grammar/topics', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = grammarTopicInputSchema.parse(body);

    const [cat] = await db
      .select({ id: grammarCategories.id })
      .from(grammarCategories)
      .where(
        and(
          eq(grammarCategories.id, parsed.categoryId),
          eq(grammarCategories.userId, userId),
        ),
      )
      .limit(1);

    if (!cat) {
      return c.json({ error: 'Danh mục ngữ pháp không tồn tại' }, 400);
    }

    const slug = await ensureUniqueTopicSlug(db, userId, parsed.title);
    const [created] = await db
      .insert(grammarTopics)
      .values({
        userId,
        categoryId: parsed.categoryId,
        title: normalizeUnicode(parsed.title),
        titleVi: normalizeUnicode(parsed.titleVi),
        slug,
        difficulty: parsed.difficulty,
        cefrLevel: parsed.cefrLevel,
        learningStatus: parsed.learningStatus,
        explanationVi: normalizeUnicode(parsed.explanationVi),
        explanationEn: normalizeUnicode(parsed.explanationEn),
        whatItIs: normalizeUnicode(parsed.whatItIs),
        whyUsed: normalizeUnicode(parsed.whyUsed),
        whenUsed: normalizeUnicode(parsed.whenUsed),
        howToRecognize: normalizeUnicode(parsed.howToRecognize),
        formula: normalizeUnicode(parsed.formula),
        usageNotes: normalizeUnicode(parsed.usageNotes),
        classNotes: normalizeUnicode(parsed.classNotes),
        personalExplanations: normalizeUnicode(parsed.personalExplanations),
        customExamples: normalizeUnicode(parsed.customExamples),
        openQuestions: normalizeUnicode(parsed.openQuestions),
        relatedTopicIds: parsed.relatedTopicIds ?? [],
      })
      .returning();

    if (parsed.examples && parsed.examples.length > 0) {
      await db.insert(grammarExamples).values(
        parsed.examples.map((ex, idx) => ({
          topicId: created.id,
          englishSentence: normalizeUnicode(ex.englishSentence),
          vietnameseTranslation: normalizeUnicode(ex.vietnameseTranslation),
          structureHighlight: normalizeUnicode(ex.structureHighlight),
          isCommonMistake: ex.isCommonMistake,
          incorrectVersion: normalizeUnicode(ex.incorrectVersion),
          correctionNote: normalizeUnicode(ex.correctionNote),
          sortOrder: idx,
        })),
      );
    }

    if (parsed.comparisons && parsed.comparisons.length > 0) {
      await db.insert(grammarComparisons).values(
        parsed.comparisons.map((cmp) => ({
          topicId: created.id,
          comparedTopicTitle: normalizeUnicode(cmp.comparedTopicTitle),
          comparedTopicId: cmp.comparedTopicId ?? null,
          differenceVi: normalizeUnicode(cmp.differenceVi),
          contextExampleA: normalizeUnicode(cmp.contextExampleA),
          contextExampleB: normalizeUnicode(cmp.contextExampleB),
          commonMistakeVi: normalizeUnicode(cmp.commonMistakeVi),
        })),
      );
    }

    await ensureGrammarReviewState(db, userId, created.id);
    const detail = await buildGrammarTopicDetail(db, userId, created.id);
    return c.json(detail, 201);
  });

  app.get('/grammar/topics/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy chủ điểm ngữ pháp' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const detail = await buildGrammarTopicDetail(db, userId, id);
    if (!detail) {
      return c.json({ error: 'Không tìm thấy chủ điểm ngữ pháp' }, 404);
    }
    return c.json(detail);
  });

  app.patch('/grammar/topics/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy chủ điểm ngữ pháp' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(grammarTopics)
      .where(and(eq(grammarTopics.id, id), eq(grammarTopics.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy chủ điểm ngữ pháp' }, 404);
    }

    const body = await c.req.json();
    const parsed = grammarTopicInputSchema.partial().parse(body);

    if (parsed.categoryId !== undefined) {
      const [cat] = await db
        .select({ id: grammarCategories.id })
        .from(grammarCategories)
        .where(
          and(
            eq(grammarCategories.id, parsed.categoryId),
            eq(grammarCategories.userId, userId),
          ),
        )
        .limit(1);
      if (!cat) {
        return c.json({ error: 'Danh mục ngữ pháp không tồn tại' }, 400);
      }
    }

    await db
      .update(grammarTopics)
      .set({
        ...(parsed.categoryId !== undefined ? { categoryId: parsed.categoryId } : {}),
        ...(parsed.title !== undefined ? { title: normalizeUnicode(parsed.title) } : {}),
        ...(parsed.titleVi !== undefined
          ? { titleVi: normalizeUnicode(parsed.titleVi) }
          : {}),
        ...(parsed.difficulty !== undefined ? { difficulty: parsed.difficulty } : {}),
        ...(parsed.cefrLevel !== undefined ? { cefrLevel: parsed.cefrLevel } : {}),
        ...(parsed.learningStatus !== undefined
          ? { learningStatus: parsed.learningStatus }
          : {}),
        ...(parsed.explanationVi !== undefined
          ? { explanationVi: normalizeUnicode(parsed.explanationVi) }
          : {}),
        ...(parsed.explanationEn !== undefined
          ? { explanationEn: normalizeUnicode(parsed.explanationEn) }
          : {}),
        ...(parsed.whatItIs !== undefined
          ? { whatItIs: normalizeUnicode(parsed.whatItIs) }
          : {}),
        ...(parsed.whyUsed !== undefined
          ? { whyUsed: normalizeUnicode(parsed.whyUsed) }
          : {}),
        ...(parsed.whenUsed !== undefined
          ? { whenUsed: normalizeUnicode(parsed.whenUsed) }
          : {}),
        ...(parsed.howToRecognize !== undefined
          ? { howToRecognize: normalizeUnicode(parsed.howToRecognize) }
          : {}),
        ...(parsed.formula !== undefined
          ? { formula: normalizeUnicode(parsed.formula) }
          : {}),
        ...(parsed.usageNotes !== undefined
          ? { usageNotes: normalizeUnicode(parsed.usageNotes) }
          : {}),
        ...(parsed.classNotes !== undefined
          ? { classNotes: normalizeUnicode(parsed.classNotes) }
          : {}),
        ...(parsed.personalExplanations !== undefined
          ? { personalExplanations: normalizeUnicode(parsed.personalExplanations) }
          : {}),
        ...(parsed.customExamples !== undefined
          ? { customExamples: normalizeUnicode(parsed.customExamples) }
          : {}),
        ...(parsed.openQuestions !== undefined
          ? { openQuestions: normalizeUnicode(parsed.openQuestions) }
          : {}),
        ...(parsed.relatedTopicIds !== undefined
          ? { relatedTopicIds: parsed.relatedTopicIds }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(grammarTopics.id, id));

    if (parsed.examples !== undefined) {
      await db.delete(grammarExamples).where(eq(grammarExamples.topicId, id));
      if (parsed.examples.length > 0) {
        await db.insert(grammarExamples).values(
          parsed.examples.map((ex, idx) => ({
            topicId: id,
            englishSentence: normalizeUnicode(ex.englishSentence),
            vietnameseTranslation: normalizeUnicode(ex.vietnameseTranslation),
            structureHighlight: normalizeUnicode(ex.structureHighlight),
            isCommonMistake: ex.isCommonMistake,
            incorrectVersion: normalizeUnicode(ex.incorrectVersion),
            correctionNote: normalizeUnicode(ex.correctionNote),
            sortOrder: idx,
          })),
        );
      }
    }

    if (parsed.comparisons !== undefined) {
      await db.delete(grammarComparisons).where(eq(grammarComparisons.topicId, id));
      if (parsed.comparisons.length > 0) {
        await db.insert(grammarComparisons).values(
          parsed.comparisons.map((cmp) => ({
            topicId: id,
            comparedTopicTitle: normalizeUnicode(cmp.comparedTopicTitle),
            comparedTopicId: cmp.comparedTopicId ?? null,
            differenceVi: normalizeUnicode(cmp.differenceVi),
            contextExampleA: normalizeUnicode(cmp.contextExampleA),
            contextExampleB: normalizeUnicode(cmp.contextExampleB),
            commonMistakeVi: normalizeUnicode(cmp.commonMistakeVi),
          })),
        );
      }
    }

    const detail = await buildGrammarTopicDetail(db, userId, id);
    return c.json(detail);
  });

  app.delete('/grammar/topics/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy chủ điểm ngữ pháp' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(grammarTopics)
      .where(and(eq(grammarTopics.id, id), eq(grammarTopics.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy chủ điểm ngữ pháp' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  return app;
}
