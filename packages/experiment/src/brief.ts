import type { TickOrchestrator } from "@gss/runtime";
import type { ExperimentParams } from "./params.js";
import { computeRunMetrics } from "./metrics.js";

/** Rule-template social brief (no LLM required). */
export function renderDailyBrief(
  orch: TickOrchestrator,
  params: ExperimentParams,
  day?: number,
): string {
  const m = computeRunMetrics(orch, params);
  const d = day ?? m.meta.finalDay;
  const inst = orch.getInstitution();
  const proposals = orch.getSocial().policy.list();
  const open = proposals.filter((p) => p.status === "open").length;
  const passed = proposals.filter((p) => p.status === "passed").length;
  const rejected = proposals.filter((p) => p.status === "rejected").length;
  const lines = [
    `# Social Brief — Day ${d}`,
    ``,
    `- scenario: ${params.scenario}`,
    `- seed: ${params.seed}`,
    `- totalFood: ${m.totals.totalFood.toFixed(1)}`,
    `- meanHunger: ${m.wellbeing.meanHunger.toFixed(2)}`,
    `- granary.stock: ${m.publicGoods.publicStock}`,
    `- contributed: ${m.publicGoods.totalContributed} | withdrawn: ${m.publicGoods.freeRideWithdrawals}`,
    `- institution.enforcement: ${inst.enforcementStrength ?? 0}`,
    `- institution.contributionReward: ${inst.contributionReward ?? 0}`,
    `- institution.freeRidePenalty: ${inst.freeRidePenalty ?? 0}`,
    `- proposals: open=${open} passed=${passed} rejected=${rejected}`,
    `- actions: take=${m.actions.takeOk} contribute=${m.actions.contributeOk} withdraw=${m.actions.withdrawPublicOk}`,
    `- LOD skippedCognitiveTicks: ${m.runtime.skippedCognitiveTicks}`,
  ];
  return lines.join("\n") + "\n";
}
