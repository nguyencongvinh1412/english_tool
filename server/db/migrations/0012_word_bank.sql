CREATE TABLE "word_bank" (
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"context" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "word_bank_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "word_bank" ADD CONSTRAINT "word_bank_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_bank" ADD CONSTRAINT "word_bank_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "word_bank_user_created_idx" ON "word_bank" USING btree ("user_id","created_at");