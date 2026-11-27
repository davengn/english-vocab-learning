# IMPLEMENTATION_PLAN.md — 6-Phase Build & Verification Plan

## Phase 1: Foundation
- Initialize `package.json`, TypeScript, Vite 6, Tailwind CSS v4, Hono, Drizzle ORM (`@electric-sql/pglite` + `pg`), Zod, Papaparse, ExcelJS, Vitest.
- Author complete 23-table PostgreSQL schema (`src/server/db/schema.ts`), generate SQL migrations (`drizzle/`), implement dual-driver DB bootstrap and idempotent seed script (`8` collections, `16` grammar categories, starter vocabulary, comparisons, grammar lessons, 10-type grammar questions, session, mistakes).
- Implement Warm Editorial Minimalism design tokens, typography (`Inter`, `Be Vietnam Pro`, `Noto Sans`, `JetBrains Mono`), UI primitives (including IME-safe input helpers, native `<dialog>`, responsive semantic tables), 7-route Vietnamese app shell, global quick-add modals, and `⌘K` command palette.

## Phase 2: Learning Sessions (`Buổi học`)
- Sessions index with search, status/source filters, and creation dialog.
- Session workspace (`Từ vựng`, `Ngữ pháp`, `Ghi chú`) with debounced draft autosave.
- Quick Add (allows incomplete entries + inline editing), deterministic Bulk Paste with preview and duplicate highlighting, and CSV/XLSX import inside session.
- Grammar linking and inline new grammar topic creation.
- Pre-completion summary dialog (vocab count, grammar count, duplicate warnings, incomplete entries) + transactional completion that updates global libraries, creates bidirectional SM-2 review states, and records learning history.

## Phase 3: Vocabulary Library (`Từ vựng`)
- Full searchable/filterable/sortable vocabulary table (CEFR, POS, collection, tag, confidence, status, favorite, incomplete).
- Built-in 8 collections + custom collection CRUD + tag management.
- 6-section Vocabulary Detail & Editor view (Basic Info, Meaning & Usage, Examples with highlighted target word, Word Relationships & Collocations, Vietnamese Learner Notes, Personal Info + Linked Sessions + Per-direction SM-2 schedule).
- Similar Word Comparison workbench (`So sánh từ dễ nhầm`) with side-by-side matrix.
- Global CSV/XLSX import wizard (column mapping, validation, duplicate handling, selective checkboxes) and UTF-8 BOM CSV export.

## Phase 4: Grammar Knowledge Base (`Ngữ pháp`)
- 16 built-in grammar categories + custom category/topic creation.
- 3-column Amie Docs lesson layout: category/topic navigation, `72ch` structured lesson reader & editor (Overview, What/Why/When/How, Formula, Examples + Common Mistakes, Structure Comparisons, Personal Notes & Questions, Linked Sessions, Linked Practice Questions), and sticky "Trong bài này" TOC.

## Phase 5: Practice Engine (`Luyện tập`)
- **Vocabulary Practice**: All 8 deterministic modes (`en_to_vi`, `vi_to_en`, `flashcard`, `fill_in_blank`, `context_recognition`, `spelling`, `collocation_match`, `sentence_production`) with keyboard shortcuts (`Space`, `1–4`, IME-safe `Enter`), independent SM-2 updates per direction, and honest side-by-side reference comparison for sentence production.
- **Grammar Practice**: All 10 exercise types (`multiple_choice`, `fill_in_blank`, `error_identification`, `sentence_transformation`, `sentence_completion`, `word_ordering`, `vi_to_en`, `en_to_vi`, `contextual_selection`, `sentence_correction`) with immediate correctness, Vietnamese explanation, link to grammar topic, and 1-click "Lưu vào Ngân hàng lỗi sai".
- Manual Question Builder + Custom Exercise Set Manager + Practice History view.

## Phase 6: Daily Review, Mistake Bank & Analytics
- Unified `Ôn tập hôm nay` center: 5-step workflow, configurable daily target (5/10/15/20/custom min), gentle break recovery (no streak punishment).
- Personal Mistake Bank: filter across 8 Vietnamese-focused error categories, manually add/edit explanations & corrected examples, mark reviewed/resolved, and generate persistent practice sets directly from saved mistakes.
- `Tổng quan` Dashboard & `Thống kê` Analytics powered 100% by real PostgreSQL aggregations (Recognition vs Active Recall comparison, weak grammar categories, frequently forgotten words, due counts, recent sessions, recent mistakes, 14-day activity bars).

---

## Automated Testing & Acceptance Matrix

1. **Unit Tests (`tests/unit/`)**:
   - `srs.test.ts`: SM-2 intervals, ease bounds `[1.3, 3.0]`, lapse resets, independent skill directions, bidirectional mastery, priority queue ordering, daily target cap.
   - `bulkParser.test.ts`: Tab, pipe, hyphen, colon delimiters, single-word incomplete entries, Vietnamese diacritics, IPA preservation, duplicate flags.
   - `csvExport.test.ts`: UTF-8 BOM, RFC 4180 escaping, Vietnamese diacritic preservation.
2. **Integration Tests (`tests/integration/api.test.ts`)**:
   - Covers all **6 MVP Acceptance Scenarios** against real Drizzle PostgreSQL migrations on PGlite (including disk persistence across close/reopen).
3. **Verification Gate**:
   - `pnpm typecheck` passes cleanly.
   - `pnpm test` passes 100%.
   - `pnpm build` passes cleanly.
   - Live browser verification of all routes, forms, practice runners, and page reload persistence with zero console errors.
   - Dependency audit confirms zero AI/LLM packages or provider settings.
