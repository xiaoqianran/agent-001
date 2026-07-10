import type { ExperimentParams } from "./params.js";
import { mergeParams } from "./params.js";
import type { RunMetrics } from "./metrics.js";

export interface CompareResult {
  a: RunMetrics;
  b: RunMetrics;
  diff: {
    totalFood: number;
    foodGini: number;
    meanHunger: number;
    emergentNormCount: number;
    giveOk: number;
    takeOk: number;
    publicStock: number;
    freeRideWithdrawals: number;
    totalContributed: number;
  };
  /** true if b.totalFood > a.totalFood (e.g. abundant > scarce) */
  bHasMoreFood: boolean;
  /** true if free-ride condition withdrew more than cooperative (when a=coop, b=free) */
  bWithdrewMore: boolean;
}

export function diffMetrics(a: RunMetrics, b: RunMetrics): CompareResult["diff"] {
  return {
    totalFood: b.totals.totalFood - a.totals.totalFood,
    foodGini: b.inequality.foodGini - a.inequality.foodGini,
    meanHunger: b.wellbeing.meanHunger - a.wellbeing.meanHunger,
    emergentNormCount:
      b.social.emergentNormCount - a.social.emergentNormCount,
    giveOk: b.actions.giveOk - a.actions.giveOk,
    takeOk: b.actions.takeOk - a.actions.takeOk,
    publicStock:
      b.publicGoods.publicStock - a.publicGoods.publicStock,
    freeRideWithdrawals:
      b.publicGoods.freeRideWithdrawals - a.publicGoods.freeRideWithdrawals,
    totalContributed:
      b.publicGoods.totalContributed - a.publicGoods.totalContributed,
  };
}

export function buildCompareResult(a: RunMetrics, b: RunMetrics): CompareResult {
  const diff = diffMetrics(a, b);
  return {
    a,
    b,
    diff,
    bHasMoreFood: b.totals.totalFood > a.totals.totalFood,
    bWithdrewMore:
      b.publicGoods.freeRideWithdrawals > a.publicGoods.freeRideWithdrawals,
  };
}

export type RunFn = (params: ExperimentParams) => Promise<RunMetrics>;

/**
 * Same seed/days/scenario; only param overrides differ.
 * Caller supplies runFn that executes pure-rule sim and returns metrics.
 */
export async function compareParams(
  base: ExperimentParams,
  overrideA: Partial<ExperimentParams>,
  overrideB: Partial<ExperimentParams>,
  runFn: RunFn,
): Promise<CompareResult> {
  const aParams = mergeParams(base, { ...overrideA, label: overrideA.label ?? "A" });
  const bParams = mergeParams(base, { ...overrideB, label: overrideB.label ?? "B" });
  // force same seed/days/scenario from base
  aParams.seed = base.seed;
  bParams.seed = base.seed;
  aParams.days = base.days;
  bParams.days = base.days;
  aParams.scenario = base.scenario;
  bParams.scenario = base.scenario;

  const a = await runFn(aParams);
  const b = await runFn(bParams);
  return buildCompareResult(a, b);
}
