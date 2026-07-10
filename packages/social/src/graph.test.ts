import { describe, it, expect } from "vitest";
import { SocialGraph } from "./graph.js";

describe("SocialGraph", () => {
  it("records promise and updates trust on keep", () => {
    const g = new SocialGraph();
    const { memoryHints } = g.reduce({
      type: "promise.made",
      tick: 1,
      from: "alice",
      to: "bob",
      content: "give food",
      kind: "give",
      itemKind: "food",
      quantity: 1,
    });
    expect(memoryHints.some((h) => h.promiseClass)).toBe(true);
    const pending = g.getSlice("alice").pendingPromisesAsPromisor;
    expect(pending).toHaveLength(1);

    g.reduce({
      type: "gift.given",
      tick: 5,
      from: "alice",
      to: "bob",
      itemKind: "food",
      quantity: 1,
    });
    const p = g.listPromises()[0]!;
    expect(p.status).toBe("kept");
    const edge = g.getEdge("alice", "bob")!;
    expect(edge.dimensions.trust).toBeGreaterThan(0.2);
  });

  it("break lowers trust", () => {
    const g = new SocialGraph();
    g.reduce({
      type: "promise.made",
      tick: 1,
      from: "a",
      to: "b",
      content: "x",
      kind: "give",
      itemKind: "food",
    });
    const id = g.listPromises()[0]!.id;
    g.reduce({ type: "promise.broken", tick: 10, promiseId: id });
    expect(g.getEdge("a", "b")!.dimensions.trust).toBeLessThan(0.2);
  });
});
