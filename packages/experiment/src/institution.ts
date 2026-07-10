/** GOAL-006 institution knobs — rule-side only, no LLM randomness */

export interface InstitutionParams {
  /** 0..1 extra barrier on withdraw_public (World + cognition) */
  enforcementStrength?: number;
  /** 0..1 boost contribute option scores */
  contributionReward?: number;
  /** 0..1 penalty on withdraw_public option scores */
  freeRidePenalty?: number;
  /** expose public ledger on LocalObservation */
  transparency?: boolean;
}

export const DEFAULT_INSTITUTION: Required<InstitutionParams> = {
  enforcementStrength: 0,
  contributionReward: 0,
  freeRidePenalty: 0,
  transparency: false,
};

export function normalizeInstitution(
  p?: InstitutionParams,
): Required<InstitutionParams> {
  return {
    enforcementStrength: clamp01(p?.enforcementStrength ?? 0),
    contributionReward: clamp01(p?.contributionReward ?? 0),
    freeRidePenalty: clamp01(p?.freeRidePenalty ?? 0),
    transparency: Boolean(p?.transparency),
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function parseInstitutionFromFlat(
  flat: Record<string, unknown>,
): InstitutionParams {
  const inst = (flat.institution as InstitutionParams) ?? {};
  const out: InstitutionParams = { ...inst };
  if (typeof flat.enforcementStrength === "number") {
    out.enforcementStrength = flat.enforcementStrength;
  }
  if (typeof flat.contributionReward === "number") {
    out.contributionReward = flat.contributionReward;
  }
  if (typeof flat.freeRidePenalty === "number") {
    out.freeRidePenalty = flat.freeRidePenalty;
  }
  if (typeof flat.transparency === "boolean") {
    out.transparency = flat.transparency;
  }
  // string "true" from parse
  if (flat.transparency === "true" || flat.transparency === true) {
    out.transparency = true;
  }
  if (flat.transparency === "false" || flat.transparency === false) {
    out.transparency = false;
  }
  return out;
}
