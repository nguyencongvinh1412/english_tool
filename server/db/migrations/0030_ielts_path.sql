CREATE TABLE "gate_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"gate" integer NOT NULL,
	"version" text DEFAULT 'A' NOT NULL,
	"sessions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bands" jsonb,
	"manual_bands" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" text,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ielts_paths" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"band_targets" jsonb NOT NULL,
	"exam_date" date,
	"daily_minutes" integer NOT NULL,
	"rest_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_phase" integer,
	"end_phase" integer NOT NULL,
	"start_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_levels" ADD COLUMN "band" real;--> statement-breakpoint
ALTER TABLE "gate_attempts" ADD CONSTRAINT "gate_attempts_path_id_ielts_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."ielts_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_attempts" ADD CONSTRAINT "gate_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ielts_paths" ADD CONSTRAINT "ielts_paths_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gate_attempts_path_idx" ON "gate_attempts" USING btree ("path_id","gate");--> statement-breakpoint
CREATE INDEX "ielts_paths_user_idx" ON "ielts_paths" USING btree ("user_id","status");