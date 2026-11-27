import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { createDatabase, type DatabaseHandle } from '../../src/server/db/index.js';
import { seedDatabase } from '../../src/server/db/seed.js';
import { parseBulkVocabulary } from '../../src/shared/bulkParser.js';
import { todayIsoDate } from '../../src/shared/schemas.js';
import type {
  BulkSessionVocabResponseDto,
  DailyReviewDto,
  DashboardAnalyticsDto,
  GrammarCategoryDto,
  GrammarTopicDetailDto,
  GrammarTopicListItemDto,
  ImportCommitResponseDto,
  ImportParseResponseDto,
  InsightsAnalyticsDto,
  MistakeDto,
  PracticeAttemptResponseDto,
  PracticeQuestionDto,
  PracticeSessionDto,
  PracticeSetDto,
  SessionCompletionPreviewDto,
  SessionDetailDto,
  VocabularyDetailDto,
  VocabularyListItemDto,
  WordComparisonGroupDto,
  GeneratedVocabQuizItemDto,
} from '../../src/shared/apiTypes.js';

interface TestContext {
  handle: DatabaseHandle;
  app: Hono;
}

const openHandles: DatabaseHandle[] = [];

async function setupInMemoryContext(): Promise<TestContext> {
  const handle = await createDatabase({ inMemory: true });
  openHandles.push(handle);
  await seedDatabase(handle.db);
  const app = createApp(handle.db);
  return { handle, app };
}

afterEach(async () => {
  while (openHandles.length > 0) {
    const handle = openHandles.pop();
    if (handle) {
      await handle.close();
    }
  }
});

