import type { ActionType, AgentId, PlaceId, Tick } from "@gss/contracts";
import type {
  PromiseRecord,
  RelationEdge,
  RelationType,
  SocialEvent,
  SocialGraphSnapshot,
  SocialSlice,
  RelationDimensions,
} from "./types.js";
import {
  DEFAULT_NORM_THRESHOLDS,
  NormTracker,
  type Norm,
  type NormThresholds,
} from "./norms.js";

function edgeKey(a: AgentId, b: AgentId): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function defaultDims(): RelationDimensions {
  return { affinity: 0, trust: 0.2, debt: 0, respect: 0 };
}

/**
 * Minimal social graph + promises + descriptive norms.
 * Event-reduced only; cognition reads SocialSlice (never writes).
 */
export class SocialGraph {
  private edges = new Map<string, RelationEdge>();
  private promises = new Map<string, PromiseRecord>();
  private nextPromiseId = 1;
  readonly norms: NormTracker;

  constructor(normThresholds: NormThresholds = DEFAULT_NORM_THRESHOLDS) {
    this.norms = new NormTracker(normThresholds);
  }

  ensureEdge(a: AgentId, b: AgentId, type: RelationType = "acquaintance"): RelationEdge {
    const k = edgeKey(a, b);
    let e = this.edges.get(k);
    if (!e) {
      e = { a, b, type, dimensions: defaultDims() };
      this.edges.set(k, e);
    }
    return e;
  }

  getEdge(a: AgentId, b: AgentId): RelationEdge | undefined {
    return this.edges.get(edgeKey(a, b));
  }

  reduce(event: SocialEvent): { memoryHints: MemoryHint[] } {
    const hints: MemoryHint[] = [];
    switch (event.type) {
      case "promise.made": {
        const id = event.promiseId ?? `prom-${this.nextPromiseId++}`;
        if (this.promises.has(id)) {
          break;
        }
        const rec: PromiseRecord = {
          id,
          from: event.from,
          to: event.to,
          content: event.content,
          kind: event.kind,
          itemKind: event.itemKind,
          quantity: event.quantity,
          madeTick: event.tick,
          dueTick: event.dueTick,
          status: "pending",
        };
        this.promises.set(id, rec);
        this.ensureEdge(event.from, event.to, "acquaintance");
        hints.push({
          owners: [event.from, event.to],
          kind: "prospective",
          summary: `${event.from} promised ${event.to}: ${event.content}`,
          promiseClass: true,
          agents: [event.from, event.to],
          tags: ["promise", "commitment", "promise-class"],
          payload: { promiseId: id, status: "pending" },
          importance: 0.85,
        });
        break;
      }
      case "promise.kept": {
        const p = this.promises.get(event.promiseId);
        if (p && p.status === "pending") {
          p.status = "kept";
          p.keptTick = event.tick;
          const e = this.ensureEdge(p.from, p.to);
          e.dimensions.trust = clamp(e.dimensions.trust + 0.15);
          e.dimensions.affinity = clamp(e.dimensions.affinity + 0.1);
          e.dimensions.debt = clamp(e.dimensions.debt - 0.2);
          e.type = e.dimensions.trust > 0.5 ? "friend" : e.type;
          hints.push({
            owners: [p.from, p.to],
            kind: "social",
            summary: `Promise kept: ${p.content}`,
            promiseClass: true,
            agents: [p.from, p.to],
            tags: ["promise", "kept", "promise-class"],
            payload: { promiseId: p.id, status: "kept" },
            importance: 0.8,
          });
        }
        break;
      }
      case "promise.broken": {
        const p = this.promises.get(event.promiseId);
        if (p && p.status === "pending") {
          p.status = "broken";
          p.brokenTick = event.tick;
          const e = this.ensureEdge(p.from, p.to);
          e.dimensions.trust = clamp(e.dimensions.trust - 0.25);
          e.dimensions.affinity = clamp(e.dimensions.affinity - 0.15);
          e.type = "rival";
          hints.push({
            owners: [p.from, p.to],
            kind: "social",
            summary: `Promise broken: ${p.content}`,
            promiseClass: true,
            agents: [p.from, p.to],
            tags: ["promise", "broken", "promise-class"],
            payload: { promiseId: p.id, status: "broken" },
            importance: 0.9,
          });
        }
        break;
      }
      case "gift.given": {
        const e = this.ensureEdge(event.from, event.to);
        e.dimensions.affinity = clamp(e.dimensions.affinity + 0.08);
        e.dimensions.trust = clamp(e.dimensions.trust + 0.05);
        // fulfill matching pending promise if any
        const match = [...this.promises.values()].find(
          (p) =>
            p.status === "pending" &&
            p.from === event.from &&
            p.to === event.to &&
            (p.itemKind === event.itemKind || p.kind === "give"),
        );
        if (match) {
          return this.reduce({ type: "promise.kept", tick: event.tick, promiseId: match.id });
        }
        hints.push({
          owners: [event.from, event.to],
          kind: "social",
          summary: `${event.from} gave ${event.itemKind}x${event.quantity} to ${event.to}`,
          agents: [event.from, event.to],
          tags: ["gift"],
          importance: 0.55,
        });
        break;
      }
      case "speak.delivered": {
        this.ensureEdge(event.from, event.to, "acquaintance");
        const e = this.ensureEdge(event.from, event.to);
        e.dimensions.affinity = clamp(e.dimensions.affinity + 0.02);
        break;
      }
    }
    return { memoryHints: hints };
  }

