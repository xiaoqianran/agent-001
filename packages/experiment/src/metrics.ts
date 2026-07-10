import type { AgentState } from "@gss/agent";
import type { TickOrchestrator } from "@gss/runtime";
import type { ExperimentParams } from "./params.js";
import { paramsToRecord } from "./params.js";

export interface RunMetrics {
  meta: {
    seed: string;
    scenario: string;
    days: number;
    label?: string;
    params: Record<string, unknown>;
    finalTick: number;
    finalDay: number;
  };
  totals: { totalFood: number; agentCount: number; poolFood: number; invFood: number };
  inequality: { foodGini: number };
  wellbeing: { meanHunger: number; maxHunger: number };
  actions: {
    giveOk: number;
    takeOk: number;
    workOk: number;
    contributeOk: number;
    withdrawPublicOk: number;
  };
  social: {
    emergentNormCount: number;
    promiseKept: number;
    promiseBroken: number;
    promisePending: number;
  };
  /** GOAL-005 public goods */
  publicGoods: {
    publicStock: number;
    totalContributed: number;
    freeRideWithdrawals: number;
    granaryLevel: number;
  };
}

/** Gini coefficient for non-negative values; 0 if empty or all equal. */
export function foodGini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].map((v) => Math.max(0, v)).sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (2 * (i + 1) - n - 1) * sorted[i]!;
  }
  return acc / (n * sum);
}

export function countActionOk(seq: string[], verb: string): number {
  const needle = `:${verb}:OK`;
  return seq.filter((s) => s.includes(needle)).length;
}

/**
 * Pure-ish metrics from a finished orchestrator snapshot.
 * Does not mutate world/cognition.
 */
export function computeRunMetrics(
  orch: TickOrchestrator,
  params: ExperimentParams,
): RunMetrics {
  const agents = orch.getSimulationState().agents;
  const agentIds = Object.keys(agents);

  const holdings: number[] = [];
  let invFood = 0;
  for (const id of agentIds) {
    const body = orch.world.getAgent(id);
    const f = body?.inventory?.food ?? 0;
    holdings.push(f);
    invFood += f;
  }

  const resources = orch.world.resourceTotals();
  // pool food is under key "food"; inv under "inv:food"
  const poolFood = resources.food ?? 0;
  // resourceTotals already includes inv:food separately; totalFood = pool + inv
  const totalFood = poolFood + invFood;

  const hungers = agentIds.map((id) => agents[id]!.needs.hunger);
  const meanHunger =
    hungers.length === 0
      ? 0
      : hungers.reduce((a, b) => a + b, 0) / hungers.length;
  const maxHunger = hungers.length === 0 ? 0 : Math.max(...hungers);

  const seq = orch.getActionSequence();
  const promises = orch.getSocial().listPromises();
  const granary = orch.world.getPublicGood("granary");
  const publicStock = granary?.stock ?? 0;
  // totalFood should include public stock for macro accounting
  const totalFoodAll = totalFood + publicStock;

  const clock = orch.getClock();
  return {
    meta: {
      seed: params.seed,
      scenario: params.scenario,
      days: params.days,
      label: params.label,
      params: paramsToRecord(params),
      finalTick: clock.tick,
      finalDay: clock.day,
    },
    totals: {
      totalFood: totalFoodAll,
      agentCount: agentIds.length,
      poolFood,
      invFood,
    },
    inequality: { foodGini: foodGini(holdings) },
    wellbeing: { meanHunger, maxHunger },
    actions: {
      giveOk: countActionOk(seq, "give"),
      takeOk: countActionOk(seq, "take"),
      workOk: countActionOk(seq, "work"),
      contributeOk: countActionOk(seq, "contribute"),
      withdrawPublicOk: countActionOk(seq, "withdraw_public"),
    },
    social: {
      emergentNormCount: orch.getSocial().emergentNormCount(),
      promiseKept: promises.filter((p) => p.status === "kept").length,
      promiseBroken: promises.filter((p) => p.status === "broken").length,
      promisePending: promises.filter((p) => p.status === "pending").length,
    },
    publicGoods: {
      publicStock,
      totalContributed: granary?.totalContributed ?? 0,
      freeRideWithdrawals: granary?.totalWithdrawn ?? 0,
      granaryLevel: granary?.level ?? 0,
    },
  };
}

/** For unit tests without full orchestrator — inventory holdings + pool. */
export function computeFoodTotalsFromParts(
  poolFood: number,
  agentFood: number[],
): { totalFood: number; foodGini: number } {
  const inv = agentFood.reduce((a, b) => a + b, 0);
  return { totalFood: poolFood + inv, foodGini: foodGini(agentFood) };
}

export function metricsFromAgentsOnly(
  agents: Record<string, AgentState>,
  poolFood: number,
  actionSeq: string[],
  social: {
    emergentNormCount: number;
    promiseKept: number;
    promiseBroken: number;
    promisePending: number;
  },
  params: ExperimentParams,
  finalTick: number,
  finalDay: number,
): RunMetrics {
  const ids = Object.keys(agents);
  const holdings = ids.map((id) => 0); // without world body — tests pass holdings via gini helper
  void holdings;
  const hungers = ids.map((id) => agents[id]!.needs.hunger);
  return {
    meta: {
      seed: params.seed,
      scenario: params.scenario,
      days: params.days,
      label: params.label,
      params: paramsToRecord(params),
      finalTick,
      finalDay,
    },
    totals: {
      totalFood: poolFood,
      agentCount: ids.length,
      poolFood,
      invFood: 0,
    },
    inequality: { foodGini: 0 },
    wellbeing: {
      meanHunger:
        hungers.length === 0
          ? 0
          : hungers.reduce((a, b) => a + b, 0) / hungers.length,
      maxHunger: hungers.length === 0 ? 0 : Math.max(...hungers),
    },
    actions: {
      giveOk: countActionOk(actionSeq, "give"),
      takeOk: countActionOk(actionSeq, "take"),
      workOk: countActionOk(actionSeq, "work"),
      contributeOk: countActionOk(actionSeq, "contribute"),
      withdrawPublicOk: countActionOk(actionSeq, "withdraw_public"),
    },
    social,
    publicGoods: {
      publicStock: 0,
      totalContributed: 0,
      freeRideWithdrawals: 0,
      granaryLevel: 0,
    },
  };
}
