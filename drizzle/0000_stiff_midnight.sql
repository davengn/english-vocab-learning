CREATE TYPE "public"."cefr_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."grammar_difficulty" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."grammar_learning_status" AS ENUM('not_started', 'learning', 'practicing', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."mistake_category" AS ENUM('tense', 'subject_verb_agreement', 'articles', 'prepositions', 'word_order', 'pluralization', 'verb_forms', 'vn_direct_translation', 'vocabulary_usage');--> statement-breakpoint
CREATE TYPE "public"."mistake_status" AS ENUM('active', 'reviewed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."practice_domain" AS ENUM('vocabulary', 'grammar', 'daily_review', 'mistake_review');--> statement-breakpoint
CREATE TYPE "public"."practice_question_type" AS ENUM('multiple_choice', 'fill_in_blank', 'error_identification', 'sentence_transformation', 'sentence_completion', 'word_ordering', 'vi_to_en', 'en_to_vi', 'contextual_selection', 'sentence_correction');--> statement-breakpoint
CREATE TYPE "public"."practice_set_source" AS ENUM('custom', 'grammar_topic', 'mistake_bank');--> statement-breakpoint
CREATE TYPE "public"."vocab_register" AS ENUM('formal', 'neutral', 'informal');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('new', 'learning', 'review', 'mastered');--> statement-breakpoint
CREATE TYPE "public"."session_source_type" AS ENUM('english_class', 'ielts_course', 'textbook', 'online_course', 'youtube_podcast', 'reading', 'self_study', 'other');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('draft', 'completed');--> statement-breakpoint
CREATE TYPE "public"."session_vocab_added_via" AS ENUM('quick_add', 'bulk_paste', 'import', 'existing');--> statement-breakpoint
CREATE TYPE "public"."skill_direction" AS ENUM('en_to_vi', 'vi_to_en', 'context', 'spelling');--> statement-breakpoint
CREATE TYPE "public"."vocab_tone" AS ENUM('positive', 'negative', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."vocab_relation_type" AS ENUM('synonym', 'antonym', 'word_family', 'common_phrase', 'phrasal_verb', 'related_expression');--> statement-breakpoint
CREATE TYPE "public"."vocab_status" AS ENUM('new', 'learning', 'reviewing', 'mastered');--> statement-breakpoint
CREATE TABLE "collocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"phrase" text NOT NULL,
	"vietnamese_meaning" text DEFAULT '' NOT NULL,
	"example_sentence" text DEFAULT '' NOT NULL,
	"example_translation" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_learning_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_date" text NOT NULL,
	"vocab_reviewed_count" integer DEFAULT 0 NOT NULL,
	"vocab_added_count" integer DEFAULT 0 NOT NULL,
	"grammar_reviewed_count" integer DEFAULT 0 NOT NULL,
	"exercises_completed_count" integer DEFAULT 0 NOT NULL,
	"exercises_correct_count" integer DEFAULT 0 NOT NULL,
	"mistakes_reviewed_count" integer DEFAULT 0 NOT NULL,
	"study_seconds" integer DEFAULT 0 NOT NULL,
	"target_minutes_snapshot" integer DEFAULT 15 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_vi" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"compared_topic_title" text NOT NULL,
	"compared_topic_id" uuid,
	"difference_vi" text DEFAULT '' NOT NULL,
	"context_example_a" text DEFAULT '' NOT NULL,
	"context_example_b" text DEFAULT '' NOT NULL,
	"common_mistake_vi" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"english_sentence" text NOT NULL,
	"vietnamese_translation" text DEFAULT '' NOT NULL,
	"structure_highlight" text DEFAULT '' NOT NULL,
	"is_common_mistake" boolean DEFAULT false NOT NULL,
	"incorrect_version" text DEFAULT '' NOT NULL,
	"correction_note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_review_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"grammar_topic_id" uuid NOT NULL,
	"status" "review_status" DEFAULT 'new' NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"accuracy_rate" real DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"title_vi" text DEFAULT '' NOT NULL,
	"slug" text NOT NULL,
	"difficulty" "grammar_difficulty" DEFAULT 'intermediate' NOT NULL,
	"cefr_level" "cefr_level" DEFAULT 'B1' NOT NULL,
	"learning_status" "grammar_learning_status" DEFAULT 'learning' NOT NULL,
	"explanation_vi" text DEFAULT '' NOT NULL,
	"explanation_en" text DEFAULT '' NOT NULL,
	"what_it_is" text DEFAULT '' NOT NULL,
	"why_used" text DEFAULT '' NOT NULL,
	"when_used" text DEFAULT '' NOT NULL,
	"how_to_recognize" text DEFAULT '' NOT NULL,
	"formula" text DEFAULT '' NOT NULL,
	"usage_notes" text DEFAULT '' NOT NULL,
	"class_notes" text DEFAULT '' NOT NULL,
	"personal_explanations" text DEFAULT '' NOT NULL,
	"custom_examples" text DEFAULT '' NOT NULL,
	"open_questions" text DEFAULT '' NOT NULL,
	"related_topic_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "mistake_category" NOT NULL,
	"vocabulary_id" uuid,
	"grammar_topic_id" uuid,
	"practice_attempt_id" uuid,
	"original_input" text NOT NULL,
	"corrected_version" text NOT NULL,
	"explanation_vi" text DEFAULT '' NOT NULL,
	"corrected_example" text DEFAULT '' NOT NULL,
	"source_context" text DEFAULT '' NOT NULL,
	"status" "mistake_status" DEFAULT 'active' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"learning_date" text NOT NULL,
	"source_type" "session_source_type" DEFAULT 'self_study' NOT NULL,
	"learning_type" text DEFAULT 'Tổng hợp' NOT NULL,
	"general_notes" text DEFAULT '' NOT NULL,
	"status" "session_status" DEFAULT 'draft' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vocabulary_id" uuid,
	"grammar_topic_id" uuid,
	"question_id" uuid,
	"mode" text NOT NULL,
	"direction" "skill_direction",
	"user_answer" text DEFAULT '' NOT NULL,
	"expected_answer" text DEFAULT '' NOT NULL,
	"is_correct" boolean NOT NULL,
	"self_rating" integer,
	"response_time_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"grammar_topic_id" uuid,
	"vocabulary_id" uuid,
	"question_type" "practice_question_type" NOT NULL,
	"prompt" text NOT NULL,
	"prompt_vi" text DEFAULT '' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct_answer" text NOT NULL,
	"acceptable_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explanation_vi" text DEFAULT '' NOT NULL,
	"difficulty" "grammar_difficulty" DEFAULT 'intermediate' NOT NULL,
	"is_custom" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain" "practice_domain" NOT NULL,
	"mode" text NOT NULL,
	"title" text NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "practice_set_questions" (
	"set_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "practice_set_questions_set_id_question_id_pk" PRIMARY KEY("set_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "practice_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_type" "practice_set_source" DEFAULT 'custom' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_grammar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"session_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"added_via" "session_vocab_added_via" DEFAULT 'quick_add' NOT NULL,
	"session_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"daily_target_minutes" integer DEFAULT 15 NOT NULL,
	"daily_vocab_target" integer DEFAULT 20 NOT NULL,
	"daily_grammar_target" integer DEFAULT 2 NOT NULL,
	"ui_language" text DEFAULT 'vi' NOT NULL,
	"default_review_direction" "skill_direction" DEFAULT 'en_to_vi' NOT NULL,
	"keyboard_shortcuts_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word" text NOT NULL,
	"normalized_word" text NOT NULL,
	"ipa" text DEFAULT '' NOT NULL,
	"part_of_speech" text DEFAULT 'other' NOT NULL,
	"cefr_level" "cefr_level" DEFAULT 'unknown' NOT NULL,
	"english_definition" text DEFAULT '' NOT NULL,
	"vietnamese_meaning" text DEFAULT '' NOT NULL,
	"vietnamese_explanation" text DEFAULT '' NOT NULL,
	"english_explanation" text DEFAULT '' NOT NULL,
	"nuance" text DEFAULT '' NOT NULL,
	"register" "vocab_register" DEFAULT 'neutral' NOT NULL,
	"tone" "vocab_tone" DEFAULT 'neutral' NOT NULL,
	"usage_context" text DEFAULT '' NOT NULL,
	"when_to_use" text DEFAULT '' NOT NULL,
	"when_not_to_use" text DEFAULT '' NOT NULL,
	"vn_common_mistakes" text DEFAULT '' NOT NULL,
	"vn_wrong_combinations" text DEFAULT '' NOT NULL,
	"vn_confusing_words" text DEFAULT '' NOT NULL,
	"vn_translation_traps" text DEFAULT '' NOT NULL,
	"personal_notes" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"confidence_level" integer DEFAULT 2 NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"status" "vocab_status" DEFAULT 'new' NOT NULL,
	"is_incomplete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_collection_items" (
	"collection_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	CONSTRAINT "vocabulary_collection_items_collection_id_vocabulary_id_pk" PRIMARY KEY("collection_id","vocabulary_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"english_sentence" text NOT NULL,
	"vietnamese_translation" text DEFAULT '' NOT NULL,
	"highlight_text" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"related_vocabulary_id" uuid,
	"relation_type" "vocab_relation_type" NOT NULL,
	"text" text NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_review_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"skill_direction" "skill_direction" NOT NULL,
	"status" "review_status" DEFAULT 'new' NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_rating" integer,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_tag_items" (
	"tag_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	CONSTRAINT "vocabulary_tag_items_tag_id_vocabulary_id_pk" PRIMARY KEY("tag_id","vocabulary_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text DEFAULT '#0F766E' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_comparison_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary_vi" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_comparison_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"vocabulary_id" uuid,
	"label" text NOT NULL,
	"meaning_vi" text DEFAULT '' NOT NULL,
	"grammar_diff" text DEFAULT '' NOT NULL,
	"usage_context" text DEFAULT '' NOT NULL,
	"example_en" text DEFAULT '' NOT NULL,
	"example_vi" text DEFAULT '' NOT NULL,
	"common_mistake_vi" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collocations" ADD CONSTRAINT "collocations_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_learning_activity" ADD CONSTRAINT "daily_learning_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_categories" ADD CONSTRAINT "grammar_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_comparisons" ADD CONSTRAINT "grammar_comparisons_topic_id_grammar_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_comparisons" ADD CONSTRAINT "grammar_comparisons_compared_topic_id_grammar_topics_id_fk" FOREIGN KEY ("compared_topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_examples" ADD CONSTRAINT "grammar_examples_topic_id_grammar_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_review_states" ADD CONSTRAINT "grammar_review_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_review_states" ADD CONSTRAINT "grammar_review_states_grammar_topic_id_grammar_topics_id_fk" FOREIGN KEY ("grammar_topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_topics" ADD CONSTRAINT "grammar_topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_topics" ADD CONSTRAINT "grammar_topics_category_id_grammar_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."grammar_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_mistakes" ADD CONSTRAINT "learning_mistakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_mistakes" ADD CONSTRAINT "learning_mistakes_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_mistakes" ADD CONSTRAINT "learning_mistakes_grammar_topic_id_grammar_topics_id_fk" FOREIGN KEY ("grammar_topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_mistakes" ADD CONSTRAINT "learning_mistakes_practice_attempt_id_practice_attempts_id_fk" FOREIGN KEY ("practice_attempt_id") REFERENCES "public"."practice_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_practice_session_id_practice_sessions_id_fk" FOREIGN KEY ("practice_session_id") REFERENCES "public"."practice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_grammar_topic_id_grammar_topics_id_fk" FOREIGN KEY ("grammar_topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_question_id_practice_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."practice_questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_questions" ADD CONSTRAINT "practice_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_questions" ADD CONSTRAINT "practice_questions_grammar_topic_id_grammar_topics_id_fk" FOREIGN KEY ("grammar_topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_questions" ADD CONSTRAINT "practice_questions_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_questions" ADD CONSTRAINT "practice_set_questions_set_id_practice_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_questions" ADD CONSTRAINT "practice_set_questions_question_id_practice_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."practice_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sets" ADD CONSTRAINT "practice_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_grammar" ADD CONSTRAINT "session_grammar_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_grammar" ADD CONSTRAINT "session_grammar_topic_id_grammar_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."grammar_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_vocabulary" ADD CONSTRAINT "session_vocabulary_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_vocabulary" ADD CONSTRAINT "session_vocabulary_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_collection_items" ADD CONSTRAINT "vocabulary_collection_items_collection_id_vocabulary_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."vocabulary_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_collection_items" ADD CONSTRAINT "vocabulary_collection_items_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_collections" ADD CONSTRAINT "vocabulary_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_examples" ADD CONSTRAINT "vocabulary_examples_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_relations" ADD CONSTRAINT "vocabulary_relations_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_relations" ADD CONSTRAINT "vocabulary_relations_related_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("related_vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_review_states" ADD CONSTRAINT "vocabulary_review_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_review_states" ADD CONSTRAINT "vocabulary_review_states_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_tag_items" ADD CONSTRAINT "vocabulary_tag_items_tag_id_vocabulary_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."vocabulary_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_tag_items" ADD CONSTRAINT "vocabulary_tag_items_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_tags" ADD CONSTRAINT "vocabulary_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_comparison_groups" ADD CONSTRAINT "word_comparison_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_comparison_items" ADD CONSTRAINT "word_comparison_items_group_id_word_comparison_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."word_comparison_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_comparison_items" ADD CONSTRAINT "word_comparison_items_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_daily_activity_user_date" ON "daily_learning_activity" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grammar_categories_user_slug" ON "grammar_categories" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grammar_review_topic" ON "grammar_review_states" USING btree ("user_id","grammar_topic_id");--> statement-breakpoint
CREATE INDEX "idx_grammar_review_due" ON "grammar_review_states" USING btree ("user_id","next_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grammar_topics_user_slug" ON "grammar_topics" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "idx_grammar_topics_category" ON "grammar_topics" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_mistakes_user_status" ON "learning_mistakes" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_mistakes_user_category" ON "learning_mistakes" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "idx_learning_sessions_user_date" ON "learning_sessions" USING btree ("user_id","learning_date");--> statement-breakpoint
CREATE INDEX "idx_learning_sessions_status" ON "learning_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_practice_attempts_user_created" ON "practice_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_practice_attempts_vocab" ON "practice_attempts" USING btree ("vocabulary_id");--> statement-breakpoint
CREATE INDEX "idx_practice_attempts_grammar" ON "practice_attempts" USING btree ("grammar_topic_id");--> statement-breakpoint
CREATE INDEX "idx_practice_questions_topic" ON "practice_questions" USING btree ("user_id","grammar_topic_id");--> statement-breakpoint
CREATE INDEX "idx_practice_questions_type" ON "practice_questions" USING btree ("user_id","question_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_grammar" ON "session_grammar" USING btree ("session_id","topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_session_vocab" ON "session_vocabulary" USING btree ("session_id","vocabulary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vocabulary_user_normalized" ON "vocabulary" USING btree ("user_id","normalized_word");--> statement-breakpoint
CREATE INDEX "idx_vocabulary_status" ON "vocabulary" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_vocabulary_cefr" ON "vocabulary" USING btree ("user_id","cefr_level");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_collections_user_slug" ON "vocabulary_collections" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vocab_review_direction" ON "vocabulary_review_states" USING btree ("user_id","vocabulary_id","skill_direction");--> statement-breakpoint
CREATE INDEX "idx_vocab_review_due" ON "vocabulary_review_states" USING btree ("user_id","next_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tags_user_slug" ON "vocabulary_tags" USING btree ("user_id","slug");