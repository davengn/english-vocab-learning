# DATABASE_SCHEMA.md — PostgreSQL Relational Schema (23 Tables)

All tables are defined in `src/server/db/schema.ts` using `drizzle-orm/pg-core` with PostgreSQL SQL migrations stored in `drizzle/`.

---

## 1. Entity Relationship Overview

```text
users ──┬── user_settings
        ├── learning_sessions ──┬── session_vocabulary ──── vocabulary ──┬── vocabulary_examples
        │                       │                                        ├── vocabulary_relations
        │                       │                                        ├── collocations
        │                       │                                        ├── vocabulary_collection_items ── vocabulary_collections
        │                       │                                        ├── vocabulary_tag_items ───────── vocabulary_tags
        │                       │                                        ├── word_comparison_items ──────── word_comparison_groups
        │                       │                                        └── vocabulary_review_states (per skill_direction)
        │                       └── session_grammar ─────── grammar_topics ──┬── grammar_categories
        │                                                                ├── grammar_examples
        │                                                                ├── grammar_comparisons
        │                                                                └── grammar_review_states
        ├── practice_questions ──── practice_set_questions ── practice_sets
        ├── practice_sessions ───── practice_attempts ─────── learning_mistakes
        └── daily_learning_activity
```

---

## 2. Table Specifications

### Identity & Preferences
1. **`users`**: `id` (uuid PK), `name` (text), `email` (text unique), `created_at` (timestamp).
2. **`user_settings`**: `id` (uuid PK), `user_id` (uuid unique FK), `daily_target_minutes` (int, default 15), `daily_vocab_target` (int, default 20), `daily_grammar_target` (int, default 2), `ui_language` (text, default `'vi'`), `default_review_direction` (text, default `'en_to_vi'`), `keyboard_shortcuts_enabled` (boolean, default true), `updated_at` (timestamp).

### Learning Sessions
3. **`learning_sessions`**: `id` (uuid PK), `user_id` (FK), `title`, `learning_date` (`YYYY-MM-DD`), `source_type` (`english_class | ielts_course | textbook | online_course | youtube_podcast | reading | self_study | other`), `learning_type`, `general_notes`, `status` (`draft | completed`), `completed_at`, `created_at`, `updated_at`.
4. **`session_vocabulary`**: `id` (uuid PK), `session_id` (FK cascade), `vocabulary_id` (FK cascade), `added_via` (`quick_add | bulk_paste | import | existing`), `session_note`, `created_at`. Unique index `(session_id, vocabulary_id)`.
5. **`session_grammar`**: `id` (uuid PK), `session_id` (FK cascade), `topic_id` (FK cascade), `session_note`, `created_at`. Unique index `(session_id, topic_id)`.

### Vocabulary Library
6. **`vocabulary`**: `id` (uuid PK), `user_id` (FK), `word`, `normalized_word`, `ipa`, `part_of_speech`, `cefr_level` (`A1..C2 | unknown`), `english_definition`, `vietnamese_meaning`, `vietnamese_explanation`, `english_explanation`, `nuance`, `register` (`formal | neutral | informal`), `tone` (`positive | negative | neutral`), `usage_context`, `when_to_use`, `when_not_to_use`, `vn_common_mistakes`, `vn_wrong_combinations`, `vn_confusing_words`, `vn_translation_traps`, `personal_notes`, `source`, `confidence_level` (1..5), `is_favorite` (boolean), `status` (`new | learning | reviewing | mastered`), `is_incomplete` (boolean), `created_at`, `updated_at`. Unique index `(user_id, normalized_word)`.
7. **`vocabulary_examples`**: `id`, `vocabulary_id` (FK cascade), `english_sentence`, `vietnamese_translation`, `highlight_text`, `sort_order`.
8. **`vocabulary_relations`**: `id`, `vocabulary_id` (FK cascade), `related_vocabulary_id` (FK set null), `relation_type` (`synonym | antonym | word_family | common_phrase | phrasal_verb | related_expression`), `text`, `note`.
9. **`collocations`**: `id`, `vocabulary_id` (FK cascade), `phrase`, `vietnamese_meaning`, `example_sentence`, `example_translation`.
10. **`vocabulary_collections`**: `id`, `user_id` (FK), `name`, `slug`, `description`, `is_system` (boolean), `sort_order`, `created_at`. Unique `(user_id, slug)`.
11. **`vocabulary_collection_items`**: `collection_id` (FK cascade), `vocabulary_id` (FK cascade). Composite PK.
12. **`vocabulary_tags`**: `id`, `user_id` (FK), `name`, `slug`, `color`. Unique `(user_id, slug)`.
13. **`vocabulary_tag_items`**: `tag_id` (FK cascade), `vocabulary_id` (FK cascade). Composite PK.
14. **`word_comparison_groups`**: `id`, `user_id` (FK), `title`, `summary_vi`, `created_at`, `updated_at`.
15. **`word_comparison_items`**: `id`, `group_id` (FK cascade), `vocabulary_id` (FK set null), `label`, `meaning_vi`, `grammar_diff`, `usage_context`, `example_en`, `example_vi`, `common_mistake_vi`, `sort_order`.

