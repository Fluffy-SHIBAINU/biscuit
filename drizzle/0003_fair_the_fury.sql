CREATE TABLE "biscuit_cam_sample" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"device_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"test" boolean DEFAULT false NOT NULL,
	"level" real,
	"seen" text,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"frames" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"label" text
);
--> statement-breakpoint
ALTER TABLE "biscuit_cam_sample" ADD CONSTRAINT "biscuit_cam_sample_household_id_biscuit_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."biscuit_household"("id") ON DELETE cascade ON UPDATE no action;