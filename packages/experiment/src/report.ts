import type { ExperimentParams } from "./params.js";
import { paramsToRecord } from "./params.js";
import type { RunMetrics } from "./metrics.js";
import {
  buildCompareResult,
  type CompareResult,
} from "./compare.js";
import type { NarrativeHighlight } from "./highlights.js";
import type { EvidenceChain } from "./explain.js";

export interface ExperimentReport {
  format: "gss-report@1";
  title: string;
  createdAt: string;
  meta: {
    scenario: string;
    seed: string;
    parentTick?: number;
    daysAfterFork: number;
    labelA: string;
    labelB: string;
    warmupDays?: number;
    mode?: "fork" | "compare-params";
  };
  paramsA: Record<string, unknown>;
  paramsB: Record<string, unknown>;
  metricsA: RunMetrics;
  metricsB: RunMetrics;
  diff: CompareResult["diff"] & Record<string, number>;
  notes?: string[];
  highlightsA?: NarrativeHighlight[];
  highlightsB?: NarrativeHighlight[];
  sampleExplains?: EvidenceChain[];
  /** flags from buildCompareResult for template conclusions */
  flags?: {
    bHasMoreFood: boolean;
    bWithdrewMore: boolean;
  };
}

export function buildCompareReport(args: {
  title?: string;
  scenario: string;
  seed: string;
  daysAfterFork: number;
  parentTick?: number;
  warmupDays?: number;
  mode?: "fork" | "compare-params";
  labelA?: string;
  labelB?: string;
  paramsA: Record<string, unknown> | ExperimentParams;
  paramsB: Record<string, unknown> | ExperimentParams;
  metricsA: RunMetrics;
  metricsB: RunMetrics;
  highlightsA?: NarrativeHighlight[];
  highlightsB?: NarrativeHighlight[];
  sampleExplains?: EvidenceChain[];
  extraNotes?: string[];
}): ExperimentReport {
  const cmp = buildCompareResult(args.metricsA, args.metricsB);
  const labelA =
    args.labelA ??
    String(
      (args.paramsA as { label?: string }).label ??
        args.metricsA.meta.label ??
        "A",
    );
  const labelB =
    args.labelB ??
    String(
      (args.paramsB as { label?: string }).label ??
        args.metricsB.meta.label ??
        "B",
    );
  const notes = buildConclusionNotes(cmp, labelA, labelB);
  if (args.extraNotes?.length) notes.push(...args.extraNotes);

  const paramsA =
    "seed" in args.paramsA && "scenario" in args.paramsA
      ? paramsToRecord(args.paramsA as ExperimentParams)
      : { ...(args.paramsA as Record<string, unknown>) };
  const paramsB =
    "seed" in args.paramsB && "scenario" in args.paramsB
      ? paramsToRecord(args.paramsB as ExperimentParams)
      : { ...(args.paramsB as Record<string, unknown>) };

  return {
    format: "gss-report@1",
    title:
      args.title ??
      `Compare ${labelA} vs ${labelB} — ${args.scenario} seed=${args.seed}`,
    createdAt: new Date().toISOString(),
    meta: {
      scenario: args.scenario,
      seed: args.seed,
      parentTick: args.parentTick,
      daysAfterFork: args.daysAfterFork,
      labelA,
      labelB,
      warmupDays: args.warmupDays,
      mode: args.mode,
    },
    paramsA,
    paramsB,
    metricsA: args.metricsA,
    metricsB: args.metricsB,
    diff: { ...cmp.diff },
    notes,
    highlightsA: args.highlightsA,
    highlightsB: args.highlightsB,
    sampleExplains: args.sampleExplains,
    flags: {
      bHasMoreFood: cmp.bHasMoreFood,
      bWithdrewMore: cmp.bWithdrewMore,
    },
  };
}

function buildConclusionNotes(
  cmp: CompareResult,
  labelA: string,
  labelB: string,
): string[] {
  const notes: string[] = [];
  const d = cmp.diff;
  if (d.freeRideWithdrawals !== 0) {
    notes.push(
      d.freeRideWithdrawals < 0
        ? `${labelB} freeRideWithdrawals lower than ${labelA} by ${Math.abs(d.freeRideWithdrawals)}`
        : `${labelB} freeRideWithdrawals higher than ${labelA} by ${d.freeRideWithdrawals}`,
    );
  }
  if (d.totalFood !== 0) {
    notes.push(
      cmp.bHasMoreFood
        ? `${labelB} has more totalFood than ${labelA} (Δ=${d.totalFood.toFixed(1)})`
        : `${labelA} has more totalFood than ${labelB} (Δ=${d.totalFood.toFixed(1)})`,
    );
  }
  if (d.publicStock !== 0) {
    notes.push(
      `publicStock diff (B−A)=${d.publicStock.toFixed(1)}`,
    );
  }
  if (d.totalContributed !== 0) {
    notes.push(
      `totalContributed diff (B−A)=${d.totalContributed}`,
    );
  }
  if (notes.length === 0) {
    notes.push("No material metric delta between A and B on tracked fields.");
  }
  return notes;
}

