import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import type { AppDatabase } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  grammarCategories,
  grammarComparisons,
  grammarExamples,
  grammarTopics,
  learningSessions,
  sessionGrammar,
  sessionVocabulary,
  vocabulary,
  vocabularyExamples,
  vocabularyReviewStates,
} from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import {
  ensureGrammarReviewState,
  ensureVocabularyReviewStates,
  recordDailyActivity,
} from '../lib/helpers.js';
import {
  SESSION_SOURCES,
  createSessionSchema,
  grammarTopicInputSchema,
  normalizeUnicode,
  normalizeWord,
  quickAddVocabularySchema,
  slugify,
  updateSessionSchema,
} from '../../shared/schemas.js';
import type {
  BulkSessionVocabResponseDto,
  ReviewStateDto,
  SessionCompletionPreviewDto,
  SessionDetailDto,
  SessionGrammarItemDto,
  SessionSummaryDto,
  SessionVocabularyItemDto,
  VocabularyExampleDto,
} from '../../shared/apiTypes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

async function withTransaction<T>(
  db: AppDatabase,
  fn: (tx: AppDatabase) => Promise<T>,
): Promise<T> {
  return (db as NodePgDatabase<typeof schema>).transaction((tx) =>
    fn(tx as unknown as AppDatabase),
  );
}

function serializeExample(row: typeof vocabularyExamples.$inferSelect): VocabularyExampleDto {
  return {
    id: row.id,
    vocabularyId: row.vocabularyId,
    englishSentence: row.englishSentence,
    vietnameseTranslation: row.vietnameseTranslation,
    highlightText: row.highlightText,
    sortOrder: row.sortOrder,
  };
}

