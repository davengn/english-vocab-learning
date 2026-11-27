import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import type { AppDatabase } from '../db/index.js';
import {
  collocations,
  learningSessions,
  sessionVocabulary,
  vocabulary,
  vocabularyCollectionItems,
  vocabularyCollections,
  vocabularyExamples,
  vocabularyRelations,
  vocabularyReviewStates,
  vocabularyTagItems,
  vocabularyTags,
  wordComparisonGroups,
  wordComparisonItems,
} from '../db/schema.js';
import { getDefaultUserId } from '../db/seed.js';
import { ensureVocabularyReviewStates, recordDailyActivity } from '../lib/helpers.js';
import { generateVocabularyCsv, type ExportableVocabularyRow } from '../../shared/csvExport.js';
import {
  CEFR_LEVELS,
  normalizeUnicode,
  normalizeWord,
  slugify,
  vocabularyInputSchema,
} from '../../shared/schemas.js';
import type {
  CefrLevel,
  CollectionDto,
  ImportColumnMapping,
  ImportCommitResponseDto,
  ImportParseResponseDto,
  ImportParsedRowDto,
  LinkedSessionRefDto,
  ReviewStateDto,
  TagDto,
  VocabularyDetailDto,
  VocabularyListItemDto,
  WordComparisonGroupDto,
} from '../../shared/apiTypes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
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

function normalizeCefr(raw: string | undefined | null): CefrLevel {
  const upper = (raw ?? '').trim().toUpperCase();
  if ((CEFR_LEVELS as readonly string[]).includes(upper)) {
    return upper as CefrLevel;
  }
  return 'unknown';
}

function extractExcelCellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return normalizeUnicode(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return normalizeUnicode(value.richText.map((part) => part.text ?? '').join(''));
    }
    if ('text' in value && typeof value.text === 'string') {
      return normalizeUnicode(value.text);
    }
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return normalizeUnicode(String(value.result));
    }
  }
  return '';
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectColumnMapping(headers: string[]): ImportColumnMapping {
  const used = new Set<string>();
  const findMatch = (candidates: string[]): string | null => {
    for (const exact of candidates) {
      const hit = headers.find((h) => !used.has(h) && normalizeHeaderKey(h) === exact);
      if (hit) {
        used.add(hit);
        return hit;
      }
    }
    for (const partial of candidates) {
      const hit = headers.find(
        (h) => !used.has(h) && normalizeHeaderKey(h).includes(partial),
      );
      if (hit) {
        used.add(hit);
        return hit;
      }
    }
    return null;
  };

  return {
    word: findMatch(['word', 'tu vung', 'tu', 'vocabulary', 'vocab', 'term', 'english']),
    vietnameseMeaning: findMatch([
      'vietnamese meaning',
      'nghia tieng viet',
      'meaning',
      'nghia',
      'vietnamese',
      'nghia viet',
    ]),
    ipa: findMatch(['ipa', 'phonetic', 'phien am', 'pronunciation']),
    partOfSpeech: findMatch(['part of speech', 'pos', 'tu loai', 'loai tu', 'word type']),
    cefrLevel: findMatch(['cefr level', 'cefr', 'level', 'cap do', 'trinh do']),
    englishDefinition: findMatch([
      'english definition',
      'definition',
      'dinh nghia',
      'english meaning',
    ]),
    exampleSentence: findMatch(['example sentence', 'example', 'vi du', 'cau vi du']),
    exampleTranslation: findMatch([
      'example translation',
      'dich vi du',
      'vi du dich',
      'translation',
    ]),
    tags: findMatch(['tags', 'tag', 'nhan', 'labels']),
    notes: findMatch(['personal notes', 'notes', 'note', 'ghi chu', 'comment']),
  };
}

async function ensureUniqueCollectionSlug(
  db: AppDatabase,
  userId: string,
  name: string,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let idx = 1;
  while (true) {
    const found = await db
      .select({ id: vocabularyCollections.id })
      .from(vocabularyCollections)
      .where(
        and(
          eq(vocabularyCollections.userId, userId),
          eq(vocabularyCollections.slug, candidate),
        ),
      )
      .limit(1);
    if (!found[0]) return candidate;
    idx += 1;
    candidate = `${base}-${idx}`;
  }
}

async function upsertTagsForUser(
  db: AppDatabase,
  userId: string,
  tagNames: string[],
): Promise<string[]> {
  const cleaned = Array.from(
    new Set(tagNames.map((n) => normalizeUnicode(n)).filter(Boolean)),
  );
  if (cleaned.length === 0) return [];

  const tagIds: string[] = [];
  for (const name of cleaned) {
    const slug = slugify(name);
    const [existing] = await db
      .select({ id: vocabularyTags.id })
      .from(vocabularyTags)
      .where(and(eq(vocabularyTags.userId, userId), eq(vocabularyTags.slug, slug)))
      .limit(1);

    if (existing) {
      tagIds.push(existing.id);
    } else {
      const [created] = await db
        .insert(vocabularyTags)
        .values({ userId, name, slug, color: '#0F766E' })
        .returning();
      tagIds.push(created.id);
    }
  }
  return tagIds;
}

