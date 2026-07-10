import type { Seed } from "@gss/contracts";
import {
  createSoloCabinWorld,
  createDyadCabinWorld,
  createTrioCabinWorld,
  createCommonsCabinWorld,
  WorldAuthority,
  type FoodPoolOpts,
} from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { createLlmFromEnv, type LlmPort } from "@gss/llm";
import {
  SocialGraph,
  DEFAULT_NORM_THRESHOLDS,
  TEST_NORM_THRESHOLDS,
  type NormThresholds,
} from "@gss/social";
import type { ExperimentParams, ScenarioId } from "@gss/experiment";

export type { ScenarioId };

export interface CreateSimOptions {
  seed: string;
  scenario?: ScenarioId;
  agentId?: string;
  llm?: LlmPort;
  ticksPerDay?: number;
  testNormThresholds?: boolean;
  storehouseFood?: number;
  woodsFood?: number;
  initialGranary?: number;
  freeRiderCount?: number;
  normThresholds?: Partial<NormThresholds>;
  label?: string;
  experimentParams?: ExperimentParams;
}

function foodOptsFrom(opts: CreateSimOptions): FoodPoolOpts | undefined {
  if (opts.storehouseFood === undefined && opts.woodsFood === undefined) {
    return undefined;
  }
  return {
    storehouseFood: opts.storehouseFood,
    woodsFood: opts.woodsFood,
  };
}

function socialFrom(opts: CreateSimOptions): SocialGraph {
  if (opts.testNormThresholds || opts.experimentParams?.testNormThresholds) {
    return new SocialGraph(TEST_NORM_THRESHOLDS);
  }
  if (opts.normThresholds || opts.experimentParams?.normThresholds) {
    const o = {
      ...DEFAULT_NORM_THRESHOLDS,
      ...opts.normThresholds,
      ...opts.experimentParams?.normThresholds,
    };
    return new SocialGraph(o);
  }
  return new SocialGraph(DEFAULT_NORM_THRESHOLDS);
}

function mergeOpts(opts: CreateSimOptions): CreateSimOptions {
  const ep = opts.experimentParams;
  return {
    ...opts,
    seed: opts.seed ?? ep?.seed ?? "42",
    scenario: opts.scenario ?? ep?.scenario,
    storehouseFood: opts.storehouseFood ?? ep?.storehouseFood,
    woodsFood: opts.woodsFood ?? ep?.woodsFood,
    initialGranary: opts.initialGranary ?? ep?.initialGranary,
    freeRiderCount: opts.freeRiderCount ?? ep?.freeRiderCount,
    testNormThresholds: opts.testNormThresholds ?? ep?.testNormThresholds,
    normThresholds: opts.normThresholds ?? ep?.normThresholds,
    label: opts.label ?? ep?.label,
  };
}

export function createSimulation(opts: CreateSimOptions): TickOrchestrator {
  const o = mergeOpts(opts);
  const scenarioId = o.scenario ?? "solo-cabin";
  const llm = o.llm ?? createLlmFromEnv();
  const seed: Seed = {
    value: String(o.seed),
    label: o.label ?? scenarioId,
  };
  const social = socialFrom(o);
  const food = foodOptsFrom(o);

  if (scenarioId === "solo-cabin") {
    const agentId = o.agentId ?? "agent-alice";
    const world = new WorldAuthority(createSoloCabinWorld(agentId, food));
    const agent = createAgentState(agentId, "Alice", "cabin");
    return new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [agentId]: agent },
      cognition: new RuleCognitiveEngine({ llm, roleHint: "neutral" }),
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
    });
  }

  if (scenarioId === "dyad-cabin") {
    const aliceId = "agent-alice";
    const bobId = "agent-bob";
    const world = new WorldAuthority(createDyadCabinWorld(aliceId, bobId, food));
    const alice = createAgentState(aliceId, "Alice", "cabin");
    const bob = createAgentState(bobId, "Bob", "cabin");
    return new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [aliceId]: alice, [bobId]: bob },
      cognitionFactory: (id) =>
        new RuleCognitiveEngine({
          llm,
          roleHint: id === aliceId ? "promisor" : "promisee",
        }),
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
    });
  }

  if (scenarioId === "trio-cabin") {
    const aliceId = "agent-alice";
    const bobId = "agent-bob";
    const carolId = "agent-carol";
    const world = new WorldAuthority(
      createTrioCabinWorld(aliceId, bobId, carolId, food),
    );
    const alice = createAgentState(aliceId, "Alice", "cabin");
    const bob = createAgentState(bobId, "Bob", "cabin");
    const carol = createAgentState(carolId, "Carol", "woods");
    bob.needs.hunger = 0.55;
    carol.needs.hunger = 0.4;
    return new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [aliceId]: alice, [bobId]: bob, [carolId]: carol },
      cognitionFactory: (id) => {
        const role =
          id === aliceId
            ? "cooperative"
            : id === bobId
              ? "grabber"
              : "neutral";
        return new RuleCognitiveEngine({ llm, roleHint: role });
      },
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
    });
  }

  if (scenarioId === "commons-cabin") {
    const aliceId = "agent-alice";
    const bobId = "agent-bob";
    const carolId = "agent-carol";
    const freeN = o.freeRiderCount ?? 1;
    const world = new WorldAuthority(
      createCommonsCabinWorld(aliceId, bobId, carolId, {
        ...food,
        initialGranary: o.initialGranary,
      }),
    );
    const alice = createAgentState(aliceId, "Alice", "cabin");
    const bob = createAgentState(bobId, "Bob", "cabin");
    const carol = createAgentState(carolId, "Carol", "woods");
    alice.identitySummary = "Alice, contributes to the shared granary";
    bob.identitySummary =
      freeN >= 1
        ? "Bob, free-rides on public stock"
        : "Bob, tries to cooperate";
    carol.identitySummary =
      freeN >= 2
        ? "Carol, free-rides on public stock"
        : "Carol, balanced worker";
    bob.needs.hunger = 0.5;
    carol.needs.hunger = 0.35;

    const roleFor = (id: string): "cooperative" | "free_rider" | "neutral" => {
      if (id === aliceId) return "cooperative";
      if (id === bobId) return freeN >= 1 ? "free_rider" : "cooperative";
      if (id === carolId) return freeN >= 2 ? "free_rider" : "neutral";
      return "neutral";
    };

    return new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [aliceId]: alice, [bobId]: bob, [carolId]: carol },
      cognitionFactory: (id) =>
        new RuleCognitiveEngine({ llm, roleHint: roleFor(id) }),
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
    });
  }

  throw new Error(`unknown scenario ${scenarioId}`);
}

export function createSoloCabinSimulation(opts: CreateSimOptions): TickOrchestrator {
  return createSimulation({ ...opts, scenario: "solo-cabin" });
}
export function createDyadCabinSimulation(opts: CreateSimOptions): TickOrchestrator {
  return createSimulation({ ...opts, scenario: "dyad-cabin" });
}
export function createTrioCabinSimulation(opts: CreateSimOptions): TickOrchestrator {
  return createSimulation({ ...opts, scenario: "trio-cabin" });
}
export function createCommonsCabinSimulation(
  opts: CreateSimOptions,
): TickOrchestrator {
  return createSimulation({ ...opts, scenario: "commons-cabin" });
}
