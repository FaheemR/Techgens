import type { RoleDefinition } from "@techgens/core";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Renders a Copilot custom agent file (`.github/agents/<id>.agent.md`) for roles executed by Copilot cloud agent,
 * so cloud-agent engineers share the company persona and standards.
 */
export function renderCustomAgentFile(role: RoleDefinition, companyPolicies = ""): string {
  const lines = [
    "---",
    `name: ${yamlString(role.id)}`,
    `description: ${yamlString(role.description)}`,
    "---",
    "",
    `# ${role.title}`,
    "",
    role.prompt.trim(),
  ];
  if (companyPolicies.trim()) {
    lines.push("", "## Company engineering standards", "", companyPolicies.trim());
  }
  if (role.source) lines.push("", `<!-- ${role.source} -->`);
  return `${lines.join("\n")}\n`;
}

/** Path of the custom agent file for a role inside a product repository. */
export function customAgentPath(roleId: string): string {
  return `.github/agents/${roleId}.agent.md`;
}
