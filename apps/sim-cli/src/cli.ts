#!/usr/bin/env node
import {
  runSimulation,
  resumeSimulation,
  createSimulation,
  createSoloCabinSimulation,
  compareExperimentParams,
  computeRunMetrics,
  parseParamPairs,
  exportBundle,
  inspectBundleFile,
  type ExperimentParams,
  type ScenarioId,
} from "@gss/sim";
import { computeFingerprint, fingerprintEqual, TickOrchestrator } from "@gss/runtime";
import fs from "node:fs";

function usage(): never {
  console.log(`gss-sim — Generative Social Simulator CLI

Usage:
  pnpm sim run --scenario commons-cabin --days 5 --seed 42 --metrics-out ./out/m.json
  pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \\
    --a freeRiderCount=0 --a label=cooperative \\
    --b freeRiderCount=2 --b label=free-ride
  pnpm sim export-bundle --scenario commons-cabin --days 5 --seed 42 --out ./bundles/run.json
  pnpm sim inspect-bundle --in ./bundles/run.json

Options:
  --scenario solo-cabin|dyad-cabin|trio-cabin|commons-cabin
  --days --seed --param key=value --label
  --metrics-out --checkpoint --log
  --a / --b for compare-params
  --out / --in for bundle
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  const multi: Record<string, string[]> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val =
        argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true";
      if (key === "param" || key === "a" || key === "b") {
        multi[key] = multi[key] ?? [];
        multi[key]!.push(val);
      } else {
        out[key] = val;
      }
    } else {
      positionals.push(a);
    }
  }
  return { cmd: positionals[0], positionals, flags: out, multi };
}

async function main() {
  const { cmd, flags, multi } = parseArgs(process.argv.slice(2));
  if (!cmd || cmd === "help" || cmd === "-h") usage();

  if (cmd === "run") {
    const partial = parseParamPairs(multi.param ?? []);
    const scenario = (flags.scenario ??
      partial.scenario ??
      "solo-cabin") as ScenarioId;
    const summary = await runSimulation({
      scenario,
      days: Number(flags.days ?? partial.days ?? "1"),
      seed: flags.seed ?? partial.seed ?? "42",
      checkpointPath: flags.checkpoint,
      logPath: flags.log,
      metricsOut: flags["metrics-out"],
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
      initialGranary: partial.initialGranary,
      freeRiderCount: partial.freeRiderCount,
      label: flags.label ?? partial.label,
      testNormThresholds: partial.testNormThresholds,
      experimentParams: {
        seed: flags.seed ?? partial.seed ?? "42",
        scenario,
        days: Number(flags.days ?? partial.days ?? "1"),
        storehouseFood: partial.storehouseFood,
        woodsFood: partial.woodsFood,
        initialGranary: partial.initialGranary,
        freeRiderCount: partial.freeRiderCount,
        label: flags.label ?? partial.label,
        testNormThresholds: partial.testNormThresholds,
        normThresholds: partial.normThresholds,
      },
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.exitCode);
  }

  if (cmd === "resume") {
    if (!flags.checkpoint) {
      console.error("--checkpoint required");
      process.exit(2);
    }
    const summary = await resumeSimulation({
      checkpointPath: flags.checkpoint,
      days: Number(flags.days ?? "1"),
      logPath: flags.log,
      metricsOut: flags["metrics-out"],
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.exitCode);
  }

  if (cmd === "compare-params") {
    const a = parseParamPairs(multi.a ?? multi.param ?? []);
    const b = parseParamPairs(multi.b ?? []);
    if (Object.keys(b).length === 0) {
      console.error("compare-params requires --a and --b");
      process.exit(2);
    }
    const result = await compareExperimentParams({
      seed: flags.seed ?? "42",
      scenario: (flags.scenario ?? "trio-cabin") as ScenarioId,
      days: Number(flags.days ?? "5"),
      a: { ...a, label: a.label ?? "A" },
      b: { ...b, label: b.label ?? "B" },
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (cmd === "export-bundle") {
    const partial = parseParamPairs(multi.param ?? []);
    const out = flags.out ?? "./bundle.json";
    const bundle = await exportBundle({
      scenario: (flags.scenario ?? "commons-cabin") as ScenarioId,
      days: Number(flags.days ?? "5"),
      seed: flags.seed ?? "42",
      out,
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
      initialGranary: partial.initialGranary,
      freeRiderCount: partial.freeRiderCount,
      label: flags.label ?? partial.label,
    });
    console.log(JSON.stringify({ ok: true, out, format: bundle.format }, null, 2));
    process.exit(0);
  }

  if (cmd === "inspect-bundle") {
    const inn = flags.in ?? flags.input;
    if (!inn) {
      console.error("inspect-bundle requires --in <path>");
      process.exit(2);
    }
    console.log(inspectBundleFile(inn));
    process.exit(0);
  }

  if (cmd === "metrics") {
    const ckpt = flags["from-checkpoint"] ?? flags.checkpoint;
    if (!ckpt) {
      console.error("metrics requires --from-checkpoint <path>");
      process.exit(2);
    }
    const bundle = JSON.parse(fs.readFileSync(ckpt, "utf8"));
    if (bundle.metrics) {
      console.log(JSON.stringify(bundle.metrics, null, 2));
      process.exit(0);
    }
    const orch = TickOrchestrator.fromCheckpoint(bundle);
    const params: ExperimentParams = {
      seed: bundle.seed?.value ?? "unknown",
      scenario: bundle.scenarioId ?? "commons-cabin",
      days: bundle.clock?.day ?? 0,
      ...(bundle.experimentParams ?? {}),
    };
    console.log(JSON.stringify(computeRunMetrics(orch, params), null, 2));
    process.exit(0);
  }

  if (cmd === "fingerprint") {
    const days = Number(flags.days ?? "1");
    const seed = flags.seed ?? "42";
    const scenario = (flags.scenario ?? "solo-cabin") as ScenarioId;
    const partial = parseParamPairs(multi.param ?? []);
    const orch = createSimulation({
      seed,
      scenario,
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
      initialGranary: partial.initialGranary,
      freeRiderCount: partial.freeRiderCount,
    });
    await orch.runDays(days);
    const agents = orch.getSimulationState().agents;
    console.log(
      JSON.stringify(
        computeFingerprint(
          orch.world,
          agents,
          orch.getClock(),
          orch.getActionSequence(),
          orch.getMemory(),
          orch.getSocial(),
        ),
        null,
        2,
      ),
    );
    process.exit(0);
  }

  if (cmd === "compare-seeds") {
    const days = Number(flags.days ?? "2");
    const seed = flags.seed ?? "42";
    const scenario = (flags.scenario ?? "solo-cabin") as ScenarioId;
    const partial = parseParamPairs(multi.param ?? []);
    const mk = () =>
      createSimulation({
        seed,
        scenario,
        storehouseFood: partial.storehouseFood,
        woodsFood: partial.woodsFood,
        initialGranary: partial.initialGranary,
        freeRiderCount: partial.freeRiderCount,
      });
    const a = mk();
    const b = mk();
    await a.runDays(days);
    await b.runDays(days);
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
    const ok = fingerprintEqual(fa, fb);
    console.log(JSON.stringify({ equal: ok, fa, fb }, null, 2));
    process.exit(ok ? 0 : 1);
  }

  void createSoloCabinSimulation;
  usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
