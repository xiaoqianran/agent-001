import {
  runPromiseResumeCase,
  PROMISE_RESUME_DEFAULT_SEED,
} from "./promise-resume.js";
import type {
  EvalCaseFn,
  EvalCaseResult,
  EvalRunOpts,
  EvalSuiteResult,
} from "./types.js";

const REGISTRY: Record<string, EvalCaseFn> = {
  "promise-resume": async (opts) =>
    runPromiseResumeCase({
      seed: opts.seed,
      warmupDays: opts.warmupDays,
      resumeDays: opts.resumeDays,
      seedCandidates: opts.seedCandidates,
    }),
};

/** Known suite presets */
const SUITES: Record<string, string[]> = {
  core: ["promise-resume"],
  all: ["promise-resume"],
};

export function listEvalCases(): string[] {
  return Object.keys(REGISTRY);
}

export function listEvalSuites(): Record<string, string[]> {
  return { ...SUITES };
}

/**
 * Run a single eval case by id.
 * For promise-resume, may try seedCandidates if first seed fails phase1.
 */
export async function runEvalCase(
  id: string,
  opts: EvalRunOpts = {},
): Promise<EvalCaseResult> {
  const fn = REGISTRY[id];
  if (!fn) {
    return {
      id,
      status: "fail",
      seed: opts.seed ?? "n/a",
      durationMs: 0,
      assertions: [
        {
          id: "registry.unknown",
          ok: false,
          detail: `unknown eval case: ${id}; known=${listEvalCases().join(",")}`,
        },
      ],
      summary: `unknown case ${id}`,
    };
  }

  const warmupDays = opts.warmupDays ?? 3;
  const resumeDays = opts.resumeDays ?? 3;
  const candidates = uniqueSeeds(
    opts.seed
      ? [opts.seed, ...(opts.seedCandidates ?? [])]
      : [
          PROMISE_RESUME_DEFAULT_SEED,
          ...(opts.seedCandidates ?? ["7", "99"]),
        ],
  ).slice(0, 3);

  if (id === "promise-resume" && candidates.length > 1 && !opts.seed) {
    // try candidates until pass or exhausted
    let last: EvalCaseResult | undefined;
    for (const seed of candidates) {
      last = await fn({
        seed,
        warmupDays,
        resumeDays,
        seedCandidates: opts.seedCandidates,
      });
      if (last.status === "pass") return last;
      // only retry if phase1 promise missing
      const phase1 = last.assertions.find((a) => a.id === "phase1.has_promise");
      if (phase1?.ok) return last;
    }
    return last!;
  }

  const seed = opts.seed ?? candidates[0] ?? PROMISE_RESUME_DEFAULT_SEED;
  return fn({ seed, warmupDays, resumeDays, seedCandidates: opts.seedCandidates });
}

export async function runEvalSuite(
  ids?: string[] | string,
  opts: EvalRunOpts = {},
): Promise<EvalSuiteResult> {
  let caseIds: string[];
  if (typeof ids === "string") {
    caseIds = SUITES[ids] ?? [ids];
  } else if (Array.isArray(ids) && ids.length > 0) {
    caseIds = ids;
  } else {
    caseIds = SUITES.core;
  }

  const cases: EvalCaseResult[] = [];
  for (const id of caseIds) {
    cases.push(await runEvalCase(id, opts));
  }
  const passed = cases.filter((c) => c.status === "pass").length;
  const failed = cases.filter((c) => c.status === "fail").length;
  const skipped = cases.filter((c) => c.status === "skip").length;
  return {
    format: "gss-eval@1",
    ranAt: new Date().toISOString(),
    cases,
    passed,
    failed,
    skipped,
  };
}

function uniqueSeeds(seeds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of seeds) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
