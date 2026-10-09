CREATE TYPE "public"."content_source" AS ENUM('builtin', 'ai', 'imported');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"kind" text NOT NULL,
	"skill" "skill" NOT NULL,
	"exam" "exam_type" DEFAULT 'none' NOT NULL,
	"part" text,
	"level" text,
	"title" text NOT NULL,
	"topic" text,
	"payload" jsonb NOT NULL,
	"source" "content_source" NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_kind_level_idx" ON "content_items" USING btree ("kind","status","level");