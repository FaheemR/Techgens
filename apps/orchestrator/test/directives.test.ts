import { describe, expect, it } from "vitest";
import { deriveTitle, isQuestion, parseBudget, shortenTitle } from "../src/demo/directives";

describe("demo Chief of Staff: reading CEO messages", () => {
  it("treats questions and status requests as questions", () => {
    for (const q of [
      "What is our total spend so far?",
      "how are we doing",
      "Status",
      "Show me the budget",
      "List initiatives",
      "Can you summarise InvoiceLite",
      "Give me an update",
      "Is InvoiceLite on track",
    ]) {
      expect(isQuestion(q), q).toBe(true);
    }
    for (const d of [
      "Build InvoiceLite: invoicing for freelancers.",
      "Document the API for partners",
      "Cancel nothing, build a status page for InvoiceLite",
      "Isolate payments into a service",
      "Update the pricing page copy",
    ]) {
      expect(isQuestion(d), d).toBe(false);
    }
  });

  it("converts budget rates into a total cap and says how", () => {
    expect(parseBudget("Build InvoiceLite. MVP in 6 weeks with a budget of 400 credits.")).toEqual({
      credits: 400,
      explanation: "I set a total budget cap of 400 credits.",
    });
    const weekly = parseBudget(
      "Build a client portal for InvoiceLite. MVP in 6 weeks, budget 400 credits/week.",
    );
    expect(weekly.credits).toBe(2400);
    expect(weekly.explanation).toBe(
      "I set a total budget cap of 2,400 credits (400 credits per week × 6 weeks).",
    );
    expect(parseBudget("Launch SpendWise within two months, 300 credits per month").credits).toBe(600);
    expect(parseBudget("Weekly budget of 50 credits for a 4-week pilot").credits).toBe(200);
    const noTimeline = parseBudget("Build Pawfect, budget 400 credits per week");
    expect(noTimeline.credits).toBe(400);
    expect(noTimeline.explanation).toMatch(
      /^I set a total budget cap of 400 credits: you gave 400 credits per week but no timeline/,
    );
    const none = parseBudget("Build Pawfect: a pet-sitting marketplace.");
    expect(none).toMatchObject({ credits: 100 });
    expect(none.explanation).toMatch(/No budget was given, so I set a total budget cap of 100 credits/);
  });

  it("derives short titles from the first clause and products only when implied", () => {
    expect(deriveTitle("Build InvoiceLite: an invoicing SaaS for freelancers. MVP in 6 weeks.")).toEqual({
      title: "InvoiceLite MVP",
      product: "InvoiceLite",
      existingProduct: false,
    });
    expect(
      deriveTitle(
        "Build a client portal for InvoiceLite so freelancers' clients can view and pay invoices online",
        ["InvoiceLite"],
      ),
    ).toEqual({
      title: "Build a client portal for InvoiceLite",
      product: "InvoiceLite",
      existingProduct: true,
    });
    expect(
      deriveTitle("Build a pet-sitting marketplace MVP in 8 weeks with a budget of 50 credits per week."),
    ).toEqual({
      title: "Build a pet-sitting marketplace MVP",
      product: "Pet-sitting marketplace",
      existingProduct: false,
    });
    expect(deriveTitle("Build a pet-sitting marketplace MVP in 8 weeks.")).toEqual({
      title: "Build a pet-sitting marketplace MVP",
      product: "Pet-sitting marketplace",
      existingProduct: false,
    });
    expect(deriveTitle("Research the pet insurance market and recommend whether we should enter it")).toEqual(
      { title: "Research the pet insurance market", existingProduct: false },
    );
    expect(deriveTitle("Add a GitHub integration to SpendWise, then report back").product).toBe("SpendWise");
    expect(deriveTitle("Please build an integration to GitHub for the CEO dashboard")).toEqual({
      title: "Build an integration to GitHub for the CEO dashboard",
      product: "Integration to GitHub for the CEO dashboard",
      existingProduct: false,
    });
  });

  it("never cuts a title mid-word or on a preposition", () => {
    expect(
      shortenTitle(
        "Build a delightful onboarding experience for small accounting firms in the United Kingdom",
      ),
    ).toBe("Build a delightful onboarding experience");
    const long = shortenTitle(
      "Modernise legacy invoicing exports so accountants receive reconciled ledgers automatically every night",
    );
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).toBe("Modernise legacy invoicing exports so accountants receive");
    expect(shortenTitle("Create the roadmap for")).toBe("Create the roadmap");
  });
});
