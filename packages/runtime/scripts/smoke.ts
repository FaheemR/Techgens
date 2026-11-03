/** Live smoke test: auth status + model catalogue (sends no prompts, consumes no credits). */
import { CopilotAgentRuntime } from "../src/index";

const token = process.env.COPILOT_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const rt = new CopilotAgentRuntime({
  token,
  baseDirectory: "/tmp/techgens-smoke/state",
  workingDirectory: "/tmp/techgens-smoke/work",
});
const status = await rt.status();
console.log("status:", JSON.stringify(status));
if (status.ready) {
  const models = await rt.listModels();
  console.log(`models (${models.length}):`, models.map((m) => `${m.id}${m.multiplier !== undefined ? `x${m.multiplier}` : ""}${m.enabled ? "" : "(disabled)"}`).join(", "));
}
await rt.stop();
