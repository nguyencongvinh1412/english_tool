CREATE TABLE "progress_snapshots" (
	"user_id" uuid NOT NULL,
	"language" "study_language" NOT NULL,
	"day" date NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "progress_snapshots_user_id_language_day_pk" PRIMARY KEY("user_id","language","day")
);
--> statement-breakpoint
ALTER TABLE "progress_snapshots" ADD CONSTRAINT "progress_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;