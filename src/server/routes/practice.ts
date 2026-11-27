import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDatabase } from '../db/index.js';
import {
  collocations,
  grammarReviewStates,
  grammarTopics,
  learningMistakes,
  practiceAttempts,
  practiceQuestions,
  practiceSetQuestions,
  practiceSets,
  practiceSessions,
  sessionVocabulary,
  vocabulary,
  vocabularyCollectionItems,
  vocabularyExamples,
  vocabularyReviewStates,
} from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import {
  ensureGrammarReviewState,
  ensureVocabularyReviewStates,
  recordDailyActivity,
  syncWordMasteryStatus,
} from '../lib/helpers.js';
import {
  GRAMMAR_DIFFICULTIES,
  GRAMMAR_QUESTION_TYPES,
  MISTAKE_CATEGORIES,
  MISTAKE_CATEGORY_LABELS,
  SKILL_DIRECTIONS,
  VOCAB_PRACTICE_MODES,
  normalizeUnicode,
  normalizeWord,
  practiceQuestionInputSchema,
} from '../../shared/schemas.js';
import {
  calculateSm2,
  scoreReviewPriority,
  type Sm2Rating,
} from '../../shared/srs.js';
import type {
  GeneratedVocabQuizItemDto,
  GrammarDifficulty,
  GrammarQuestionType,
  GrammarReviewStateDto,
  MistakeDto,
  PracticeAttemptResponseDto,
  PracticeHistoryItemDto,
  PracticeQuestionDto,
  PracticeSessionDto,
  PracticeSetDto,
  ReviewStateDto,
  SkillDirection,
  VocabPracticeMode,
} from '../../shared/apiTypes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicSort<T>(items: T[], seedKey: string, keyFn: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ha = hashString(`${seedKey}:${keyFn(a)}`);
    const hb = hashString(`${seedKey}:${keyFn(b)}`);
    return ha - hb;
  });
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clozeSentence(sentence: string, targetWord: string, highlightText: string): string {
  const candidates = [highlightText.trim(), targetWord.trim()].filter(Boolean);
  for (const term of candidates) {
    const escaped = escapeRegExp(term);
    const wordRegex = new RegExp(`\\b${escaped}[a-zA-Z']*\\b`, 'i');
    if (wordRegex.test(sentence)) {
      return sentence.replace(wordRegex, '______');
    }
    const plainRegex = new RegExp(escaped, 'i');
    if (plainRegex.test(sentence)) {
      return sentence.replace(plainRegex, '______');
    }
  }
  return `${sentence} (______)`;
}

function inferDirectionFromMode(mode: string): SkillDirection {
  if (mode === 'vi_to_en' || mode === 'sentence_production') return 'vi_to_en';
  if (mode === 'spelling') return 'spelling';
  if (
    mode === 'fill_in_blank' ||
    mode === 'context_recognition' ||
    mode === 'collocation_match' ||
    mode === 'context'
  ) {
    return 'context';
  }
  return 'en_to_vi';
}

