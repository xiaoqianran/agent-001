import { describe, it, expect } from "vitest";
import { WorldAuthority } from "./authority.js";
import { createCommonsCabinWorld } from "./scenarios/commons-cabin.js";
import type { ActionProposal } from "@gss/contracts";

function prop(
  partial: Partial<ActionProposal> & { structured: ActionProposal["structured"] },
): ActionProposal {
  return {
    id: partial.id ?? "a1",
    actor: partial.actor ?? "agent-alice",
    tickProposed: partial.tickProposed ?? 1,
    structured: partial.structured,
  };
}

describe("public good granary", () => {
  it("contribute moves food from inventory to public stock only", () => {
    const w = new WorldAuthority(createCommonsCabinWorld());
    const beforePool = w.snapshot().entities["pool:food:storehouse"]!.quantity;
    const g0 = w.getPublicGood("granary")!;
    expect(g0.stock).toBe(2);
    expect(w.getAgent("agent-alice")!.inventory.food).toBe(1);

    const r = w.apply(
      prop({
        structured: {
          verb: "contribute",
          itemKind: "food",
          quantity: 1,
          mutexSlots: ["manual"],
          args: { publicGoodId: "granary" },
        },
      }),
      1,
    );
    expect(r.failureCode).toBeUndefined();
    expect(w.getPublicGood("granary")!.stock).toBe(3);
    expect(w.getAgent("agent-alice")!.inventory.food ?? 0).toBe(0);
    expect(w.getPublicGood("granary")!.totalContributed).toBe(1);
    // private pool unchanged
    expect(w.snapshot().entities["pool:food:storehouse"]!.quantity).toBe(beforePool);
  });

  it("withdraw_public takes from granary not private pool", () => {
    const w = new WorldAuthority(createCommonsCabinWorld());
    const poolBefore = w.snapshot().entities["pool:food:storehouse"]!.quantity;
    w.clearAllMutex();
    const r = w.apply(
      prop({
        id: "w1",
        actor: "agent-bob",
        structured: {
          verb: "withdraw_public",
          quantity: 1,
          mutexSlots: ["manual"],
          args: { publicGoodId: "granary" },
        },
      }),
      2,
    );
    expect(r.failureCode).toBeUndefined();
    expect(w.getPublicGood("granary")!.stock).toBe(1);
    expect(w.getAgent("agent-bob")!.inventory.food).toBe(1);
    expect(w.getPublicGood("granary")!.totalWithdrawn).toBe(1);
    expect(w.snapshot().entities["pool:food:storehouse"]!.quantity).toBe(poolBefore);
  });

  it("rejects contribute when not at granary place", () => {
    const w = new WorldAuthority(createCommonsCabinWorld());
    // move alice to woods without food path — carol at woods
    const v = w.validate(
      prop({
        actor: "agent-carol",
        structured: {
          verb: "contribute",
          itemKind: "food",
          quantity: 1,
          mutexSlots: ["manual"],
        },
      }),
    );
    // carol has no food AND wrong place — either fails
    expect(v.ok).toBe(false);
  });

  it("rejects withdraw when public stock empty", () => {
    const w = new WorldAuthority(
      createCommonsCabinWorld("agent-alice", "agent-bob", "agent-carol", {
        initialGranary: 0,
      }),
    );
    const v = w.validate(
      prop({
        actor: "agent-bob",
        structured: {
          verb: "withdraw_public",
          quantity: 1,
          mutexSlots: ["manual"],
        },
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.code).toBe("INSUFFICIENT_RESOURCE");
  });
});
