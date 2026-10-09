CREATE TYPE "public"."skill" AS ENUM('listening', 'reading', 'speaking', 'writing');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity" text NOT NULL,
	"skill" "skill" NOT NULL,
	"content_ref" text,
	"title" text,
	"score" real,
	"max_score" real,
	"duration_sec" integer,
	"xp" integer DEFAULT 0 NOT NULL,
	"day" date NOT NULL,
	"details" jsonb,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_user_completed_idx" ON "attempts" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "attempts_user_day_idx" ON "attempts" USING btree ("user_id","day");