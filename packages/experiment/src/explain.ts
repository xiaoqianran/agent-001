import type { DecisionTrace } from "@gss/contracts";
import type { TickOrchestrator } from "@gss/runtime";
import type { NarrativeHighlight } from "./highlights.js";
import { detectHighlightsFromOrch } from "./highlights.js";

export type EvidenceLinkKind =
  | "decision_trace"
  | "action_sequence"
  | "domain_event"
  | "memory"
  | "proposal"
  | "institution"
  | "highlight"
  | "world_snapshot";

export interface EvidenceLink {
  kind: EvidenceLinkKind;
  ref: string;
  tick?: number;
  summary: string;
}

export interface EvidenceTraceProjection {
  agentId: string;
  tick: number;
  dominantNeeds: string[];
  optionsTop: Array<{
    verb?: string;
    score: number;
    rejectReason?: string;
  }>;
  chosen?: string;
  retrievedMemoryIds: string[];
  attended: Array<{ kind: string; salience: number; ref?: string }>;
}

export interface EvidenceChain {
  query: {
    key: string;
    tick?: number;
    agentId?: string;
    eventType?: string;
    proposalId?: string;
    actionLine?: string;
    highlightId?: string;
    highlightKind?: string;
  };
  found: boolean;
  summary: string;
  links: EvidenceLink[];
  trace?: EvidenceTraceProjection;
}

export interface ExplainQuery {
  tick?: number;
  agentId?: string;
  proposalId?: string;
  /** full sequence line or substring to match */
  actionLine?: string;
  highlightId?: string;
  /** first highlight of this kind (e.g. conflict, policy_passed) */
  highlightKind?: string;
}

export interface ExplainProposal {
  id: string;
  status: string;
  author?: string;
  createdTick?: number;
  resolvedTick?: number;
  patch?: Record<string, unknown>;
  votes?: Record<string, string>;
  placeId?: string;
}

export interface ExplainSnapshot {
  traces: DecisionTrace[];
  actionSequence: string[];
  proposals?: ExplainProposal[];
  highlights?: NarrativeHighlight[];
  institution?: Record<string, unknown>;
  /** optional memory digests by id */
  memories?: Array<{ id: string; summary?: string; agentId?: string }>;
  worldSummary?: string;
}

function projectTrace(t: DecisionTrace): EvidenceTraceProjection {
  return {
    agentId: t.agentId,
    tick: t.tick,
    dominantNeeds: [...t.dominantNeeds],
    optionsTop: t.options.slice(0, 5).map((o) => ({
      verb: o.action?.verb,
      score: o.score,
      rejectReason: o.rejectReason,
    })),
    chosen: t.chosen,
    retrievedMemoryIds: [...t.retrievedMemoryIds],
    attended: t.attended.map((a) => ({
      kind: a.kind,
      salience: a.salience,
      ref: a.ref,
    })),
  };
}

function parseActionLine(line: string): {
  tick: number;
  actor: string;
  verb: string;
  outcome: string;
  code?: string;
} | null {
  const parts = line.split(":");
  if (parts.length < 4) return null;
  const tick = Number(parts[0]);
  if (!Number.isFinite(tick)) return null;
  return {
    tick,
    actor: parts[1] ?? "unknown",
    verb: parts[2] ?? "action",
    outcome: parts[3] ?? "",
    code: parts[4],
  };
}

function findTrace(
  traces: DecisionTrace[],
  tick: number,
  agentId: string,
): DecisionTrace | undefined {
  // exact tick match preferred; else nearest same agent at or before tick
  const exact = traces.find((t) => t.tick === tick && t.agentId === agentId);
  if (exact) return exact;
  const before = traces
    .filter((t) => t.agentId === agentId && t.tick <= tick)
    .sort((a, b) => b.tick - a.tick);
  return before[0];
}

function sequenceLinesFor(
  seq: string[],
  tick: number,
  agentId?: string,
): string[] {
  return seq.filter((line) => {
    const p = parseActionLine(line);
    if (!p || p.tick !== tick) return false;
    if (agentId && p.actor !== agentId) return false;
    return true;
  });
}

