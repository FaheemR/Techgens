ALTER TABLE "initiatives" ADD COLUMN "status_reason" text;--> statement-breakpoint
-- Backfill: pause reasons used to live in metadata.pausedReason; cancellations were always made by the CEO.
UPDATE "initiatives" SET "status_reason" = "metadata"->>'pausedReason' WHERE "status" = 'paused' AND "metadata"->>'pausedReason' IS NOT NULL;--> statement-breakpoint
UPDATE "initiatives" SET "status_reason" = 'Cancelled by the CEO' WHERE "status" = 'cancelled';--> statement-breakpoint
-- Gates of cancelled initiatives are withdrawn, and "approval needed" notifications of decided approvals are read.
UPDATE "approvals" SET "status" = 'cancelled', "decision_comment" = 'Withdrawn — the initiative was cancelled.', "decided_at" = now(), "updated_at" = now() WHERE "status" IN ('pending', 'changes_requested') AND "kind" <> 'budget_overrun' AND "initiative_id" IN (SELECT "id" FROM "initiatives" WHERE "status" = 'cancelled');--> statement-breakpoint
UPDATE "notifications" SET "read_at" = now() WHERE "read_at" IS NULL AND "kind" = 'approval' AND "link" IN (SELECT '/approvals?id=' || "id" FROM "approvals" WHERE "status" <> 'pending');
--> statement-breakpoint
-- Unfinished work of cancelled initiatives is cancelled, and their notices (paused, blocked…) are no longer actionable.
UPDATE "work_items" SET "status" = 'cancelled', "completed_at" = now(), "updated_at" = now() WHERE "status" NOT IN ('done', 'cancelled') AND "initiative_id" IN (SELECT "id" FROM "initiatives" WHERE "status" = 'cancelled');--> statement-breakpoint
UPDATE "notifications" SET "read_at" = now() WHERE "read_at" IS NULL AND "link" IN (SELECT '/initiatives/' || "id" FROM "initiatives" WHERE "status" = 'cancelled' OR ("status" = 'completed' AND "notifications"."title" NOT LIKE '% completed'));--> statement-breakpoint
-- Completed initiatives delivered their milestones.
UPDATE "milestones" SET "status" = 'done' WHERE "status" <> 'done' AND "initiative_id" IN (SELECT "id" FROM "initiatives" WHERE "status" = 'completed');--> statement-breakpoint
-- One budget record per initiative: budget_credits mirrors the enforced limit of its total budget.
UPDATE "initiatives" SET "budget_credits" = "b"."limit_credits" FROM "budgets" "b" WHERE "b"."scope" = 'initiative' AND "b"."period" = 'total' AND "b"."enabled" AND "b"."scope_id" = "initiatives"."id"::text AND "initiatives"."budget_credits" IS DISTINCT FROM "b"."limit_credits";--> statement-breakpoint
UPDATE "initiatives" SET "budget_credits" = NULL WHERE "budget_credits" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "budgets" "b" WHERE "b"."scope" = 'initiative' AND "b"."period" = 'total' AND "b"."enabled" AND "b"."scope_id" = "initiatives"."id"::text);
