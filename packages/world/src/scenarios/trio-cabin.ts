import type { WorldState } from "../types.js";
import { applyFoodPoolOpts, type FoodPoolOpts } from "../resource-opts.js";

/**
 * trio-cabin: 3 agents, scarce food (storehouse 5, woods 2 by default).
 * Cabin ↔ woods ↔ storehouse.
 */
export function createTrioCabinWorld(
  aliceId = "agent-alice",
  bobId = "agent-bob",
  carolId = "agent-carol",
  foodOpts?: FoodPoolOpts,
): WorldState {
  const state: WorldState = {
    places: {
      cabin: {
        id: "cabin",
        name: "Cabin",
        adjacent: ["woods"],
        visibility: "private",
      },
      woods: {
        id: "woods",
        name: "Woods",
        adjacent: ["cabin", "storehouse"],
        visibility: "public",
      },
      storehouse: {
        id: "storehouse",
        name: "Storehouse",
        adjacent: ["woods"],
        visibility: "semi_public",
      },
    },
    entities: {
      "pool:food:storehouse": {
        id: "pool:food:storehouse",
        kind: "food",
        placeId: "storehouse",
        quantity: 5,
        portable: false,
        isPool: true,
        label: "scarce stores",
      },
      "pool:food:woods": {
        id: "pool:food:woods",
        kind: "food",
        placeId: "woods",
        quantity: 2,
        portable: false,
        isPool: true,
        label: "thin forage",
      },
    },
    agents: {
      [aliceId]: {
        id: aliceId,
        name: "Alice",
        placeId: "cabin",
        inventory: {},
        actionMutex: [],
        carryCapacity: 10,
        carriedMass: 0,
        moveSpeed: 1,
      },
      [bobId]: {
        id: bobId,
        name: "Bob",
        placeId: "cabin",
        inventory: {},
        actionMutex: [],
        carryCapacity: 10,
        carriedMass: 0,
        moveSpeed: 1,
      },
      [carolId]: {
        id: carolId,
        name: "Carol",
        placeId: "woods",
        inventory: {},
        actionMutex: [],
        carryCapacity: 10,
        carriedMass: 0,
        moveSpeed: 1,
      },
    },
  };
  return applyFoodPoolOpts(state, foodOpts);
}
