import type { TickOrchestrator } from "@gss/runtime";
import type { ExperimentParams } from "./params.js";
import { computeRunMetrics, type RunMetrics } from "./metrics.js";

export type HighlightKind =
  | "conflict"
  | "policy_passed"
  | "norm_emerged"
  | "promise_broken"
  | "public_good_shift"
  | "injection";

export interface NarrativeHighlight {
  id: string;
  kind: HighlightKind;
  tick: number;
  day?: number;
  summary: string;
  agentIds?: string[];
  refs?: {
    proposalId?: string;
    eventType?: string;
    metricKey?: string;
  };
}

/** Minimal timeline row (compatible with ControlRoom TimelineEvent). */
export interface HighlightTimelineItem {
  tick: number;
  type: string;
  actor?: string;
  summary: string;
  refs?: string[];
}

export interface HighlightProposal {
  id: string;
  status: string;
  author?: string;
  createdTick?: number;
  resolvedTick?: number;
  patch?: Record<string, unknown>;
}

export interface HighlightInput {
  proposals?: HighlightProposal[];
  timeline?: HighlightTimelineItem[];
  /** lines: tick:actor:verb:OK|REJECT:code */
  actionSequence?: string[];
  metrics?: Pick<RunMetrics, "social" | "publicGoods" | "policy"> | {
    social?: {
      emergentNormCount?: number;
      promiseBroken?: number;
    };
    publicGoods?: {
      freeRideWithdrawals?: number;
      publicStock?: number;
    };
    policy?: { proposalsPassed?: number };
  };
  ticksPerDay?: number;
}

/** Social/resource conflict signals (not generic scenario errors like UNKNOWN_TARGET). */
const CONFLICT_CODES = new Set([
  "INSUFFICIENT_RESOURCE",
  "MUTEX",
  "NOT_ALLOWED",
  "OUT_OF_RANGE",
]);

const CONFLICT_RE =
  /INSUFFICIENT_RESOURCE|MUTEX|NOT_ALLOWED|OUT_OF_RANGE|\btheft\b|\bsteal\b/i;

/**
 * Pure rule-based narrative highlight detector (no LLM).
 * Same input → same output (stable ids from content).
 */