/** Pure Markdown renderer for gss-report@1 */
export function renderReportMarkdown(report: ExperimentReport): string {
  const m = report.meta;
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push("");
  lines.push(`format: \`${report.format}\``);
  lines.push(`createdAt: ${report.createdAt}`);
  lines.push("");
  lines.push("## Meta");
  lines.push("");
  lines.push(`| field | value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| scenario | ${m.scenario} |`);
  lines.push(`| seed | ${m.seed} |`);
  lines.push(`| labelA | ${m.labelA} |`);
  lines.push(`| labelB | ${m.labelB} |`);
  lines.push(`| daysAfterFork | ${m.daysAfterFork} |`);
  if (m.parentTick !== undefined) {
    lines.push(`| parentTick | ${m.parentTick} |`);
  }
  if (m.warmupDays !== undefined) {
    lines.push(`| warmupDays | ${m.warmupDays} |`);
  }
  if (m.mode) {
    lines.push(`| mode | ${m.mode} |`);
  }
  lines.push("");
  lines.push("## Parameters");
  lines.push("");
  lines.push("### A — " + m.labelA);
  lines.push("```json");
  lines.push(JSON.stringify(report.paramsA, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("### B — " + m.labelB);
  lines.push("```json");
  lines.push(JSON.stringify(report.paramsB, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Metrics & diff (B − A)");
  lines.push("");
  lines.push("| metric | A | B | diff (B−A) |");
  lines.push("| --- | ---: | ---: | ---: |");
  const rows: Array<[string, number, number, number]> = [
    [
      "totalFood",
      report.metricsA.totals.totalFood,
      report.metricsB.totals.totalFood,
      report.diff.totalFood,
    ],
    [
      "meanHunger",
      report.metricsA.wellbeing.meanHunger,
      report.metricsB.wellbeing.meanHunger,
      report.diff.meanHunger,
    ],
    [
      "publicStock",
      report.metricsA.publicGoods.publicStock,
      report.metricsB.publicGoods.publicStock,
      report.diff.publicStock,
    ],
    [
      "freeRideWithdrawals",
      report.metricsA.publicGoods.freeRideWithdrawals,
      report.metricsB.publicGoods.freeRideWithdrawals,
      report.diff.freeRideWithdrawals,
    ],
    [
      "totalContributed",
      report.metricsA.publicGoods.totalContributed,
      report.metricsB.publicGoods.totalContributed,
      report.diff.totalContributed,
    ],
    [
      "foodGini",
      report.metricsA.inequality.foodGini,
      report.metricsB.inequality.foodGini,
      report.diff.foodGini,
    ],
    [
      "emergentNormCount",
      report.metricsA.social.emergentNormCount,
      report.metricsB.social.emergentNormCount,
      report.diff.emergentNormCount,
    ],
  ];
  for (const [name, a, b, d] of rows) {
    lines.push(
      `| ${name} | ${fmt(a)} | ${fmt(b)} | ${fmt(d)} |`,
    );
  }
  lines.push("");
  lines.push("## Conclusion");
  lines.push("");
  for (const n of report.notes ?? []) {
    lines.push(`- ${n}`);
  }
  if (report.highlightsA?.length || report.highlightsB?.length) {
    lines.push("");
    lines.push("## Highlights (sample)");
    lines.push("");
    lines.push(
      `- A count: ${report.highlightsA?.length ?? 0}; B count: ${report.highlightsB?.length ?? 0}`,
    );
    const sample = [
      ...(report.highlightsA ?? []).slice(0, 3).map((h) => `A: [${h.kind}] ${h.summary}`),
      ...(report.highlightsB ?? []).slice(0, 3).map((h) => `B: [${h.kind}] ${h.summary}`),
    ].slice(0, 6);
    for (const s of sample) lines.push(`- ${s}`);
  }
  lines.push("");
  return lines.join("\n");
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
