ALTER TABLE "biscuit_cam" ADD COLUMN "floor" double precision;--> statement-breakpoint
ALTER TABLE "biscuit_cam" ADD COLUMN "gate" double precision;--> statement-breakpoint
ALTER TABLE "biscuit_cam" ADD COLUMN "tuning" jsonb;--> statement-breakpoint
ALTER TABLE "biscuit_cam_sample" ADD COLUMN "clip" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "biscuit_cam_sample" ADD COLUMN "labelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "biscuit_household" ADD COLUMN "keep_clips" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "biscuit_household" ADD COLUMN "keep_clips_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "biscuit_household" ADD COLUMN "share_clips" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "biscuit_household" ADD COLUMN "share_clips_at" timestamp with time zone;