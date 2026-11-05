CREATE TABLE "placement_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"language" "study_language" NOT NULL,
	"skill" text NOT NULL,
	"level" text NOT NULL,
	"prompt" text NOT NULL,
	"context" text,
	"options" jsonb NOT NULL,
	"answer_index" integer NOT NULL,
	"source" text NOT NULL,
	"ref" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placement_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language" "study_language" NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"state" jsonb NOT NULL,
	"result" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skill_levels" (
	"user_id" uuid NOT NULL,
	"language" "study_language" NOT NULL,
	"skill" text NOT NULL,
	"level" text NOT NULL,
	"confidence" text NOT NULL,
	"source" text NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_levels_user_id_language_skill_pk" PRIMARY KEY("user_id","language","skill")
);
--> statement-breakpoint
ALTER TABLE "placement_sessions" ADD CONSTRAINT "placement_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_levels" ADD CONSTRAINT "skill_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placement_questions_pick_idx" ON "placement_questions" USING btree ("language","skill","level","status");--> statement-breakpoint
CREATE INDEX "placement_sessions_user_idx" ON "placement_sessions" USING btree ("user_id","language");