import { isOneOf, type ApprovalKind, type DocumentKind } from "./domain";

/** Stage-gate product lifecycle. Each stage produces deliverables; gated stages need CEO approval before advancing. */
export const LIFECYCLE_STAGES = [
  "intake",
  "discovery",
  "definition",
  "design",
  "architecture",
  "planning",
  "build",
  "verification",
  "release",
  "deployment",
  "operate",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export interface StageDefinition {
  stage: LifecycleStage;
  title: string;
  /** Role id (see @techgens/agents) that owns the stage work item. */
  ownerRole: string;
  /** Gate that must be approved before leaving the stage. */
  gate?: ApprovalKind;
  /** Document kinds the owner is expected to produce (and submit for the gate, if any). */
  deliverables: DocumentKind[];
  /** Stage requires a product repository (software delivery stages). */
  requiresRepo: boolean;
  /** Instructions given to the stage owner. `{{...}}` placeholders are filled by the engine. */
  instructions: string;
}

export const STAGES: Record<LifecycleStage, StageDefinition> = {
  intake: {
    stage: "intake",
    title: "Intake: charter & roadmap",
    ownerRole: "chief-of-staff",
    gate: "vision_roadmap",
    deliverables: ["charter", "roadmap"],
    requiresRepo: false,
    instructions:
      "Turn the CEO directive into an initiative charter (problem, target users, goals/OKRs, scope, non-goals, success metrics, risks, budget, timeline) and a milestone roadmap. Write both documents with write_document (kinds 'charter' and 'roadmap'), propose milestones with propose_roadmap, then call request_approval with kind 'vision_roadmap'.",
  },
  discovery: {
    stage: "discovery",
    title: "Discovery: market & user research",
    ownerRole: "business-analyst",
    deliverables: ["research"],
    requiresRepo: false,
    instructions:
      "Research the problem space: target users and jobs-to-be-done, competitors and alternatives, differentiation, pricing signals, risks and open questions. Write a 'research' document. Clearly label assumptions vs. evidence.",
  },
  definition: {
    stage: "definition",
    title: "Definition: product requirements (PRD)",
    ownerRole: "product-manager",
    gate: "spec",
    deliverables: ["prd"],
    requiresRepo: false,
    instructions:
      "Write the PRD (kind 'prd'): overview, goals & non-goals, personas, user stories with acceptance criteria (Given/When/Then), functional & non-functional requirements, MVP scope vs later, analytics, release criteria, open questions. Resolve open questions with ask_agent where possible. Then call request_approval with kind 'spec'.",
  },
  design: {
    stage: "design",
    title: "Design: UX flows & specification",
    ownerRole: "ux-designer",
    deliverables: ["ux_spec"],
    requiresRepo: false,
    instructions:
      "Produce a UX specification (kind 'ux_spec'): information architecture, key user flows, screen-by-screen wireframe descriptions (or simple HTML/ASCII wireframes), states (empty/loading/error), accessibility (WCAG 2.2 AA) and design-system tokens.",
  },
  architecture: {
    stage: "architecture",
    title: "Architecture: system design, ADRs & threat model",
    ownerRole: "software-architect",
    gate: "architecture",
    deliverables: ["architecture", "adr", "threat_model"],
    requiresRepo: false,
    instructions:
      "Design the system (kind 'architecture'): context, components, data model, APIs, technology choices aligned with company engineering standards, Azure deployment topology (Container Apps), NFRs (performance, security, reliability, cost), observability. Record key decisions as ADRs (kind 'adr'). Delegate a threat model (kind 'threat_model') to the security engineer. Then call request_approval with kind 'architecture'.",
  },
  planning: {
    stage: "planning",
    title: "Planning: backlog, iterations & repository bootstrap",
    ownerRole: "engineering-manager",
    deliverables: ["plan"],
    requiresRepo: true,
    instructions:
      "Break the approved PRD and architecture into epics, stories and tasks with create_work_item (each task small enough for one pull request, with acceptance criteria and test expectations; mark tasks that should be implemented by the coding agent). Order them by dependency, write a delivery plan (kind 'plan'), and ensure the repository is bootstrapped (CI, environments) by delegating to the devops engineer if needed.",
  },
  build: {
    stage: "build",
    title: "Build: implementation via coding agents",
    ownerRole: "engineering-manager",
    deliverables: [],
    requiresRepo: true,
    instructions:
      "Drive implementation: assign ready tasks to the coding agent (assign_to_coding_agent), track pull requests (get_pr_status), have the tech lead and security engineer review them (review_pull_request), and merge approved pull requests into the integration branch when CI passes (merge_pull_request). Complete the stage when all build tasks are done.",
  },
  verification: {
    stage: "verification",
    title: "Verification: staging, QA & release notes",
    ownerRole: "qa-lead",
    deliverables: ["test_plan", "release_notes"],
    requiresRepo: true,
    instructions:
      "Verify the integration branch on staging: check CI and staging deployment status (get_ci_status, get_deployments), write the test plan/report (kind 'test_plan'), file bugs for defects (create_work_item kind 'bug'), and delegate release notes (kind 'release_notes') to the technical writer.",
  },
  release: {
    stage: "release",
    title: "Release: merge to main",
    ownerRole: "engineering-manager",
    gate: "merge_to_main",
    deliverables: [],
    requiresRepo: true,
    instructions:
      "Open the release pull request from the integration branch into the default branch (create_release_pr) with a summary of changes, test results and release notes, then call request_approval with kind 'merge_to_main'.",
  },
  deployment: {
    stage: "deployment",
    title: "Deployment: production",
    ownerRole: "devops-engineer",
    gate: "prod_deploy",
    deliverables: [],
    requiresRepo: true,
    instructions:
      "Prepare the production deployment: confirm the release is merged and the production deployment workflow is waiting for approval (get_deployments). Summarize the change set, rollout and rollback plan, then call request_approval with kind 'prod_deploy'.",
  },
  operate: {
    stage: "operate",
    title: "Operate: monitoring & runbooks",
    ownerRole: "sre",
    deliverables: ["runbook"],
    requiresRepo: true,
    instructions:
      "Confirm production health after the deployment, write or update the runbook (kind 'runbook') with alerts, dashboards, rollback steps (shift traffic to the previous Container Apps revision) and on-call procedures, and report the launch outcome.",
  },
};

export function stageIndex(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

/**
 * Next stage after `stage`, skipping stages listed in `skip` and stages that require a repo when the
 * initiative has none. Returns null when the lifecycle is finished.
 */
export function nextStage(
  stage: LifecycleStage,
  options: { skip?: readonly LifecycleStage[]; hasRepo?: boolean } = {},
): LifecycleStage | null {
  const skip = new Set(options.skip ?? []);
  for (let i = stageIndex(stage) + 1; i < LIFECYCLE_STAGES.length; i++) {
    const candidate = LIFECYCLE_STAGES[i]!;
    if (skip.has(candidate)) continue;
    if (STAGES[candidate].requiresRepo && options.hasRepo === false) continue;
    return candidate;
  }
  return null;
}

/** The lifecycle stage an approval gates (from its `payload.stage`), or null when it is not a stage gate. */
export function gatedStage(kind: ApprovalKind, payload: Record<string, unknown>): LifecycleStage | null {
  const stage = payload.stage;
  return isOneOf(LIFECYCLE_STAGES, stage) && STAGES[stage].gate === kind ? stage : null;
}

export const GATE_LABELS: Record<ApprovalKind, string> = {
  vision_roadmap: "Vision & roadmap",
  spec: "Product spec (PRD)",
  architecture: "Architecture",
  merge_to_main: "Merge to main",
  prod_deploy: "Production deploy",
  budget_overrun: "Budget overrun",
  hire: "Hire agent",
  decision: "Decision",
};

/** Gate policy: which gate kinds require the CEO. Disabled gates are auto-approved and logged. */
export type GatePolicy = Partial<Record<ApprovalKind, boolean>>;
export const DEFAULT_GATE_POLICY: Required<GatePolicy> = {
  vision_roadmap: true,
  spec: true,
  architecture: true,
  merge_to_main: true,
  prod_deploy: true,
  budget_overrun: true,
  hire: true,
  decision: true,
};

export function isGateEnabled(policy: GatePolicy | undefined, kind: ApprovalKind): boolean {
  return (policy ?? {})[kind] ?? DEFAULT_GATE_POLICY[kind];
}
