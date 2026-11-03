import pino, { type Logger } from "pino";
import type { Db } from "@techgens/db";
import type { AgentRuntime } from "@techgens/runtime";
import type { Config } from "./config";
import { SecretBox } from "./crypto";
import { EventBus } from "./events";
import { SettingsStore } from "./settings";
import { NotificationService } from "./services/notifications";
import { CompanyService } from "./services/company";
import { OrgService } from "./services/org";
import { DocumentService } from "./services/documents";
import { WorkService } from "./services/work";
import { BudgetService } from "./services/budget";
import { ApprovalService } from "./services/approvals";
import { LifecycleService } from "./services/lifecycle";
import { ChatService } from "./services/chat";
import { GitHubService } from "./services/github";
import { DeliveryService } from "./services/delivery";
import { RoutineService } from "./services/routines";
import { JobEngine, type JobDispatcher } from "./engine/jobs";

export interface AppDeps {
  config: Config;
  db: Db;
  runtime: AgentRuntime;
  dispatcher: JobDispatcher;
  logger?: Logger;
}

/** Composition root: every service receives the app and resolves collaborators lazily. */
export class Techgens {
  readonly config: Config;
  readonly db: Db;
  readonly runtime: AgentRuntime;
  readonly log: Logger;
  readonly bus: EventBus;
  readonly settings: SettingsStore;
  readonly notifications: NotificationService;
  readonly company: CompanyService;
  readonly org: OrgService;
  readonly docs: DocumentService;
  readonly work: WorkService;
  readonly budget: BudgetService;
  readonly approvals: ApprovalService;
  readonly lifecycle: LifecycleService;
  readonly chat: ChatService;
  readonly github: GitHubService;
  readonly delivery: DeliveryService;
  readonly routines: RoutineService;
  readonly engine: JobEngine;

  constructor(deps: AppDeps) {
    this.config = deps.config;
    this.db = deps.db;
    this.runtime = deps.runtime;
    this.log = deps.logger ?? pino({ level: deps.config.logLevel });
    this.bus = new EventBus(this.db);
    this.settings = new SettingsStore(this.db, new SecretBox(deps.config.secretKey));
    this.notifications = new NotificationService(this);
    this.company = new CompanyService(this);
    this.org = new OrgService(this);
    this.docs = new DocumentService(this);
    this.work = new WorkService(this);
    this.budget = new BudgetService(this);
    this.approvals = new ApprovalService(this);
    this.lifecycle = new LifecycleService(this);
    this.chat = new ChatService(this);
    this.github = new GitHubService(this);
    this.delivery = new DeliveryService(this);
    this.routines = new RoutineService(this);
    this.engine = new JobEngine(this, deps.dispatcher);
  }

  /** Seeds the company on first start and restores connections. */
  async init(): Promise<void> {
    await this.company.seed();
    await this.github.restore();
  }
}
