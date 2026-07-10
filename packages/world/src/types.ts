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

/** Shared granary / public good — distinct from private isPool food. */
export interface PublicGoodRecord {
  id: string;
  kind: "granary";
  placeId: PlaceId;
  /** public food stock */
  stock: number;
  /** 0..1 quality / level (optional production bonus later) */
  level: number;
  /** cumulative contributions by agent */
  contributors: Record<AgentId, number>;
  /** cumulative withdrawals by agent (free-ride tracking) */
  withdrawals: Record<AgentId, number>;
  totalContributed: number;
  totalWithdrawn: number;
}

export interface WorldState {
  places: Record<PlaceId, PlaceRecord>;
  entities: Record<EntityId, EntityRecord>;
  agents: Record<AgentId, AgentBody>;
  /** GOAL-005 public goods */
  publicGoods?: Record<string, PublicGoodRecord>;
}

export function cloneWorldState(state: WorldState): WorldState {
  return structuredClone(state);
}
