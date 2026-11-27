# ARCHITECTURE.md — System Architecture & Technical Design

## 1. Architectural Principles

1. **Zero-AI Deterministic Core**: All parsing, exercise generation, answer normalization, spaced repetition scheduling, weak-area detection, and analytics run purely in TypeScript and PostgreSQL SQL. No AI SDKs, LLM wrappers, or external model calls exist anywhere.
2. **Real Relational Persistence**: Every workflow persists directly to PostgreSQL via Drizzle ORM (`drizzle-orm/pg-core`).
3. **Zero-Config Local PostgreSQL + Production PostgreSQL Compatibility**:
   - **Default Local Mode (`DATABASE_URL` unset)**: Runs `@electric-sql/pglite` backed by `./data/pgdata` (embedded full PostgreSQL engine persisted on disk across refreshes and server restarts).
   - **External PostgreSQL Mode (`DATABASE_URL` set)**: Connects via `pg` (`node-postgres`) to PostgreSQL 16 (supported by `docker-compose.yml`).
   - **Test Mode (`inMemory: true`)**: Runs an isolated in-memory `PGlite` instance executing the exact same Drizzle PostgreSQL migration files from `./drizzle/`.
4. **Type-Safe Boundary**: Shared Zod schemas and domain types live in `src/shared/` and are consumed by both the Hono REST API and the React frontend.

---

## 2. Repository Structure

