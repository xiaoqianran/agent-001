import { describe, it, expect } from "vitest";
import {
  buildCompareReport,
  renderReportMarkdown,
  type ExperimentReport,
} from "./report.js";
import type { RunMetrics } from "./metrics.js";

function metrics(partial: {
  totalFood: number;
  freeRideWithdrawals: number;
  publicStock?: number;
  totalContributed?: number;
  meanHunger?: number;
  label?: string;
}): RunMetrics {
  return {
    meta: {
      seed: "42",
      scenario: "commons-cabin",
      days: 3,
      label: partial.label,
      params: {},
      finalTick: 12,
      finalDay: 3,
    },
    totals: {
      totalFood: partial.totalFood,
      agentCount: 3,
      poolFood: partial.totalFood,
      invFood: 0,
    },
    inequality: { foodGini: 0.1 },
    wellbeing: {
      meanHunger: partial.meanHunger ?? 0.5,
      maxHunger: 1,
    },
    actions: {
      giveOk: 0,
      takeOk: 1,
      workOk: 0,
      contributeOk: 1,
      withdrawPublicOk: partial.freeRideWithdrawals,
    },
    social: {
      emergentNormCount: 0,
      promiseKept: 0,
      promiseBroken: 0,
      promisePending: 0,
    },
    publicGoods: {
      publicStock: partial.publicStock ?? 2,
      totalContributed: partial.totalContributed ?? 1,
      freeRideWithdrawals: partial.freeRideWithdrawals,
      granaryLevel: 1,
    },
    runtime: { skippedCognitiveTicks: 0 },
    policy: {
      proposalsOpen: 0,
      proposalsPassed: 0,
      proposalsRejected: 0,
      institution: {},
    },
  };
}

describe("buildCompareReport + renderReportMarkdown", () => {
  it("builds gss-report@1 with real diff from metrics", () => {
    const a = metrics({
      totalFood: 10,
      freeRideWithdrawals: 8,
      label: "low-enforcement",
    });
    const b = metrics({
      totalFood: 12,
      freeRideWithdrawals: 2,
      label: "high-enforcement",
    });
    const report = buildCompareReport({
      scenario: "commons-cabin",
      seed: "42",
      daysAfterFork: 3,
      parentTick: 8,
      mode: "fork",
      paramsA: { enforcementStrength: 0, label: "low-enforcement" },
      paramsB: { enforcementStrength: 0.9, label: "high-enforcement" },
      metricsA: a,
      metricsB: b,
    });
    expect(report.format).toBe("gss-report@1");
    expect(report.meta.labelA).toBe("low-enforcement");
    expect(report.meta.labelB).toBe("high-enforcement");
    expect(report.meta.parentTick).toBe(8);
    expect(report.diff.freeRideWithdrawals).toBe(2 - 8);
    expect(report.diff.totalFood).toBe(2);
    expect(report.flags?.bHasMoreFood).toBe(true);
    expect(report.notes?.some((n) => n.includes("freeRideWithdrawals"))).toBe(
      true,
    );
  });

  it("renders Markdown with title, labels, and diff numbers", () => {
    const report: ExperimentReport = buildCompareReport({
      title: "Fork enforcement report",
      scenario: "commons-cabin",
      seed: "42",
      daysAfterFork: 3,
      parentTick: 8,
      labelA: "A-low",
      labelB: "B-high",
      paramsA: { enforcementStrength: 0 },
      paramsB: { enforcementStrength: 0.9 },
      metricsA: metrics({ totalFood: 10, freeRideWithdrawals: 5 }),
      metricsB: metrics({ totalFood: 11, freeRideWithdrawals: 1 }),
    });
    const md = renderReportMarkdown(report);
    expect(md).toMatch(/^# Fork enforcement report/m);
    expect(md).toContain("gss-report@1");
    expect(md).toContain("A-low");
    expect(md).toContain("B-high");
    expect(md).toContain("parentTick");
    expect(md).toContain("freeRideWithdrawals");
    // diff freeRide = 1-5 = -4
    expect(md).toContain("-4");
    expect(md).toContain("## Conclusion");
  });

  it("is deterministic for same metrics/params", () => {
    const args = {
      scenario: "commons-cabin" as const,
      seed: "1",
      daysAfterFork: 2,
      paramsA: { x: 1 },
      paramsB: { x: 2 },
      metricsA: metrics({ totalFood: 1, freeRideWithdrawals: 0 }),
      metricsB: metrics({ totalFood: 2, freeRideWithdrawals: 0 }),
    };
    const r1 = buildCompareReport(args);
    const r2 = buildCompareReport(args);
    // createdAt may differ by ms — compare structure without timestamps
    const { createdAt: _c1, ...rest1 } = r1;
    const { createdAt: _c2, ...rest2 } = r2;
    expect(rest1).toEqual(rest2);
    expect(renderReportMarkdown({ ...r1, createdAt: "T" })).toEqual(
      renderReportMarkdown({ ...r2, createdAt: "T" }),
    );
  });
});
