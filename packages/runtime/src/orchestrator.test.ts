import { describe, it, expect } from "vitest";
import { createSoloCabinWorld, WorldAuthority } from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "./orchestrator.js";
import { computeFingerprint, fingerprintEqual } from "./fingerprint.js";
import { agentOrder } from "@gss/contracts";

describe("TickOrchestrator", () => {
  function make(seed = "42") {
    const world = new WorldAuthority(createSoloCabinWorld());
    const agent = createAgentState("agent-alice", "Alice", "cabin");
    return new TickOrchestrator({
      world,
      seed: { value: seed },
      scenarioId: "solo-cabin",
      agentStates: { "agent-alice": agent },
    });
  }

  it("orders agents deterministically from seed+tick", () => {
    const ids = ["b", "a", "c"];
    const o1 = agentOrder({ value: "s" }, 3, ids);
    const o2 = agentOrder({ value: "s" }, 3, ids);
    expect(o1).toEqual(o2);
    expect(o1).toHaveLength(3);
  });

  it("same seed yields identical fingerprints", async () => {
    const a = make("42");
    const b = make("42");
    await a.runDays(2);
    await b.runDays(2);
    const fa = computeFingerprint(
      a.world,
      a.getSimulationState().agents,
      a.getClock(),
      a.getActionSequence(),
    );
    const fb = computeFingerprint(
      b.world,
      b.getSimulationState().agents,
      b.getClock(),
      b.getActionSequence(),
    );
    expect(fingerprintEqual(fa, fb)).toBe(true);
    expect(fa.actionSequenceHash).toBe(fb.actionSequenceHash);
  });

  it("checkpoint resume continues clock and retains agent", async () => {
    const orch = make("7");
    await orch.runDays(3);
    const mid = orch.getClock();
    expect(mid.day).toBe(3);
    const ckpt = orch.toCheckpoint("t1");
    const resumed = TickOrchestrator.fromCheckpoint(ckpt);
    expect(resumed.getClock().tick).toBe(mid.tick);
    expect(resumed.getSimulationState().agents["agent-alice"]?.id).toBe(
      "agent-alice",
    );
    expect(resumed.getSimulationState().seed.value).toBe("7");
    const placeBefore = resumed.getSimulationState().agents["agent-alice"]!.placeId;
    await resumed.runDays(4);
    const end = resumed.getClock();
    expect(end.tick).toBeGreaterThan(mid.tick);
    expect(end.day).toBe(7);
    expect(resumed.getSimulationState().agents["agent-alice"]).toBeDefined();
    const legal = new Set(["cabin", "woods", "storehouse"]);
    expect(legal.has(resumed.getSimulationState().agents["agent-alice"]!.placeId)).toBe(
      true,
    );
    expect(legal.has(placeBefore)).toBe(true);
  });

  it("isolates cognitive faults without crashing", async () => {
    const world = new WorldAuthority(createSoloCabinWorld());
    const agent = createAgentState("agent-alice", "Alice", "cabin");
    const cognition = new RuleCognitiveEngine({ forceThrow: true });
    const orch = new TickOrchestrator({
      world,
      seed: { value: "fault" },
      scenarioId: "solo-cabin",
      agentStates: { "agent-alice": agent },
      cognition,
    });
    const r = await orch.advanceOneTick();
    expect(r.faults.length).toBe(1);
    expect(r.faults[0]!.message).toMatch(/injected cognitive fault/);
    const log = orch.getSimulationState().eventLog;
    expect(log.some((e) => e.type === "agent.fault")).toBe(true);
    // still can advance further if fault disabled
    cognition.setForceThrow(false);
    const r2 = await orch.advanceOneTick();
    expect(r2.tick).toBe(r.tick + 1);
  });

  it("records DecisionTrace with dominantNeeds and chosen", async () => {
    const orch = make("trace");
    await orch.advanceOneTick();
    const traces = orch.getTraces();
    expect(traces.length).toBeGreaterThan(0);
    const t = traces[0]!;
    expect(t.dominantNeeds.length).toBeGreaterThan(0);
    expect(t.chosen).toBeTruthy();
    expect(t.options.length).toBeGreaterThan(0);
  });
});
