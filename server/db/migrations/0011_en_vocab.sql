ALTER TABLE "vocab_items" ADD COLUMN "language" "study_language" DEFAULT 'ja' NOT NULL;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "deck" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "pos" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "ipa" text;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD COLUMN "collocations" text[];--> statement-breakpoint
CREATE INDEX "vocab_items_en_deck_idx" ON "vocab_items" USING btree ("deck","position");