CREATE TYPE "public"."study_language" AS ENUM('en', 'ja');--> statement-breakpoint
ALTER TYPE "public"."exam_type" ADD VALUE 'jlpt';--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "language" "study_language" DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "language" "study_language" DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "study_language" "study_language" DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ja_target_level" text;