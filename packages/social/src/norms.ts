import type { ActionType, AgentId, PlaceId, Tick } from "@gss/contracts";

export type NormOrigin = "emergent" | "institutional" | "injected";
export type NormKind = "descriptive" | "injunctive" | "taboo" | "etiquette";

export interface NormThresholds {
  /** min successful actions in window */
  tFreq: number;
  /** min distinct actors */
  tActors: number;
  /** rolling window length in ticks */
  windowTicks: number;
}

/** Production defaults (blueprint-ish). */
export const DEFAULT_NORM_THRESHOLDS: NormThresholds = {
  tFreq: 5,
  tActors: 2,
  windowTicks: 72, // 3 days * 24
};

/**
 * Test-only lower thresholds so short fixtures can assert emergent_norm_count > 0
 * without injecting origin=injected norms. Production code paths use DEFAULT.
 */
export const TEST_NORM_THRESHOLDS: NormThresholds = {
  tFreq: 3,
  tActors: 2,
  windowTicks: 48,
};

export interface ActionObservation {
  tick: Tick;
  actor: AgentId;
  placeId: PlaceId;
  actionType: ActionType;
}

export interface Norm {
  id: string;
  kind: NormKind;
  origin: NormOrigin;
  placeId: PlaceId;
  actionType: ActionType;
  strength: number;
  createdAt: Tick;
  evidenceCount: number;
  evidenceActors: number;
}

export interface NormSnapshot {
  norms: Norm[];
  events: ActionObservation[];
  nextNormId: number;
  thresholds: NormThresholds;
}

function counterKey(placeId: string, actionType: string): string {
  return `${placeId}::${actionType}`;
}

/**
 * Pure descriptive-norm counter: action.applied → rolling (place, actionType) → spawn emergent.
 * Does not use LLM; origin=emergent only via this path.
 */
export class NormTracker {
  private events: ActionObservation[] = [];
  private norms = new Map<string, Norm>();
  private nextNormId = 1;
  private thresholds: NormThresholds;

  constructor(thresholds: NormThresholds = DEFAULT_NORM_THRESHOLDS) {
    this.thresholds = { ...thresholds };
  }

  setThresholds(t: NormThresholds): void {
    this.thresholds = { ...t };
  }

  getThresholds(): NormThresholds {
    return { ...this.thresholds };
  }

  /**
   * Record a successful world action. May spawn a new emergent descriptive norm.
   * @returns spawned norm if any
   */
  recordApplied(obs: ActionObservation): Norm | undefined {
    this.events.push({ ...obs });
    // prune old events beyond a generous retention (2 windows)
    const retainFrom = obs.tick - this.thresholds.windowTicks * 2;
    if (retainFrom > 0) {
      this.events = this.events.filter((e) => e.tick >= retainFrom);
    }
    return this.maybeSpawn(obs.placeId, obs.actionType, obs.tick);
  }

  /** Injected/institutional norms for experiments — never counted as emergent. */
  injectNorm(partial: {
    placeId: PlaceId;
    actionType: ActionType;
    origin: "injected" | "institutional";
    kind?: NormKind;
    tick: Tick;
    strength?: number;
  }): Norm {
    const id = `norm-inj-${this.nextNormId++}`;
    const n: Norm = {
      id,
      kind: partial.kind ?? "descriptive",
      origin: partial.origin,
      placeId: partial.placeId,
      actionType: partial.actionType,
      strength: partial.strength ?? 0.5,
      createdAt: partial.tick,
      evidenceCount: 0,
      evidenceActors: 0,
    };
    this.norms.set(id, n);
    return structuredClone(n);
  }

  private maybeSpawn(
    placeId: PlaceId,
    actionType: ActionType,
    tick: Tick,
  ): Norm | undefined {
    // already have emergent for this key?
    for (const n of this.norms.values()) {
      if (
        n.origin === "emergent" &&
        n.placeId === placeId &&
        n.actionType === actionType
      ) {
        // refresh strength slightly
        n.strength = Math.min(1, n.strength + 0.02);
        n.evidenceCount += 1;
        return undefined;
      }
    }

    const windowStart = tick - this.thresholds.windowTicks;
    const inWindow = this.events.filter(
      (e) =>
        e.placeId === placeId &&
        e.actionType === actionType &&
        e.tick >= windowStart &&
        e.tick <= tick,
    );
    const actors = new Set(inWindow.map((e) => e.actor));
    if (
      inWindow.length >= this.thresholds.tFreq &&
      actors.size >= this.thresholds.tActors
    ) {
      const id = `norm-em-${this.nextNormId++}`;
      const n: Norm = {
        id,
        kind: "descriptive",
        origin: "emergent",
        placeId,
        actionType,
        strength: Math.min(1, inWindow.length / (this.thresholds.windowTicks / 4)),
        createdAt: tick,
        evidenceCount: inWindow.length,
        evidenceActors: actors.size,
      };
      this.norms.set(id, n);
      return structuredClone(n);
    }
    return undefined;
  }

  listNorms(): Norm[] {
    return [...this.norms.values()].map((n) => structuredClone(n));
  }

  activeNorms(placeId?: PlaceId): Norm[] {
    return this.listNorms().filter((n) => !placeId || n.placeId === placeId);
  }

  /** Metric: only origin==emergent */
  emergentNormCount(): number {
    return [...this.norms.values()].filter((n) => n.origin === "emergent").length;
  }

  digest(): string {
    return [...this.norms.values()]
      .map(
        (n) =>
          `${n.id}:${n.origin}:${n.placeId}:${n.actionType}:${n.strength.toFixed(2)}`,
      )
      .sort()
      .join("|");
  }

  snapshot(): NormSnapshot {
    return {
      norms: this.listNorms(),
      events: this.events.map((e) => ({ ...e })),
      nextNormId: this.nextNormId,
      thresholds: { ...this.thresholds },
    };
  }

  loadSnapshot(snap: NormSnapshot): void {
    this.norms.clear();
    for (const n of snap.norms) {
      this.norms.set(n.id, structuredClone(n));
    }
    this.events = snap.events.map((e) => ({ ...e }));
    this.nextNormId = snap.nextNormId;
    this.thresholds = { ...snap.thresholds };
  }

  static fromSnapshot(snap: NormSnapshot): NormTracker {
    const t = new NormTracker(snap.thresholds);
    t.loadSnapshot(snap);
    return t;
  }
}

export { counterKey };
