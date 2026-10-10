CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'parsing', 'review', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'audio', 'document');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by" uuid,
	"exam" "exam_type" NOT NULL,
	"title" text NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"document_asset_id" uuid,
	"ranges" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft" jsonb,
	"progress" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_name" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "import_order" integer;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_document_asset_id_media_assets_id_fk" FOREIGN KEY ("document_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_created_idx" ON "import_jobs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_import_id_import_jobs_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_import_idx" ON "content_items" USING btree ("import_id");