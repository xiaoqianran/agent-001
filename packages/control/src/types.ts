import type { AgentId, Tick } from "@gss/contracts";
import type { InstitutionParams } from "@gss/experiment";

export interface WorldViewDTO {
  tick: number;
  day: number;
  scenarioId: string;
  frozen: boolean;
  places: string[];
  agents: Array<{ id: AgentId; name: string; placeId: string }>;
  granary?: { stock: number; totalContributed: number; totalWithdrawn: number };
  institution: InstitutionParams;
}

export interface AgentViewDTO {
  id: AgentId;
  placeId: string;
  needs: Record<string, number>;
  inventory: Record<string, number>;
  lastTrace?: {
    tick: number;
    chosen?: string;
    dominantNeeds: string[];
    optionsTop: string[];
  };
}

export interface TimelineEvent {
  tick: number;
  type: string;
  actor?: AgentId;
  summary: string;
  refs?: string[];
}

export type InjectionKind =
  | "resource"
  | "oracle_message"
  | "param"
  | "event";

export interface Injection {
  kind: InjectionKind;
  payload: Record<string, unknown>;
  at?: Tick | "now";
}

export interface InjectionAudit {
  id: string;
  tick: number;
  kind: InjectionKind;
  payload: Record<string, unknown>;
  result: string;
  at: string;
}
