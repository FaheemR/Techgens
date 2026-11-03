# Getting started

Techgens runs as three containers (Postgres, the orchestrator, the web app). Start it in **demo mode** first: the
agents follow scripts and GitHub is simulated, so you can explore the whole lifecycle in a few minutes without spending
Copilot credits or touching real repositories.

## 1. Launch — pick one

### A. On your computer (Docker Desktop)

Requirements: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with Compose v2),
Git, about 4 GB of free disk and 4 GB of RAM for Docker.

```sh
git clone https://github.com/FaheemR/techgens.git
cd techgens
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
```

Open `.env` in an editor and set `AGENT_RUNTIME=fake`, then:

```sh
docker compose up -d --build    # first build takes about 3–6 minutes
```

Open **http://localhost:3000**.

### B. In the browser with GitHub Codespaces (nothing to install)

1. On the repository page choose **Code → Codespaces → Create codespace on main**.
2. When the terminal is ready, run:
   ```sh
   AGENT_RUNTIME=fake docker compose up -d --build
   ```
3. Open the **Ports** tab and open port **3000** in the browser (the port stays private to you).

### Is it running?

```sh
docker compose ps                         # postgres and orchestrator "healthy", web "running"
curl -s http://localhost:3000/api/system  # {"version":"0.1.0","paused":false,"demoMode":true,…}
```

## 2. Take the tour (demo mode, about 10 minutes)

| Step | Where | What to check |
|---|---|---|
| 1 | **Dashboard** | The top bar shows **Demo mode**, the **Live** indicator and **Pause all agents**. |
| 2 | **Directives** | Click the suggested *“Build InvoiceLite…”* prompt or write your own (*“Build Pawfect: a pet-sitting marketplace. MVP in 8 weeks, budget 300 credits.”*). Morgan, the Chief of Staff, replies and opens an initiative. |
| 3 | **Approvals** | The badge shows 1. Read the charter and roadmap, then **Approve**. Try **Request changes** with a comment once: Morgan revises and resubmits it as round 2. |
| 4 | **Activity** · **Org chart** | Watch agents call tools live. In the org chart, click an agent to see its prompt, tools, model, budget and recent jobs. |
| 5 | **Approvals** | Approve the **PRD** (product spec), then the **architecture** (it includes a threat model from the security engineer). |
| 6 | **Work board** | An epic and three tasks appear, are assigned to the Copilot coding agent, get pull requests, are reviewed by the engineering manager and merged (simulated GitHub). |
| 7 | **Approvals** | Approve **Merge to main**, then **Production deploy**. |
| 8 | **Initiatives** · **Documents** · **Budget** · **Operations** | All 11 stages are done; 12 documents (charter, research, PRD, UX spec, architecture, ADR, threat model, plan, test plan, release notes, runbook…); credits spent per agent and department; staging and production deployments. |

Also try: **Pause all agents** in the top bar; **Settings → Gate policy** (turn a gate off and it is auto-approved);
**Budget** (set a tiny daily budget and watch work pause behind a *budget overrun* approval).

## 3. Switch to real Copilot agents

> Real mode spends Copilot AI credits, creates **private repositories** in your GitHub account or organisation, assigns
> issues to Copilot cloud agent and opens real pull requests. Set a Copilot spending limit in your GitHub billing
> settings first.

1. Start fresh and switch modes:
   ```sh
   docker compose down -v           # removes the demo data
   ```
   In `.env` set `AGENT_RUNTIME=copilot`, then `docker compose up -d`.
2. Create a GitHub fine-grained personal access token **owned by your user** with the account permission **Copilot
   Requests**, plus read/write repository permissions for Administration, Contents, Issues, Pull requests, Actions,
   Environments, Variables and Workflows on the owner that will hold product repositories
   ([details](setup.md#2-connect-techgens)).
3. **Settings → GitHub**: paste the token. The top bar then shows the Copilot connection instead of *Demo mode*.
4. **Strategy**: set the company mission, values and policies, and the GitHub owner (user or organisation) for product
   repositories. **Budget**: set limits. **Settings → Models**: choose cheaper models for routine roles.
5. **Directives**: start with something small, for example a research question, before a full product build.

Azure deployment of the products your agents build is optional and configured per product
(**Strategy → Products → Azure setup**; see [setup.md](setup.md#3-azure-per-product)).

## 4. Stop, restart, reset

```sh
docker compose stop                 # stop (data kept)
docker compose start                # start again
docker compose logs -f orchestrator # follow the orchestrator logs
docker compose down -v              # remove containers and ALL data
git pull && docker compose up -d --build   # update to the latest version
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| “Orchestrator unreachable” banner | `docker compose ps` and `docker compose logs orchestrator`; the orchestrator waits for Postgres to be healthy. |
| Port 3000 is already in use | In `docker-compose.yml` change `127.0.0.1:3000:3000` to e.g. `127.0.0.1:3001:3000`, and set `TECHGENS_PUBLIC_URL` / `TECHGENS_WEB_URL` in `.env` to `http://localhost:3001`. |
| Build fails or is killed | Give Docker at least 4 GB of memory (Docker Desktop → Settings → Resources). |
| Real mode: agents stay idle | Check the notification “Agents are waiting for GitHub”: connect a token in **Settings**, and make sure your Copilot plan and organisation policies allow Copilot CLI/SDK use. |
