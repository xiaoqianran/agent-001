import { describe, it, expect } from "vitest";
import { MemoryStore } from "./store.js";
import { PROMISE_IMPORTANCE_FLOOR } from "./types.js";

describe("MemoryStore", () => {
  it("encodes and retrieves by text/tags", () => {
    const store = new MemoryStore();
    store.encode({
      owner: "a",
      kind: "episodic",
      summary: "walked to woods",
      tick: 1,
      tags: ["move"],
      importance: 0.4,
    });
    const p = store.encode({
      owner: "a",
      kind: "prospective",
      summary: "promised food to bob",
      tick: 2,
      tags: ["promise", "commitment"],
      agents: ["b"],
      promiseClass: true,
      importance: 0.5,
    });
    expect(p.importance).toBeGreaterThanOrEqual(PROMISE_IMPORTANCE_FLOOR);

    const hits = store.retrieve({
      owner: "a",
      tick: 10,
      text: "promised food",
      k: 3,
    });
    expect(hits.some((h) => h.id === p.id)).toBe(true);
    expect(hits[0]!.tags).toContain("promise-class");
  });

  it("promise importance floor survives heavy decay", () => {
    const store = new MemoryStore();
    const p = store.encode({
      owner: "a",
      kind: "social",
      summary: "I owe bob a favor",
      tick: 1,
      tags: ["debt", "promise"],
      promiseClass: true,
      importance: 0.8,
    });
    store.decay(200, 0.5);
    const again = store.get(p.id)!;
    expect(again.importance).toBeGreaterThanOrEqual(PROMISE_IMPORTANCE_FLOOR);

    const hits = store.retrieve({
      owner: "a",
      tick: 200,
      tags: ["promise-class"],
      k: 5,
    });
    expect(hits.some((h) => h.id === p.id)).toBe(true);
  });

  it("snapshot round-trip preserves records", () => {
    const store = new MemoryStore();
    store.encode({
      owner: "a",
      kind: "episodic",
      summary: "hi",
      tick: 3,
    });
    const snap = store.snapshot();
    const b = MemoryStore.fromSnapshot(snap);
    expect(b.count("a")).toBe(1);
    expect(b.digest()).toBe(store.digest());
  });
});
