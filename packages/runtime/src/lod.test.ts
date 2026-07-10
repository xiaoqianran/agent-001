import { describe, it, expect } from "vitest";
import { createCommonsCabinWorld, WorldAuthority } from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "./orchestrator.js";

function make(lod: number) {
  const alice = "agent-alice";
  const bob = "agent-bob";
  const carol = "agent-carol";
  // put carol in woods (edge), alice/bob cabin (focus)
  const world = new WorldAuthority(
    createCommonsCabinWorld(alice, bob, carol),
  );
  return new TickOrchestrator({
    world,
    seed: { value: "lod-seed" },
    scenarioId: "commons-cabin",
    agentStates: {
      [alice]: createAgentState(alice, "Alice", "cabin"),
      [bob]: createAgentState(bob, "Bob", "cabin"),
      [carol]: createAgentState(carol, "Carol", "woods"),
    },
    cognitionFactory: () => new RuleCognitiveEngine({ roleHint: "neutral" }),
    interest: {
      focusPlaceIds: ["cabin"],
      edgeSkipChance: lod,
    },
  });
}

describe("LOD interest management", () => {
  it("skips edge agents when edgeSkipChance=1", async () => {
    const orch = make(1);
    await orch.runDays(1);
    expect(orch.getSkippedCognitiveTicks()).toBeGreaterThan(0);
  });

  it("same seed yields same skip count", async () => {
    const a = make(0.8);
    const b = make(0.8);
    await a.runDays(2);
    await b.runDays(2);
    expect(a.getSkippedCognitiveTicks()).toBe(b.getSkippedCognitiveTicks());
  });

  it("lod off skips nothing", async () => {
    const orch = make(0);
    await orch.runDays(1);
    expect(orch.getSkippedCognitiveTicks()).toBe(0);
  });
});
