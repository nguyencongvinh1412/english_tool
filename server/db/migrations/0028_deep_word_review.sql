ALTER TABLE "deep_word_content" ADD COLUMN "fixes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deep_word_progress" ADD COLUMN "last_good" boolean;--> statement-breakpoint
ALTER TABLE "deep_word_progress" ADD COLUMN "last_reviewed_at" timestamp with time zone;