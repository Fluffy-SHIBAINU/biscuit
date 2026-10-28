ALTER TABLE "biscuit_letter" ADD COLUMN "read_by" text;--> statement-breakpoint
ALTER TABLE "biscuit_letter" ADD COLUMN "checks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "biscuit_letter" ADD COLUMN "look_requested_at" timestamp with time zone;