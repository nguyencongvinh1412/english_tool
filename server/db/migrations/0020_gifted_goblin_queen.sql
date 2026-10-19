CREATE TABLE "content_hidden" (
	"user_id" uuid NOT NULL,
	"content_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_hidden_user_id_content_id_pk" PRIMARY KEY("user_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "content_hidden" ADD CONSTRAINT "content_hidden_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_hidden" ADD CONSTRAINT "content_hidden_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;