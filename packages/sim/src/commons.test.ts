import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runSimulation,
  compareExperimentParams,
  exportBundle,
  validateBundle,
  createSimulation,
} from "./index.js";

describe("GOAL-005 commons-cabin + bundle", () => {
  it("runs 5 days with 3 agents and public goods metrics", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-com-"));
    const metricsOut = path.join(dir, "m.json");
    const summary = await runSimulation({
      scenario: "commons-cabin",
      days: 5,
      seed: "42",
      freeRiderCount: 1,
      metricsOut,
      sampleDaily: true,
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.agentIds).toHaveLength(3);
    expect(summary.metrics!.publicGoods).toBeDefined();
    expect(
      summary.metrics!.actions.contributeOk +
        summary.metrics!.publicGoods.totalContributed +
        summary.metrics!.actions.withdrawPublicOk +
        summary.metrics!.publicGoods.freeRideWithdrawals,
    ).toBeGreaterThan(0);
    // at least some public interaction or stock changed from pure idle
    const g = summary.metrics!.publicGoods;
    expect(
      g.totalContributed > 0 ||
        g.freeRideWithdrawals > 0 ||
        g.publicStock !== 2,
    ).toBe(true);
  });

  it("free-rider condition withdraws more than cooperative (main metric)", async () => {
    const cmp = await compareExperimentParams({
      seed: "42",
      scenario: "commons-cabin",
      days: 5,
      a: { freeRiderCount: 0, label: "cooperative", initialGranary: 3 },
      b: { freeRiderCount: 2, label: "free-ride", initialGranary: 3 },
    });
    // Main metric: free-ride run withdraws strictly more from public stock
    expect(cmp.b.publicGoods.freeRideWithdrawals).toBeGreaterThan(
      cmp.a.publicGoods.freeRideWithdrawals,
    );
    expect(cmp.bWithdrewMore).toBe(true);
  });

  it("exports gss-bundle@1 with required fields", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-bun-"));
    const out = path.join(dir, "run.bundle.json");
    const bundle = await exportBundle({
      scenario: "commons-cabin",
      days: 3,
      seed: "7",
      out,
      freeRiderCount: 1,
      label: "test",
    });
    expect(bundle.format).toBe("gss-bundle@1");
    expect(bundle.seed.value).toBe("7");
    expect(bundle.metrics.publicGoods).toBeDefined();
    expect(bundle.experimentParams.scenario).toBe("commons-cabin");
    expect(fs.existsSync(out)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(out, "utf8"));
    const v = validateBundle(raw);
    expect(v.ok).toBe(true);
  });

  it("checkpoint world snapshot includes publicGoods", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-ck-"));
    const ckpt = path.join(dir, "c.json");
    await runSimulation({
      scenario: "commons-cabin",
      days: 2,
      seed: "9",
      checkpointPath: ckpt,
      freeRiderCount: 1,
    });
    const raw = JSON.parse(fs.readFileSync(ckpt, "utf8"));
    expect(raw.world.publicGoods?.granary).toBeTruthy();
    expect(typeof raw.world.publicGoods.granary.stock).toBe("number");
  });

  it("same seed+params reproducible publicStock", async () => {
    const p = {
      scenario: "commons-cabin" as const,
      days: 3,
      seed: "11",
      freeRiderCount: 1,
      initialGranary: 2,
    };
    const a = await runSimulation(p);
    const b = await runSimulation(p);
    expect(a.metrics!.publicGoods.publicStock).toBe(
      b.metrics!.publicGoods.publicStock,
    );
    expect(a.metrics!.publicGoods.freeRideWithdrawals).toBe(
      b.metrics!.publicGoods.freeRideWithdrawals,
    );
  });
});
