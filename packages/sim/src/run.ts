import fs from "node:fs";
import path from "node:path";
import type { CheckpointBundle } from "@gss/contracts";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { computeFingerprint } from "@gss/runtime";
import { createSimulation, type ScenarioId } from "./create.js";

export interface RunOptions {
  scenario: string;
  days: number;
  seed: string;
  checkpointPath?: string;
  logPath?: string;
}

export interface RunSummary {
  exitCode: number;
  seed: string;
  scenario: string;
  days: number;
  finalTick: number;
  finalDay: number;
  agentIds: string[];
  places: Record<string, string>;
  fingerprint: ReturnType<typeof computeFingerprint>;
  promiseCount: number;
  memoryCount: number;
  emergentNormCount: number;
  checkpointPath?: string;
  logPath?: string;
  agentId: string;
  placeId: string;
}

export async function runSimulation(opts: RunOptions): Promise<RunSummary> {
  const scenario = opts.scenario as ScenarioId;
  if (
    scenario !== "solo-cabin" &&
    scenario !== "dyad-cabin" &&
    scenario !== "trio-cabin"
  ) {
    throw new Error(`unsupported scenario: ${opts.scenario}`);
  }
  const orch = createSimulation({ seed: opts.seed, scenario });
  const lines: string[] = [];

  const results = await orch.runDays(opts.days);
  for (const r of results) {
    lines.push(
      JSON.stringify({
        type: "tick",
        tick: r.tick,
        day: r.day,
        applied: r.applied,
        rejected: r.rejected,
        faults: r.faults,
      }),
    );
  }

  return finalize(orch, opts, lines);
}

function finalize(
  orch: TickOrchestrator,
  opts: {
    days: number;
    seed: string;
    scenario: string;
    checkpointPath?: string;
    logPath?: string;
  },
  lines: string[],
): RunSummary {
  const agents = orch.getSimulationState().agents;
  const agentIds = Object.keys(agents);
  const places: Record<string, string> = {};
  for (const id of agentIds) {
    places[id] = agents[id]!.placeId;
  }
  const clock = orch.getClock();
  const fingerprint = computeFingerprint(
    orch.world,
    agents,
    clock,
    orch.getActionSequence(),
    orch.getMemory(),
    orch.getSocial(),
  );

  let checkpointPath = opts.checkpointPath;
  if (checkpointPath) {
    const abs = path.resolve(checkpointPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(
      abs,
      JSON.stringify(orch.toCheckpoint(path.basename(abs)), null, 2),
    );
    checkpointPath = abs;
  }

  let logPath = opts.logPath;
  const summary: RunSummary = {
    exitCode: 0,
    seed: opts.seed,
    scenario: opts.scenario,
    days: opts.days,
    finalTick: clock.tick,
    finalDay: clock.day,
    agentIds,
    places,
    fingerprint,
    promiseCount: orch.getSocial().listPromises().length,
    memoryCount: orch.getMemory().count(),
    emergentNormCount: orch.getSocial().emergentNormCount(),
    checkpointPath,
    logPath,
    agentId: agentIds[0]!,
    placeId: places[agentIds[0]!]!,
  };

  lines.push(JSON.stringify({ type: "summary", ...summary }));
  if (logPath) {
    const abs = path.resolve(logPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, lines.join("\n") + "\n");
    summary.logPath = abs;
  }
  return summary;
}

export async function resumeSimulation(opts: {
  checkpointPath: string;
  days: number;
  logPath?: string;
}): Promise<RunSummary> {
  const raw = fs.readFileSync(path.resolve(opts.checkpointPath), "utf8");
  const bundle = JSON.parse(raw) as CheckpointBundle;

  const factory =
    bundle.scenarioId === "dyad-cabin"
      ? (id: string) =>
          new RuleCognitiveEngine({
            roleHint: id === "agent-alice" ? "promisor" : "promisee",
          })
      : bundle.scenarioId === "trio-cabin"
        ? (id: string) =>
            new RuleCognitiveEngine({
              roleHint:
                id === "agent-alice"
                  ? "cooperative"
                  : id === "agent-bob"
                    ? "grabber"
                    : "neutral",
            })
        : undefined;

  const orch = TickOrchestrator.fromCheckpoint(bundle, undefined, factory);
  const startTick = orch.getClock().tick;

  const results = await orch.runDays(opts.days);
  const lines = results.map((r) =>
    JSON.stringify({
      type: "tick",
      tick: r.tick,
      day: r.day,
      applied: r.applied,
      rejected: r.rejected,
      faults: r.faults,
    }),
  );

  if (orch.getClock().tick <= startTick) {
    throw new Error("clock did not advance on resume");
  }

  const outCkpt =
    opts.checkpointPath.replace(/\.json$/, "") + ".resumed.json";
  fs.writeFileSync(
    outCkpt,
    JSON.stringify(orch.toCheckpoint(path.basename(outCkpt)), null, 2),
  );

  return finalize(
    orch,
    {
      days: opts.days,
      seed: bundle.seed.value,
      scenario: bundle.scenarioId,
      checkpointPath: outCkpt,
      logPath: opts.logPath,
    },
    lines,
  );
}
