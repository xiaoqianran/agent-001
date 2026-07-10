import { describe, it, expect } from "vitest";
import {
  detectHighlights,
  countHighlightsByKind,
  type HighlightInput,
} from "./highlights.js";

describe("detectHighlights", () => {
  it("emits policy_passed for passed proposals", () => {
    const input: HighlightInput = {
      proposals: [
        {
          id: "prop-1",
          status: "passed",
          author: "agent-alice",
          createdTick: 2,
          resolvedTick: 5,
          patch: { enforcementStrength: 0.9 },
        },
        { id: "prop-2", status: "open", author: "agent-bob", createdTick: 3 },
        { id: "prop-3", status: "rejected", author: "agent-carol", createdTick: 4 },
      ],
      ticksPerDay: 4,
    };
    const hs = detectHighlights(input);
    const passed = hs.filter((h) => h.kind === "policy_passed");
    expect(passed).toHaveLength(1);
    expect(passed[0]!.refs?.proposalId).toBe("prop-1");
    expect(passed[0]!.tick).toBe(5);
    expect(passed[0]!.summary).toMatch(/prop-1/);
    expect(passed[0]!.agentIds).toContain("agent-alice");
  });

  it("emits conflict for REJECT INSUFFICIENT_RESOURCE in action sequence", () => {
    const input: HighlightInput = {
      actionSequence: [
        "1:agent-alice:take:OK",
        "2:agent-bob:take:REJECT:INSUFFICIENT_RESOURCE",
        "3:agent-carol:give:REJECT:INSUFFICIENT_RESOURCE",
      ],
      ticksPerDay: 4,
    };
    const hs = detectHighlights(input);
    const conflicts = hs.filter((h) => h.kind === "conflict");
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
    expect(conflicts.some((c) => c.summary.includes("INSUFFICIENT_RESOURCE"))).toBe(
      true,
    );
    expect(conflicts[0]!.kind).toBe("conflict");
  });

  it("emits conflict from timeline action.rejected", () => {
    const hs = detectHighlights({
      timeline: [
        {
          tick: 7,
          type: "action.rejected",
          actor: "agent-bob",
          summary: "agent-bob rejected INSUFFICIENT_RESOURCE",
        },
      ],
    });
    expect(hs.some((h) => h.kind === "conflict")).toBe(true);
  });

  it("is deterministic for same input", () => {
    const input: HighlightInput = {
      proposals: [
        {
          id: "prop-9",
          status: "passed",
          resolvedTick: 10,
          patch: { freeRidePenalty: 1 },
        },
      ],
      actionSequence: ["4:agent-x:withdraw_public:REJECT:NOT_ALLOWED"],
    };
    const a = detectHighlights(input);
    const b = detectHighlights(input);
    expect(a).toEqual(b);
  });

  it("emits injection and norm_emerged when present", () => {
    const hs = detectHighlights({
      timeline: [
        {
          tick: 1,
          type: "inject.resource",
          summary: "ok granary+2",
        },
      ],
      metrics: {
        social: { emergentNormCount: 2, promiseBroken: 1 },
      },
    });
    const kinds = countHighlightsByKind(hs);
    expect(kinds.injection).toBe(1);
    expect(kinds.norm_emerged).toBe(1);
    expect(kinds.promise_broken).toBe(1);
  });

  it("returns empty array for empty input", () => {
    expect(detectHighlights({})).toEqual([]);
  });
});

