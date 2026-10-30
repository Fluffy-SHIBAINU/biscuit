CREATE TABLE "biscuit_memory" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"fact" text NOT NULL,
	"source" text DEFAULT 'rosa' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biscuit_reminder" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"days" jsonb,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "biscuit_household" ADD COLUMN "place" text;--> statement-breakpoint
ALTER TABLE "biscuit_household" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "biscuit_household" ADD COLUMN "lon" double precision;--> statement-breakpoint
ALTER TABLE "biscuit_memory" ADD CONSTRAINT "biscuit_memory_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biscuit_reminder" ADD CONSTRAINT "biscuit_reminder_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;