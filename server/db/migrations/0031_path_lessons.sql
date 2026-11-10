CREATE TABLE "path_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"phase" integer NOT NULL,
	"week" integer NOT NULL,
	"study_day" integer NOT NULL,
	"block" text NOT NULL,
	"kind" text NOT NULL,
	"ref" jsonb NOT NULL,
	"core" boolean DEFAULT true NOT NULL,
	"minutes" integer NOT NULL,
	"planned_day" date NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"done_at" timestamp with time zone,
	"result" jsonb
);
--> statement-breakpoint
ALTER TABLE "ielts_paths" ADD COLUMN "ahead_day" date;--> statement-breakpoint
ALTER TABLE "ielts_paths" ADD COLUMN "ahead_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "path_lessons" ADD CONSTRAINT "path_lessons_path_id_ielts_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."ielts_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "path_lessons" ADD CONSTRAINT "path_lessons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "path_lessons_path_seq_idx" ON "path_lessons" USING btree ("path_id","seq");--> statement-breakpoint
CREATE INDEX "path_lessons_user_status_idx" ON "path_lessons" USING btree ("user_id","status");