async function requestJson<T>(
  app: Hono,
  urlPath: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  },
): Promise<{ status: number; data: T }> {
  const method = options?.method ?? 'GET';
  const init: RequestInit = { method };
  if (options?.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  const response = await app.request(urlPath, init);
  const data = (await response.json()) as T;
  return { status: response.status, data };
}

describe('English Learning OS V1 — End-to-End API & Persistence Integration Tests', () => {
  it(
    'Scenario 1 — After Class: creates draft session, bulk-adds 20 words, flags duplicate without duplicating global vocab, links 2 grammar topics, autosaves notes, previews, and completes with bidirectional SM-2 states',
    async () => {
      const { app } = await setupInMemoryContext();

      // Capture baseline global vocabulary count (12 seeded starter words)
      const baselineVocab = await requestJson<VocabularyListItemDto[]>(app, '/api/vocabulary');
      expect(baselineVocab.status).toBe(200);
      const initialGlobalCount = baselineVocab.data.length;
      expect(initialGlobalCount).toBe(12);

      // 1. Create draft session (english_class)
      const createSessionRes = await requestJson<SessionDetailDto>(app, '/api/sessions', {
        method: 'POST',
        body: {
          title: 'Buổi học Tiếng Anh học thuật tối thứ Tư',
          learningDate: todayIsoDate(),
          sourceType: 'english_class',
          learningType: 'Từ vựng & Ngữ pháp trên lớp',
          generalNotes: 'Ghi chú ban đầu',
        },
      });
      expect(createSessionRes.status).toBe(201);
      const sessionId = createSessionRes.data.id;
      expect(createSessionRes.data.status).toBe('draft');
      expect(createSessionRes.data.sourceType).toBe('english_class');

      // 2. Parse 20 distinct Vietnamese-English vocabulary pairs via parseBulkVocabulary and commit
      const twentyPairsText = [
        'ubiquitous | có mặt ở khắp nơi | Smartphones have become ubiquitous in modern life. | Điện thoại thông minh đã phổ biến khắp nơi.',
        'pragmatic | thực tế, thực dụng | We need a pragmatic approach to solve this issue. | Chúng ta cần cách tiếp cận thực tế để giải quyết vấn đề này.',
        'mitigate | giảm nhẹ, làm dịu bớt | Trees help mitigate the effects of urban heat. | Cây xanh giúp giảm nhẹ tác động của nhiệt độ đô thị.',
        'sustainable | bền vững, lâu dài | Sustainable energy is vital for future generations. | Năng lượng bền vững rất thiết yếu cho thế hệ tương lai.',
        'prerequisite | điều kiện tiên quyết | Strong grammar is a prerequisite for fluent writing. | Ngữ pháp vững là điều kiện tiên quyết để viết trôi chảy.',
        'lucrative | sinh lợi, béo bở | Software engineering remains a lucrative career path. | Kỹ thuật phần mềm vẫn là con đường nghề nghiệp sinh lợi cao.',
        'scrutinize | xem xét kỹ lưỡng | Auditors scrutinize every financial statement carefully. | Kiểm toán viên xem xét kỹ lưỡng từng báo cáo tài chính.',
        'proficient | thành thạo, vững tay nghề | She is proficient in both spoken and written English. | Cô ấy thành thạo cả tiếng Anh nói và viết.',
        'deteriorate | trở nên tệ hơn, xuống cấp | Air quality can deteriorate rapidly in winter. | Chất lượng không khí có thể xuống cấp nhanh vào mùa đông.',
        'endeavor | nỗ lực, cố gắng hết sức | Every learner must endeavor to review consistently. | Mỗi người học cần nỗ lực ôn tập đều đặn.',
        'alleviate | xoa dịu, làm nhẹ gánh nặng | Clear notes alleviate revision stress before exams. | Ghi chú rõ ràng giúp giảm bớt áp lực ôn thi.',
        'foster | nuôi dưỡng, thúc đẩy | Daily reading helps foster natural vocabulary retention. | Đọc mỗi ngày giúp nuôi dưỡng khả năng nhớ từ tự nhiên.',
        'coherent | mạch lạc, chặt chẽ | A good essay presents a coherent argument. | Một bài luận hay trình bày lập luận mạch lạc.',
        'perseverance | sự kiên trì, bền bỉ | Language mastery requires patience and perseverance. | Thành thạo ngôn ngữ đòi hỏi sự kiên nhẫn và bền bỉ.',
        'contemplate | suy ngẫm, cân nhắc kỹ | He paused to contemplate the professor’s question. | Anh ấy dừng lại để suy ngẫm câu hỏi của giảng viên.',
        'indispensable | không thể thiếu được | Active recall is an indispensable study technique. | Nhớ chủ động là kỹ thuật học không thể thiếu được.',
        'ambiguous | mơ hồ, lưỡng nghĩa | Avoid ambiguous phrasing in formal reports. | Tránh cách diễn đạt mơ hồ trong báo cáo trang trọng.',
        'eloquent | hùng biện, lưu loát | She delivered an eloquent presentation in English. | Cô ấy có bài thuyết trình tiếng Anh đầy thuyết phục.',
        'fluctuate | dao động, lên xuống thất thường | Commodity prices fluctuate throughout the year. | Giá hàng hóa dao động suốt cả năm.',
        'incentive | động lực, sự khích lệ | Clear progress charts provide strong incentive to study. | Biểu đồ tiến độ rõ ràng tạo động lực học tập mạnh mẽ.',
      ].join('\n');

      const parsedBulk = parseBulkVocabulary(twentyPairsText);
      expect(parsedBulk.totalNonEmptyLines).toBe(20);
      expect(parsedBulk.duplicateInBatchCount).toBe(0);
      expect(parsedBulk.incompleteCount).toBe(0);

      const bulkCommitRes = await requestJson<BulkSessionVocabResponseDto>(
        app,
        `/api/sessions/${sessionId}/vocabulary/bulk`,
        {
          method: 'POST',
          body: {
            rows: parsedBulk.rows.map((r) => ({
              word: r.word,
              vietnameseMeaning: r.vietnameseMeaning,
              ipa: r.ipa,
              exampleSentence: r.exampleSentence,
              exampleTranslation: r.exampleTranslation,
            })),
            addedVia: 'bulk_paste',
            duplicateStrategy: 'link_existing',
          },
        },
      );
      expect(bulkCommitRes.status).toBe(201);
      expect(bulkCommitRes.data.addedCount).toBe(20);
      expect(bulkCommitRes.data.linkedExistingCount).toBe(0);
      expect(bulkCommitRes.data.skippedCount).toBe(0);
      expect(bulkCommitRes.data.items).toHaveLength(20);

      // 3. Add/link a duplicate word ('meticulous' already exists in seed data and starter session)
      const duplicateLinkRes = await requestJson<{
        item: { vocabularyId: string; word: string };
        isExisting: boolean;
        vocabularyId: string;
      }>(app, `/api/sessions/${sessionId}/vocabulary`, {
        method: 'POST',
        body: {
          word: 'Meticulous',
          vietnameseMeaning: 'tỉ mỉ, kỹ lưỡng',
          sessionNote: 'Thầy nhắc lại từ này trong bài viết mẫu',
        },
      });
      expect(duplicateLinkRes.status).toBe(201);
      expect(duplicateLinkRes.data.isExisting).toBe(true);

      const meticulousSearchRes = await requestJson<VocabularyListItemDto[]>(
        app,
        '/api/vocabulary?search=meticulous',
      );
      expect(meticulousSearchRes.status).toBe(200);
      expect(meticulousSearchRes.data).toHaveLength(1);
      expect(meticulousSearchRes.data[0].normalizedWord).toBe('meticulous');
      expect(meticulousSearchRes.data[0].id).toBe(duplicateLinkRes.data.vocabularyId);

      // 4. Add 2 grammar topics to the session (one existing + one newly created)
      const [topicsRes, categoriesRes] = await Promise.all([
        requestJson<GrammarTopicListItemDto[]>(app, '/api/grammar/topics'),
        requestJson<GrammarCategoryDto[]>(app, '/api/grammar/categories'),
      ]);
      expect(topicsRes.status).toBe(200);
      expect(categoriesRes.status).toBe(200);
      const existingTopic = topicsRes.data[0];
      const clausesCategory =
        categoriesRes.data.find((c) => c.slug === 'clauses') ?? categoriesRes.data[0];

      const linkExistingGrammarRes = await requestJson<{ topicId: string }>(
        app,
        `/api/sessions/${sessionId}/grammar`,
        {
          method: 'POST',
          body: {
            existingTopicId: existingTopic.id,
            sessionNote: 'Ôn lại cách dùng trong bài luận',
          },
        },
      );
      expect(linkExistingGrammarRes.status).toBe(201);

      const linkNewGrammarRes = await requestJson<{ topicId: string }>(
        app,
        `/api/sessions/${sessionId}/grammar`,
        {
          method: 'POST',
          body: {
            newTopic: {
              categoryId: clausesCategory.id,
              title: 'Concessive Clauses with Although and Despite',
              titleVi: 'Mệnh đề nhượng bộ với Although và Despite',
              difficulty: 'intermediate',
              cefrLevel: 'B2',
              learningStatus: 'learning',
              formula: 'Although + S + V | Despite + N/V-ing',
              explanationVi:
                'Dùng để nối hai vế câu mang nghĩa tương phản mà không gây lỗi ngữ pháp với giới từ.',
            },
            sessionNote: 'Điểm ngữ pháp mới trong buổi học tối',
          },
        },
      );
      expect(linkNewGrammarRes.status).toBe(201);

      // 5. Autosave general notes via PATCH /api/sessions/:id
      const updatedNotes =
        'Đã tổng hợp đủ 20 từ mới, liên kết lại từ meticulous và 2 điểm ngữ pháp trọng tâm.';
      const autosaveRes = await requestJson<SessionDetailDto>(
        app,
        `/api/sessions/${sessionId}`,
        {
          method: 'PATCH',
          body: { generalNotes: updatedNotes },
        },
      );
      expect(autosaveRes.status).toBe(200);
      expect(autosaveRes.data.generalNotes).toBe(updatedNotes);

      // 6. Check completion preview
      const previewRes = await requestJson<SessionCompletionPreviewDto>(
        app,
        `/api/sessions/${sessionId}/completion-preview`,
      );
      expect(previewRes.status).toBe(200);
      expect(previewRes.data.vocabCount).toBeGreaterThanOrEqual(20);
      expect(previewRes.data.vocabCount).toBe(21);
      expect(previewRes.data.grammarCount).toBe(2);
      expect(
        previewRes.data.duplicateWarnings.some(
          (w) => w.word.toLowerCase() === 'meticulous' && w.sessionCount >= 2,
        ),
      ).toBe(true);

      // 7. Complete session and verify status, global vocab count, and initial bidirectional SM-2 states
      const completeRes = await requestJson<SessionDetailDto>(
        app,
        `/api/sessions/${sessionId}/complete`,
        { method: 'POST' },
      );
      expect(completeRes.status).toBe(200);
      expect(completeRes.data.status).toBe('completed');
      expect(completeRes.data.completedAt).not.toBeNull();

      const afterVocabRes = await requestJson<VocabularyListItemDto[]>(app, '/api/vocabulary');
      expect(afterVocabRes.status).toBe(200);
      expect(afterVocabRes.data.length).toBe(initialGlobalCount + 20);

      const newWordItem = completeRes.data.vocabulary.find(
        (v) => v.normalizedWord === 'ubiquitous',
      );
      expect(newWordItem).toBeDefined();
      const directions = new Set(newWordItem!.reviewStates.map((s) => s.skillDirection));
      expect(directions.has('en_to_vi')).toBe(true);
      expect(directions.has('vi_to_en')).toBe(true);

      for (const state of newWordItem!.reviewStates) {
        expect(state.status).toBe('new');
        expect(state.easeFactor).toBe(2.5);
        expect(state.intervalDays).toBe(0);
        expect(state.repetitions).toBe(0);
        expect(state.lapses).toBe(0);
      }
    },
    30_000,
  );

  it(
    'Scenario 2 — Vocabulary: searches affect, inspects full detail, creates/fetches comparison group, and updates en_to_vi (rating 4) & vi_to_en (rating 1) SM-2 states independently',
    async () => {
      const { app } = await setupInMemoryContext();

      // 1. Search vocabulary for 'affect'
      const searchRes = await requestJson<VocabularyListItemDto[]>(
        app,
        '/api/vocabulary?search=affect',
      );
      expect(searchRes.status).toBe(200);
      const affectSummary = searchRes.data.find((v) => v.normalizedWord === 'affect');
      expect(affectSummary).toBeDefined();

      // 2. Inspect full detail
      const detailBeforeRes = await requestJson<VocabularyDetailDto>(
        app,
        `/api/vocabulary/${affectSummary!.id}`,
      );
      expect(detailBeforeRes.status).toBe(200);
      const detailBefore = detailBeforeRes.data;
      expect(detailBefore.examples.length).toBeGreaterThan(0);
      expect(detailBefore.vietnameseMeaning).toContain('ảnh hưởng');
      expect(detailBefore.vnCommonMistakes).toContain('affect');
      expect(detailBefore.vnConfusingWords).toContain('effect');
      expect(detailBefore.vnTranslationTraps.length).toBeGreaterThan(0);
      expect(detailBefore.reviewStates.some((s) => s.skillDirection === 'en_to_vi')).toBe(true);
      expect(detailBefore.reviewStates.some((s) => s.skillDirection === 'vi_to_en')).toBe(true);

      // 3. Create and fetch Similar Word Comparison group
      const createComparisonRes = await requestJson<WordComparisonGroupDto>(
        app,
        '/api/comparisons',
        {
          method: 'POST',
          body: {
            title: 'Affect vs Effect vs Impact',
            summaryVi: 'Phân biệt động từ affect và các danh từ/động từ dễ nhầm nghĩa.',
            items: [
              {
                vocabularyId: affectSummary!.id,
                label: 'affect (v)',
                meaningVi: 'tác động trực tiếp làm thay đổi',
                grammarDiff: 'Ngoại động từ, không dùng giới từ to/on sau affect',
                usageContext: 'Nguyên nhân – kết quả trong học thuật và giao tiếp',
                exampleEn: 'Lack of sleep directly affects concentration.',
                exampleVi: 'Thiếu ngủ ảnh hưởng trực tiếp đến sự tập trung.',
                commonMistakeVi: 'Sai: affect to my study',
              },
              {
                label: 'impact (n/v)',
                meaningVi: 'tác động mạnh mẽ, ảnh hưởng sâu rộng',
                grammarDiff: 'Danh từ đi với on: have an impact on; động từ có thể đi trực tiếp',
                usageContext: 'Nhấn mạnh mức độ tác động rõ rệt',
                exampleEn: 'Remote work has had a major impact on cities.',
                exampleVi: 'Làm việc từ xa đã tạo tác động lớn lên các đô thị.',
                commonMistakeVi: 'Sai: impact to cities',
              },
            ],
          },
        },
      );
      expect(createComparisonRes.status).toBe(201);
      expect(createComparisonRes.data.items).toHaveLength(2);

      const listComparisonsRes = await requestJson<WordComparisonGroupDto[]>(
        app,
        '/api/comparisons',
      );
      expect(listComparisonsRes.status).toBe(200);
      expect(
        listComparisonsRes.data.some((g) => g.id === createComparisonRes.data.id),
      ).toBe(true);

      // 4. Generate bidirectional practice quizzes (en_to_vi and vi_to_en)
      const [enToViQuizRes, viToEnQuizRes] = await Promise.all([
        requestJson<GeneratedVocabQuizItemDto[]>(app, '/api/practice/vocabulary/generate', {
          method: 'POST',
          body: {
            mode: 'en_to_vi',
            vocabularyIds: [affectSummary!.id],
            limit: 5,
          },
        }),
        requestJson<GeneratedVocabQuizItemDto[]>(app, '/api/practice/vocabulary/generate', {
          method: 'POST',
          body: {
            mode: 'vi_to_en',
            vocabularyIds: [affectSummary!.id],
            limit: 5,
          },
        }),
      ]);

      expect(enToViQuizRes.status).toBe(200);
      expect(viToEnQuizRes.status).toBe(200);
      expect(enToViQuizRes.data).toHaveLength(1);
      expect(viToEnQuizRes.data).toHaveLength(1);

      const enToViQuiz = enToViQuizRes.data[0];
      const viToEnQuiz = viToEnQuizRes.data[0];
      expect(enToViQuiz.direction).toBe('en_to_vi');
      expect(viToEnQuiz.direction).toBe('vi_to_en');
      expect(viToEnQuiz.correctAnswer).toBe('affect');

      // Create practice session and submit rating 4 for en_to_vi, rating 1 for vi_to_en
      const practiceSessionRes = await requestJson<PracticeSessionDto>(
        app,
        '/api/practice/sessions',
        {
          method: 'POST',
          body: {
            domain: 'vocabulary',
            mode: 'en_to_vi',
            title: 'Luyện tập 2 chiều cho từ affect',
            totalItems: 2,
          },
        },
      );
      expect(practiceSessionRes.status).toBe(201);
      const practiceSessionId = practiceSessionRes.data.id;

      const enToViAttemptRes = await requestJson<PracticeAttemptResponseDto>(
        app,
        `/api/practice/sessions/${practiceSessionId}/attempts`,
        {
          method: 'POST',
          body: {
            vocabularyId: affectSummary!.id,
            mode: 'en_to_vi',
            direction: 'en_to_vi',
            userAnswer: enToViQuiz.correctAnswer,
            expectedAnswer: enToViQuiz.correctAnswer,
            isCorrect: true,
            selfRating: 4,
            responseTimeMs: 1800,
          },
        },
      );
      expect(enToViAttemptRes.status).toBe(201);
      expect(enToViAttemptRes.data.updatedVocabReviewState?.skillDirection).toBe('en_to_vi');

      const viToEnAttemptRes = await requestJson<PracticeAttemptResponseDto>(
        app,
        `/api/practice/sessions/${practiceSessionId}/attempts`,
        {
          method: 'POST',
          body: {
            vocabularyId: affectSummary!.id,
            mode: 'vi_to_en',
            direction: 'vi_to_en',
            userAnswer: 'effect',
            expectedAnswer: 'affect',
            isCorrect: false,
            selfRating: 1,
            responseTimeMs: 3200,
          },
        },
      );
      expect(viToEnAttemptRes.status).toBe(201);
      expect(viToEnAttemptRes.data.updatedVocabReviewState?.skillDirection).toBe('vi_to_en');

      // 5. Verify independent SM-2 review state updates via GET /api/vocabulary/:id
      const detailAfterRes = await requestJson<VocabularyDetailDto>(
        app,
        `/api/vocabulary/${affectSummary!.id}`,
      );
      expect(detailAfterRes.status).toBe(200);
      expect(
        detailAfterRes.data.comparisonGroups.some(
          (g) => g.id === createComparisonRes.data.id,
        ),
      ).toBe(true);

      const enToViAfter = detailAfterRes.data.enToViState!;
      const viToEnAfter = detailAfterRes.data.viToEnState!;
      expect(enToViAfter).not.toBeNull();
      expect(viToEnAfter).not.toBeNull();

      // Seeded en_to_vi (reps=1, interval=1, ef=2.5, lapses=0) + rating 4 -> reps=2, interval=8, ef=2.65, lapses=0
      expect(enToViAfter.lastRating).toBe(4);
      expect(enToViAfter.intervalDays).toBe(8);
      expect(enToViAfter.lapses).toBe(0);
      expect(enToViAfter.easeFactor).toBe(2.65);

      // Seeded vi_to_en (reps=1, interval=1, ef=2.35, lapses=2) + rating 1 -> reps=0, interval=1, ef=2.15, lapses=3
      expect(viToEnAfter.lastRating).toBe(1);
      expect(viToEnAfter.intervalDays).toBe(1);
      expect(viToEnAfter.lapses).toBe(3);
      expect(viToEnAfter.easeFactor).toBe(2.15);

      expect(enToViAfter.intervalDays).not.toBe(viToEnAfter.intervalDays);
      expect(enToViAfter.lapses).not.toBe(viToEnAfter.lapses);
      expect(enToViAfter.easeFactor).not.toBe(viToEnAfter.easeFactor);
    },
    30_000,
  );

  it(
    'Scenario 3 — Grammar: verifies 16 categories, creates Present Perfect Continuous with examples & common mistakes, adds linked question, submits practice attempt, and verifies updated grammarReviewStates & topic detail',
    async () => {
      const { app } = await setupInMemoryContext();

      // 1. Fetch categories and verify 16 built-in categories exist
      const categoriesRes = await requestJson<GrammarCategoryDto[]>(
        app,
        '/api/grammar/categories',
      );
      expect(categoriesRes.status).toBe(200);
      expect(categoriesRes.data).toHaveLength(16);
      expect(categoriesRes.data.every((c) => c.isSystem)).toBe(true);

      const tensesCat = categoriesRes.data.find((c) => c.slug === 'tenses')!;
      expect(tensesCat).toBeDefined();

      // 2. Create custom grammar lesson with Vietnamese explanation, formula, examples, and common mistakes
      const createTopicRes = await requestJson<GrammarTopicDetailDto>(
        app,
        '/api/grammar/topics',
        {
          method: 'POST',
          body: {
            categoryId: tensesCat.id,
            title: 'Present Perfect Continuous',
            titleVi: 'Thì Hiện tại hoàn thành tiếp diễn',
            difficulty: 'intermediate',
            cefrLevel: 'B2',
            learningStatus: 'learning',
            explanationVi:
              'Diễn tả hành động bắt đầu trong quá khứ, kéo dài liên tục đến hiện tại và nhấn mạnh quá trình hoặc dấu hiệu còn sót lại.',
            formula: 'S + have/has + been + V-ing',
            usageNotes: 'Không dùng với động từ trạng thái (know, believe, own).',
            examples: [
              {
                englishSentence: 'She has been practicing speaking English for two hours.',
                vietnameseTranslation:
                  'Cô ấy đã luyện nói tiếng Anh liên tục suốt hai tiếng đồng hồ rồi.',
                structureHighlight: 'has been practicing',
                isCommonMistake: false,
              },
              {
                englishSentence: 'I have known my mentor since 2021.',
                vietnameseTranslation: 'Tôi đã quen biết người hướng dẫn từ năm 2021.',
                structureHighlight: 'have known',
                isCommonMistake: true,
                incorrectVersion: 'I have been knowing my mentor since 2021.',
                correctionNote:
                  'Động từ chỉ trạng thái "know" không chia ở dạng tiếp diễn.',
              },
            ],
          },
        },
      );
      expect(createTopicRes.status).toBe(201);
      const topicId = createTopicRes.data.id;
      expect(createTopicRes.data.title).toBe('Present Perfect Continuous');
      expect(createTopicRes.data.examples).toHaveLength(2);

      // 3. Create a practice question linked to this topic
      const createQuestionRes = await requestJson<PracticeQuestionDto>(
        app,
        '/api/practice/questions',
        {
          method: 'POST',
          body: {
            grammarTopicId: topicId,
            questionType: 'fill_in_blank',
            prompt: 'They ______ (study) grammar together since 8 a.m.',
            promptVi: 'Chia động từ trong ngoặc theo thì Hiện tại hoàn thành tiếp diễn:',
            options: [],
            correctAnswer: 'have been studying',
            acceptableAnswers: ['have been studying', "'ve been studying"],
            explanationVi:
              'Hành động học diễn ra liên tục từ 8 giờ sáng đến hiện tại → have been studying.',
            difficulty: 'intermediate',
          },
        },
      );
      expect(createQuestionRes.status).toBe(201);
      const questionId = createQuestionRes.data.id;
      expect(createQuestionRes.data.grammarTopicId).toBe(topicId);

      // 4. Submit an attempt for this topic
      const practiceSessionRes = await requestJson<PracticeSessionDto>(
        app,
        '/api/practice/sessions',
        {
          method: 'POST',
          body: {
            domain: 'grammar',
            mode: 'fill_in_blank',
            title: 'Thực hành Hiện tại hoàn thành tiếp diễn',
            totalItems: 1,
          },
        },
      );
      expect(practiceSessionRes.status).toBe(201);

      const attemptRes = await requestJson<PracticeAttemptResponseDto>(
        app,
        `/api/practice/sessions/${practiceSessionRes.data.id}/attempts`,
        {
          method: 'POST',
          body: {
            grammarTopicId: topicId,
            questionId,
            mode: 'fill_in_blank',
            userAnswer: 'have been studying',
            expectedAnswer: 'have been studying',
            isCorrect: true,
            selfRating: 3,
            responseTimeMs: 3600,
          },
        },
      );
      expect(attemptRes.status).toBe(201);
      expect(attemptRes.data.updatedGrammarReviewState).not.toBeNull();
      expect(attemptRes.data.updatedGrammarReviewState!.repetitions).toBe(1);
      expect(attemptRes.data.updatedGrammarReviewState!.intervalDays).toBe(1);
      expect(attemptRes.data.updatedGrammarReviewState!.accuracyRate).toBe(1);

      // Verify GET /api/grammar/topics/:id returns examples, mistakes, linkedQuestions, and updated reviewState
      const topicDetailRes = await requestJson<GrammarTopicDetailDto>(
        app,
        `/api/grammar/topics/${topicId}`,
      );
      expect(topicDetailRes.status).toBe(200);
      expect(topicDetailRes.data.examples).toHaveLength(2);
      expect(topicDetailRes.data.examples.some((ex) => ex.isCommonMistake)).toBe(true);
      expect(topicDetailRes.data.linkedQuestions).toHaveLength(1);
      expect(topicDetailRes.data.linkedQuestions[0].id).toBe(questionId);
      expect(topicDetailRes.data.reviewState).not.toBeNull();
      expect(topicDetailRes.data.reviewState!.repetitions).toBe(1);
      expect(topicDetailRes.data.reviewState!.accuracyRate).toBe(1);
      expect(topicDetailRes.data.reviewState!.lastReviewedAt).not.toBeNull();

      // 5. Verify phrase_conjugation starter questions exist & creating a custom one works
      const phraseListRes = await requestJson<PracticeQuestionDto[]>(
        app,
        '/api/practice/questions?questionType=phrase_conjugation',
      );
      expect(phraseListRes.status).toBe(200);
      expect(phraseListRes.data.length).toBeGreaterThanOrEqual(8);
      expect(phraseListRes.data[0].options.length).toBeGreaterThan(0);

      const createPhraseRes = await requestJson<PracticeQuestionDto>(
        app,
        '/api/practice/questions',
        {
          method: 'POST',
          body: {
            grammarTopicId: topicId,
            questionType: 'phrase_conjugation',
            prompt: 'She / (practice) / grammar / for two hours',
            promptVi: 'Ghép cụm từ và chia đúng thì:',
            options: ['She', '(practice)', 'grammar', 'for two hours'],
            correctAnswer: 'She has been practicing grammar for two hours.',
            acceptableAnswers: ['She has been practicing grammar for two hours.'],
            explanationVi: 'Có "for two hours" nhấn mạnh quá trình liên tục → has been practicing.',
            difficulty: 'intermediate',
          },
        },
      );
      expect(createPhraseRes.status).toBe(201);
      expect(createPhraseRes.data.questionType).toBe('phrase_conjugation');
      expect(createPhraseRes.data.options).toEqual([
        'She',
        '(practice)',
        'grammar',
        'for two hours',
      ]);
    },
    30_000,
  );

  it(
    'Scenario 4 — Mistake Tracking: records incorrect grammar attempt as mistake, edits explanation & example, creates mistake practice set, verifies sentence_correction persistence, and marks mistake as reviewed',
    async () => {
      const { app } = await setupInMemoryContext();

      const topicsRes = await requestJson<GrammarTopicListItemDto[]>(app, '/api/grammar/topics');
      expect(topicsRes.status).toBe(200);
      const presentPerfectTopic = topicsRes.data.find((t) =>
        t.title.includes('Present Perfect'),
      )!;
      expect(presentPerfectTopic).toBeDefined();

      // 1. Submit incorrect grammar attempt with saveMistake
      const practiceSessionRes = await requestJson<PracticeSessionDto>(
        app,
        '/api/practice/sessions',
        {
          method: 'POST',
          body: {
            domain: 'grammar',
            mode: 'sentence_correction',
            title: 'Luyện tập phát hiện lỗi chia thì',
            totalItems: 1,
          },
        },
      );
      expect(practiceSessionRes.status).toBe(201);

      const attemptRes = await requestJson<PracticeAttemptResponseDto>(
        app,
        `/api/practice/sessions/${practiceSessionRes.data.id}/attempts`,
        {
          method: 'POST',
          body: {
            grammarTopicId: presentPerfectTopic.id,
            mode: 'sentence_correction',
            userAnswer: 'I am working at this company since 2021.',
            expectedAnswer: 'I have worked at this company since 2021.',
            isCorrect: false,
            selfRating: 1,
            responseTimeMs: 4500,
            saveMistake: {
              category: 'tense',
              explanationVi: 'Nhầm hiện tại tiếp diễn với hiện tại hoàn thành.',
              correctedExample: 'I have worked here since 2021.',
              sourceContext: 'Bài tập sửa câu thì',
            },
          },
        },
      );
      expect(attemptRes.status).toBe(201);
      expect(attemptRes.data.savedMistake).not.toBeNull();
      const mistakeId = attemptRes.data.savedMistake!.id;

      // 2. Verify mistake appears in GET /api/mistakes
      const listMistakesRes = await requestJson<MistakeDto[]>(
        app,
        '/api/mistakes?category=tense&status=active',
      );
      expect(listMistakesRes.status).toBe(200);
      const foundMistake = listMistakesRes.data.find((m) => m.id === mistakeId);
      expect(foundMistake).toBeDefined();
      expect(foundMistake!.originalInput).toBe('I am working at this company since 2021.');
      expect(foundMistake!.correctedVersion).toBe('I have worked at this company since 2021.');

      // 3. Update explanation & corrected example
      const updatedExplanation =
        'Có mốc "since 2021" nối quá khứ tới hiện tại nên bắt buộc dùng Present Perfect (have worked), không dùng Present Continuous.';
      const updatedCorrectedExample = 'She has taught English at this center since 2021.';
      const patchMistakeRes = await requestJson<MistakeDto>(
        app,
        `/api/mistakes/${mistakeId}`,
        {
          method: 'PATCH',
          body: {
            explanationVi: updatedExplanation,
            correctedExample: updatedCorrectedExample,
          },
        },
      );
      expect(patchMistakeRes.status).toBe(200);
      expect(patchMistakeRes.data.explanationVi).toBe(updatedExplanation);
      expect(patchMistakeRes.data.correctedExample).toBe(updatedCorrectedExample);

      // 4. Generate practice set from mistakes and verify persisted in DB via GET /api/practice/sets/:id
      const createSetRes = await requestJson<PracticeSetDto>(
        app,
        '/api/mistakes/create-practice-set',
        {
          method: 'POST',
          body: {
            title: 'Bộ bài tập sửa lỗi chia thì',
            mistakeIds: [mistakeId],
          },
        },
      );
      expect(createSetRes.status).toBe(201);
      expect(createSetRes.data.sourceType).toBe('mistake_bank');
      expect(createSetRes.data.questionCount).toBe(1);

      const getSetRes = await requestJson<PracticeSetDto>(
        app,
        `/api/practice/sets/${createSetRes.data.id}`,
      );
      expect(getSetRes.status).toBe(200);
      expect(getSetRes.data.questions).toHaveLength(1);
      expect(getSetRes.data.questions![0].questionType).toBe('sentence_correction');
      expect(getSetRes.data.questions![0].prompt).toBe(
        'I am working at this company since 2021.',
      );
      expect(getSetRes.data.questions![0].correctAnswer).toBe(
        'I have worked at this company since 2021.',
      );
      expect(getSetRes.data.questions![0].explanationVi).toContain(updatedCorrectedExample);

      // 5. Mark mistake as reviewed
      // Note: server route mistakes.ts transitions reviewCount/lastReviewedAt via `status: 'reviewed'`
      // (while client api.ts also types `markReviewed: boolean`). Sending both verifies the transition.
      const markReviewedRes = await requestJson<MistakeDto>(
        app,
        `/api/mistakes/${mistakeId}`,
        {
          method: 'PATCH',
          body: {
            status: 'reviewed',
            markReviewed: true,
          },
        },
      );
      expect(markReviewedRes.status).toBe(200);
      expect(markReviewedRes.data.status).toBe('reviewed');
      expect(markReviewedRes.data.reviewCount).toBe(1);
      expect(markReviewedRes.data.lastReviewedAt).not.toBeNull();
    },
    30_000,
  );

  it(
    'Scenario 5 — Long-term Retrieval: retrieves knowledge by word search, grammar topic, and original session, and verifies dashboard, insights, and daily-review reflect real stored DB rows',
    async () => {
      const { app } = await setupInMemoryContext();

      // Create an authentic completed learning session linking a new word and a new grammar topic
      const categoriesRes = await requestJson<GrammarCategoryDto[]>(
        app,
        '/api/grammar/categories',
      );
      const clausesCat = categoriesRes.data.find((c) => c.slug === 'clauses')!;

      const sessionCreateRes = await requestJson<SessionDetailDto>(app, '/api/sessions', {
        method: 'POST',
        body: {
          title: 'IELTS Reading & Clauses Retrieval Check',
          learningDate: todayIsoDate(),
          sourceType: 'reading',
          learningType: 'Đọc hiểu & Tổng hợp cấu trúc',
          generalNotes: 'Ghi chú truy xuất dài hạn.',
        },
      });
      expect(sessionCreateRes.status).toBe(201);
      const sessionId = sessionCreateRes.data.id;

      const addVocabRes = await requestJson<{ vocabularyId: string }>(
        app,
        `/api/sessions/${sessionId}/vocabulary`,
        {
          method: 'POST',
          body: {
            word: 'tenacious',
            vietnameseMeaning: 'kiên định, bền bỉ không bỏ cuộc',
            ipa: '/təˈneɪ.ʃəs/',
            partOfSpeech: 'adjective',
            cefrLevel: 'C1',
            exampleSentence: 'Tenacious learners keep reviewing even after making mistakes.',
            exampleTranslation:
              'Người học kiên định vẫn tiếp tục ôn tập ngay cả sau khi mắc lỗi.',
            sessionNote: 'Ghi chú trong buổi đọc hiểu',
          },
        },
      );
      expect(addVocabRes.status).toBe(201);
      const vocabId = addVocabRes.data.vocabularyId;

      const addGrammarRes = await requestJson<{ topicId: string }>(
        app,
        `/api/sessions/${sessionId}/grammar`,
        {
          method: 'POST',
          body: {
            newTopic: {
              categoryId: clausesCat.id,
              title: 'Participle Clauses',
              titleVi: 'Mệnh đề phân từ',
              difficulty: 'advanced',
              cefrLevel: 'C1',
              learningStatus: 'learning',
              formula: 'V-ing / V3-ed ..., S + V',
              explanationVi: 'Rút gọn mệnh đề cùng chủ ngữ bằng hiện tại phân từ hoặc quá khứ phân từ.',
            },
            sessionNote: 'Gặp 3 lần trong bài đọc',
          },
        },
      );
      expect(addGrammarRes.status).toBe(201);
      const topicId = addGrammarRes.data.topicId;

      const completeRes = await requestJson<SessionDetailDto>(
        app,
        `/api/sessions/${sessionId}/complete`,
        { method: 'POST' },
      );
      expect(completeRes.status).toBe(200);

      // Retrieval Path 1: By word search
      const vocabSearchRes = await requestJson<VocabularyListItemDto[]>(
        app,
        '/api/vocabulary?search=tenacious',
      );
      expect(vocabSearchRes.status).toBe(200);
      expect(vocabSearchRes.data).toHaveLength(1);
      expect(vocabSearchRes.data[0].id).toBe(vocabId);

      const vocabDetailRes = await requestJson<VocabularyDetailDto>(
        app,
        `/api/vocabulary/${vocabId}`,
      );
      expect(vocabDetailRes.status).toBe(200);
      expect(vocabDetailRes.data.linkedSessions.some((s) => s.sessionId === sessionId)).toBe(
        true,
      );

      // Retrieval Path 2: By grammar topic
      const grammarDetailRes = await requestJson<GrammarTopicDetailDto>(
        app,
        `/api/grammar/topics/${topicId}`,
      );
      expect(grammarDetailRes.status).toBe(200);
      expect(grammarDetailRes.data.title).toBe('Participle Clauses');
      expect(grammarDetailRes.data.linkedSessions.some((s) => s.sessionId === sessionId)).toBe(
        true,
      );

      // Retrieval Path 3: By original learning session
      const sessionDetailRes = await requestJson<SessionDetailDto>(
        app,
        `/api/sessions/${sessionId}`,
      );
      expect(sessionDetailRes.status).toBe(200);
      expect(sessionDetailRes.data.vocabulary.some((v) => v.vocabularyId === vocabId)).toBe(
        true,
      );
      expect(sessionDetailRes.data.grammarTopics.some((g) => g.topicId === topicId)).toBe(
        true,
      );

      // Verify analytics dashboard, insights, and daily review reflect exact stored DB rows
      const [allVocabRes, allTopicsRes, activeMistakesRes, dashboardRes, insightsRes, dailyReviewRes] =
        await Promise.all([
          requestJson<VocabularyListItemDto[]>(app, '/api/vocabulary'),
          requestJson<GrammarTopicListItemDto[]>(app, '/api/grammar/topics'),
          requestJson<MistakeDto[]>(app, '/api/mistakes?status=active'),
          requestJson<DashboardAnalyticsDto>(app, '/api/analytics/dashboard'),
          requestJson<InsightsAnalyticsDto>(app, '/api/analytics/insights'),
          requestJson<DailyReviewDto>(app, '/api/daily-review'),
        ]);

      expect(dashboardRes.status).toBe(200);
      expect(insightsRes.status).toBe(200);
      expect(dailyReviewRes.status).toBe(200);

      // 14 seeded grammar topics (all 12 tenses + conditionals + articles) + 1 added = 15 total grammar topics
      expect(dashboardRes.data.counts.totalVocabulary).toBe(allVocabRes.data.length);
      expect(dashboardRes.data.counts.totalVocabulary).toBe(13);
      expect(dashboardRes.data.counts.totalGrammarTopics).toBe(allTopicsRes.data.length);
      expect(dashboardRes.data.counts.totalGrammarTopics).toBe(15);
      expect(dashboardRes.data.counts.activeMistakesCount).toBe(activeMistakesRes.data.length);
      expect(dashboardRes.data.recentSessions.some((s) => s.id === sessionId)).toBe(true);
      expect(dashboardRes.data.todayActivity.vocabAddedCount).toBe(5);
      expect(dashboardRes.data.todayActivity.grammarReviewedCount).toBe(2);
      expect(dashboardRes.data.streak.currentStreak).toBeGreaterThanOrEqual(1);

      // Insights distributions sum directly to stored DB counts
      expect(insightsRes.data.dailySeries).toHaveLength(14);
      const totalByVocabStatus = insightsRes.data.vocabStatusDistribution.reduce(
        (sum, bucket) => sum + bucket.count,
        0,
      );
      expect(totalByVocabStatus).toBe(13);

      const totalMistakeBuckets = insightsRes.data.mistakeCategoryDistribution.reduce(
        (sum, bucket) => sum + bucket.count,
        0,
      );
      expect(totalMistakeBuckets).toBeGreaterThanOrEqual(activeMistakesRes.data.length);

      // Daily review surfaces stored due vocabulary, due grammar, and active mistakes
      expect(dailyReviewRes.data.totalDueVocabCount).toBeGreaterThan(0);
      expect(dailyReviewRes.data.dueVocabulary.length).toBeGreaterThan(0);
      expect(dailyReviewRes.data.dueGrammar.length).toBeGreaterThan(0);
      expect(dailyReviewRes.data.activeMistakes.length).toBe(activeMistakesRes.data.length);
      expect(dailyReviewRes.data.dueGrammar.some((g) => g.topicId === topicId)).toBe(true);
    },
    30_000,
  );

  it(
    'CSV Import & Export: parses uploaded CSV with Vietnamese diacritics & duplicate detection, commits new word, and exports CSV with UTF-8 BOM and diacritics intact',
    async () => {
      const { app } = await setupInMemoryContext();

      const csvContent = [
        'Word,IPA,Part of Speech,CEFR,Vietnamese Meaning,English Definition,Example Sentence,Example Translation,Tags,Personal Notes',
        'meticulous,/məˈtɪk.jə.ləs/,adjective,C1,tỉ mỉ,very careful,She is meticulous.,Cô ấy rất tỉ mỉ.,IELTS Writing,Đã có trong hệ thống',
        'resilience_csv_test,/rɪˈzɪl.i.əns/,noun,B2,"sự kiên cường, vững vàng và bền bỉ trong hoàn cảnh khó khăn",capacity to recover quickly,"Steady practice builds resilience in learning, vững vàng trước trở ngại.",Luyện tập đều đặn xây dựng sự kiên cường khi học.,IELTS Writing,Lưu ý chữ ữ ệ ợ ằ: bằng chứng lệ thuộc hợp lý',
      ].join('\r\n');

      const formData = new FormData();
      formData.append(
        'file',
        new File([csvContent], 'vocab-import.csv', { type: 'text/csv' }),
      );

      const parseRes = await app.request('/api/vocabulary/import/parse', {
        method: 'POST',
        body: formData,
      });
      expect(parseRes.status).toBe(200);
      const parsed = (await parseRes.json()) as ImportParseResponseDto;

      expect(parsed.totalRows).toBe(2);
      expect(parsed.columnMapping.word).toBe('Word');
      expect(parsed.columnMapping.vietnameseMeaning).toBe('Vietnamese Meaning');
      expect(parsed.previewRows[0].duplicateInDb).toBe(true);
      expect(parsed.previewRows[0].existingVocabId).toBeTruthy();
      expect(parsed.previewRows[1].duplicateInDb).toBe(false);
      expect(parsed.previewRows[1].vietnameseMeaning).toContain('vững');

      // Commit the parsed rows (skip duplicate meticulous, add resilience_csv_test)
      const commitRes = await requestJson<ImportCommitResponseDto>(
        app,
        '/api/vocabulary/import/commit',
        {
          method: 'POST',
          body: {
            rows: parsed.previewRows.map((r) => ({
              word: r.word,
              vietnameseMeaning: r.vietnameseMeaning,
              ipa: r.ipa,
              partOfSpeech: r.partOfSpeech,
              cefrLevel: r.cefrLevel,
              englishDefinition: r.englishDefinition,
              exampleSentence: r.exampleSentence,
              exampleTranslation: r.exampleTranslation,
              personalNotes: r.personalNotes,
              tags: r.tags,
            })),
            duplicateStrategy: 'skip',
          },
        },
      );
      expect(commitRes.status).toBe(201);
      expect(commitRes.data.addedCount).toBe(1);
      expect(commitRes.data.skippedCount).toBe(1);

      // Export CSV and verify raw UTF-8 BOM + Vietnamese diacritics
      const exportRes = await app.request('/api/vocabulary/export.csv');
      expect(exportRes.status).toBe(200);
      expect(exportRes.headers.get('Content-Type')).toContain('text/csv');

      const rawBytes = new Uint8Array(await exportRes.arrayBuffer());
      expect(rawBytes[0]).toBe(0xef);
      expect(rawBytes[1]).toBe(0xbb);
      expect(rawBytes[2]).toBe(0xbf);

      const decodedWithBom = new TextDecoder('utf-8', { ignoreBOM: true }).decode(rawBytes);
      expect(decodedWithBom.startsWith('\uFEFF')).toBe(true);
      expect(decodedWithBom).toContain('resilience_csv_test');
      expect(decodedWithBom).toContain('vững vàng');
      expect(decodedWithBom).toContain('tỉ mỉ, cẩn thận từng chi tiết');
      expect(decodedWithBom).toContain('ữ');
      expect(decodedWithBom).toContain('ệ');
      expect(decodedWithBom).toContain('ợ');
    },
    30_000,
  );

  it(
    'Scenario 6 — Real Disk Persistence: persists session, ephemeral_persist_test vocabulary, grammar topic, and mistake across full close and reopen on the same dataDir',
    async () => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'english-os-persist-'));
      const dataDir = path.join(tmpRoot, 'pgdata');

      let handle1: DatabaseHandle | null = null;
      let handle2: DatabaseHandle | null = null;

      try {
        handle1 = await createDatabase({ dataDir });
        await seedDatabase(handle1.db);
        const app1 = createApp(handle1.db);

        // 1. Create custom vocabulary word 'ephemeral_persist_test'
        const vocabRes = await requestJson<VocabularyDetailDto>(app1, '/api/vocabulary', {
          method: 'POST',
          body: {
            word: 'ephemeral_persist_test',
            ipa: '/ɪˈfem.ər.əl/',
            partOfSpeech: 'adjective',
            cefrLevel: 'C1',
            vietnameseMeaning: 'ngắn ngủi, chóng qua (dữ liệu kiểm thử bền vững)',
            englishDefinition: 'Lasting for a very short time.',
            personalNotes: 'Kiểm tra ghi đĩa thực tế của PGlite.',
          },
        });
        expect(vocabRes.status).toBe(201);
        const createdVocabId = vocabRes.data.id;

        // 2. Create custom learning session and link the custom word
        const sessionRes = await requestJson<SessionDetailDto>(app1, '/api/sessions', {
          method: 'POST',
          body: {
            title: 'Disk Persistence Verification Session',
            learningDate: todayIsoDate(),
            sourceType: 'self_study',
            learningType: 'Kiểm thử lưu trữ ổ đĩa',
            generalNotes: 'Phiên học này phải còn nguyên vẹn sau khi đóng và mở lại DB.',
          },
        });
        expect(sessionRes.status).toBe(201);
        const createdSessionId = sessionRes.data.id;

        const linkRes = await requestJson<{ vocabularyId: string }>(
          app1,
          `/api/sessions/${createdSessionId}/vocabulary`,
          {
            method: 'POST',
            body: { vocabularyId: createdVocabId },
          },
        );
        expect(linkRes.status).toBe(201);

        // 3. Create custom grammar topic
        const categoriesRes = await requestJson<GrammarCategoryDto[]>(
          app1,
          '/api/grammar/categories',
        );
        const advancedCat = categoriesRes.data.find((c) => c.slug === 'advanced-grammar')!;

        const grammarRes = await requestJson<GrammarTopicDetailDto>(
          app1,
          '/api/grammar/topics',
          {
            method: 'POST',
            body: {
              categoryId: advancedCat.id,
              title: 'Disk Persistence Inversion Structure',
              titleVi: 'Đảo ngữ kiểm thử lưu trữ',
              difficulty: 'advanced',
              cefrLevel: 'C1',
              learningStatus: 'learning',
              formula: 'Never + have + S + V3/ed',
              explanationVi: 'Cấu trúc đảo ngữ nhấn mạnh mức độ hiếm gặp.',
            },
          },
        );
        expect(grammarRes.status).toBe(201);
        const createdTopicId = grammarRes.data.id;

        // 4. Create custom mistake
        const mistakeRes = await requestJson<MistakeDto>(app1, '/api/mistakes', {
          method: 'POST',
          body: {
            category: 'word_order',
            vocabularyId: createdVocabId,
            grammarTopicId: createdTopicId,
            originalInput: 'Never I have seen such persistence.',
            correctedVersion: 'Never have I seen such persistence.',
            explanationVi: 'Khi dùng đảo ngữ với Never ở đầu câu, trợ động từ đảo lên trước chủ ngữ.',
            correctedExample: 'Never have I experienced a smoother restart.',
            sourceContext: 'Kiểm thử ổ đĩa',
          },
        });
        expect(mistakeRes.status).toBe(201);
        const createdMistakeId = mistakeRes.data.id;

        // Close first database handle completely
        await handle1.close();
        handle1 = null;

        // Reopen brand new database instance pointing to exact same dataDir
        handle2 = await createDatabase({ dataDir });
        const app2 = createApp(handle2.db);

        // Assert custom session is intact with linked word
        const reopenedSessionRes = await requestJson<SessionDetailDto>(
          app2,
          `/api/sessions/${createdSessionId}`,
        );
        expect(reopenedSessionRes.status).toBe(200);
        expect(reopenedSessionRes.data.title).toBe('Disk Persistence Verification Session');
        expect(
          reopenedSessionRes.data.vocabulary.some(
            (v) => v.word === 'ephemeral_persist_test',
          ),
        ).toBe(true);

        // Assert custom vocabulary word is intact
        const reopenedVocabRes = await requestJson<VocabularyListItemDto[]>(
          app2,
          '/api/vocabulary?search=ephemeral_persist_test',
        );
        expect(reopenedVocabRes.status).toBe(200);
        expect(reopenedVocabRes.data).toHaveLength(1);
        expect(reopenedVocabRes.data[0].id).toBe(createdVocabId);
        expect(reopenedVocabRes.data[0].vietnameseMeaning).toContain('ngắn ngủi');

        // Assert custom grammar topic is intact
        const reopenedGrammarRes = await requestJson<GrammarTopicDetailDto>(
          app2,
          `/api/grammar/topics/${createdTopicId}`,
        );
        expect(reopenedGrammarRes.status).toBe(200);
        expect(reopenedGrammarRes.data.title).toBe('Disk Persistence Inversion Structure');

        // Assert custom mistake is intact
        const reopenedMistakesRes = await requestJson<MistakeDto[]>(
          app2,
          '/api/mistakes?category=word_order',
        );
        expect(reopenedMistakesRes.status).toBe(200);
        const persistedMistake = reopenedMistakesRes.data.find(
          (m) => m.id === createdMistakeId,
        );
        expect(persistedMistake).toBeDefined();
        expect(persistedMistake!.correctedVersion).toBe(
          'Never have I seen such persistence.',
        );
      } finally {
        if (handle2) await handle2.close();
        if (handle1) await handle1.close();
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
