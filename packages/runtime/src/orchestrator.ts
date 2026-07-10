import {
  advanceClock,
  agentOrder,
  createClock,
  type ActionProposal,
  type CheckpointBundle,
  type DecisionTrace,
  type DomainEventLite,
  type Seed,
  type SimClock,
} from "@gss/contracts";
import { WorldAuthority } from "@gss/world";
import {
  applyInternalPatch,
  createAgentState,
  driftNeeds,
  type AgentState,
} from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { MemoryStore } from "@gss/memory";
import { SocialGraph } from "@gss/social";
import { EventBus } from "./event-bus.js";
import { computeFingerprint } from "./fingerprint.js";

export type TickPhase =
  | "clock_advance"
  | "clear_mutex"
  | "order_agents"
  | "observe"
  | "cognitive_tick"
  | "collect_proposals"
  | "validate_apply_serial"
  | "emit_events"
  | "social_memory_reduce"
  | "feedback_encode"
  | "tick_complete";

export const TICK_PHASES: TickPhase[] = [
  "clock_advance",
  "clear_mutex",
  "order_agents",
  "observe",
  "cognitive_tick",
  "collect_proposals",
  "validate_apply_serial",
  "emit_events",
  "social_memory_reduce",
  "feedback_encode",
  "tick_complete",
];

export interface SimulationState {
  seed: Seed;
  clock: SimClock;
  scenarioId: string;
  agents: Record<string, AgentState>;
  traces: DecisionTrace[];
  actionSequence: string[];
  eventLog: DomainEventLite[];
}

export interface TickResult {
  tick: number;
  day: number;
  orderedAgents: string[];
  applied: string[];
  rejected: string[];
  faults: Array<{ agentId: string; message: string }>;
  phases: TickPhase[];
}

export type CognitionFactory = (agentId: string) => RuleCognitiveEngine;

export class TickOrchestrator {
  readonly world: WorldAuthority;
  readonly bus: EventBus;
  readonly memory: MemoryStore;
  readonly social: SocialGraph;
  private readonly cognitionByAgent: Map<string, RuleCognitiveEngine>;
  private readonly defaultCognition: RuleCognitiveEngine;
  private state: SimulationState;

  constructor(args: {
    world: WorldAuthority;
    seed: Seed;
    scenarioId: string;
    agentStates: Record<string, AgentState>;
    cognition?: RuleCognitiveEngine;
    cognitionFactory?: CognitionFactory;
    memory?: MemoryStore;
    social?: SocialGraph;
    ticksPerDay?: number;
  }) {
    this.world = args.world;
    this.bus = new EventBus();
    this.memory = args.memory ?? new MemoryStore();
    this.social = args.social ?? new SocialGraph();
    this.defaultCognition = args.cognition ?? new RuleCognitiveEngine();
    this.cognitionByAgent = new Map();
    if (args.cognitionFactory) {
      for (const id of Object.keys(args.agentStates)) {
        this.cognitionByAgent.set(id, args.cognitionFactory(id));
      }
    }
    this.state = {
      seed: args.seed,
      clock: createClock(args.ticksPerDay ?? 24),
      scenarioId: args.scenarioId,
      agents: structuredClone(args.agentStates),
      traces: [],
      actionSequence: [],
      eventLog: [],
    };
    this.bus.subscribe((e) => {
      this.state.eventLog.push(e);
    });
  }

  private eng(agentId: string): RuleCognitiveEngine {
    return this.cognitionByAgent.get(agentId) ?? this.defaultCognition;
  }

  /** @deprecated use eng; kept for tests that set forceThrow on single engine */
  get cognition(): RuleCognitiveEngine {
    return this.defaultCognition;
  }

  getSimulationState(): SimulationState {
    return structuredClone(this.state);
  }

  getClock(): SimClock {
    return { ...this.state.clock };
  }

  getTraces(): DecisionTrace[] {
    return [...this.state.traces];
  }

  getActionSequence(): string[] {
    return [...this.state.actionSequence];
  }

