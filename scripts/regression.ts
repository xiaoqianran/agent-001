#!/usr/bin/env tsx
/**
 * Multi-scenario regression smoke suite (GOAL-009).
 * Target: < 3 minutes, Stub LLM only, no API keys.
 *
 * Exit non-zero on first failure with clear scenario name.
 */
import { createSimulation, runSimulation, type ScenarioId } from "@gss/sim";
import { computeFingerprint, fingerprintEqual } from "@gss/runtime";
import type { AuthorityFingerprint } from "@gss/contracts";
import { compareParams } from "@gss/experiment";

const SEED = "42";
const DAYS = 3;

interface SmokeCase {
  scenario: ScenarioId;
  days: number;
  seed: string;
  expectAgents: number;
  check?: (
    summary: Awaited<ReturnType<typeof runSimulation>>,
  ) => void | Promise<void>;
}

const SMOKE: SmokeCase[] = [
  {
    scenario: "solo-cabin",
    days: DAYS,
    seed: SEED,
    expectAgents: 1,
  },
  {
    scenario: "dyad-cabin",
    days: DAYS,
    seed: SEED,
    expectAgents: 2,
  },
  {
    scenario: "trio-cabin",
    days: DAYS,
    seed: SEED,
    expectAgents: 3,
  },
  {
    scenario: "commons-cabin",
    days: DAYS,
    seed: SEED,
    expectAgents: 3,
    check: (s) => {
      const m = s.metrics!;
      if (m.publicGoods === undefined) {
        throw new Error("commons metrics missing publicGoods");
      }
      // granary / contribute fields present
      if (typeof m.publicGoods.publicStock !== "number") {
        throw new Error("missing publicStock (granary)");
      }
      if (typeof m.actions.contributeOk !== "number") {
        throw new Error("missing contributeOk");
      }
    },
  },
  {
    scenario: "assembly-cabin",
    days: DAYS,
    seed: SEED,
    expectAgents: 3,
    check: async (s) => {
      // checkpoint serializable via toCheckpoint path (re-run create + dump)
      const orch = createSimulation({
        seed: s.seed,
        scenario: "assembly-cabin",
      });
      await orch.runDays(1);
      const ckpt = orch.toCheckpoint("regression-assembly");
      if (!ckpt || typeof ckpt !== "object") {
        throw new Error("assembly checkpoint not serializable");
      }
      JSON.stringify(ckpt);
    },
  },
];

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function smokeOne(c: SmokeCase): Promise<{
  ok: boolean;
  ms: number;
  note: string;
  error?: string;
}> {
  const t0 = Date.now();
  try {
    const summary = await runSimulation({
      scenario: c.scenario,
      days: c.days,
      seed: c.seed,
      sampleDaily: false,
    });
    if (summary.exitCode !== 0) {
      throw new Error(`exitCode=${summary.exitCode}`);
    }
    if (summary.agentIds.length !== c.expectAgents) {
      throw new Error(
        `agent count ${summary.agentIds.length} != ${c.expectAgents}`,
      );
    }
    await c.check?.(summary);
    const ms = Date.now() - t0;
    const food = summary.metrics?.totals.totalFood?.toFixed(1) ?? "?";
    return {
      ok: true,
      ms,
      note: `agents=${summary.agentIds.length} food=${food}`,
    };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - t0,
      note: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkDeterminism(): Promise<{
  ok: boolean;
  ms: number;
  note: string;
  error?: string;
}> {
  const t0 = Date.now();
  const scenario: ScenarioId = "trio-cabin";
  try {
    const mk = () => createSimulation({ seed: SEED, scenario });
    const a = mk();
    const b = mk();
    await a.runDays(DAYS);
    await b.runDays(DAYS);
    const fp = (orch: typeof a): AuthorityFingerprint =>
      computeFingerprint(
        orch.world,
        orch.getSimulationState().agents,
        orch.getClock(),
        orch.getActionSequence(),
        orch.getMemory(),
        orch.getSocial(),
      );
    const fa = fp(a);
    const fb = fp(b);
    if (!fingerprintEqual(fa, fb)) {
      throw new Error("compare-seeds fingerprints not equal");
    }
    return {
      ok: true,
      ms: Date.now() - t0,
      note: `scenario=${scenario} seed=${SEED} days=${DAYS} equal`,
    };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - t0,
      note: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkScarceDirection(): Promise<{
  ok: boolean;
  ms: number;
  note: string;
  error?: string;
}> {
  const t0 = Date.now();
  try {
    const result = await compareParams(
      { seed: SEED, scenario: "trio-cabin", days: DAYS },
      { storehouseFood: 3, woodsFood: 0, label: "scarce" },
      { storehouseFood: 20, woodsFood: 10, label: "abundant" },
      async (params) => {
        const s = await runSimulation({
          scenario: params.scenario,
          days: params.days,
          seed: params.seed,
          storehouseFood: params.storehouseFood,
          woodsFood: params.woodsFood,
          experimentParams: params,
          sampleDaily: false,
        });
        return s.metrics!;
      },
    );
    const scarce = result.a.totals.totalFood;
    const abundant = result.b.totals.totalFood;
    if (!(abundant > scarce)) {
      throw new Error(
        `expected abundant totalFood (${abundant}) > scarce (${scarce})`,
      );
    }
    return {
      ok: true,
      ms: Date.now() - t0,
      note: `abundant.food=${abundant.toFixed(1)} > scarce.food=${scarce.toFixed(1)}`,
    };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - t0,
      note: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  console.log("GSS regression suite (Stub LLM, seed=42, days=3)");
  console.log(
    pad("case", 28) + pad("ok", 6) + pad("ms", 8) + "note / error",
  );
  console.log("-".repeat(72));

  const failures: string[] = [];
  let totalMs = 0;

  for (const c of SMOKE) {
    const r = await smokeOne(c);
    totalMs += r.ms;
    const name = `smoke:${c.scenario}`;
    if (r.ok) {
      console.log(pad(name, 28) + pad("ok", 6) + pad(String(r.ms), 8) + r.note);
    } else {
      console.log(
        pad(name, 28) + pad("FAIL", 6) + pad(String(r.ms), 8) + (r.error ?? ""),
      );
      failures.push(`${name}: ${r.error}`);
    }
  }

  for (const [name, fn] of [
    ["check:determinism", checkDeterminism],
    ["check:scarce-direction", checkScarceDirection],
  ] as const) {
    const r = await fn();
    totalMs += r.ms;
    if (r.ok) {
      console.log(pad(name, 28) + pad("ok", 6) + pad(String(r.ms), 8) + r.note);
    } else {
      console.log(
        pad(name, 28) + pad("FAIL", 6) + pad(String(r.ms), 8) + (r.error ?? ""),
      );
      failures.push(`${name}: ${r.error}`);
    }
  }

  console.log("-".repeat(72));
  console.log(
    `done in ${totalMs}ms | ${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILED`}`,
  );
  // Direction / legislature unit tests live in pnpm test (documented).
  console.log(
    "note: institution/legislature direction also covered by pnpm test (legislature.test, institution.test)",
  );

  if (failures.length) {
    console.error("\nFailed cases:");
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
