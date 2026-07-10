import { describe, it, expect } from "vitest";
import { agentOrder, advanceClock, createClock, hash32 } from "./seed.js";
import { parseActionProposal } from "./action.js";

describe("contracts", () => {
  it("hash32 is stable", () => {
    expect(hash32("abc")).toBe(hash32("abc"));
  });

  it("advanceClock updates day", () => {
    let c = createClock(24);
    for (let i = 0; i < 24; i++) c = advanceClock(c);
    expect(c.day).toBe(1);
    expect(c.tick).toBe(24);
  });

  it("agentOrder is pure", () => {
    expect(agentOrder({ value: "1" }, 0, ["x", "y"])).toEqual(
      agentOrder({ value: "1" }, 0, ["y", "x"]),
    );
  });

  it("parses ActionProposal with zod", () => {
    const p = parseActionProposal({
      id: "1",
      actor: "a",
      tickProposed: 0,
      structured: { verb: "rest", mutexSlots: ["rest"] },
    });
    expect(p.structured.verb).toBe("rest");
  });
});