### Grammar Knowledge Base
16. **`grammar_categories`**: `id`, `user_id` (FK), `name`, `name_vi`, `slug`, `description`, `sort_order`, `is_system`. Unique `(user_id, slug)`.
17. **`grammar_topics`**: `id`, `user_id` (FK), `category_id` (FK), `title`, `title_vi`, `slug`, `difficulty` (`beginner | intermediate | advanced`), `cefr_level`, `learning_status` (`not_started | learning | practicing | mastered`), `explanation_vi`, `explanation_en`, `what_it_is`, `why_used`, `when_used`, `how_to_recognize`, `formula`, `usage_notes`, `class_notes`, `personal_explanations`, `custom_examples`, `open_questions`, `related_topic_ids` (`jsonb` string[]), `created_at`, `updated_at`. Unique `(user_id, slug)`.
18. **`grammar_examples`**: `id`, `topic_id` (FK cascade), `english_sentence`, `vietnamese_translation`, `structure_highlight`, `is_common_mistake` (boolean), `incorrect_version`, `correction_note`, `sort_order`.
19. **`grammar_comparisons`**: `id`, `topic_id` (FK cascade), `compared_topic_title`, `compared_topic_id` (FK set null), `difference_vi`, `context_example_a`, `context_example_b`, `common_mistake_vi`.

### Practice, SRS, Mistakes & Daily Activity
20. **`practice_questions`**: `id`, `user_id` (FK), `grammar_topic_id` (FK set null), `vocabulary_id` (FK set null), `question_type` (10 supported types), `prompt`, `prompt_vi`, `options` (`jsonb` string[]), `correct_answer`, `acceptable_answers` (`jsonb` string[]), `explanation_vi`, `difficulty`, `is_custom`, `created_at`, `updated_at`.
21. **`practice_sets`** & **`practice_set_questions`**: Custom and mistake-derived exercise sets (`source_type`: `custom | grammar_topic | mistake_bank`), ordered via `sort_order`.
22. **`practice_sessions`** & **`practice_attempts`**: Tracks every vocabulary, grammar, daily review, and mistake review session along with individual graded attempts (`user_answer`, `expected_answer`, `is_correct`, `self_rating`, `response_time_ms`).
23. **Review States, Mistakes & Daily Log**:
    - **`vocabulary_review_states`**: Unique `(user_id, vocabulary_id, skill_direction)` (`en_to_vi | vi_to_en | context | spelling`), SM-2 `ease_factor`, `interval_days`, `repetitions`, `lapses`, `last_rating`, `last_reviewed_at`, `next_review_at`.
    - **`grammar_review_states`**: Unique `(user_id, grammar_topic_id)`, SM-2 fields + `accuracy_rate`.
    - **`learning_mistakes`**: 9 categorized error buckets (`tense`, `subject_verb_agreement`, `articles`, `prepositions`, `word_order`, `pluralization`, `verb_forms`, `vn_direct_translation`, `vocabulary_usage`), `original_input`, `corrected_version`, `explanation_vi`, `corrected_example`, `status` (`active | reviewed | resolved`), `review_count`.
    - **`daily_learning_activity`**: Unique `(user_id, activity_date)` storing real counts per day for streaks, target progress, and 14-day timelines.

---

## 3. Deduplication & Integrity Guarantees

- **Vocabulary Deduplication**: `vocabulary` enforces a unique index on `(user_id, normalized_word)`. Adding a word in a Learning Session or CSV import looks up `normalized_word` first and links/merges instead of inserting a duplicate.
- **Multi-Session Membership**: `session_vocabulary` and `session_grammar` allow the same word or grammar topic to appear in multiple sessions over months without duplicating the underlying knowledge record.
- **Safe Cascade & Preservation**: Removing a word from a session deletes only the `session_vocabulary` link, preserving the global vocabulary record and its review history.