  getSlice(subject: AgentId, placeId?: PlaceId): SocialSlice {
    const relations: SocialSlice["relations"] = [];
    for (const e of this.edges.values()) {
      if (e.a === subject || e.b === subject) {
        const other = e.a === subject ? e.b : e.a;
        relations.push({
          other,
          dimensions: { ...e.dimensions },
          type: e.type,
        });
      }
    }
    const all = [...this.promises.values()];
    const active = this.norms.activeNorms(placeId).map((n) => ({
      id: n.id,
      kind: n.kind,
      origin: n.origin,
      placeId: n.placeId,
      actionType: n.actionType,
      strength: n.strength,
    }));
    return {
      subject,
      relations,
      pendingPromisesAsPromisor: all.filter(
        (p) => p.from === subject && p.status === "pending",
      ),
      pendingPromisesAsPromisee: all.filter(
        (p) => p.to === subject && p.status === "pending",
      ),
      activeNorms: active,
    };
  }

  /** After world action.applied — record place/verb for norm emergence */
  recordAppliedAction(
    placeId: PlaceId,
    actionType: ActionType,
    actor: AgentId,
    tick: Tick,
  ): Norm | undefined {
    return this.norms.recordApplied({ tick, actor, placeId, actionType });
  }

  emergentNormCount(): number {
    return this.norms.emergentNormCount();
  }

  listPromises(): PromiseRecord[] {
    return [...this.promises.values()].map((p) => structuredClone(p));
  }

  findPendingGive(from: AgentId, to: AgentId, itemKind?: string): PromiseRecord | undefined {
    return [...this.promises.values()].find(
      (p) =>
        p.status === "pending" &&
        p.from === from &&
        p.to === to &&
        (!itemKind || p.itemKind === itemKind || p.kind === "give"),
    );
  }

  digest(): string {
    const edges = [...this.edges.values()]
      .map(
        (e) =>
          `${edgeKey(e.a, e.b)}:${e.type}:${e.dimensions.trust.toFixed(2)}:${e.dimensions.debt.toFixed(2)}`,
      )
      .sort();
    const proms = [...this.promises.values()]
      .map((p) => `${p.id}:${p.from}->${p.to}:${p.status}:${p.content}`)
      .sort();
    return edges.join("|") + "##" + proms.join("|") + "##N:" + this.norms.digest();
  }

  snapshot(): SocialGraphSnapshot {
    return {
      edges: [...this.edges.values()].map((e) => structuredClone(e)),
      promises: [...this.promises.values()].map((p) => structuredClone(p)),
      nextPromiseId: this.nextPromiseId,
      norms: this.norms.snapshot(),
    };
  }

  loadSnapshot(snap: SocialGraphSnapshot): void {
    this.edges.clear();
    this.promises.clear();
    for (const e of snap.edges) {
      this.edges.set(edgeKey(e.a, e.b), structuredClone(e));
    }
    for (const p of snap.promises) {
      this.promises.set(p.id, structuredClone(p));
    }
    this.nextPromiseId = snap.nextPromiseId;
    if (snap.norms) {
      this.norms.loadSnapshot(snap.norms);
    }
  }

  static fromSnapshot(snap: SocialGraphSnapshot): SocialGraph {
    const thresholds = snap.norms?.thresholds ?? DEFAULT_NORM_THRESHOLDS;
    const g = new SocialGraph(thresholds);
    g.loadSnapshot(snap);
    return g;
  }
}

export interface MemoryHint {
  owners: AgentId[];
  kind: "episodic" | "social" | "prospective";
  summary: string;
  promiseClass?: boolean;
  agents?: AgentId[];
  tags?: string[];
  payload?: Record<string, unknown>;
  importance?: number;
}

function clamp(n: number): number {
  return Math.max(-1, Math.min(1, n));
}