export function detectHighlights(input: HighlightInput): NarrativeHighlight[] {
  const out: NarrativeHighlight[] = [];
  const ticksPerDay = input.ticksPerDay ?? 4;
  const dayOf = (tick: number) => Math.floor(tick / ticksPerDay);

  // 1) policy_passed from proposals
  for (const p of input.proposals ?? []) {
    if (p.status !== "passed") continue;
    const tick = p.resolvedTick ?? p.createdTick ?? 0;
    const patchKeys = p.patch ? Object.keys(p.patch).join(",") : "";
    out.push({
      id: `hl-policy-${p.id}`,
      kind: "policy_passed",
      tick,
      day: dayOf(tick),
      summary: `Policy ${p.id} passed${patchKeys ? ` (${patchKeys})` : ""}`,
      agentIds: p.author ? [p.author] : undefined,
      refs: { proposalId: p.id, eventType: "policy.passed" },
    });
  }

  // 2) conflict from action sequence
  const seenConflictKeys = new Set<string>();
  for (const line of input.actionSequence ?? []) {
    const parts = line.split(":");
    if (parts.length < 5 || parts[3] !== "REJECT") continue;
    const code = parts[4] ?? "";
    if (!CONFLICT_CODES.has(code) && !CONFLICT_RE.test(line)) continue;
    const tick = Number(parts[0]);
    const actor = parts[1] ?? "unknown";
    const verb = parts[2] ?? "action";
    const key = `${tick}:${actor}:${verb}:${code}`;
    if (seenConflictKeys.has(key)) continue;
    seenConflictKeys.add(key);
    out.push({
      id: `hl-conflict-${tick}-${actor}-${verb}-${code}`,
      kind: "conflict",
      tick: Number.isFinite(tick) ? tick : 0,
      day: dayOf(Number.isFinite(tick) ? tick : 0),
      summary: `${actor} conflict: ${verb} rejected (${code})`,
      agentIds: [actor],
      refs: { eventType: "action.rejected", metricKey: code },
    });
  }

  // 3) conflict from timeline only when summary/code matches resource/social conflict signals
  for (const ev of input.timeline ?? []) {
    if (ev.type.startsWith("inject.")) continue;
    if (ev.type.includes("policy") || /policy.*pass/i.test(ev.summary)) continue;
    if (!CONFLICT_RE.test(ev.summary) && !CONFLICT_RE.test(ev.type)) continue;
    const actor = ev.actor ?? "unknown";
    const key = `tl:${ev.tick}:${actor}:${ev.summary}`;
    if (seenConflictKeys.has(key)) continue;
    // de-dupe against sequence-derived conflicts for same tick/actor
    const loose = `${ev.tick}:${actor}`;
    if ([...seenConflictKeys].some((k) => k.startsWith(loose))) continue;
    seenConflictKeys.add(key);
    out.push({
      id: `hl-conflict-tl-${ev.tick}-${hashShort(ev.summary)}`,
      kind: "conflict",
      tick: ev.tick,
      day: dayOf(ev.tick),
      summary: ev.summary.slice(0, 120),
      agentIds: ev.actor ? [ev.actor] : undefined,
      refs: { eventType: ev.type },
    });
  }

  // 4) injection from timeline
  for (const ev of input.timeline ?? []) {
    if (!ev.type.startsWith("inject.")) continue;
    out.push({
      id: `hl-inject-${ev.tick}-${hashShort(ev.summary)}`,
      kind: "injection",
      tick: ev.tick,
      day: dayOf(ev.tick),
      summary: `Injection: ${ev.summary.slice(0, 100)}`,
      refs: { eventType: ev.type },
    });
  }

  // 5) norm_emerged / promise_broken from metrics (summary-level)
  const social = input.metrics?.social;
  if (social && (social.emergentNormCount ?? 0) > 0) {
    out.push({
      id: "hl-norm-emerged",
      kind: "norm_emerged",
      tick: 0,
      day: 0,
      summary: `Emergent norms detected: count=${social.emergentNormCount}`,
      refs: { metricKey: "emergentNormCount", eventType: "norm.emerged" },
    });
  }
  if (social && (social.promiseBroken ?? 0) > 0) {
    out.push({
      id: "hl-promise-broken",
      kind: "promise_broken",
      tick: 0,
      day: 0,
      summary: `Promises broken: ${social.promiseBroken}`,
      refs: { metricKey: "promiseBroken", eventType: "promise.broken" },
    });
  }

  // stable sort: tick then kind then id
  out.sort(
    (a, b) =>
      a.tick - b.tick ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id),
  );
  return out;
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).slice(0, 8);
}

/** Collect highlights from a finished orchestrator snapshot. */
export function detectHighlightsFromOrch(
  orch: TickOrchestrator,
  params?: ExperimentParams,
): NarrativeHighlight[] {
  const proposals = orch.getSocial().policy.list().map((p) => ({
    id: p.id,
    status: p.status,
    author: p.author,
    createdTick: p.createdTick,
    resolvedTick: p.resolvedTick,
    patch: p.patch as Record<string, unknown>,
  }));
  const actionSequence = orch.getActionSequence();
  const ticksPerDay = orch.getClock().ticksPerDay;
  let metrics: HighlightInput["metrics"];
  if (params) {
    const m = computeRunMetrics(orch, params);
    metrics = {
      social: m.social,
      publicGoods: m.publicGoods,
      policy: m.policy,
    };
  } else {
    metrics = {
      social: {
        emergentNormCount: orch.getSocial().emergentNormCount(),
        promiseBroken: orch.getSocial().listPromises().filter((p) => p.status === "broken").length,
      },
    };
  }
  // Action sequence is the primary conflict source; no synthetic timeline needed.
  return detectHighlights({
    proposals,
    actionSequence,
    metrics,
    ticksPerDay,
  });
}

export function countHighlightsByKind(
  highlights: NarrativeHighlight[],
): Record<string, number> {
  const c: Record<string, number> = {};
  for (const h of highlights) {
    c[h.kind] = (c[h.kind] ?? 0) + 1;
  }
  return c;
}
