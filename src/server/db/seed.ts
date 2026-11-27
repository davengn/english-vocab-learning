import { and, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from './index.js';
import {
  users,
  userSettings,
  learningSessions,
  vocabulary,
  vocabularyExamples,
  vocabularyRelations,
  collocations,
  vocabularyCollections,
  vocabularyCollectionItems,
  vocabularyTags,
  vocabularyTagItems,
  sessionVocabulary,
  wordComparisonGroups,
  wordComparisonItems,
  grammarCategories,
  grammarTopics,
  grammarExamples,
  grammarComparisons,
  sessionGrammar,
  practiceQuestions,
  practiceSets,
  practiceSetQuestions,
  vocabularyReviewStates,
  grammarReviewStates,
  learningMistakes,
  dailyLearningActivity,
} from './schema.js';
import { normalizeWord, slugify, todayIsoDate } from '../../shared/schemas.js';

export const DEFAULT_USER_EMAIL = 'learner@english-os.local';

export async function getDefaultUserId(db: AppDatabase): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEFAULT_USER_EMAIL))
    .limit(1);

  if (existing[0]) {
    return existing[0].id;
  }

  return seedDatabase(db);
}

export async function seedDatabase(db: AppDatabase): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEFAULT_USER_EMAIL))
    .limit(1);

  if (existing[0]) {
    await ensurePhraseConjugationSamples(db, existing[0].id);
    return existing[0].id;
  }

  const [user] = await db
    .insert(users)
    .values({
      name: 'Người học tiếng Anh',
      email: DEFAULT_USER_EMAIL,
    })
    .returning();

  const userId = user.id;

  await db.insert(userSettings).values({
    userId,
    dailyTargetMinutes: 15,
    dailyVocabTarget: 20,
    dailyGrammarTarget: 2,
    uiLanguage: 'vi',
    defaultReviewDirection: 'en_to_vi',
    keyboardShortcutsEnabled: true,
  });

  // 1. Built-in 8 Vocabulary Collections
  const builtInCollections = [
    { name: 'IELTS Vocabulary', slug: 'ielts-vocabulary', description: 'Từ vựng học thuật và chủ đề thường gặp trong IELTS Reading/Writing/Speaking', sortOrder: 1 },
    { name: 'Academic Vocabulary', slug: 'academic-vocabulary', description: 'Từ vựng học thuật dùng trong bài luận, báo cáo và nghiên cứu', sortOrder: 2 },
    { name: 'Daily English', slug: 'daily-english', description: 'Từ và cụm từ giao tiếp hằng ngày tự nhiên', sortOrder: 3 },
    { name: 'Business English', slug: 'business-english', description: 'Tiếng Anh công sở, họp hành, email và thuyết trình', sortOrder: 4 },
    { name: 'Phrasal Verbs', slug: 'phrasal-verbs', description: 'Cụm động từ thông dụng dễ nhầm nghĩa', sortOrder: 5 },
    { name: 'Collocations', slug: 'collocations', description: 'Cụm kết hợp từ tự nhiên như người bản xứ', sortOrder: 6 },
    { name: 'Confusing Words', slug: 'confusing-words', description: 'Các cặp từ dễ nhầm lẫn đối với người Việt', sortOrder: 7 },
    { name: 'Personal Mistakes', slug: 'personal-mistakes', description: 'Từ vựng từng dùng sai và cần lưu ý đặc biệt', sortOrder: 8 },
  ];

  const insertedCollections = await db
    .insert(vocabularyCollections)
    .values(
      builtInCollections.map((c) => ({
        userId,
        name: c.name,
        slug: c.slug,
        description: c.description,
        isSystem: true,
        sortOrder: c.sortOrder,
      })),
    )
    .returning();

  const collectionMap = new Map(insertedCollections.map((c) => [c.slug, c.id]));

  // 2. Built-in 16 Grammar Categories
  const builtInCategories = [
    { name: 'Tenses', nameVi: 'Các thì trong tiếng Anh', slug: 'tenses', description: '12 thì cơ bản và nâng cao cùng dấu hiệu nhận biết' },
    { name: 'Parts of Speech', nameVi: 'Từ loại', slug: 'parts-of-speech', description: 'Danh từ, động từ, tính từ, trạng từ và cách chuyển đổi' },
    { name: 'Sentence Structure', nameVi: 'Cấu trúc câu', slug: 'sentence-structure', description: 'Câu đơn, câu ghép, câu phức và thành phần câu' },
    { name: 'Conditional Sentences', nameVi: 'Câu điều kiện', slug: 'conditional-sentences', description: 'Câu điều kiện loại 0, 1, 2, 3 và hỗn hợp' },
    { name: 'Passive Voice', nameVi: 'Câu bị động', slug: 'passive-voice', description: 'Cấu trúc bị động qua các thì và bị động đặc biệt' },
    { name: 'Reported Speech', nameVi: 'Câu tường thuật', slug: 'reported-speech', description: 'Lùi thì và biến đổi đại từ, trạng từ chỉ thời gian' },
    { name: 'Relative Clauses', nameVi: 'Mệnh đề quan hệ', slug: 'relative-clauses', description: 'Who, whom, which, that, whose và rút gọn mệnh đề' },
    { name: 'Modal Verbs', nameVi: 'Động từ khuyết thiếu', slug: 'modal-verbs', description: 'Can, could, must, should, might, would và suy đoán' },
    { name: 'Gerunds & Infinitives', nameVi: 'Danh động từ & Động từ nguyên mẫu', slug: 'gerunds-infinitives', description: 'V-ing, to-V và động từ theo sau bởi cả hai dạng' },
    { name: 'Articles & Determiners', nameVi: 'Mạo từ & Từ hạn định', slug: 'articles-determiners', description: 'A, an, the, zero article, some/any, much/many' },
    { name: 'Prepositions', nameVi: 'Giới từ', slug: 'prepositions', description: 'Giới từ chỉ thời gian, nơi chốn và cụm giới từ cố định' },
    { name: 'Conjunctions', nameVi: 'Liên từ', slug: 'conjunctions', description: 'Liên từ kết hợp, phụ thuộc và cặp liên từ' },
    { name: 'Comparisons', nameVi: 'Cấu trúc so sánh', slug: 'comparisons', description: 'So sánh bằng, hơn, nhất và so sánh kép' },
    { name: 'Subject-Verb Agreement', nameVi: 'Hòa hợp chủ – vị', slug: 'subject-verb-agreement', description: 'Quy tắc chia động từ theo chủ ngữ số ít/nhiều' },
    { name: 'Clauses', nameVi: 'Các loại mệnh đề', slug: 'clauses', description: 'Mệnh đề danh ngữ, trạng ngữ và nhượng bộ' },
    { name: 'Advanced Grammar', nameVi: 'Ngữ pháp nâng cao', slug: 'advanced-grammar', description: 'Đảo ngữ, câu chẻ, giả định thức (Subjunctive)' },
  ];

  const insertedCategories = await db
    .insert(grammarCategories)
    .values(
      builtInCategories.map((c, idx) => ({
        userId,
        name: c.name,
        nameVi: c.nameVi,
        slug: c.slug,
        description: c.description,
        sortOrder: idx + 1,
        isSystem: true,
      })),
    )
    .returning();

  const categoryMap = new Map(insertedCategories.map((c) => [c.slug, c.id]));

  // 3. Tags
  const insertedTags = await db
    .insert(vocabularyTags)
    .values([
      { userId, name: 'IELTS Writing', slug: 'ielts-writing', color: '#0F766E' },
      { userId, name: 'Cặp từ dễ nhầm', slug: 'cap-tu-de-nham', color: '#B45309' },
      { userId, name: 'Hay quên', slug: 'hay-quen', color: '#B91C1C' },
      { userId, name: 'Giao tiếp', slug: 'giao-tiep', color: '#0369A1' },
    ])
    .returning();
  const tagMap = new Map(insertedTags.map((t) => [t.slug, t.id]));

  // 4. Starter Vocabulary (12 rich entries)
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  const starterVocabData = [
    {
      word: 'meticulous',
      ipa: '/məˈtɪk.jə.ləs/',
      partOfSpeech: 'adjective',
      cefrLevel: 'C1' as const,
      englishDefinition: 'Showing great attention to detail; very careful and precise.',
      vietnameseMeaning: 'tỉ mỉ, cẩn thận từng chi tiết',
      vietnameseExplanation: 'Mô tả người hoặc công việc làm rất kỹ lưỡng, để ý từng tiểu tiết nhỏ.',
      englishExplanation: 'Very thorough and precise, especially in checking small details.',
      nuance: 'Mang sắc thái khen ngợi sự chỉn chu, đôi khi hơi kỹ tính nếu quá mức.',
      register: 'formal' as const,
      tone: 'positive' as const,
      usageContext: 'IELTS Writing/Speaking, công việc nghiên cứu, kiểm toán, thiết kế.',
      whenToUse: 'Khi khen ai đó làm việc cẩn trọng, kiểm tra kỹ tài liệu hoặc lên kế hoạch chi tiết.',
      whenNotToUse: 'Tránh dùng cho sự cẩn thận thông thường hằng ngày (dùng careful tự nhiên hơn).',
      vnCommonMistakes: 'Thường viết sai chính tả thành "meticulus" hoặc dùng giới từ sai.',
      vnWrongCombinations: 'Sai: "meticulous on details" → Đúng: "meticulous about details" / "meticulous in one’s work".',
      vnConfusingWords: 'Khác với "scrupulous" (cẩn trọng về mặt đạo đức/nguyên tắc) và "careful" (cẩn thận chung).',
      vnTranslationTraps: 'Người Việt hay dịch "cẩn thận" thành "careful" trong mọi ngữ cảnh học thuật.',
      personalNotes: 'Rất hay dùng để miêu tả thí nghiệm hoặc chuẩn bị dự án trong IELTS.',
      source: 'Khóa học IELTS',
      confidenceLevel: 3,
      isFavorite: true,
      status: 'reviewing' as const,
      collections: ['ielts-vocabulary', 'academic-vocabulary'],
      tags: ['ielts-writing'],
      examples: [
        {
          englishSentence: 'She is meticulous about keeping financial records accurate.',
          vietnameseTranslation: 'Cô ấy rất tỉ mỉ trong việc giữ sổ sách tài chính chính xác.',
          highlightText: 'meticulous',
        },
      ],
      collocations: [
        { phrase: 'meticulous attention to detail', vietnameseMeaning: 'sự chú ý tỉ mỉ đến từng chi tiết', exampleSentence: 'The report shows meticulous attention to detail.', exampleTranslation: 'Báo cáo cho thấy sự chú ý tỉ mỉ đến từng chi tiết.' },
        { phrase: 'meticulous planning', vietnameseMeaning: 'lập kế hoạch kỹ lưỡng', exampleSentence: 'The event succeeded thanks to meticulous planning.', exampleTranslation: 'Sự kiện thành công nhờ khâu lập kế hoạch kỹ lưỡng.' },
      ],
      relations: [
        { relationType: 'synonym' as const, text: 'thorough, painstaking', note: 'Đồng nghĩa gần trong văn viết' },
        { relationType: 'antonym' as const, text: 'careless, sloppy', note: 'Trái nghĩa' },
        { relationType: 'word_family' as const, text: 'meticulously (adv), meticulousness (n)', note: '' },
      ],
      dueEnToVi: hoursAgo(4),
      dueViToEn: hoursAgo(6),
    },
    {
      word: 'resilient',
      ipa: '/rɪˈzɪl.i.ənt/',
      partOfSpeech: 'adjective',
      cefrLevel: 'B2' as const,
      englishDefinition: 'Able to recover quickly from difficult conditions or setbacks.',
      vietnameseMeaning: 'kiên cường, có khả năng phục hồi nhanh',
      vietnameseExplanation: 'Chỉ khả năng đứng dậy, phục hồi nhanh sau khó khăn, biến cố (dùng cho cả người, cộng đồng, nền kinh tế).',
      englishExplanation: 'Capable of withstanding shock without permanent damage and bouncing back.',
      nuance: 'Tích cực, thể hiện sức bền nội tại.',
      register: 'neutral' as const,
      tone: 'positive' as const,
      usageContext: 'Phát triển bản thân, kinh tế, môi trường, IELTS Writing Task 2.',
      whenToUse: 'Miêu tả người vượt qua thất bại hoặc hệ thống chịu được khủng hoảng.',
      whenNotToUse: 'Không dùng cho sự cứng đầu tiêu cực (dùng stubborn).',
      vnCommonMistakes: 'Hay phát âm sai âm /z/ thành /s/ hoặc quên đuôi -t.',
      vnWrongCombinations: 'Sai: "resilient with stress" → Đúng: "resilient to stress" / "resilient in the face of adversity".',
      vnConfusingWords: 'Phân biệt với "persistent" (kiên trì bám đuổi mục tiêu) và "tough" (cứng rắn).',
      vnTranslationTraps: 'Không chỉ là "mạnh mẽ" (strong) mà nhấn mạnh vào sự phục hồi sau cú sốc.',
      personalNotes: 'Danh từ đi kèm rất hay gặp: resilience.',
      source: 'Khóa học IELTS',
      confidenceLevel: 4,
      isFavorite: true,
      status: 'reviewing' as const,
      collections: ['ielts-vocabulary', 'academic-vocabulary'],
      tags: ['ielts-writing'],
      examples: [
        {
          englishSentence: 'Local communities proved remarkably resilient after the storm.',
          vietnameseTranslation: 'Các cộng đồng địa phương tỏ ra vô cùng kiên cường sau cơn bão.',
          highlightText: 'resilient',
        },
      ],
      collocations: [
        { phrase: 'economically resilient', vietnameseMeaning: 'vững vàng về mặt kinh tế', exampleSentence: 'Small cities are becoming more economically resilient.', exampleTranslation: 'Các thành phố nhỏ đang trở nên vững vàng hơn về kinh tế.' },
      ],
      relations: [
        { relationType: 'word_family' as const, text: 'resilience (n), resiliently (adv)', note: '' },
        { relationType: 'synonym' as const, text: 'adaptable, hardy', note: '' },
      ],
      dueEnToVi: hoursAgo(2),
      dueViToEn: hoursAgo(5),
    },
    {
      word: 'reluctant',
      ipa: '/rɪˈlʌk.tənt/',
      partOfSpeech: 'adjective',
      cefrLevel: 'B2' as const,
      englishDefinition: 'Unwilling and hesitant; disinclined to do something.',
      vietnameseMeaning: 'miễn cưỡng, chần chừ, không sẵn lòng',
      vietnameseExplanation: 'Không muốn làm việc gì đó nên làm một cách do dự, gượng ép.',
      englishExplanation: 'Feeling or showing hesitation or unwillingness before acting.',
      nuance: 'Nhẹ nhàng hơn "refuse", nhấn mạnh tâm lý do dự.',
      register: 'neutral' as const,
      tone: 'negative' as const,
      usageContext: 'Mô tả thái độ trong công việc, đàm phán, đời sống.',
      whenToUse: 'Khi muốn nói ai đó ngại/không muốn làm điều gì: be reluctant to + V.',
      whenNotToUse: 'Không dùng cấu trúc "reluctant for doing" (sai).',
      vnCommonMistakes: 'Dùng sai V-ing sau reluctant.',
      vnWrongCombinations: 'Sai: "reluctant doing something" → Đúng: "reluctant to do something".',
      vnConfusingWords: 'Khác với "hesitant" (do dự vì chưa chắc chắn) — reluctant là do không muốn.',
      vnTranslationTraps: 'Tiếng Việt nói "ngại làm gì" dễ dịch nhầm thành "shy to do" (sai hoàn toàn).',
      personalNotes: 'Cấu trúc vàng: be reluctant to + V-inf.',
      source: 'Khóa học IELTS',
      confidenceLevel: 2,
      isFavorite: false,
      status: 'learning' as const,
      collections: ['ielts-vocabulary', 'daily-english'],
      tags: ['ielts-writing', 'hay-quen'],
      examples: [
        {
          englishSentence: 'Many companies are reluctant to invest during uncertain times.',
          vietnameseTranslation: 'Nhiều công ty miễn cưỡng đầu tư trong giai đoạn bất ổn.',
          highlightText: 'reluctant',
        },
      ],
      collocations: [
        { phrase: 'reluctant to admit', vietnameseMeaning: 'miễn cưỡng thừa nhận', exampleSentence: 'He was reluctant to admit his mistake.', exampleTranslation: 'Anh ấy miễn cưỡng thừa nhận sai lầm của mình.' },
      ],
      relations: [
        { relationType: 'word_family' as const, text: 'reluctance (n), reluctantly (adv)', note: '' },
        { relationType: 'antonym' as const, text: 'eager, willing', note: '' },
      ],
      dueEnToVi: hoursAgo(8),
      dueViToEn: hoursAgo(10),
    },
    {
      word: 'affect',
      ipa: '/əˈfekt/',
      partOfSpeech: 'verb',
      cefrLevel: 'B1' as const,
      englishDefinition: 'To have an influence on someone or something, or cause a change.',
      vietnameseMeaning: 'ảnh hưởng đến, tác động đến (động từ)',
      vietnameseExplanation: 'Là ĐỘNG TỪ mang nghĩa tác động trực tiếp làm thay đổi ai/cái gì.',
      englishExplanation: 'Verb: to act on or produce a change in someone or something.',
      nuance: 'Trung tính, dùng rộng rãi trong cả văn nói và văn viết.',
      register: 'neutral' as const,
      tone: 'neutral' as const,
      usageContext: 'Miêu tả nguyên nhân – hệ quả.',
      whenToUse: 'Khi cần một động từ đứng sau chủ ngữ: A affects B.',
      whenNotToUse: 'Không thêm giới từ "to" hoặc "on" ngay sau động từ affect.',
      vnCommonMistakes: 'Hay viết nhầm thành "affect to" hoặc "affect on" do dịch từ "ảnh hưởng ĐẾN".',
      vnWrongCombinations: 'Sai: "affect to my study" → Đúng: "affect my study".',
      vnConfusingWords: 'Rất hay nhầm với danh từ "effect" (tác động, hiệu ứng).',
      vnTranslationTraps: 'Dịch "ảnh hưởng đến" từng chữ thành "affect to" là lỗi kinh điển của người Việt.',
      personalNotes: 'Mẹo nhớ: Affect = Action (Verb), Effect = End result (Noun).',
      source: 'Tự học',
      confidenceLevel: 3,
      isFavorite: true,
      status: 'learning' as const,
      collections: ['confusing-words', 'ielts-vocabulary'],
      tags: ['cap-tu-de-nham'],
      examples: [
        {
          englishSentence: 'Lack of sleep directly affects concentration.',
          vietnameseTranslation: 'Thiếu ngủ ảnh hưởng trực tiếp đến khả năng tập trung.',
          highlightText: 'affects',
        },
      ],
      collocations: [
        { phrase: 'adversely affect', vietnameseMeaning: 'ảnh hưởng tiêu cực đến', exampleSentence: 'Pollution adversely affects public health.', exampleTranslation: 'Ô nhiễm ảnh hưởng tiêu cực đến sức khỏe cộng đồng.' },
      ],
      relations: [
        { relationType: 'related_expression' as const, text: 'effect (n)', note: 'Cặp từ dễ nhầm lẫn' },
      ],
      dueEnToVi: hoursAgo(1),
      dueViToEn: hoursAgo(7),
    },
    {
      word: 'effect',
      ipa: '/ɪˈfekt/',
      partOfSpeech: 'noun',
      cefrLevel: 'B1' as const,
      englishDefinition: 'A change that is a result or consequence of an action or cause.',
      vietnameseMeaning: 'tác động, ảnh hưởng, hiệu ứng (danh từ)',
      vietnameseExplanation: 'Chủ yếu dùng làm DANH TỪ chỉ kết quả, tác động của một hành động.',
      englishExplanation: 'Noun: the outcome or consequence produced by a cause.',
      nuance: 'Trung tính.',
      register: 'neutral' as const,
      tone: 'neutral' as const,
      usageContext: 'IELTS Writing, báo cáo khoa học, đời sống.',
      whenToUse: 'Đi với động từ have/produce/create: have an effect ON something.',
      whenNotToUse: 'Không dùng thay thế cho động từ affect trong ngữ cảnh thông thường.',
      vnCommonMistakes: 'Dùng sai giới từ sau effect (hay dùng "effect to" thay vì "effect on").',
      vnWrongCombinations: 'Sai: "have an effect to" → Đúng: "have an effect on".',
      vnConfusingWords: 'Hay nhầm với động từ "affect".',
      vnTranslationTraps: 'Cần nhớ: động từ "affect" KHÔNG đi với giới từ, danh từ "effect" đi với "on".',
      personalNotes: 'Cụm hay dùng: have a profound effect on...',
      source: 'Tự học',
      confidenceLevel: 3,
      isFavorite: false,
      status: 'learning' as const,
      collections: ['confusing-words', 'academic-vocabulary'],
      tags: ['cap-tu-de-nham'],
      examples: [
        {
          englishSentence: 'The new policy had an immediate effect on local businesses.',
          vietnameseTranslation: 'Chính sách mới đã có tác động tức thì lên các doanh nghiệp địa phương.',
          highlightText: 'effect',
        },
      ],
      collocations: [
        { phrase: 'have an effect on', vietnameseMeaning: 'có tác động lên', exampleSentence: 'Music can have a calming effect on students.', exampleTranslation: 'Âm nhạc có thể tạo tác động làm dịu tinh thần cho học sinh.' },
      ],
      relations: [
        { relationType: 'related_expression' as const, text: 'affect (v)', note: 'Cặp từ dễ nhầm lẫn' },
        { relationType: 'word_family' as const, text: 'effective (adj), effectively (adv)', note: '' },
      ],
      dueEnToVi: daysFromNow(2),
      dueViToEn: hoursAgo(3),
    },
    {
      word: 'economic',
      ipa: '/ˌiː.kəˈnɒm.ɪk/',
      partOfSpeech: 'adjective',
      cefrLevel: 'B2' as const,
      englishDefinition: 'Relating to economics, trade, industry, and the creation of wealth.',
      vietnameseMeaning: 'thuộc về kinh tế, liên quan đến nền kinh tế',
      vietnameseExplanation: 'Dùng khi nói về chính sách, tăng trưởng, khủng hoảng của nền kinh tế.',
      englishExplanation: 'Connected with the economy or finance of a country or region.',
      nuance: 'Học thuật, chính thống.',
      register: 'formal' as const,
      tone: 'neutral' as const,
      usageContext: 'Kinh tế học, tin tức, IELTS Writing Task 2.',
      whenToUse: 'economic growth, economic crisis, economic policy.',
      whenNotToUse: 'Không dùng để khen một chiếc xe hay bóng đèn "tiết kiệm" (dùng economical).',
      vnCommonMistakes: 'Nhầm giữa economic và economical.',
      vnWrongCombinations: 'Sai: "an economic car" (ý nói xe tiết kiệm xăng) → Đúng: "an economical car".',
      vnConfusingWords: 'Khác hoàn toàn với economical (tiết kiệm, không lãng phí).',
      vnTranslationTraps: 'Tiếng Việt cùng có gốc "kinh tế" nên hay bị gộp hai từ.',
      personalNotes: 'economic = thuộc kinh tế; economical = tiết kiệm.',
      source: 'Khóa học IELTS',
      confidenceLevel: 2,
      isFavorite: false,
      status: 'learning' as const,
      collections: ['confusing-words', 'business-english'],
      tags: ['cap-tu-de-nham'],
      examples: [
        {
          englishSentence: 'Tourism contributes significantly to economic growth.',
          vietnameseTranslation: 'Du lịch đóng góp đáng kể vào tăng trưởng kinh tế.',
          highlightText: 'economic',
        },
      ],
      collocations: [
        { phrase: 'economic growth', vietnameseMeaning: 'tăng trưởng kinh tế', exampleSentence: 'Stable infrastructure supports economic growth.', exampleTranslation: 'Hạ tầng ổn định hỗ trợ tăng trưởng kinh tế.' },
      ],
      relations: [],
      dueEnToVi: hoursAgo(12),
      dueViToEn: hoursAgo(12),
    },
    {
      word: 'economical',
      ipa: '/ˌiː.kəˈnɒm.ɪ.kəl/',
      partOfSpeech: 'adjective',
      cefrLevel: 'B2' as const,
      englishDefinition: 'Giving good value or service in relation to the amount of money, time, or effort spent.',
      vietnameseMeaning: 'tiết kiệm, ít tốn kém, hiệu quả về chi phí',
      vietnameseExplanation: 'Dùng cho cách sử dụng tiền bạc, nhiên liệu, thời gian một cách khôn ngoan, tránh lãng phí.',
      englishExplanation: 'Using no more resources or money than necessary.',
      nuance: 'Tích cực, mang tính thực tế.',
      register: 'neutral' as const,
      tone: 'positive' as const,
      usageContext: 'Chi tiêu cá nhân, xe cộ, thiết bị, quản lý tài nguyên.',
      whenToUse: 'economical car, economical use of time, be economical with.',
      whenNotToUse: 'Không dùng cho "economic crisis" hay "economic development".',
      vnCommonMistakes: 'Dùng nhầm "economic" khi muốn khen đồ vật tiết kiệm chi phí.',
      vnWrongCombinations: 'Sai: "economical development" → Đúng: "economic development".',
      vnConfusingWords: 'Cặp với economic.',
      vnTranslationTraps: 'Cẩn thận đuôi -al mang nghĩa "tiết kiệm".',
      personalNotes: '',
      source: 'Khóa học IELTS',
      confidenceLevel: 2,
      isFavorite: false,
      status: 'learning' as const,
      collections: ['confusing-words', 'daily-english'],
      tags: ['cap-tu-de-nham'],
      examples: [
        {
          englishSentence: 'Hybrid vehicles are much more economical to run in city traffic.',
          vietnameseTranslation: 'Xe hybrid vận hành tiết kiệm hơn nhiều khi đi trong thành phố.',
          highlightText: 'economical',
        },
      ],
      collocations: [],
      relations: [],
      dueEnToVi: daysFromNow(1),
      dueViToEn: hoursAgo(4),
    },
    {
      word: 'borrow',
      ipa: '/ˈbɒr.əʊ/',
      partOfSpeech: 'verb',
      cefrLevel: 'A2' as const,
      englishDefinition: 'To take and use something that belongs to someone else with the intention of returning it.',
      vietnameseMeaning: 'mượn, vay (lấy từ người khác)',
      vietnameseExplanation: 'Hành động NHẬN tạm thời từ người khác và sẽ trả lại: borrow sth FROM sb.',
      englishExplanation: 'You receive something temporarily from someone else.',
      nuance: 'Trung tính.',
      register: 'neutral' as const,
      tone: 'neutral' as const,
      usageContext: 'Giao tiếp hằng ngày, tài chính cá nhân.',
      whenToUse: 'Can I borrow your pen? / borrow money from a bank.',
      whenNotToUse: 'Không bao giờ nói "borrow me your pen" (phải dùng lend me).',
      vnCommonMistakes: 'Lẫn lộn chiều cho mượn và đi mượn giống từ "mượn" trong tiếng Việt.',
      vnWrongCombinations: 'Sai: "Please borrow me 50k" → Đúng: "Please lend me 50k" / "Can I borrow 50k from you?".',
      vnConfusingWords: 'Đối lập chiều với "lend".',
      vnTranslationTraps: 'Tiếng Việt dùng "cho mượn" và "mượn" đều có chữ "mượn" nên rất dễ nhầm.',
      personalNotes: 'borrow = lấy vào (from); lend = đưa ra (to).',
      source: 'Lớp học tiếng Anh',
      confidenceLevel: 4,
      isFavorite: false,
      status: 'reviewing' as const,
      collections: ['confusing-words', 'daily-english'],
      tags: ['cap-tu-de-nham', 'giao-tiep'],
      examples: [
        {
          englishSentence: 'Could I borrow your notes from yesterday’s lecture?',
          vietnameseTranslation: 'Mình mượn vở ghi bài giảng hôm qua của bạn được không?',
          highlightText: 'borrow',
        },
      ],
      collocations: [],
      relations: [{ relationType: 'antonym' as const, text: 'lend', note: 'Ngược chiều hành động' }],
      dueEnToVi: daysFromNow(4),
      dueViToEn: hoursAgo(2),
    },
    {
      word: 'lend',
      ipa: '/lend/',
      partOfSpeech: 'verb',
      cefrLevel: 'A2' as const,
      englishDefinition: 'To give something to someone for a short period of time, expecting it to be returned.',
      vietnameseMeaning: 'cho mượn, cho vay (đưa cho người khác)',
      vietnameseExplanation: 'Hành động ĐƯA tạm cho người khác: lend sth TO sb / lend sb sth.',
      englishExplanation: 'You give something temporarily to someone else.',
      nuance: 'Trung tính. Quá khứ & phân từ: lent – lent.',
      register: 'neutral' as const,
      tone: 'neutral' as const,
      usageContext: 'Giao tiếp, ngân hàng.',
      whenToUse: 'She lent me her umbrella. / Banks lend money to small firms.',
      whenNotToUse: 'Không dùng "lend from".',
      vnCommonMistakes: 'Dùng nhầm "lend from" hoặc quên bất quy tắc lent.',
      vnWrongCombinations: 'Sai: "I lent a book from the library" → Đúng: "I borrowed a book from the library".',
      vnConfusingWords: 'Đối lập chiều với "borrow".',
      vnTranslationTraps: 'Nhớ công thức: lend + người + vật.',
      personalNotes: '',
      source: 'Lớp học tiếng Anh',
      confidenceLevel: 4,
      isFavorite: false,
      status: 'reviewing' as const,
      collections: ['confusing-words', 'daily-english'],
      tags: ['cap-tu-de-nham', 'giao-tiep'],
      examples: [
        {
          englishSentence: 'She kindly lent me her umbrella when it started raining.',
          vietnameseTranslation: 'Cô ấy tốt bụng cho tôi mượn ô khi trời bắt đầu mưa.',
          highlightText: 'lent',
        },
      ],
      collocations: [{ phrase: 'lend a hand', vietnameseMeaning: 'giúp một tay', exampleSentence: 'Can you lend me a hand with these boxes?', exampleTranslation: 'Bạn giúp mình một tay bê mấy cái hộp này được không?' }],
      relations: [{ relationType: 'antonym' as const, text: 'borrow', note: '' }],
      dueEnToVi: daysFromNow(5),
      dueViToEn: daysFromNow(3),
    },
    {
      word: 'make',
      ipa: '/meɪk/',
      partOfSpeech: 'verb',
      cefrLevel: 'A1' as const,
      englishDefinition: 'To create, produce, or cause something to happen.',
      vietnameseMeaning: 'tạo ra, làm ra, khiến cho',
      vietnameseExplanation: 'Dùng khi tạo ra một thứ mới, đưa ra quyết định hoặc gây ra kết quả (make a decision, make progress, make a mistake).',
      englishExplanation: 'Focuses on producing or creating something new or causing an outcome.',
      nuance: 'Cần học theo collocation cố định thay vì dịch từng chữ.',
      register: 'neutral' as const,
      tone: 'neutral' as const,
      usageContext: 'Collocations cốt lõi trong giao tiếp và viết.',
      whenToUse: 'make a mistake, make an effort, make progress, make a decision.',
      whenNotToUse: 'Không dùng với homework, housework, exercise, research (dùng do).',
      vnCommonMistakes: 'Dùng "do a mistake" hoặc "do a decision".',
      vnWrongCombinations: 'Sai: "do progress" → Đúng: "make progress".',
      vnConfusingWords: 'Hay nhầm với "do".',
      vnTranslationTraps: 'Tiếng Việt đều dịch là "làm" nên phải học thuộc cụm đi kèm.',
      personalNotes: '',
      source: 'Giáo trình',
      confidenceLevel: 4,
      isFavorite: false,
      status: 'reviewing' as const,
      collections: ['collocations', 'daily-english', 'confusing-words'],
      tags: ['giao-tiep'],
      examples: [
        {
          englishSentence: 'Consistent daily practice helps you make steady progress.',
          vietnameseTranslation: 'Luyện tập đều đặn mỗi ngày giúp bạn tiến bộ vững chắc.',
          highlightText: 'make',
        },
      ],
      collocations: [
        { phrase: 'make steady progress', vietnameseMeaning: 'tiến bộ đều đặn', exampleSentence: 'She is making steady progress in speaking.', exampleTranslation: 'Cô ấy đang tiến bộ đều đặn trong kỹ năng nói.' },
        { phrase: 'make a decision', vietnameseMeaning: 'đưa ra quyết định', exampleSentence: 'We need to make a decision today.', exampleTranslation: 'Hôm nay chúng ta cần đưa ra quyết định.' },
      ],
      relations: [],
      dueEnToVi: daysFromNow(7),
      dueViToEn: daysFromNow(1),
    },
    {
      word: 'do',
      ipa: '/duː/',
      partOfSpeech: 'verb',
      cefrLevel: 'A1' as const,
      englishDefinition: 'To perform an action, activity, or task.',
      vietnameseMeaning: 'làm, thực hiện (công việc, nhiệm vụ)',
      vietnameseExplanation: 'Dùng cho công việc, nhiệm vụ, hoạt động chung không tạo ra vật thể mới cụ thể.',
      englishExplanation: 'Focuses on performing an activity, duty, or task.',
      nuance: 'Trung tính.',
      register: 'neutral' as const,
      tone: 'neutral' as const,
      usageContext: 'do homework, do research, do business, do your best.',
      whenToUse: 'do research, do an experiment, do harm, do good.',
      whenNotToUse: 'Không dùng "do a promise" (dùng make a promise).',
      vnCommonMistakes: 'Dùng "make research" hoặc "make homework".',
      vnWrongCombinations: 'Sai: "make homework" → Đúng: "do homework".',
      vnConfusingWords: 'Hay nhầm với "make".',
      vnTranslationTraps: 'Cần nhớ "research" và "homework" luôn đi với "do".',
      personalNotes: '',
      source: 'Giáo trình',
      confidenceLevel: 4,
      isFavorite: false,
      status: 'reviewing' as const,
      collections: ['collocations', 'daily-english'],
      tags: ['giao-tiep'],
      examples: [
        {
          englishSentence: 'Researchers had to do extensive fieldwork before publishing the paper.',
          vietnameseTranslation: 'Các nhà nghiên cứu đã phải thực địa rất nhiều trước khi công bố bài báo.',
          highlightText: 'do',
        },
      ],
      collocations: [
        { phrase: 'do research', vietnameseMeaning: 'làm nghiên cứu', exampleSentence: 'Students do research in the library.', exampleTranslation: 'Sinh viên làm nghiên cứu trong thư viện.' },
      ],
      relations: [],
      dueEnToVi: daysFromNow(6),
      dueViToEn: daysFromNow(2),
    },
    {
      word: 'despite',
      ipa: '/dɪˈspaɪt/',
      partOfSpeech: 'preposition',
      cefrLevel: 'B1' as const,
      englishDefinition: 'Without being affected by; in spite of.',
      vietnameseMeaning: 'mặc dù, bất chấp',
      vietnameseExplanation: 'Là GIỚI TỪ nên theo sau PHẢI là cụm danh từ hoặc V-ing (không theo sau bởi mệnh đề S + V).',
      englishExplanation: 'Preposition meaning regardless of; followed by a noun phrase or gerund.',
      nuance: 'Trang trọng hơn nhẹ so với even though trong văn viết.',
      register: 'formal' as const,
      tone: 'neutral' as const,
      usageContext: 'IELTS Writing, báo cáo, câu nhượng bộ.',
      whenToUse: 'Despite + N / V-ing / the fact that + S + V.',
      whenNotToUse: 'KHÔNG BAO GIỜ dùng "despite of" và không viết thẳng "despite + S + V".',
      vnCommonMistakes: 'Viết "despite of" (lẫn sang in spite of) hoặc viết "despite it rained".',
      vnWrongCombinations: 'Sai: "Despite of the rain, we went out" → Đúng: "Despite the rain, we went out".',
      vnConfusingWords: 'Hay nhầm cấu trúc với "although" (although + S + V).',
      vnTranslationTraps: 'Tiếng Việt đều dịch là "mặc dù" nên hay lắp mệnh đề trực tiếp sau despite.',
      personalNotes: 'Lỗi kinh điển cần nhớ suốt đời: KHÔNG có "of" sau despite!',
      source: 'Khóa học IELTS',
      confidenceLevel: 2,
      isFavorite: true,
      status: 'learning' as const,
      collections: ['confusing-words', 'ielts-vocabulary', 'personal-mistakes'],
      tags: ['ielts-writing', 'cap-tu-de-nham', 'hay-quen'],
      examples: [
        {
          englishSentence: 'Despite the heavy rain, they arrived on time.',
          vietnameseTranslation: 'Mặc dù trời mưa to, họ vẫn đến đúng giờ.',
          highlightText: 'Despite',
        },
      ],
      collocations: [
        { phrase: 'despite the fact that', vietnameseMeaning: 'mặc dù thực tế là', exampleSentence: 'She kept trying despite the fact that the odds were low.', exampleTranslation: 'Cô ấy vẫn tiếp tục cố gắng dù thực tế cơ hội khá thấp.' },
      ],
      relations: [
        { relationType: 'synonym' as const, text: 'in spite of', note: 'Bằng nghĩa, có "of"' },
        { relationType: 'related_expression' as const, text: 'although / even though', note: 'Dùng với mệnh đề S + V' },
      ],
      dueEnToVi: hoursAgo(9),
      dueViToEn: hoursAgo(11),
    },
  ];

  const vocabIdByWord = new Map<string, string>();

  for (const item of starterVocabData) {
    const [inserted] = await db
      .insert(vocabulary)
      .values({
        userId,
        word: item.word,
        normalizedWord: normalizeWord(item.word),
        ipa: item.ipa,
        partOfSpeech: item.partOfSpeech,
        cefrLevel: item.cefrLevel,
        englishDefinition: item.englishDefinition,
        vietnameseMeaning: item.vietnameseMeaning,
        vietnameseExplanation: item.vietnameseExplanation,
        englishExplanation: item.englishExplanation,
        nuance: item.nuance,
        register: item.register,
        tone: item.tone,
        usageContext: item.usageContext,
        whenToUse: item.whenToUse,
        whenNotToUse: item.whenNotToUse,
        vnCommonMistakes: item.vnCommonMistakes,
        vnWrongCombinations: item.vnWrongCombinations,
        vnConfusingWords: item.vnConfusingWords,
        vnTranslationTraps: item.vnTranslationTraps,
        personalNotes: item.personalNotes,
        source: item.source,
        confidenceLevel: item.confidenceLevel,
        isFavorite: item.isFavorite,
        status: item.status,
        isIncomplete: false,
      })
      .returning();

    vocabIdByWord.set(item.word, inserted.id);

    if (item.examples.length > 0) {
      await db.insert(vocabularyExamples).values(
        item.examples.map((ex, idx) => ({
          vocabularyId: inserted.id,
          englishSentence: ex.englishSentence,
          vietnameseTranslation: ex.vietnameseTranslation,
          highlightText: ex.highlightText,
          sortOrder: idx,
        })),
      );
    }

    if (item.collocations.length > 0) {
      await db.insert(collocations).values(
        item.collocations.map((col) => ({
          vocabularyId: inserted.id,
          phrase: col.phrase,
          vietnameseMeaning: col.vietnameseMeaning,
          exampleSentence: col.exampleSentence,
          exampleTranslation: col.exampleTranslation,
        })),
      );
    }

    if (item.relations.length > 0) {
      await db.insert(vocabularyRelations).values(
        item.relations.map((rel) => ({
          vocabularyId: inserted.id,
          relationType: rel.relationType,
          text: rel.text,
          note: rel.note,
        })),
      );
    }

    for (const colSlug of item.collections) {
      const colId = collectionMap.get(colSlug);
      if (colId) {
        await db.insert(vocabularyCollectionItems).values({
          collectionId: colId,
          vocabularyId: inserted.id,
        });
      }
    }

    for (const tagSlug of item.tags) {
      const tagId = tagMap.get(tagSlug);
      if (tagId) {
        await db.insert(vocabularyTagItems).values({
          tagId,
          vocabularyId: inserted.id,
        });
      }
    }

    // Create bidirectional SM-2 review states
    await db.insert(vocabularyReviewStates).values([
      {
        userId,
        vocabularyId: inserted.id,
        skillDirection: 'en_to_vi',
        status: item.status === 'learning' ? 'learning' : 'review',
        easeFactor: 2.5,
        intervalDays: item.status === 'learning' ? 1 : 3,
        repetitions: item.status === 'learning' ? 1 : 2,
        lapses: item.word === 'despite' || item.word === 'reluctant' ? 2 : 0,
        nextReviewAt: item.dueEnToVi,
      },
      {
        userId,
        vocabularyId: inserted.id,
        skillDirection: 'vi_to_en',
        status: 'learning',
        easeFactor: 2.35,
        intervalDays: 1,
        repetitions: 1,
        lapses: item.word === 'affect' || item.word === 'despite' ? 2 : 0,
        nextReviewAt: item.dueViToEn,
      },
    ]);
  }

  // 5. Starter Similar Word Comparison Groups
  const comparisonSpecs = [
    {
      title: 'Affect vs Effect',
      summaryVi: 'Hai từ cực kỳ hay nhầm về từ loại và giới từ đi kèm khi nói về sự tác động.',
      items: [
        {
          word: 'affect',
          label: 'Affect (v)',
          meaningVi: 'Ảnh hưởng đến, tác động làm thay đổi (động từ)',
          grammarDiff: 'Động từ ngoại (transitive verb) — KHÔNG dùng giới từ "to" hay "on" phía sau.',
          usageContext: 'Dùng khi cần động từ chính trong mệnh đề: Subject + affect + Object.',
          exampleEn: 'Lack of sleep affects your memory.',
          exampleVi: 'Thiếu ngủ ảnh hưởng đến trí nhớ của bạn.',
          commonMistakeVi: 'Sai: "affect to my health" / "affect on my health".',
        },
        {
          word: 'effect',
          label: 'Effect (n)',
          meaningVi: 'Sự ảnh hưởng, tác động, hiệu ứng (danh từ)',
          grammarDiff: 'Danh từ — thường đi trong cụm "have an effect ON something".',
          usageContext: 'Dùng sau tính từ hoặc động từ như have, produce, measure.',
          exampleEn: 'This medicine has an immediate effect on pain.',
          exampleVi: 'Thuốc này có tác dụng tức thì lên cơn đau.',
          commonMistakeVi: 'Sai: "have an effect to..." hoặc dùng effect làm động từ thường.',
        },
      ],
    },
    {
      title: 'Economic vs Economical',
      summaryVi: 'Cùng gốc từ nhưng một từ chỉ lĩnh vực kinh tế, một từ mang nghĩa tiết kiệm.',
      items: [
        {
          word: 'economic',
          label: 'Economic (adj)',
          meaningVi: 'Thuộc về nền kinh tế, tài chính vĩ mô',
          grammarDiff: 'Tính từ bổ nghĩa cho hệ thống/chính sách: economic growth, economic crisis.',
          usageContext: 'Báo chí, bài luận IELTS, phân tích vĩ mô.',
          exampleEn: 'The country faces serious economic challenges.',
          exampleVi: 'Đất nước đang đối mặt với những thách thức kinh tế nghiêm trọng.',
          commonMistakeVi: 'Sai: dùng để khen đồ vật "rẻ/tiết kiệm".',
        },
        {
          word: 'economical',
          label: 'Economical (adj)',
          meaningVi: 'Tiết kiệm tiền, nhiên liệu, thời gian; hiệu quả chi phí',
          grammarDiff: 'Tính từ mô tả đặc tính tiết kiệm: economical car, economical way.',
          usageContext: 'Đời sống hằng ngày, đánh giá sản phẩm hoặc phương án tối ưu.',
          exampleEn: 'Taking the train is more economical than driving alone.',
          exampleVi: 'Đi tàu tiết kiệm hơn so với tự lái xe một mình.',
          commonMistakeVi: 'Sai: "economical growth" (phải là economic growth).',
        },
      ],
    },
    {
      title: 'Borrow vs Lend',
      summaryVi: 'Phân biệt chiều chuyển đồ vật: lấy vào (borrow) và đưa ra (lend).',
      items: [
        {
          word: 'borrow',
          label: 'Borrow (v)',
          meaningVi: 'Đi mượn, vay (nhận từ người khác)',
          grammarDiff: 'borrow + something + FROM + someone.',
          usageContext: 'Khi chủ ngữ là người nhận tạm đồ vật/tiền.',
          exampleEn: 'I borrowed a dictionary from Minh.',
          exampleVi: 'Tôi đã mượn một cuốn từ điển từ Minh.',
          commonMistakeVi: 'Sai: "Borrow me your pen" (phải nói Lend me your pen).',
        },
        {
          word: 'lend',
          label: 'Lend (v)',
          meaningVi: 'Cho mượn, cho vay (đưa cho người khác)',
          grammarDiff: 'lend + someone + something HOẶC lend + something + TO + someone.',
          usageContext: 'Khi chủ ngữ là người chủ sở hữu đưa đồ cho ai đó.',
          exampleEn: 'Minh lent me his dictionary for a week.',
          exampleVi: 'Minh cho tôi mượn cuốn từ điển của anh ấy một tuần.',
          commonMistakeVi: 'Sai: "lend from someone" hoặc quên chia quá khứ là "lent".',
        },
      ],
    },
  ];

  for (const grp of comparisonSpecs) {
    const [createdGroup] = await db
      .insert(wordComparisonGroups)
      .values({
        userId,
        title: grp.title,
        summaryVi: grp.summaryVi,
      })
      .returning();

    await db.insert(wordComparisonItems).values(
      grp.items.map((it, idx) => ({
        groupId: createdGroup.id,
        vocabularyId: vocabIdByWord.get(it.word) ?? null,
        label: it.label,
        meaningVi: it.meaningVi,
        grammarDiff: it.grammarDiff,
        usageContext: it.usageContext,
        exampleEn: it.exampleEn,
        exampleVi: it.exampleVi,
        commonMistakeVi: it.commonMistakeVi,
        sortOrder: idx,
      })),
    );
  }

  // 6. Starter Grammar Topics (3 comprehensive lessons)
  const [presentPerfect] = await db
    .insert(grammarTopics)
    .values({
      userId,
      categoryId: categoryMap.get('tenses')!,
      title: 'Present Perfect Tense',
      titleVi: 'Thì Hiện tại hoàn thành',
      slug: slugify('Present Perfect Tense'),
      difficulty: 'intermediate',
      cefrLevel: 'B1',
      learningStatus: 'practicing',
      explanationVi:
        'Diễn tả hành động bắt đầu trong quá khứ và kéo dài đến hiện tại, hoặc vừa mới xảy ra/đã xảy ra trong quá khứ nhưng kết quả vẫn liên quan đến hiện tại.',
      explanationEn:
        'Connects past actions or states with the present moment without specifying a finished past time.',
      whatItIs: 'Thì kết nối giữa quá khứ và hiện tại thông qua trợ động từ have/has + V3/ed.',
      whyUsed: 'Giúp nhấn mạnh kết quả hiện tại, kinh nghiệm sống hoặc khoảng thời gian kéo dài tới lúc nói.',
      whenUsed:
        '1) Hành động bắt đầu ở quá khứ, còn tiếp tục ở hiện tại (for/since). 2) Trải nghiệm đến thời điểm hiện tại (ever/never). 3) Hành động vừa xảy ra (just/recently/already/yet).',
      howToRecognize: 'since + mốc thời gian, for + khoảng thời gian, already, yet, just, ever, never, so far, recently.',
      formula: 'Khẳng định: S + have/has + V3/ed\nPhủ định: S + have/has + not + V3/ed\nNghi vấn: Have/Has + S + V3/ed?',
      usageNotes: 'Tuyệt đối không dùng thì Hiện tại hoàn thành kèm mốc thời gian quá khứ đã kết thúc (yesterday, last year, in 2020).',
      classNotes: 'Thầy nhấn mạnh người Việt hay nhầm "I live here for 5 years" (thiếu have lived).',
      personalExplanations: 'Cứ thấy mốc chưa dứt ở hiện tại hoặc nhấn mạnh kinh nghiệm (chưa từng/đã từng) thì dùng have/has + V3.',
      customExamples: 'I have studied English for three years, so I can read technical docs comfortably.',
      openQuestions: 'Khi nào dùng Present Perfect Continuous thay cho Present Perfect?',
    })
    .returning();

  const [conditionals] = await db
    .insert(grammarTopics)
    .values({
      userId,
      categoryId: categoryMap.get('conditional-sentences')!,
      title: 'Conditional Sentences (Type 1 & Type 2)',
      titleVi: 'Câu điều kiện loại 1 và loại 2',
      slug: slugify('Conditional Sentences Type 1 and Type 2'),
      difficulty: 'intermediate',
      cefrLevel: 'B1',
      learningStatus: 'learning',
      explanationVi:
        'Loại 1 diễn tả giả định có thật hoặc có thể xảy ra ở hiện tại/tương lai. Loại 2 diễn tả giả định không có thật hoặc khó xảy ra ở hiện tại.',
      explanationEn: 'Expresses real future possibilities (Type 1) vs unreal present situations (Type 2).',
      whatItIs: 'Câu gồm mệnh đề điều kiện (If) và mệnh đề kết quả.',
      whyUsed: 'Để nêu điều kiện dẫn tới một hệ quả hoặc giả định trái ngược thực tế hiện tại.',
      whenUsed: 'Loại 1: kế hoạch, cảnh báo có thật. Loại 2: ước muốn, lời khuyên (If I were you...).',
      howToRecognize: 'Loại 1 có If + hiện tại đơn, will + V. Loại 2 có If + quá khứ đơn (were cho mọi ngôi), would/could + V.',
      formula: 'Loại 1: If + S + V(s/es), S + will/can/may + V-inf\nLoại 2: If + S + V2/ed (were), S + would/could + V-inf',
      usageNotes: 'Trong văn viết chuẩn, dùng "were" cho tất cả chủ ngữ ở mệnh đề If loại 2 (If he were here...).',
      classNotes: 'Không đặt "will" hoặc "would" vào trong mệnh đề If.',
      personalExplanations: '',
      customExamples: '',
      openQuestions: '',
    })
    .returning();

  const [articlesTopic] = await db
    .insert(grammarTopics)
    .values({
      userId,
      categoryId: categoryMap.get('articles-determiners')!,
      title: 'Articles: a / an / the / zero article',
      titleVi: 'Mạo từ a, an, the và không dùng mạo từ',
      slug: slugify('Articles a an the zero article'),
      difficulty: 'beginner',
      cefrLevel: 'A2',
      learningStatus: 'learning',
      explanationVi:
        'Mạo từ giúp xác định danh từ là chung chung mới nhắc lần đầu (a/an), đã xác định rõ giữa người nói và người nghe (the), hay nói chung về khái niệm/số nhiều (không dùng mạo từ).',
      explanationEn: 'Determines specificity of nouns for the listener/reader.',
      whatItIs: 'Từ đứng trước danh từ để báo hiệu mức độ xác định.',
      whyUsed: 'Tiếng Việt không có mạo từ bắt buộc nên người học Việt rất hay bỏ sót a/an trước danh từ đếm được số ít.',
      whenUsed: 'a/an + danh từ đếm được số ít chưa xác định; the + danh từ đã xác định/duy nhất; không mạo từ + số nhiều/không đếm được mang nghĩa chung.',
      howToRecognize: 'Kiểm tra danh từ là đếm được số ít hay không; nhắc lần 1 (a/an) hay đã nhắc/duy nhất (the).',
      formula: 'a + phụ âm (phát âm) | an + nguyên âm (phát âm: u, e, o, a, i)\nthe + danh từ xác định',
      usageNotes: 'Chú ý cách phát âm chứ không phải chữ cái: "an hour" (âm /aʊ/), "a university" (âm /j/).',
      classNotes: 'Danh từ đếm được số ít KHÔNG BAO GIỜ đứng trơ một mình thiếu mạo từ/từ hạn định.',
      personalExplanations: '',
      customExamples: '',
      openQuestions: '',
    })
    .returning();

  // Remaining 11 English Tenses (completing all 12 standard English tenses under "Tenses")
  const additionalTenses = [
    {
      title: 'Present Simple Tense',
      titleVi: 'Thì Hiện tại đơn',
      difficulty: 'beginner' as const,
      cefrLevel: 'A1' as const,
      learningStatus: 'practicing' as const,
      explanationVi: 'Diễn tả thói quen lặp đi lặp lại, sự thật hiển nhiên, lịch trình cố định hoặc trạng thái ở hiện tại.',
      explanationEn: 'Used for habits, general truths, permanent states, and fixed schedules.',
      whatItIs: 'Thì nền tảng diễn tả sự việc mang tính thường xuyên hoặc chân lý không đổi.',
      whyUsed: 'Giúp người nghe biết hành động là thói quen hay chân lý chứ không chỉ đang diễn ra ngay lúc nói.',
      whenUsed: '1) Thói quen hằng ngày. 2) Sự thật khoa học/tự nhiên. 3) Lịch tàu xe, giờ mở cửa.',
      howToRecognize: 'always, usually, often, sometimes, rarely, never, every day/week, once a week.',
      formula: 'Động từ thường: S + V(s/es) | S + do/does + not + V-inf\nĐộng từ to be: S + am/is/are + N/Adj',
      usageNotes: 'Nhớ thêm -s/-es cho chủ ngữ ngôi thứ 3 số ít (he, she, it, danh từ số ít).',
      exampleEn: 'Water boils at 100 degrees Celsius.',
      exampleVi: 'Nước sôi ở 100 độ C.',
      highlight: 'boils',
      incorrectEn: 'She go to work by bus every morning.',
      correctionNote: 'Chủ ngữ "She" (số ít) phải chia "goes": She goes to work by bus every morning.',
    },
    {
      title: 'Present Continuous Tense',
      titleVi: 'Thì Hiện tại tiếp diễn',
      difficulty: 'beginner' as const,
      cefrLevel: 'A1' as const,
      learningStatus: 'practicing' as const,
      explanationVi: 'Diễn tả hành động đang diễn ra ngay tại thời điểm nói, sự việc tạm thời hoặc kế hoạch cá nhân đã sắp xếp.',
      explanationEn: 'Describes actions happening right now, temporary situations, or arranged near-future plans.',
      whatItIs: 'Cấu trúc am/is/are + V-ing nhấn mạnh tính chất đang tiếp diễn.',
      whyUsed: 'Phân biệt việc đang xảy ra/tạm thời với thói quen lâu dài (Present Simple).',
      whenUsed: '1) Đang xảy ra ngay lúc nói. 2) Xu hướng thay đổi (nowadays). 3) Kế hoạch đã chốt lịch.',
      howToRecognize: 'now, right now, at the moment, at present, Look!, Listen!, this week.',
      formula: 'Khẳng định: S + am/is/are + V-ing\nPhủ định: S + am/is/are + not + V-ing\nNghi vấn: Am/Is/Are + S + V-ing?',
      usageNotes: 'Không dùng với động từ chỉ trạng thái/cảm xúc thuần túy như know, like, want, believe, belong.',
      exampleEn: 'I am currently preparing notes for my IELTS exam.',
      exampleVi: 'Hiện tại tôi đang chuẩn bị ghi chú cho kỳ thi IELTS.',
      highlight: 'am currently preparing',
      incorrectEn: 'I am knowing the answer to this question.',
      correctionNote: '"know" là động từ trạng thái, không chia tiếp diễn → dùng "I know the answer".',
    },
    {
      title: 'Present Perfect Continuous Tense',
      titleVi: 'Thì Hiện tại hoàn thành tiếp diễn',
      difficulty: 'intermediate' as const,
      cefrLevel: 'B2' as const,
      learningStatus: 'learning' as const,
      explanationVi: 'Nhấn mạnh tính liên tục không ngắt quãng của hành động bắt đầu trong quá khứ và kéo dài đến hiện tại.',
      explanationEn: 'Emphasizes the ongoing duration or process of an action from the past up to now.',
      whatItIs: 'Thì kết hợp giữa Hiện tại hoàn thành và dạng tiếp diễn (have/has + been + V-ing).',
      whyUsed: 'Nhấn mạnh quá trình kéo dài ("suốt bao lâu") hoặc dấu hiệu còn thấy rõ ở hiện tại.',
      whenUsed: '1) Hành động liên tục chưa dứt từ quá khứ tới nay. 2) Hành động vừa dứt để lại dấu hiệu rõ rệt.',
      howToRecognize: 'for + khoảng thời gian, since + mốc thời gian, all morning/day, how long.',
      formula: 'Khẳng định: S + have/has + been + V-ing\nPhủ định: S + have/has + not + been + V-ing',
      usageNotes: 'Nếu muốn nhấn mạnh SỐ LƯỢNG kết quả đạt được (đọc được 3 cuốn sách), dùng Present Perfect thay vì thì này.',
      exampleEn: 'She has been studying vocabulary for two hours without a break.',
      exampleVi: 'Cô ấy đã học từ vựng liên tục suốt hai tiếng không nghỉ.',
      highlight: 'has been studying',
      incorrectEn: 'How long have you been knowing him?',
      correctionNote: 'Với động từ trạng thái "know", dùng Present Perfect: "How long have you known him?".',
    },
    {
      title: 'Past Simple Tense',
      titleVi: 'Thì Quá khứ đơn',
      difficulty: 'beginner' as const,
      cefrLevel: 'A1' as const,
      learningStatus: 'practicing' as const,
      explanationVi: 'Diễn tả hành động đã xảy ra và kết thúc hoàn toàn tại một thời điểm xác định trong quá khứ.',
      explanationEn: 'Describes completed actions or states at a specific finished time in the past.',
      whatItIs: 'Thì kể chuyện quá khứ đã khép lại hoàn toàn (V2/ed hoặc was/were).',
      whyUsed: 'Tiếng Việt không biến đổi động từ theo quá khứ nên người học rất hay quên chia V2/ed.',
      whenUsed: '1) Sự việc đã chấm dứt ở mốc quá khứ. 2) Chuỗi hành động nối tiếp nhau trong quá khứ.',
      howToRecognize: 'yesterday, last night/week/year, ... ago, in 2020, when I was a child.',
      formula: 'Động từ thường: S + V2/ed | S + did + not + V-inf\nTo be: S + was/were',
      usageNotes: 'Khi đã mượn trợ động từ "did / didn’t", động từ chính PHẢI trả về nguyên mẫu (V-inf).',
      exampleEn: 'I reviewed twenty words before going to sleep last night.',
      exampleVi: 'Tối qua tôi đã ôn hai mươi từ trước khi đi ngủ.',
      highlight: 'reviewed',
      incorrectEn: 'Did you went to the English club yesterday?',
      correctionNote: 'Sau "Did", động từ giữ nguyên mẫu → "Did you go to the English club yesterday?".',
    },
    {
      title: 'Past Continuous Tense',
      titleVi: 'Thì Quá khứ tiếp diễn',
      difficulty: 'beginner' as const,
      cefrLevel: 'A2' as const,
      learningStatus: 'learning' as const,
      explanationVi: 'Diễn tả hành động đang diễn ra tại một thời điểm cụ thể trong quá khứ, hoặc đang diễn ra thì có hành động khác xen vào.',
      explanationEn: 'Describes an ongoing action at a specific past time or background action interrupted by another event.',
      whatItIs: 'Cấu trúc was/were + V-ing dùng làm nền cảnh quá khứ.',
      whyUsed: 'Tạo bối cảnh hành động đang dở dang khi một sự kiện quá khứ đơn chen ngang.',
      whenUsed: '1) Đang làm gì tại giờ cụ thể quá khứ (at 8 PM yesterday). 2) Hành động đang diễn ra (Past Cont.) + việc xen vào (Past Simple).',
      howToRecognize: 'at that time, at 9 PM yesterday, while, when (kết hợp hai hành động).',
      formula: 'S + was/were + V-ing\nPhủ định: S + was/were + not + V-ing',
      usageNotes: 'Hành động kéo dài làm nền chia Quá khứ tiếp diễn; hành động ngắn xen vào chia Quá khứ đơn.',
      exampleEn: 'I was taking notes when the teacher shared a great collocation.',
      exampleVi: 'Tôi đang ghi chép thì giáo viên chia sẻ một collocation rất hay.',
      highlight: 'was taking notes',
      incorrectEn: 'While I walked home, it suddenly started to rain.',
      correctionNote: 'Sau "while" chỉ bối cảnh đang diễn ra, dùng "While I was walking home...".',
    },
    {
      title: 'Past Perfect Tense',
      titleVi: 'Thì Quá khứ hoàn thành',
      difficulty: 'intermediate' as const,
      cefrLevel: 'B1' as const,
      learningStatus: 'learning' as const,
      explanationVi: 'Diễn tả hành động đã xảy ra và hoàn tất TRƯỚC một hành động hoặc mốc thời gian khác trong quá khứ ("quá khứ của quá khứ").',
      explanationEn: 'Describes an action completed before another past action or point in time.',
      whatItIs: 'Thì lùi một bậc thời gian (had + V3/ed) để sắp xếp thứ tự trước–sau trong quá khứ.',
      whyUsed: 'Làm rõ việc nào xảy ra trước việc nào khi kể lại hai sự kiện quá khứ.',
      whenUsed: 'Khi có hai hành động trong quá khứ: hành động xảy ra trước dùng Past Perfect, hành động sau dùng Past Simple.',
      howToRecognize: 'before, after, by the time, until, already (trong ngữ cảnh quá khứ).',
      formula: 'Khẳng định: S + had + V3/ed\nPhủ định: S + had + not + V3/ed',
      usageNotes: 'Không dùng Quá khứ hoàn thành đứng một mình nếu không có mốc quá khứ thứ hai làm đối chiếu.',
      exampleEn: 'By the time class started, she had already reviewed all the flashcards.',
      exampleVi: 'Vào lúc lớp học bắt đầu, cô ấy đã ôn hết toàn bộ thẻ ghi nhớ trước đó rồi.',
      highlight: 'had already reviewed',
      incorrectEn: 'After he finished dinner, he had gone out.',
      correctionNote: 'Việc ăn tối xong xảy ra trước → "After he had finished dinner, he went out.".',
    },
    {
      title: 'Past Perfect Continuous Tense',
      titleVi: 'Thì Quá khứ hoàn thành tiếp diễn',
      difficulty: 'advanced' as const,
      cefrLevel: 'B2' as const,
      learningStatus: 'not_started' as const,
      explanationVi: 'Nhấn mạnh quá trình diễn ra liên tục của một hành động kéo dài cho tới trước một thời điểm hoặc sự kiện khác trong quá khứ.',
      explanationEn: 'Emphasizes the continuous duration of an action leading up to another past moment.',
      whatItIs: 'Dạng tiếp diễn của Quá khứ hoàn thành: had + been + V-ing.',
      whyUsed: 'Giải thích nguyên nhân hoặc độ dài của quá trình xảy ra trước mốc quá khứ.',
      whenUsed: 'Khi muốn nêu rõ đã làm việc gì liên tục bao lâu trước khi một biến cố quá khứ xảy ra.',
      howToRecognize: 'for, since, before, by the time (nhấn mạnh thời lượng liên tục trước quá khứ).',
      formula: 'S + had + been + V-ing',
      usageNotes: 'Tương tự Present Perfect Continuous, không chia với động từ trạng thái.',
      exampleEn: 'They had been practicing for six months before they took the IELTS test.',
      exampleVi: 'Họ đã luyện tập liên tục sáu tháng trước khi bước vào kỳ thi IELTS.',
      highlight: 'had been practicing',
      incorrectEn: 'She was tired because she worked for ten hours.',
      correctionNote: 'Để nhấn mạnh quá trình kéo dài dẫn tới kết quả mệt lúc đó, dùng "had been working for ten hours".',
    },
    {
      title: 'Future Simple Tense (will)',
      titleVi: 'Thì Tương lai đơn (will)',
      difficulty: 'beginner' as const,
      cefrLevel: 'A2' as const,
      learningStatus: 'learning' as const,
      explanationVi: 'Diễn tả quyết định tức thì ngay lúc nói, lời hứa, đề nghị, hoặc dự đoán chủ quan về tương lai.',
      explanationEn: 'Used for spontaneous decisions, promises, offers, and opinion-based predictions.',
      whatItIs: 'Thì tương lai cơ bản dùng trợ động từ will + V-inf.',
      whyUsed: 'Diễn đạt ý định mới nảy sinh ngay lúc nói hoặc lời dự đoán cá nhân.',
      whenUsed: '1) Quyết định ngay lúc nói. 2) Lời hứa/đề nghị giúp đỡ. 3) Dự đoán với I think, probably.',
      howToRecognize: 'tomorrow, next week, in the future, I think, I promise, probably.',
      formula: 'S + will + V-inf\nPhủ định: S + will not (won’t) + V-inf',
      usageNotes: 'Phân biệt với "be going to" (kế hoạch đã dự tính từ trước hoặc dự đoán có bằng chứng nhìn thấy ngay).',
      exampleEn: 'I forgot to bring a pen — I will borrow one from Nam.',
      exampleVi: 'Tôi quên mang bút rồi — để tôi mượn Nam một cây.',
      highlight: 'will borrow',
      incorrectEn: 'I think it will rains tomorrow.',
      correctionNote: 'Sau "will" động từ luôn ở dạng nguyên mẫu (không chia -s/-es): "will rain".',
    },
    {
      title: 'Future Continuous Tense',
      titleVi: 'Thì Tương lai tiếp diễn',
      difficulty: 'intermediate' as const,
      cefrLevel: 'B1' as const,
      learningStatus: 'not_started' as const,
      explanationVi: 'Diễn tả hành động sẽ đang diễn ra tại một thời điểm xác định trong tương lai.',
      explanationEn: 'Describes an action that will be in progress at a specific moment in the future.',
      whatItIs: 'Cấu trúc will + be + V-ing đặt người nghe vào giữa khoảnh khắc tương lai.',
      whyUsed: 'Mô tả việc đang diễn ra đúng một giờ cụ thể ngày mai/tuần sau, hoặc hỏi lịch một cách lịch sự.',
      whenUsed: '1) Đang làm gì tại mốc giờ cụ thể tương lai. 2) Việc diễn ra theo lộ trình tự nhiên.',
      howToRecognize: 'at this time tomorrow, at 8 PM next Sunday, when + hiện tại đơn.',
      formula: 'S + will + be + V-ing',
      usageNotes: 'Trong mệnh đề thời gian (when, while), không dùng will mà chia hiện tại đơn.',
      exampleEn: 'At 9 p.m. tonight, I will be reviewing my grammar mistakes.',
      exampleVi: 'Vào lúc 9 giờ tối nay, tôi sẽ đang ôn lại các lỗi sai ngữ pháp của mình.',
      highlight: 'will be reviewing',
      incorrectEn: 'At this time next week, I will flying to Singapore.',
      correctionNote: 'Thiếu trợ động từ "be" trước V-ing → "I will be flying to Singapore.".',
    },
    {
      title: 'Future Perfect Tense',
      titleVi: 'Thì Tương lai hoàn thành',
      difficulty: 'intermediate' as const,
      cefrLevel: 'B2' as const,
      learningStatus: 'not_started' as const,
      explanationVi: 'Diễn tả hành động sẽ được hoàn tất TRƯỚC một mốc thời gian hoặc một hành động khác trong tương lai.',
      explanationEn: 'Describes an action that will already be finished before a specific future deadline.',
      whatItIs: 'Cấu trúc will + have + V3/ed nhấn mạnh hạn chót hoàn thành trong tương lai.',
      whyUsed: 'Rất hữu ích khi đặt mục tiêu học tập hoặc cam kết deadline công việc.',
      whenUsed: 'Khi muốn nói "tính đến mốc X trong tương lai thì việc Y đã xong rồi".',
      howToRecognize: 'by + mốc tương lai (by tomorrow, by next month, by 2028), by the time + hiện tại đơn.',
      formula: 'S + will + have + V3/ed',
      usageNotes: 'Chú ý sau "by the time" ở tương lai chỉ chia Hiện tại đơn, KHÔNG dùng "will".',
      exampleEn: 'By the end of this month, I will have mastered 200 new words.',
      exampleVi: 'Tính đến cuối tháng này, tôi sẽ đã thành thạo 200 từ mới.',
      highlight: 'will have mastered',
      incorrectEn: 'By next year, she will finish her degree already.',
      correctionNote: 'Có "by + mốc tương lai" nhấn mạnh hoàn tất trước mốc đó → dùng "will have finished".',
    },
    {
      title: 'Future Perfect Continuous Tense',
      titleVi: 'Thì Tương lai hoàn thành tiếp diễn',
      difficulty: 'advanced' as const,
      cefrLevel: 'C1' as const,
      learningStatus: 'not_started' as const,
      explanationVi: 'Nhấn mạnh tổng thời lượng mà một hành động sẽ đã diễn ra liên tục tính đến một mốc thời gian trong tương lai.',
      explanationEn: 'Emphasizes how long an ongoing action will have lasted by a certain point in the future.',
      whatItIs: 'Cấu trúc will + have + been + V-ing dùng để tổng kết chặng đường kéo dài tới mốc tương lai.',
      whyUsed: 'Nhấn mạnh sự bền bỉ/khoảng thời gian tích lũy tính đến một cột mốc sắp tới.',
      whenUsed: 'Thường đi kèm cả "by + mốc tương lai" và "for + khoảng thời gian".',
      howToRecognize: 'by ... for ..., by the end of this year + for 5 years.',
      formula: 'S + will + have + been + V-ing',
      usageNotes: 'Ít dùng trong giao tiếp thông thường nhưng rất hay gặp trong bài thi B2–C1 và IELTS.',
      exampleEn: 'By next June, I will have been learning English consistently for two years.',
      exampleVi: 'Tính đến tháng Sáu tới, tôi sẽ đã học tiếng Anh đều đặn được tròn hai năm.',
      highlight: 'will have been learning',
      incorrectEn: 'By next month, we will be living here for five years.',
      correctionNote: 'Có "by + mốc tương lai" kết hợp "for 5 years" cần dùng "will have been living" (hoặc "will have lived").',
    },
  ];

  for (let i = 0; i < additionalTenses.length; i++) {
    const t = additionalTenses[i];
    const [createdTense] = await db
      .insert(grammarTopics)
      .values({
        userId,
        categoryId: categoryMap.get('tenses')!,
        title: t.title,
        titleVi: t.titleVi,
        slug: slugify(t.title),
        difficulty: t.difficulty,
        cefrLevel: t.cefrLevel,
        learningStatus: t.learningStatus,
        explanationVi: t.explanationVi,
        explanationEn: t.explanationEn,
        whatItIs: t.whatItIs,
        whyUsed: t.whyUsed,
        whenUsed: t.whenUsed,
        howToRecognize: t.howToRecognize,
        formula: t.formula,
        usageNotes: t.usageNotes,
        classNotes: '',
        personalExplanations: '',
        customExamples: '',
        openQuestions: '',
      })
      .returning();

    await db.insert(grammarExamples).values([
      {
        topicId: createdTense.id,
        englishSentence: t.exampleEn,
        vietnameseTranslation: t.exampleVi,
        structureHighlight: t.highlight,
        isCommonMistake: false,
        sortOrder: 1,
      },
      {
        topicId: createdTense.id,
        englishSentence: t.exampleEn,
        vietnameseTranslation: t.exampleVi,
        structureHighlight: t.highlight,
        isCommonMistake: true,
        incorrectVersion: t.incorrectEn,
        correctionNote: t.correctionNote,
        sortOrder: 2,
      },
    ]);

    await db.insert(grammarReviewStates).values({
      userId,
      grammarTopicId: createdTense.id,
      status: t.learningStatus === 'not_started' ? 'new' : 'learning',
      easeFactor: 2.5,
      intervalDays: t.learningStatus === 'not_started' ? 0 : 2,
      repetitions: t.learningStatus === 'not_started' ? 0 : 1,
      lapses: 0,
      accuracyRate: 0,
      nextReviewAt: daysFromNow(i + 1),
    });
  }

  // Grammar Examples & Common Mistakes
  await db.insert(grammarExamples).values([
    {
      topicId: presentPerfect.id,
      englishSentence: 'She has worked at this company since 2022.',
      vietnameseTranslation: 'Cô ấy đã làm việc ở công ty này từ năm 2022 đến nay.',
      structureHighlight: 'has worked ... since 2022',
      isCommonMistake: false,
      sortOrder: 1,
    },
    {
      topicId: presentPerfect.id,
      englishSentence: 'I have already finished the vocabulary review.',
      vietnameseTranslation: 'Tôi đã hoàn thành phần ôn tập từ vựng rồi.',
      structureHighlight: 'have already finished',
      isCommonMistake: false,
      sortOrder: 2,
    },
    {
      topicId: presentPerfect.id,
      englishSentence: 'I lived in Hanoi for five years and I still live here now.',
      vietnameseTranslation: 'Lỗi phổ biến: dùng quá khứ đơn cho việc vẫn còn tiếp diễn ở hiện tại.',
      structureHighlight: 'have lived',
      isCommonMistake: true,
      incorrectVersion: 'I live in Hanoi for five years.',
      correctionNote: 'Đúng: "I have lived in Hanoi for five years." — có "for + khoảng thời gian" kéo dài tới hiện tại phải dùng Hiện tại hoàn thành.',
      sortOrder: 3,
    },
    {
      topicId: conditionals.id,
      englishSentence: 'If you practice for 15 minutes every day, your recall will improve noticeably.',
      vietnameseTranslation: 'Nếu bạn luyện tập 15 phút mỗi ngày, khả năng nhớ chủ động sẽ cải thiện rõ rệt.',
      structureHighlight: 'If you practice ... will improve',
      isCommonMistake: false,
      sortOrder: 1,
    },
    {
      topicId: conditionals.id,
      englishSentence: 'If I had more free time, I would read two novels a month.',
      vietnameseTranslation: 'Nếu tôi có nhiều thời gian rảnh hơn, tôi sẽ đọc hai tiểu thuyết mỗi tháng.',
      structureHighlight: 'If I had ... would read',
      isCommonMistake: true,
      incorrectVersion: 'If I would have more free time, I would read two novels a month.',
      correctionNote: 'Không dùng "would" trong mệnh đề If.',
      sortOrder: 2,
    },
    {
      topicId: articlesTopic.id,
      englishSentence: 'She is an honest colleague who works at a university.',
      vietnameseTranslation: 'Cô ấy là một đồng nghiệp trung thực làm việc tại một trường đại học.',
      structureHighlight: 'an honest / a university',
      isCommonMistake: true,
      incorrectVersion: 'She is honest colleague who works at an university.',
      correctionNote: 'Thiếu "an" trước danh từ đếm được số ít "colleague"; "university" bắt đầu bằng âm /j/ nên dùng "a".',
      sortOrder: 1,
    },
  ]);

  // Grammar Comparisons
  await db.insert(grammarComparisons).values([
    {
      topicId: presentPerfect.id,
      comparedTopicTitle: 'Past Simple (Quá khứ đơn)',
      differenceVi:
        'Past Simple dùng khi hành động ĐÃ CHẤM DỨT hoàn toàn tại một mốc thời gian cụ thể trong quá khứ (yesterday, in 2021). Present Perfect liên kết với hiện tại và không nêu mốc thời gian đã đóng.',
      contextExampleA: 'I visited Da Nang in 2022. (Đã kết thúc năm 2022)',
      contextExampleB: 'I have visited Da Nang three times. (Kinh nghiệm tính đến nay)',
      commonMistakeVi: 'Sai: "I have met him yesterday." → Đúng: "I met him yesterday."',
    },
    {
      topicId: conditionals.id,
      comparedTopicTitle: 'Type 1 (Có thật) vs Type 2 (Giả định)',
      differenceVi:
        'Type 1 nói về khả năng thực tế có thể xảy ra; Type 2 nói về tình huống trái ngược hiện tại hoặc giả tưởng.',
      contextExampleA: 'If it rains tomorrow, I will stay home. (Có khả năng mưa thật)',
      contextExampleB: 'If I were a bird, I would fly everywhere. (Không thể xảy ra)',
      commonMistakeVi: 'Dịch "Nếu tôi là bạn" hay viết nhầm "If I am you" thay vì "If I were you".',
    },
  ]);

  // Grammar Review States (2 due now)
  await db.insert(grammarReviewStates).values([
    {
      userId,
      grammarTopicId: presentPerfect.id,
      status: 'review',
      easeFactor: 2.5,
      intervalDays: 2,
      repetitions: 2,
      lapses: 0,
      accuracyRate: 0.78,
      nextReviewAt: hoursAgo(3),
    },
    {
      userId,
      grammarTopicId: conditionals.id,
      status: 'learning',
      easeFactor: 2.35,
      intervalDays: 1,
      repetitions: 1,
      lapses: 1,
      accuracyRate: 0.65,
      nextReviewAt: hoursAgo(6),
    },
    {
      userId,
      grammarTopicId: articlesTopic.id,
      status: 'learning',
      easeFactor: 2.4,
      intervalDays: 1,
      repetitions: 1,
      lapses: 1,
      accuracyRate: 0.6,
      nextReviewAt: daysFromNow(1),
    },
  ]);

  // 7. Practice Questions spanning ALL 10 exercise types
  const starterQuestions = await db
    .insert(practiceQuestions)
    .values([
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'multiple_choice',
        prompt: 'She ______ in Ho Chi Minh City since she graduated in 2021.',
        promptVi: 'Chọn đáp án đúng hoàn thành câu:',
        options: ['lives', 'lived', 'has lived', 'is living'],
        correctAnswer: 'has lived',
        acceptableAnswers: ['has lived'],
        explanationVi: 'Có "since + mốc quá khứ (2021)" diễn tả hành động kéo dài đến hiện tại → dùng Hiện tại hoàn thành (has lived).',
        difficulty: 'beginner',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'fill_in_blank',
        prompt: 'We ______ (not / finish) reviewing the new vocabulary list yet.',
        promptVi: 'Chia động từ trong ngoặc:',
        options: [],
        correctAnswer: "haven't finished",
        acceptableAnswers: ["haven't finished", 'have not finished'],
        explanationVi: 'Dấu hiệu "yet" ở cuối câu phủ định dùng Hiện tại hoàn thành: have not finished / haven’t finished.',
        difficulty: 'beginner',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'error_identification',
        prompt: 'I have visited Tokyo last summer with my family.',
        promptVi: 'Chọn cụm từ bị sai ngữ pháp trong câu:',
        options: ['I', 'have visited', 'Tokyo', 'last summer'],
        correctAnswer: 'have visited',
        acceptableAnswers: ['have visited'],
        explanationVi: 'Có mốc thời gian đã kết thúc "last summer" nên phải dùng Quá khứ đơn "visited", không dùng "have visited".',
        difficulty: 'intermediate',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'sentence_transformation',
        prompt: 'She started learning English five years ago. → She ______ English for five years.',
        promptVi: 'Viết lại toàn bộ câu hoàn chỉnh dùng Hiện tại hoàn thành:',
        options: [],
        correctAnswer: 'She has learned English for five years.',
        acceptableAnswers: [
          'She has learned English for five years.',
          'She has learnt English for five years.',
          'She has been learning English for five years.',
        ],
        explanationVi: 'Chuyển từ "started + V-ing + ... ago" sang "has/have + V3 + for + khoảng thời gian".',
        difficulty: 'intermediate',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'sentence_completion',
        prompt: 'This is the most useful grammar guide I ______ (ever / read).',
        promptVi: 'Điền phần còn thiếu để hoàn thành câu:',
        options: [],
        correctAnswer: 'have ever read',
        acceptableAnswers: ['have ever read'],
        explanationVi: 'Sau cấu trúc so sánh nhất ("the most useful...") thường dùng Hiện tại hoàn thành với "ever": have ever read.',
        difficulty: 'intermediate',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'word_ordering',
        prompt: 'Sắp xếp các từ thành câu hoàn chỉnh:',
        promptVi: 'Chạm hoặc gõ các từ theo đúng thứ tự ngữ pháp:',
        options: ['Have', 'you', 'ever', 'tried', 'spaced', 'repetition?'],
        correctAnswer: 'Have you ever tried spaced repetition?',
        acceptableAnswers: ['Have you ever tried spaced repetition?'],
        explanationVi: 'Câu hỏi Hiện tại hoàn thành: Have + S + ever + V3 + O?',
        difficulty: 'beginner',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'vi_to_en',
        prompt: 'Tôi đã sống ở đây được ba năm rồi.',
        promptVi: 'Dịch câu tiếng Việt sang tiếng Anh (dùng Present Perfect):',
        options: [],
        correctAnswer: 'I have lived here for three years.',
        acceptableAnswers: ['I have lived here for three years.', 'I have lived here for 3 years.'],
        explanationVi: 'Diễn tả hành động bắt đầu trong quá khứ và còn ở hiện tại: I have lived here for three years.',
        difficulty: 'beginner',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: presentPerfect.id,
        questionType: 'en_to_vi',
        prompt: 'He has just submitted his final essay.',
        promptVi: 'Dịch câu sang tiếng Việt tự nhiên:',
        options: [],
        correctAnswer: 'Anh ấy vừa mới nộp bài luận cuối kỳ.',
        acceptableAnswers: ['Anh ấy vừa mới nộp bài luận cuối kỳ.', 'Anh ấy vừa nộp bài luận cuối kỳ.'],
        explanationVi: '"has just + V3" diễn tả hành động vừa mới xảy ra ngay trước lúc nói.',
        difficulty: 'beginner',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: conditionals.id,
        questionType: 'contextual_selection',
        prompt: 'Ngữ cảnh: Bạn đang khuyên một người bạn đang phân vân chuyện chuyển việc (tình huống giả định). Câu nào tự nhiên nhất?',
        promptVi: 'Chọn câu phù hợp nhất với ngữ cảnh:',
        options: [
          'If I am you, I will accept the offer.',
          'If I were you, I would accept the offer.',
          'If I had been you, I would accept the offer.',
          'If I would be you, I accept the offer.',
        ],
        correctAnswer: 'If I were you, I would accept the offer.',
        acceptableAnswers: ['If I were you, I would accept the offer.'],
        explanationVi: 'Khi đưa lời khuyên ("Nếu tôi là bạn"), dùng câu điều kiện loại 2: If I were you, I would + V.',
        difficulty: 'intermediate',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: articlesTopic.id,
        questionType: 'sentence_correction',
        prompt: 'She wants to become engineer after graduating from an university.',
        promptVi: 'Sửa lại cả câu cho đúng ngữ pháp về mạo từ:',
        options: [],
        correctAnswer: 'She wants to become an engineer after graduating from a university.',
        acceptableAnswers: ['She wants to become an engineer after graduating from a university.'],
        explanationVi: 'Nghề nghiệp số ít phải có mạo từ ("an engineer"), còn "university" phát âm bắt đầu bằng /j/ nên dùng "a university".',
        difficulty: 'intermediate',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: articlesTopic.id,
        questionType: 'multiple_choice',
        prompt: 'We waited for ______ hour before the workshop began.',
        promptVi: 'Chọn mạo từ đúng:',
        options: ['a', 'an', 'the', 'không dùng mạo từ'],
        correctAnswer: 'an',
        acceptableAnswers: ['an'],
        explanationVi: '"hour" có chữ "h" câm, phát âm là /ˈaʊə(r)/ bắt đầu bằng nguyên âm nên dùng "an".',
        difficulty: 'beginner',
        isCustom: false,
      },
      {
        userId,
        grammarTopicId: conditionals.id,
        questionType: 'fill_in_blank',
        prompt: 'If the weather ______ (be) nice tomorrow, we will study at the park.',
        promptVi: 'Chia động từ trong ngoặc (Câu điều kiện loại 1):',
        options: [],
        correctAnswer: 'is',
        acceptableAnswers: ['is'],
        explanationVi: 'Câu điều kiện loại 1: mệnh đề If chia hiện tại đơn → "is".',
        difficulty: 'beginner',
        isCustom: false,
      },
    ])
    .returning();

  // Starter Practice Set
  const [starterSet] = await db
    .insert(practiceSets)
    .values({
      userId,
      title: 'Bộ bài tập Hiện tại hoàn thành (Cơ bản → Trung cấp)',
      description: 'Thực hành phân biệt dấu hiệu, sửa lỗi thì và viết lại câu.',
      sourceType: 'grammar_topic',
    })
    .returning();

  const ppQuestions = starterQuestions.slice(0, 6);
  await db.insert(practiceSetQuestions).values(
    ppQuestions.map((q, idx) => ({
      setId: starterSet.id,
      questionId: q.id,
      sortOrder: idx,
    })),
  );

  // 8. Starter Completed Learning Session
  const today = todayIsoDate(now);
  const [starterSession] = await db
    .insert(learningSessions)
    .values({
      userId,
      title: 'IELTS Writing Task 2 — Precision & Contrast Connectors',
      learningDate: today,
      sourceType: 'ielts_course',
      learningType: 'IELTS Writing & Vocabulary',
      generalNotes:
        'Lưu ý dùng tính từ chính xác (meticulous, resilient) thay cho từ quá chung chung (careful, strong). Phân biệt kỹ despite + N và although + S + V.',
      status: 'completed',
      completedAt: hoursAgo(5),
    })
    .returning();

  const linkedWords = ['meticulous', 'resilient', 'reluctant', 'despite'];
  for (const w of linkedWords) {
    const vid = vocabIdByWord.get(w);
    if (vid) {
      await db.insert(sessionVocabulary).values({
        sessionId: starterSession.id,
        vocabularyId: vid,
        addedVia: 'quick_add',
        sessionNote: 'Ghi nhận trong buổi học IELTS Writing',
      });
    }
  }

  await db.insert(sessionGrammar).values({
    sessionId: starterSession.id,
    topicId: presentPerfect.id,
    sessionNote: 'Ôn lại cách dùng Present Perfect trong mở bài Writing Task 2 ("In recent years, technology has transformed...").',
  });

  // 9. Starter Personal Mistakes (Vietnamese learner interference examples)
  await db.insert(learningMistakes).values([
    {
      userId,
      category: 'vn_direct_translation',
      vocabularyId: vocabIdByWord.get('affect') ?? null,
      originalInput: 'Social media affects to young people’s sleep.',
      correctedVersion: 'Social media affects young people’s sleep.',
      explanationVi: 'Dịch từng chữ "ảnh hưởng ĐẾN" sang "affect to" là sai vì động từ affect đi thẳng với tân ngữ, không có giới từ.',
      correctedExample: 'Excessive screen time negatively affects sleep quality.',
      sourceContext: 'Bài viết tự luyện IELTS',
      status: 'active',
    },
    {
      userId,
      category: 'tense',
      grammarTopicId: presentPerfect.id,
      originalInput: 'I live in this city for 4 years.',
      correctedVersion: 'I have lived in this city for 4 years.',
      explanationVi: 'Hành động bắt đầu trong quá khứ và kéo dài đến hiện tại (có "for 4 years") bắt buộc dùng Hiện tại hoàn thành.',
      correctedExample: 'I have lived in Ho Chi Minh City for four years.',
      sourceContext: 'Speaking Part 1',
      status: 'active',
    },
  ]);

  // 10. Starter Daily Learning Activity
  await db.insert(dailyLearningActivity).values({
    userId,
    activityDate: today,
    vocabReviewedCount: 4,
    vocabAddedCount: 4,
    grammarReviewedCount: 1,
    exercisesCompletedCount: 3,
    exercisesCorrectCount: 2,
    mistakesReviewedCount: 0,
    studySeconds: 420,
    targetMinutesSnapshot: 15,
  });

  await ensurePhraseConjugationSamples(db, userId);

  return userId;
}

