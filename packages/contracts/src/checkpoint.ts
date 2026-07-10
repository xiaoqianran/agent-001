import type { Seed, SimClock } from "./seed.js";
import type { AgentId } from "./ids.js";
import type { DecisionTrace } from "./cognition.js";
import type { DomainEventLite } from "./action.js";

export interface CheckpointBundle {
  format: "gss-checkpoint@1";
  checkpointId: string;
  savedAt: string;
  seed: Seed;
  clock: SimClock;
  scenarioId: string;
  world: unknown;
  agents: Record<AgentId, unknown>;
  traces: DecisionTrace[];
  eventLog: DomainEventLite[];
  actionSequence: string[];
  fingerprint?: string;
  /** GOAL-002 */
  memory?: unknown;
  social?: unknown;
}

export interface AuthorityFingerprint {
  tick: number;
  day: number;
  agentPlaces: Record<string, string>;
  resourceTotals: Record<string, number>;
  actionSequenceHash: string;
  needs: Record<string, Record<string, number>>;
  /** optional digests for multi-agent social runs */
  memoryDigest?: string;
  socialDigest?: string;
}
