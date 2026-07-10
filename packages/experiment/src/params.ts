export type ScenarioId =
  | "solo-cabin"
  | "dyad-cabin"
  | "trio-cabin"
  | "commons-cabin";

export interface NormThresholdOverride {
  tFreq?: number;
  tActors?: number;
  windowTicks?: number;
}

/** GOAL-004/005 experiment / scenario knobs */
export interface ExperimentParams {
  seed: string;
  scenario: ScenarioId;
  days: number;
  /** Initial storehouse food pool */
  storehouseFood?: number;
  /** Initial woods food pool */
  woodsFood?: number;
  /** Initial granary public stock (commons-cabin) */
  initialGranary?: number;
  /**
   * Commons role mix: 0 = all cooperative-leaning, 1 = one free_rider (default),
   * 2 = two free_riders (Alice coop, Bob+Carol free_rider).
   */
  freeRiderCount?: number;
  normThresholds?: NormThresholdOverride;
  /** baseline | scarce | abundant | custom | cooperative | free-ride */
  label?: string;
  testNormThresholds?: boolean;
}

export function parseParamPairs(
  pairs: string[],
): Partial<ExperimentParams> {
  const out: Record<string, unknown> = {};
  for (const p of pairs) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const key = p.slice(0, eq).trim();
    const raw = p.slice(eq + 1).trim();
    if (
      key === "storehouseFood" ||
      key === "woodsFood" ||
      key === "days" ||
      key === "initialGranary" ||
      key === "freeRiderCount"
    ) {
      out[key] = Number(raw);
    } else if (key === "label" || key === "seed" || key === "scenario") {
      out[key] = raw;
    } else if (key === "testNormThresholds") {
      out[key] = raw === "1" || raw === "true";
    } else {
      // nested normThresholds.tFreq=3
      if (key.startsWith("normThresholds.")) {
        const sub = key.slice("normThresholds.".length);
        const nt = (out.normThresholds as Record<string, number>) ?? {};
        nt[sub] = Number(raw);
        out.normThresholds = nt;
      }
    }
  }
  return out as Partial<ExperimentParams>;
}

export function mergeParams(
  base: ExperimentParams,
  override: Partial<ExperimentParams>,
): ExperimentParams {
  return {
    ...base,
    ...override,
    normThresholds: {
      ...base.normThresholds,
      ...override.normThresholds,
    },
  };
}

export function paramsToRecord(p: ExperimentParams): Record<string, unknown> {
  return {
    seed: p.seed,
    scenario: p.scenario,
    days: p.days,
    storehouseFood: p.storehouseFood,
    woodsFood: p.woodsFood,
    initialGranary: p.initialGranary,
    freeRiderCount: p.freeRiderCount,
    normThresholds: p.normThresholds,
    label: p.label,
    testNormThresholds: p.testNormThresholds,
  };
}
