import fs from "node:fs";
import path from "node:path";
import type { CheckpointBundle } from "@gss/contracts";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { computeFingerprint } from "@gss/runtime";
import {
  computeRunMetrics,
  compareParams,
  type ExperimentParams,
  type RunMetrics,
  parseParamPairs,
  mergeParams,
} from "@gss/experiment";
import { createSimulation, type ScenarioId } from "./create.js";

export interface RunOptions {
  scenario: string;
  days: number;
  seed: string;
  checkpointPath?: string;
  logPath?: string;
  metricsOut?: string;
  storehouseFood?: number;
  woodsFood?: number;
  label?: string;
  testNormThresholds?: boolean;
  experimentParams?: ExperimentParams;
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
  metrics?: RunMetrics;
  experimentParams?: Record<string, unknown>;
  checkpointPath?: string;
  logPath?: string;
  metricsPath?: string;
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

  const params: ExperimentParams = opts.experimentParams ?? {
    seed: opts.seed,
    scenario,
    days: opts.days,
    storehouseFood: opts.storehouseFood,
    woodsFood: opts.woodsFood,
    label: opts.label,
    testNormThresholds: opts.testNormThresholds,
  };

  const orch = createSimulation({
    seed: params.seed,
    scenario: params.scenario,
    storehouseFood: params.storehouseFood,
    woodsFood: params.woodsFood,
    testNormThresholds: params.testNormThresholds,
    normThresholds: params.normThresholds,
    label: params.label,
    experimentParams: params,
  });
  const lines: string[] = [];

  const results = await orch.runDays(params.days);
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

  return finalize(orch, { ...opts, days: params.days, seed: params.seed, scenario: params.scenario }, lines, params);
}

function finalize(
  orch: TickOrchestrator,
  opts: {
    days: number;
    seed: string;
    scenario: string;
    checkpointPath?: string;
    logPath?: string;
    metricsOut?: string;
  },
  lines: string[],
  params: ExperimentParams,
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

  const metrics = computeRunMetrics(orch, params);

  let checkpointPath = opts.checkpointPath;
  if (checkpointPath) {
    const abs = path.resolve(checkpointPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const bundle = orch.toCheckpoint(path.basename(abs)) as CheckpointBundle & {
      experimentParams?: Record<string, unknown>;
      metrics?: RunMetrics;
    };
    bundle.experimentParams = metrics.meta.params;
    bundle.metrics = metrics;
    fs.writeFileSync(abs, JSON.stringify(bundle, null, 2));
    checkpointPath = abs;
  }

  let metricsPath: string | undefined;
  if (opts.metricsOut) {
    metricsPath = path.resolve(opts.metricsOut);
    fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
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
    metrics,
    experimentParams: metrics.meta.params,
    checkpointPath,
    logPath,
    metricsPath,
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
  metricsOut?: string;
}): Promise<RunSummary> {
  const raw = fs.readFileSync(path.resolve(opts.checkpointPath), "utf8");
  const bundle = JSON.parse(raw) as CheckpointBundle & {
    experimentParams?: Record<string, unknown>;
  };

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

  const ep = bundle.experimentParams ?? {};
  const params: ExperimentParams = {
    seed: bundle.seed.value,
    scenario: bundle.scenarioId as ScenarioId,
    days: opts.days,
    storehouseFood:
      typeof ep.storehouseFood === "number" ? ep.storehouseFood : undefined,
    woodsFood: typeof ep.woodsFood === "number" ? ep.woodsFood : undefined,
    label: typeof ep.label === "string" ? ep.label : undefined,
  };

  return finalize(
    orch,
    {
      days: opts.days,
      seed: bundle.seed.value,
      scenario: bundle.scenarioId,
      checkpointPath: outCkpt,
      logPath: opts.logPath,
      metricsOut: opts.metricsOut,
    },
    lines,
    params,
  );
}

/** Run experiment params end-to-end and return metrics (shipped path for compare). */
export async function runExperiment(params: ExperimentParams): Promise<RunMetrics> {
  const summary = await runSimulation({
    scenario: params.scenario,
    days: params.days,
    seed: params.seed,
    storehouseFood: params.storehouseFood,
    woodsFood: params.woodsFood,
    label: params.label,
    testNormThresholds: params.testNormThresholds,
    experimentParams: params,
  });
  return summary.metrics!;
}

export async function compareExperimentParams(opts: {
  seed: string;
  scenario: ScenarioId;
  days: number;
  a: Partial<ExperimentParams>;
  b: Partial<ExperimentParams>;
}): Promise<ReturnType<typeof compareParams> extends Promise<infer R> ? R : never> {
  const base: ExperimentParams = {
    seed: opts.seed,
    scenario: opts.scenario,
    days: opts.days,
  };
  return compareParams(base, opts.a, opts.b, runExperiment);
}

export { parseParamPairs, mergeParams, computeRunMetrics, compareParams };
export type { ExperimentParams, RunMetrics };
