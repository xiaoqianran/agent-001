import type { AgentId, Tick } from "@gss/contracts";

export type RelationType =
  | "stranger"
  | "acquaintance"
  | "friend"
  | "rival";

export interface RelationDimensions {
  affinity: number;
  trust: number;
  debt: number;
  respect: number;
}

export interface RelationEdge {
  a: AgentId;
  b: AgentId;
  type: RelationType;
  dimensions: RelationDimensions;
}

export type PromiseStatus = "pending" | "kept" | "broken";

export interface PromiseRecord {
  id: string;
  from: AgentId;
  to: AgentId;
  content: string;
  /** e.g. give food */
  kind: string;
  itemKind?: string;
  quantity?: number;
  madeTick: Tick;
  dueTick?: Tick;
  status: PromiseStatus;
  keptTick?: Tick;
  brokenTick?: Tick;
}

export interface SocialSlice {
  subject: AgentId;
  relations: Array<{
    other: AgentId;
    dimensions: RelationDimensions;
    type: RelationType;
  }>;
  pendingPromisesAsPromisor: PromiseRecord[];
  pendingPromisesAsPromisee: PromiseRecord[];
  /** GOAL-003: read-only active norms (optionally place-filtered by runtime) */
  activeNorms: Array<{
    id: string;
    kind: string;
    origin: string;
    placeId: string;
    actionType: string;
    strength: number;
  }>;
}

export interface SocialGraphSnapshot {
  edges: RelationEdge[];
  promises: PromiseRecord[];
  nextPromiseId: number;
  /** GOAL-003 */
  norms?: import("./norms.js").NormSnapshot;
  /** GOAL-008 */
  policy?: import("./policy.js").PolicyBoardSnapshot;
}

export type SocialEvent =
  | {
      type: "promise.made";
      tick: Tick;
      from: AgentId;
      to: AgentId;
      content: string;
      kind: string;
      itemKind?: string;
      quantity?: number;
      dueTick?: Tick;
      promiseId?: string;
    }
  | {
      type: "promise.kept";
      tick: Tick;
      promiseId: string;
    }
  | {
      type: "promise.broken";
      tick: Tick;
      promiseId: string;
    }
  | {
      type: "gift.given";
      tick: Tick;
      from: AgentId;
      to: AgentId;
      itemKind: string;
      quantity: number;
    }
  | {
      type: "speak.delivered";
      tick: Tick;
      from: AgentId;
      to: AgentId;
      intent: string;
    };