function matchActionLine(
  seq: string[],
  needle: string,
): string | undefined {
  const exact = seq.find((l) => l === needle);
  if (exact) return exact;
  return seq.find((l) => l.includes(needle));
}

function queryKey(q: ExplainQuery): string {
  if (q.highlightKind) return `highlightKind:${q.highlightKind}`;
  if (q.highlightId) return `highlightId:${q.highlightId}`;
  if (q.proposalId) return `proposal:${q.proposalId}`;
  if (q.actionLine) return `actionLine:${q.actionLine}`;
  if (q.tick !== undefined && q.agentId) {
    return `tick:${q.tick}+agent:${q.agentId}`;
  }
  if (q.tick !== undefined) return `tick:${q.tick}`;
  if (q.agentId) return `agent:${q.agentId}`;
  return "empty";
}

function emptyChain(q: ExplainQuery, summary: string): EvidenceChain {
  return {
    query: {
      key: queryKey(q),
      tick: q.tick,
      agentId: q.agentId,
      proposalId: q.proposalId,
      actionLine: q.actionLine,
      highlightId: q.highlightId,
      highlightKind: q.highlightKind,
    },
    found: false,
    summary,
    links: [],
  };
}

function appendMemoryLinks(
  links: EvidenceLink[],
  trace: DecisionTrace | undefined,
  memories?: ExplainSnapshot["memories"],
): void {
  if (!trace) return;
  for (const mid of trace.retrievedMemoryIds.slice(0, 5)) {
    const mem = memories?.find((m) => m.id === mid);
    links.push({
      kind: "memory",
      ref: mid,
      tick: trace.tick,
      summary: mem?.summary
        ? `memory ${mid}: ${mem.summary}`
        : `retrieved memory id ${mid}`,
    });
  }
}

/**
 * Pure read-only explain: query + snapshot → EvidenceChain.
 * Never throws on missing targets.
 */
