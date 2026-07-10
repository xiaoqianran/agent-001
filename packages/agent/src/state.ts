import type {
  AgentId,
  AgentInternalPatch,
  DecisionStyle,
  EmotionState,
  PhysiologyState,
  PlaceId,
} from "@gss/contracts";
import { defaultEmotion, defaultPhysiology } from "@gss/contracts";

export interface GoalRecord {
  id: string;
  layer: "life" | "stage" | "daily" | "intent" | "emergency";
  description: string;
  priority: number;
  progress: number;
  status: "active" | "completed" | "abandoned";
}

export interface AgentState {
  id: AgentId;
  name: string;
  identitySummary: string;
  needs: {
    energy: number;
    hunger: number;
    rest: number;
    safety: number;
  };
  goals: GoalRecord[];
  emotion: EmotionState;
  physiology: PhysiologyState;
  /** Read-only mirror of world place — updated via feedback from runtime */
  placeId: PlaceId;
  decisionStyle: DecisionStyle;
  lifecycle: "active" | "retired" | "dead";
  selfNarrative: string;
}

export function createAgentState(
  id: AgentId,
  name: string,
  placeId: PlaceId,
): AgentState {
  return {
    id,
    name,
    identitySummary: `${name}, a solitary cabin dweller`,
    needs: { energy: 0.8, hunger: 0.25, rest: 0.2, safety: 0.7 },
    goals: [
      {
        id: "daily-survive",
        layer: "daily",
        description: "Stay fed and rested",
        priority: 1,
        progress: 0,
        status: "active",
      },
      {
        id: "intent-now",
        layer: "intent",
        description: "Handle most urgent need",
        priority: 2,
        progress: 0,
        status: "active",
      },
    ],
    emotion: defaultEmotion(),
    physiology: defaultPhysiology(),
    placeId,
    decisionStyle: "satisficing",
    lifecycle: "active",
    selfNarrative: "I live alone and keep the cabin in order.",
  };
}

export function applyInternalPatch(
  state: AgentState,
  patch: AgentInternalPatch,
): AgentState {
  const next = structuredClone(state);
  if (patch.emotion) {
    next.emotion = { ...next.emotion, ...patch.emotion };
  }
  if (patch.physiology) {
    next.physiology = { ...next.physiology, ...patch.physiology };
  }
  if (patch.needs) {
    for (const [k, v] of Object.entries(patch.needs)) {
      if (k in next.needs && typeof v === "number") {
        (next.needs as Record<string, number>)[k] = clamp01(v);
      }
    }
  }
  if (patch.selfNarrativeAppend) {
    next.selfNarrative = `${next.selfNarrative} ${patch.selfNarrativeAppend}`.trim();
  }
  if (patch.goals) {
    for (const g of patch.goals) {
      const existing = next.goals.find((x) => x.id === g.goalId);
      if (g.op === "add" && !existing) {
        next.goals.push({
          id: g.goalId,
          layer: "intent",
          description: String(g.fields?.description ?? g.goalId),
          priority: Number(g.fields?.priority ?? 1),
          progress: 0,
          status: "active",
        });
      } else if (existing && g.op === "update") {
        if (g.fields?.progress !== undefined) {
          existing.progress = Number(g.fields.progress);
        }
      } else if (existing && g.op === "complete") {
        existing.status = "completed";
      } else if (existing && g.op === "abandon") {
        existing.status = "abandoned";
      }
    }
  }
  return next;
}

/** Natural drift each tick before cognition */
export function driftNeeds(state: AgentState, hourInDay: number): AgentState {
  const next = structuredClone(state);
  next.needs.hunger = clamp01(next.needs.hunger + 0.03);
  next.needs.rest = clamp01(next.needs.rest + (hourInDay >= 20 || hourInDay < 6 ? 0.04 : 0.015));
  next.needs.energy = clamp01(next.needs.energy - 0.02);
  next.physiology.hunger = next.needs.hunger;
  next.physiology.fatigue = next.needs.rest;
  next.physiology.energy = next.needs.energy;
  next.physiology.sleepDebt = clamp01(
    next.physiology.sleepDebt + (hourInDay >= 22 ? 0.02 : 0),
  );
  return next;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
