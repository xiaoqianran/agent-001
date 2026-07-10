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
  | "feedback_encode"
  | "tick_complete";

/** Documented GOAL-001 phase subset of blueprint 0–12 */
export const TICK_PHASES: TickPhase[] = [
  "clock_advance",
  "clear_mutex",
  "order_agents",
  "observe",
  "cognitive_tick",
  "collect_proposals",
  "validate_apply_serial",
  "emit_events",
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

export class TickOrchestrator {
  readonly world: WorldAuthority;
  readonly bus: EventBus;
  readonly cognition: RuleCognitiveEngine;
  private state: SimulationState;

  constructor(args: {
    world: WorldAuthority;
    seed: Seed;
    scenarioId: string;
    agentStates: Record<string, AgentState>;
    cognition?: RuleCognitiveEngine;
    ticksPerDay?: number;
  }) {
    this.world = args.world;
    this.bus = new EventBus();
    this.cognition = args.cognition ?? new RuleCognitiveEngine();
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

  /**
   * Phases (stable order):
   * clock_advance → clear_mutex → order_agents → observe → cognitive_tick
   * → collect_proposals → validate_apply_serial → emit_events → feedback_encode → tick_complete
   */
  async advanceOneTick(): Promise<TickResult> {
    const phases: TickPhase[] = [];

    // 1 clock_advance
    phases.push("clock_advance");
    this.state.clock = advanceClock(this.state.clock, 1);

    // 2 clear mutex from previous tick
    phases.push("clear_mutex");
    this.world.clearAllMutex();

    // 3 order agents
    phases.push("order_agents");
    const ids = this.world.listAgentIds().filter((id) => this.state.agents[id]?.lifecycle === "active");
    const ordered = agentOrder(this.state.seed, this.state.clock.tick, ids);

    const proposals: ActionProposal[] = [];
    const faults: TickResult["faults"] = [];

    // 4–5 observe + cognitive_tick (think sequential for determinism)
    phases.push("observe", "cognitive_tick");
    for (const agentId of ordered) {
      let agent = this.state.agents[agentId];
      if (!agent) continue;
      agent = driftNeeds(agent, this.state.clock.hourInDay);
      this.state.agents[agentId] = agent;

      try {
        const observation = this.world.observe(agentId, this.state.clock.tick);
        // mirror place
        agent.placeId = observation.place.id;
        const out = await this.cognition.tick(agent, {
          agentId,
          observation,
          clock: this.state.clock,
          budget: { maxTokens: 0, tier: "reactive" },
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
        const faultEvent: DomainEventLite = {
          type: "agent.fault",
          tick: this.state.clock.tick,
          agentId,
          error: { message, code: "cognitive_fault", recoverable: true },
        };
        this.bus.publish(faultEvent);
      }
    }

    // 6 collect
    phases.push("collect_proposals");

    // 7 serial validate+apply in same order as proposals collected (agent order)
    phases.push("validate_apply_serial");
    const applied: string[] = [];
    const rejected: string[] = [];
    // sort proposals by agent order for stability
    proposals.sort((a, b) => ordered.indexOf(a.actor) - ordered.indexOf(b.actor));

    for (const proposal of proposals) {
      const result = this.world.apply(proposal, this.state.clock.tick);
      // 8 emit
      this.bus.publishAll(result.producedEvents);
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
        // 9 feedback
        const agent = this.state.agents[proposal.actor];
        if (agent) {
          this.state.agents[proposal.actor] = this.cognition.applyFeedback(
            agent,
            result.perceptsForActor ?? [],
          );
          // sync place from world
          const body = this.world.getAgent(proposal.actor);
          if (body) {
            this.state.agents[proposal.actor].placeId = body.placeId;
          }
        }
      }
    }

    phases.push("emit_events", "feedback_encode");

    // tick complete event
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
      phases,
    };
  }

  async runTicks(n: number): Promise<TickResult[]> {
    const results: TickResult[] = [];
    for (let i = 0; i < n; i++) {
      results.push(await this.advanceOneTick());
    }
    return results;
  }

  async runDays(days: number): Promise<TickResult[]> {
    const ticks = days * this.state.clock.ticksPerDay;
    return this.runTicks(ticks);
  }

  toCheckpoint(checkpointId: string): CheckpointBundle {
    const fp = computeFingerprint(
      this.world,
      this.state.agents,
      this.state.clock,
      this.state.actionSequence,
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
    };
  }

  static fromCheckpoint(
    bundle: CheckpointBundle,
    cognition?: RuleCognitiveEngine,
  ): TickOrchestrator {
    if (bundle.format !== "gss-checkpoint@1") {
      throw new Error(`unsupported checkpoint format ${bundle.format}`);
    }
    const world = new WorldAuthority(bundle.world as import("@gss/world").WorldState);
    const orch = new TickOrchestrator({
      world,
      seed: bundle.seed,
      scenarioId: bundle.scenarioId,
      agentStates: bundle.agents as Record<string, AgentState>,
      cognition,
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
