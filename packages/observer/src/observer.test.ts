import { describe, it, expect, afterEach } from "vitest";
import { createSimulation } from "@gss/sim";
import { startObserverServer, type RunningObserver } from "./server.js";
import { handleObserverRequest } from "./handlers.js";
import { ControlRoomService } from "@gss/control";
import type { ExperimentParams } from "@gss/experiment";

describe("observer HTTP", () => {
  let running: RunningObserver | undefined;

  afterEach(async () => {
    if (running) {
      await running.close();
      running = undefined;
    }
  });

  it("handler serves health and world without listen", async () => {
    const orch = createSimulation({
      seed: "obs",
      scenario: "commons-cabin",
    });
    const params: ExperimentParams = {
      seed: "obs",
      scenario: "commons-cabin",
      days: 0,
    };
    const ctx = {
      orch,
      control: new ControlRoomService(orch),
      params,
      allowWrite: false,
    };
    const h = await handleObserverRequest(ctx, "GET", "/health", new URLSearchParams());
    expect(h.status).toBe(200);
    expect(JSON.parse(h.body as string).ok).toBe(true);
    const w = await handleObserverRequest(ctx, "GET", "/world", new URLSearchParams());
    expect(w.status).toBe(200);
    const world = JSON.parse(w.body as string);
    expect(world.agents.length).toBe(3);
  });

  it("GET /highlights returns JSON array", async () => {
    const orch = createSimulation({
      seed: "hl",
      scenario: "commons-cabin",
    });
    await orch.runDays(1);
    const ctx = {
      orch,
      control: new ControlRoomService(orch),
      params: {
        seed: "hl",
        scenario: "commons-cabin" as const,
        days: 1,
      },
      allowWrite: false,
    };
    const r = await handleObserverRequest(
      ctx,
      "GET",
      "/highlights",
      new URLSearchParams(),
    );
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body as string);
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST inject forbidden when write disabled", async () => {
    const orch = createSimulation({ seed: "w", scenario: "commons-cabin" });
    const ctx = {
      orch,
      control: new ControlRoomService(orch),
      params: {
        seed: "w",
        scenario: "commons-cabin" as const,
        days: 0,
      },
      allowWrite: false,
    };
    const r = await handleObserverRequest(
      ctx,
      "POST",
      "/inject",
      new URLSearchParams(),
      JSON.stringify({ kind: "resource", payload: { granaryDelta: 1 } }),
    );
    expect(r.status).toBe(403);
  });

  it("real port GET /health and /world", async () => {
    const orch = createSimulation({
      seed: "port",
      scenario: "commons-cabin",
      lodEdgeSkip: 0.5,
      focusPlaceIds: ["cabin"],
    });
    await orch.runDays(1);
    running = await startObserverServer({
      orch,
      params: {
        seed: "port",
        scenario: "commons-cabin",
        days: 1,
        lodEdgeSkip: 0.5,
      },
      port: 0,
      allowWrite: false,
    });
    const health = await fetch(`${running.baseUrl}/health`);
    expect(health.status).toBe(200);
    const world = await fetch(`${running.baseUrl}/world`);
    expect(world.status).toBe(200);
    const body = (await world.json()) as { agents: unknown[] };
    expect(body.agents.length).toBe(3);
    const metrics = await fetch(`${running.baseUrl}/metrics`);
    const m = (await metrics.json()) as {
      runtime: { skippedCognitiveTicks: number };
    };
    expect(m.runtime.skippedCognitiveTicks).toBeGreaterThanOrEqual(0);
  });
});
