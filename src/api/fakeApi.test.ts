import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAGES } from "../types";
import {
  defaultConfig,
  generateDeals,
  getApiConfig,
  nextStage,
  randomTeammateChangeFor,
  setApiConfig,
  updateDealRemote,
} from "./fakeApi";

describe("generateDeals", () => {
  it("generates exactly the requested count, with unique ids", () => {
    const deals = generateDeals(500);
    expect(deals).toHaveLength(500);
    expect(new Set(deals.map((d) => d.id)).size).toBe(500);
  });

  it("is deterministic — a fresh module always produces the same seeded dataset", async () => {
    // generateDeals draws from one continuing seeded stream (`rand`) that's
    // module-level state, not reset per call — exactly how the real app uses
    // it (one generateDeals(50_000) call per page load). So determinism has
    // to be checked across a fresh module instance, not two calls in a row
    // against the same instance (which would just continue the sequence).
    // Date.now() is frozen too, since the timestamp fields are otherwise
    // (correctly) relative to wall-clock time at generation.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    vi.resetModules();
    const fresh1 = await import("./fakeApi");
    const a = fresh1.generateDeals(200);

    vi.resetModules();
    const fresh2 = await import("./fakeApi");
    const b = fresh2.generateDeals(200);

    vi.useRealTimers();
    expect(a).toEqual(b);
  });

  it("only ever assigns a valid stage", () => {
    const deals = generateDeals(500);
    for (const d of deals) expect(STAGES).toContain(d.stage);
  });

  it("seeds some Won and Lost deals, not just the active stages", () => {
    // Regression test: generation used to slice STAGES to only the first 5
    // active stages, so every KPI/chip for Won/Lost silently showed 0.
    const deals = generateDeals(5000);
    expect(deals.some((d) => d.stage === "Won")).toBe(true);
    expect(deals.some((d) => d.stage === "Lost")).toBe(true);
  });

  it("keeps createdAt at or before stageChangedAt and updatedAt (a lead exists before it's touched)", () => {
    const deals = generateDeals(1000);
    for (const d of deals) {
      expect(d.createdAt).toBeLessThanOrEqual(d.stageChangedAt);
      expect(d.createdAt).toBeLessThanOrEqual(d.updatedAt);
      expect(d.stageChangedAt).toBeLessThanOrEqual(Date.now());
    }
  });

  it("starts every deal idle, with no retries and version 0", () => {
    const deals = generateDeals(100);
    for (const d of deals) {
      expect(d.syncStatus).toBe("idle");
      expect(d.retryCount).toBe(0);
      expect(d.version).toBe(0);
    }
  });
});

describe("nextStage", () => {
  it("walks the active pipeline forward", () => {
    expect(nextStage("New Lead")).toBe("Contacted");
    expect(nextStage("Contacted")).toBe("Demo Done");
    expect(nextStage("Demo Done")).toBe("Proposal Sent");
    expect(nextStage("Proposal Sent")).toBe("Negotiation");
    expect(nextStage("Negotiation")).toBe("Won");
  });

  it("treats Won and Lost as terminal", () => {
    expect(nextStage("Won")).toBeNull();
    expect(nextStage("Lost")).toBeNull();
  });
});

describe("getApiConfig / setApiConfig", () => {
  afterEach(() => {
    setApiConfig(defaultConfig);
  });

  it("starts at the documented defaults (0.3–1.5s latency, 1-in-10 failure)", () => {
    expect(getApiConfig()).toEqual(defaultConfig);
  });

  it("merges a partial patch instead of replacing the whole config", () => {
    setApiConfig({ failRate: 1 });
    const cfg = getApiConfig();
    expect(cfg.failRate).toBe(1);
    expect(cfg.minLatencyMs).toBe(defaultConfig.minLatencyMs);
    expect(cfg.maxLatencyMs).toBe(defaultConfig.maxLatencyMs);
  });
});

describe("updateDealRemote", () => {
  afterEach(() => {
    setApiConfig(defaultConfig);
  });

  it("resolves with the patch when the simulated failure rate is 0", async () => {
    setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 0 });
    await expect(updateDealRemote("deal-0", { stage: "Won" })).resolves.toEqual({ stage: "Won" });
  });

  it("always rejects when the simulated failure rate is 1", async () => {
    setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 1 });
    await expect(updateDealRemote("deal-0", { stage: "Won" })).rejects.toThrow();
  });

  it("waits at least minLatencyMs before settling", async () => {
    setApiConfig({ minLatencyMs: 50, maxLatencyMs: 50, failRate: 0 });
    const start = Date.now();
    await updateDealRemote("deal-0", { stage: "Won" });
    expect(Date.now() - start).toBeGreaterThanOrEqual(45); // small tolerance for timer jitter
  });
});

describe("randomTeammateChangeFor", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random");
  });

  it("changes the stage on a low roll", () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.1).mockReturnValue(0);
    const change = randomTeammateChangeFor("deal-5");
    expect(change.id).toBe("deal-5");
    expect(change.patch.stage).toBeDefined();
    expect(change.patch.owner).toBeUndefined();
    expect(change.patch.amount).toBeUndefined();
  });

  it("changes the owner on a mid roll", () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.7).mockReturnValue(0);
    const change = randomTeammateChangeFor("deal-5");
    expect(change.patch.owner).toBeDefined();
    expect(change.patch.stage).toBeUndefined();
    expect(change.patch.amount).toBeUndefined();
  });

  it("changes the amount on a high roll", () => {
    vi.mocked(Math.random).mockReturnValueOnce(0.95).mockReturnValue(0.5);
    const change = randomTeammateChangeFor("deal-5");
    expect(change.patch.amount).toBeDefined();
    expect(change.patch.stage).toBeUndefined();
    expect(change.patch.owner).toBeUndefined();
  });
});
