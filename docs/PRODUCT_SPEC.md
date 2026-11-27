# PRODUCT_SPEC.md — Personal English Learning OS (V1)

## 1. Product Vision & Principle

**Personal English Learning OS (V1)** is a calm, high-precision web application designed specifically for **Vietnamese native speakers** learning English through classes, IELTS courses, textbooks, online courses, YouTube/podcasts, and self-study.

Core product loop:

**Capture → Understand → Memorize → Practice → Master**

Instead of passive dictionary lookups or superficial gamification, the system treats every class or self-study session as a primary knowledge intake event, links captured words and grammar topics into structured personal libraries without duplication, schedules bidirectional spaced repetition, and converts personal mistakes into targeted practice.

---

## 2. Strict V1 Boundary — Zero AI

**V1 explicitly contains ZERO AI features.**

Excluded from V1:
- No AI chatbots, tutors, or assistants.
- No AI-generated vocabulary definitions, explanations, examples, or translations.
- No AI-generated exercises or distractors.
- No AI-powered text analysis or automatic vocabulary extraction.
- No LLM SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`, `ai`, `langchain`, etc.).
- No AI provider configuration screens, model selectors, or API key storage.
- No simulated "AI semantic grading" in sentence production or translation exercises.

All V1 capabilities operate using **conventional application logic, explicit user input, structured relational data, deterministic parsers, and deterministic SM-2 scheduling**.

---

## 3. Target User

- **Primary persona**: A Vietnamese native speaker studying English seriously (e.g., IELTS preparation, academic/business English, or structured self-study).
- **Primary pain points solved**:
  1. Notes scattered across notebooks, spreadsheets, and screenshots after class are never reviewed.
  2. Flashcard tools test passive recognition (`English → Vietnamese`) while neglecting active recall (`Vietnamese → English`) and contextual usage.
  3. Grammar rules are forgotten because formulas, Vietnamese explanations, and personal mistakes live separately from exercises.
  4. Typical Vietnamese-to-English interference errors (missing articles, dropped plural/verb endings, tense omission, direct Vietnamese word-for-word translation) repeat without a dedicated Mistake Bank.

---

## 4. Information Architecture & Navigation

Default UI language: **Vietnamese** (`vi`). English is used for vocabulary items, grammar titles/formulas, examples, and exercises.

### Primary Navigation (7 Views)
1. **Tổng quan** (`/`) — Daily status, review target progress, non-punitive streak, weak areas, recent sessions, recent mistakes.
2. **Buổi học** (`/sessions`, `/sessions/:id`) — Capture workspace after class/self-study (Từ vựng, Ngữ pháp, Ghi chú).
3. **Từ vựng** (`/vocabulary`, `/vocabulary/:id`, `/vocabulary/comparisons`) — Structured vocabulary library, collections, tags, CSV/XLSX import & export, side-by-side similar word comparisons.
4. **Ngữ pháp** (`/grammar`, `/grammar/:id`) — Structured grammar knowledge base across 16+ categories with custom lessons, examples, comparisons, and notes.
5. **Luyện tập** (`/practice`) — 8 vocabulary practice modes, 10 grammar exercise types, manual question/set authoring, and practice history.
6. **Ôn tập hôm nay** (`/review`) — Unified 5-step daily review center + Personal Mistake Bank.
7. **Thống kê** (`/analytics`) — Real DB-backed learning insights (Recognition vs Active Recall, weak grammar categories, frequently forgotten words, 14-day timeline).

### Global Quick Actions
- **+ Từ vựng** — Quick-add modal accessible from any page.
- **+ Ngữ pháp** — Quick-create grammar topic modal/navigation.
- **+ Buổi học** — Create a new learning session immediately.
- **Bắt đầu ôn tập** — Jump directly into today's due review queue.
- **⌘K / Ctrl+K** — Command palette to search words, grammar topics, sessions, or trigger global actions.

---

## 5. Core User Journeys

1. **After-Class Capture**:
   - Create a session (`Buổi học`) with title, date, source (`English class`, `IELTS course`, etc.), learning type, and notes.
   - Rapidly add vocabulary via Quick Add (including incomplete drafts), Bulk Paste (`word\tmeaning`), or CSV/XLSX import.
   - Link existing grammar topics or author new grammar topics with formulas, Vietnamese explanations, examples, and common mistakes.
   - Review completion summary (counts, duplicate warnings, incomplete entries) and complete the session to link everything into the global knowledge base and initialize spaced repetition states.
2. **Deep Vocabulary Understanding & Comparison**:
   - Enrich words with IPA, part of speech, CEFR, English/Vietnamese explanations, nuance/register/tone, collocations, relations, Vietnamese learner trap notes, and linked sessions.
   - Group confusing pairs (`Affect vs Effect`, `Economic vs Economical`, `Borrow vs Lend`) into side-by-side comparison tables.
3. **Bidirectional Memorization & Active Practice**:
   - Practice vocabulary across 8 deterministic modes, tracking `en_to_vi`, `vi_to_en`, `context`, and `spelling` independently via SM-2.
   - Practice grammar across 10 exercise types using manually authored questions, seeing immediate feedback, Vietnamese explanations, and links back to grammar lessons.
4. **Mistake Tracking & Long-Term Retrieval**:
   - Save incorrect exercise answers into the Personal Mistake Bank categorized by Vietnamese learner error patterns.
   - Generate custom practice sets directly from saved mistakes.
   - Retrieve any learned item months later by word, grammar category/topic, or original learning session.

---

## 6. Out of Scope for V1

- Social features, leaderboards, multi-user classrooms, teacher dashboards, or commercial LMS workflows.
- Cloud sync / multi-tenant auth servers (V1 runs as a reliable single-user personal local-first web app backed by PostgreSQL).
- Built-in TTS audio synthesis engines or external dictionary scraping APIs.

---

## 7. MVP Acceptance Criteria

1. **Scenario 1 — After Class**: Create a session, paste 20 vocabulary words, add 2 grammar topics, enter notes, review warnings, and complete the session without creating duplicate global records.
2. **Scenario 2 — Vocabulary**: Search vocabulary, inspect full details, compare similar words side-by-side, and practice in both directions (`EN → VI` and `VI → EN`) with independent SM-2 states.
3. **Scenario 3 — Grammar**: Create a Present Perfect lesson, add examples and common mistakes, add exercises, and practice it later.
4. **Scenario 4 — Mistake Tracking**: Answer grammar exercises incorrectly, save mistakes to the Mistake Bank, add explanations/corrected examples, and create/revisit a practice set from mistakes.
5. **Scenario 5 — Long-term Learning**: Retrieve knowledge by vocabulary word, grammar topic, or original learning session.
6. **Scenario 6 — Persistence**: Refresh the browser or restart the server without losing any learning data.
