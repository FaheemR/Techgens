import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../src/testing";
import { schema, type DbHandle } from "../src/index";

let h: DbHandle;
beforeAll(async () => {
  h = await createTestDb();
});
afterAll(async () => {
  await h.close();
});

describe("database", () => {
  it("applies migrations and supports full-text search on documents", async () => {
    const [doc] = await h.db
      .insert(schema.documents)
      .values({ kind: "prd", title: "InvoiceLite PRD", content: "Freelancers send recurring invoices with Stripe payments." })
      .returning();
    expect(doc?.currentVersion).toBe(1);
    const rows = await h.db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(sql`${schema.documents.search} @@ plainto_tsquery('english', ${"recurring invoice"})`);
    expect(rows.map((r) => r.id)).toEqual([doc!.id]);
  });

  it("orders events by sequence", async () => {
    await h.db.insert(schema.events).values([
      { type: "system.paused", actorType: "ceo", summary: "a" },
      { type: "system.resumed", actorType: "ceo", summary: "b" },
    ]);
    const rows = await h.db.select().from(schema.events).orderBy(schema.events.seq);
    expect(rows.map((r) => r.summary)).toEqual(["a", "b"]);
    expect(rows[1]!.seq).toBeGreaterThan(rows[0]!.seq);
  });
});
