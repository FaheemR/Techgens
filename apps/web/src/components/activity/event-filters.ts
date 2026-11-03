import { EVENT_TYPES } from "@techgens/core";

export interface EventCategory {
  id: string;
  label: string;
  match: (type: string) => boolean;
}

export const EVENT_CATEGORIES: EventCategory[] = [
  {
    id: "initiatives",
    label: "Initiatives & directives",
    match: (t) => t.startsWith("initiative.") || t === "directive.received",
  },
  { id: "work", label: "Work items", match: (t) => t.startsWith("work_item.") },
  { id: "jobs", label: "Jobs", match: (t) => t.startsWith("job.") },
  { id: "agents", label: "Agent messages & tools", match: (t) => t.startsWith("agent.") },
  {
    id: "approvals",
    label: "Approvals & decisions",
    match: (t) => t.startsWith("approval.") || t === "decision.recorded",
  },
  { id: "documents", label: "Documents", match: (t) => t === "document.written" },
  { id: "budget", label: "Budget & usage", match: (t) => t.startsWith("budget.") || t === "usage.recorded" },
  {
    id: "delivery",
    label: "GitHub, deployments & incidents",
    match: (t) => t.startsWith("github.") || t === "deployment.updated" || t === "incident.opened",
  },
  {
    id: "system",
    label: "System, chat & notifications",
    match: (t) =>
      t.startsWith("system.") ||
      t === "chat.message" ||
      t === "notification.created" ||
      t === "company.updated",
  },
];

export function typesInCategory(category: EventCategory): string[] {
  return EVENT_TYPES.filter((t) => t !== "agent.message_delta" && category.match(t));
}

/** Filter value: "" (all), "cat:<id>" or "type:<event type>". */
export function matchesTypeFilter(type: string, filter: string): boolean {
  if (!filter) return true;
  if (filter.startsWith("cat:")) {
    const category = EVENT_CATEGORIES.find((c) => c.id === filter.slice(4));
    return category ? category.match(type) : true;
  }
  if (filter.startsWith("type:")) return type === filter.slice(5);
  return true;
}
