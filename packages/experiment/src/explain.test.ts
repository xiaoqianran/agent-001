import { describe, it, expect } from "vitest";
import type { DecisionTrace } from "@gss/contracts";
import { explain, type ExplainSnapshot, type ExplainQuery } from "./explain.js";

function makeTrace(
  partial: Partial<DecisionTrace> & { agentId: string; tick: number },
): DecisionTrace {
  return {
    agentId: partial.agentId,
    tick: partial.tick,
    attended: partial.attended ?? [{ kind: "need", salience: 1, ref: "hunger" }],
    retrievedMemoryIds: partial.retrievedMemoryIds ?? ["mem-1"],
    beliefsUsed: partial.beliefsUsed ?? [],
    personModelsUsed: partial.personModelsUsed ?? [],
    emotionSnapshot: partial.emotionSnapshot ?? {},
    physiologySnapshot: partial.physiologySnapshot ?? {},
    dominantNeeds: partial.dominantNeeds ?? ["hunger"],
    goalsConsidered: partial.goalsConsidered ?? [],
    options: partial.options ?? [
      {
        action: { verb: "take", mutexSlots: ["manual"] },
        score: 0.9,
      },
      {
        action: { verb: "work", mutexSlots: ["manual"] },
        score: 0.4,
      },
    ],
    chosen: partial.chosen ?? "act-1",
    reflectionInsightsUsed: partial.reflectionInsightsUsed ?? [],
    modelTier: partial.modelTier ?? "reactive",
  };
}

const fixture: ExplainSnapshot = {
  traces: [
    makeTrace({ agentId: "agent-bob", tick: 5, chosen: "take-1" }),
    makeTrace({
      agentId: "agent-alice",
      tick: 3,
      dominantNeeds: ["affiliation"],
      chosen: "propose-1",
    }),
  ],
  actionSequence: [
    "4:agent-alice:take:OK",
    "5:agent-bob:withdraw_public:REJECT:INSUFFICIENT_RESOURCE",
    "5:agent-alice:contribute:OK",
    "6:agent-bob:take:REJECT:INSUFFICIENT_RESOURCE",
  ],
  proposals: [
    {
      id: "prop-1",
      status: "passed",
      author: "agent-alice",
      createdTick: 3,
      resolvedTick: 7,
      patch: { enforcementStrength: 0.9 },
      votes: { "agent-alice": "yea", "agent-carol": "yea" },
    },
    {
      id: "prop-2",
      status: "open",
      author: "agent-bob",
      createdTick: 8,
      patch: { freeRidePenalty: 0 },
    },
  ],
  highlights: [
    {
      id: "hl-conflict-5-agent-bob-withdraw_public-INSUFFICIENT_RESOURCE",
      kind: "conflict",
      tick: 5,
      summary: "agent-bob conflict: withdraw_public rejected",
      agentIds: ["agent-bob"],
      refs: { eventType: "action.rejected", metricKey: "INSUFFICIENT_RESOURCE" },
    },
    {
      id: "hl-policy-prop-1",
      kind: "policy_passed",
      tick: 7,
      summary: "Policy prop-1 passed",
      agentIds: ["agent-alice"],
      refs: { proposalId: "prop-1", eventType: "policy.passed" },
    },
  ],
  institution: { enforcementStrength: 0.9, contributionReward: 0.5 },
  memories: [{ id: "mem-1", summary: "saw empty granary", agentId: "agent-bob" }],
  worldSummary: "granary=0",
};

describe("explain (pure)", () => {
  it("explains tick+agent with decision_trace and action_sequence links", () => {
    const chain = explain(
      { tick: 5, agentId: "agent-bob" },
      fixture,
    );
    expect(chain.found).toBe(true);
    expect(chain.query.key).toBe("tick:5+agent:agent-bob");
    expect(chain.links.some((l) => l.kind === "decision_trace")).toBe(true);
    expect(chain.links.some((l) => l.kind === "action_sequence")).toBe(true);
    expect(chain.links.some((l) => l.ref.includes("REJECT"))).toBe(true);
    expect(chain.trace?.agentId).toBe("agent-bob");
    expect(chain.summary.length).toBeGreaterThan(0);
  });

  it("explains actionLine with reject domain_event", () => {
    const chain = explain(
      {
        actionLine:
          "5:agent-bob:withdraw_public:REJECT:INSUFFICIENT_RESOURCE",
      },
      fixture,
    );
    expect(chain.found).toBe(true);
    expect(chain.links.some((l) => l.kind === "action_sequence")).toBe(true);
    expect(chain.links.some((l) => l.kind === "domain_event")).toBe(true);
    expect(chain.links.some((l) => l.kind === "decision_trace")).toBe(true);
    expect(chain.summary).toMatch(/rejected/i);
  });

  it("explains actionLine by substring match", () => {
    const chain = explain(
      { actionLine: "withdraw_public:REJECT:INSUFFICIENT_RESOURCE" },
      fixture,
    );
    expect(chain.found).toBe(true);
    expect(chain.links[0]!.kind).toBe("action_sequence");
  });

  it("explains proposalId with proposal + institution links", () => {
    const chain = explain({ proposalId: "prop-1" }, fixture);
    expect(chain.found).toBe(true);
    expect(chain.links.some((l) => l.kind === "proposal")).toBe(true);
    expect(chain.links.some((l) => l.kind === "institution")).toBe(true);
    expect(chain.summary).toMatch(/passed/i);
  });

  it("returns found:false without throwing for missing targets", () => {
    expect(explain({ proposalId: "prop-missing" }, fixture).found).toBe(false);
    expect(
      explain({ actionLine: "999:nobody:noop:OK" }, fixture).found,
    ).toBe(false);
    expect(
      explain({ tick: 99, agentId: "agent-ghost" }, fixture).found,
    ).toBe(false);
    expect(explain({} as ExplainQuery, fixture).found).toBe(false);
  });

  it("is deterministic for same input", () => {
    const q = { tick: 5, agentId: "agent-bob" };
    expect(explain(q, fixture)).toEqual(explain(q, fixture));
  });

  it("explains via highlightKind conflict", () => {
    const chain = explain({ highlightKind: "conflict" }, fixture);
    expect(chain.found).toBe(true);
    expect(chain.links.some((l) => l.kind === "highlight")).toBe(true);
    expect(
      chain.links.some(
        (l) => l.kind === "action_sequence" || l.kind === "decision_trace",
      ),
    ).toBe(true);
  });

  it("explains via highlightKind policy_passed → proposal", () => {
    const chain = explain({ highlightKind: "policy_passed" }, fixture);
    expect(chain.found).toBe(true);
    expect(chain.links.some((l) => l.kind === "proposal")).toBe(true);
  });
});
