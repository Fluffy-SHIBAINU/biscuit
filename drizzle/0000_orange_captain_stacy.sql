CREATE TABLE "biscuit_cam" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"region" jsonb NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	"test_status" text DEFAULT 'pending' NOT NULL,
	"last_motion_at" timestamp with time zone,
	"sam_calls_today" integer DEFAULT 0 NOT NULL,
	"sam_day" date,
	"paused" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biscuit_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text,
	"label" text,
	"push_subscription" jsonb,
	"last_seen_at" timestamp with time zone,
	"battery" integer,
	"charging" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biscuit_device_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "biscuit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"device_id" uuid,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biscuit_household" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_email" text NOT NULL,
	"senior_name" text NOT NULL,
	"called" text NOT NULL,
	"relation" text,
	"living" text,
	"language" text DEFAULT 'en' NOT NULL,
	"share_letters" boolean DEFAULT true NOT NULL,
	"consented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biscuit_letter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"sender" text,
	"hospital_ccn" text,
	"amount_cents" integer,
	"statement_on" date,
	"due_on" date,
	"quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'read' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biscuit_link_code" (
	"code" text PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "biscuit_rate" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "biscuit_cam" ADD CONSTRAINT "biscuit_cam_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biscuit_device" ADD CONSTRAINT "biscuit_device_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biscuit_event" ADD CONSTRAINT "biscuit_event_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biscuit_letter" ADD CONSTRAINT "biscuit_letter_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biscuit_link_code" ADD CONSTRAINT "biscuit_link_code_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;