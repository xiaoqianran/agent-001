import type { Seed } from "@gss/contracts";
import {
  createSoloCabinWorld,
  createDyadCabinWorld,
  WorldAuthority,
} from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { createLlmFromEnv, type LlmPort } from "@gss/llm";

export type ScenarioId = "solo-cabin" | "dyad-cabin";

export interface CreateSimOptions {
  seed: string;
  scenario?: ScenarioId;
  agentId?: string;
  llm?: LlmPort;
  ticksPerDay?: number;
}

export function createSimulation(opts: CreateSimOptions): TickOrchestrator {
  const scenarioId = opts.scenario ?? "solo-cabin";
  const llm = opts.llm ?? createLlmFromEnv();
  const seed: Seed = { value: String(opts.seed), label: scenarioId };

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
