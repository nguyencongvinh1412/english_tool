ALTER TABLE "users" ALTER COLUMN "target_score" SET DATA TYPE real;--> statement-breakpoint
-- IF NOT EXISTS: an earlier draft of this migration (adding only onboarded_at) was applied to a local DB
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp with time zone;
