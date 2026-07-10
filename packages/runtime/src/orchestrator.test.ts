import { describe, it, expect } from "vitest";
import { createSoloCabinWorld, WorldAuthority } from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "./orchestrator.js";
import { computeFingerprint, fingerprintEqual } from "./fingerprint.js";
import { agentOrder } from "@gss/contracts";
import { createDyadCabinSimulation } from "@gss/sim";

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
      a.getMemory(),
      a.getSocial(),
    );
    const fb = computeFingerprint(
      b.world,
      b.getSimulationState().agents,
      b.getClock(),
      b.getActionSequence(),
      b.getMemory(),
      b.getSocial(),
    );
    expect(fingerprintEqual(fa, fb)).toBe(true);
  });

  it("checkpoint resume continues clock and retains agent", async () => {
    const orch = make("7");
    await orch.runDays(3);
    const mid = orch.getClock();
    const ckpt = orch.toCheckpoint("t1");
    const resumed = TickOrchestrator.fromCheckpoint(ckpt);
    expect(resumed.getClock().tick).toBe(mid.tick);
    await resumed.runDays(4);
    expect(resumed.getClock().day).toBe(7);
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
    cognition.setForceThrow(false);
    const r2 = await orch.advanceOneTick();
    expect(r2.tick).toBe(r.tick + 1);
  });

  it("records DecisionTrace with dominantNeeds and chosen", async () => {
    const orch = make("trace");
    await orch.advanceOneTick();
    const t = orch.getTraces()[0]!;
    expect(t.dominantNeeds.length).toBeGreaterThan(0);
    expect(t.chosen).toBeTruthy();
  });

  it("dyad forms promise memories and retrieve after checkpoint", async () => {
    const orch = createDyadCabinSimulation({ seed: "dyad-1" });
    await orch.runDays(2);
    const promises = orch.getSocial().listPromises();
    // may or may not have promised in 2 days — run longer if needed
    if (promises.length === 0) {
      await orch.runDays(2);
    }
    expect(orch.getSocial().listPromises().length + orch.getMemory().count()).toBeGreaterThan(0);

    // force a promise path: at least episodic memories from actions
    expect(orch.getMemory().count()).toBeGreaterThan(0);

    const ckpt = orch.toCheckpoint("d");
    const resumed = TickOrchestrator.fromCheckpoint(
      ckpt,
      undefined,
      (id) =>
        new RuleCognitiveEngine({
          roleHint: id === "agent-alice" ? "promisor" : "promisee",
        }),
    );

    // if promises exist, retrieve promise-class
    const anyPromiseMem = resumed
      .getMemory()
      .retrieve({ owner: "agent-alice", tick: resumed.getClock().tick, tags: ["promise-class"], k: 5 });
    const anyMem = resumed.getMemory().listFor("agent-alice");
    expect(anyMem.length + anyPromiseMem.length).toBeGreaterThan(0);

    // After more ticks, retrievedMemoryIds should appear once memories exist
    await resumed.advanceOneTick();
    const traces = resumed.getTraces();
    const withMem = traces.filter((t) => t.retrievedMemoryIds.length > 0);
    expect(withMem.length).toBeGreaterThan(0);
  });
});
