import type { Seed } from "@gss/contracts";
import {
  createSoloCabinWorld,
  createDyadCabinWorld,
  createTrioCabinWorld,
  WorldAuthority,
} from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { createLlmFromEnv, type LlmPort } from "@gss/llm";
import { SocialGraph, DEFAULT_NORM_THRESHOLDS, TEST_NORM_THRESHOLDS } from "@gss/social";

export type ScenarioId = "solo-cabin" | "dyad-cabin" | "trio-cabin";

export interface CreateSimOptions {
  seed: string;
  scenario?: ScenarioId;
  agentId?: string;
  llm?: LlmPort;
  ticksPerDay?: number;
  /**
   * Use lower norm thresholds (documented test knobs).
   * Production trio runs leave this false; fixtures set true when needed.
   */
  testNormThresholds?: boolean;
}

export function createSimulation(opts: CreateSimOptions): TickOrchestrator {
  const scenarioId = opts.scenario ?? "solo-cabin";
  const llm = opts.llm ?? createLlmFromEnv();
  const seed: Seed = { value: String(opts.seed), label: scenarioId };
  const social = new SocialGraph(
    opts.testNormThresholds ? TEST_NORM_THRESHOLDS : DEFAULT_NORM_THRESHOLDS,
  );

  if (scenarioId === "solo-cabin") {
    const agentId = opts.agentId ?? "agent-alice";
    const world = new WorldAuthority(createSoloCabinWorld(agentId));
    const agent = createAgentState(agentId, "Alice", "cabin");
    return new TickOrchestrator({
      world,
      seed,
      scenarioId,
      agentStates: { [agentId]: agent },
      cognition: new RuleCognitiveEngine({ llm, roleHint: "neutral" }),
      social,
      ticksPerDay: opts.ticksPerDay ?? 24,
    });
  }

  if (scenarioId === "dyad-cabin") {
    const aliceId = "agent-alice";
    const bobId = "agent-bob";
    const world = new WorldAuthority(createDyadCabinWorld(aliceId, bobId));
    const alice = createAgentState(aliceId, "Alice", "cabin");
    const bob = createAgentState(bobId, "Bob", "cabin");
    alice.identitySummary = "Alice, cabin host who tends stores";
    bob.identitySummary = "Bob, visitor who needs food help";
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
      ticksPerDay: opts.ticksPerDay ?? 24,
    });
  }

  if (scenarioId === "trio-cabin") {
    const aliceId = "agent-alice";
    const bobId = "agent-bob";
    const carolId = "agent-carol";
    const world = new WorldAuthority(
      createTrioCabinWorld(aliceId, bobId, carolId),
    );
    const alice = createAgentState(aliceId, "Alice", "cabin");
    const bob = createAgentState(bobId, "Bob", "cabin");
    const carol = createAgentState(carolId, "Carol", "woods");
    alice.identitySummary = "Alice, cooperative forager who shares food";
    bob.identitySummary = "Bob, hungry grabber under scarcity";
    carol.identitySummary = "Carol, balanced woods worker";
    // Mild hunger pressure for scarce vignette
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
      ticksPerDay: opts.ticksPerDay ?? 24,
    });
  }

  throw new Error(`unknown scenario ${scenarioId}`);
}

/** @deprecated use createSimulation */
export function createSoloCabinSimulation(
  opts: CreateSimOptions,
): TickOrchestrator {
  return createSimulation({ ...opts, scenario: "solo-cabin" });
}

export function createDyadCabinSimulation(
  opts: CreateSimOptions,
): TickOrchestrator {
  return createSimulation({ ...opts, scenario: "dyad-cabin" });
}

export function createTrioCabinSimulation(
  opts: CreateSimOptions,
): TickOrchestrator {
  return createSimulation({ ...opts, scenario: "trio-cabin" });
}
