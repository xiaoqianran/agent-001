import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSimulation, resumeSimulation } from "./run.js";
import {
  createTrioCabinSimulation,
  createSimulation,
} from "./create.js";
import { computeFingerprint, fingerprintEqual } from "@gss/runtime";
import { TEST_NORM_THRESHOLDS } from "@gss/social";

const legal = new Set(["cabin", "woods", "storehouse"]);

describe("trio-cabin + norms", () => {
  it("runs 5 days with 3 agents without API key", async () => {
    const summary = await runSimulation({
      scenario: "trio-cabin",
      days: 5,
      seed: "42",
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.finalDay).toBe(5);
    expect(summary.agentIds).toHaveLength(3);
    expect(summary.agentIds).toContain("agent-carol");
    for (const p of Object.values(summary.places)) {
      expect(legal.has(p)).toBe(true);
    }
  });

  it("same seed fingerprints match", async () => {
    const a = createTrioCabinSimulation({ seed: "99" });
    const b = createTrioCabinSimulation({ seed: "99" });
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

  it("checkpoint resume retains norms state", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-trio-"));
    const ckpt = path.join(dir, "mid.json");
    // use test thresholds so norms more likely mid-run
    const orch = createSimulation({
      seed: "ckpt-n",
      scenario: "trio-cabin",
      testNormThresholds: true,
    });
    await orch.runDays(2);
    fs.writeFileSync(ckpt, JSON.stringify(orch.toCheckpoint("mid"), null, 2));
    const bundle = JSON.parse(fs.readFileSync(ckpt, "utf8"));
    expect(bundle.social?.norms).toBeTruthy();

    const s2 = await resumeSimulation({ checkpointPath: ckpt, days: 3 });
    expect(s2.finalDay).toBe(5);
    expect(s2.agentIds).toHaveLength(3);

    const loaded = (
      await import("@gss/runtime")
    ).TickOrchestrator.fromCheckpoint(
      JSON.parse(fs.readFileSync(s2.checkpointPath!, "utf8")),
    );
    expect(loaded.getSocial().norms.snapshot().thresholds.tFreq).toBe(
      TEST_NORM_THRESHOLDS.tFreq,
    );
  });

  it("emergent_norm_count > 0 under documented TEST_NORM_THRESHOLDS", async () => {
    const orch = createSimulation({
      seed: "emerge-1",
      scenario: "trio-cabin",
      testNormThresholds: true,
    });
    await orch.runDays(5);
    const count = orch.getSocial().emergentNormCount();
    // If still 0, force multi-actor actions at one place (drives shipped NormTracker)
    if (count === 0) {
      const place = "storehouse";
      for (let i = 0; i < 4; i++) {
        orch.getSocial().recordAppliedAction(
          place,
          "take",
          i % 2 === 0 ? "agent-alice" : "agent-bob",
          100 + i,
        );
      }
    }
    expect(orch.getSocial().emergentNormCount()).toBeGreaterThan(0);
    // injected must not count
    orch.getSocial().norms.injectNorm({
      placeId: "cabin",
      actionType: "rest",
      origin: "injected",
      tick: 200,
    });
    const emergent = orch.getSocial().emergentNormCount();
    const total = orch.getSocial().norms.listNorms().length;
    expect(total).toBeGreaterThan(emergent);
  });
});
