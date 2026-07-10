import type { WorldState } from "../types.js";

/** dyad-cabin: Alice + Bob on cabin–woods–storehouse map */
export function createDyadCabinWorld(
  aliceId = "agent-alice",
  bobId = "agent-bob",
): WorldState {
  return {
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
        quantity: 12,
        portable: false,
        isPool: true,
        label: "food stores",
      },
      "pool:food:woods": {
        id: "pool:food:woods",
        kind: "food",
        placeId: "woods",
        quantity: 4,
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
    },
  };
}
