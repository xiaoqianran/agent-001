import type { IncomingMessage, ServerResponse } from "node:http";
import type { ControlRoomService } from "@gss/control";
import type { TickOrchestrator } from "@gss/runtime";
import {
  computeRunMetrics,
  detectHighlightsFromOrch,
  type ExperimentParams,
  type ExplainQuery,
} from "@gss/experiment";

export interface ObserverContext {
  orch: TickOrchestrator;
  control: ControlRoomService;
  params: ExperimentParams;
  allowWrite: boolean;
  staticDir?: string;
}

export type HandlerResult = {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
};

/**
 * Pure-ish HTTP routing for observer API (testable without bind).
 */
export async function handleObserverRequest(
  ctx: ObserverContext,
  method: string,
  urlPath: string,
  query: URLSearchParams,
  bodyRaw?: string,
): Promise<HandlerResult> {
  const json = (status: number, data: unknown): HandlerResult => ({
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(data, null, 2),
  });

  if (method === "OPTIONS") {
    return {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
      body: "",
    };
  }

  if (method === "GET" && urlPath === "/health") {
    return json(200, { ok: true, service: "gss-observer" });
  }

  if (method === "GET" && urlPath === "/world") {
    return json(200, ctx.control.getWorldView());
  }

  if (method === "GET" && urlPath.startsWith("/agents/")) {
    const id = decodeURIComponent(urlPath.slice("/agents/".length));
    try {
      return json(200, ctx.control.getAgentView(id));
    } catch (e) {
      return json(404, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (method === "GET" && urlPath === "/timeline") {
    const from = query.get("from");
    const to = query.get("to");
    return json(
      200,
      ctx.control.listTimeline(
        from ? Number(from) : undefined,
        to ? Number(to) : undefined,
      ),
    );
  }

  if (method === "GET" && urlPath === "/metrics") {
    return json(200, computeRunMetrics(ctx.orch, ctx.params));
  }

  if (method === "GET" && urlPath === "/highlights") {
    return json(200, detectHighlightsFromOrch(ctx.orch, ctx.params));
  }

  if (method === "GET" && urlPath === "/explain") {
    const q: ExplainQuery = {};
    const tick = query.get("tick");
    const agent = query.get("agent") ?? query.get("agentId");
    const proposalId = query.get("proposalId") ?? query.get("proposal");
    const actionLine = query.get("actionLine") ?? query.get("action-line");
    const highlightKind = query.get("highlightKind") ?? query.get("from-highlight-kind");
    const highlightId = query.get("highlightId");
    if (tick !== null && tick !== "") q.tick = Number(tick);
    if (agent) q.agentId = agent;
    if (proposalId) q.proposalId = proposalId;
    if (actionLine) q.actionLine = actionLine;
    if (highlightKind) q.highlightKind = highlightKind;
    if (highlightId) q.highlightId = highlightId;
    return json(200, ctx.control.explain(q));
  }

  if (method === "GET" && urlPath === "/audit") {
    return json(200, ctx.control.getAuditLog());
  }

  if (method === "POST" && urlPath === "/run/step") {
    if (!ctx.allowWrite) {
      return json(403, { error: "write disabled; set OBSERVER_ALLOW_WRITE=1" });
    }
    const r = await ctx.orch.advanceOneTick();
    return json(200, { result: r, world: ctx.control.getWorldView() });
  }

  if (method === "POST" && urlPath === "/inject") {
    if (!ctx.allowWrite) {
      return json(403, { error: "write disabled; set OBSERVER_ALLOW_WRITE=1" });
    }
    let payload: { kind?: string; payload?: Record<string, unknown> } = {};
    try {
      payload = bodyRaw ? JSON.parse(bodyRaw) : {};
    } catch {
      return json(400, { error: "invalid JSON" });
    }
    const kind = (payload.kind ?? "resource") as
      | "resource"
      | "oracle_message"
      | "param"
      | "event";
    const audit = ctx.control.inject({
      kind,
      payload: payload.payload ?? {},
    });
    return json(200, { audit, world: ctx.control.getWorldView() });
  }

  return json(404, { error: "not found", path: urlPath });
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function send(res: ServerResponse, result: HandlerResult): void {
  res.writeHead(result.status, result.headers ?? {});
  res.end(result.body);
}
