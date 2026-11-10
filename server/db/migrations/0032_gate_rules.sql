ALTER TABLE "gate_attempts" ADD COLUMN "retest_skill" text;--> statement-breakpoint
ALTER TABLE "gate_attempts" ADD COLUMN "decision" jsonb;--> statement-breakpoint
ALTER TABLE "ielts_paths" ADD COLUMN "replanned_at" timestamp with time zone;