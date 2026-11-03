ALTER TABLE "initiatives" ADD COLUMN "status_reason" text;--> statement-breakpoint
-- Backfill: pause reasons used to live in metadata.pausedReason; cancellations were always made by the CEO.
UPDATE "initiatives" SET "status_reason" = "metadata"->>'pausedReason' WHERE "status" = 'paused' AND "metadata"->>'pausedReason' IS NOT NULL;--> statement-breakpoint
UPDATE "initiatives" SET "status_reason" = 'Cancelled by the CEO' WHERE "status" = 'cancelled';--> statement-breakpoint
-- Gates of cancelled initiatives are withdrawn, and "approval needed" notifications of decided approvals are read.
UPDATE "approvals" SET "status" = 'cancelled', "decision_comment" = 'Withdrawn — the initiative was cancelled.', "decided_at" = now(), "updated_at" = now() WHERE "status" IN ('pending', 'changes_requested') AND "kind" <> 'budget_overrun' AND "initiative_id" IN (SELECT "id" FROM "initiatives" WHERE "status" = 'cancelled');--> statement-breakpoint
UPDATE "notifications" SET "read_at" = now() WHERE "read_at" IS NULL AND "kind" = 'approval' AND "link" IN (SELECT '/approvals?id=' || "id" FROM "approvals" WHERE "status" <> 'pending');
