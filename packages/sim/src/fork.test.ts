import { describe, it, expect } from "vitest";
import { createSimulation } from "./create.js";
import { forkAndRun, forkCompare, warmupAndForkCompare } from "./fork.js";
import { buildCompareResult } from "@gss/experiment";
import { fingerprintEqual } from "@gss/runtime";

describe("GOAL-011 true checkpoint fork", () => {
  it("loads same parent twice with different enforcement; high reduces freeRideWithdrawals", async () => {
    const orch = createSimulation({
      seed: "fork-inst",
      scenario: "commons-cabin",
      freeRiderCount: 2,
      initialGranary: 8,
      enforcementStrength: 0,
    });
    // warmup 1 day then true fork from shared parent checkpoint
    await orch.runDays(1);
    const parent = orch.toCheckpoint("parent-fork");
    (parent as { experimentParams?: Record<string, unknown> }).experimentParams =
      {
        seed: "fork-inst",
        scenario: "commons-cabin",
        freeRiderCount: 2,
        initialGranary: 8,
      };

    const result = await forkCompare({
      parent,
      days: 4,
      a: {
        freeRiderCount: 2,
        enforcementStrength: 0,
        freeRidePenalty: 0,
        label: "low-enforcement",
      },
      b: {
        freeRiderCount: 2,
        enforcementStrength: 0.9,
        freeRidePenalty: 0.8,
        label: "high-enforcement",
      },
      title: "Fork enforcement",
    });

    expect(result.a.parentTick).toBe(result.b.parentTick);
    expect(result.a.parentTick).toBe(parent.clock.tick);
    expect(result.a.finalTick).toBeGreaterThan(result.a.parentTick);
    expect(result.b.finalTick).toBeGreaterThan(result.b.parentTick);

    // post-fork deltas: high enforcement → fewer free-ride withdrawals
    expect(result.b.metrics.publicGoods.freeRideWithdrawals).toBeLessThan(
      result.a.metrics.publicGoods.freeRideWithdrawals,
    );

    // report numbers match buildCompareResult path
    const cmp = buildCompareResult(result.a.metrics, result.b.metrics);
    expect(result.report.diff.freeRideWithdrawals).toBe(
      cmp.diff.freeRideWithdrawals,
    );
    expect(result.markdown).toContain("gss-report@1");
    expect(result.markdown).toContain("low-enforcement");
    expect(result.markdown).toContain("high-enforcement");
    expect(result.markdown).toContain("freeRideWithdrawals");
    expect(result.report.format).toBe("gss-report@1");
  });

  it("same parent + same patch is deterministic", async () => {
    const orch = createSimulation({
      seed: "det-fork",
      scenario: "commons-cabin",
      freeRiderCount: 2,
      initialGranary: 4,
    });
    await orch.runDays(1);
    const parent = orch.toCheckpoint("det-parent");
    (parent as { experimentParams?: Record<string, unknown> }).experimentParams =
      {
        seed: "det-fork",
        scenario: "commons-cabin",
        freeRiderCount: 2,
      };

    const patch = {
      enforcementStrength: 0.5,
      freeRidePenalty: 0.3,
      label: "mid",
    };
    const r1 = await forkAndRun({ parent, days: 2, paramPatch: patch, label: "mid" });
    const r2 = await forkAndRun({ parent, days: 2, paramPatch: patch, label: "mid" });
    expect(fingerprintEqual(r1.fingerprint, r2.fingerprint)).toBe(true);
    expect(r1.metrics.publicGoods.freeRideWithdrawals).toBe(
      r2.metrics.publicGoods.freeRideWithdrawals,
    );
    expect(r1.metrics.totals.totalFood).toBe(r2.metrics.totals.totalFood);
  });

  it("warmupAndForkCompare marks warmupDays on report", async () => {
    const r = await warmupAndForkCompare({
      scenario: "commons-cabin",
      seed: "warm",
      warmupDays: 1,
      days: 2,
      freeRiderCount: 2,
      initialGranary: 5,
      a: { enforcementStrength: 0, label: "A" },
      b: { enforcementStrength: 0.9, freeRidePenalty: 0.8, label: "B" },
    });
    expect(r.warmupDays).toBe(1);
    expect(r.report.meta.warmupDays).toBe(1);
    expect(r.markdown).toContain("warmupDays");
  });
});
