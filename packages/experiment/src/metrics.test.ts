import { describe, it, expect } from "vitest";
import { foodGini, countActionOk, computeFoodTotalsFromParts } from "./metrics.js";

describe("metrics pure functions", () => {
  it("foodGini is 0 for equal holdings", () => {
    expect(foodGini([5, 5, 5])).toBeCloseTo(0, 5);
  });

  it("foodGini is high when one agent holds all", () => {
    const g = foodGini([0, 0, 10]);
    expect(g).toBeGreaterThan(0.5);
  });

  it("countActionOk reads shipped sequence format", () => {
    const seq = [
      "1:agent-alice:take:OK",
      "2:agent-bob:give:OK",
      "3:agent-alice:give:REJECT:INSUFFICIENT_RESOURCE",
      "4:agent-carol:work:OK",
    ];
    expect(countActionOk(seq, "give")).toBe(1);
    expect(countActionOk(seq, "take")).toBe(1);
    expect(countActionOk(seq, "work")).toBe(1);
  });

  it("totalFood = pool + inventory", () => {
    const t = computeFoodTotalsFromParts(10, [2, 3, 0]);
    expect(t.totalFood).toBe(15);
  });
});
