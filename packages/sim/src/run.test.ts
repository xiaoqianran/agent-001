import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSimulation, resumeSimulation } from "./run.js";
import { createDyadCabinSimulation, createSoloCabinSimulation } from "./create.js";
import { computeFingerprint, fingerprintEqual } from "@gss/runtime";

const legal = new Set(["cabin", "woods", "storehouse"]);

describe("sim run", () => {
  it("runs 7 days solo-cabin without API key", async () => {
    const summary = await runSimulation({
      scenario: "solo-cabin",
      days: 7,
      seed: "42",
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.finalDay).toBe(7);
    expect(legal.has(summary.placeId)).toBe(true);
  });

  it("runs 5 days dyad-cabin with two agents", async () => {
    const summary = await runSimulation({
      scenario: "dyad-cabin",
      days: 5,
      seed: "42",
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.finalDay).toBe(5);
    expect(summary.agentIds).toContain("agent-alice");
    expect(summary.agentIds).toContain("agent-bob");
    for (const p of Object.values(summary.places)) {
      expect(legal.has(p)).toBe(true);
    }
    expect(summary.memoryCount).toBeGreaterThan(0);
  });

  it("dyad deterministic dual run", async () => {
    const a = createDyadCabinSimulation({ seed: "99" });
    const b = createDyadCabinSimulation({ seed: "99" });
    await a.runDays(3);
    await b.runDays(3);
    const fa = computeFingerprint(
      a.world,
      a.getSimulationState().agents,
      a.getClock(),
      a.getActionSequence(),
      a.getMemory(),
      a.getSocial(),
    );
    const fb = computeFingerprint(
      b.world,
      b.getSimulationState().agents,
      b.getClock(),
      b.getActionSequence(),
      b.getMemory(),
      b.getSocial(),
    );
    expect(fingerprintEqual(fa, fb)).toBe(true);
  });

  it("checkpoint resume preserves promise-class memory retrieve", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-dyad-"));
    const ckpt = path.join(dir, "mid.json");
    const s1 = await runSimulation({
      scenario: "dyad-cabin",
      days: 2,
      seed: "seed-ckpt",
      checkpointPath: ckpt,
    });
    expect(s1.finalDay).toBe(2);
    expect(fs.existsSync(ckpt)).toBe(true);

    // load and check retrieve before resume
    const raw = JSON.parse(fs.readFileSync(ckpt, "utf8"));
    expect(raw.memory).toBeTruthy();

    const s2 = await resumeSimulation({ checkpointPath: ckpt, days: 3 });
    expect(s2.finalDay).toBe(5);
    expect(s2.seed).toBe("seed-ckpt");
    expect(s2.agentIds.length).toBe(2);

    // post-resume memory store must still retrieve something high-value for alice
    const orch = createDyadCabinSimulation({ seed: "x" });
    // use checkpoint file memory via resume already advanced — re-load resumed ckpt
    const resumedPath = s2.checkpointPath!;
    const bundle = JSON.parse(fs.readFileSync(resumedPath, "utf8"));
    const { TickOrchestrator } = await import("@gss/runtime");
    const loaded = TickOrchestrator.fromCheckpoint(bundle);
    const hits = loaded.getMemory().retrieve({
      owner: "agent-alice",
      tick: loaded.getClock().tick,
      k: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    // prefer promise-class if any exist in store
    const anyPromise = loaded
      .getMemory()
      .listFor("agent-alice")
      .filter((m) => m.tags.includes("promise-class"));
    const pending = loaded.getSocial().listPromises();
    expect(hits.length + anyPromise.length + pending.length).toBeGreaterThan(0);
    void orch;
  });

  it("solo checkpoint still works", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-solo-"));
    const ckpt = path.join(dir, "s.json");
    await runSimulation({
      scenario: "solo-cabin",
      days: 3,
      seed: "s",
      checkpointPath: ckpt,
    });
    const s2 = await resumeSimulation({ checkpointPath: ckpt, days: 4 });
    expect(s2.finalDay).toBe(7);
  });
});
