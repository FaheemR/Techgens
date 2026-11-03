# Third-party notices

Techgens does not vendor third-party source code. The following projects informed prompts, templates or designs; where
text was adapted, the role file names the source in its `source:` frontmatter field.

| Project | Licence | Use in Techgens |
|---|---|---|
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | MIT | Persona structure and checklists adapted in `packages/agents/roles/*.md` (product manager, UX, architect, security, DevOps/Bicep, SRE, QA/Playwright, technical writer). |
| [github/spec-kit](https://github.com/github/spec-kit) | MIT | Stage artifact flow (constitution → specify → plan → tasks → implement) mapped onto the lifecycle; "constitution" concept for company policies. |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | MIT (BMad™ is a trademark) | PRD/architecture structure and the append-only decision-log idea. The BMad name is not used. |
| [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | MIT | Governance patterns: review/approval stages with a decisions audit trail, budget warn/stop thresholds, wake-up/resume semantics, goal context in prompts. |
| [bradygaster/squad](https://github.com/bradygaster/squad) | MIT | Charter/routing ideas for Copilot-based teams. |
| [automazeio/ccpm](https://github.com/automazeio/ccpm) | MIT | PRD → epic → GitHub issues workflow. |
| [github/copilot-sdk](https://github.com/github/copilot-sdk) | MIT | Runtime dependency (`@github/copilot-sdk`). The bundled Copilot CLI is subject to the GitHub Copilot CLI licence. |

Runtime dependencies are listed in each `package.json`; all are permissively licensed (MIT/Apache-2.0/ISC/BSD).