export async function ensurePhraseConjugationSamples(
  db: AppDatabase,
  userId: string,
): Promise<void> {
  const existing = await db
    .select({ id: practiceQuestions.id })
    .from(practiceQuestions)
    .where(
      and(
        eq(practiceQuestions.userId, userId),
        eq(practiceQuestions.questionType, 'phrase_conjugation'),
      ),
    )
    .limit(1);

  if (existing[0]) {
    return;
  }

  const userTopics = await db
    .select({ id: grammarTopics.id, slug: grammarTopics.slug })
    .from(grammarTopics)
    .where(eq(grammarTopics.userId, userId));

  const topicBySlug = new Map(userTopics.map((t) => [t.slug, t.id]));

  const samples = [
    {
      topicSlug: slugify('Present Simple Tense'),
      prompt: 'She / (go) / to the library / every Saturday morning',
      promptVi: 'Ghép các cụm từ gợi ý và chia động từ đúng thì Hiện tại đơn:',
      options: ['She', '(go)', 'to the library', 'every Saturday morning'],
      correctAnswer: 'She goes to the library every Saturday morning.',
      acceptableAnswers: ['She goes to the library every Saturday morning.'],
      explanationVi: 'Có trạng từ chỉ thói quen "every Saturday morning" và chủ ngữ ngôi 3 số ít "She" → chia "goes".',
      difficulty: 'beginner' as const,
    },
    {
      topicSlug: slugify('Present Continuous Tense'),
      prompt: 'We / (prepare) / a vocabulary presentation / right now',
      promptVi: 'Ghép cụm từ và chia động từ đúng thì Hiện tại tiếp diễn:',
      options: ['We', '(prepare)', 'a vocabulary presentation', 'right now'],
      correctAnswer: 'We are preparing a vocabulary presentation right now.',
      acceptableAnswers: [
        'We are preparing a vocabulary presentation right now.',
        "We're preparing a vocabulary presentation right now.",
      ],
      explanationVi: 'Dấu hiệu "right now" chỉ hành động đang diễn ra lúc nói → "are preparing".',
      difficulty: 'beginner' as const,
    },
    {
      topicSlug: slugify('Present Perfect Tense'),
      prompt: 'She / (work) / at this company / since 2022',
      promptVi: 'Ghép cụm từ và chia động từ đúng thì Hiện tại hoàn thành:',
      options: ['She', '(work)', 'at this company', 'since 2022'],
      correctAnswer: 'She has worked at this company since 2022.',
      acceptableAnswers: [
        'She has worked at this company since 2022.',
        "She's worked at this company since 2022.",
        'She has been working at this company since 2022.',
      ],
      explanationVi: 'Có "since 2022" nối quá khứ tới hiện tại → dùng Hiện tại hoàn thành: "has worked".',
      difficulty: 'intermediate' as const,
    },
    {
      topicSlug: slugify('Past Simple Tense'),
      prompt: 'They / (not / attend) / the English workshop / yesterday',
      promptVi: 'Ghép cụm từ và chia thể phủ định ở thì Quá khứ đơn:',
      options: ['They', '(not / attend)', 'the English workshop', 'yesterday'],
      correctAnswer: "They didn't attend the English workshop yesterday.",
      acceptableAnswers: [
        "They didn't attend the English workshop yesterday.",
        'They did not attend the English workshop yesterday.',
      ],
      explanationVi: 'Có mốc thời gian đã qua "yesterday" → Quá khứ đơn phủ định: "did not / didn’t + V-inf (attend)".',
      difficulty: 'beginner' as const,
    },
    {
      topicSlug: slugify('Past Continuous Tense'),
      prompt: 'I / (take) / notes / when / the teacher / (explain) / the grammar rule',
      promptVi: 'Ghép câu và phối hợp thì Quá khứ tiếp diễn + Quá khứ đơn:',
      options: ['I', '(take)', 'notes', 'when', 'the teacher', '(explain)', 'the grammar rule'],
      correctAnswer: 'I was taking notes when the teacher explained the grammar rule.',
      acceptableAnswers: ['I was taking notes when the teacher explained the grammar rule.'],
      explanationVi: 'Hành động đang diễn ra làm nền chia Quá khứ tiếp diễn ("was taking"), hành động xen vào chia Quá khứ đơn ("explained").',
      difficulty: 'intermediate' as const,
    },
    {
      topicSlug: slugify('Past Perfect Tense'),
      prompt: 'By the time / the class / (start) / Minh / (review) / all the flashcards',
      promptVi: 'Ghép câu hoàn chỉnh dùng Past Perfect và Past Simple:',
      options: ['By the time', 'the class', '(start)', 'Minh', '(review)', 'all the flashcards'],
      correctAnswer: 'By the time the class started, Minh had reviewed all the flashcards.',
      acceptableAnswers: [
        'By the time the class started, Minh had reviewed all the flashcards.',
        'By the time the class started Minh had reviewed all the flashcards.',
      ],
      explanationVi: 'Việc ôn thẻ xảy ra trước giờ học bắt đầu → vế trước dùng Quá khứ đơn ("started"), vế hoàn tất trước đó dùng Quá khứ hoàn thành ("had reviewed").',
      difficulty: 'intermediate' as const,
    },
    {
      topicSlug: slugify('Future Simple Tense (will)'),
      prompt: 'I think / steady daily review / (help) / you / remember words longer',
      promptVi: 'Ghép cụm từ thành câu dự đoán ở thì Tương lai đơn:',
      options: ['I think', 'steady daily review', '(help)', 'you', 'remember words longer'],
      correctAnswer: 'I think steady daily review will help you remember words longer.',
      acceptableAnswers: [
        'I think steady daily review will help you remember words longer.',
      ],
      explanationVi: 'Sau "I think" nêu dự đoán tương lai → dùng "will + V-inf (will help)".',
      difficulty: 'beginner' as const,
    },
    {
      topicSlug: slugify('Future Perfect Tense'),
      prompt: 'By the end of this year / we / (master) / 500 academic words',
      promptVi: 'Ghép cụm từ và chia động từ đúng thì Tương lai hoàn thành:',
      options: ['By the end of this year', 'we', '(master)', '500 academic words'],
      correctAnswer: 'By the end of this year, we will have mastered 500 academic words.',
      acceptableAnswers: [
        'By the end of this year, we will have mastered 500 academic words.',
        'By the end of this year we will have mastered 500 academic words.',
        "By the end of this year, we'll have mastered 500 academic words.",
      ],
      explanationVi: 'Có cụm "By + mốc thời gian tương lai" nhấn mạnh hoàn tất trước hạn → dùng Tương lai hoàn thành "will have mastered".',
      difficulty: 'intermediate' as const,
    },
  ];

  const insertedQuestions = await db
    .insert(practiceQuestions)
    .values(
      samples.map((s) => ({
        userId,
        grammarTopicId: topicBySlug.get(s.topicSlug) ?? null,
        questionType: 'phrase_conjugation' as const,
        prompt: s.prompt,
        promptVi: s.promptVi,
        options: s.options,
        correctAnswer: s.correctAnswer,
        acceptableAnswers: s.acceptableAnswers,
        explanationVi: s.explanationVi,
        difficulty: s.difficulty,
        isCustom: false,
      })),
    )
    .returning();

  const [setRow] = await db
    .insert(practiceSets)
    .values({
      userId,
      title: 'Bộ luyện Ghép cụm từ & Chia thì (8 thì trọng tâm)',
      description: 'Tập ghép các mảnh cụm từ gợi ý và chia đúng thì để viết thành câu hoàn chỉnh.',
      sourceType: 'grammar_topic',
    })
    .returning();

  await db.insert(practiceSetQuestions).values(
    insertedQuestions.map((q, idx) => ({
      setId: setRow.id,
      questionId: q.id,
      sortOrder: idx,
    })),
  );
}

// Allow running directly via `pnpm db:seed`
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('seed.ts');

if (isDirectRun) {
  void (async () => {
    const { createDatabase } = await import('./index.js');
    const handle = await createDatabase({
      databaseUrl: process.env.DATABASE_URL,
      dataDir: process.env.DATA_DIR,
    });
    try {
      const uid = await seedDatabase(handle.db);
      console.log(`Seed completed successfully for user ${uid} (driver: ${handle.driver})`);
    } finally {
      await handle.close();
    }
  })().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
