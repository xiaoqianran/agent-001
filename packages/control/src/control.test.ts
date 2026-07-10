import { describe, it, expect } from "vitest";
import { createCommonsCabinWorld, WorldAuthority } from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { ControlRoomService } from "./service.js";
import { buildTimeline } from "./timeline.js";

function makeOrch() {
  const alice = "agent-alice";
  const bob = "agent-bob";
  const carol = "agent-carol";
  const world = new WorldAuthority(
    createCommonsCabinWorld(alice, bob, carol),
    { enforcementStrength: 0 },
  );
  return new TickOrchestrator({
    world,
    seed: { value: "ctl" },
    scenarioId: "commons-cabin",
    agentStates: {
      [alice]: createAgentState(alice, "Alice", "cabin"),
      [bob]: createAgentState(bob, "Bob", "cabin"),
      [carol]: createAgentState(carol, "Carol", "woods"),
    },
    cognitionFactory: (id) =>
      new RuleCognitiveEngine({
        roleHint: id === alice ? "cooperative" : "free_rider",
      }),
  });
}

describe("ControlRoomService", () => {
  it("getWorldView and freeze/resume", async () => {
    const orch = makeOrch();
    const cr = new ControlRoomService(orch);
    const v = cr.getWorldView();
    expect(v.agents.length).toBe(3);
    expect(v.granary?.stock).toBeGreaterThanOrEqual(0);

    cr.freeze();
    const t0 = orch.getClock().tick;
    await orch.advanceOneTick();
    expect(orch.getClock().tick).toBe(t0);
    cr.resume();
    await orch.advanceOneTick();
    expect(orch.getClock().tick).toBe(t0 + 1);
  });

  it("inject resource changes granary via World authority", () => {
    const orch = makeOrch();
    const cr = new ControlRoomService(orch);
    const before = orch.world.getPublicGood("granary")!.stock;
    const audit = cr.inject({
      kind: "resource",
      payload: { granaryDelta: 5 },
    });
    expect(audit.result).toContain("granaryStock=");
    expect(orch.world.getPublicGood("granary")!.stock).toBe(before + 5);
    expect(cr.getAuditLog()).toHaveLength(1);
  });

  it("inject oracle_message encodes memory", () => {
    const orch = makeOrch();
    const cr = new ControlRoomService(orch);
    cr.inject({
      kind: "oracle_message",
      payload: { agentId: "agent-alice", text: "share food" },
    });
    const hits = orch.getMemory().retrieve({
      owner: "agent-alice",
      tick: 1,
      text: "oracle share",
      k: 3,
    });
    expect(hits.some((h) => h.summary.includes("oracle"))).toBe(true);
  });

  it("listTimeline non-empty after run + inject", async () => {
    const orch = makeOrch();
    const cr = new ControlRoomService(orch);
    await orch.runDays(1);
    cr.inject({ kind: "resource", payload: { granaryDelta: 1 } });
    const tl = cr.listTimeline();
    expect(tl.length).toBeGreaterThan(0);
  });

  it("buildTimeline pure helper", () => {
    const tl = buildTimeline({
      eventLog: [
        {
          type: "action.applied",
          tick: 1,
          actionId: "a",
          actor: "x",
          verb: "take",
        },
      ],
      actionSequence: ["1:x:take:OK"],
      auditLog: [],
    });
    expect(tl.length).toBeGreaterThanOrEqual(1);
  });
});
