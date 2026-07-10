import { describe, it, expect } from "vitest";
import { WorldAuthority } from "./authority.js";
import { createDyadCabinWorld } from "./scenarios/dyad-cabin.js";
import type { ActionProposal } from "@gss/contracts";

function speak(
  from: string,
  to: string,
  intent: string,
  id = "s1",
): ActionProposal {
  return {
    id,
    actor: from,
    tickProposed: 1,
    structured: {
      verb: "speak",
      targetAgentId: to,
      mutexSlots: ["speech"],
      args: { intent: intent as "promise", promiseContent: "I will give you food" },
    },
    utterance: "I promise food",
  };
}

describe("local speak", () => {
  it("delivers when co-located", () => {
    const w = new WorldAuthority(createDyadCabinWorld());
    const r = w.apply(speak("agent-alice", "agent-bob", "promise"), 1);
    expect(r.producedEvents.some((e) => e.type === "message.delivered")).toBe(true);
    expect(r.producedEvents.some((e) => e.type === "promise.made")).toBe(true);
  });

  it("does not deliver when different places", () => {
    const w = new WorldAuthority(createDyadCabinWorld());
    w.apply(
      {
        id: "m1",
        actor: "agent-bob",
        tickProposed: 1,
        structured: {
          verb: "move",
          targetPlaceId: "woods",
          mutexSlots: ["locomotion"],
        },
      },
      1,
    );
    w.clearAllMutex();
    const r = w.apply(speak("agent-alice", "agent-bob", "inform", "s2"), 2);
    expect(r.producedEvents.some((e) => e.type === "message.delivered")).toBe(false);
    expect(
      r.producedEvents.some(
        (e) => e.type === "message.undelivered" && e.reason === "not_co_located",
      ),
    ).toBe(true);
  });
});
