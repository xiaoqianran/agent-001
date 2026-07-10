import { z } from "zod";
import type { ActionId, ActionType, AgentId, EntityId, PlaceId, Tick, ValidationCode, VisibilityClass } from "./ids.js";

export type ActionMutexSlot = "locomotion" | "manual" | "speech" | "rest" | "observe";

export interface StructuredAction {
  verb: ActionType;
  targetPlaceId?: PlaceId;
  targetEntityId?: EntityId;
  targetAgentId?: AgentId;
  itemKind?: string;
  quantity?: number;
  visibility?: VisibilityClass;
  mutexSlots: ActionMutexSlot[];
  args?: Record<string, unknown>;
}

export interface ActionProposal {
  id: ActionId;
  actor: AgentId;
  tickProposed: Tick;
  structured: StructuredAction;
  utterance?: string;
}

export interface ValidationResult {
  ok: boolean;
  code: ValidationCode;
  message?: string;
}

export interface WorldDelta {
  moved?: Array<{ entityId: EntityId; to: PlaceId }>;
  created?: EntityId[];
  destroyed?: EntityId[];
  resources?: Array<{ poolId: EntityId; delta: number }>;
  inventory?: Array<{ agentId: AgentId; itemKind: string; delta: number }>;
}

export interface ActionResult {
  actionId: ActionId;
  actor: AgentId;
  tick: Tick;
  worldDelta?: WorldDelta;
  producedEvents: DomainEventLite[];
  failureCode?: ValidationCode;
  perceptsForActor?: string[];
}

/** Lightweight domain events used in GOAL-001 */
export type DomainEventLite =
  | {
      type: "action.applied";
      tick: Tick;
      actionId: ActionId;
      actor: AgentId;
      verb: ActionType;
    }
  | {
      type: "action.rejected";
      tick: Tick;
      actionId: ActionId;
      actor: AgentId;
      code: ValidationCode;
    }
  | {
      type: "message.delivered";
      tick: Tick;
      messageId: string;
      to: AgentId;
      text: string;
    }
  | {
      type: "agent.fault";
      tick: Tick;
      agentId: AgentId;
      error: { message: string; code?: string; recoverable: boolean };
    }
  | {
      type: "checkpoint.created";
      tick: Tick;
      checkpointId: string;
    }
  | {
      type: "tick.completed";
      tick: Tick;
      day: number;
    };

export const StructuredActionSchema = z.object({
  verb: z.string(),
  targetPlaceId: z.string().optional(),
  targetEntityId: z.string().optional(),
  targetAgentId: z.string().optional(),
  itemKind: z.string().optional(),
  quantity: z.number().optional(),
  visibility: z
    .enum(["public", "semi_public", "private", "secret"])
    .optional(),
  mutexSlots: z.array(
    z.enum(["locomotion", "manual", "speech", "rest", "observe"]),
  ),
  args: z.record(z.unknown()).optional(),
});

export const ActionProposalSchema = z.object({
  id: z.string(),
  actor: z.string(),
  tickProposed: z.number().int().nonnegative(),
  structured: StructuredActionSchema,
  utterance: z.string().optional(),
});

export function parseActionProposal(raw: unknown): ActionProposal {
  return ActionProposalSchema.parse(raw) as ActionProposal;
}
