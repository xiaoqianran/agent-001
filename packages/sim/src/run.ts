import fs from "node:fs";
import path from "node:path";
import type { CheckpointBundle } from "@gss/contracts";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { computeFingerprint } from "@gss/runtime";
import {
  computeRunMetrics,
  compareParams,
  createBundle,
  validateBundle,
  inspectBundleSummary,
  renderDailyBrief,
  detectHighlights,
  detectHighlightsFromOrch,
  countHighlightsByKind,
  explain,
  explainFromOrch,
  snapshotFromOrch,
  buildCompareReport,
  renderReportMarkdown,
  type ExperimentParams,
  type RunMetrics,
  type DailyMetricSample,
  type GssBundleV1,
  type NarrativeHighlight,
  type HighlightKind,
  type HighlightInput,
  type EvidenceChain,
  type ExplainQuery,
  type ExperimentReport,
  parseParamPairs,
  mergeParams,
} from "@gss/experiment";
import { createSimulation, type ScenarioId } from "./create.js";

const SCENARIOS: ScenarioId[] = [
  "solo-cabin",
  "dyad-cabin",
  "trio-cabin",
  "commons-cabin",
  "assembly-cabin",
];
export interface RunOptions {
  scenario: string;
  days: number;
  seed: string;
  checkpointPath?: string;
  logPath?: string;
  metricsOut?: string;
  briefOut?: string;
  highlightsOut?: string;
  storehouseFood?: number;
  woodsFood?: number;
  initialGranary?: number;
  freeRiderCount?: number;
  label?: string;
  testNormThresholds?: boolean;
  experimentParams?: ExperimentParams;
  /** sample metrics at day boundaries for bundle */
  sampleDaily?: boolean;
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
  dailyMetrics?: DailyMetricSample[];
  experimentParams?: Record<string, unknown>;
  checkpointPath?: string;
  logPath?: string;
  metricsPath?: string;
  briefPath?: string;
  highlightsPath?: string;
  highlightCount?: number;
  agentId: string;
  placeId: string;
}

function cognitionFactoryFor(
  scenarioId: string,
  freeRiderCount?: number,
): ((id: string) => RuleCognitiveEngine) | undefined {
  if (scenarioId === "dyad-cabin") {
    return (id) =>
      new RuleCognitiveEngine({
        roleHint: id === "agent-alice" ? "promisor" : "promisee",
      });
  }
  if (scenarioId === "trio-cabin") {
    return (id) =>
      new RuleCognitiveEngine({
        roleHint:
          id === "agent-alice"
            ? "cooperative"
            : id === "agent-bob"
              ? "grabber"
              : "neutral",
      });
  }
  if (scenarioId === "commons-cabin" || scenarioId === "assembly-cabin") {
    const freeN = freeRiderCount ?? 1;
    const legis = scenarioId === "assembly-cabin";
    return (id) => {
      let role: "cooperative" | "free_rider" | "neutral" = "neutral";
      if (id === "agent-alice") role = "cooperative";
      else if (id === "agent-bob") role = freeN >= 1 ? "free_rider" : "cooperative";
      else if (id === "agent-carol")
        role =
          scenarioId === "assembly-cabin"
            ? "neutral"
            : freeN >= 2
              ? "free_rider"
              : "neutral";
      return new RuleCognitiveEngine({
        roleHint: role,
        enableLegislature: legis,
      });
    };
  }
  return undefined;
}

function sampleDay(orch: TickOrchestrator, params: ExperimentParams): DailyMetricSample {
  const m = computeRunMetrics(orch, params);
  return {
    day: m.meta.finalDay,
    totalFood: m.totals.totalFood,
    publicStock: m.publicGoods.publicStock,
    meanHunger: m.wellbeing.meanHunger,
    contributeOk: m.actions.contributeOk,
    withdrawPublicOk: m.actions.withdrawPublicOk,
  };
}

