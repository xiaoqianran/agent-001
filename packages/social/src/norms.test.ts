import { describe, it, expect } from "vitest";
import {
  NormTracker,
  DEFAULT_NORM_THRESHOLDS,
  TEST_NORM_THRESHOLDS,
} from "./norms.js";

describe("NormTracker", () => {
  it("spawns emergent norm when freq and actors thresholds met", () => {
    const t = new NormTracker(TEST_NORM_THRESHOLDS);
    // 3 actions from 2 actors in storehouse take
    t.recordApplied({
      tick: 1,
      actor: "a",
      placeId: "storehouse",
      actionType: "take",
    });
    t.recordApplied({
      tick: 2,
      actor: "b",
      placeId: "storehouse",
      actionType: "take",
    });
    const spawned = t.recordApplied({
      tick: 3,
      actor: "a",
      placeId: "storehouse",
      actionType: "take",
    });
    expect(spawned).toBeTruthy();
    expect(spawned!.origin).toBe("emergent");
    expect(spawned!.kind).toBe("descriptive");
    expect(t.emergentNormCount()).toBe(1);
  });

  it("excludes injected from emergent_norm_count", () => {
    const t = new NormTracker(TEST_NORM_THRESHOLDS);
    t.injectNorm({
      placeId: "cabin",
      actionType: "rest",
      origin: "injected",
      tick: 0,
    });
    expect(t.listNorms()).toHaveLength(1);
    expect(t.emergentNormCount()).toBe(0);

    t.recordApplied({ tick: 1, actor: "a", placeId: "woods", actionType: "work" });
    t.recordApplied({ tick: 2, actor: "b", placeId: "woods", actionType: "work" });
    t.recordApplied({ tick: 3, actor: "a", placeId: "woods", actionType: "work" });
    expect(t.emergentNormCount()).toBe(1);
    expect(t.listNorms().filter((n) => n.origin === "injected")).toHaveLength(1);
  });

  it("does not spawn with only one unique actor", () => {
    const t = new NormTracker(TEST_NORM_THRESHOLDS);
    for (let i = 0; i < 5; i++) {
      const s = t.recordApplied({
        tick: i,
        actor: "only",
        placeId: "cabin",
        actionType: "rest",
      });
      expect(s).toBeUndefined();
    }
    expect(t.emergentNormCount()).toBe(0);
  });

  it("production defaults are stricter than test thresholds", () => {
    expect(DEFAULT_NORM_THRESHOLDS.tFreq).toBeGreaterThanOrEqual(
      TEST_NORM_THRESHOLDS.tFreq,
    );
  });

  it("snapshot round-trip preserves emergent count", () => {
    const t = new NormTracker(TEST_NORM_THRESHOLDS);
    t.recordApplied({ tick: 1, actor: "a", placeId: "p", actionType: "take" });
    t.recordApplied({ tick: 2, actor: "b", placeId: "p", actionType: "take" });
    t.recordApplied({ tick: 3, actor: "a", placeId: "p", actionType: "take" });
    const snap = t.snapshot();
    const t2 = NormTracker.fromSnapshot(snap);
    expect(t2.emergentNormCount()).toBe(1);
    expect(t2.digest()).toBe(t.digest());
  });
});
