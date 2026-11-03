import { eq } from "drizzle-orm";
import { DEFAULT_GATE_POLICY, type GatePolicy } from "@techgens/core";
import { schema, type Db } from "@techgens/db";
import type { SecretBox } from "./crypto";

export interface GitHubConnectionMeta {
  mode: "pat" | "app" | "demo" | null;
  login: string | null;
  userId: number | null;
  owner: string | null;
  appSlug: string | null;
  appId: number | null;
}

export interface SettingsShape {
  gatePolicy: Required<GatePolicy>;
  roleModels: Record<string, string>;
  maxDelegationDepth: number;
  maxFanOut: number;
  maxConcurrentJobs: number;
  autoMergeToIntegration: boolean;
  systemPaused: boolean;
  github: GitHubConnectionMeta;
}

export const DEFAULT_SETTINGS: SettingsShape = {
  gatePolicy: { ...DEFAULT_GATE_POLICY },
  roleModels: {},
  maxDelegationDepth: 4,
  maxFanOut: 8,
  maxConcurrentJobs: 3,
  autoMergeToIntegration: true,
  systemPaused: false,
  github: { mode: null, login: null, userId: null, owner: null, appSlug: null, appId: null },
};

/** Typed key/value settings plus encrypted secrets. */
export class SettingsStore {
  private cache = new Map<string, unknown>();

  constructor(
    private readonly db: Db,
    private readonly box: SecretBox,
  ) {}

  async get<K extends keyof SettingsShape>(key: K): Promise<SettingsShape[K]> {
    if (this.cache.has(key)) return this.cache.get(key) as SettingsShape[K];
    const [row] = await this.db.select().from(schema.settings).where(eq(schema.settings.key, key));
    const fallback = DEFAULT_SETTINGS[key];
    const value =
      row === undefined
        ? fallback
        : typeof fallback === "object" && fallback !== null && !Array.isArray(fallback)
          ? { ...(fallback as object), ...(row.value as object) }
          : row.value;
    this.cache.set(key, value);
    return value as SettingsShape[K];
  }

  async set<K extends keyof SettingsShape>(key: K, value: SettingsShape[K]): Promise<void> {
    await this.db
      .insert(schema.settings)
      .values({ key, value: value as unknown })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as unknown, updatedAt: new Date() } });
    this.cache.set(key, value);
  }

  async all(): Promise<SettingsShape> {
    const out = {} as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SettingsShape)[]) out[key] = await this.get(key);
    return out as unknown as SettingsShape;
  }

  async getSecret(key: string): Promise<string | null> {
    const [row] = await this.db.select().from(schema.secrets).where(eq(schema.secrets.key, key));
    return row ? this.box.decrypt(row.ciphertext) : null;
  }

  async setSecret(key: string, value: string): Promise<void> {
    const ciphertext = this.box.encrypt(value);
    await this.db
      .insert(schema.secrets)
      .values({ key, ciphertext })
      .onConflictDoUpdate({ target: schema.secrets.key, set: { ciphertext, updatedAt: new Date() } });
  }

  async deleteSecret(key: string): Promise<void> {
    await this.db.delete(schema.secrets).where(eq(schema.secrets.key, key));
  }
}
