import type { AgentId, EntityId, PlaceId, Tick, VisibilityClass } from "./ids.js";

export interface PlaceView {
  id: PlaceId;
  name: string;
  adjacent: PlaceId[];
  visibility: VisibilityClass;
}

export interface EntityView {
  id: EntityId;
  kind: string;
  placeId: PlaceId;
  label?: string;
  quantity?: number;
  portable?: boolean;
}

export interface AgentView {
  id: AgentId;
  placeId: PlaceId;
  name: string;
}

export interface LocalObservation {
  tick: Tick;
  observer: AgentId;
  place: PlaceView;
  adjacentPlaces: PlaceView[];
  entitiesHere: EntityView[];
  agentsHere: AgentView[];
  /** Resources visible at this place (pools) */
  resourcePools: Array<{ id: EntityId; kind: string; quantity: number }>;
}
