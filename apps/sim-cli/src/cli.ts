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
  renderDailyBrief,
  detectHighlightsFromOrch,
  explainFromOrch,
  type ExperimentParams,
  type ScenarioId,
  type ExplainQuery,
} from "@gss/sim";
import { computeFingerprint, fingerprintEqual, TickOrchestrator } from "@gss/runtime";
import { ControlRoomService } from "@gss/control";
import fs from "node:fs";

function usage(): never {
  console.log(`gss-sim — Generative Social Simulator CLI

Usage:
  pnpm sim run --scenario commons-cabin --days 5 --seed 42 \\
    --param enforcementStrength=0.9 --timeline-out ./tl.json
  pnpm sim compare-params --scenario commons-cabin --seed 42 --days 5 \\
    --a enforcementStrength=0 --b enforcementStrength=0.9
  pnpm sim timeline --from-checkpoint ./ckpts/x.json --out ./tl.json
  pnpm sim inject --scenario commons-cabin --seed 1 --kind resource --payload '{"granaryDelta":2}'
  pnpm sim export-bundle --scenario commons-cabin --days 5 --seed 42 --out ./bundles/run.json
  pnpm sim run --scenario assembly-cabin --days 5 --seed 42 --brief-out ./brief.md
  pnpm sim brief --scenario assembly-cabin --days 3 --seed 42
  pnpm sim highlights --scenario assembly-cabin --days 5 --seed 42
  pnpm sim run --scenario commons-cabin --days 3 --seed 42 --highlights-out ./hl.json
  pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --from-highlight-kind conflict
  pnpm sim explain --scenario commons-cabin --days 3 --seed 42 --tick 5 --agent agent-bob
  pnpm sim explain --scenario assembly-cabin --days 5 --seed 42 --proposal prop-1
  pnpm sim explain --scenario commons-cabin --days 3 --seed 42 \\
    --action-line '5:agent-bob:withdraw_public:REJECT:INSUFFICIENT_RESOURCE'

Options:
  --scenario --days --seed --param key=value --label
  --metrics-out --brief-out --highlights-out --timeline-out --checkpoint --log
  --a / --b --out / --in --kind --payload
  --tick --agent --proposal --action-line --from-highlight-kind --from-checkpoint
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
      briefOut: flags["brief-out"],
      highlightsOut: flags["highlights-out"],
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
        enforcementStrength: partial.enforcementStrength,
        contributionReward: partial.contributionReward,
        freeRidePenalty: partial.freeRidePenalty,
        transparency: partial.transparency,
        institution: partial.institution,
      },
    });
    if (flags["timeline-out"]) {
      const o = createSimulation({
        seed: summary.seed,
        scenario: summary.scenario as ScenarioId,
        freeRiderCount: partial.freeRiderCount,
        enforcementStrength: partial.enforcementStrength,
        freeRidePenalty: partial.freeRidePenalty,
        contributionReward: partial.contributionReward,
        transparency: partial.transparency,
        experimentParams: summary.experimentParams as ExperimentParams,
      });
      await o.runDays(summary.days);
      const cr = new ControlRoomService(o);
      const tl = cr.listTimeline();
      const outPath = flags["timeline-out"];
      const dir = outPath.includes("/")
        ? outPath.slice(0, outPath.lastIndexOf("/"))
        : ".";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(tl, null, 2));
    }
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

  if (cmd === "timeline") {
    const ckpt = flags["from-checkpoint"] ?? flags.checkpoint;
    if (!ckpt) {
      console.error("timeline requires --from-checkpoint");
      process.exit(2);
    }
    const bundle = JSON.parse(fs.readFileSync(ckpt, "utf8"));
    const orch = TickOrchestrator.fromCheckpoint(bundle);
    const cr = new ControlRoomService(orch);
    const tl = cr.listTimeline();
    const out = flags.out ?? flags["timeline-out"];
    if (out) {
      const dir = out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(out, JSON.stringify(tl, null, 2));
    }
    console.log(JSON.stringify({ count: tl.length, sample: tl.slice(0, 5) }, null, 2));
    process.exit(0);
  }

  if (cmd === "inject") {
    const partial = parseParamPairs(multi.param ?? []);
    const scenario = (flags.scenario ?? "commons-cabin") as ScenarioId;
    const orch = createSimulation({
      seed: flags.seed ?? "42",
      scenario,
      freeRiderCount: partial.freeRiderCount,
      enforcementStrength: partial.enforcementStrength,
    });
    await orch.runDays(Number(flags.days ?? "0"));
    const cr = new ControlRoomService(orch);
    const kind = (flags.kind ?? "resource") as
      | "resource"
      | "oracle_message"
      | "param"
      | "event";
    const payload = flags.payload
      ? (JSON.parse(flags.payload) as Record<string, unknown>)
      : { granaryDelta: 1 };
    const audit = cr.inject({ kind, payload });
    console.log(JSON.stringify({ audit, world: cr.getWorldView() }, null, 2));
    process.exit(0);
  }

  if (cmd === "brief") {
    const partial = parseParamPairs(multi.param ?? []);
    const scenario = (flags.scenario ?? "assembly-cabin") as ScenarioId;
    const days = Number(flags.days ?? "3");
    const seed = flags.seed ?? "42";
    const orch = createSimulation({
      seed,
      scenario,
      freeRiderCount: partial.freeRiderCount ?? 1,
    });
    await orch.runDays(days);
    const text = renderDailyBrief(orch, {
      seed,
      scenario,
      days,
    });
    const out = flags.out ?? flags["brief-out"];
    if (out) {
      const dir = out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(out, text);
    }
    console.log(text);
    process.exit(0);
  }

  if (cmd === "highlights") {
    const partial = parseParamPairs(multi.param ?? []);
    const scenario = (flags.scenario ?? "assembly-cabin") as ScenarioId;
    const days = Number(flags.days ?? "5");
    const seed = flags.seed ?? "42";
    const orch = createSimulation({
      seed,
      scenario,
      freeRiderCount: partial.freeRiderCount ?? 1,
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
      initialGranary: partial.initialGranary,
      enforcementStrength: partial.enforcementStrength,
      contributionReward: partial.contributionReward,
      freeRidePenalty: partial.freeRidePenalty,
      transparency: partial.transparency,
    });
    await orch.runDays(days);
    const params: ExperimentParams = {
      seed,
      scenario,
      days,
      freeRiderCount: partial.freeRiderCount ?? 1,
      storehouseFood: partial.storehouseFood,
      woodsFood: partial.woodsFood,
      initialGranary: partial.initialGranary,
      enforcementStrength: partial.enforcementStrength,
      contributionReward: partial.contributionReward,
      freeRidePenalty: partial.freeRidePenalty,
      transparency: partial.transparency,
    };
    const highlights = detectHighlightsFromOrch(orch, params);
    const out = flags.out ?? flags["highlights-out"];
    const body = JSON.stringify(highlights, null, 2);
    if (out) {
      const dir = out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(out, body);
    }
    console.log(body);
    process.exit(0);
  }

  if (cmd === "explain") {
    const partial = parseParamPairs(multi.param ?? []);
    let orch: TickOrchestrator;
    const ckpt = flags["from-checkpoint"] ?? flags.checkpoint;
    if (ckpt) {
      const bundle = JSON.parse(fs.readFileSync(ckpt, "utf8"));
      orch = TickOrchestrator.fromCheckpoint(bundle);
    } else {
      const scenario = (flags.scenario ?? "commons-cabin") as ScenarioId;
      const days = Number(flags.days ?? "3");
      const seed = flags.seed ?? "42";
      orch = createSimulation({
        seed,
        scenario,
        freeRiderCount: partial.freeRiderCount ?? 1,
        storehouseFood: partial.storehouseFood,
        woodsFood: partial.woodsFood,
        initialGranary: partial.initialGranary,
        enforcementStrength: partial.enforcementStrength,
        contributionReward: partial.contributionReward,
        freeRidePenalty: partial.freeRidePenalty,
        transparency: partial.transparency,
      });
      await orch.runDays(days);
    }

    const q: ExplainQuery = {};
    if (flags.tick !== undefined) q.tick = Number(flags.tick);
    if (flags.agent) q.agentId = flags.agent;
    if (flags.proposal) q.proposalId = flags.proposal;
    if (flags["proposal-id"]) q.proposalId = flags["proposal-id"];
    if (flags["action-line"]) q.actionLine = flags["action-line"];
    if (flags["from-highlight-kind"]) {
      q.highlightKind = flags["from-highlight-kind"];
    }
    if (flags["highlight-id"]) q.highlightId = flags["highlight-id"];

    // default: first conflict highlight if no query fields
    if (
      q.tick === undefined &&
      !q.agentId &&
      !q.proposalId &&
      !q.actionLine &&
      !q.highlightKind &&
      !q.highlightId
    ) {
      q.highlightKind = "conflict";
    }

    const chain = explainFromOrch(orch, q);
    const body = JSON.stringify(chain, null, 2);
    const out = flags.out ?? flags["explain-out"];
    if (out) {
      const dir = out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(out, body);
    }
    console.log(body);
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
