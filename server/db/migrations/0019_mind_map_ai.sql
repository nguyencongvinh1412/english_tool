CREATE TABLE "mind_map_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"map_id" uuid,
	"base_version" integer,
	"language" "study_language" DEFAULT 'en' NOT NULL,
	"title" text NOT NULL,
	"doc" jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"instruction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mind_map_versions" (
	"map_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mind_map_versions_map_id_version_pk" PRIMARY KEY("map_id","version")
);
--> statement-breakpoint
ALTER TABLE "mind_map_drafts" ADD CONSTRAINT "mind_map_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_map_drafts" ADD CONSTRAINT "mind_map_drafts_map_id_mind_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."mind_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_map_versions" ADD CONSTRAINT "mind_map_versions_map_id_mind_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."mind_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mind_map_drafts_user_idx" ON "mind_map_drafts" USING btree ("user_id","created_at");