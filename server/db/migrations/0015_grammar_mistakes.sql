CREATE TABLE "grammar_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"point_id" text NOT NULL,
	"source" text NOT NULL,
	"wrong" text,
	"right" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grammar_mistakes" ADD CONSTRAINT "grammar_mistakes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grammar_mistakes_user_idx" ON "grammar_mistakes" USING btree ("user_id","created_at");