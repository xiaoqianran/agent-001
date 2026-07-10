import type { Seed } from "@gss/contracts";
import type { ExperimentParams } from "./params.js";
import type { RunMetrics } from "./metrics.js";

export interface DailyMetricSample {
  day: number;
  totalFood: number;
  publicStock?: number;
  meanHunger: number;
  contributeOk?: number;
  withdrawPublicOk?: number;
}

export interface GssBundleV1 {
  format: "gss-bundle@1";
  createdAt: string;
  experimentParams: ExperimentParams;
  seed: Seed;
  metrics: RunMetrics;
  dailyMetrics?: DailyMetricSample[];
  checkpointRef?: string;
  /** GOAL-006 optional extensions (backward compatible) */
  institutionParams?: import("./institution.js").InstitutionParams;
  timeline?: Array<{
    tick: number;
    type: string;
    actor?: string;
    summary: string;
  }>;
  auditLog?: Array<Record<string, unknown>>;
  /** GOAL-011 optional fork metadata (backward compatible) */
  forkParentRef?: string;
  branchLabel?: string;
}

export function createBundle(args: {
  params: ExperimentParams;
  metrics: RunMetrics;
  dailyMetrics?: DailyMetricSample[];
  checkpointRef?: string;
  institutionParams?: import("./institution.js").InstitutionParams;
  timeline?: GssBundleV1["timeline"];
  auditLog?: GssBundleV1["auditLog"];
  forkParentRef?: string;
  branchLabel?: string;
}): GssBundleV1 {
  return {
    format: "gss-bundle@1",
    createdAt: new Date().toISOString(),
    experimentParams: args.params,
    seed: { value: args.params.seed, label: args.params.label },
    metrics: args.metrics,
    dailyMetrics: args.dailyMetrics,
    checkpointRef: args.checkpointRef,
    institutionParams: args.institutionParams,
    timeline: args.timeline,
    auditLog: args.auditLog,
    forkParentRef: args.forkParentRef,
    branchLabel: args.branchLabel,
  };
}

export function validateBundle(raw: unknown): {
  ok: boolean;
  errors: string[];
  bundle?: GssBundleV1;
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["not an object"] };
  }
  const b = raw as Record<string, unknown>;
  if (b.format !== "gss-bundle@1") errors.push("format must be gss-bundle@1");
  if (!b.experimentParams || typeof b.experimentParams !== "object") {
    errors.push("missing experimentParams");
  }
  if (!b.seed || typeof b.seed !== "object") errors.push("missing seed");
  if (!b.metrics || typeof b.metrics !== "object") errors.push("missing metrics");
  const m = b.metrics as Record<string, unknown> | undefined;
  if (m && !m.publicGoods) errors.push("metrics.publicGoods required for GOAL-005");
  if (m && !m.totals) errors.push("metrics.totals required");
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], bundle: b as unknown as GssBundleV1 };
}

export function inspectBundleSummary(bundle: GssBundleV1): string {
  const lines = [
    `format: ${bundle.format}`,
    `seed: ${bundle.seed.value}`,
    `scenario: ${bundle.experimentParams.scenario}`,
    `days: ${bundle.experimentParams.days}`,
    `label: ${bundle.experimentParams.label ?? "-"}`,
    `totalFood: ${bundle.metrics.totals.totalFood}`,
    `publicStock: ${bundle.metrics.publicGoods.publicStock}`,
    `contributed: ${bundle.metrics.publicGoods.totalContributed}`,
    `withdrawals: ${bundle.metrics.publicGoods.freeRideWithdrawals}`,
    `dailyPoints: ${bundle.dailyMetrics?.length ?? 0}`,
  ];
  return lines.join("\n");
}
