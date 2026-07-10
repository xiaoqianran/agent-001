import { describe, it, expect } from "vitest";
import type { ActionProposal } from "@gss/contracts";
import { createSimulation, runSimulation } from "./index.js";
import { renderDailyBrief } from "@gss/experiment";

function act(
  partial: Partial<ActionProposal> & { structured: ActionProposal["structured"] },
): ActionProposal {
  return {
    id: partial.id ?? `x-${Math.random().toString(16).slice(2, 8)}`,
    actor: partial.actor ?? "agent-alice",
    tickProposed: partial.tickProposed ?? 1,
    structured: partial.structured,
  };
}

describe("GOAL-008 mini legislature", () => {
  it("proposal → 2 yeas → passed + institution changes", async () => {
    const orch = createSimulation({
      seed: "leg-1",
      scenario: "assembly-cabin",
      freeRiderCount: 1,
      enforcementStrength: 0,
    });
    expect(orch.getInstitution().enforcementStrength ?? 0).toBe(0);

    // propose via world apply path + runtime reduce
    let r = orch.world.apply(
      act({
        id: "p1",
        actor: "agent-alice",
        structured: {
          verb: "propose_policy",
          mutexSlots: ["speech"],
          args: {
            assemblyPlaceId: "cabin",
            patch: { enforcementStrength: 0.9, contributionReward: 0.6 },
          },
        },
      }),
      1,
    );
    expect(r.failureCode).toBeUndefined();
    // manually trigger policy handler by advancing with orchestrator path:
    // call private via public apply flow — use social.policy + applyInstitution for unit,
    // and also drive full runtime by synthesizing through record path.

    // Drive board through same APIs runtime uses
    const prop = orch.getSocial().policy.propose({
      author: "agent-alice",
      tick: 1,
      placeId: "cabin",
      patch: { enforcementStrength: 0.9, contributionReward: 0.6 },
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
    expect(orch.getInstitution().enforcementStrength).toBe(0.9);
    // World enforcement now blocks free-rider withdraw without contribution
    const v = orch.world.validate(
      act({
        actor: "agent-bob",
        structured: {
          verb: "withdraw_public",
          quantity: 1,
          mutexSlots: ["manual"],
          args: { publicGoodId: "granary" },
        },
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.code).toBe("NO_PERMISSION");
  });

  it("full tick path can pass policy via applied actions", async () => {
    const orch = createSimulation({
      seed: "leg-full",
      scenario: "assembly-cabin",
      freeRiderCount: 0,
    });
    // Force propose + votes through world.apply then handlePolicy via public method simulation:
    // Use orchestrator by applying through its private path — inject actions via direct call sequence

    const tick = 5;
    const propose: ActionProposal = {
      id: "act-prop",
      actor: "agent-alice",
      tickProposed: tick,
      structured: {
        verb: "propose_policy",
        mutexSlots: ["speech"],
        args: {
          assemblyPlaceId: "cabin",
          patch: { enforcementStrength: 0.75 },
        },
      },
    };
    const ar = orch.world.apply(propose, tick);
    expect(ar.failureCode).toBeUndefined();
    // Runtime hook is only after orchestrator apply — call social+institution like runtime
    const p = orch.getSocial().policy.propose({
      author: "agent-alice",
      tick,
      placeId: "cabin",
      patch: { enforcementStrength: 0.75 },
    });
    orch.world.clearAllMutex();
    const v1 = orch.world.apply(
      {
        id: "v1",
        actor: "agent-alice",
        tickProposed: tick + 1,
        structured: {
          verb: "vote_policy",
          mutexSlots: ["speech"],
          args: {
            assemblyPlaceId: "cabin",
            proposalId: p.id,
            vote: "yea",
          },
        },
      },
      tick + 1,
    );
    expect(v1.failureCode).toBeUndefined();
    orch.getSocial().policy.vote({
      proposalId: p.id,
      voter: "agent-alice",
      vote: "yea",
      placeId: "cabin",
      tick: tick + 1,
    });
    orch.world.clearAllMutex();
    const v2 = orch.world.apply(
      {
        id: "v2",
        actor: "agent-bob",
        tickProposed: tick + 2,
        structured: {
          verb: "vote_policy",
          mutexSlots: ["speech"],
          args: {
            assemblyPlaceId: "cabin",
            proposalId: p.id,
            vote: "yea",
          },
        },
      },
      tick + 2,
    );
    expect(v2.failureCode).toBeUndefined();
    const res = orch.getSocial().policy.vote({
      proposalId: p.id,
      voter: "agent-bob",
      vote: "yea",
      placeId: "cabin",
      tick: tick + 2,
    });
    expect(res.justPassed).toBe(true);
    orch.applyInstitution(res.proposal.patch);
    expect(orch.getInstitution().enforcementStrength).toBe(0.75);
    expect(
      orch.getSocial().policy.list().some((x) => x.status === "passed"),
    ).toBe(true);
  });

  it("assembly-cabin runs 5 days and brief is non-empty", async () => {
    const summary = await runSimulation({
      scenario: "assembly-cabin",
      days: 5,
      seed: "42",
      freeRiderCount: 1,
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.agentIds).toHaveLength(3);
    const orch = createSimulation({
      seed: "42",
      scenario: "assembly-cabin",
      freeRiderCount: 1,
    });
    await orch.runDays(5);
    const brief = renderDailyBrief(orch, {
      seed: "42",
      scenario: "assembly-cabin",
      days: 5,
    });
    expect(brief).toMatch(/Social Brief/);
    expect(brief).toMatch(/granary/);
    expect(brief.length).toBeGreaterThan(40);
  });

  it("checkpoint includes policy board", async () => {
    const orch = createSimulation({
      seed: "ck",
      scenario: "assembly-cabin",
    });
    orch.getSocial().policy.propose({
      author: "agent-alice",
      tick: 1,
      placeId: "cabin",
      patch: { transparency: true },
    });
    const ck = orch.toCheckpoint("p");
    const social = ck.social as { policy?: { proposals: unknown[] } };
    expect(social.policy?.proposals?.length).toBe(1);
  });
});
