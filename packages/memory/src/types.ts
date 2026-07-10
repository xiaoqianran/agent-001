import type { AgentId, Tick } from "@gss/contracts";

export type MemoryKind = "episodic" | "social" | "prospective";

/** Promise-class social/prospective use importance floor (eval #1 mini). */
export const PROMISE_IMPORTANCE_FLOOR = 0.75;

export interface MemoryRecord {
  id: string;
  owner: AgentId;
  kind: MemoryKind;
  summary: string;
  importance: number;
  tick: Tick;
  /** last time retrieved or reinforced */
  lastAccessTick: Tick;
  entities?: string[];
  agents?: AgentId[];
  tags: string[];
  /** structured payload for promises etc. */
  payload?: Record<string, unknown>;
  faded: boolean;
}

export interface EncodeInput {
  owner: AgentId;
  kind: MemoryKind;
  summary: string;
  importance?: number;
  tick: Tick;
  entities?: string[];
  agents?: AgentId[];
  tags?: string[];
  payload?: Record<string, unknown>;
  /** if true, clamp importance to PROMISE_IMPORTANCE_FLOOR minimum */
  promiseClass?: boolean;
}

export interface RetrieveQuery {
  owner: AgentId;
  tick: Tick;
  /** free text keywords */
  text?: string;
  kinds?: MemoryKind[];
  tags?: string[];
  agents?: AgentId[];
  k?: number;
}

export interface MemoryStoreSnapshot {
  records: MemoryRecord[];
  nextId: number;
}
