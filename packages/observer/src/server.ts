import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TickOrchestrator } from "@gss/runtime";
import { ControlRoomService } from "@gss/control";
import type { ExperimentParams } from "@gss/experiment";
import {
  handleObserverRequest,
  readBody,
  send,
  type ObserverContext,
} from "./handlers.js";

export interface StartObserverOptions {
  orch: TickOrchestrator;
  params: ExperimentParams;
  port?: number;
  host?: string;
  allowWrite?: boolean;
  staticDir?: string;
}

export interface RunningObserver {
  server: http.Server;
  port: number;
  baseUrl: string;
  control: ControlRoomService;
  close: () => Promise<void>;
}

function defaultStaticDir(): string {
  // packages/observer/public relative to this file when running from src
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../public");
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export function startObserverServer(
  opts: StartObserverOptions,
): Promise<RunningObserver> {
  const control = new ControlRoomService(opts.orch);
  // sync institution from orch if any
  const ctx: ObserverContext = {
    orch: opts.orch,
    control,
    params: opts.params,
    allowWrite: Boolean(opts.allowWrite),
    staticDir: opts.staticDir ?? defaultStaticDir(),
  };

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? "localhost";
      const u = new URL(req.url ?? "/", `http://${host}`);
      // static files
      if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) {
        const index = path.join(ctx.staticDir!, "index.html");
        if (fs.existsSync(index)) {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(fs.readFileSync(index));
          return;
        }
      }
      if (req.method === "GET" && u.pathname.startsWith("/static/")) {
        const rel = u.pathname.slice("/static/".length);
        const file = path.join(ctx.staticDir!, rel);
        if (fs.existsSync(file) && file.startsWith(ctx.staticDir!)) {
          res.writeHead(200, { "content-type": contentType(file) });
          res.end(fs.readFileSync(file));
          return;
        }
      }

      const body =
        req.method === "POST" || req.method === "PUT"
          ? await readBody(req)
          : undefined;
      const result = await handleObserverRequest(
        ctx,
        req.method ?? "GET",
        u.pathname,
        u.searchParams,
        body,
      );
      send(res, result);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  });

  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 0; // 0 = ephemeral for tests

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const p =
        typeof addr === "object" && addr ? addr.port : (opts.port ?? 8787);
      resolve({
        server,
        port: p,
        baseUrl: `http://${host}:${p}`,
        control,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on("error", reject);
  });
}
