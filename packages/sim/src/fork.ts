import fs from "node:fs";
import path from "node:path";
import type { CheckpointBundle } from "@gss/contracts";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator, computeFingerprint } from "@gss/runtime";
import { ControlRoomService } from "@gss/control";
import {
  computeRunMetrics,
  detectHighlightsFromOrch,
  buildCompareReport,
  renderReportMarkdown,
  institutionFromParams,
  normalizeInstitution,
  type ExperimentParams,
  type RunMetrics,
  type NarrativeHighlight,
  type ExperimentReport,
  type ScenarioId,
} from "@gss/experiment";
import { createSimulation } from "./create.js";

export interface ForkInject {
  kind: "resource" | "oracle_message" | "param" | "event";
  payload: Record<string, unknown>;
}

export interface ForkSpec {
  /** in-memory checkpoint or filesystem path */
  parent: CheckpointBundle | string;
  days: number;
  paramPatch?: Partial<ExperimentParams>;
  inject?: ForkInject;
  label?: string;
}

export interface ForkRunResult {
  label: string;
  parentTick: number;
  finalTick: number;
  finalDay: number;
  metrics: RunMetrics;
  checkpoint: CheckpointBundle;
  highlights: NarrativeHighlight[];
  fingerprint: ReturnType<typeof computeFingerprint>;
  params: ExperimentParams;
}

export interface ForkCompareResult {
  parentTick: number;
  a: ForkRunResult;
  b: ForkRunResult;
  report: ExperimentReport;
  markdown: string;
}

