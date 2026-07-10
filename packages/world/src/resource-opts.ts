import type { WorldState } from "./types.js";

/** Optional overrides for initial food pools (GOAL-004 experiment params). */
export interface FoodPoolOpts {
  storehouseFood?: number;
  woodsFood?: number;
}

/** Mutate pool quantities on a freshly created world state. */
export function applyFoodPoolOpts(state: WorldState, opts?: FoodPoolOpts): WorldState {
  if (!opts) return state;
  const next = structuredClone(state);
  if (opts.storehouseFood !== undefined) {
    const e = next.entities["pool:food:storehouse"];
    if (e) e.quantity = opts.storehouseFood;
  }
  if (opts.woodsFood !== undefined) {
    const e = next.entities["pool:food:woods"];
    if (e) e.quantity = opts.woodsFood;
  }
  return next;
}

export function getPoolFood(state: WorldState, place: "storehouse" | "woods"): number {
  const id = `pool:food:${place}`;
  return nextQuantity(state.entities[id]?.quantity);
}

function nextQuantity(q: number | undefined): number {
  return q ?? 0;
}
