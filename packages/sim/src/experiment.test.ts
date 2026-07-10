import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createSimulation,
  runSimulation,
  runExperiment,
  compareExperimentParams,
} from "./index.js";
import { getPoolFood } from "@gss/world";

describe("GOAL-004 experiment params + metrics", () => {
  it("storehouseFood param changes initial pool", () => {
    const scarce = createSimulation({
      seed: "p",
      scenario: "trio-cabin",
      storehouseFood: 3,
      woodsFood: 1,
    });
    const abundant = createSimulation({
      seed: "p",
      scenario: "trio-cabin",
      storehouseFood: 20,
      woodsFood: 10,
    });
    const sSnap = scarce.world.snapshot();
    const aSnap = abundant.world.snapshot();
    expect(getPoolFood(sSnap, "storehouse")).toBe(3);
    expect(getPoolFood(sSnap, "woods")).toBe(1);
    expect(getPoolFood(aSnap, "storehouse")).toBe(20);
    expect(getPoolFood(aSnap, "woods")).toBe(10);
  });

  it("runSimulation metrics include totalFood and write metrics-out", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-met-"));
    const out = path.join(dir, "m.json");
    const summary = await runSimulation({
      scenario: "trio-cabin",
      days: 2,
      seed: "42",
      storehouseFood: 3,
      woodsFood: 1,
      label: "scarce",
      metricsOut: out,
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.metrics).toBeTruthy();
    expect(summary.metrics!.totals.totalFood).toBeGreaterThan(0);
    expect(summary.metrics!.meta.params.storehouseFood).toBe(3);
    expect(fs.existsSync(out)).toBe(true);
    const file = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(file.totals.totalFood).toBe(summary.metrics!.totals.totalFood);
  });

  it("abundant totalFood > scarce totalFood (eval #5 mini)", async () => {
    const cmp = await compareExperimentParams({
      seed: "42",
      scenario: "trio-cabin",
      days: 5,
      a: { storehouseFood: 3, woodsFood: 1, label: "scarce" },
      b: { storehouseFood: 20, woodsFood: 10, label: "abundant" },
    });
    expect(cmp.b.totals.totalFood).toBeGreaterThan(cmp.a.totals.totalFood);
    expect(cmp.bHasMoreFood).toBe(true);
    expect(cmp.diff.totalFood).toBeGreaterThan(0);
  });

  it("same seed+params yields same metrics totalFood", async () => {
    const p = {
      seed: "77",
      scenario: "trio-cabin" as const,
      days: 3,
      storehouseFood: 5,
      woodsFood: 2,
    };
    const m1 = await runExperiment(p);
    const m2 = await runExperiment(p);
    expect(m1.totals.totalFood).toBe(m2.totals.totalFood);
    expect(m1.actions.takeOk).toBe(m2.actions.takeOk);
    expect(m1.social.emergentNormCount).toBe(m2.social.emergentNormCount);
  });
});