async function buildVocabularyListItems(
  db: AppDatabase,
  userId: string,
  rows: Array<typeof vocabulary.$inferSelect>,
): Promise<VocabularyListItemDto[]> {
  if (rows.length === 0) return [];

  const vocabIds = rows.map((r) => r.id);

  const [
    collectionLinks,
    tagLinks,
    exampleCounts,
    collocationCounts,
    reviewStateRows,
  ] = await Promise.all([
    db
      .select({
        vocabularyId: vocabularyCollectionItems.vocabularyId,
        id: vocabularyCollections.id,
        name: vocabularyCollections.name,
        slug: vocabularyCollections.slug,
      })
      .from(vocabularyCollectionItems)
      .innerJoin(
        vocabularyCollections,
        eq(vocabularyCollectionItems.collectionId, vocabularyCollections.id),
      )
      .where(inArray(vocabularyCollectionItems.vocabularyId, vocabIds)),
    db
      .select({
        vocabularyId: vocabularyTagItems.vocabularyId,
        id: vocabularyTags.id,
        name: vocabularyTags.name,
        slug: vocabularyTags.slug,
        color: vocabularyTags.color,
      })
      .from(vocabularyTagItems)
      .innerJoin(vocabularyTags, eq(vocabularyTagItems.tagId, vocabularyTags.id))
      .where(inArray(vocabularyTagItems.vocabularyId, vocabIds)),
    db
      .select({
        vocabularyId: vocabularyExamples.vocabularyId,
        count: sql<number>`count(*)::int`,
      })
      .from(vocabularyExamples)
      .where(inArray(vocabularyExamples.vocabularyId, vocabIds))
      .groupBy(vocabularyExamples.vocabularyId),
    db
      .select({
        vocabularyId: collocations.vocabularyId,
        count: sql<number>`count(*)::int`,
      })
      .from(collocations)
      .where(inArray(collocations.vocabularyId, vocabIds))
      .groupBy(collocations.vocabularyId),
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

  const collectionsMap = new Map<
    string,
    Array<{ id: string; name: string; slug: string }>
  >();
  for (const row of collectionLinks) {
    const list = collectionsMap.get(row.vocabularyId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    collectionsMap.set(row.vocabularyId, list);
  }

  const tagsMap = new Map<
    string,
    Array<{ id: string; name: string; slug: string; color: string }>
  >();
  for (const row of tagLinks) {
    const list = tagsMap.get(row.vocabularyId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug, color: row.color });
    tagsMap.set(row.vocabularyId, list);
  }

  const exCountMap = new Map(exampleCounts.map((r) => [r.vocabularyId, Number(r.count)]));
  const colCountMap = new Map(
    collocationCounts.map((r) => [r.vocabularyId, Number(r.count)]),
  );

  const statesMap = new Map<string, ReviewStateDto[]>();
  for (const st of reviewStateRows) {
    const list = statesMap.get(st.vocabularyId) ?? [];
    list.push(serializeReviewState(st));
    statesMap.set(st.vocabularyId, list);
  }

  return rows.map((row) => {
    const states = statesMap.get(row.id) ?? [];
    return {
      id: row.id,
      word: row.word,
      normalizedWord: row.normalizedWord,
      ipa: row.ipa,
      partOfSpeech: row.partOfSpeech,
      cefrLevel: row.cefrLevel,
      englishDefinition: row.englishDefinition,
      vietnameseMeaning: row.vietnameseMeaning,
      register: row.register,
      tone: row.tone,
      source: row.source,
      confidenceLevel: row.confidenceLevel,
      isFavorite: row.isFavorite,
      status: row.status,
      isIncomplete: row.isIncomplete,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      collections: collectionsMap.get(row.id) ?? [],
      tags: tagsMap.get(row.id) ?? [],
      exampleCount: exCountMap.get(row.id) ?? 0,
      collocationCount: colCountMap.get(row.id) ?? 0,
      enToViState: states.find((s) => s.skillDirection === 'en_to_vi') ?? null,
      viToEnState: states.find((s) => s.skillDirection === 'vi_to_en') ?? null,
    };
  });
}

export async function buildVocabularyDetail(
  db: AppDatabase,
  userId: string,
  vocabId: string,
): Promise<VocabularyDetailDto | null> {
  const [row] = await db
    .select()
    .from(vocabulary)
    .where(and(eq(vocabulary.id, vocabId), eq(vocabulary.userId, userId)))
    .limit(1);

  if (!row) return null;

  const [listItem] = await buildVocabularyListItems(db, userId, [row]);

  const [
    examples,
    collocationRows,
    relationRows,
    sessionLinks,
    reviewStateRows,
    groupItemRefs,
  ] = await Promise.all([
    db
      .select()
      .from(vocabularyExamples)
      .where(eq(vocabularyExamples.vocabularyId, vocabId))
      .orderBy(asc(vocabularyExamples.sortOrder)),
    db.select().from(collocations).where(eq(collocations.vocabularyId, vocabId)),
    db
      .select()
      .from(vocabularyRelations)
      .where(eq(vocabularyRelations.vocabularyId, vocabId)),
    db
      .select({
        sessionId: learningSessions.id,
        title: learningSessions.title,
        learningDate: learningSessions.learningDate,
        sourceType: learningSessions.sourceType,
        status: learningSessions.status,
        sessionNote: sessionVocabulary.sessionNote,
        addedVia: sessionVocabulary.addedVia,
      })
      .from(sessionVocabulary)
      .innerJoin(learningSessions, eq(sessionVocabulary.sessionId, learningSessions.id))
      .where(eq(sessionVocabulary.vocabularyId, vocabId))
      .orderBy(desc(learningSessions.learningDate)),
    db
      .select()
      .from(vocabularyReviewStates)
      .where(
        and(
          eq(vocabularyReviewStates.userId, userId),
          eq(vocabularyReviewStates.vocabularyId, vocabId),
        ),
      ),
    db
      .select({ groupId: wordComparisonItems.groupId })
      .from(wordComparisonItems)
      .where(eq(wordComparisonItems.vocabularyId, vocabId)),
  ]);

  const groupIds = Array.from(new Set(groupItemRefs.map((g) => g.groupId)));
  let comparisonGroups: WordComparisonGroupDto[] = [];

  if (groupIds.length > 0) {
    const [groups, allGroupItems] = await Promise.all([
      db
        .select()
        .from(wordComparisonGroups)
        .where(
          and(
            eq(wordComparisonGroups.userId, userId),
            inArray(wordComparisonGroups.id, groupIds),
          ),
        ),
      db
        .select()
        .from(wordComparisonItems)
        .where(inArray(wordComparisonItems.groupId, groupIds))
        .orderBy(asc(wordComparisonItems.sortOrder)),
    ]);

    comparisonGroups = groups.map((g) => ({
      id: g.id,
      title: g.title,
      summaryVi: g.summaryVi,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      items: allGroupItems
        .filter((it) => it.groupId === g.id)
        .map((it) => ({
          id: it.id,
          groupId: it.groupId,
          vocabularyId: it.vocabularyId,
          label: it.label,
          meaningVi: it.meaningVi,
          grammarDiff: it.grammarDiff,
          usageContext: it.usageContext,
          exampleEn: it.exampleEn,
          exampleVi: it.exampleVi,
          commonMistakeVi: it.commonMistakeVi,
          sortOrder: it.sortOrder,
        })),
    }));
  }

  const linkedSessions: LinkedSessionRefDto[] = sessionLinks.map((s) => ({
    sessionId: s.sessionId,
    title: s.title,
    learningDate: s.learningDate,
    sourceType: s.sourceType,
    status: s.status,
    sessionNote: s.sessionNote,
    addedVia: s.addedVia,
  }));

  return {
    ...listItem,
    vietnameseExplanation: row.vietnameseExplanation,
    englishExplanation: row.englishExplanation,
    nuance: row.nuance,
    usageContext: row.usageContext,
    whenToUse: row.whenToUse,
    whenNotToUse: row.whenNotToUse,
    vnCommonMistakes: row.vnCommonMistakes,
    vnWrongCombinations: row.vnWrongCombinations,
    vnConfusingWords: row.vnConfusingWords,
    vnTranslationTraps: row.vnTranslationTraps,
    personalNotes: row.personalNotes,
    examples: examples.map((ex) => ({
      id: ex.id,
      vocabularyId: ex.vocabularyId,
      englishSentence: ex.englishSentence,
      vietnameseTranslation: ex.vietnameseTranslation,
      highlightText: ex.highlightText,
      sortOrder: ex.sortOrder,
    })),
    collocations: collocationRows.map((col) => ({
      id: col.id,
      vocabularyId: col.vocabularyId,
      phrase: col.phrase,
      vietnameseMeaning: col.vietnameseMeaning,
      exampleSentence: col.exampleSentence,
      exampleTranslation: col.exampleTranslation,
    })),
    relations: relationRows.map((rel) => ({
      id: rel.id,
      vocabularyId: rel.vocabularyId,
      relatedVocabularyId: rel.relatedVocabularyId,
      relationType: rel.relationType,
      text: rel.text,
      note: rel.note,
    })),
    linkedSessions,
    reviewStates: reviewStateRows.map(serializeReviewState),
    comparisonGroups,
  };
}

async function queryFilteredVocabulary(
  db: AppDatabase,
  userId: string,
  query: {
    search?: string;
    collectionId?: string;
    tagId?: string;
    cefrLevel?: string;
    partOfSpeech?: string;
    status?: string;
    favorite?: string;
    incomplete?: string;
    confidenceMax?: string;
    sessionId?: string;
    sort?: string;
  },
): Promise<VocabularyListItemDto[]> {
  const conditions = [eq(vocabulary.userId, userId)];

  const search = normalizeUnicode(query.search ?? '');
  if (search) {
    const pattern = `%${search}%`;
    const normPattern = `%${normalizeWord(search)}%`;
    const cond = or(
      ilike(vocabulary.word, pattern),
      ilike(vocabulary.normalizedWord, normPattern),
      ilike(vocabulary.vietnameseMeaning, pattern),
      ilike(vocabulary.englishDefinition, pattern),
      ilike(vocabulary.vietnameseExplanation, pattern),
    );
    if (cond) conditions.push(cond);
  }

  if (query.cefrLevel && (CEFR_LEVELS as readonly string[]).includes(query.cefrLevel)) {
    conditions.push(eq(vocabulary.cefrLevel, query.cefrLevel as CefrLevel));
  }
  if (query.partOfSpeech && query.partOfSpeech !== 'all') {
    conditions.push(eq(vocabulary.partOfSpeech, query.partOfSpeech));
  }
  if (
    query.status &&
    (['new', 'learning', 'reviewing', 'mastered'] as const).includes(
      query.status as 'new' | 'learning' | 'reviewing' | 'mastered',
    )
  ) {
    conditions.push(
      eq(
        vocabulary.status,
        query.status as 'new' | 'learning' | 'reviewing' | 'mastered',
      ),
    );
  }
  if (query.favorite === 'true' || query.favorite === '1') {
    conditions.push(eq(vocabulary.isFavorite, true));
  }
  if (query.incomplete === 'true' || query.incomplete === '1') {
    conditions.push(eq(vocabulary.isIncomplete, true));
  }
  if (query.confidenceMax) {
    const maxVal = Number(query.confidenceMax);
    if (Number.isInteger(maxVal) && maxVal >= 1 && maxVal <= 5) {
      conditions.push(lte(vocabulary.confidenceLevel, maxVal));
    }
  }

  const filterGroups: string[][] = [];

  if (isUuid(query.collectionId)) {
    const colRows = await db
      .select({ vocabularyId: vocabularyCollectionItems.vocabularyId })
      .from(vocabularyCollectionItems)
      .where(eq(vocabularyCollectionItems.collectionId, query.collectionId));
    filterGroups.push(colRows.map((r) => r.vocabularyId));
  }

  if (isUuid(query.tagId)) {
    const tagRows = await db
      .select({ vocabularyId: vocabularyTagItems.vocabularyId })
      .from(vocabularyTagItems)
      .where(eq(vocabularyTagItems.tagId, query.tagId));
    filterGroups.push(tagRows.map((r) => r.vocabularyId));
  }

  if (isUuid(query.sessionId)) {
    const sessRows = await db
      .select({ vocabularyId: sessionVocabulary.vocabularyId })
      .from(sessionVocabulary)
      .where(eq(sessionVocabulary.sessionId, query.sessionId));
    filterGroups.push(sessRows.map((r) => r.vocabularyId));
  }

  if (filterGroups.length > 0) {
    let intersected = Array.from(new Set(filterGroups[0]));
    for (let i = 1; i < filterGroups.length; i++) {
      const next = new Set(filterGroups[i]);
      intersected = intersected.filter((id) => next.has(id));
    }
    if (intersected.length === 0) return [];
    conditions.push(inArray(vocabulary.id, intersected));
  }

  const orderBy =
    query.sort === 'alpha'
      ? [asc(vocabulary.normalizedWord)]
      : query.sort === 'confidence'
        ? [asc(vocabulary.confidenceLevel), asc(vocabulary.normalizedWord)]
        : [desc(vocabulary.createdAt)];

  const rows = await db
    .select()
    .from(vocabulary)
    .where(and(...conditions))
    .orderBy(...orderBy);

  const items = await buildVocabularyListItems(db, userId, rows);

  if (query.sort === 'due') {
    items.sort((a, b) => {
      const aTime = Math.min(
        a.enToViState ? new Date(a.enToViState.nextReviewAt).getTime() : Infinity,
        a.viToEnState ? new Date(a.viToEnState.nextReviewAt).getTime() : Infinity,
      );
      const bTime = Math.min(
        b.enToViState ? new Date(b.enToViState.nextReviewAt).getTime() : Infinity,
        b.viToEnState ? new Date(b.viToEnState.nextReviewAt).getTime() : Infinity,
      );
      return aTime - bTime;
    });
  }

  return items;
}

const importCommitSchema = z.object({
  rows: z
    .array(
      z.object({
        word: z.string().trim().min(1, 'Từ tiếng Anh không được để trống'),
        vietnameseMeaning: z.string().default(''),
        ipa: z.string().default(''),
        partOfSpeech: z.string().default('other'),
        cefrLevel: z.string().default('unknown'),
        englishDefinition: z.string().default(''),
        exampleSentence: z.string().default(''),
        exampleTranslation: z.string().default(''),
        personalNotes: z.string().default(''),
        tags: z.array(z.string()).optional(),
      }),
    )
    .max(200, 'Tối đa 200 từ mỗi lần import'),
  collectionId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  duplicateStrategy: z.enum(['skip', 'merge', 'link_existing']).default('skip'),
});

const collectionInputSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên bộ sưu tập'),
  description: z.string().default(''),
});

const tagInputSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên nhãn'),
  color: z.string().trim().default('#0F766E'),
});

const comparisonGroupInputSchema = z.object({
  title: z.string().trim().min(1, 'Vui lòng nhập tiêu đề nhóm so sánh'),
  summaryVi: z.string().default(''),
  items: z
    .array(
      z.object({
        vocabularyId: z.string().uuid().nullable().optional(),
        label: z.string().trim().min(1, 'Vui lòng nhập từ cần so sánh'),
        meaningVi: z.string().default(''),
        grammarDiff: z.string().default(''),
        usageContext: z.string().default(''),
        exampleEn: z.string().default(''),
        exampleVi: z.string().default(''),
        commonMistakeVi: z.string().default(''),
      }),
    )
    .min(1, 'Nhóm so sánh cần ít nhất 1 từ'),
});

async function resolveComparisonItemsVocabularyIds(
  db: AppDatabase,
  userId: string,
  items: z.infer<typeof comparisonGroupInputSchema>['items'],
) {
  const candidates = new Set<string>();
  for (const item of items) {
    if (!item.vocabularyId) {
      const stripped = item.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (stripped) candidates.add(normalizeWord(stripped));
      candidates.add(normalizeWord(item.label));
    }
  }

  const wordMap = new Map<string, string>();
  if (candidates.size > 0) {
    const matched = await db
      .select({ id: vocabulary.id, normalizedWord: vocabulary.normalizedWord })
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.userId, userId),
          inArray(vocabulary.normalizedWord, Array.from(candidates)),
        ),
      );
    for (const row of matched) {
      wordMap.set(row.normalizedWord, row.id);
    }
  }

  return items.map((item, idx) => {
    const stripped = normalizeWord(item.label.replace(/\s*\([^)]*\)\s*$/, '').trim());
    const resolvedId =
      item.vocabularyId ??
      wordMap.get(stripped) ??
      wordMap.get(normalizeWord(item.label)) ??
      null;
    return {
      vocabularyId: resolvedId,
      label: normalizeUnicode(item.label),
      meaningVi: normalizeUnicode(item.meaningVi),
      grammarDiff: normalizeUnicode(item.grammarDiff),
      usageContext: normalizeUnicode(item.usageContext),
      exampleEn: normalizeUnicode(item.exampleEn),
      exampleVi: normalizeUnicode(item.exampleVi),
      commonMistakeVi: normalizeUnicode(item.commonMistakeVi),
      sortOrder: idx,
    };
  });
}

