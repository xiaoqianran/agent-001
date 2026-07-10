/** GOAL-001 Freeze IDs — appendix E subset */

export type Tick = number;
export type AgentId = string;
export type EntityId = string;
export type ActionId = string;
export type MemoryId = string;
export type PlaceId = string;
export type RunId = string;
export type CheckpointId = string;
export type MessageId = string;
export type NeedId = string;
export type GoalId = string;
export type EventRef = { eventId: string; tick: Tick };

export type VisibilityClass = "public" | "semi_public" | "private" | "secret";

export type ActionType =
  | "move"
  | "take"
  | "give"
  | "craft"
  | "use"
  | "speak"
  | "write"
  | "post"
  | "vote"
  | "work"
  | "learn"
  | "rest"
  | "treat"
  | "organize"
  | "command"
  | "obey"
  | "resist"
  | "observe"
  | "investigate"
  | "verify"
  | "sanction"
  | "mediate"
  | "ritual"
  | "contribute"
  | "withdraw_public";

export type DecisionStyle =
  | "satisficing"
  | "utility_max"
  | "habit"
  | "affective_impulse"
  | "rule_follower"
  | "opportunist";

export type ValidationCode =
  | "OK"
  | "PRECONDITION"
  | "MUTEX"
  | "OUT_OF_RANGE"
  | "NO_PERMISSION"
  | "INSUFFICIENT_RESOURCE"
  | "UNKNOWN_ACTOR"
  | "UNKNOWN_TARGET"
  | "INVALID_ARGS";
