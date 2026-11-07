CREATE TABLE "deep_word_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"kind" text NOT NULL,
	"aspect" text NOT NULL,
	"result" text NOT NULL,
	"assisted" boolean DEFAULT false NOT NULL,
	"user_text" text,
	"feedback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deep_word_content" (
	"item_id" text PRIMARY KEY NOT NULL,
	"simple_definition" text NOT NULL,
	"synonyms" text[] DEFAULT '{}'::text[] NOT NULL,
	"antonyms" text[] DEFAULT '{}'::text[] NOT NULL,
	"contrast" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_family" text[] DEFAULT '{}'::text[] NOT NULL,
	"collocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"register" text DEFAULT '' NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"core_use" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ai' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deep_word_links" (
	"user_id" uuid NOT NULL,
	"from_item" text NOT NULL,
	"to_item" text NOT NULL,
	"kind" text DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deep_word_links_user_id_from_item_to_item_pk" PRIMARY KEY("user_id","from_item","to_item")
);
--> statement-breakpoint
CREATE TABLE "deep_word_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"per_day" smallint DEFAULT 1 NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"profile_skipped" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deep_word_progress" (
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"form_r" smallint DEFAULT 0 NOT NULL,
	"form_p" smallint DEFAULT 0 NOT NULL,
	"meaning_r" smallint DEFAULT 0 NOT NULL,
	"meaning_p" smallint DEFAULT 0 NOT NULL,
	"use_r" smallint DEFAULT 0 NOT NULL,
	"use_p" smallint DEFAULT 0 NOT NULL,
	"stage" smallint DEFAULT 1 NOT NULL,
	"session_stage" smallint DEFAULT 1 NOT NULL,
	"session_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_day" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"deferred_count" integer DEFAULT 0 NOT NULL,
	"note" text,
	"next_review_at" timestamp with time zone,
	"review_step" smallint DEFAULT 0 NOT NULL,
	"last_kind" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deep_word_progress_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "deep_word_queue" (
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deep_word_queue_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "deep_word_attempts" ADD CONSTRAINT "deep_word_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_attempts" ADD CONSTRAINT "deep_word_attempts_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_content" ADD CONSTRAINT "deep_word_content_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_links" ADD CONSTRAINT "deep_word_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_links" ADD CONSTRAINT "deep_word_links_from_item_vocab_items_id_fk" FOREIGN KEY ("from_item") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_links" ADD CONSTRAINT "deep_word_links_to_item_vocab_items_id_fk" FOREIGN KEY ("to_item") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_prefs" ADD CONSTRAINT "deep_word_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_progress" ADD CONSTRAINT "deep_word_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_progress" ADD CONSTRAINT "deep_word_progress_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_queue" ADD CONSTRAINT "deep_word_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deep_word_queue" ADD CONSTRAINT "deep_word_queue_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deep_word_attempts_user_item_idx" ON "deep_word_attempts" USING btree ("user_id","item_id","created_at");--> statement-breakpoint
CREATE INDEX "deep_word_progress_user_day_idx" ON "deep_word_progress" USING btree ("user_id","started_day");--> statement-breakpoint
CREATE INDEX "deep_word_progress_user_review_idx" ON "deep_word_progress" USING btree ("user_id","next_review_at");--> statement-breakpoint
CREATE INDEX "deep_word_queue_user_added_idx" ON "deep_word_queue" USING btree ("user_id","added_at");