function loadParent(parent: CheckpointBundle | string): CheckpointBundle {
  if (typeof parent === "string") {
    const raw = fs.readFileSync(path.resolve(parent), "utf8");
    return JSON.parse(raw) as CheckpointBundle;
  }
  // deep clone so two branches never share mutable state
  return JSON.parse(JSON.stringify(parent)) as CheckpointBundle;
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
      else if (id === "agent-bob")
        role = freeN >= 1 ? "free_rider" : "cooperative";
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

function baseParamsFromBundle(
  bundle: CheckpointBundle,
  days: number,
  patch?: Partial<ExperimentParams>,
): ExperimentParams {
  const ep =
    (bundle as CheckpointBundle & { experimentParams?: Record<string, unknown> })
      .experimentParams ?? {};
  const base: ExperimentParams = {
    seed: bundle.seed.value,
    scenario: bundle.scenarioId as ScenarioId,
    days,
    storehouseFood:
      typeof ep.storehouseFood === "number" ? ep.storehouseFood : undefined,
    woodsFood: typeof ep.woodsFood === "number" ? ep.woodsFood : undefined,
    initialGranary:
      typeof ep.initialGranary === "number" ? ep.initialGranary : undefined,
    freeRiderCount:
      typeof ep.freeRiderCount === "number" ? ep.freeRiderCount : undefined,
    label: typeof ep.label === "string" ? ep.label : undefined,
    enforcementStrength:
      typeof ep.enforcementStrength === "number"
        ? ep.enforcementStrength
        : undefined,
    contributionReward:
      typeof ep.contributionReward === "number"
        ? ep.contributionReward
        : undefined,
    freeRidePenalty:
      typeof ep.freeRidePenalty === "number" ? ep.freeRidePenalty : undefined,
    transparency:
      typeof ep.transparency === "boolean" ? ep.transparency : undefined,
  };
  return {
    ...base,
    ...patch,
    seed: base.seed,
    scenario: base.scenario,
    days,
    label: patch?.label ?? base.label,
  };
}

/**
 * True fork: deserialize parent checkpoint, apply paramPatch/inject via authority, runDays.
 */
export async function forkAndRun(spec: ForkSpec): Promise<ForkRunResult> {
  const parent = loadParent(spec.parent);
  const parentTick = parent.clock.tick;
  const params = baseParamsFromBundle(parent, spec.days, spec.paramPatch);
  const freeN = params.freeRiderCount;
  const factory = cognitionFactoryFor(parent.scenarioId, freeN);
  const orch = TickOrchestrator.fromCheckpoint(parent, undefined, factory);

  // institution via World/Runtime authority path
  const inst = normalizeInstitution(institutionFromParams(params));
  orch.applyInstitution(inst);

  if (spec.inject) {
    const cr = new ControlRoomService(orch);
    // keep ControlRoom institution in sync when inject kind=param
    cr.setInstitution(inst);
    cr.inject({
      kind: spec.inject.kind,
      payload: spec.inject.payload,
    });
  }

  // Baselines so branch metrics reflect post-fork activity only
  // (parent history is shared and would cancel A/B contrast).
  const seqBaseline = orch.getActionSequence().length;
  const g0 = orch.world.getPublicGood("granary");
  const withdrawn0 = g0?.totalWithdrawn ?? 0;
  const contributed0 = g0?.totalContributed ?? 0;

  const startTick = orch.getClock().tick;
  await orch.runDays(spec.days);
  if (orch.getClock().tick <= startTick) {
    throw new Error("fork clock did not advance");
  }

  const metrics = computeRunMetrics(orch, params);
  const seqAfter = orch.getActionSequence().slice(seqBaseline);
  const countOk = (verb: string) =>
    seqAfter.filter((s) => s.includes(`:${verb}:OK`)).length;
  metrics.actions = {
    giveOk: countOk("give"),
    takeOk: countOk("take"),
    workOk: countOk("work"),
    contributeOk: countOk("contribute"),
    withdrawPublicOk: countOk("withdraw_public"),
  };
  const g1 = orch.world.getPublicGood("granary");
  metrics.publicGoods = {
    ...metrics.publicGoods,
    freeRideWithdrawals: Math.max(
      0,
      (g1?.totalWithdrawn ?? 0) - withdrawn0,
    ),
    totalContributed: Math.max(
      0,
      (g1?.totalContributed ?? 0) - contributed0,
    ),
  };
  const highlights = detectHighlightsFromOrch(orch, params);
  const agents = orch.getSimulationState().agents;
  const fingerprint = computeFingerprint(
    orch.world,
    agents,
    orch.getClock(),
    orch.getActionSequence(),
    orch.getMemory(),
    orch.getSocial(),
  );
  const label = spec.label ?? params.label ?? "branch";
  const checkpoint = orch.toCheckpoint(`fork-${label}`);
  (
    checkpoint as CheckpointBundle & {
      experimentParams?: Record<string, unknown>;
      forkParentRef?: string;
      branchLabel?: string;
    }
  ).experimentParams = metrics.meta.params;
  (
    checkpoint as CheckpointBundle & { forkParentRef?: string; branchLabel?: string }
  ).forkParentRef = parent.checkpointId;
  (
    checkpoint as CheckpointBundle & { branchLabel?: string }
  ).branchLabel = label;

  return {
    label,
    parentTick,
    finalTick: orch.getClock().tick,
    finalDay: orch.getClock().day,
    metrics,
    checkpoint,
    highlights,
    fingerprint,
    params,
  };
}

export async function forkCompare(args: {
  parent: CheckpointBundle | string;
  days: number;
  a: Partial<ExperimentParams>;
  b: Partial<ExperimentParams>;
  injectA?: ForkInject;
  injectB?: ForkInject;
  title?: string;
}): Promise<ForkCompareResult> {
  // ensure both branches load independent clones of the same parent
  const parentBundle =
    typeof args.parent === "string"
      ? loadParent(args.parent)
      : (JSON.parse(JSON.stringify(args.parent)) as CheckpointBundle);

  const a = await forkAndRun({
    parent: parentBundle,
    days: args.days,
    paramPatch: { ...args.a, label: args.a.label ?? "A" },
    inject: args.injectA,
    label: args.a.label ?? "A",
  });
  const b = await forkAndRun({
    parent: parentBundle,
    days: args.days,
    paramPatch: { ...args.b, label: args.b.label ?? "B" },
    inject: args.injectB,
    label: args.b.label ?? "B",
  });

  const report = buildCompareReport({
    title: args.title,
    scenario: parentBundle.scenarioId,
    seed: parentBundle.seed.value,
    daysAfterFork: args.days,
    parentTick: a.parentTick,
    mode: "fork",
    labelA: a.label,
    labelB: b.label,
    paramsA: a.params,
    paramsB: b.params,
    metricsA: a.metrics,
    metricsB: b.metrics,
    highlightsA: a.highlights,
    highlightsB: b.highlights,
  });
  const markdown = renderReportMarkdown(report);
  return { parentTick: a.parentTick, a, b, report, markdown };
}

/**
 * Warmup then fork: create parent from scenario, checkpoint, then forkCompare.
 * Report meta includes warmupDays.
 */
export async function warmupAndForkCompare(args: {
  scenario: ScenarioId;
  seed: string;
  warmupDays: number;
  days: number;
  a: Partial<ExperimentParams>;
  b: Partial<ExperimentParams>;
  freeRiderCount?: number;
  initialGranary?: number;
  title?: string;
}): Promise<ForkCompareResult & { warmupDays: number }> {
  const orch = createSimulation({
    seed: args.seed,
    scenario: args.scenario,
    freeRiderCount: args.freeRiderCount ?? 2,
    initialGranary: args.initialGranary,
  });
  await orch.runDays(args.warmupDays);
  const parent = orch.toCheckpoint("warmup-parent");
  (
    parent as CheckpointBundle & { experimentParams?: Record<string, unknown> }
  ).experimentParams = {
    seed: args.seed,
    scenario: args.scenario,
    freeRiderCount: args.freeRiderCount ?? 2,
    initialGranary: args.initialGranary,
  };
  const result = await forkCompare({
    parent,
    days: args.days,
    a: args.a,
    b: args.b,
    title: args.title,
  });
  result.report.meta.warmupDays = args.warmupDays;
  result.markdown = renderReportMarkdown(result.report);
  return { ...result, warmupDays: args.warmupDays };
}
