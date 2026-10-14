CREATE TABLE "grammar_points" (
	"id" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"seed_hash" text,
	"reviewed_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grammar_points" ADD CONSTRAINT "grammar_points_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;