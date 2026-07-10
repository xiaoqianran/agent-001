import { describe, it, expect } from "vitest";
import { PolicyBoard } from "./policy.js";

describe("PolicyBoard", () => {
  it("propose and pass with 2 yeas", () => {
    const b = new PolicyBoard({ yeaThreshold: 2 });
    const p = b.propose({
      author: "a",
      tick: 1,
      placeId: "cabin",
      patch: { enforcementStrength: 0.8 },
    });
    expect(p.status).toBe("open");
    const r1 = b.vote({
      proposalId: p.id,
      voter: "a",
      vote: "yea",
      placeId: "cabin",
      tick: 2,
    });
    expect(r1.justPassed).toBe(false);
    const r2 = b.vote({
      proposalId: p.id,
      voter: "b",
      vote: "yea",
      placeId: "cabin",
      tick: 3,
    });
    expect(r2.justPassed).toBe(true);
    expect(r2.proposal.status).toBe("passed");
    expect(r2.proposal.patch.enforcementStrength).toBe(0.8);
  });

  it("rejects vote at wrong place", () => {
    const b = new PolicyBoard();
    const p = b.propose({
      author: "a",
      tick: 1,
      placeId: "cabin",
      patch: { freeRidePenalty: 0.5 },
    });
    expect(() =>
      b.vote({
        proposalId: p.id,
        voter: "b",
        vote: "yea",
        placeId: "woods",
        tick: 2,
      }),
    ).toThrow(/assembly|place/i);
  });

  it("snapshot round-trip", () => {
    const b = new PolicyBoard();
    b.propose({
      author: "a",
      tick: 1,
      placeId: "cabin",
      patch: { transparency: true },
    });
    const b2 = PolicyBoard.fromSnapshot(b.snapshot());
    expect(b2.list()).toHaveLength(1);
    expect(b2.digest()).toBe(b.digest());
  });
});
