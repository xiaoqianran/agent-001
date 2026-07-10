#!/usr/bin/env node
import { createSimulation } from "@gss/sim";
import type { ExperimentParams, ScenarioId } from "@gss/experiment";
import { startObserverServer } from "./server.js";

function arg(flag: string, argv: string[], d?: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return d;
}

async function main() {
  const argv = process.argv.slice(2);
  const scenario = (arg("--scenario", argv, "commons-cabin") ??
    "commons-cabin") as ScenarioId;
  const seed = arg("--seed", argv, "42") ?? "42";
  const days = Number(arg("--days", argv, "0") ?? "0");
  const port = Number(arg("--port", argv, "8787") ?? "8787");
  const lodEdgeSkip = Number(arg("--lodEdgeSkip", argv, "0") ?? "0");
  const allowWrite =
    process.env.OBSERVER_ALLOW_WRITE === "1" ||
    argv.includes("--allow-write");

  const params: ExperimentParams = {
    seed,
    scenario,
    days: Math.max(days, 0),
    lodEdgeSkip: lodEdgeSkip > 0 ? lodEdgeSkip : undefined,
    focusPlaceIds: ["cabin"],
    freeRiderCount: 1,
  };

  const orch = createSimulation({
    seed,
    scenario,
    freeRiderCount: 1,
    lodEdgeSkip: params.lodEdgeSkip,
    focusPlaceIds: ["cabin"],
    experimentParams: params,
  });
  if (days > 0) {
    await orch.runDays(days);
  }

  const running = await startObserverServer({
    orch,
    params,
    port,
    allowWrite,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: running.baseUrl,
        allowWrite,
        open: running.baseUrl + "/",
        lodEdgeSkip: params.lodEdgeSkip ?? 0,
      },
      null,
      2,
    ),
  );
  console.log(`Observer listening at ${running.baseUrl}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