function serializeReviewState(row: typeof vocabularyReviewStates.$inferSelect): ReviewStateDto {
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

async function ensureUniqueGrammarSlug(
  db: AppDatabase,
  userId: string,
  title: string,
): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await db
      .select({ id: grammarTopics.id })
      .from(grammarTopics)
      .where(and(eq(grammarTopics.userId, userId), eq(grammarTopics.slug, candidate)))
      .limit(1);
    if (!existing[0]) {
      return candidate;
    }
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

export async function buildSessionDetail(
  db: AppDatabase,
  userId: string,
  sessionId: string,
): Promise<SessionDetailDto | null> {
  const [session] = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
    .limit(1);

  if (!session) {
    return null;
  }

  const vocabLinks = await db
    .select({
      link: sessionVocabulary,
      vocab: vocabulary,
    })
    .from(sessionVocabulary)
    .innerJoin(vocabulary, eq(sessionVocabulary.vocabularyId, vocabulary.id))
    .where(eq(sessionVocabulary.sessionId, session.id))
    .orderBy(asc(sessionVocabulary.createdAt));

  const vocabIds = vocabLinks.map((row) => row.vocab.id);

  const examplesByVocab = new Map<string, VocabularyExampleDto[]>();
  const statesByVocab = new Map<string, ReviewStateDto[]>();

  if (vocabIds.length > 0) {
    const [exampleRows, stateRows] = await Promise.all([
      db
        .select()
        .from(vocabularyExamples)
        .where(inArray(vocabularyExamples.vocabularyId, vocabIds))
        .orderBy(asc(vocabularyExamples.sortOrder)),
      db
        .select()
        .from(vocabularyReviewStates)
        .where(
          and(
            eq(vocabularyReviewStates.userId, userId),
            inArray(vocabularyReviewStates.vocabularyId, vocabIds),
          ),
        ),
    ]);

    for (const ex of exampleRows) {
      const list = examplesByVocab.get(ex.vocabularyId) ?? [];
      list.push(serializeExample(ex));
      examplesByVocab.set(ex.vocabularyId, list);
    }

    for (const st of stateRows) {
      const list = statesByVocab.get(st.vocabularyId) ?? [];
      list.push(serializeReviewState(st));
      statesByVocab.set(st.vocabularyId, list);
    }
  }

  const vocabItems: SessionVocabularyItemDto[] = vocabLinks.map(({ link, vocab }) => ({
    sessionLinkId: link.id,
    vocabularyId: vocab.id,
    word: vocab.word,
    normalizedWord: vocab.normalizedWord,
    ipa: vocab.ipa,
    partOfSpeech: vocab.partOfSpeech,
    cefrLevel: vocab.cefrLevel,
    vietnameseMeaning: vocab.vietnameseMeaning,
    englishDefinition: vocab.englishDefinition,
    status: vocab.status,
    confidenceLevel: vocab.confidenceLevel,
    isIncomplete: vocab.isIncomplete,
    addedVia: link.addedVia,
    sessionNote: link.sessionNote,
    createdAt: link.createdAt.toISOString(),
    examples: examplesByVocab.get(vocab.id) ?? [],
    reviewStates: statesByVocab.get(vocab.id) ?? [],
  }));

  const grammarLinks = await db
    .select({
      link: sessionGrammar,
      topic: grammarTopics,
      categoryName: grammarCategories.name,
      categoryNameVi: grammarCategories.nameVi,
    })
    .from(sessionGrammar)
    .innerJoin(grammarTopics, eq(sessionGrammar.topicId, grammarTopics.id))
    .innerJoin(grammarCategories, eq(grammarTopics.categoryId, grammarCategories.id))
    .where(eq(sessionGrammar.sessionId, session.id))
    .orderBy(asc(sessionGrammar.createdAt));

  const grammarItems: SessionGrammarItemDto[] = grammarLinks.map(
    ({ link, topic, categoryName, categoryNameVi }) => ({
      sessionLinkId: link.id,
      topicId: topic.id,
      title: topic.title,
      titleVi: topic.titleVi,
      categoryId: topic.categoryId,
      categoryName,
      categoryNameVi,
      difficulty: topic.difficulty,
      cefrLevel: topic.cefrLevel,
      learningStatus: topic.learningStatus,
      formula: topic.formula,
      explanationVi: topic.explanationVi,
      sessionNote: link.sessionNote,
    }),
  );

  return {
    id: session.id,
    title: session.title,
    learningDate: session.learningDate,
    sourceType: session.sourceType,
    learningType: session.learningType,
    generalNotes: session.generalNotes,
    status: session.status,
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    vocabCount: vocabItems.length,
    grammarCount: grammarItems.length,
    vocabulary: vocabItems,
    grammarTopics: grammarItems,
  };
}

const sessionQuickAddBodySchema = quickAddVocabularySchema.extend({
  vocabularyId: z.string().uuid().optional(),
  addedVia: z.enum(['quick_add', 'bulk_paste', 'import', 'existing']).optional(),
});

const bulkSessionVocabSchema = z.object({
  rows: z
    .array(
      z.object({
        word: z.string().trim().min(1, 'Từ tiếng Anh không được để trống'),
        vietnameseMeaning: z.string().default(''),
        ipa: z.string().default(''),
        exampleSentence: z.string().default(''),
        exampleTranslation: z.string().default(''),
      }),
    )
    .max(500, 'Tối đa 500 dòng mỗi lần thêm hàng loạt'),
  addedVia: z.enum(['bulk_paste', 'import']).default('bulk_paste'),
  duplicateStrategy: z.enum(['link_existing', 'merge', 'skip']).default('link_existing'),
});

const linkGrammarSchema = z.union([
  z.object({
    existingTopicId: z.string().uuid('ID chủ điểm ngữ pháp không hợp lệ'),
    sessionNote: z.string().default(''),
  }),
  z.object({
    newTopic: grammarTopicInputSchema,
    sessionNote: z.string().default(''),
  }),
]);

export function createSessionsRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get('/sessions', async (c) => {
    const userId = await getDefaultUserId(db);
    const search = normalizeUnicode(c.req.query('search') ?? '');
    const statusParam = c.req.query('status');
    const sourceTypeParam = c.req.query('sourceType');

    const conditions = [eq(learningSessions.userId, userId)];

    if (statusParam === 'draft' || statusParam === 'completed') {
      conditions.push(eq(learningSessions.status, statusParam));
    }
    if (
      sourceTypeParam &&
      (SESSION_SOURCES as readonly string[]).includes(sourceTypeParam)
    ) {
      conditions.push(
        eq(
          learningSessions.sourceType,
          sourceTypeParam as (typeof SESSION_SOURCES)[number],
        ),
      );
    }
    if (search) {
      const pattern = `%${search}%`;
      const searchCond = or(
        ilike(learningSessions.title, pattern),
        ilike(learningSessions.learningType, pattern),
        ilike(learningSessions.generalNotes, pattern),
      );
      if (searchCond) conditions.push(searchCond);
    }

    const sessions = await db
      .select()
      .from(learningSessions)
      .where(and(...conditions))
      .orderBy(desc(learningSessions.learningDate), desc(learningSessions.createdAt));

    if (sessions.length === 0) {
      return c.json([]);
    }

    const sessionIds = sessions.map((s) => s.id);
    const [vocabCounts, grammarCounts] = await Promise.all([
      db
        .select({
          sessionId: sessionVocabulary.sessionId,
          count: sql<number>`count(*)::int`,
        })
        .from(sessionVocabulary)
        .where(inArray(sessionVocabulary.sessionId, sessionIds))
        .groupBy(sessionVocabulary.sessionId),
      db
        .select({
          sessionId: sessionGrammar.sessionId,
          count: sql<number>`count(*)::int`,
        })
        .from(sessionGrammar)
        .where(inArray(sessionGrammar.sessionId, sessionIds))
        .groupBy(sessionGrammar.sessionId),
    ]);

    const vocabCountMap = new Map(vocabCounts.map((r) => [r.sessionId, Number(r.count)]));
    const grammarCountMap = new Map(grammarCounts.map((r) => [r.sessionId, Number(r.count)]));

    const result: SessionSummaryDto[] = sessions.map((s) => ({
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
      vocabCount: vocabCountMap.get(s.id) ?? 0,
      grammarCount: grammarCountMap.get(s.id) ?? 0,
    }));

    return c.json(result);
  });

  app.post('/sessions', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = createSessionSchema.parse(body);

    const [created] = await db
      .insert(learningSessions)
      .values({
        userId,
        title: normalizeUnicode(parsed.title),
        learningDate: parsed.learningDate,
        sourceType: parsed.sourceType,
        learningType: normalizeUnicode(parsed.learningType),
        generalNotes: normalizeUnicode(parsed.generalNotes),
        status: 'draft',
      })
      .returning();

    const detail = await buildSessionDetail(db, userId, created.id);
    return c.json(detail, 201);
  });

  app.get('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const detail = await buildSessionDetail(db, userId, id);
    if (!detail) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }
    return c.json(detail);
  });

  app.patch('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = updateSessionSchema.parse(body);

    const [existing] = await db
      .select()
      .from(learningSessions)
      .where(and(eq(learningSessions.id, id), eq(learningSessions.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    await db
      .update(learningSessions)
      .set({
        ...(parsed.title !== undefined ? { title: normalizeUnicode(parsed.title) } : {}),
        ...(parsed.learningDate !== undefined ? { learningDate: parsed.learningDate } : {}),
        ...(parsed.sourceType !== undefined ? { sourceType: parsed.sourceType } : {}),
        ...(parsed.learningType !== undefined
          ? { learningType: normalizeUnicode(parsed.learningType) }
          : {}),
        ...(parsed.generalNotes !== undefined
          ? { generalNotes: normalizeUnicode(parsed.generalNotes) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(learningSessions.id, id));

    const detail = await buildSessionDetail(db, userId, id);
    return c.json(detail);
  });

  app.delete('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(learningSessions)
      .where(and(eq(learningSessions.id, id), eq(learningSessions.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  app.post('/sessions/:id/vocabulary', async (c) => {
    const sessionId = c.req.param('id');
    if (!isUuid(sessionId)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [session] = await db
      .select()
      .from(learningSessions)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const rawBody = await c.req.json();

    // Allow linking an existing vocabulary item by vocabularyId alone
    let parsedInput: z.infer<typeof sessionQuickAddBodySchema>;
    if (
      rawBody &&
      typeof rawBody === 'object' &&
      isUuid(rawBody.vocabularyId) &&
      !rawBody.word
    ) {
      const [foundById] = await db
        .select()
        .from(vocabulary)
        .where(
          and(eq(vocabulary.id, rawBody.vocabularyId), eq(vocabulary.userId, userId)),
        )
        .limit(1);

      if (!foundById) {
        return c.json({ error: 'Không tìm thấy từ vựng cần liên kết' }, 404);
      }

      parsedInput = sessionQuickAddBodySchema.parse({
        ...rawBody,
        word: foundById.word,
        addedVia: rawBody.addedVia ?? 'existing',
      });
    } else {
      parsedInput = sessionQuickAddBodySchema.parse(rawBody);
    }

    const cleanWord = normalizeUnicode(parsedInput.word);
    const normWord = normalizeWord(cleanWord);
    const cleanMeaning = normalizeUnicode(parsedInput.vietnameseMeaning);
    const cleanIpa = normalizeUnicode(parsedInput.ipa);
    const cleanDef = normalizeUnicode(parsedInput.englishDefinition);
    const cleanExample = normalizeUnicode(parsedInput.exampleSentence);
    const cleanExampleTrans = normalizeUnicode(parsedInput.exampleTranslation);
    const cleanSessionNote = normalizeUnicode(parsedInput.sessionNote);

    let existingVocab: typeof vocabulary.$inferSelect | undefined;

    if (parsedInput.vocabularyId) {
      const [byId] = await db
        .select()
        .from(vocabulary)
        .where(
          and(
            eq(vocabulary.id, parsedInput.vocabularyId),
            eq(vocabulary.userId, userId),
          ),
        )
        .limit(1);
      existingVocab = byId;
    }

    if (!existingVocab) {
      const [byNorm] = await db
        .select()
        .from(vocabulary)
        .where(
          and(eq(vocabulary.userId, userId), eq(vocabulary.normalizedWord, normWord)),
        )
        .limit(1);
      existingVocab = byNorm;
    }

    let vocabId: string;
    const isExisting = Boolean(existingVocab);

    if (!existingVocab) {
      const isIncomplete = !cleanMeaning.trim() && !cleanDef.trim();
      const [inserted] = await db
        .insert(vocabulary)
        .values({
          userId,
          word: cleanWord,
          normalizedWord: normWord,
          ipa: cleanIpa,
          partOfSpeech: parsedInput.partOfSpeech || 'other',
          cefrLevel: parsedInput.cefrLevel,
          englishDefinition: cleanDef,
          vietnameseMeaning: cleanMeaning,
          source: session.title,
          isIncomplete,
          status: 'new',
        })
        .returning();

      vocabId = inserted.id;

      if (cleanExample) {
        await db.insert(vocabularyExamples).values({
          vocabularyId: vocabId,
          englishSentence: cleanExample,
          vietnameseTranslation: cleanExampleTrans,
          highlightText: cleanWord,
          sortOrder: 0,
        });
      }
    } else {
      vocabId = existingVocab.id;
      const explicitInlineUpdate = Boolean(parsedInput.vocabularyId);

      const nextMeaning =
        explicitInlineUpdate && cleanMeaning
          ? cleanMeaning
          : !existingVocab.vietnameseMeaning.trim() && cleanMeaning
            ? cleanMeaning
            : existingVocab.vietnameseMeaning;

      const nextDef =
        explicitInlineUpdate && cleanDef
          ? cleanDef
          : !existingVocab.englishDefinition.trim() && cleanDef
            ? cleanDef
            : existingVocab.englishDefinition;

      const nextIpa =
        explicitInlineUpdate && cleanIpa
          ? cleanIpa
          : !existingVocab.ipa.trim() && cleanIpa
            ? cleanIpa
            : existingVocab.ipa;

      const nextPos =
        explicitInlineUpdate && parsedInput.partOfSpeech && parsedInput.partOfSpeech !== 'other'
          ? parsedInput.partOfSpeech
          : existingVocab.partOfSpeech === 'other' && parsedInput.partOfSpeech !== 'other'
            ? parsedInput.partOfSpeech
            : existingVocab.partOfSpeech;

      const nextCefr =
        explicitInlineUpdate && parsedInput.cefrLevel !== 'unknown'
          ? parsedInput.cefrLevel
          : existingVocab.cefrLevel === 'unknown' && parsedInput.cefrLevel !== 'unknown'
            ? parsedInput.cefrLevel
            : existingVocab.cefrLevel;

      const nextIsIncomplete = !nextMeaning.trim() && !nextDef.trim();

      await db
        .update(vocabulary)
        .set({
          vietnameseMeaning: nextMeaning,
          englishDefinition: nextDef,
          ipa: nextIpa,
          partOfSpeech: nextPos,
          cefrLevel: nextCefr,
          isIncomplete: nextIsIncomplete,
          updatedAt: new Date(),
        })
        .where(eq(vocabulary.id, vocabId));

      if (cleanExample) {
        const existingEx = await db
          .select({ englishSentence: vocabularyExamples.englishSentence })
          .from(vocabularyExamples)
          .where(eq(vocabularyExamples.vocabularyId, vocabId));
        const hasSame = existingEx.some(
          (ex) => normalizeWord(ex.englishSentence) === normalizeWord(cleanExample),
        );
        if (!hasSame) {
          await db.insert(vocabularyExamples).values({
            vocabularyId: vocabId,
            englishSentence: cleanExample,
            vietnameseTranslation: cleanExampleTrans,
            highlightText: existingVocab.word,
            sortOrder: existingEx.length,
          });
        }
      }
    }

    const addedVia =
      parsedInput.addedVia ?? (isExisting ? 'existing' : 'quick_add');

    await db
      .insert(sessionVocabulary)
      .values({
        sessionId,
        vocabularyId: vocabId,
        addedVia,
        sessionNote: cleanSessionNote,
      })
      .onConflictDoNothing({
        target: [sessionVocabulary.sessionId, sessionVocabulary.vocabularyId],
      });

    if (cleanSessionNote) {
      await db
        .update(sessionVocabulary)
        .set({ sessionNote: cleanSessionNote })
        .where(
          and(
            eq(sessionVocabulary.sessionId, sessionId),
            eq(sessionVocabulary.vocabularyId, vocabId),
          ),
        );
    }

    await db
      .update(learningSessions)
      .set({ updatedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));

    const detail = await buildSessionDetail(db, userId, sessionId);
    const item = detail?.vocabulary.find((v) => v.vocabularyId === vocabId) ?? null;

    return c.json({ item, isExisting, vocabularyId: vocabId, session: detail }, 201);
  });

  app.post('/sessions/:id/vocabulary/bulk', async (c) => {
    const sessionId = c.req.param('id');
    if (!isUuid(sessionId)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [session] = await db
      .select()
      .from(learningSessions)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const body = await c.req.json();
    const parsed = bulkSessionVocabSchema.parse(body);

    const uniqueRows: Array<{
      word: string;
      normalizedWord: string;
      vietnameseMeaning: string;
      ipa: string;
      exampleSentence: string;
      exampleTranslation: string;
    }> = [];
    const seenBatch = new Set<string>();
    let skippedCount = 0;

    for (const row of parsed.rows) {
      const cleanWord = normalizeUnicode(row.word);
      const norm = normalizeWord(cleanWord);
      if (!norm) {
        skippedCount += 1;
        continue;
      }
      if (seenBatch.has(norm)) {
        skippedCount += 1;
        continue;
      }
      seenBatch.add(norm);
      uniqueRows.push({
        word: cleanWord,
        normalizedWord: norm,
        vietnameseMeaning: normalizeUnicode(row.vietnameseMeaning),
        ipa: normalizeUnicode(row.ipa),
        exampleSentence: normalizeUnicode(row.exampleSentence),
        exampleTranslation: normalizeUnicode(row.exampleTranslation),
      });
    }

    const normalizedList = uniqueRows.map((r) => r.normalizedWord);
    const existingGlobal =
      normalizedList.length > 0
        ? await db
            .select()
            .from(vocabulary)
            .where(
              and(
                eq(vocabulary.userId, userId),
                inArray(vocabulary.normalizedWord, normalizedList),
              ),
            )
        : [];

    const existingByNorm = new Map(existingGlobal.map((v) => [v.normalizedWord, v]));

    const existingSessionLinks = await db
      .select({ vocabularyId: sessionVocabulary.vocabularyId })
      .from(sessionVocabulary)
      .where(eq(sessionVocabulary.sessionId, sessionId));
    const linkedSet = new Set(existingSessionLinks.map((l) => l.vocabularyId));

    let addedCount = 0;
    let linkedExistingCount = 0;
    const processedVocabIds: string[] = [];

    for (const row of uniqueRows) {
      const found = existingByNorm.get(row.normalizedWord);
      if (!found) {
        const isIncomplete = !row.vietnameseMeaning.trim();
        const [inserted] = await db
          .insert(vocabulary)
          .values({
            userId,
            word: row.word,
            normalizedWord: row.normalizedWord,
            ipa: row.ipa,
            vietnameseMeaning: row.vietnameseMeaning,
            source: session.title,
            isIncomplete,
            status: 'new',
          })
          .returning();

        if (row.exampleSentence) {
          await db.insert(vocabularyExamples).values({
            vocabularyId: inserted.id,
            englishSentence: row.exampleSentence,
            vietnameseTranslation: row.exampleTranslation,
            highlightText: row.word,
            sortOrder: 0,
          });
        }

        await db
          .insert(sessionVocabulary)
          .values({
            sessionId,
            vocabularyId: inserted.id,
            addedVia: parsed.addedVia,
            sessionNote: '',
          })
          .onConflictDoNothing({
            target: [sessionVocabulary.sessionId, sessionVocabulary.vocabularyId],
          });

        linkedSet.add(inserted.id);
        processedVocabIds.push(inserted.id);
        addedCount += 1;
        continue;
      }

      if (parsed.duplicateStrategy === 'skip') {
        skippedCount += 1;
        continue;
      }

      if (parsed.duplicateStrategy === 'merge') {
        const nextMeaning =
          !found.vietnameseMeaning.trim() && row.vietnameseMeaning
            ? row.vietnameseMeaning
            : found.vietnameseMeaning;
        const nextIpa = !found.ipa.trim() && row.ipa ? row.ipa : found.ipa;
        const nextIncomplete = !nextMeaning.trim() && !found.englishDefinition.trim();

        await db
          .update(vocabulary)
          .set({
            vietnameseMeaning: nextMeaning,
            ipa: nextIpa,
            isIncomplete: nextIncomplete,
            updatedAt: new Date(),
          })
          .where(eq(vocabulary.id, found.id));

        if (row.exampleSentence) {
          const existingEx = await db
            .select({ englishSentence: vocabularyExamples.englishSentence })
            .from(vocabularyExamples)
            .where(eq(vocabularyExamples.vocabularyId, found.id));
          const hasSame = existingEx.some(
            (ex) => normalizeWord(ex.englishSentence) === normalizeWord(row.exampleSentence),
          );
          if (!hasSame) {
            await db.insert(vocabularyExamples).values({
              vocabularyId: found.id,
              englishSentence: row.exampleSentence,
              vietnameseTranslation: row.exampleTranslation,
              highlightText: found.word,
              sortOrder: existingEx.length,
            });
          }
        }
      }

      if (linkedSet.has(found.id)) {
        skippedCount += 1;
        continue;
      }

      await db
        .insert(sessionVocabulary)
        .values({
          sessionId,
          vocabularyId: found.id,
          addedVia: parsed.addedVia,
          sessionNote: '',
        })
        .onConflictDoNothing({
          target: [sessionVocabulary.sessionId, sessionVocabulary.vocabularyId],
        });

      linkedSet.add(found.id);
      processedVocabIds.push(found.id);
      linkedExistingCount += 1;
    }

    await db
      .update(learningSessions)
      .set({ updatedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));

    const detail = await buildSessionDetail(db, userId, sessionId);
    const processedSet = new Set(processedVocabIds);
    const items = (detail?.vocabulary ?? []).filter((v) =>
      processedSet.has(v.vocabularyId),
    );

    const response: BulkSessionVocabResponseDto = {
      addedCount,
      linkedExistingCount,
      skippedCount,
      items,
    };

    return c.json(response, 201);
  });

  app.delete('/sessions/:id/vocabulary/:vocabId', async (c) => {
    const sessionId = c.req.param('id');
    const vocabId = c.req.param('vocabId');
    if (!isUuid(sessionId) || !isUuid(vocabId)) {
      return c.json({ error: 'Không tìm thấy liên kết từ vựng trong buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [session] = await db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const deleted = await db
      .delete(sessionVocabulary)
      .where(
        and(
          eq(sessionVocabulary.sessionId, sessionId),
          eq(sessionVocabulary.vocabularyId, vocabId),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Từ vựng không nằm trong buổi học này' }, 404);
    }

    return c.json({ deleted: true, vocabularyId: vocabId });
  });

  app.post('/sessions/:id/grammar', async (c) => {
    const sessionId = c.req.param('id');
    if (!isUuid(sessionId)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [session] = await db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const body = await c.req.json();
    const parsed = linkGrammarSchema.parse(body);
    const cleanNote = normalizeUnicode(parsed.sessionNote ?? '');

    let topicId: string;

    if ('existingTopicId' in parsed) {
      const [topic] = await db
        .select({ id: grammarTopics.id })
        .from(grammarTopics)
        .where(
          and(
            eq(grammarTopics.id, parsed.existingTopicId),
            eq(grammarTopics.userId, userId),
          ),
        )
        .limit(1);
      if (!topic) {
        return c.json({ error: 'Không tìm thấy chủ điểm ngữ pháp' }, 404);
      }
      topicId = topic.id;
    } else {
      const t = parsed.newTopic;
      const [cat] = await db
        .select({ id: grammarCategories.id })
        .from(grammarCategories)
        .where(
          and(
            eq(grammarCategories.id, t.categoryId),
            eq(grammarCategories.userId, userId),
          ),
        )
        .limit(1);

      if (!cat) {
        return c.json({ error: 'Danh mục ngữ pháp không tồn tại' }, 400);
      }

      const slug = await ensureUniqueGrammarSlug(db, userId, t.title);
      const [createdTopic] = await db
        .insert(grammarTopics)
        .values({
          userId,
          categoryId: t.categoryId,
          title: normalizeUnicode(t.title),
          titleVi: normalizeUnicode(t.titleVi),
          slug,
          difficulty: t.difficulty,
          cefrLevel: t.cefrLevel,
          learningStatus: t.learningStatus,
          explanationVi: normalizeUnicode(t.explanationVi),
          explanationEn: normalizeUnicode(t.explanationEn),
          whatItIs: normalizeUnicode(t.whatItIs),
          whyUsed: normalizeUnicode(t.whyUsed),
          whenUsed: normalizeUnicode(t.whenUsed),
          howToRecognize: normalizeUnicode(t.howToRecognize),
          formula: normalizeUnicode(t.formula),
          usageNotes: normalizeUnicode(t.usageNotes),
          classNotes: normalizeUnicode(t.classNotes),
          personalExplanations: normalizeUnicode(t.personalExplanations),
          customExamples: normalizeUnicode(t.customExamples),
          openQuestions: normalizeUnicode(t.openQuestions),
          relatedTopicIds: t.relatedTopicIds ?? [],
        })
        .returning();

      topicId = createdTopic.id;

      if (t.examples && t.examples.length > 0) {
        await db.insert(grammarExamples).values(
          t.examples.map((ex, idx) => ({
            topicId,
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

      if (t.comparisons && t.comparisons.length > 0) {
        await db.insert(grammarComparisons).values(
          t.comparisons.map((cmp) => ({
            topicId,
            comparedTopicTitle: normalizeUnicode(cmp.comparedTopicTitle),
            comparedTopicId: cmp.comparedTopicId ?? null,
            differenceVi: normalizeUnicode(cmp.differenceVi),
            contextExampleA: normalizeUnicode(cmp.contextExampleA),
            contextExampleB: normalizeUnicode(cmp.contextExampleB),
            commonMistakeVi: normalizeUnicode(cmp.commonMistakeVi),
          })),
        );
      }

      await ensureGrammarReviewState(db, userId, topicId);
    }

    await db
      .insert(sessionGrammar)
      .values({
        sessionId,
        topicId,
        sessionNote: cleanNote,
      })
      .onConflictDoNothing({
        target: [sessionGrammar.sessionId, sessionGrammar.topicId],
      });

    if (cleanNote) {
      await db
        .update(sessionGrammar)
        .set({ sessionNote: cleanNote })
        .where(
          and(eq(sessionGrammar.sessionId, sessionId), eq(sessionGrammar.topicId, topicId)),
        );
    }

    await db
      .update(learningSessions)
      .set({ updatedAt: new Date() })
      .where(eq(learningSessions.id, sessionId));

    const detail = await buildSessionDetail(db, userId, sessionId);
    const item = detail?.grammarTopics.find((g) => g.topicId === topicId) ?? null;

    return c.json({ item, topicId, session: detail }, 201);
  });

  app.delete('/sessions/:id/grammar/:topicId', async (c) => {
    const sessionId = c.req.param('id');
    const topicId = c.req.param('topicId');
    if (!isUuid(sessionId) || !isUuid(topicId)) {
      return c.json({ error: 'Không tìm thấy liên kết ngữ pháp trong buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [session] = await db
      .select({ id: learningSessions.id })
      .from(learningSessions)
      .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
      .limit(1);

    if (!session) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const deleted = await db
      .delete(sessionGrammar)
      .where(
        and(eq(sessionGrammar.sessionId, sessionId), eq(sessionGrammar.topicId, topicId)),
      )
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Chủ điểm ngữ pháp không nằm trong buổi học này' }, 404);
    }

    return c.json({ deleted: true, topicId });
  });

  app.get('/sessions/:id/completion-preview', async (c) => {
    const sessionId = c.req.param('id');
    if (!isUuid(sessionId)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const detail = await buildSessionDetail(db, userId, sessionId);
    if (!detail) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const vocabIds = detail.vocabulary.map((v) => v.vocabularyId);
    const sessionCountByVocab = new Map<string, number>();

    if (vocabIds.length > 0) {
      const counts = await db
        .select({
          vocabularyId: sessionVocabulary.vocabularyId,
          count: sql<number>`count(*)::int`,
        })
        .from(sessionVocabulary)
        .where(inArray(sessionVocabulary.vocabularyId, vocabIds))
        .groupBy(sessionVocabulary.vocabularyId);

      for (const row of counts) {
        sessionCountByVocab.set(row.vocabularyId, Number(row.count));
      }
    }

    const duplicateWarnings = detail.vocabulary
      .filter((v) => (sessionCountByVocab.get(v.vocabularyId) ?? 1) > 1)
      .map((v) => ({
        word: v.word,
        existingVocabId: v.vocabularyId,
        sessionCount: sessionCountByVocab.get(v.vocabularyId) ?? 1,
      }));

    const incompleteEntries = detail.vocabulary
      .filter((v) => v.isIncomplete)
      .map((v) => {
        const missingFields: string[] = [];
        if (!v.vietnameseMeaning.trim()) missingFields.push('Nghĩa tiếng Việt');
        if (!v.englishDefinition.trim()) missingFields.push('Định nghĩa tiếng Anh');
        if (!v.ipa.trim()) missingFields.push('Phiên âm IPA');
        if (v.examples.length === 0) missingFields.push('Ví dụ minh họa');
        return {
          id: v.vocabularyId,
          word: v.word,
          missingFields,
        };
      });

    const preview: SessionCompletionPreviewDto = {
      vocabCount: detail.vocabCount,
      grammarCount: detail.grammarCount,
      duplicateWarnings,
      incompleteEntries,
    };

    return c.json(preview);
  });

  app.post('/sessions/:id/complete', async (c) => {
    const sessionId = c.req.param('id');
    if (!isUuid(sessionId)) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const now = new Date();

    const found = await withTransaction(db, async (tx) => {
      const [session] = await tx
        .select()
        .from(learningSessions)
        .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)))
        .limit(1);

      if (!session) {
        return false;
      }

      const wasDraft = session.status !== 'completed';

      await tx
        .update(learningSessions)
        .set({
          status: 'completed',
          completedAt: session.completedAt ?? now,
          updatedAt: now,
        })
        .where(eq(learningSessions.id, sessionId));

      const linkedVocab = await tx
        .select({ vocabularyId: sessionVocabulary.vocabularyId })
        .from(sessionVocabulary)
        .where(eq(sessionVocabulary.sessionId, sessionId));

      const linkedGrammar = await tx
        .select({ topicId: sessionGrammar.topicId })
        .from(sessionGrammar)
        .where(eq(sessionGrammar.sessionId, sessionId));

      for (const v of linkedVocab) {
        await ensureVocabularyReviewStates(tx, userId, v.vocabularyId);
      }

      for (const g of linkedGrammar) {
        await ensureGrammarReviewState(tx, userId, g.topicId);
      }

      if (wasDraft && (linkedVocab.length > 0 || linkedGrammar.length > 0)) {
        await recordDailyActivity(tx, userId, {
          vocabAddedCount: linkedVocab.length,
          grammarReviewedCount: linkedGrammar.length,
        });
      }

      return true;
    });

    if (!found) {
      return c.json({ error: 'Không tìm thấy buổi học' }, 404);
    }

    const detail = await buildSessionDetail(db, userId, sessionId);
    return c.json(detail);
  });

  return app;
}
