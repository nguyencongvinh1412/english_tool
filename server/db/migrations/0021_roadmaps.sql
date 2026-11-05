CREATE TABLE "roadmaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language" "study_language" NOT NULL,
	"goal_type" text NOT NULL,
	"target_score" real,
	"target_level" text NOT NULL,
	"min_skill_levels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deadline" date,
	"hours_per_week" real NOT NULL,
	"rest_days" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"start_date" date NOT NULL,
	"from_level" text NOT NULL,
	"level_source" text DEFAULT 'self' NOT NULL,
	"stages" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roadmaps_one_active" ON "roadmaps" USING btree ("user_id","language") WHERE "roadmaps"."status" = 'active';--> statement-breakpoint
CREATE INDEX "roadmaps_user_idx" ON "roadmaps" USING btree ("user_id");