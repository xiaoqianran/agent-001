import type {
  ActionMutexSlot,
  AgentId,
  EntityId,
  PlaceId,
  VisibilityClass,
} from "@gss/contracts";

export interface PlaceRecord {
  id: PlaceId;
  name: string;
  adjacent: PlaceId[];
  visibility: VisibilityClass;
}

export interface EntityRecord {
  id: EntityId;
  kind: string;
  placeId: PlaceId;
  label?: string;
  quantity: number;
  portable: boolean;
  /** resource pool vs item */
  isPool: boolean;
}

export interface AgentBody {
  id: AgentId;
  name: string;
  placeId: PlaceId;
  inventory: Record<string, number>;
  actionMutex: ActionMutexSlot[];
  carryCapacity: number;
  carriedMass: number;
  moveSpeed: number;
}

export interface WorldState {
  places: Record<PlaceId, PlaceRecord>;
  entities: Record<EntityId, EntityRecord>;
  agents: Record<AgentId, AgentBody>;
}

export function cloneWorldState(state: WorldState): WorldState {
  return structuredClone(state);
}
