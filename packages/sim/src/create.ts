import type { Seed } from "@gss/contracts";
import { createSoloCabinWorld, WorldAuthority } from "@gss/world";
import { createAgentState } from "@gss/agent";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { createLlmFromEnv, type LlmPort } from "@gss/llm";

export interface CreateSimOptions {
  seed: string;
  scenario?: "solo-cabin";
  agentId?: string;
  llm?: LlmPort;
  ticksPerDay?: number;
}

export function createSoloCabinSimulation(opts: CreateSimOptions): TickOrchestrator {
  const agentId = opts.agentId ?? "agent-alice";
  const scenarioId = opts.scenario ?? "solo-cabin";
  if (scenarioId !== "solo-cabin") {
    throw new Error(`unknown scenario ${scenarioId}`);
  }
  const worldState = createSoloCabinWorld(agentId);
  const world = new WorldAuthority(worldState);
  const agent = createAgentState(agentId, "Alice", "cabin");
  const seed: Seed = { value: String(opts.seed), label: scenarioId };
  const llm = opts.llm ?? createLlmFromEnv();
  const cognition = new RuleCognitiveEngine({ llm });
  return new TickOrchestrator({
    world,
    seed,
    scenarioId,
    agentStates: { [agentId]: agent },
    cognition,
    ticksPerDay: opts.ticksPerDay ?? 24,
  });
}
