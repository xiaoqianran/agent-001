#!/usr/bin/env node
import {
  runSimulation,
  resumeSimulation,
  createSimulation,
  createSoloCabinSimulation,
} from "@gss/sim";
import { computeFingerprint, fingerprintEqual } from "@gss/runtime";

function usage(): never {
  console.log(`gss-sim — Generative Social Simulator CLI

Usage:
  pnpm sim run --scenario solo-cabin --days 7 --seed 42
  pnpm sim run --scenario dyad-cabin --days 5 --seed 42
  pnpm sim run --scenario trio-cabin --days 5 --seed 42
  pnpm sim run --scenario trio-cabin --days 2 --seed 42 --checkpoint ./ckpts/t.json
  pnpm sim resume --checkpoint ./ckpts/t.json --days 3
  pnpm sim compare-seeds --scenario trio-cabin --seed 42 --days 5

Options:
  --scenario <id>     solo-cabin | dyad-cabin | trio-cabin
  --days <n>
  --seed <value>
  --checkpoint <path>
  --log <path>
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val =
        argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true";
      out[key] = val;
    } else {
      positionals.push(a);
    }
  }
  return { cmd: positionals[0], positionals, flags: out };
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (!cmd || cmd === "help" || cmd === "-h") usage();

  if (cmd === "run") {
    const summary = await runSimulation({
      scenario: flags.scenario ?? "solo-cabin",
      days: Number(flags.days ?? "1"),
      seed: flags.seed ?? "42",
      checkpointPath: flags.checkpoint,
      logPath: flags.log,
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
    });
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.exitCode);
  }

  if (cmd === "fingerprint") {
    const days = Number(flags.days ?? "1");
    const seed = flags.seed ?? "42";
    const scenario = (flags.scenario ?? "solo-cabin") as
      | "solo-cabin"
      | "dyad-cabin"
      | "trio-cabin";
    const orch = createSimulation({ seed, scenario });
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
    const scenario = (flags.scenario ?? "solo-cabin") as
      | "solo-cabin"
      | "dyad-cabin"
      | "trio-cabin";
    const a = createSimulation({ seed, scenario });
    const b = createSimulation({ seed, scenario });
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
