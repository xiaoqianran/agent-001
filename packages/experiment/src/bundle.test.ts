import { describe, it, expect } from "vitest";
import { createBundle, validateBundle, inspectBundleSummary } from "./bundle.js";
import type { RunMetrics } from "./metrics.js";

const sampleMetrics: RunMetrics = {
  meta: {
    seed: "1",
    scenario: "commons-cabin",
    days: 1,
    params: {},
    finalTick: 24,
    finalDay: 1,
  },
  totals: { totalFood: 10, agentCount: 3, poolFood: 5, invFood: 3 },
  inequality: { foodGini: 0.1 },
  wellbeing: { meanHunger: 0.2, maxHunger: 0.5 },
  actions: {
    giveOk: 0,
    takeOk: 1,
    workOk: 0,
    contributeOk: 1,
    withdrawPublicOk: 0,
  },
  social: {
    emergentNormCount: 0,
    promiseKept: 0,
    promiseBroken: 0,
    promisePending: 0,
  },
  publicGoods: {
    publicStock: 2,
    totalContributed: 1,
    freeRideWithdrawals: 0,
    granaryLevel: 0.2,
  },
};

describe("gss-bundle@1", () => {
  it("create + validate", () => {
    const b = createBundle({
      params: {
        seed: "1",
        scenario: "commons-cabin",
        days: 1,
      },
      metrics: sampleMetrics,
      dailyMetrics: [{ day: 0, totalFood: 10, meanHunger: 0.2, publicStock: 2 }],
    });
    expect(b.format).toBe("gss-bundle@1");
    const v = validateBundle(b);
    expect(v.ok).toBe(true);
    expect(inspectBundleSummary(b)).toContain("publicStock");
  });

  it("rejects missing publicGoods", () => {
    const bad = {
      format: "gss-bundle@1",
      experimentParams: { seed: "1", scenario: "x", days: 1 },
      seed: { value: "1" },
      metrics: { totals: {} },
    };
    const v = validateBundle(bad);
    expect(v.ok).toBe(false);
  });
});
