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
import {
  institutionFromParams,
  normalizeInstitution,
  type ExperimentParams,
  type InstitutionParams,
  type ScenarioId,
} from "@gss/experiment";

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
  institution?: InstitutionParams;
  enforcementStrength?: number;
  contributionReward?: number;
  freeRidePenalty?: number;
  transparency?: boolean;
  lodEdgeSkip?: number;
  focusPlaceIds?: string[];
}

function withInterest(
  orch: TickOrchestrator,
  o: CreateSimOptions,
): TickOrchestrator {
  const lod = o.lodEdgeSkip ?? o.experimentParams?.lodEdgeSkip;
  const focus =
    o.focusPlaceIds ?? o.experimentParams?.focusPlaceIds ?? undefined;
  if ((lod !== undefined && lod > 0) || (focus && focus.length)) {
    orch.setInterest({
      edgeSkipChance: lod ?? 0,
      focusPlaceIds: focus ?? ["cabin"],
    });
  }
  return orch;
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
    enforcementStrength:
      opts.enforcementStrength ?? ep?.enforcementStrength,
    contributionReward: opts.contributionReward ?? ep?.contributionReward,
    freeRidePenalty: opts.freeRidePenalty ?? ep?.freeRidePenalty,
    transparency: opts.transparency ?? ep?.transparency,
    institution: opts.institution ?? ep?.institution,
    lodEdgeSkip: opts.lodEdgeSkip ?? ep?.lodEdgeSkip,
    focusPlaceIds: opts.focusPlaceIds ?? ep?.focusPlaceIds,
  };
}

function resolveInstitution(o: CreateSimOptions): InstitutionParams {
  if (o.experimentParams) {
    return institutionFromParams(o.experimentParams);
  }
  return {
    enforcementStrength: o.enforcementStrength ?? o.institution?.enforcementStrength,
    contributionReward: o.contributionReward ?? o.institution?.contributionReward,
    freeRidePenalty: o.freeRidePenalty ?? o.institution?.freeRidePenalty,
    transparency: o.transparency ?? o.institution?.transparency,
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
  const inst = normalizeInstitution(resolveInstitution(o));

  if (scenarioId === "solo-cabin") {
    const agentId = o.agentId ?? "agent-alice";
    const world = new WorldAuthority(createSoloCabinWorld(agentId, food), inst);
    const agent = createAgentState(agentId, "Alice", "cabin");
    return withInterest(new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [agentId]: agent },
      cognition: new RuleCognitiveEngine({
        llm,
        roleHint: "neutral",
        institution: inst,
      }),
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
      institution: inst,
    }), o);
  }

  if (scenarioId === "dyad-cabin") {
    const aliceId = "agent-alice";
    const bobId = "agent-bob";
    const world = new WorldAuthority(
      createDyadCabinWorld(aliceId, bobId, food),
      inst,
    );
    const alice = createAgentState(aliceId, "Alice", "cabin");
    const bob = createAgentState(bobId, "Bob", "cabin");
    return withInterest(new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [aliceId]: alice, [bobId]: bob },
      cognitionFactory: (id) =>
        new RuleCognitiveEngine({
          llm,
          roleHint: id === aliceId ? "promisor" : "promisee",
          institution: inst,
        }),
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
      institution: inst,
    }), o);
  }

  if (scenarioId === "trio-cabin") {
    const aliceId = "agent-alice";
    const bobId = "agent-bob";
    const carolId = "agent-carol";
    const world = new WorldAuthority(
      createTrioCabinWorld(aliceId, bobId, carolId, food),
      inst,
    );
    const alice = createAgentState(aliceId, "Alice", "cabin");
    const bob = createAgentState(bobId, "Bob", "cabin");
    const carol = createAgentState(carolId, "Carol", "woods");
    bob.needs.hunger = 0.55;
    carol.needs.hunger = 0.4;
    return withInterest(new TickOrchestrator({
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
        return new RuleCognitiveEngine({
          llm,
          roleHint: role,
          institution: inst,
        });
      },
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
      institution: inst,
    }), o);
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
      inst,
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

    return withInterest(new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [aliceId]: alice, [bobId]: bob, [carolId]: carol },
      cognitionFactory: (id) =>
        new RuleCognitiveEngine({
          llm,
          roleHint: roleFor(id),
          institution: inst,
        }),
      social,
      ticksPerDay: o.ticksPerDay ?? 24,
      institution: inst,
    }), o);
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
