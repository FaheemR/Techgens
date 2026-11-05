ALTER TABLE "goals" ADD COLUMN "start_value" double precision;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;