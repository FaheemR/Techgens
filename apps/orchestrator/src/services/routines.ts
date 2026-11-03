import { asc, eq } from "drizzle-orm";
import { DomainError, type RoutineDTO } from "@techgens/core";
import { schema, type Routine } from "@techgens/db";
import type { Techgens } from "../app";

export interface RoutineScheduler {
  schedule(key: string, cron: string, routineId: string): Promise<void>;
  unschedule(key: string): Promise<void>;
}

const DEFAULT_ROUTINES: Array<Pick<Routine, "key" | "title" | "cron" | "roleId" | "prompt" | "enabled">> = [
  {
    key: "daily-standup",
    title: "Daily standup digest",
    cron: "0 9 * * 1-5",
    roleId: "chief-of-staff",
    enabled: false,
    prompt: "Prepare today's standup digest for the CEO: for each active initiative summarise progress since yesterday, what's next, blockers and pending CEO approvals (use get_status and list_work_items). Write it as a 'report' document titled 'Daily standup {{date}}', then complete_task with a 3-bullet summary.",
  },
  {
    key: "weekly-exec-report",
    title: "Weekly executive report",
    cron: "0 16 * * 5",
    roleId: "chief-of-staff",
    enabled: true,
    prompt: "Write the weekly executive report: progress against company goals/OKRs and initiative milestones, shipped work, AI-credit spend vs budget, risks and decisions needed from the CEO with your recommendations. Save it as a 'report' document titled 'Weekly report {{date}}' and complete_task with the headline.",
  },
  {
    key: "sprint-review",
    title: "Sprint review",
    cron: "0 15 * * 5",
    roleId: "engineering-manager",
    enabled: false,
    prompt: "Run the sprint review: list work merged this week per initiative, pull requests stuck in review, failing CI, and next week's plan. Save a 'report' document titled 'Sprint review {{date}}' and complete_task.",
  },
  {
    key: "retrospective",
    title: "Retrospective",
    cron: "0 11 * * 1",
    roleId: "cto",
    enabled: false,
    prompt: "Run a blameless retrospective over the last week's work (decisions, failed or blocked assignments, CEO change requests). Identify up to three improvements to our policies or role instructions. Write a 'report' document titled 'Retrospective {{date}}'; if you propose policy changes, request_approval with kind 'decision' summarising the exact changes.",
  },
  {
    key: "roadmap-review",
    title: "Monthly roadmap review",
    cron: "0 10 1 * *",
    roleId: "cpo",
    enabled: false,
    prompt: "Review the product roadmap against company goals: what moved, what slipped, re-prioritisation proposals. Save a 'report' document titled 'Roadmap review {{date}}' and complete_task.",
  },
];

export const routineDTO = (r: Routine): RoutineDTO => ({ id: r.id, key: r.key, title: r.title, cron: r.cron, roleId: r.roleId, enabled: r.enabled, lastRunAt: r.lastRunAt?.toISOString() ?? null });

export class RoutineService {
  scheduler: RoutineScheduler | null = null;

  constructor(private readonly app: Techgens) {}

  async seed(): Promise<void> {
    for (const r of DEFAULT_ROUTINES) await this.app.db.insert(schema.routines).values(r).onConflictDoNothing();
  }

  async list(): Promise<Routine[]> {
    return this.app.db.select().from(schema.routines).orderBy(asc(schema.routines.key));
  }

  async get(id: string): Promise<Routine> {
    const [row] = await this.app.db.select().from(schema.routines).where(eq(schema.routines.id, id));
    if (!row) throw new DomainError("routine not found", "not_found");
    return row;
  }

  async update(id: string, patch: { enabled?: boolean; cron?: string }): Promise<Routine> {
    if (patch.cron !== undefined && patch.cron.trim().split(/\s+/).length !== 5) throw new DomainError("cron must have 5 fields (min hour day month weekday)");
    const [row] = await this.app.db.update(schema.routines).set(patch).where(eq(schema.routines.id, id)).returning();
    if (!row) throw new DomainError("routine not found", "not_found");
    await this.apply(row);
    return row;
  }

  async apply(r: Routine): Promise<void> {
    if (!this.scheduler) return;
    // pg-boss schedule keys allow only [A-Za-z0-9_./-].
    const key = `routine-${r.key}`;
    if (r.enabled) await this.scheduler.schedule(key, r.cron, r.id);
    else await this.scheduler.unschedule(key);
  }

  /** Startup sync; a bad schedule (e.g. invalid cron) must not prevent the orchestrator from starting. */
  async applyAll(): Promise<void> {
    for (const r of await this.list()) {
      await this.apply(r).catch((err) => this.app.log.error({ err: (err as Error).message, routine: r.key }, "routine schedule failed"));
    }
  }

  /** Runs a ceremony now: a tracked meeting work item + a job for the owning role. */
  async run(id: string): Promise<{ jobId: string }> {
    const r = await this.get(id);
    const agent = await this.app.org.agentForRole(r.roleId);
    if (!agent) throw new DomainError(`no active agent for ${r.roleId}`, "unavailable");
    const date = new Date().toISOString().slice(0, 10);
    const item = await this.app.work.create({ kind: "meeting", title: `${r.title} — ${date}`, description: r.prompt.replaceAll("{{date}}", date), assigneeAgentId: agent.id, status: "in_progress", priority: "p3" });
    const job = await this.app.engine.createJob({ agentId: agent.id, workItemId: item.id, kind: "routine", prompt: r.prompt.replaceAll("{{date}}", date) });
    await this.app.db.update(schema.routines).set({ lastRunAt: new Date() }).where(eq(schema.routines.id, id));
    return { jobId: job.id };
  }
}