```text
english-vocab-learning/
├── docs/                       # Argon Planning specifications (6 markdown files)
├── drizzle/                    # Generated PostgreSQL SQL migration files
├── src/
│   ├── shared/
│   │   ├── schemas.ts          # Zod schemas, enum definitions, Vietnamese labels
│   │   ├── srs.ts              # Deterministic SM-2 scheduler & priority scoring
│   │   ├── bulkParser.ts       # Deterministic line/tab/delimiter bulk vocabulary parser
│   │   └── csvExport.ts        # UTF-8 BOM RFC-4180 CSV exporter
│   ├── server/
│   │   ├── index.ts            # Server bootstrap (migrations, seed, Hono + static assets)
│   │   ├── app.ts              # Hono app factory createApp(db) + error middleware
│   │   ├── db/
│   │   │   ├── schema.ts       # 23 PostgreSQL tables (Drizzle pg-core)
│   │   │   ├── index.ts        # Dual-driver DB factory (PGlite / pg) + migrations
│   │   │   └── seed.ts         # Idempotent starter data & system taxonomy seed
│   │   └── routes/
│   │       ├── settings.ts     # User settings & daily target configuration
│   │       ├── sessions.ts     # Learning sessions, quick/bulk capture, completion tx
│   │       ├── vocabulary.ts   # CRUD, search/filter, CSV/XLSX import/export, collections, tags, comparisons
│   │       ├── grammar.ts      # Categories, topics, examples, comparisons, notes
│   │       ├── practice.ts     # Question/set CRUD, deterministic exercise engine, attempts
│   │       ├── review.ts       # Unified 5-step daily review queue
│   │       ├── mistakes.ts     # Personal mistake bank + practice set generation
│   │       └── analytics.ts    # Dashboard KPIs & SQL-computed learning insights
│   └── client/
│       ├── index.css           # Design tokens, typography utilities, native dialog/table rules
│       ├── main.tsx            # React root, QueryClient, Toast & Router setup
│       ├── App.tsx             # 7-route shell + modals + keyboard palette
│       ├── lib/                # API client, IME safety helpers, formatting utilities
│       ├── components/         # UI primitives, layout shell, modals, runners
│       └── pages/              # Route views for all 7 nav sections + detail views
├── tests/
│   ├── unit/                   # SM-2, bulk parser, CSV export unit tests
│   └── integration/            # End-to-end API + persistence tests for 6 scenarios
├── drizzle.config.ts
├── docker-compose.yml
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. REST API Contract (`/api`)

All endpoints accept/return JSON (except `/api/vocabulary/import/parse` multipart upload and `/api/vocabulary/export.csv`), validate payloads with Zod, and return structured `{ error, details? }` responses on `400`/`404`/`409`/`500`.

- **Health & Settings**: `GET /api/health`, `GET /api/settings`, `PATCH /api/settings`
- **Sessions**: `GET/POST /api/sessions`, `GET/PATCH/DELETE /api/sessions/:id`, `POST /api/sessions/:id/vocabulary`, `POST /api/sessions/:id/vocabulary/bulk`, `DELETE /api/sessions/:id/vocabulary/:vocabId`, `POST /api/sessions/:id/grammar`, `DELETE /api/sessions/:id/grammar/:topicId`, `GET /api/sessions/:id/completion-preview`, `POST /api/sessions/:id/complete`
- **Vocabulary**: `GET/POST /api/vocabulary`, `GET/PATCH/DELETE /api/vocabulary/:id`, `POST /api/vocabulary/import/parse`, `POST /api/vocabulary/import/commit`, `GET /api/vocabulary/export.csv`, `GET/POST/DELETE /api/collections`, `GET/POST/DELETE /api/tags`, `GET/POST/PATCH/DELETE /api/comparisons`
- **Grammar**: `GET/POST/PATCH/DELETE /api/grammar/categories`, `GET/POST /api/grammar/topics`, `GET/PATCH/DELETE /api/grammar/topics/:id`
- **Practice**: `GET/POST/PATCH/DELETE /api/practice/questions`, `GET/POST/PATCH/DELETE /api/practice/sets`, `POST /api/practice/vocabulary/generate`, `POST /api/practice/sessions`, `POST /api/practice/sessions/:id/attempts`, `POST /api/practice/sessions/:id/complete`, `GET /api/practice/history`
- **Daily Review & Mistakes**: `GET /api/daily-review`, `GET/POST/PATCH/DELETE /api/mistakes`, `POST /api/mistakes/create-practice-set`
- **Analytics**: `GET /api/analytics/dashboard`, `GET /api/analytics/insights`

---

## 4. Deterministic Core Engines

### A. Spaced Repetition (`src/shared/srs.ts`)
- Implements **SM-2** with 4 learner ratings: `1 (Again/Quên)`, `2 (Hard/Khó)`, `3 (Good/Nhớ)`, `4 (Easy/Rất dễ)`.
- Ease Factor constrained to `[1.3, 3.0]`, default `2.5`.
- Independent state tracked per `(vocabulary_id, skill_direction)` (`en_to_vi`, `vi_to_en`, `context`, `spelling`) and per `grammar_topic_id`.
- Priority queue formula ranks overdue days, lapse frequency, low user confidence, low ease factor, and confusing words first.

### B. Bulk Paste & Spreadsheet Import (`src/shared/bulkParser.ts`, `papaparse`, `exceljs`)
- Bulk paste splits lines and deterministically detects `\t`, ` | `, ` - `, ` : ` delimiters. Single-word lines are accepted as incomplete drafts (`isIncomplete = true`) so users never lose fast class notes.
- CSV/XLSX parser extracts headers, suggests column mappings by exact/substring matching against known headers, validates rows via Zod, flags duplicates against `vocabulary.normalized_word`, and lets users selectively import rows (`skip` / `merge` / `link_existing`).

### C. Deterministic Exercise Engine
- Vocabulary modes (`en_to_vi`, `vi_to_en`, `flashcard`, `fill_in_blank`, `context_recognition`, `spelling`, `collocation_match`, `sentence_production`) construct questions strictly from stored definitions, examples (clozed via target word matching), collocations, and other library words as deterministic distractors.
- `sentence_production` presents a user-written reference answer/example side-by-side for honest self-grading without fake AI scoring.
- Grammar exercises support all 10 formats using manually authored `practice_questions` and mistake-derived correction prompts.
