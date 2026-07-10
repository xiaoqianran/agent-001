import { describe, it, expect } from "vitest";
import {
  runEvalCase,
  runEvalSuite,
  listEvalCases,
  PROMISE_RESUME_DEFAULT_SEED,
} from "./index.js";

describe("GOAL-012 eval framework + promise-resume", () => {
  it("lists promise-resume case", () => {
    expect(listEvalCases()).toContain("promise-resume");
  });

  it("runEvalCase('promise-resume') passes on fixed seed via shipped path", async () => {
    const result = await runEvalCase("promise-resume", {
      seed: PROMISE_RESUME_DEFAULT_SEED,
      warmupDays: 3,
      resumeDays: 3,
    });
    expect(result.id).toBe("promise-resume");
    expect(result.status).toBe("pass");
    expect(result.assertions.length).toBeGreaterThan(0);
    expect(result.assertions.every((a) => a.ok)).toBe(true);

    // prove real checkpoint path was exercised
    expect(result.artifacts?.usedRealCheckpoint).toBe(true);
    expect(result.artifacts?.checkpointFormat).toBe("gss-checkpoint@1");
    expect(result.artifacts?.parentTick).toBeTypeOf("number");

    const ids = result.assertions.map((a) => a.id);
    expect(ids).toContain("phase1.has_promise");
    expect(ids).toContain("checkpoint.has_memory");
    expect(ids).toContain("checkpoint.has_social");
    expect(ids).toContain("resume.clock_advanced");
    expect(ids).toContain("resume.promises_not_lost");
    expect(ids).toContain("resume.memory_or_social");
    expect(ids).toContain("social_outcome.kept_or_broken");

    // live social outcome in artifacts
    const kept = result.artifacts?.kept as number;
    const broken = result.artifacts?.broken as number;
    const pending = result.artifacts?.pending as number;
    expect(kept + broken + pending).toBeGreaterThan(0);
  });

  it("is deterministic for same seed (status + key assertions)", async () => {
    const a = await runEvalCase("promise-resume", {
      seed: PROMISE_RESUME_DEFAULT_SEED,
      warmupDays: 3,
      resumeDays: 3,
    });
    const b = await runEvalCase("promise-resume", {
      seed: PROMISE_RESUME_DEFAULT_SEED,
      warmupDays: 3,
      resumeDays: 3,
    });
    expect(a.status).toBe(b.status);
    expect(a.assertions.map((x) => `${x.id}:${x.ok}`)).toEqual(
      b.assertions.map((x) => `${x.id}:${x.ok}`),
    );
    expect(a.artifacts?.kept).toBe(b.artifacts?.kept);
  });

  it("runEvalSuite('core') returns gss-eval@1 with promise-resume", async () => {
    const suite = await runEvalSuite("core", {
      seed: PROMISE_RESUME_DEFAULT_SEED,
    });
    expect(suite.format).toBe("gss-eval@1");
    expect(suite.cases.some((c) => c.id === "promise-resume")).toBe(true);
    expect(suite.passed).toBeGreaterThanOrEqual(1);
    expect(suite.failed).toBe(0);
  });

  it("unknown case fails cleanly", async () => {
    const r = await runEvalCase("no-such-case");
    expect(r.status).toBe("fail");
    expect(r.assertions[0]!.id).toBe("registry.unknown");
  });
});
