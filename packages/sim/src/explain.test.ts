import { describe, it, expect } from "vitest";
import { explainFromOrch, detectHighlightsFromOrch } from "@gss/experiment";
import { createSimulation } from "./create.js";

describe("explainFromOrch (integration)", () => {
  it("explains real conflict action-line on commons-cabin", async () => {
    const orch = createSimulation({
      seed: "explain-conflict",
      scenario: "commons-cabin",
      freeRiderCount: 2,
    });
    await orch.runDays(2);
    const seq = orch.getActionSequence();
    const reject = seq.find((s) => s.includes("REJECT:INSUFFICIENT_RESOURCE"));
    expect(reject).toBeTruthy();

    const chain = explainFromOrch(orch, { actionLine: reject! });
    expect(chain.found).toBe(true);
    expect(chain.links.some((l) => l.kind === "action_sequence")).toBe(true);
    expect(chain.summary.length).toBeGreaterThan(0);
    // decision_trace may or may not align exact tick; domain_event for REJECT should exist
    expect(
      chain.links.some(
        (l) => l.kind === "domain_event" || l.kind === "decision_trace",
      ),
    ).toBe(true);

    // highlight bridge
    const hs = detectHighlightsFromOrch(orch);
    const conflict = hs.find((h) => h.kind === "conflict");
    if (conflict) {
      const viaHl = explainFromOrch(orch, { highlightKind: "conflict" });
      expect(viaHl.found).toBe(true);
      expect(viaHl.links.some((l) => l.kind === "highlight")).toBe(true);
    }

    // tick+agent from parsed line
    const parts = reject!.split(":");
    const tick = Number(parts[0]);
    const agentId = parts[1]!;
    const byTick = explainFromOrch(orch, { tick, agentId });
    expect(byTick.found).toBe(true);
  });

  it("explains real passed proposal on assembly-cabin", () => {
    const orch = createSimulation({
      seed: "explain-policy",
      scenario: "assembly-cabin",
      freeRiderCount: 1,
      enforcementStrength: 0,
    });
    const prop = orch.getSocial().policy.propose({
      author: "agent-alice",
      tick: 1,
      placeId: "cabin",
      patch: { enforcementStrength: 0.85 },
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

    const chain = explainFromOrch(orch, { proposalId: prop.id });
    expect(chain.found).toBe(true);
    expect(chain.links.some((l) => l.kind === "proposal")).toBe(true);
    expect(chain.links.some((l) => l.kind === "institution")).toBe(true);
    expect(chain.summary).toMatch(/passed/i);

    const miss = explainFromOrch(orch, { proposalId: "prop-does-not-exist" });
    expect(miss.found).toBe(false);
  });
});
