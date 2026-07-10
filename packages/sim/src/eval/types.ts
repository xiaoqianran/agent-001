export type EvalStatus = "pass" | "fail" | "skip";

export interface EvalAssertion {
  id: string;
  ok: boolean;
  detail: string;
}

export interface EvalCaseResult {
  id: string;
  status: EvalStatus;
  seed: string;
  durationMs: number;
  assertions: EvalAssertion[];
  summary: string;
  artifacts?: Record<string, unknown>;
}

export interface EvalSuiteResult {
  format: "gss-eval@1";
  ranAt: string;
  cases: EvalCaseResult[];
  passed: number;
  failed: number;
  skipped: number;
}

export interface EvalRunOpts {
  seed?: string;
  /** seeds to try if first fails to establish promises (max 3 total) */
  seedCandidates?: string[];
  warmupDays?: number;
  resumeDays?: number;
}

export type EvalCaseFn = (opts: Required<
  Pick<EvalRunOpts, "seed" | "warmupDays" | "resumeDays">
> &
  EvalRunOpts) => Promise<EvalCaseResult>;
