import { describe, it, expect } from "vitest";
import { WorldAuthority } from "./authority.js";
import { createSoloCabinWorld } from "./scenarios/solo-cabin.js";
import type { ActionProposal } from "@gss/contracts";

function proposal(
  partial: Partial<ActionProposal> & { structured: ActionProposal["structured"] },
): ActionProposal {
  return {
    id: partial.id ?? "a1",
    actor: partial.actor ?? "agent-alice",
    tickProposed: partial.tickProposed ?? 1,
    structured: partial.structured,
    utterance: partial.utterance,
  };
}

describe("WorldAuthority", () => {
  it("rejects illegal move that is not adjacent", () => {
    const world = new WorldAuthority(createSoloCabinWorld());
    const v = world.validate(
      proposal({
        structured: {
          verb: "move",
          targetPlaceId: "storehouse",
          mutexSlots: ["locomotion"],
        },
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.code).toBe("OUT_OF_RANGE");
  });

  it("applies legal move and observe is consistent", () => {
    const world = new WorldAuthority(createSoloCabinWorld());
    const p = proposal({
      structured: {
        verb: "move",
        targetPlaceId: "woods",
        mutexSlots: ["locomotion"],
      },
    });
    const r = world.apply(p, 1);
    expect(r.failureCode).toBeUndefined();
    expect(world.getAgent("agent-alice")?.placeId).toBe("woods");
    const obs = world.observe("agent-alice", 1);
    expect(obs.place.id).toBe("woods");
    expect(obs.resourcePools.some((x) => x.kind === "food")).toBe(true);
  });

  it("rejects mutex conflict on same tick body slots", () => {
    const world = new WorldAuthority(createSoloCabinWorld());
    world.apply(
      proposal({
        id: "r1",
        structured: { verb: "rest", mutexSlots: ["rest"] },
      }),
      1,
    );
    const v = world.validate(
      proposal({
        id: "r2",
        structured: { verb: "speak", mutexSlots: ["speech"] },
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.code).toBe("MUTEX");
  });

  it("take food from pool at place", () => {
    const world = new WorldAuthority(createSoloCabinWorld());
    world.apply(
      proposal({
        id: "m1",
        structured: {
          verb: "move",
          targetPlaceId: "woods",
          mutexSlots: ["locomotion"],
        },
      }),
      1,
    );
    world.clearAllMutex();
    const r = world.apply(
      proposal({
        id: "t1",
        structured: {
          verb: "take",
          itemKind: "food",
          quantity: 1,
          mutexSlots: ["manual"],
        },
      }),
      2,
    );
    expect(r.failureCode).toBeUndefined();
    expect(world.getAgent("agent-alice")?.inventory.food).toBe(1);
  });
});
