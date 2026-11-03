/**
 * Default company constitution (cf. spec-kit's "constitution"): principles every agent follows. The CEO edits this in
 * Strategy; it is injected into every agent prompt and into product repos as `.github/copilot-instructions.md`.
 */
export const DEFAULT_POLICIES = `### Product principles
1. User value first: every feature traces to a user need and a measurable outcome.
2. Ship small: MVPs over big bangs; one pull request per task; trunk-based with a protected integration branch.
3. Evidence over opinion: label assumptions; validate with research, data or tests.

### Engineering standards
- Language & stack: TypeScript (strict) on Node.js LTS; React for web front ends; PostgreSQL for relational data.
- Quality: every change has automated tests (unit + integration; Playwright e2e for critical journeys); lint,
  typecheck and tests must pass in CI before merge.
- Security: OWASP Top 10 by default; validate all input; least privilege everywhere; secrets only in Key Vault or
  GitHub environment secrets (never in code); dependencies scanned (Dependabot, CodeQL).
- Accessibility: WCAG 2.2 AA for all user interfaces.
- Observability: structured logs (no PII), OpenTelemetry traces, health endpoints, Application Insights.
- Delivery: GitHub Actions CI/CD; Azure Container Apps via azd + Bicep (Azure Verified Modules); OIDC to Azure; staging
  deploys on merge to the integration branch; production deploys require CEO approval.
- Documentation: PRDs, ADRs, runbooks and release notes live in the repository \`docs/\` folder.

### Ways of working
- Decisions that change scope, budget, timeline or risk are recorded in the decision log.
- Escalate early with options and a recommendation; never hide bad news.
- Respect the AI-credit budget: be concise and avoid unnecessary model calls.`;

export const DEFAULT_VALUES = ["Customer obsession", "Ship small, learn fast", "Quality is everyone's job", "Radical candour"];
