import { describe, expect, it } from "vitest";
import { AGENT_TOOL_NAMES } from "@techgens/core";
import {
  buildSystemPrompt,
  loadRolesFromDir,
  managementChain,
  parseRoleMarkdown,
  renderCustomAgentFile,
  validateOrgChart,
} from "../src/index";

const roles = loadRolesFromDir();

describe("built-in roles", () => {
  it("loads the v1 org chart", () => {
    expect(roles.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        "chief-of-staff",
        "cpo",
        "product-manager",
        "business-analyst",
        "ux-designer",
        "cto",
        "software-architect",
        "engineering-manager",
        "frontend-engineer",
        "backend-engineer",
        "qa-lead",
        "qa-engineer",
        "devops-engineer",
        "sre",
        "security-engineer",
        "technical-writer",
      ]),
    );
  });

  it("forms a valid reporting tree rooted at the Chief of Staff", () => {
    expect(validateOrgChart(roles)).toEqual([]);
    expect(roles.filter((r) => !r.reportsTo).map((r) => r.id)).toEqual(["chief-of-staff"]);
    expect(managementChain(roles, "backend-engineer")).toEqual(["engineering-manager", "cto", "chief-of-staff"]);
  });

  it("gives every local-session role complete_task and only known tools", () => {
    for (const r of roles) {
      for (const t of r.tools) expect(AGENT_TOOL_NAMES).toContain(t);
      expect(r.tools, r.id).toContain("complete_task");
    }
  });

  it("routes coding roles to the cloud agent", () => {
    const cloud = roles.filter((r) => r.executor === "cloud-agent").map((r) => r.id);
    expect(cloud.sort()).toEqual(["backend-engineer", "frontend-engineer", "qa-engineer"]);
  });
});

describe("role parsing", () => {
  it("rejects invalid frontmatter", () => {
    expect(() => parseRoleMarkdown("---\nid: Bad Id\n---\nhello")).toThrow(/invalid frontmatter/);
    expect(() => parseRoleMarkdown("no frontmatter")).toThrow(/missing YAML frontmatter/);
  });

  it("detects cycles and unknown managers", () => {
    const base = roles.find((r) => r.id === "cpo")!;
    const errors = validateOrgChart([
      { ...base, id: "a", reportsTo: "b" },
      { ...base, id: "b", reportsTo: "a" },
      { ...base, id: "c", reportsTo: "zzz" },
    ]);
    expect(errors.join("\n")).toMatch(/cycle/);
    expect(errors.join("\n")).toMatch(/unknown role zzz/);
  });
});

describe("prompts and agent files", () => {
  const cpo = roles.find((r) => r.id === "cpo")!;
  it("builds a system prompt with company context, team and operating rules", () => {
    const prompt = buildSystemPrompt({
      company: { name: "Acme", mission: "Delight freelancers", vision: "", values: ["Candour"], policies: "Use TypeScript." },
      role: cpo,
      agentName: "Priya",
      manager: { name: "Morgan", roleId: "chief-of-staff", title: "Chief of Staff", description: "Root" },
      reports: [{ name: "Leo", roleId: "product-manager", title: "Product Manager", description: "PRDs" }],
      colleagues: [],
      memories: ["CEO prefers weekly summaries"],
    });
    expect(prompt).toContain("You are Priya, the Chief Product Officer at Acme");
    expect(prompt).toContain("Use TypeScript.");
    expect(prompt).toContain("Leo — Product Manager");
    expect(prompt).toContain("complete_task");
    expect(prompt).toContain("CEO prefers weekly summaries");
  });

  it("renders a Copilot custom agent file", () => {
    const be = roles.find((r) => r.id === "backend-engineer")!;
    const file = renderCustomAgentFile(be, "Use TypeScript.");
    expect(file).toMatch(/^---\nname: "backend-engineer"\ndescription: ".+"\n---\n/);
    expect(file).toContain("Company engineering standards");
  });
});
