CREATE TABLE "grammar_progress" (
	"user_id" uuid NOT NULL,
	"point_id" text NOT NULL,
	"state" text DEFAULT 'learning' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"seen_sets" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_score" real,
	"practiced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_progress_user_id_point_id_pk" PRIMARY KEY("user_id","point_id")
);
--> statement-breakpoint
ALTER TABLE "grammar_progress" ADD CONSTRAINT "grammar_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grammar_progress_user_due_idx" ON "grammar_progress" USING btree ("user_id","due_at");