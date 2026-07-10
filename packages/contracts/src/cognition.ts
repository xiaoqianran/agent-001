import type { ActionId, AgentId, NeedId, GoalId, Tick } from "./ids.js";
import type { ActionProposal, StructuredAction } from "./action.js";
import type { LocalObservation } from "./observation.js";
import type { SimClock } from "./seed.js";

export interface EmotionState {
  joy: number;
  anger: number;
  sadness: number;
  fear: number;
  surprise: number;
  disgust: number;
  trust: number;
  jealousy: number;
  guilt: number;
  pride: number;
  shame: number;
  nostalgia: number;
}

export interface PhysiologyState {
  energy: number;
  hunger: number;
  fatigue: number;
  stress: number;
  health: number;
  arousal: number;
  sleepDebt: number;
}

export interface DecisionTrace {
  agentId: AgentId;
  tick: Tick;
  attended: Array<{ kind: string; salience: number; ref?: string }>;
  retrievedMemoryIds: string[];
  beliefsUsed: string[];
  personModelsUsed: Array<{ target: AgentId; fields: string[] }>;
  emotionSnapshot: Partial<EmotionState>;
  physiologySnapshot: Partial<PhysiologyState>;
  dominantNeeds: NeedId[];
  goalsConsidered: GoalId[];
  options: Array<{
    action: StructuredAction;
    score: number;
    rejectReason?: string;
  }>;
  chosen?: ActionId;
  reflectionInsightsUsed: string[];
  modelTier: "reactive" | "deliberative" | "deep";
}

export interface CognitiveBudget {
  maxTokens: number;
  tier: "reactive" | "deliberative" | "deep";
}

/** Read-only social context injected by runtime (GOAL-002) */
export interface SocialContextLite {
  relations: Array<{
    other: AgentId;
    affinity: number;
    trust: number;
    debt: number;
    type: string;
  }>;
  pendingPromisesAsPromisor: Array<{
    id: string;
    to: AgentId;
    content: string;
    itemKind?: string;
    quantity?: number;
    dueTick?: number;
  }>;
  pendingPromisesAsPromisee: Array<{
    id: string;
    from: AgentId;
    content: string;
  }>;
  /** GOAL-003 read-only norms */
  activeNorms?: Array<{
    id: string;
    kind: string;
    origin: string;
    placeId: string;
    actionType: string;
    strength: number;
  }>;
}

export interface RetrievedMemoryLite {
  id: string;
  kind: string;
  summary: string;
  importance: number;
  tags: string[];
}

export interface CognitiveTickInput {
  agentId: AgentId;
  observation: LocalObservation;
  clock: SimClock;
  budget: CognitiveBudget;
  /** optional GOAL-002 */
  social?: SocialContextLite;
  memories?: RetrievedMemoryLite[];
}

export interface AgentInternalPatch {
  emotion?: Partial<EmotionState>;
  needs?: Partial<Record<string, number>>;
  physiology?: Partial<PhysiologyState>;
  goals?: Array<{
    goalId: string;
    op: "add" | "update" | "complete" | "abandon";
    fields?: Record<string, unknown>;
  }>;
  selfNarrativeAppend?: string;
  meta?: Record<string, unknown>;
}

export interface CognitiveTickOutput {
  action?: ActionProposal;
  internalUpdates: AgentInternalPatch;
  memoryOps: Array<{ op: string; payload?: unknown }>;
  decisionTrace: DecisionTrace;
  tokensUsed: number;
}

export function defaultEmotion(): EmotionState {
  return {
    joy: 0,
    anger: 0,
    sadness: 0,
    fear: 0,
    surprise: 0,
    disgust: 0,
    trust: 0.2,
    jealousy: 0,
    guilt: 0,
    pride: 0,
    shame: 0,
    nostalgia: 0,
  };
}

export function defaultPhysiology(): PhysiologyState {
  return {
    energy: 0.8,
    hunger: 0.2,
    fatigue: 0.1,
    stress: 0.1,
    health: 1,
    arousal: 0.3,
    sleepDebt: 0,
  };
}