function serializeVocabReviewState(
  row: typeof vocabularyReviewStates.$inferSelect,
): ReviewStateDto {
  return {
    id: row.id,
    vocabularyId: row.vocabularyId,
    skillDirection: row.skillDirection,
    status: row.status,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    lastRating: row.lastRating,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    nextReviewAt: row.nextReviewAt.toISOString(),
  };
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

function serializeQuestion(
  q: typeof practiceQuestions.$inferSelect,
  grammarTopicTitle: string | null,
): PracticeQuestionDto {
  return {
    id: q.id,
    grammarTopicId: q.grammarTopicId,
    grammarTopicTitle,
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
  };
}

function serializePracticeSession(
  s: typeof practiceSessions.$inferSelect,
): PracticeSessionDto {
  return {
    id: s.id,
    domain: s.domain,
    mode: s.mode,
    title: s.title,
    totalItems: s.totalItems,
    completedItems: s.completedItems,
    correctCount: s.correctCount,
    durationSeconds: s.durationSeconds,
    startedAt: s.startedAt.toISOString(),
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
  };
}

async function buildPracticeSetDetail(
  db: AppDatabase,
  userId: string,
  setId: string,
): Promise<PracticeSetDto | null> {
  const [setRow] = await db
    .select()
    .from(practiceSets)
    .where(and(eq(practiceSets.id, setId), eq(practiceSets.userId, userId)))
    .limit(1);

  if (!setRow) return null;

  const links = await db
    .select({
      sortOrder: practiceSetQuestions.sortOrder,
      question: practiceQuestions,
      grammarTopicTitle: grammarTopics.title,
    })
    .from(practiceSetQuestions)
    .innerJoin(
      practiceQuestions,
      eq(practiceSetQuestions.questionId, practiceQuestions.id),
    )
    .leftJoin(grammarTopics, eq(practiceQuestions.grammarTopicId, grammarTopics.id))
    .where(eq(practiceSetQuestions.setId, setRow.id))
    .orderBy(asc(practiceSetQuestions.sortOrder));

  const questions = links.map((l) => serializeQuestion(l.question, l.grammarTopicTitle));

  return {
    id: setRow.id,
    title: setRow.title,
    description: setRow.description,
    sourceType: setRow.sourceType,
    createdAt: setRow.createdAt.toISOString(),
    questionCount: questions.length,
    questionIds: questions.map((q) => q.id),
    questions,
  };
}

const practiceSetCreateSchema = z.object({
  title: z.string().trim().min(1, 'Vui lòng nhập tên bộ bài tập'),
  description: z.string().default(''),
  sourceType: z.enum(['custom', 'grammar_topic', 'mistake_bank']).default('custom'),
  questionIds: z.array(z.string().uuid()).default([]),
});

const practiceSetUpdateSchema = practiceSetCreateSchema.partial();

const generateVocabPracticeSchema = z.object({
  mode: z.enum(VOCAB_PRACTICE_MODES),
  source: z.enum(['due', 'all', 'collection', 'session', 'weak']).default('all'),
  collectionId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  vocabularyIds: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(350).default(15),
});

const practiceSessionCreateSchema = z.object({
  domain: z.enum(['vocabulary', 'grammar', 'daily_review', 'mistake_review']),
  mode: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Vui lòng nhập tên phiên luyện tập'),
  totalItems: z.number().int().min(0).default(0),
});

const practiceAttemptCreateSchema = z.object({
  vocabularyId: z.string().uuid().nullable().optional(),
  grammarTopicId: z.string().uuid().nullable().optional(),
  questionId: z.string().uuid().nullable().optional(),
  mode: z.string().trim().min(1),
  direction: z.enum(SKILL_DIRECTIONS).nullable().optional(),
  userAnswer: z.string().default(''),
  expectedAnswer: z.string().default(''),
  isCorrect: z.boolean(),
  selfRating: z.number().int().min(1).max(4).nullable().optional(),
  responseTimeMs: z.number().int().min(0).default(0),
  saveMistake: z
    .object({
      category: z.enum(MISTAKE_CATEGORIES),
      explanationVi: z.string().default(''),
      correctedExample: z.string().default(''),
      sourceContext: z.string().default(''),
    })
    .optional(),
});

const practiceSessionCompleteSchema = z.object({
  durationSeconds: z.number().int().min(0).optional(),
  completedItems: z.number().int().min(0).optional(),
  correctCount: z.number().int().min(0).optional(),
});

export function createPracticeRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  // Questions CRUD
  app.get('/practice/questions', async (c) => {
    const userId = await getDefaultUserId(db);
    const grammarTopicId = c.req.query('grammarTopicId');
    const questionType = c.req.query('questionType');
    const difficulty = c.req.query('difficulty');
    const search = normalizeUnicode(c.req.query('search') ?? '');

    const conditions = [eq(practiceQuestions.userId, userId)];

    if (isUuid(grammarTopicId)) {
      conditions.push(eq(practiceQuestions.grammarTopicId, grammarTopicId));
    }
    if (
      questionType &&
      (GRAMMAR_QUESTION_TYPES as readonly string[]).includes(questionType)
    ) {
      conditions.push(
        eq(practiceQuestions.questionType, questionType as GrammarQuestionType),
      );
    }
    if (
      difficulty &&
      (GRAMMAR_DIFFICULTIES as readonly string[]).includes(difficulty)
    ) {
      conditions.push(
        eq(practiceQuestions.difficulty, difficulty as GrammarDifficulty),
      );
    }
    if (search) {
      const pattern = `%${search}%`;
      const cond = or(
        ilike(practiceQuestions.prompt, pattern),
        ilike(practiceQuestions.promptVi, pattern),
        ilike(practiceQuestions.correctAnswer, pattern),
        ilike(practiceQuestions.explanationVi, pattern),
      );
      if (cond) conditions.push(cond);
    }

    const rows = await db
      .select({
        question: practiceQuestions,
        grammarTopicTitle: grammarTopics.title,
      })
      .from(practiceQuestions)
      .leftJoin(grammarTopics, eq(practiceQuestions.grammarTopicId, grammarTopics.id))
      .where(and(...conditions))
      .orderBy(desc(practiceQuestions.createdAt));

    return c.json(rows.map((r) => serializeQuestion(r.question, r.grammarTopicTitle)));
  });

  app.post('/practice/questions', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = practiceQuestionInputSchema.parse(body);

    const [created] = await db
      .insert(practiceQuestions)
      .values({
        userId,
        grammarTopicId: parsed.grammarTopicId ?? null,
        vocabularyId: parsed.vocabularyId ?? null,
        questionType: parsed.questionType,
        prompt: normalizeUnicode(parsed.prompt),
        promptVi: normalizeUnicode(parsed.promptVi),
        options: parsed.options.map((o) => normalizeUnicode(o)),
        correctAnswer: normalizeUnicode(parsed.correctAnswer),
        acceptableAnswers: Array.from(
          new Set(
            [parsed.correctAnswer, ...parsed.acceptableAnswers]
              .map((a) => normalizeUnicode(a))
              .filter(Boolean),
          ),
        ),
        explanationVi: normalizeUnicode(parsed.explanationVi),
        difficulty: parsed.difficulty,
        isCustom: true,
      })
      .returning();

    let topicTitle: string | null = null;
    if (created.grammarTopicId) {
      const [topic] = await db
        .select({ title: grammarTopics.title })
        .from(grammarTopics)
        .where(eq(grammarTopics.id, created.grammarTopicId))
        .limit(1);
      topicTitle = topic?.title ?? null;
    }

    return c.json(serializeQuestion(created, topicTitle), 201);
  });

  app.patch('/practice/questions/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy câu hỏi' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(practiceQuestions)
      .where(and(eq(practiceQuestions.id, id), eq(practiceQuestions.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy câu hỏi' }, 404);
    }

    const body = await c.req.json();
    const parsed = practiceQuestionInputSchema.partial().parse(body);

    const [updated] = await db
      .update(practiceQuestions)
      .set({
        ...(parsed.grammarTopicId !== undefined
          ? { grammarTopicId: parsed.grammarTopicId }
          : {}),
        ...(parsed.vocabularyId !== undefined
          ? { vocabularyId: parsed.vocabularyId }
          : {}),
        ...(parsed.questionType !== undefined
          ? { questionType: parsed.questionType }
          : {}),
        ...(parsed.prompt !== undefined
          ? { prompt: normalizeUnicode(parsed.prompt) }
          : {}),
        ...(parsed.promptVi !== undefined
          ? { promptVi: normalizeUnicode(parsed.promptVi) }
          : {}),
        ...(parsed.options !== undefined
          ? { options: parsed.options.map((o) => normalizeUnicode(o)) }
          : {}),
        ...(parsed.correctAnswer !== undefined
          ? { correctAnswer: normalizeUnicode(parsed.correctAnswer) }
          : {}),
        ...(parsed.acceptableAnswers !== undefined
          ? { acceptableAnswers: parsed.acceptableAnswers.map((a) => normalizeUnicode(a)) }
          : {}),
        ...(parsed.explanationVi !== undefined
          ? { explanationVi: normalizeUnicode(parsed.explanationVi) }
          : {}),
        ...(parsed.difficulty !== undefined ? { difficulty: parsed.difficulty } : {}),
        updatedAt: new Date(),
      })
      .where(eq(practiceQuestions.id, id))
      .returning();

    let topicTitle: string | null = null;
    if (updated.grammarTopicId) {
      const [topic] = await db
        .select({ title: grammarTopics.title })
        .from(grammarTopics)
        .where(eq(grammarTopics.id, updated.grammarTopicId))
        .limit(1);
      topicTitle = topic?.title ?? null;
    }

    return c.json(serializeQuestion(updated, topicTitle));
  });

  app.delete('/practice/questions/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy câu hỏi' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(practiceQuestions)
      .where(and(eq(practiceQuestions.id, id), eq(practiceQuestions.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy câu hỏi' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  // Sets CRUD
  app.get('/practice/sets', async (c) => {
    const userId = await getDefaultUserId(db);
    const sets = await db
      .select()
      .from(practiceSets)
      .where(eq(practiceSets.userId, userId))
      .orderBy(desc(practiceSets.createdAt));

    if (sets.length === 0) return c.json([]);

    const links = await db
      .select()
      .from(practiceSetQuestions)
      .where(
        inArray(
          practiceSetQuestions.setId,
          sets.map((s) => s.id),
        ),
      )
      .orderBy(asc(practiceSetQuestions.sortOrder));

    const qMap = new Map<string, string[]>();
    for (const l of links) {
      const list = qMap.get(l.setId) ?? [];
      list.push(l.questionId);
      qMap.set(l.setId, list);
    }

    const result: PracticeSetDto[] = sets.map((s) => {
      const qIds = qMap.get(s.id) ?? [];
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        sourceType: s.sourceType,
        createdAt: s.createdAt.toISOString(),
        questionCount: qIds.length,
        questionIds: qIds,
      };
    });

    return c.json(result);
  });

  app.post('/practice/sets', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = practiceSetCreateSchema.parse(body);

    const [created] = await db
      .insert(practiceSets)
      .values({
        userId,
        title: normalizeUnicode(parsed.title),
        description: normalizeUnicode(parsed.description),
        sourceType: parsed.sourceType,
      })
      .returning();

    const uniqueQuestionIds = Array.from(new Set(parsed.questionIds));
    if (uniqueQuestionIds.length > 0) {
      const validQuestions = await db
        .select({ id: practiceQuestions.id })
        .from(practiceQuestions)
        .where(
          and(
            eq(practiceQuestions.userId, userId),
            inArray(practiceQuestions.id, uniqueQuestionIds),
          ),
        );
      const validSet = new Set(validQuestions.map((q) => q.id));
      const orderedValid = uniqueQuestionIds.filter((qid) => validSet.has(qid));

      if (orderedValid.length > 0) {
        await db.insert(practiceSetQuestions).values(
          orderedValid.map((questionId, idx) => ({
            setId: created.id,
            questionId,
            sortOrder: idx,
          })),
        );
      }
    }

    const detail = await buildPracticeSetDetail(db, userId, created.id);
    return c.json(detail, 201);
  });

  app.get('/practice/sets/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy bộ bài tập' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const detail = await buildPracticeSetDetail(db, userId, id);
    if (!detail) {
      return c.json({ error: 'Không tìm thấy bộ bài tập' }, 404);
    }

    return c.json(detail);
  });

  app.patch('/practice/sets/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy bộ bài tập' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(practiceSets)
      .where(and(eq(practiceSets.id, id), eq(practiceSets.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy bộ bài tập' }, 404);
    }

    const body = await c.req.json();
    const parsed = practiceSetUpdateSchema.parse(body);

    await db
      .update(practiceSets)
      .set({
        ...(parsed.title !== undefined ? { title: normalizeUnicode(parsed.title) } : {}),
        ...(parsed.description !== undefined
          ? { description: normalizeUnicode(parsed.description) }
          : {}),
        ...(parsed.sourceType !== undefined ? { sourceType: parsed.sourceType } : {}),
      })
      .where(eq(practiceSets.id, id));

    if (parsed.questionIds !== undefined) {
      await db.delete(practiceSetQuestions).where(eq(practiceSetQuestions.setId, id));
      const uniqueQuestionIds = Array.from(new Set(parsed.questionIds));
      if (uniqueQuestionIds.length > 0) {
        const validQuestions = await db
          .select({ id: practiceQuestions.id })
          .from(practiceQuestions)
          .where(
            and(
              eq(practiceQuestions.userId, userId),
              inArray(practiceQuestions.id, uniqueQuestionIds),
            ),
          );
        const validSet = new Set(validQuestions.map((q) => q.id));
        const orderedValid = uniqueQuestionIds.filter((qid) => validSet.has(qid));

        if (orderedValid.length > 0) {
          await db.insert(practiceSetQuestions).values(
            orderedValid.map((questionId, idx) => ({
              setId: id,
              questionId,
              sortOrder: idx,
            })),
          );
        }
      }
    }

    const detail = await buildPracticeSetDetail(db, userId, id);
    return c.json(detail);
  });

  app.delete('/practice/sets/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy bộ bài tập' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(practiceSets)
      .where(and(eq(practiceSets.id, id), eq(practiceSets.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy bộ bài tập' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  // Deterministic Vocabulary Practice Generator (Zero AI)
  app.post('/practice/vocabulary/generate', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = generateVocabPracticeSchema.parse(body);

    const allVocab = await db
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.userId, userId))
      .orderBy(desc(vocabulary.updatedAt));

    if (allVocab.length === 0) {
      return c.json([]);
    }

    const vocabById = new Map(allVocab.map((v) => [v.id, v]));
    const now = new Date();

    let candidateVocab: Array<typeof vocabulary.$inferSelect> = [];

    if (parsed.vocabularyIds && parsed.vocabularyIds.length > 0) {
      candidateVocab = parsed.vocabularyIds
        .map((id) => vocabById.get(id))
        .filter((v): v is typeof vocabulary.$inferSelect => Boolean(v));
    } else if (parsed.source === 'collection') {
      if (!parsed.collectionId) {
        return c.json([]);
      }
      const links = await db
        .select({ vocabularyId: vocabularyCollectionItems.vocabularyId })
        .from(vocabularyCollectionItems)
        .where(eq(vocabularyCollectionItems.collectionId, parsed.collectionId));
      candidateVocab = links
        .map((l) => vocabById.get(l.vocabularyId))
        .filter((v): v is typeof vocabulary.$inferSelect => Boolean(v));
    } else if (parsed.source === 'session') {
      if (!parsed.sessionId) {
        return c.json([]);
      }
      const links = await db
        .select({ vocabularyId: sessionVocabulary.vocabularyId })
        .from(sessionVocabulary)
        .where(eq(sessionVocabulary.sessionId, parsed.sessionId));
      candidateVocab = links
        .map((l) => vocabById.get(l.vocabularyId))
        .filter((v): v is typeof vocabulary.$inferSelect => Boolean(v));
    } else if (parsed.source === 'due') {
      const dueStates = await db
        .select()
        .from(vocabularyReviewStates)
        .where(
          and(
            eq(vocabularyReviewStates.userId, userId),
            lte(vocabularyReviewStates.nextReviewAt, now),
          ),
        );
      const priorityByVocab = new Map<string, number>();
      for (const st of dueStates) {
        const v = vocabById.get(st.vocabularyId);
        if (!v) continue;
        const score = scoreReviewPriority({
          nextReviewAt: st.nextReviewAt,
          lapses: st.lapses,
          confidenceLevel: v.confidenceLevel,
          easeFactor: st.easeFactor,
          isConfusing: Boolean(v.vnConfusingWords.trim()),
          now,
        });
        const prev = priorityByVocab.get(v.id) ?? -Infinity;
        if (score > prev) priorityByVocab.set(v.id, score);
      }
      candidateVocab = Array.from(priorityByVocab.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([vid]) => vocabById.get(vid))
        .filter((v): v is typeof vocabulary.$inferSelect => Boolean(v));
    } else if (parsed.source === 'weak') {
      const states = await db
        .select()
        .from(vocabularyReviewStates)
        .where(eq(vocabularyReviewStates.userId, userId));
      const weaknessScore = new Map<string, number>();
      for (const v of allVocab) {
        if (v.confidenceLevel <= 2) {
          weaknessScore.set(v.id, (3 - v.confidenceLevel) * 5);
        }
      }
      for (const st of states) {
        if (st.lapses >= 1 || st.easeFactor < 2.3) {
          const prev = weaknessScore.get(st.vocabularyId) ?? 0;
          weaknessScore.set(
            st.vocabularyId,
            prev + st.lapses * 6 + Math.max(0, (2.5 - st.easeFactor) * 10),
          );
        }
      }
      candidateVocab = Array.from(weaknessScore.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([vid]) => vocabById.get(vid))
        .filter((v): v is typeof vocabulary.$inferSelect => Boolean(v));
    } else {
      candidateVocab = allVocab;
    }

    if (candidateVocab.length === 0) {
      return c.json([]);
    }

    const allVocabIds = allVocab.map((v) => v.id);
    const [allExamples, allCollocations] = await Promise.all([
      db
        .select()
        .from(vocabularyExamples)
        .where(inArray(vocabularyExamples.vocabularyId, allVocabIds))
        .orderBy(asc(vocabularyExamples.sortOrder)),
      db
        .select()
        .from(collocations)
        .where(inArray(collocations.vocabularyId, allVocabIds)),
    ]);

    const exByVocab = new Map<string, Array<typeof vocabularyExamples.$inferSelect>>();
    for (const ex of allExamples) {
      const list = exByVocab.get(ex.vocabularyId) ?? [];
      list.push(ex);
      exByVocab.set(ex.vocabularyId, list);
    }

    const colByVocab = new Map<string, Array<typeof collocations.$inferSelect>>();
    for (const col of allCollocations) {
      const list = colByVocab.get(col.vocabularyId) ?? [];
      list.push(col);
      colByVocab.set(col.vocabularyId, list);
    }

    // Prioritize candidates best suited for the chosen mode before slicing to limit
    let orderedCandidates = [...candidateVocab];
    if (parsed.mode === 'collocation_match') {
      orderedCandidates.sort((a, b) => {
        const aHas = (colByVocab.get(a.id)?.length ?? 0) > 0 ? 1 : 0;
        const bHas = (colByVocab.get(b.id)?.length ?? 0) > 0 ? 1 : 0;
        return bHas - aHas;
      });
    } else if (parsed.mode === 'fill_in_blank' || parsed.mode === 'context_recognition') {
      orderedCandidates.sort((a, b) => {
        const aHas = (exByVocab.get(a.id)?.length ?? 0) > 0 ? 1 : 0;
        const bHas = (exByVocab.get(b.id)?.length ?? 0) > 0 ? 1 : 0;
        return bHas - aHas;
      });
    } else if (parsed.mode === 'en_to_vi' || parsed.mode === 'vi_to_en') {
      const withMeaning = orderedCandidates.filter(
        (v) => v.vietnameseMeaning.trim() || v.englishDefinition.trim(),
      );
      if (withMeaning.length > 0) orderedCandidates = withMeaning;
    }

    const selected = orderedCandidates.slice(0, parsed.limit);
    const direction = inferDirectionFromMode(parsed.mode);

    const buildWordDistractors = (
      target: typeof vocabulary.$inferSelect,
      count: number,
    ): string[] => {
      const pool = allVocab.filter(
        (other) =>
          other.id !== target.id &&
          normalizeWord(other.word) !== normalizeWord(target.word),
      );
      const samePos = pool.filter((o) => o.partOfSpeech === target.partOfSpeech);
      const diffPos = pool.filter((o) => o.partOfSpeech !== target.partOfSpeech);
      const ordered = [
        ...deterministicSort(samePos, `${parsed.mode}:${target.id}:same`, (w) => w.id),
        ...deterministicSort(diffPos, `${parsed.mode}:${target.id}:diff`, (w) => w.id),
      ];
      const picks: string[] = [];
      for (const item of ordered) {
        if (!picks.includes(item.word)) picks.push(item.word);
        if (picks.length >= count) break;
      }
      return picks;
    };

    const buildMeaningDistractors = (
      target: typeof vocabulary.$inferSelect,
      targetAnswer: string,
      count: number,
    ): string[] => {
      const pool = allVocab.filter((other) => {
        if (other.id === target.id) return false;
        const ans = (other.vietnameseMeaning || other.englishDefinition).trim();
        return Boolean(ans) && normalizeWord(ans) !== normalizeWord(targetAnswer);
      });
      const ordered = deterministicSort(
        pool,
        `${parsed.mode}:${target.id}:mean`,
        (w) => w.id,
      );
      const picks: string[] = [];
      for (const item of ordered) {
        const ans = (item.vietnameseMeaning || item.englishDefinition).trim();
        if (!picks.includes(ans)) picks.push(ans);
        if (picks.length >= count) break;
      }
      return picks;
    };

    const quizItems: GeneratedVocabQuizItemDto[] = selected.map((v) => {
      const ex = exByVocab.get(v.id)?.[0];
      const col = colByVocab.get(v.id)?.[0];
      const meaning = v.vietnameseMeaning.trim() || v.englishDefinition.trim() || v.word;
      const exampleSentence = ex?.englishSentence ?? col?.exampleSentence ?? '';
      const exampleTranslation =
        ex?.vietnameseTranslation ?? col?.exampleTranslation ?? '';
      const collocationPhrase = col?.phrase ?? '';
      const collocationMeaning = col?.vietnameseMeaning ?? '';
      const explanationVi =
        v.vietnameseExplanation.trim() ||
        v.vnCommonMistakes.trim() ||
        v.nuance.trim() ||
        v.vietnameseMeaning.trim();

      let prompt = v.word;
      let promptSubtext = v.ipa;
      let hint = '';
      let options: string[] = [];
      let correctAnswer = meaning;
      let acceptableAnswers: string[] = [meaning];

      switch (parsed.mode as VocabPracticeMode) {
        case 'en_to_vi': {
          prompt = v.word;
          promptSubtext = [v.ipa, v.partOfSpeech !== 'other' ? v.partOfSpeech : '']
            .filter(Boolean)
            .join(' • ');
          correctAnswer = meaning;
          const distractors = buildMeaningDistractors(v, correctAnswer, 3);
          options = deterministicSort(
            [correctAnswer, ...distractors],
            `opt:en_to_vi:${v.id}`,
            (s) => s,
          );
          const splitMeanings = meaning
            .split(/[,;/]/)
            .map((part) => part.trim())
            .filter((part) => part.length >= 2);
          acceptableAnswers = Array.from(new Set([correctAnswer, ...splitMeanings]));
          break;
        }
        case 'vi_to_en': {
          prompt = meaning;
          promptSubtext = [
            v.partOfSpeech !== 'other' ? v.partOfSpeech : '',
            v.cefrLevel !== 'unknown' ? v.cefrLevel : '',
          ]
            .filter(Boolean)
            .join(' • ');
          hint = `Gợi ý: bắt đầu bằng "${v.word.slice(0, 1)}" (${v.word.length} ký tự)`;
          correctAnswer = v.word;
          const distractors = buildWordDistractors(v, 3);
          options = deterministicSort(
            [correctAnswer, ...distractors],
            `opt:vi_to_en:${v.id}`,
            (s) => s,
          );
          acceptableAnswers = [v.word, v.normalizedWord];
          break;
        }
        case 'flashcard': {
          prompt = v.word;
          promptSubtext = v.ipa;
          correctAnswer = meaning;
          options = [];
          acceptableAnswers = [meaning];
          break;
        }
        case 'fill_in_blank': {
          if (exampleSentence) {
            prompt = clozeSentence(exampleSentence, v.word, ex?.highlightText ?? '');
            promptSubtext = exampleTranslation || meaning;
          } else {
            prompt = `Từ nào mang nghĩa "${meaning}"? (______)`;
            promptSubtext = v.englishDefinition;
          }
          hint = v.ipa || `${v.word.slice(0, 1)}...`;
          correctAnswer = v.word;
          const distractors = buildWordDistractors(v, 3);
          options = deterministicSort(
            [correctAnswer, ...distractors],
            `opt:fib:${v.id}`,
            (s) => s,
          );
          acceptableAnswers = [v.word, v.normalizedWord];
          break;
        }
        case 'context_recognition': {
          if (exampleSentence) {
            prompt = clozeSentence(exampleSentence, v.word, ex?.highlightText ?? '');
            promptSubtext = v.usageContext || exampleTranslation || meaning;
          } else {
            prompt = v.usageContext
              ? `Ngữ cảnh: ${v.usageContext} — Chọn từ phù hợp:`
              : `Chọn từ phù hợp với mô tả: "${v.englishDefinition || meaning}"`;
            promptSubtext = meaning;
          }
          correctAnswer = v.word;
          const distractors = buildWordDistractors(v, 3);
          options = deterministicSort(
            [correctAnswer, ...distractors],
            `opt:ctx:${v.id}`,
            (s) => s,
          );
          acceptableAnswers = [v.word, v.normalizedWord];
          break;
        }
        case 'spelling': {
          prompt = meaning;
          promptSubtext = v.ipa || v.englishDefinition;
          hint = `${v.word.length} ký tự • bắt đầu bằng "${v.word.slice(0, 1)}"`;
          correctAnswer = v.word;
          options = [];
          acceptableAnswers = [v.word, v.normalizedWord];
          break;
        }
        case 'collocation_match': {
          if (collocationPhrase) {
            const wordPresent = new RegExp(escapeRegExp(v.word), 'i').test(
              collocationPhrase,
            );
            if (wordPresent) {
              prompt = `Hoàn thành collocation: "${clozeSentence(collocationPhrase, v.word, '')}"`;
              promptSubtext = collocationMeaning || meaning;
              correctAnswer = v.word;
              const distractors = buildWordDistractors(v, 3);
              options = deterministicSort(
                [correctAnswer, ...distractors],
                `opt:col:${v.id}`,
                (s) => s,
              );
              acceptableAnswers = [v.word, v.normalizedWord];
            } else {
              prompt = `Chọn collocation tự nhiên đi với "${v.word}" (${meaning}):`;
              promptSubtext = collocationMeaning;
              correctAnswer = collocationPhrase;
              const otherColls = deterministicSort(
                allCollocations.filter(
                  (oc) =>
                    oc.vocabularyId !== v.id &&
                    normalizeWord(oc.phrase) !== normalizeWord(collocationPhrase),
                ),
                `col_dist:${v.id}`,
                (cItem) => cItem.id,
              )
                .slice(0, 3)
                .map((oc) => oc.phrase);
              options = deterministicSort(
                [correctAnswer, ...otherColls],
                `opt:colp:${v.id}`,
                (s) => s,
              );
              acceptableAnswers = [collocationPhrase];
            }
          } else {
            prompt = `Chọn nghĩa hoặc từ phù hợp với "${v.word}":`;
            promptSubtext = v.ipa;
            correctAnswer = meaning;
            const distractors = buildMeaningDistractors(v, correctAnswer, 3);
            options = deterministicSort(
              [correctAnswer, ...distractors],
              `opt:col_fb:${v.id}`,
              (s) => s,
            );
            acceptableAnswers = [meaning];
          }
          break;
        }
        case 'sentence_production': {
          prompt = `${v.word} (${meaning})`;
          promptSubtext =
            v.whenToUse ||
            v.usageContext ||
            v.englishDefinition ||
            'Hãy tự đặt 1 câu tiếng Anh sử dụng từ này và tự đối chiếu với câu tham khảo.';
          hint = v.vnWrongCombinations || v.vnCommonMistakes;
          correctAnswer = exampleSentence || col?.exampleSentence || v.word;
          options = [];
          acceptableAnswers = [];
          break;
        }
      }

      return {
        vocabularyId: v.id,
        word: v.word,
        ipa: v.ipa,
        partOfSpeech: v.partOfSpeech,
        cefrLevel: v.cefrLevel,
        vietnameseMeaning: v.vietnameseMeaning,
        englishDefinition: v.englishDefinition,
        mode: parsed.mode,
        direction,
        prompt,
        promptSubtext,
        hint,
        options,
        correctAnswer,
        acceptableAnswers,
        exampleSentence,
        exampleTranslation,
        collocationPhrase,
        collocationMeaning,
        explanationVi,
      };
    });

    return c.json(quizItems);
  });

  // Practice Sessions & Attempts
  app.post('/practice/sessions', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = practiceSessionCreateSchema.parse(body);

    const [created] = await db
      .insert(practiceSessions)
      .values({
        userId,
        domain: parsed.domain,
        mode: normalizeUnicode(parsed.mode),
        title: normalizeUnicode(parsed.title),
        totalItems: parsed.totalItems,
      })
      .returning();

    return c.json(serializePracticeSession(created), 201);
  });

  app.post('/practice/sessions/:id/attempts', async (c) => {
    const sessionId = c.req.param('id');
    if (!isUuid(sessionId)) {
      return c.json({ error: 'Không tìm thấy phiên luyện tập' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(
        and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)),
      )
      .limit(1);

    if (!session) {
      return c.json({ error: 'Không tìm thấy phiên luyện tập' }, 404);
    }

    const body = await c.req.json();
    const parsed = practiceAttemptCreateSchema.parse(body);
    const now = new Date();

    const inferredDirection =
      parsed.direction ??
      (parsed.vocabularyId ? inferDirectionFromMode(parsed.mode) : null);

    const [attempt] = await db
      .insert(practiceAttempts)
      .values({
        practiceSessionId: sessionId,
        userId,
        vocabularyId: parsed.vocabularyId ?? null,
        grammarTopicId: parsed.grammarTopicId ?? null,
        questionId: parsed.questionId ?? null,
        mode: normalizeUnicode(parsed.mode),
        direction: inferredDirection,
        userAnswer: normalizeUnicode(parsed.userAnswer),
        expectedAnswer: normalizeUnicode(parsed.expectedAnswer),
        isCorrect: parsed.isCorrect,
        selfRating: parsed.selfRating ?? null,
        responseTimeMs: parsed.responseTimeMs,
      })
      .returning();

    await db
      .update(practiceSessions)
      .set({
        completedItems: sql`${practiceSessions.completedItems} + 1`,
        correctCount: sql`${practiceSessions.correctCount} + ${parsed.isCorrect ? 1 : 0}`,
      })
      .where(eq(practiceSessions.id, sessionId));

    let updatedVocabReviewState: ReviewStateDto | null = null;
    if (parsed.vocabularyId) {
      const dir: SkillDirection = inferredDirection ?? 'en_to_vi';
      await ensureVocabularyReviewStates(db, userId, parsed.vocabularyId);

      let [currentState] = await db
        .select()
        .from(vocabularyReviewStates)
        .where(
          and(
            eq(vocabularyReviewStates.userId, userId),
            eq(vocabularyReviewStates.vocabularyId, parsed.vocabularyId),
            eq(vocabularyReviewStates.skillDirection, dir),
          ),
        )
        .limit(1);

      if (!currentState) {
        [currentState] = await db
          .insert(vocabularyReviewStates)
          .values({
            userId,
            vocabularyId: parsed.vocabularyId,
            skillDirection: dir,
            status: 'new',
            easeFactor: 2.5,
            intervalDays: 0,
            repetitions: 0,
            lapses: 0,
            nextReviewAt: now,
          })
          .returning();
      }

      const rating = (parsed.selfRating ?? (parsed.isCorrect ? 3 : 1)) as Sm2Rating;
      const sm2 = calculateSm2(
        {
          easeFactor: currentState.easeFactor,
          intervalDays: currentState.intervalDays,
          repetitions: currentState.repetitions,
          lapses: currentState.lapses,
          status: currentState.status,
        },
        rating,
        now,
      );

      const [updatedState] = await db
        .update(vocabularyReviewStates)
        .set({
          easeFactor: sm2.easeFactor,
          intervalDays: sm2.intervalDays,
          repetitions: sm2.repetitions,
          lapses: sm2.lapses,
          status: sm2.status,
          lastRating: sm2.lastRating,
          lastReviewedAt: sm2.lastReviewedAt,
          nextReviewAt: sm2.nextReviewAt,
        })
        .where(eq(vocabularyReviewStates.id, currentState.id))
        .returning();

      await syncWordMasteryStatus(db, userId, parsed.vocabularyId);
      updatedVocabReviewState = serializeVocabReviewState(updatedState);
    }

    let updatedGrammarReviewState: GrammarReviewStateDto | null = null;
    if (parsed.grammarTopicId) {
      await ensureGrammarReviewState(db, userId, parsed.grammarTopicId);
      const [currentGrammar] = await db
        .select()
        .from(grammarReviewStates)
        .where(
          and(
            eq(grammarReviewStates.userId, userId),
            eq(grammarReviewStates.grammarTopicId, parsed.grammarTopicId),
          ),
        )
        .limit(1);

      if (currentGrammar) {
        const rating = (parsed.selfRating ?? (parsed.isCorrect ? 3 : 1)) as Sm2Rating;
        const sm2 = calculateSm2(
          {
            easeFactor: currentGrammar.easeFactor,
            intervalDays: currentGrammar.intervalDays,
            repetitions: currentGrammar.repetitions,
            lapses: currentGrammar.lapses,
            status: currentGrammar.status,
          },
          rating,
          now,
        );

        const [accRow] = await db
          .select({
            total: sql<number>`count(*)::int`,
            correct: sql<number>`sum(case when ${practiceAttempts.isCorrect} then 1 else 0 end)::int`,
          })
          .from(practiceAttempts)
          .where(
            and(
              eq(practiceAttempts.userId, userId),
              eq(practiceAttempts.grammarTopicId, parsed.grammarTopicId),
            ),
          );

        const totalAtt = Number(accRow?.total ?? 0);
        const correctAtt = Number(accRow?.correct ?? 0);
        const accuracyRate =
          totalAtt > 0 ? Math.round((correctAtt / totalAtt) * 1000) / 1000 : 0;

        const [updatedGrammar] = await db
          .update(grammarReviewStates)
          .set({
            easeFactor: sm2.easeFactor,
            intervalDays: sm2.intervalDays,
            repetitions: sm2.repetitions,
            lapses: sm2.lapses,
            status: sm2.status,
            accuracyRate,
            lastReviewedAt: sm2.lastReviewedAt,
            nextReviewAt: sm2.nextReviewAt,
          })
          .where(eq(grammarReviewStates.id, currentGrammar.id))
          .returning();

        updatedGrammarReviewState = serializeGrammarReviewState(updatedGrammar);
      }
    }

    let savedMistake: MistakeDto | null = null;
    if (parsed.saveMistake) {
      const [createdMistake] = await db
        .insert(learningMistakes)
        .values({
          userId,
          category: parsed.saveMistake.category,
          vocabularyId: parsed.vocabularyId ?? null,
          grammarTopicId: parsed.grammarTopicId ?? null,
          practiceAttemptId: attempt.id,
          originalInput: normalizeUnicode(parsed.userAnswer) || '(Bỏ trống)',
          correctedVersion: normalizeUnicode(parsed.expectedAnswer) || '(Xem đáp án)',
          explanationVi: normalizeUnicode(parsed.saveMistake.explanationVi),
          correctedExample: normalizeUnicode(parsed.saveMistake.correctedExample),
          sourceContext: normalizeUnicode(parsed.saveMistake.sourceContext),
          status: 'active',
        })
        .returning();

      let vocabWord: string | null = null;
      if (createdMistake.vocabularyId) {
        const [v] = await db
          .select({ word: vocabulary.word })
          .from(vocabulary)
          .where(eq(vocabulary.id, createdMistake.vocabularyId))
          .limit(1);
        vocabWord = v?.word ?? null;
      }

      let topicTitle: string | null = null;
      if (createdMistake.grammarTopicId) {
        const [gt] = await db
          .select({ title: grammarTopics.title })
          .from(grammarTopics)
          .where(eq(grammarTopics.id, createdMistake.grammarTopicId))
          .limit(1);
        topicTitle = gt?.title ?? null;
      }

      savedMistake = {
        id: createdMistake.id,
        category: createdMistake.category,
        categoryLabel: MISTAKE_CATEGORY_LABELS[createdMistake.category],
        vocabularyId: createdMistake.vocabularyId,
        vocabularyWord: vocabWord,
        grammarTopicId: createdMistake.grammarTopicId,
        grammarTopicTitle: topicTitle,
        practiceAttemptId: createdMistake.practiceAttemptId,
        originalInput: createdMistake.originalInput,
        correctedVersion: createdMistake.correctedVersion,
        explanationVi: createdMistake.explanationVi,
        correctedExample: createdMistake.correctedExample,
        sourceContext: createdMistake.sourceContext,
        status: createdMistake.status,
        reviewCount: createdMistake.reviewCount,
        lastReviewedAt: null,
        createdAt: createdMistake.createdAt.toISOString(),
        updatedAt: createdMistake.updatedAt.toISOString(),
      };
    }

    await recordDailyActivity(db, userId, {
      vocabReviewedCount: parsed.vocabularyId ? 1 : 0,
      grammarReviewedCount: parsed.grammarTopicId ? 1 : 0,
      exercisesCompletedCount: 1,
      exercisesCorrectCount: parsed.isCorrect ? 1 : 0,
      studySeconds: Math.round(parsed.responseTimeMs / 1000),
    });

    const response: PracticeAttemptResponseDto = {
      attempt: {
        id: attempt.id,
        practiceSessionId: attempt.practiceSessionId,
        vocabularyId: attempt.vocabularyId,
        grammarTopicId: attempt.grammarTopicId,
        questionId: attempt.questionId,
        mode: attempt.mode,
        direction: attempt.direction,
        userAnswer: attempt.userAnswer,
        expectedAnswer: attempt.expectedAnswer,
        isCorrect: attempt.isCorrect,
        selfRating: attempt.selfRating,
        responseTimeMs: attempt.responseTimeMs,
        createdAt: attempt.createdAt.toISOString(),
      },
      updatedVocabReviewState,
      updatedGrammarReviewState,
      savedMistake,
    };

    return c.json(response, 201);
  });

  app.post('/practice/sessions/:id/complete', async (c) => {
    const sessionId = c.req.param('id');
    if (!isUuid(sessionId)) {
      return c.json({ error: 'Không tìm thấy phiên luyện tập' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(practiceSessions)
      .where(
        and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy phiên luyện tập' }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const parsed = practiceSessionCompleteSchema.parse(body);

    const [updated] = await db
      .update(practiceSessions)
      .set({
        completedAt: existing.completedAt ?? new Date(),
        ...(parsed.durationSeconds !== undefined
          ? { durationSeconds: parsed.durationSeconds }
          : {}),
        ...(parsed.completedItems !== undefined
          ? { completedItems: parsed.completedItems }
          : {}),
        ...(parsed.correctCount !== undefined
          ? { correctCount: parsed.correctCount }
          : {}),
      })
      .where(eq(practiceSessions.id, sessionId))
      .returning();

    if (parsed.durationSeconds && parsed.durationSeconds > 0 && !existing.completedAt) {
      const [attemptTime] = await db
        .select({
          totalMs: sql<number>`coalesce(sum(${practiceAttempts.responseTimeMs}), 0)::int`,
        })
        .from(practiceAttempts)
        .where(eq(practiceAttempts.practiceSessionId, sessionId));
      const recordedSeconds = Math.round(Number(attemptTime?.totalMs ?? 0) / 1000);
      const extraSeconds = Math.max(0, parsed.durationSeconds - recordedSeconds);
      if (extraSeconds > 0) {
        await recordDailyActivity(db, userId, { studySeconds: extraSeconds });
      }
    }

    return c.json(serializePracticeSession(updated));
  });

  app.get('/practice/history', async (c) => {
    const userId = await getDefaultUserId(db);
    const rows = await db
      .select()
      .from(practiceSessions)
      .where(eq(practiceSessions.userId, userId))
      .orderBy(desc(practiceSessions.startedAt))
      .limit(50);

    const history: PracticeHistoryItemDto[] = rows.map((row) => {
      const denom = row.completedItems > 0 ? row.completedItems : row.totalItems;
      const accuracyPercent =
        denom > 0 ? Math.round((row.correctCount / denom) * 100) : 0;
      return {
        ...serializePracticeSession(row),
        accuracyPercent,
      };
    });

    return c.json(history);
  });

  return app;
}
