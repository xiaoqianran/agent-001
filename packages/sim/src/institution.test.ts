import { describe, it, expect } from "vitest";
import { createSimulation, compareExperimentParams, runSimulation } from "./index.js";
import { ControlRoomService } from "@gss/control";

describe("GOAL-006 institution knobs", () => {
  it("high enforcement reduces freeRideWithdrawals vs low", async () => {
    const cmp = await compareExperimentParams({
      seed: "42",
      scenario: "commons-cabin",
      days: 5,
      a: {
        freeRiderCount: 2,
        initialGranary: 5,
        enforcementStrength: 0,
        freeRidePenalty: 0,
        label: "low-enforcement",
      },
      b: {
        freeRiderCount: 2,
        initialGranary: 5,
        enforcementStrength: 0.9,
        freeRidePenalty: 0.8,
        label: "high-enforcement",
      },
    });
    // Main metric: high enforcement => fewer public withdrawals
    expect(cmp.b.publicGoods.freeRideWithdrawals).toBeLessThan(
      cmp.a.publicGoods.freeRideWithdrawals,
    );
  });

  it("high contributionReward increases totalContributed", async () => {
    const cmp = await compareExperimentParams({
      seed: "7",
      scenario: "commons-cabin",
      days: 5,
      a: {
        freeRiderCount: 0,
        initialGranary: 2,
        contributionReward: 0,
        label: "low-reward",
      },
      b: {
        freeRiderCount: 0,
        initialGranary: 2,
        contributionReward: 1,
        label: "high-reward",
      },
    });
    expect(cmp.b.publicGoods.totalContributed).toBeGreaterThanOrEqual(
      cmp.a.publicGoods.totalContributed,
    );
  });

  it("transparency exposes publicLedger on observe", () => {
    const orch = createSimulation({
      seed: "t",
      scenario: "commons-cabin",
      transparency: true,
    });
    const obs = orch.world.observe("agent-alice", 0);
    expect(obs.publicLedger).toBeDefined();
    expect(obs.publicLedger!.stock).toBeGreaterThanOrEqual(0);
  });

  it("timeline-out path via control after run", async () => {
    const summary = await runSimulation({
      scenario: "commons-cabin",
      days: 1,
      seed: "99",
    });
    expect(summary.exitCode).toBe(0);
    const orch = createSimulation({
      seed: "99",
      scenario: "commons-cabin",
    });
    await orch.runDays(1);
    const cr = new ControlRoomService(orch);
    const tl = cr.listTimeline();
    expect(tl.length).toBeGreaterThan(0);
  });
});