export function explain(
  query: ExplainQuery,
  snapshot: ExplainSnapshot,
): EvidenceChain {
  try {
    // Resolve highlight shortcuts first
    let q = { ...query };
    if (q.highlightKind || q.highlightId) {
      const hs = snapshot.highlights ?? [];
      const h = q.highlightId
        ? hs.find((x) => x.id === q.highlightId)
        : hs.find((x) => x.kind === q.highlightKind);
      if (!h) {
        return emptyChain(
          q,
          q.highlightId
            ? `highlight not found: ${q.highlightId}`
            : `no highlight of kind ${q.highlightKind}`,
        );
      }
      // expand highlight into more specific query
      if (h.refs?.proposalId) {
        q = { ...q, proposalId: h.refs.proposalId };
      } else if (h.agentIds?.[0] && h.tick !== undefined) {
        q = { ...q, tick: h.tick, agentId: h.agentIds[0] };
      } else if (h.tick !== undefined) {
        q = { ...q, tick: h.tick };
      }
      // keep highlight link always
      const base = explainResolved(q, snapshot);
      const hlLink: EvidenceLink = {
        kind: "highlight",
        ref: h.id,
        tick: h.tick,
        summary: `[${h.kind}] ${h.summary}`,
      };
      // Prefer found from resolved; if not found still attach highlight
      if (!base.found && (h.refs?.proposalId || h.agentIds?.length)) {
        return {
          ...base,
          query: {
            ...base.query,
            key: queryKey(query),
            highlightId: h.id,
            highlightKind: h.kind,
          },
          found: true,
          summary: `Highlight ${h.id} (${h.kind}): partial chain — ${base.summary}`,
          links: [hlLink, ...base.links],
        };
      }
      return {
        ...base,
        query: {
          ...base.query,
          key: queryKey(query),
          highlightId: h.id,
          highlightKind: h.kind,
        },
        found: base.found || true,
        summary: base.found
          ? `Via highlight ${h.id}: ${base.summary}`
          : `Highlight ${h.id} (${h.kind}): ${h.summary}`,
        links: [hlLink, ...base.links],
      };
    }

    return explainResolved(q, snapshot);
  } catch (e) {
    return emptyChain(
      query,
      `explain error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function explainResolved(
  query: ExplainQuery,
  snapshot: ExplainSnapshot,
): EvidenceChain {
  const links: EvidenceLink[] = [];
  let trace: DecisionTrace | undefined;
  let summary = "";
  let found = false;

  // --- proposal path ---
  if (query.proposalId) {
    const p = (snapshot.proposals ?? []).find((x) => x.id === query.proposalId);
    if (!p) {
      return emptyChain(query, `proposal not found: ${query.proposalId}`);
    }
    found = true;
    const patchStr = p.patch
      ? Object.entries(p.patch)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ")
      : "";
    links.push({
      kind: "proposal",
      ref: p.id,
      tick: p.resolvedTick ?? p.createdTick,
      summary: `proposal ${p.id} status=${p.status} author=${p.author ?? "?"}${patchStr ? ` patch={${patchStr}}` : ""}`,
    });
    if (p.votes && Object.keys(p.votes).length) {
      const voteStr = Object.entries(p.votes)
        .map(([a, v]) => `${a}:${v}`)
        .join(", ");
      links.push({
        kind: "proposal",
        ref: `${p.id}:votes`,
        tick: p.resolvedTick ?? p.createdTick,
        summary: `votes: ${voteStr}`,
      });
    }
    if (p.status === "passed" && snapshot.institution) {
      links.push({
        kind: "institution",
        ref: "institution",
        tick: p.resolvedTick,
        summary: `institution after pass: ${JSON.stringify(snapshot.institution)}`,
      });
    }
    if (p.author !== undefined && p.createdTick !== undefined) {
      trace = findTrace(snapshot.traces, p.createdTick, p.author);
      if (trace) {
        links.push({
          kind: "decision_trace",
          ref: `trace:${trace.agentId}@${trace.tick}`,
          tick: trace.tick,
          summary: `author decision at tick ${trace.tick}: needs=${trace.dominantNeeds.join(",")} chosen=${trace.chosen ?? "none"}`,
        });
        appendMemoryLinks(links, trace, snapshot.memories);
      }
    }
    summary = `Proposal ${p.id} is ${p.status}${p.author ? ` by ${p.author}` : ""}${patchStr ? `; patch ${patchStr}` : ""}`;
    return finish(query, found, summary, links, trace);
  }

  // --- action line path ---
  if (query.actionLine) {
    const line = matchActionLine(snapshot.actionSequence, query.actionLine);
    if (!line) {
      return emptyChain(
        query,
        `action line not found matching: ${query.actionLine}`,
      );
    }
    found = true;
    const parsed = parseActionLine(line)!;
    links.push({
      kind: "action_sequence",
      ref: line,
      tick: parsed.tick,
      summary: line,
    });
    if (parsed.outcome === "REJECT" && parsed.code) {
      links.push({
        kind: "domain_event",
        ref: `reject:${parsed.code}`,
        tick: parsed.tick,
        summary: `${parsed.actor} ${parsed.verb} rejected: ${parsed.code}`,
      });
    }
    trace = findTrace(snapshot.traces, parsed.tick, parsed.actor);
    if (trace) {
      links.push({
        kind: "decision_trace",
        ref: `trace:${trace.agentId}@${trace.tick}`,
        tick: trace.tick,
        summary: `decision at tick ${trace.tick}: needs=${trace.dominantNeeds.join(",")} chosen=${trace.chosen ?? "none"} options=${trace.options.length}`,
      });
      appendMemoryLinks(links, trace, snapshot.memories);
    }
    if (snapshot.worldSummary) {
      links.push({
        kind: "world_snapshot",
        ref: "world",
        tick: parsed.tick,
        summary: snapshot.worldSummary,
      });
    }
    summary =
      parsed.outcome === "REJECT"
        ? `${parsed.actor} ${parsed.verb} rejected (${parsed.code ?? "?"}) at tick ${parsed.tick}`
        : `${parsed.actor} ${parsed.verb} ${parsed.outcome} at tick ${parsed.tick}`;
    return finish(query, found, summary, links, trace);
  }

  // --- tick + agent path ---
  if (query.tick !== undefined && query.agentId) {
    const tick = query.tick;
    const agentId = query.agentId;
    const lines = sequenceLinesFor(snapshot.actionSequence, tick, agentId);
    trace = findTrace(snapshot.traces, tick, agentId);

    if (!trace && lines.length === 0) {
      return emptyChain(
        query,
        `no decision_trace or action at tick=${tick} agent=${agentId}`,
      );
    }
    found = true;
    if (trace) {
      links.push({
        kind: "decision_trace",
        ref: `trace:${trace.agentId}@${trace.tick}`,
        tick: trace.tick,
        summary: `decision: needs=${trace.dominantNeeds.join(",")} chosen=${trace.chosen ?? "none"} options=${trace.options.length}`,
      });
      appendMemoryLinks(links, trace, snapshot.memories);
    }
    for (const line of lines) {
      links.push({
        kind: "action_sequence",
        ref: line,
        tick,
        summary: line,
      });
    }
    if (snapshot.worldSummary) {
      links.push({
        kind: "world_snapshot",
        ref: "world",
        tick,
        summary: snapshot.worldSummary,
      });
    }
    summary = trace
      ? `Agent ${agentId} at tick ${tick}: chosen=${trace.chosen ?? "none"}; actions=${lines.length}`
      : `Agent ${agentId} at tick ${tick}: actions=${lines.join(" | ")}`;
    return finish(query, found, summary, links, trace);
  }

  // tick only: first action at tick
  if (query.tick !== undefined) {
    const lines = sequenceLinesFor(snapshot.actionSequence, query.tick);
    if (lines.length === 0) {
      return emptyChain(query, `no actions at tick=${query.tick}`);
    }
    found = true;
    for (const line of lines) {
      links.push({
        kind: "action_sequence",
        ref: line,
        tick: query.tick,
        summary: line,
      });
    }
    summary = `Tick ${query.tick}: ${lines.length} action(s)`;
    return finish(query, found, summary, links, undefined);
  }

  return emptyChain(
    query,
    "empty or incomplete query; provide tick+agent, proposalId, actionLine, or highlightKind",
  );
}

function finish(
  query: ExplainQuery,
  found: boolean,
  summary: string,
  links: EvidenceLink[],
  trace: DecisionTrace | undefined,
): EvidenceChain {
  return {
    query: {
      key: queryKey(query),
      tick: query.tick,
      agentId: query.agentId,
      proposalId: query.proposalId,
      actionLine: query.actionLine,
      highlightId: query.highlightId,
      highlightKind: query.highlightKind,
    },
    found,
    summary,
    links,
    trace: trace ? projectTrace(trace) : undefined,
  };
}

/** Gather snapshot from a live orchestrator (read-only). */
export function snapshotFromOrch(orch: TickOrchestrator): ExplainSnapshot {
  const proposals = orch.getSocial().policy.list().map((p) => ({
    id: p.id,
    status: p.status,
    author: p.author,
    createdTick: p.createdTick,
    resolvedTick: p.resolvedTick,
    patch: p.patch as Record<string, unknown>,
    votes: p.votes as Record<string, string>,
    placeId: p.placeId,
  }));
  const highlights = detectHighlightsFromOrch(orch);
  const g = orch.world.getPublicGood("granary");
  const inst = orch.getInstitution() as Record<string, unknown>;
  const places = orch.world.agentPlaces();
  const worldSummary = `places=${JSON.stringify(places)}; granary=${g?.stock ?? "n/a"}; institution=${JSON.stringify(inst)}`;

  const memories: ExplainSnapshot["memories"] = [];
  try {
    const mem = orch.getMemory();
    const ids = new Set<string>();
    for (const t of orch.getTraces()) {
      for (const mid of t.retrievedMemoryIds) ids.add(mid);
    }
    for (const mid of ids) {
      const rec = mem.get(mid);
      if (rec) {
        memories.push({
          id: rec.id,
          summary: rec.summary,
          agentId: rec.owner,
        });
      }
    }
  } catch {
    // ignore memory dump failures
  }

  return {
    traces: orch.getTraces(),
    actionSequence: orch.getActionSequence(),
    proposals,
    highlights,
    institution: inst,
    memories,
    worldSummary,
  };
}

export function explainFromOrch(
  orch: TickOrchestrator,
  query: ExplainQuery,
): EvidenceChain {
  return explain(query, snapshotFromOrch(orch));
}
