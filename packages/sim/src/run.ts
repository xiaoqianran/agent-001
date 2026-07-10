import fs from "node:fs";
import path from "node:path";
import type { CheckpointBundle } from "@gss/contracts";
import { TickOrchestrator } from "@gss/runtime";
import { computeFingerprint } from "@gss/runtime";
import { createSoloCabinSimulation } from "./create.js";

export interface RunOptions {
  scenario: string;
  days: number;
  seed: string;
  checkpointPath?: string;
  logPath?: string;
}

export interface RunSummary {
  exitCode: number;
  seed: string;
  scenario: string;
  days: number;
  finalTick: number;
  finalDay: number;
  agentId: string;
  placeId: string;
  fingerprint: ReturnType<typeof computeFingerprint>;
  checkpointPath?: string;
  logPath?: string;
}

export async function runSimulation(opts: RunOptions): Promise<RunSummary> {
  if (opts.scenario !== "solo-cabin") {
    throw new Error(`unsupported scenario: ${opts.scenario}`);
  }
  const orch = createSoloCabinSimulation({ seed: opts.seed, scenario: "solo-cabin" });
  const lines: string[] = [];

  const results = await orch.runDays(opts.days);
  for (const r of results) {
    lines.push(
      JSON.stringify({
        type: "tick",
        tick: r.tick,
        day: r.day,
        applied: r.applied,
        rejected: r.rejected,
        faults: r.faults,
      }),
    );
  }

  const agents = orch.getSimulationState().agents;
  const agentId = Object.keys(agents)[0]!;
  const placeId = agents[agentId]!.placeId;
  const clock = orch.getClock();
  const fingerprint = computeFingerprint(
    orch.world,
    agents,
    clock,
    orch.getActionSequence(),
  );

  let checkpointPath = opts.checkpointPath;
  if (checkpointPath) {
    const abs = path.resolve(checkpointPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const bundle = orch.toCheckpoint(path.basename(abs));
    fs.writeFileSync(abs, JSON.stringify(bundle, null, 2));
    checkpointPath = abs;
  }

  let logPath = opts.logPath;
  if (logPath) {
    const abs = path.resolve(logPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, lines.join("\n") + "\n");
    logPath = abs;
  }

  const summary: RunSummary = {
    exitCode: 0,
    seed: opts.seed,
    scenario: opts.scenario,
    days: opts.days,
    finalTick: clock.tick,
    finalDay: clock.day,
    agentId,
    placeId,
    fingerprint,
    checkpointPath,
    logPath,
  };
  lines.push(JSON.stringify({ type: "summary", ...summary, fingerprint }));
  if (logPath) {
    fs.appendFileSync(logPath, JSON.stringify({ type: "summary", ...summary }) + "\n");
  }
  return summary;
}

export async function resumeSimulation(opts: {
  checkpointPath: string;
  days: number;
  logPath?: string;
}): Promise<RunSummary> {
  const raw = fs.readFileSync(path.resolve(opts.checkpointPath), "utf8");
  const bundle = JSON.parse(raw) as CheckpointBundle;
  const orch = TickOrchestrator.fromCheckpoint(bundle);
  const startTick = orch.getClock().tick;

  const results = await orch.runDays(opts.days);
  const lines = results.map((r) =>
    JSON.stringify({
      type: "tick",
      tick: r.tick,
      day: r.day,
      applied: r.applied,
      rejected: r.rejected,
      faults: r.faults,
    }),
  );

  const agents = orch.getSimulationState().agents;
  const agentId = Object.keys(agents)[0]!;
  const placeId = agents[agentId]!.placeId;
  const clock = orch.getClock();
  const fingerprint = computeFingerprint(
    orch.world,
    agents,
    clock,
    orch.getActionSequence(),
  );

  // write updated checkpoint next to old
  const outCkpt = opts.checkpointPath.replace(/\.json$/, "") + ".resumed.json";
  fs.writeFileSync(outCkpt, JSON.stringify(orch.toCheckpoint(path.basename(outCkpt)), null, 2));

  if (opts.logPath) {
    fs.mkdirSync(path.dirname(path.resolve(opts.logPath)), { recursive: true });
    fs.writeFileSync(path.resolve(opts.logPath), lines.join("\n") + "\n");
  }

  if (clock.tick <= startTick) {
    throw new Error("clock did not advance on resume");
  }

  return {
    exitCode: 0,
    seed: bundle.seed.value,
    scenario: bundle.scenarioId,
    days: opts.days,
    finalTick: clock.tick,
    finalDay: clock.day,
    agentId,
    placeId,
    fingerprint,
    checkpointPath: outCkpt,
    logPath: opts.logPath,
  };
}
