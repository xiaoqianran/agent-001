#!/usr/bin/env node
import {
  runSimulation,
  resumeSimulation,
  createSimulation,
  createSoloCabinSimulation,
  compareExperimentParams,
  computeRunMetrics,
  parseParamPairs,
  type ExperimentParams,
  type ScenarioId,
} from "@gss/sim";
import { computeFingerprint, fingerprintEqual, TickOrchestrator } from "@gss/runtime";
import fs from "node:fs";

function usage(): never {
  console.log(`gss-sim — Generative Social Simulator CLI

Usage:
  pnpm sim run --scenario trio-cabin --days 5 --seed 42
  pnpm sim run --scenario trio-cabin --days 5 --seed 42 \\
    --param storehouseFood=3 --param woodsFood=1 --label scarce --metrics-out ./out/m.json
  pnpm sim compare-params --scenario trio-cabin --seed 42 --days 5 \\
    --a storehouseFood=3 --b storehouseFood=20
  pnpm sim metrics --from-checkpoint ./ckpts/t.json
  pnpm sim compare-seeds --scenario trio-cabin --seed 42 --days 5

Options:
  --scenario <id>     solo-cabin | dyad-cabin | trio-cabin
  --days <n>
  --seed <value>
  --param key=value   repeatable (storehouseFood, woodsFood, …)
  --label <name>
  --metrics-out <path>
  --checkpoint <path>
  --log <path>
  --a / --b           for compare-params (key=value pairs, repeatable as --a x=1)
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
    const summary = await runSimulation({
      scenario: flags.scenario ?? partial.scenario ?? "solo-cabin",
      days: Number(flags.days ?? partial.days ?? "1"),
      seed: flags.seed ?? partial.seed ?? "42",
      checkpointPath: flags.checkpoint,
      logPath: flags.log,
      metricsOut: flags["metrics-out"],
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
      label: flags.label ?? partial.label,
      testNormThresholds: partial.testNormThresholds,
      experimentParams: {
        seed: flags.seed ?? partial.seed ?? "42",
        scenario: (flags.scenario ?? partial.scenario ?? "solo-cabin") as ScenarioId,
        days: Number(flags.days ?? partial.days ?? "1"),
        storehouseFood: partial.storehouseFood,
        woodsFood: partial.woodsFood,
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
      console.error("compare-params requires --a and --b key=value pairs");
      process.exit(2);
    }
    const result = await compareExperimentParams({
      seed: flags.seed ?? "42",
      scenario: (flags.scenario ?? "trio-cabin") as ScenarioId,
      days: Number(flags.days ?? "5"),
      a: { ...a, label: a.label ?? "scarce" },
      b: { ...b, label: b.label ?? "abundant" },
    });
    console.log(JSON.stringify(result, null, 2));
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
      scenario: bundle.scenarioId ?? "trio-cabin",
      days: bundle.clock?.day ?? 0,
      ...(bundle.experimentParams ?? {}),
    };
    const m = computeRunMetrics(orch, params);
    console.log(JSON.stringify(m, null, 2));
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
    });
    await orch.runDays(days);
    const agents = orch.getSimulationState().agents;
    const fp = computeFingerprint(
      orch.world,
      agents,
      orch.getClock(),
      orch.getActionSequence(),
      orch.getMemory(),
      orch.getSocial(),
    );
    console.log(JSON.stringify(fp, null, 2));
    process.exit(0);
  }

  if (cmd === "compare-seeds") {
    const days = Number(flags.days ?? "2");
    const seed = flags.seed ?? "42";
    const scenario = (flags.scenario ?? "solo-cabin") as ScenarioId;
    const partial = parseParamPairs(multi.param ?? []);
    const a = createSimulation({
      seed,
      scenario,
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
    });
    const b = createSimulation({
      seed,
      scenario,
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
    });
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