  getMemory(): MemoryStore {
    return this.memory;
  }

  getSocial(): SocialGraph {
    return this.social;
  }

  async advanceOneTick(): Promise<TickResult> {
    const phases: TickPhase[] = [];

    phases.push("clock_advance");
    this.state.clock = advanceClock(this.state.clock, 1);

    phases.push("clear_mutex");
    this.world.clearAllMutex();

    // nightly-ish decay
    if (this.state.clock.hourInDay === 0) {
      this.memory.decay(this.state.clock.tick);
    }

    phases.push("order_agents");
    const ids = this.world
      .listAgentIds()
      .filter((id) => this.state.agents[id]?.lifecycle === "active");
    const ordered = agentOrder(this.state.seed, this.state.clock.tick, ids);

    const proposals: ActionProposal[] = [];
    const faults: TickResult["faults"] = [];

    phases.push("observe", "cognitive_tick");
    for (const agentId of ordered) {
      let agent = this.state.agents[agentId];
      if (!agent) continue;
      agent = driftNeeds(agent, this.state.clock.hourInDay);
      this.state.agents[agentId] = agent;

      try {
        const observation = this.world.observe(agentId, this.state.clock.tick);
        agent.placeId = observation.place.id;

        const slice = this.social.getSlice(agentId, observation.place.id);
        const social = {
          relations: slice.relations.map((r) => ({
            other: r.other,
            affinity: r.dimensions.affinity,
            trust: r.dimensions.trust,
            debt: r.dimensions.debt,
            type: r.type,
          })),
          pendingPromisesAsPromisor: slice.pendingPromisesAsPromisor.map((p) => ({
            id: p.id,
            to: p.to,
            content: p.content,
            itemKind: p.itemKind,
            quantity: p.quantity,
            dueTick: p.dueTick,
          })),
          pendingPromisesAsPromisee: slice.pendingPromisesAsPromisee.map((p) => ({
            id: p.id,
            from: p.from,
            content: p.content,
          })),
          activeNorms: slice.activeNorms,
        };

        const memHits = this.memory.retrieve({
          owner: agentId,
          tick: this.state.clock.tick,
          text: "promise food debt give",
          k: 5,
        });
        // if empty but we have any memories, still pull top by importance
        const memories =
          memHits.length > 0
            ? memHits
            : this.memory
                .listFor(agentId)
                .sort((a, b) => b.importance - a.importance)
                .slice(0, 3);

        const out = await this.eng(agentId).tick(agent, {
          agentId,
          observation,
          clock: this.state.clock,
          budget: { maxTokens: 0, tier: "reactive" },
          social,
          memories: memories.map((m) => ({
            id: m.id,
            kind: m.kind,
            summary: m.summary,
            importance: m.importance,
            tags: m.tags,
          })),
        });
        this.state.traces.push(out.decisionTrace);
        if (out.internalUpdates) {
          this.state.agents[agentId] = applyInternalPatch(
            this.state.agents[agentId],
            out.internalUpdates,
          );
        }
        if (out.action) {
          proposals.push(out.action);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        faults.push({ agentId, message });
        this.bus.publish({
          type: "agent.fault",
          tick: this.state.clock.tick,
          agentId,
          error: { message, code: "cognitive_fault", recoverable: true },
        });
      }
    }

    phases.push("collect_proposals");
    phases.push("validate_apply_serial");
    const applied: string[] = [];
    const rejected: string[] = [];
    proposals.sort((a, b) => ordered.indexOf(a.actor) - ordered.indexOf(b.actor));

    for (const proposal of proposals) {
      const result = this.world.apply(proposal, this.state.clock.tick);
      if (!phases.includes("emit_events")) phases.push("emit_events");
      this.bus.publishAll(result.producedEvents);

      // social + memory reduce from world events
      if (!phases.includes("social_memory_reduce")) phases.push("social_memory_reduce");
      this.reduceWorldEvents(result.producedEvents, proposal);

      if (result.failureCode) {
        rejected.push(proposal.id);
        this.state.actionSequence.push(
          `${this.state.clock.tick}:${proposal.actor}:${proposal.structured.verb}:REJECT:${result.failureCode}`,
        );
      } else {
        applied.push(proposal.id);
        this.state.actionSequence.push(
          `${this.state.clock.tick}:${proposal.actor}:${proposal.structured.verb}:OK`,
        );
        const agent = this.state.agents[proposal.actor];
        if (agent) {
          this.state.agents[proposal.actor] = this.eng(proposal.actor).applyFeedback(
            agent,
            result.perceptsForActor ?? [],
          );
          const body = this.world.getAgent(proposal.actor);
          if (body) {
            this.state.agents[proposal.actor].placeId = body.placeId;
          }
        }
        // descriptive norm counters (place after apply so move counts destination)
        const bodyNow = this.world.getAgent(proposal.actor);
        if (bodyNow) {
          const spawned = this.social.recordAppliedAction(
            bodyNow.placeId,
            proposal.structured.verb,
            proposal.actor,
            this.state.clock.tick,
          );
          if (spawned) {
            this.memory.encode({
              owner: proposal.actor,
              kind: "social",
              summary: `noticed emerging custom: ${spawned.actionType} at ${spawned.placeId}`,
              tick: this.state.clock.tick,
              tags: ["norm", "emergent"],
              importance: 0.6,
            });
          }
        }
        // episodic encode for actor
        this.memory.encode({
          owner: proposal.actor,
          kind: "episodic",
          summary: `${proposal.structured.verb} ${(result.perceptsForActor ?? []).join(" ")}`,
          tick: this.state.clock.tick,
          tags: [proposal.structured.verb],
          importance: 0.4,
        });
      }
    }

    // break overdue promises
    for (const p of this.social.listPromises()) {
      if (
        p.status === "pending" &&
        p.dueTick !== undefined &&
        this.state.clock.tick > p.dueTick
      ) {
        const { memoryHints } = this.social.reduce({
          type: "promise.broken",
          tick: this.state.clock.tick,
          promiseId: p.id,
        });
        this.bus.publish({
          type: "promise.broken",
          tick: this.state.clock.tick,
          promiseId: p.id,
        });
        this.applyMemoryHints(memoryHints, this.state.clock.tick);
      }
    }

    phases.push("feedback_encode");
    phases.push("tick_complete");
    this.bus.publish({
      type: "tick.completed",
      tick: this.state.clock.tick,
      day: this.state.clock.day,
    });

    return {
      tick: this.state.clock.tick,
      day: this.state.clock.day,
      orderedAgents: ordered,
      applied,
      rejected,
      faults,
      phases: [...new Set(phases)],
    };
  }

  private reduceWorldEvents(
    events: DomainEventLite[],
    proposal: ActionProposal,
  ): void {
    const tick = this.state.clock.tick;
    for (const e of events) {
      if (e.type === "promise.made") {
        const { memoryHints } = this.social.reduce({
          type: "promise.made",
          tick,
          from: e.from,
          to: e.to,
          content: e.content,
          kind: "give",
          itemKind: proposal.structured.itemKind ?? "food",
          quantity: proposal.structured.quantity ?? 1,
          dueTick:
            typeof proposal.structured.args?.dueTick === "number"
              ? proposal.structured.args.dueTick
              : tick + 120,
          promiseId: e.promiseId,
        });
        this.applyMemoryHints(memoryHints, tick);
      }
      if (e.type === "message.delivered") {
        const { memoryHints } = this.social.reduce({
          type: "speak.delivered",
          tick,
          from: e.from,
          to: e.to,
          intent: e.intent ?? "inform",
        });
        this.applyMemoryHints(memoryHints, tick);
        // hearer episodic
        this.memory.encode({
          owner: e.to,
          kind: "episodic",
          summary: `heard ${e.from}: ${e.text}`,
          tick,
          agents: [e.from],
          tags: ["speech", e.intent ?? "inform"],
          importance: 0.45,
        });
      }
      if (e.type === "action.applied" && e.verb === "give") {
        const target = proposal.structured.targetAgentId;
        const kind = proposal.structured.itemKind ?? "food";
        const qty = proposal.structured.quantity ?? 1;
        if (target) {
          const { memoryHints } = this.social.reduce({
            type: "gift.given",
            tick,
            from: e.actor,
            to: target,
            itemKind: kind,
            quantity: qty,
          });
          this.applyMemoryHints(memoryHints, tick);
          // if gift fulfilled promise, social may emit kept — also publish
          const kept = this.social
            .listPromises()
            .find(
              (p) =>
                p.from === e.actor &&
                p.to === target &&
                p.status === "kept" &&
                p.keptTick === tick,
            );
          if (kept) {
            this.bus.publish({
              type: "promise.kept",
              tick,
              promiseId: kept.id,
            });
          }
        }
      }
    }
  }

  private applyMemoryHints(
    hints: import("@gss/social").MemoryHint[],
    tick: number,
  ): void {
    for (const h of hints) {
      for (const owner of h.owners) {
        this.memory.encode({
          owner,
          kind: h.kind,
          summary: h.summary,
          tick,
          agents: h.agents,
          tags: h.tags,
          payload: h.payload,
          importance: h.importance,
          promiseClass: h.promiseClass,
        });
      }
    }
  }

  async runTicks(n: number): Promise<TickResult[]> {
    const results: TickResult[] = [];
    for (let i = 0; i < n; i++) {
      results.push(await this.advanceOneTick());
    }
    return results;
  }

  async runDays(days: number): Promise<TickResult[]> {
    return this.runTicks(days * this.state.clock.ticksPerDay);
  }

  toCheckpoint(checkpointId: string): CheckpointBundle {
    const fp = computeFingerprint(
      this.world,
      this.state.agents,
      this.state.clock,
      this.state.actionSequence,
      this.memory,
      this.social,
    );
    return {
      format: "gss-checkpoint@1",
      checkpointId,
      savedAt: new Date().toISOString(),
      seed: this.state.seed,
      clock: this.state.clock,
      scenarioId: this.state.scenarioId,
      world: this.world.snapshot(),
      agents: this.state.agents,
      traces: this.state.traces,
      eventLog: this.bus.getLog(),
      actionSequence: this.state.actionSequence,
      fingerprint: JSON.stringify(fp),
      memory: this.memory.snapshot(),
      social: this.social.snapshot(),
    };
  }

  static fromCheckpoint(
    bundle: CheckpointBundle,
    cognition?: RuleCognitiveEngine,
    cognitionFactory?: CognitionFactory,
  ): TickOrchestrator {
    if (bundle.format !== "gss-checkpoint@1") {
      throw new Error(`unsupported checkpoint format ${bundle.format}`);
    }
    const world = new WorldAuthority(
      bundle.world as import("@gss/world").WorldState,
    );
    const memory = bundle.memory
      ? MemoryStore.fromSnapshot(
          bundle.memory as import("@gss/memory").MemoryStoreSnapshot,
        )
      : new MemoryStore();
    const social = bundle.social
      ? SocialGraph.fromSnapshot(
          bundle.social as import("@gss/social").SocialGraphSnapshot,
        )
      : new SocialGraph();
    const orch = new TickOrchestrator({
      world,
      seed: bundle.seed,
      scenarioId: bundle.scenarioId,
      agentStates: bundle.agents as Record<string, AgentState>,
      cognition,
      cognitionFactory,
      memory,
      social,
      ticksPerDay: bundle.clock.ticksPerDay,
    });
    orch.state.clock = { ...bundle.clock };
    orch.state.traces = [...bundle.traces];
    orch.state.actionSequence = [...bundle.actionSequence];
    orch.bus.loadLog(bundle.eventLog);
    orch.state.eventLog = [...bundle.eventLog];
    return orch;
  }
}

export { createAgentState };
