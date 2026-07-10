import type { WorldState } from "../types.js";

/** solo-cabin: cabin ↔ woods ↔ storehouse */
export function createSoloCabinWorld(agentId = "agent-alice"): WorldState {
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
        quantity: 10,
        portable: false,
        isPool: true,
        label: "food stores",
      },
      "pool:food:woods": {
        id: "pool:food:woods",
        kind: "food",
        placeId: "woods",
        quantity: 3,
        portable: false,
        isPool: true,
        label: "forage",
      },
      "item:axe:cabin": {
        id: "item:axe:cabin",
        kind: "tool",
        placeId: "cabin",
        quantity: 1,
        portable: true,
        isPool: false,
        label: "axe",
      },
    },
    agents: {
      [agentId]: {
        id: agentId,
        name: "Alice",
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
