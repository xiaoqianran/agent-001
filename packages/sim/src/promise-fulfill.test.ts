import { describe, it, expect } from "vitest";
import { createDyadCabinSimulation } from "./create.js";

/**
 * Regression: promisor must take food before give; inventory on observation
 * gates give so we get give:OK and promise.kept (not only broken on due).
 */
describe("dyad promise fulfill path", () => {
  it("exposes selfInventory on observation", () => {
    const orch = createDyadCabinSimulation({ seed: "inv" });
    // give alice some food in world body
    const body = orch.world.getAgent("agent-alice")!;
    body.inventory.food = 2;
    body.carriedMass = 2;
    const obs = orch.world.observe("agent-alice", 1);
    expect(obs.selfInventory.food).toBe(2);
  });

  it("produces give:OK and at least one kept promise within 5 days", async () => {
    const orch = createDyadCabinSimulation({ seed: "42" });
    await orch.runDays(5);
    const seq = orch.getActionSequence();
    const giveOk = seq.filter((s) => s.includes(":give:OK"));
    const giveReject = seq.filter((s) =>
      s.includes("give:REJECT:INSUFFICIENT_RESOURCE"),
    );
    const kept = orch.getSocial().listPromises().filter((p) => p.status === "kept");

    expect(giveOk.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    // invalid give spam should not dominate
    expect(giveReject.length).toBeLessThan(giveOk.length + 5);
  });

  it("does not choose give when inventory empty (unit via engine options)", async () => {
    const orch = createDyadCabinSimulation({ seed: "empty-give" });
    // Force a pending promise via social reduce
    orch.getSocial().reduce({
      type: "promise.made",
      tick: 1,
      from: "agent-alice",
      to: "agent-bob",
      content: "give food",
      kind: "give",
      itemKind: "food",
      quantity: 1,
      dueTick: 200,
      promiseId: "prom-test-1",
    });
    // Ensure empty inventory
    const body = orch.world.getAgent("agent-alice")!;
    body.inventory = {};
    body.carriedMass = 0;
    // co-locate
    body.placeId = "cabin";
    orch.world.getAgent("agent-bob")!.placeId = "cabin";

    const r = await orch.advanceOneTick();
    // Alice should not successfully apply give with empty inv
    const aliceActs = orch
      .getActionSequence()
      .filter((s) => s.includes("agent-alice"));
    const last = aliceActs[aliceActs.length - 1] ?? "";
    expect(last.includes("give:OK")).toBe(false);
    void r;
  });
});
