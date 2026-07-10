import { describe, it, expect } from "vitest";
import { detectHighlightsFromOrch } from "@gss/experiment";
import { createSimulation } from "./create.js";

describe("detectHighlightsFromOrch (integration)", () => {
  it("detects policy_passed after real board pass on assembly-cabin", () => {
    const orch = createSimulation({
      seed: "hl-leg",
      scenario: "assembly-cabin",
      freeRiderCount: 1,
      enforcementStrength: 0,
    });
    const prop = orch.getSocial().policy.propose({
      author: "agent-alice",
      tick: 1,
      placeId: "cabin",
      patch: { enforcementStrength: 0.8 },
    });
    orch.getSocial().policy.vote({
      proposalId: prop.id,
      voter: "agent-alice",
      vote: "yea",
      placeId: "cabin",
      tick: 2,
    });
    const passed = orch.getSocial().policy.vote({
      proposalId: prop.id,
      voter: "agent-carol",
      vote: "yea",
      placeId: "cabin",
      tick: 3,
    });
    expect(passed.justPassed).toBe(true);
    orch.applyInstitution(passed.proposal.patch);

    const hs = detectHighlightsFromOrch(orch, {
      seed: "hl-leg",
      scenario: "assembly-cabin",
      days: 1,
    });
    expect(hs.some((h) => h.kind === "policy_passed")).toBe(true);
    expect(hs.find((h) => h.kind === "policy_passed")!.refs?.proposalId).toBe(
      prop.id,
    );
  });

  it("detects conflict from real commons-cabin action sequence rejects", async () => {
    const orch = createSimulation({
      seed: "hl-conflict",
      scenario: "commons-cabin",
      freeRiderCount: 2,
    });
    await orch.runDays(2);
    const seq = orch.getActionSequence();
    expect(
      seq.some(
        (s) =>
          s.includes("REJECT:INSUFFICIENT_RESOURCE") ||
          s.includes("REJECT:OUT_OF_RANGE") ||
          s.includes("REJECT:NOT_ALLOWED") ||
          s.includes("REJECT:MUTEX"),
      ),
    ).toBe(true);

    const hs = detectHighlightsFromOrch(orch, {
      seed: "hl-conflict",
      scenario: "commons-cabin",
      days: 2,
      freeRiderCount: 2,
    });
    expect(hs.some((h) => h.kind === "conflict")).toBe(true);
    expect(
      hs.find((h) => h.kind === "conflict")!.summary.length,
    ).toBeGreaterThan(0);
  });
});