export function createVocabularyRoutes(db: AppDatabase): Hono {
  const app = new Hono();

  app.get('/vocabulary', async (c) => {
    const userId = await getDefaultUserId(db);
    const items = await queryFilteredVocabulary(db, userId, {
      search: c.req.query('search'),
      collectionId: c.req.query('collectionId'),
      tagId: c.req.query('tagId'),
      cefrLevel: c.req.query('cefrLevel'),
      partOfSpeech: c.req.query('partOfSpeech'),
      status: c.req.query('status'),
      favorite: c.req.query('favorite'),
      incomplete: c.req.query('incomplete'),
      confidenceMax: c.req.query('confidenceMax'),
      sessionId: c.req.query('sessionId'),
      sort: c.req.query('sort'),
    });
    return c.json(items);
  });

  app.post('/vocabulary', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = vocabularyInputSchema.parse(body);

    const cleanWord = normalizeUnicode(parsed.word);
    const normWord = normalizeWord(cleanWord);

    const [duplicate] = await db
      .select({ id: vocabulary.id })
      .from(vocabulary)
      .where(and(eq(vocabulary.userId, userId), eq(vocabulary.normalizedWord, normWord)))
      .limit(1);

    if (duplicate) {
      return c.json(
        {
          error: 'Từ vựng này đã tồn tại trong thư viện',
          existingId: duplicate.id,
        },
        409,
      );
    }

    const cleanMeaning = normalizeUnicode(parsed.vietnameseMeaning);
    const cleanDef = normalizeUnicode(parsed.englishDefinition);
    const isIncomplete = !cleanMeaning.trim() && !cleanDef.trim();

    const [created] = await db
      .insert(vocabulary)
      .values({
        userId,
        word: cleanWord,
        normalizedWord: normWord,
        ipa: normalizeUnicode(parsed.ipa),
        partOfSpeech: parsed.partOfSpeech || 'other',
        cefrLevel: parsed.cefrLevel,
        englishDefinition: cleanDef,
        vietnameseMeaning: cleanMeaning,
        vietnameseExplanation: normalizeUnicode(parsed.vietnameseExplanation),
        englishExplanation: normalizeUnicode(parsed.englishExplanation),
        nuance: normalizeUnicode(parsed.nuance),
        register: parsed.register,
        tone: parsed.tone,
        usageContext: normalizeUnicode(parsed.usageContext),
        whenToUse: normalizeUnicode(parsed.whenToUse),
        whenNotToUse: normalizeUnicode(parsed.whenNotToUse),
        vnCommonMistakes: normalizeUnicode(parsed.vnCommonMistakes),
        vnWrongCombinations: normalizeUnicode(parsed.vnWrongCombinations),
        vnConfusingWords: normalizeUnicode(parsed.vnConfusingWords),
        vnTranslationTraps: normalizeUnicode(parsed.vnTranslationTraps),
        personalNotes: normalizeUnicode(parsed.personalNotes),
        source: normalizeUnicode(parsed.source),
        confidenceLevel: parsed.confidenceLevel,
        isFavorite: parsed.isFavorite,
        status: 'new',
        isIncomplete,
      })
      .returning();

    if (parsed.examples && parsed.examples.length > 0) {
      await db.insert(vocabularyExamples).values(
        parsed.examples.map((ex, idx) => ({
          vocabularyId: created.id,
          englishSentence: normalizeUnicode(ex.englishSentence),
          vietnameseTranslation: normalizeUnicode(ex.vietnameseTranslation),
          highlightText: normalizeUnicode(ex.highlightText) || cleanWord,
          sortOrder: idx,
        })),
      );
    }

    if (parsed.collocations && parsed.collocations.length > 0) {
      await db.insert(collocations).values(
        parsed.collocations.map((col) => ({
          vocabularyId: created.id,
          phrase: normalizeUnicode(col.phrase),
          vietnameseMeaning: normalizeUnicode(col.vietnameseMeaning),
          exampleSentence: normalizeUnicode(col.exampleSentence),
          exampleTranslation: normalizeUnicode(col.exampleTranslation),
        })),
      );
    }

    if (parsed.relations && parsed.relations.length > 0) {
      await db.insert(vocabularyRelations).values(
        parsed.relations.map((rel) => ({
          vocabularyId: created.id,
          relationType: rel.relationType,
          text: normalizeUnicode(rel.text),
          note: normalizeUnicode(rel.note),
        })),
      );
    }

    if (parsed.collectionIds && parsed.collectionIds.length > 0) {
      await db
        .insert(vocabularyCollectionItems)
        .values(
          Array.from(new Set(parsed.collectionIds)).map((collectionId) => ({
            collectionId,
            vocabularyId: created.id,
          })),
        )
        .onConflictDoNothing();
    }

    if (parsed.tagNames && parsed.tagNames.length > 0) {
      const tagIds = await upsertTagsForUser(db, userId, parsed.tagNames);
      if (tagIds.length > 0) {
        await db
          .insert(vocabularyTagItems)
          .values(tagIds.map((tagId) => ({ tagId, vocabularyId: created.id })))
          .onConflictDoNothing();
      }
    }

    await ensureVocabularyReviewStates(db, userId, created.id);
    await recordDailyActivity(db, userId, { vocabAddedCount: 1 });

    const detail = await buildVocabularyDetail(db, userId, created.id);
    return c.json(detail, 201);
  });

  // Static import/export routes registered BEFORE /vocabulary/:id
  app.post('/vocabulary/import/parse', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.parseBody();
    const uploaded = Array.isArray(body['file']) ? body['file'][0] : body['file'];

    if (!(uploaded instanceof File)) {
      return c.json({ error: 'Vui lòng chọn tệp .csv hoặc .xlsx để nhập từ vựng' }, 400);
    }

    if (uploaded.size > 5 * 1024 * 1024) {
      return c.json({ error: 'Kích thước tệp vượt quá giới hạn 5MB' }, 400);
    }

    const fileName = uploaded.name || 'import.csv';
    const lowerName = fileName.toLowerCase();
    const isCsv =
      lowerName.endsWith('.csv') || uploaded.type === 'text/csv';
    const isXlsx =
      lowerName.endsWith('.xlsx') ||
      uploaded.type ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (!isCsv && !isXlsx) {
      return c.json({ error: 'Định dạng không hỗ trợ. Chỉ chấp nhận tệp .csv hoặc .xlsx' }, 400);
    }

    const arrayBuffer = await uploaded.arrayBuffer();
    let grid: string[][] = [];

    if (isCsv) {
      const rawText = new TextDecoder('utf-8')
        .decode(arrayBuffer)
        .replace(/^\uFEFF/, '');
      const parsed = Papa.parse<string[]>(rawText, {
        skipEmptyLines: 'greedy',
      });
      grid = parsed.data.map((row) =>
        row.map((cell) => normalizeUnicode(String(cell ?? ''))),
      );
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        Buffer.from(arrayBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return c.json({ error: 'Tệp Excel không có trang tính nào' }, 400);
      }
      worksheet.eachRow({ includeEmpty: false }, (row) => {
        const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
        const line = vals.map((cell) => extractExcelCellText(cell as ExcelJS.CellValue));
        if (line.some((cell) => cell.length > 0)) {
          grid.push(line);
        }
      });
    }

    const nonEmptyRows = grid.filter((r) => r.some((cell) => cell.trim().length > 0));
    if (nonEmptyRows.length < 2) {
      return c.json(
        { error: 'Tệp phải có ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu' },
        400,
      );
    }

    const headers = nonEmptyRows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
    const allDataRows = nonEmptyRows.slice(1);
    const truncated = allDataRows.length > 200;
    const rawRows = allDataRows.slice(0, 200).map((row) =>
      headers.map((_, idx) => normalizeUnicode(row[idx] ?? '')),
    );

    const columnMapping = detectColumnMapping(headers);
    const headerIndex = new Map(headers.map((h, i) => [h, i]));

    const allTokens = new Set<string>();
    for (const row of rawRows) {
      for (const cell of row) {
        const norm = normalizeWord(cell);
        if (norm) allTokens.add(norm);
      }
    }

    const existingWords: Record<string, string> = {};
    if (allTokens.size > 0) {
      const existingRows = await db
        .select({ id: vocabulary.id, normalizedWord: vocabulary.normalizedWord })
        .from(vocabulary)
        .where(
          and(
            eq(vocabulary.userId, userId),
            inArray(vocabulary.normalizedWord, Array.from(allTokens)),
          ),
        );
      for (const row of existingRows) {
        existingWords[row.normalizedWord] = row.id;
      }
    }

    const getCell = (row: string[], colName: string | null): string => {
      if (!colName) return '';
      const idx = headerIndex.get(colName);
      if (idx === undefined) return '';
      return (row[idx] ?? '').trim();
    };

    const seenInFile = new Set<string>();
    const previewRows: ImportParsedRowDto[] = [];

    rawRows.forEach((row, idx) => {
      const word = getCell(row, columnMapping.word);
      const norm = normalizeWord(word);
      const duplicateInFile = Boolean(norm && seenInFile.has(norm));
      if (norm) seenInFile.add(norm);

      const existingVocabId = norm ? existingWords[norm] ?? null : null;
      const tagsRaw = getCell(row, columnMapping.tags);
      const tags = tagsRaw
        ? tagsRaw
            .split(/[,;|]/)
            .map((t) => normalizeUnicode(t))
            .filter(Boolean)
        : [];

      previewRows.push({
        rowIndex: idx + 1,
        word,
        normalizedWord: norm,
        vietnameseMeaning: getCell(row, columnMapping.vietnameseMeaning),
        ipa: getCell(row, columnMapping.ipa),
        partOfSpeech: getCell(row, columnMapping.partOfSpeech) || 'other',
        cefrLevel: normalizeCefr(getCell(row, columnMapping.cefrLevel)),
        englishDefinition: getCell(row, columnMapping.englishDefinition),
        exampleSentence: getCell(row, columnMapping.exampleSentence),
        exampleTranslation: getCell(row, columnMapping.exampleTranslation),
        tags,
        personalNotes: getCell(row, columnMapping.notes),
        duplicateInDb: Boolean(existingVocabId),
        duplicateInFile,
        existingVocabId,
      });
    });

    const response: ImportParseResponseDto = {
      fileName,
      totalRows: allDataRows.length,
      truncated,
      headers,
      rawRows,
      columnMapping,
      existingWords,
      previewRows,
    };

    return c.json(response);
  });

  app.post('/vocabulary/import/commit', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = importCommitSchema.parse(body);

    const uniqueRows: typeof parsed.rows = [];
    const seen = new Set<string>();
    let skippedCount = 0;

    for (const row of parsed.rows) {
      const norm = normalizeWord(row.word);
      if (!norm || seen.has(norm)) {
        skippedCount += 1;
        continue;
      }
      seen.add(norm);
      uniqueRows.push(row);
    }

    const normList = uniqueRows.map((r) => normalizeWord(r.word));
    const existingList =
      normList.length > 0
        ? await db
            .select()
            .from(vocabulary)
            .where(
              and(
                eq(vocabulary.userId, userId),
                inArray(vocabulary.normalizedWord, normList),
              ),
            )
        : [];
    const existingByNorm = new Map(existingList.map((v) => [v.normalizedWord, v]));

    let addedCount = 0;
    let mergedCount = 0;
    let linkedExistingCount = 0;
    const vocabularyIds: string[] = [];

    for (const row of uniqueRows) {
      const cleanWord = normalizeUnicode(row.word);
      const norm = normalizeWord(cleanWord);
      const cleanMeaning = normalizeUnicode(row.vietnameseMeaning);
      const cleanDef = normalizeUnicode(row.englishDefinition);
      const cleanIpa = normalizeUnicode(row.ipa);
      const cleanNotes = normalizeUnicode(row.personalNotes);
      const cleanExample = normalizeUnicode(row.exampleSentence);
      const cleanExampleTrans = normalizeUnicode(row.exampleTranslation);
      const cefr = normalizeCefr(row.cefrLevel);
      const pos = row.partOfSpeech.trim() || 'other';

      const found = existingByNorm.get(norm);

      if (!found) {
        const isIncomplete = !cleanMeaning.trim() && !cleanDef.trim();
        const [inserted] = await db
          .insert(vocabulary)
          .values({
            userId,
            word: cleanWord,
            normalizedWord: norm,
            ipa: cleanIpa,
            partOfSpeech: pos,
            cefrLevel: cefr,
            englishDefinition: cleanDef,
            vietnameseMeaning: cleanMeaning,
            personalNotes: cleanNotes,
            source: 'Nhập tệp CSV/XLSX',
            isIncomplete,
            status: 'new',
          })
          .returning();

        if (cleanExample) {
          await db.insert(vocabularyExamples).values({
            vocabularyId: inserted.id,
            englishSentence: cleanExample,
            vietnameseTranslation: cleanExampleTrans,
            highlightText: cleanWord,
            sortOrder: 0,
          });
        }

        if (row.tags && row.tags.length > 0) {
          const tagIds = await upsertTagsForUser(db, userId, row.tags);
          if (tagIds.length > 0) {
            await db
              .insert(vocabularyTagItems)
              .values(tagIds.map((tagId) => ({ tagId, vocabularyId: inserted.id })))
              .onConflictDoNothing();
          }
        }

        if (parsed.collectionId) {
          await db
            .insert(vocabularyCollectionItems)
            .values({ collectionId: parsed.collectionId, vocabularyId: inserted.id })
            .onConflictDoNothing();
        }

        if (parsed.sessionId) {
          await db
            .insert(sessionVocabulary)
            .values({
              sessionId: parsed.sessionId,
              vocabularyId: inserted.id,
              addedVia: 'import',
              sessionNote: '',
            })
            .onConflictDoNothing();
        }

        await ensureVocabularyReviewStates(db, userId, inserted.id);
        vocabularyIds.push(inserted.id);
        addedCount += 1;
        continue;
      }

      if (parsed.duplicateStrategy === 'skip') {
        skippedCount += 1;
        continue;
      }

      if (parsed.duplicateStrategy === 'merge') {
        const nextMeaning =
          !found.vietnameseMeaning.trim() && cleanMeaning
            ? cleanMeaning
            : found.vietnameseMeaning;
        const nextDef =
          !found.englishDefinition.trim() && cleanDef
            ? cleanDef
            : found.englishDefinition;
        const nextIpa = !found.ipa.trim() && cleanIpa ? cleanIpa : found.ipa;
        const nextNotes =
          !found.personalNotes.trim() && cleanNotes ? cleanNotes : found.personalNotes;
        const nextPos =
          found.partOfSpeech === 'other' && pos !== 'other' ? pos : found.partOfSpeech;
        const nextCefr =
          found.cefrLevel === 'unknown' && cefr !== 'unknown' ? cefr : found.cefrLevel;

        await db
          .update(vocabulary)
          .set({
            vietnameseMeaning: nextMeaning,
            englishDefinition: nextDef,
            ipa: nextIpa,
            personalNotes: nextNotes,
            partOfSpeech: nextPos,
            cefrLevel: nextCefr,
            isIncomplete: !nextMeaning.trim() && !nextDef.trim(),
            updatedAt: new Date(),
          })
          .where(eq(vocabulary.id, found.id));

        if (cleanExample) {
          const existingEx = await db
            .select({ englishSentence: vocabularyExamples.englishSentence })
            .from(vocabularyExamples)
            .where(eq(vocabularyExamples.vocabularyId, found.id));
          const hasSame = existingEx.some(
            (ex) => normalizeWord(ex.englishSentence) === normalizeWord(cleanExample),
          );
          if (!hasSame) {
            await db.insert(vocabularyExamples).values({
              vocabularyId: found.id,
              englishSentence: cleanExample,
              vietnameseTranslation: cleanExampleTrans,
              highlightText: found.word,
              sortOrder: existingEx.length,
            });
          }
        }
        mergedCount += 1;
      } else {
        linkedExistingCount += 1;
      }

      if (parsed.collectionId) {
        await db
          .insert(vocabularyCollectionItems)
          .values({ collectionId: parsed.collectionId, vocabularyId: found.id })
          .onConflictDoNothing();
      }

      if (parsed.sessionId) {
        await db
          .insert(sessionVocabulary)
          .values({
            sessionId: parsed.sessionId,
            vocabularyId: found.id,
            addedVia: 'import',
            sessionNote: '',
          })
          .onConflictDoNothing();
      }

      vocabularyIds.push(found.id);
    }

    if (addedCount > 0) {
      await recordDailyActivity(db, userId, { vocabAddedCount: addedCount });
    }

    const result: ImportCommitResponseDto = {
      addedCount,
      mergedCount,
      linkedExistingCount,
      skippedCount,
      vocabularyIds,
    };

    return c.json(result, 201);
  });

  app.get('/vocabulary/export.csv', async (c) => {
    const userId = await getDefaultUserId(db);
    const items = await queryFilteredVocabulary(db, userId, {
      search: c.req.query('search'),
      collectionId: c.req.query('collectionId'),
      tagId: c.req.query('tagId'),
      cefrLevel: c.req.query('cefrLevel'),
      partOfSpeech: c.req.query('partOfSpeech'),
      status: c.req.query('status'),
      favorite: c.req.query('favorite'),
      incomplete: c.req.query('incomplete'),
      sort: 'alpha',
    });

    const vocabIds = items.map((i) => i.id);
    const fullRows =
      vocabIds.length > 0
        ? await db
            .select()
            .from(vocabulary)
            .where(inArray(vocabulary.id, vocabIds))
        : [];
    const fullMap = new Map(fullRows.map((r) => [r.id, r]));

    const [exRows, colRows] =
      vocabIds.length > 0
        ? await Promise.all([
            db
              .select()
              .from(vocabularyExamples)
              .where(inArray(vocabularyExamples.vocabularyId, vocabIds))
              .orderBy(asc(vocabularyExamples.sortOrder)),
            db
              .select()
              .from(collocations)
              .where(inArray(collocations.vocabularyId, vocabIds)),
          ])
        : [[], []];

    const exMap = new Map<string, string[]>();
    for (const ex of exRows) {
      const list = exMap.get(ex.vocabularyId) ?? [];
      list.push(
        ex.vietnameseTranslation
          ? `${ex.englishSentence} (${ex.vietnameseTranslation})`
          : ex.englishSentence,
      );
      exMap.set(ex.vocabularyId, list);
    }

    const colMap = new Map<string, string[]>();
    for (const col of colRows) {
      const list = colMap.get(col.vocabularyId) ?? [];
      list.push(
        col.vietnameseMeaning ? `${col.phrase}: ${col.vietnameseMeaning}` : col.phrase,
      );
      colMap.set(col.vocabularyId, list);
    }

    const exportRows: ExportableVocabularyRow[] = items.map((item) => {
      const full = fullMap.get(item.id);
      return {
        word: item.word,
        ipa: item.ipa,
        partOfSpeech: item.partOfSpeech,
        cefrLevel: item.cefrLevel,
        vietnameseMeaning: item.vietnameseMeaning,
        englishDefinition: item.englishDefinition,
        vietnameseExplanation: full?.vietnameseExplanation ?? '',
        register: item.register,
        tone: item.tone,
        usageContext: full?.usageContext ?? '',
        vnCommonMistakes: full?.vnCommonMistakes ?? '',
        examplesText: (exMap.get(item.id) ?? []).join(' | '),
        collocationsText: (colMap.get(item.id) ?? []).join(' | '),
        collectionsText: item.collections.map((col) => col.name).join(', '),
        tagsText: item.tags.map((tag) => tag.name).join(', '),
        status: item.status,
        confidenceLevel: item.confidenceLevel,
        source: item.source,
      };
    });

    const csv = generateVocabularyCsv(exportRows);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vocabulary-export.csv"',
      },
    });
  });

  app.get('/vocabulary/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy từ vựng' }, 404);
    }
    const userId = await getDefaultUserId(db);
    const detail = await buildVocabularyDetail(db, userId, id);
    if (!detail) {
      return c.json({ error: 'Không tìm thấy từ vựng' }, 404);
    }
    return c.json(detail);
  });

  app.patch('/vocabulary/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy từ vựng' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(vocabulary)
      .where(and(eq(vocabulary.id, id), eq(vocabulary.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy từ vựng' }, 404);
    }

    const body = await c.req.json();
    const parsed = vocabularyInputSchema.partial().parse(body);

    let nextWord = existing.word;
    let nextNorm = existing.normalizedWord;
    if (parsed.word !== undefined) {
      nextWord = normalizeUnicode(parsed.word);
      nextNorm = normalizeWord(nextWord);
      if (nextNorm !== existing.normalizedWord) {
        const [conflict] = await db
          .select({ id: vocabulary.id })
          .from(vocabulary)
          .where(
            and(eq(vocabulary.userId, userId), eq(vocabulary.normalizedWord, nextNorm)),
          )
          .limit(1);
        if (conflict && conflict.id !== id) {
          return c.json(
            {
              error: 'Từ vựng trùng với một mục đã có trong thư viện',
              existingId: conflict.id,
            },
            409,
          );
        }
      }
    }

    const nextMeaning =
      parsed.vietnameseMeaning !== undefined
        ? normalizeUnicode(parsed.vietnameseMeaning)
        : existing.vietnameseMeaning;
    const nextDef =
      parsed.englishDefinition !== undefined
        ? normalizeUnicode(parsed.englishDefinition)
        : existing.englishDefinition;

    const isIncomplete = !nextMeaning.trim() && !nextDef.trim();

    await db
      .update(vocabulary)
      .set({
        word: nextWord,
        normalizedWord: nextNorm,
        ...(parsed.ipa !== undefined ? { ipa: normalizeUnicode(parsed.ipa) } : {}),
        ...(parsed.partOfSpeech !== undefined
          ? { partOfSpeech: parsed.partOfSpeech || 'other' }
          : {}),
        ...(parsed.cefrLevel !== undefined ? { cefrLevel: parsed.cefrLevel } : {}),
        englishDefinition: nextDef,
        vietnameseMeaning: nextMeaning,
        ...(parsed.vietnameseExplanation !== undefined
          ? { vietnameseExplanation: normalizeUnicode(parsed.vietnameseExplanation) }
          : {}),
        ...(parsed.englishExplanation !== undefined
          ? { englishExplanation: normalizeUnicode(parsed.englishExplanation) }
          : {}),
        ...(parsed.nuance !== undefined
          ? { nuance: normalizeUnicode(parsed.nuance) }
          : {}),
        ...(parsed.register !== undefined ? { register: parsed.register } : {}),
        ...(parsed.tone !== undefined ? { tone: parsed.tone } : {}),
        ...(parsed.usageContext !== undefined
          ? { usageContext: normalizeUnicode(parsed.usageContext) }
          : {}),
        ...(parsed.whenToUse !== undefined
          ? { whenToUse: normalizeUnicode(parsed.whenToUse) }
          : {}),
        ...(parsed.whenNotToUse !== undefined
          ? { whenNotToUse: normalizeUnicode(parsed.whenNotToUse) }
          : {}),
        ...(parsed.vnCommonMistakes !== undefined
          ? { vnCommonMistakes: normalizeUnicode(parsed.vnCommonMistakes) }
          : {}),
        ...(parsed.vnWrongCombinations !== undefined
          ? { vnWrongCombinations: normalizeUnicode(parsed.vnWrongCombinations) }
          : {}),
        ...(parsed.vnConfusingWords !== undefined
          ? { vnConfusingWords: normalizeUnicode(parsed.vnConfusingWords) }
          : {}),
        ...(parsed.vnTranslationTraps !== undefined
          ? { vnTranslationTraps: normalizeUnicode(parsed.vnTranslationTraps) }
          : {}),
        ...(parsed.personalNotes !== undefined
          ? { personalNotes: normalizeUnicode(parsed.personalNotes) }
          : {}),
        ...(parsed.source !== undefined
          ? { source: normalizeUnicode(parsed.source) }
          : {}),
        ...(parsed.confidenceLevel !== undefined
          ? { confidenceLevel: parsed.confidenceLevel }
          : {}),
        ...(parsed.isFavorite !== undefined ? { isFavorite: parsed.isFavorite } : {}),
        isIncomplete,
        updatedAt: new Date(),
      })
      .where(eq(vocabulary.id, id));

    if (parsed.examples !== undefined) {
      await db.delete(vocabularyExamples).where(eq(vocabularyExamples.vocabularyId, id));
      if (parsed.examples.length > 0) {
        await db.insert(vocabularyExamples).values(
          parsed.examples.map((ex, idx) => ({
            vocabularyId: id,
            englishSentence: normalizeUnicode(ex.englishSentence),
            vietnameseTranslation: normalizeUnicode(ex.vietnameseTranslation),
            highlightText: normalizeUnicode(ex.highlightText) || nextWord,
            sortOrder: idx,
          })),
        );
      }
    }

    if (parsed.collocations !== undefined) {
      await db.delete(collocations).where(eq(collocations.vocabularyId, id));
      if (parsed.collocations.length > 0) {
        await db.insert(collocations).values(
          parsed.collocations.map((col) => ({
            vocabularyId: id,
            phrase: normalizeUnicode(col.phrase),
            vietnameseMeaning: normalizeUnicode(col.vietnameseMeaning),
            exampleSentence: normalizeUnicode(col.exampleSentence),
            exampleTranslation: normalizeUnicode(col.exampleTranslation),
          })),
        );
      }
    }

    if (parsed.relations !== undefined) {
      await db.delete(vocabularyRelations).where(eq(vocabularyRelations.vocabularyId, id));
      if (parsed.relations.length > 0) {
        await db.insert(vocabularyRelations).values(
          parsed.relations.map((rel) => ({
            vocabularyId: id,
            relationType: rel.relationType,
            text: normalizeUnicode(rel.text),
            note: normalizeUnicode(rel.note),
          })),
        );
      }
    }

    if (parsed.collectionIds !== undefined) {
      await db
        .delete(vocabularyCollectionItems)
        .where(eq(vocabularyCollectionItems.vocabularyId, id));
      if (parsed.collectionIds.length > 0) {
        await db
          .insert(vocabularyCollectionItems)
          .values(
            Array.from(new Set(parsed.collectionIds)).map((collectionId) => ({
              collectionId,
              vocabularyId: id,
            })),
          )
          .onConflictDoNothing();
      }
    }

    if (parsed.tagNames !== undefined) {
      await db.delete(vocabularyTagItems).where(eq(vocabularyTagItems.vocabularyId, id));
      if (parsed.tagNames.length > 0) {
        const tagIds = await upsertTagsForUser(db, userId, parsed.tagNames);
        if (tagIds.length > 0) {
          await db
            .insert(vocabularyTagItems)
            .values(tagIds.map((tagId) => ({ tagId, vocabularyId: id })))
            .onConflictDoNothing();
        }
      }
    }

    const detail = await buildVocabularyDetail(db, userId, id);
    return c.json(detail);
  });

  app.delete('/vocabulary/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy từ vựng' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(vocabulary)
      .where(and(eq(vocabulary.id, id), eq(vocabulary.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy từ vựng' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  // Collections CRUD
  app.get('/collections', async (c) => {
    const userId = await getDefaultUserId(db);
    const rows = await db
      .select()
      .from(vocabularyCollections)
      .where(eq(vocabularyCollections.userId, userId))
      .orderBy(asc(vocabularyCollections.sortOrder), asc(vocabularyCollections.createdAt));

    const counts =
      rows.length > 0
        ? await db
            .select({
              collectionId: vocabularyCollectionItems.collectionId,
              count: sql<number>`count(*)::int`,
            })
            .from(vocabularyCollectionItems)
            .where(
              inArray(
                vocabularyCollectionItems.collectionId,
                rows.map((r) => r.id),
              ),
            )
            .groupBy(vocabularyCollectionItems.collectionId)
        : [];
    const countMap = new Map(counts.map((r) => [r.collectionId, Number(r.count)]));

    const result: CollectionDto[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      isSystem: r.isSystem,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(),
      wordCount: countMap.get(r.id) ?? 0,
    }));

    return c.json(result);
  });

  app.post('/collections', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = collectionInputSchema.parse(body);

    const slug = await ensureUniqueCollectionSlug(db, userId, parsed.name);
    const [created] = await db
      .insert(vocabularyCollections)
      .values({
        userId,
        name: normalizeUnicode(parsed.name),
        slug,
        description: normalizeUnicode(parsed.description),
        isSystem: false,
        sortOrder: 100,
      })
      .returning();

    const dto: CollectionDto = {
      id: created.id,
      name: created.name,
      slug: created.slug,
      description: created.description,
      isSystem: created.isSystem,
      sortOrder: created.sortOrder,
      createdAt: created.createdAt.toISOString(),
      wordCount: 0,
    };

    return c.json(dto, 201);
  });

  app.delete('/collections/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy bộ sưu tập' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(vocabularyCollections)
      .where(
        and(eq(vocabularyCollections.id, id), eq(vocabularyCollections.userId, userId)),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy bộ sưu tập' }, 404);
    }
    if (existing.isSystem) {
      return c.json({ error: 'Không thể xóa bộ sưu tập mặc định của hệ thống' }, 400);
    }

    await db.delete(vocabularyCollections).where(eq(vocabularyCollections.id, id));
    return c.json({ deleted: true, id });
  });

  // Tags CRUD
  app.get('/tags', async (c) => {
    const userId = await getDefaultUserId(db);
    const rows = await db
      .select()
      .from(vocabularyTags)
      .where(eq(vocabularyTags.userId, userId))
      .orderBy(asc(vocabularyTags.name));

    const counts =
      rows.length > 0
        ? await db
            .select({
              tagId: vocabularyTagItems.tagId,
              count: sql<number>`count(*)::int`,
            })
            .from(vocabularyTagItems)
            .where(
              inArray(
                vocabularyTagItems.tagId,
                rows.map((r) => r.id),
              ),
            )
            .groupBy(vocabularyTagItems.tagId)
        : [];
    const countMap = new Map(counts.map((r) => [r.tagId, Number(r.count)]));

    const result: TagDto[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      color: r.color,
      wordCount: countMap.get(r.id) ?? 0,
    }));

    return c.json(result);
  });

  app.post('/tags', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = tagInputSchema.parse(body);

    const name = normalizeUnicode(parsed.name);
    const slug = slugify(name);

    const [existing] = await db
      .select()
      .from(vocabularyTags)
      .where(and(eq(vocabularyTags.userId, userId), eq(vocabularyTags.slug, slug)))
      .limit(1);

    if (existing) {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(vocabularyTagItems)
        .where(eq(vocabularyTagItems.tagId, existing.id));
      return c.json(
        {
          id: existing.id,
          name: existing.name,
          slug: existing.slug,
          color: existing.color,
          wordCount: Number(countRow?.count ?? 0),
        } satisfies TagDto,
        200,
      );
    }

    const [created] = await db
      .insert(vocabularyTags)
      .values({
        userId,
        name,
        slug,
        color: parsed.color || '#0F766E',
      })
      .returning();

    return c.json(
      {
        id: created.id,
        name: created.name,
        slug: created.slug,
        color: created.color,
        wordCount: 0,
      } satisfies TagDto,
      201,
    );
  });

  app.delete('/tags/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy nhãn' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(vocabularyTags)
      .where(and(eq(vocabularyTags.id, id), eq(vocabularyTags.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy nhãn' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  // Word Comparisons CRUD
  app.get('/comparisons', async (c) => {
    const userId = await getDefaultUserId(db);
    const groups = await db
      .select()
      .from(wordComparisonGroups)
      .where(eq(wordComparisonGroups.userId, userId))
      .orderBy(desc(wordComparisonGroups.updatedAt));

    if (groups.length === 0) return c.json([]);

    const items = await db
      .select()
      .from(wordComparisonItems)
      .where(
        inArray(
          wordComparisonItems.groupId,
          groups.map((g) => g.id),
        ),
      )
      .orderBy(asc(wordComparisonItems.sortOrder));

    const result: WordComparisonGroupDto[] = groups.map((g) => ({
      id: g.id,
      title: g.title,
      summaryVi: g.summaryVi,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      items: items
        .filter((it) => it.groupId === g.id)
        .map((it) => ({
          id: it.id,
          groupId: it.groupId,
          vocabularyId: it.vocabularyId,
          label: it.label,
          meaningVi: it.meaningVi,
          grammarDiff: it.grammarDiff,
          usageContext: it.usageContext,
          exampleEn: it.exampleEn,
          exampleVi: it.exampleVi,
          commonMistakeVi: it.commonMistakeVi,
          sortOrder: it.sortOrder,
        })),
    }));

    return c.json(result);
  });

  app.post('/comparisons', async (c) => {
    const userId = await getDefaultUserId(db);
    const body = await c.req.json();
    const parsed = comparisonGroupInputSchema.parse(body);

    const [group] = await db
      .insert(wordComparisonGroups)
      .values({
        userId,
        title: normalizeUnicode(parsed.title),
        summaryVi: normalizeUnicode(parsed.summaryVi),
      })
      .returning();

    const resolvedItems = await resolveComparisonItemsVocabularyIds(
      db,
      userId,
      parsed.items,
    );
    const insertedItems = await db
      .insert(wordComparisonItems)
      .values(resolvedItems.map((it) => ({ ...it, groupId: group.id })))
      .returning();

    const dto: WordComparisonGroupDto = {
      id: group.id,
      title: group.title,
      summaryVi: group.summaryVi,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      items: insertedItems.map((it) => ({
        id: it.id,
        groupId: it.groupId,
        vocabularyId: it.vocabularyId,
        label: it.label,
        meaningVi: it.meaningVi,
        grammarDiff: it.grammarDiff,
        usageContext: it.usageContext,
        exampleEn: it.exampleEn,
        exampleVi: it.exampleVi,
        commonMistakeVi: it.commonMistakeVi,
        sortOrder: it.sortOrder,
      })),
    };

    return c.json(dto, 201);
  });

  app.patch('/comparisons/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy nhóm so sánh' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const [existing] = await db
      .select()
      .from(wordComparisonGroups)
      .where(and(eq(wordComparisonGroups.id, id), eq(wordComparisonGroups.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'Không tìm thấy nhóm so sánh' }, 404);
    }

    const body = await c.req.json();
    const parsed = comparisonGroupInputSchema.partial().parse(body);

    const [updated] = await db
      .update(wordComparisonGroups)
      .set({
        ...(parsed.title !== undefined ? { title: normalizeUnicode(parsed.title) } : {}),
        ...(parsed.summaryVi !== undefined
          ? { summaryVi: normalizeUnicode(parsed.summaryVi) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(wordComparisonGroups.id, id))
      .returning();

    if (parsed.items !== undefined) {
      await db.delete(wordComparisonItems).where(eq(wordComparisonItems.groupId, id));
      if (parsed.items.length > 0) {
        const resolvedItems = await resolveComparisonItemsVocabularyIds(
          db,
          userId,
          parsed.items,
        );
        await db
          .insert(wordComparisonItems)
          .values(resolvedItems.map((it) => ({ ...it, groupId: id })));
      }
    }

    const items = await db
      .select()
      .from(wordComparisonItems)
      .where(eq(wordComparisonItems.groupId, id))
      .orderBy(asc(wordComparisonItems.sortOrder));

    const dto: WordComparisonGroupDto = {
      id: updated.id,
      title: updated.title,
      summaryVi: updated.summaryVi,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      items: items.map((it) => ({
        id: it.id,
        groupId: it.groupId,
        vocabularyId: it.vocabularyId,
        label: it.label,
        meaningVi: it.meaningVi,
        grammarDiff: it.grammarDiff,
        usageContext: it.usageContext,
        exampleEn: it.exampleEn,
        exampleVi: it.exampleVi,
        commonMistakeVi: it.commonMistakeVi,
        sortOrder: it.sortOrder,
      })),
    };

    return c.json(dto);
  });

  app.delete('/comparisons/:id', async (c) => {
    const id = c.req.param('id');
    if (!isUuid(id)) {
      return c.json({ error: 'Không tìm thấy nhóm so sánh' }, 404);
    }

    const userId = await getDefaultUserId(db);
    const deleted = await db
      .delete(wordComparisonGroups)
      .where(and(eq(wordComparisonGroups.id, id), eq(wordComparisonGroups.userId, userId)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Không tìm thấy nhóm so sánh' }, 404);
    }

    return c.json({ deleted: true, id });
  });

  return app;
}
