import type { WorldState } from "../types.js";
import { applyFoodPoolOpts, type FoodPoolOpts } from "../resource-opts.js";

export interface CommonsOpts extends FoodPoolOpts {
  /** initial public granary stock */
  initialGranary?: number;
}

/**
 * commons-cabin: 3 agents, scarce private pools + central granary at cabin.
 */
export function createCommonsCabinWorld(
  aliceId = "agent-alice",
  bobId = "agent-bob",
  carolId = "agent-carol",
  opts?: CommonsOpts,
): WorldState {
  const granaryStock = opts?.initialGranary ?? 2;
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
        quantity: 4,
        portable: false,
        isPool: true,
        label: "private stores",
      },
      "pool:food:woods": {
        id: "pool:food:woods",
        kind: "food",
        placeId: "woods",
        quantity: 2,
        portable: false,
        isPool: true,
        label: "forage",
      },
    },
    agents: {
      [aliceId]: {
        id: aliceId,
        name: "Alice",
        placeId: "cabin",
        inventory: { food: 1 },
        actionMutex: [],
        carryCapacity: 10,
        carriedMass: 1,
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
    publicGoods: {
      granary: {
        id: "granary",
        kind: "granary",
        placeId: "cabin",
        stock: granaryStock,
        level: 0.2,
        contributors: {},
        withdrawals: {},
        totalContributed: 0,
        totalWithdrawn: 0,
      },
    },
  };
  return applyFoodPoolOpts(state, opts);
}