export async function runSimulation(opts: RunOptions): Promise<RunSummary> {
  const scenario = opts.scenario as ScenarioId;
  if (!SCENARIOS.includes(scenario)) {
    throw new Error(`unsupported scenario: ${opts.scenario}`);
  }

  const params: ExperimentParams = opts.experimentParams ?? {
    seed: opts.seed,
    scenario,
    days: opts.days,
    storehouseFood: opts.storehouseFood,
    woodsFood: opts.woodsFood,
    initialGranary: opts.initialGranary,
    freeRiderCount: opts.freeRiderCount,
    label: opts.label,
    testNormThresholds: opts.testNormThresholds,
  };

  const orch = createSimulation({
    seed: params.seed,
    scenario: params.scenario,
    storehouseFood: params.storehouseFood,
    woodsFood: params.woodsFood,
    initialGranary: params.initialGranary,
    freeRiderCount: params.freeRiderCount,
    testNormThresholds: params.testNormThresholds,
    normThresholds: params.normThresholds,
    label: params.label,
    experimentParams: params,
    institution: params.institution,
    enforcementStrength: params.enforcementStrength,
    contributionReward: params.contributionReward,
    freeRidePenalty: params.freeRidePenalty,
    transparency: params.transparency,
    lodEdgeSkip: params.lodEdgeSkip,
    focusPlaceIds: params.focusPlaceIds,
  });

  const lines: string[] = [];
  const daily: DailyMetricSample[] = [];
  const sampleDaily = opts.sampleDaily !== false;

  const ticksPerDay = orch.getClock().ticksPerDay;
  const totalTicks = params.days * ticksPerDay;
  let lastDay = -1;
  for (let i = 0; i < totalTicks; i++) {
    const r = await orch.advanceOneTick();
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
    if (sampleDaily && r.day !== lastDay) {
      lastDay = r.day;
      daily.push(sampleDay(orch, { ...params, days: params.days }));
    }
  }

  return finalize(orch, opts, lines, params, daily);
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
    briefOut?: string;
    highlightsOut?: string;
  },
  lines: string[],
  params: ExperimentParams,
  dailyMetrics: DailyMetricSample[] = [],
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

  let briefPath: string | undefined;
  if (opts.briefOut) {
    briefPath = path.resolve(opts.briefOut);
    fs.mkdirSync(path.dirname(briefPath), { recursive: true });
    fs.writeFileSync(briefPath, renderDailyBrief(orch, params));
  }

  const highlights: NarrativeHighlight[] = detectHighlightsFromOrch(
    orch,
    params,
  );
  let highlightsPath: string | undefined;
  if (opts.highlightsOut) {
    highlightsPath = path.resolve(opts.highlightsOut);
    fs.mkdirSync(path.dirname(highlightsPath), { recursive: true });
    fs.writeFileSync(highlightsPath, JSON.stringify(highlights, null, 2));
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
    dailyMetrics,
    experimentParams: metrics.meta.params,
    checkpointPath,
    logPath,
    metricsPath,
    briefPath,
    highlightsPath,
    highlightCount: highlights.length,
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

  const freeRiderCount =
    typeof bundle.experimentParams?.freeRiderCount === "number"
      ? bundle.experimentParams.freeRiderCount
      : undefined;
  const factory = cognitionFactoryFor(bundle.scenarioId, freeRiderCount);

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
  const ckptObj = orch.toCheckpoint(path.basename(outCkpt));
  fs.writeFileSync(outCkpt, JSON.stringify(ckptObj, null, 2));

  const ep = bundle.experimentParams ?? {};
  const params: ExperimentParams = {
    seed: bundle.seed.value,
    scenario: bundle.scenarioId as ScenarioId,
    days: opts.days,
    storehouseFood:
      typeof ep.storehouseFood === "number" ? ep.storehouseFood : undefined,
    woodsFood: typeof ep.woodsFood === "number" ? ep.woodsFood : undefined,
    initialGranary:
      typeof ep.initialGranary === "number" ? ep.initialGranary : undefined,
    freeRiderCount:
      typeof ep.freeRiderCount === "number" ? ep.freeRiderCount : undefined,
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

export async function runExperiment(params: ExperimentParams): Promise<RunMetrics> {
  const summary = await runSimulation({
    scenario: params.scenario,
    days: params.days,
    seed: params.seed,
    storehouseFood: params.storehouseFood,
    woodsFood: params.woodsFood,
    initialGranary: params.initialGranary,
    freeRiderCount: params.freeRiderCount,
    label: params.label,
    testNormThresholds: params.testNormThresholds,
    experimentParams: params,
    sampleDaily: false,
  });
  return summary.metrics!;
}

export async function compareExperimentParams(opts: {
  seed: string;
  scenario: ScenarioId;
  days: number;
  a: Partial<ExperimentParams>;
  b: Partial<ExperimentParams>;
}) {
  const base: ExperimentParams = {
    seed: opts.seed,
    scenario: opts.scenario,
    days: opts.days,
  };
  return compareParams(base, opts.a, opts.b, runExperiment);
}

export async function exportBundle(opts: {
  scenario: ScenarioId;
  days: number;
  seed: string;
  out: string;
  storehouseFood?: number;
  woodsFood?: number;
  initialGranary?: number;
  freeRiderCount?: number;
  label?: string;
}): Promise<GssBundleV1> {
  const params: ExperimentParams = {
    seed: opts.seed,
    scenario: opts.scenario,
    days: opts.days,
    storehouseFood: opts.storehouseFood,
    woodsFood: opts.woodsFood,
    initialGranary: opts.initialGranary,
    freeRiderCount: opts.freeRiderCount,
    label: opts.label,
  };
  const summary = await runSimulation({
    ...opts,
    experimentParams: params,
    sampleDaily: true,
  });
  const bundle = createBundle({
    params,
    metrics: summary.metrics!,
    dailyMetrics: summary.dailyMetrics,
    checkpointRef: summary.checkpointPath,
  });
  const abs = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(bundle, null, 2));
  return bundle;
}

export function inspectBundleFile(inPath: string): string {
  const raw = JSON.parse(fs.readFileSync(path.resolve(inPath), "utf8"));
  const v = validateBundle(raw);
  if (!v.ok) {
    throw new Error(`invalid bundle: ${v.errors.join("; ")}`);
  }
  return inspectBundleSummary(v.bundle!);
}

export {
  parseParamPairs,
  mergeParams,
  computeRunMetrics,
  compareParams,
  validateBundle,
  createBundle,
  renderDailyBrief,
  detectHighlights,
  detectHighlightsFromOrch,
  countHighlightsByKind,
  explain,
  explainFromOrch,
  snapshotFromOrch,
  buildCompareReport,
  renderReportMarkdown,
};
export type {
  ExperimentParams,
  RunMetrics,
  GssBundleV1,
  DailyMetricSample,
  NarrativeHighlight,
  HighlightKind,
  HighlightInput,
  EvidenceChain,
  ExplainQuery,
  ExperimentReport,
};
