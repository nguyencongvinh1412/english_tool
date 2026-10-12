CREATE TABLE "srs_cards" (
	"user_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"state" text DEFAULT 'learning' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"introduced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	CONSTRAINT "srs_cards_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "vocab_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"level" text NOT NULL,
	"position" integer NOT NULL,
	"term" text NOT NULL,
	"reading" text,
	"readings_on" text[],
	"readings_kun" text[],
	"meanings_en" text[] NOT NULL,
	"strokes" integer,
	"han_viet_options" text[],
	"han_viet" text,
	"meaning_vi" text,
	"example" text,
	"example_vi" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_item_id_vocab_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "srs_cards_user_due_idx" ON "srs_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "vocab_items_deck_idx" ON "vocab_items" USING btree ("kind","level","position");