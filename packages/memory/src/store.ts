import type { AgentId, Tick } from "@gss/contracts";
import {
  PROMISE_IMPORTANCE_FLOOR,
  type EncodeInput,
  type MemoryKind,
  type MemoryRecord,
  type MemoryStoreSnapshot,
  type RetrieveQuery,
} from "./types.js";

/**
 * Per-simulation multi-owner memory store (keyed by owner on each record).
 * Pure domain — no World write path.
 */
export class MemoryStore {
  private records: Map<string, MemoryRecord> = new Map();
  private nextId = 1;

  encode(input: EncodeInput): MemoryRecord {
    let importance = input.importance ?? 0.5;
    const tags = [...(input.tags ?? [])];
    const promiseClass =
      input.promiseClass === true ||
      tags.includes("promise") ||
      tags.includes("debt") ||
      input.kind === "prospective" && tags.includes("commitment");

    if (promiseClass) {
      importance = Math.max(importance, PROMISE_IMPORTANCE_FLOOR);
      if (!tags.includes("promise-class")) tags.push("promise-class");
    }

    const id = `mem-${this.nextId++}`;
    const rec: MemoryRecord = {
      id,
      owner: input.owner,
      kind: input.kind,
      summary: input.summary,
      importance: clamp01(importance),
      tick: input.tick,
      lastAccessTick: input.tick,
      entities: input.entities,
      agents: input.agents,
      tags,
      payload: input.payload,
      faded: false,
    };
    this.records.set(id, rec);
    return structuredClone(rec);
  }

  get(id: string): MemoryRecord | undefined {
    const r = this.records.get(id);
    return r ? structuredClone(r) : undefined;
  }

  listFor(owner: AgentId): MemoryRecord[] {
    return [...this.records.values()]
      .filter((r) => r.owner === owner)
      .map((r) => structuredClone(r));
  }

  /**
   * Score = importance * recency * text/tag/agent match.
   * Promise-class never drops below floor during decay; still rankable.
   */
  retrieve(query: RetrieveQuery): MemoryRecord[] {
    const k = query.k ?? 5;
    const text = (query.text ?? "").toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);

    const scored = [...this.records.values()]
      .filter((r) => r.owner === query.owner)
      .filter((r) => !query.kinds || query.kinds.includes(r.kind))
      .map((r) => {
        const age = Math.max(0, query.tick - r.tick);
        const recency = 1 / (1 + age / 48); // half-life ~2 days of ticks
        let match = 0.2;
        if (words.length) {
          const hay = `${r.summary} ${r.tags.join(" ")}`.toLowerCase();
          const hits = words.filter((w) => hay.includes(w)).length;
          match += hits / words.length;
        }
        if (query.tags?.length) {
          const hit = query.tags.filter((t) => r.tags.includes(t)).length;
          match += hit / query.tags.length;
        }
        if (query.agents?.length) {
          const hit = query.agents.filter((a) => r.agents?.includes(a)).length;
          match += hit > 0 ? 0.5 : 0;
        }
        // boost promise-class
        if (r.tags.includes("promise-class")) match += 0.3;
        const score = r.importance * (0.4 + 0.6 * recency) * match;
        return { r, score };
      })
      .sort((a, b) => b.score - a.score || b.r.tick - a.r.tick)
      .slice(0, k);

    for (const { r } of scored) {
      const live = this.records.get(r.id);
      if (live) live.lastAccessTick = query.tick;
    }

    return scored.map(({ r }) => structuredClone(this.records.get(r.id)!));
  }

  /**
   * Decay low-importance memories. Promise-class importance never below floor.
   */
  decay(tick: Tick, rate = 0.02): void {
    for (const r of this.records.values()) {
      const age = tick - r.lastAccessTick;
      if (age < 12) continue;
      const isPromise = r.tags.includes("promise-class");
      let next = r.importance - rate * (age / 24);
      if (isPromise) {
        next = Math.max(PROMISE_IMPORTANCE_FLOOR, next);
      } else {
        next = Math.max(0.05, next);
        if (next < 0.15 && age > 72) r.faded = true;
      }
      r.importance = clamp01(next);
    }
  }

  count(owner?: AgentId): number {
    if (!owner) return this.records.size;
    return [...this.records.values()].filter((r) => r.owner === owner).length;
  }

  /** Digest for fingerprints */
  digest(): string {
    const parts = [...this.records.values()]
      .map(
        (r) =>
          `${r.id}:${r.owner}:${r.kind}:${r.importance.toFixed(2)}:${r.tags.sort().join(",")}`,
      )
      .sort();
    return parts.join("|");
  }

  snapshot(): MemoryStoreSnapshot {
    return {
      records: [...this.records.values()].map((r) => structuredClone(r)),
      nextId: this.nextId,
    };
  }

  loadSnapshot(snap: MemoryStoreSnapshot): void {
    this.records.clear();
    for (const r of snap.records) {
      this.records.set(r.id, structuredClone(r));
    }
    this.nextId = snap.nextId;
  }

  static fromSnapshot(snap: MemoryStoreSnapshot): MemoryStore {
    const s = new MemoryStore();
    s.loadSnapshot(snap);
    return s;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export type { MemoryKind };
