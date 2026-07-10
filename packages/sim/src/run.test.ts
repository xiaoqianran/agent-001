import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSimulation, resumeSimulation } from "./run.js";
import { createSoloCabinSimulation } from "./create.js";
import { computeFingerprint, fingerprintEqual } from "@gss/runtime";

describe("sim run", () => {
  it("runs 7 days solo-cabin without API key", async () => {
    const summary = await runSimulation({
      scenario: "solo-cabin",
      days: 7,
      seed: "42",
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.finalDay).toBe(7);
    expect(summary.finalTick).toBe(7 * 24);
    expect(["cabin", "woods", "storehouse"]).toContain(summary.placeId);
    expect(summary.agentId).toBe("agent-alice");
  });

  it("deterministic dual run API", async () => {
    const a = createSoloCabinSimulation({ seed: "99" });
    const b = createSoloCabinSimulation({ seed: "99" });
    await a.runDays(3);
    await b.runDays(3);
    const fa = computeFingerprint(
      a.world,
      a.getSimulationState().agents,
      a.getClock(),
      a.getActionSequence(),
    );
    const fb = computeFingerprint(
      b.world,
      b.getSimulationState().agents,
      b.getClock(),
      b.getActionSequence(),
    );
    expect(fingerprintEqual(fa, fb)).toBe(true);
  });

  it("checkpoint file resume continuum", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-ckpt-"));
    const ckpt = path.join(dir, "mid.json");
    const s1 = await runSimulation({
      scenario: "solo-cabin",
      days: 3,
      seed: "seed-ckpt",
      checkpointPath: ckpt,
    });
    expect(s1.finalDay).toBe(3);
    expect(fs.existsSync(ckpt)).toBe(true);
    const s2 = await resumeSimulation({ checkpointPath: ckpt, days: 4 });
    expect(s2.finalDay).toBe(7);
    expect(s2.finalTick).toBe(7 * 24);
    expect(s2.agentId).toBe(s1.agentId);
    expect(s2.seed).toBe("seed-ckpt");
  });
});
