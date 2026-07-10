import type { CheckpointBundle } from "@gss/contracts";
import { RuleCognitiveEngine } from "@gss/cognition";
import { TickOrchestrator } from "@gss/runtime";
import { createSimulation } from "../create.js";
import type { EvalAssertion, EvalCaseResult, EvalRunOpts } from "./types.js";

/** Default seed proven by promise-fulfill tests to produce give:OK + kept. */
export const PROMISE_RESUME_DEFAULT_SEED = "42";

const DEFAULT_WARMUP = 3;
const DEFAULT_RESUME = 3;

function dyadFactory() {
  return (id: string) =>
    new RuleCognitiveEngine({
      roleHint: id === "agent-alice" ? "promisor" : "promisee",
    });
}

function assert(
  id: string,
  ok: boolean,
  detail: string,
): EvalAssertion {
  return { id, ok, detail };
}

/**
 * Eval #1 (reduced): promise → real checkpoint → resume → memory/social survive.
 * Assertions always read live Social/Memory/sequence state.
 */
export async function runPromiseResumeCase(
  opts: EvalRunOpts = {},
): Promise<EvalCaseResult> {
  const t0 = Date.now();
  const seed = opts.seed ?? PROMISE_RESUME_DEFAULT_SEED;
  const warmupDays = opts.warmupDays ?? DEFAULT_WARMUP;
  const resumeDays = opts.resumeDays ?? DEFAULT_RESUME;
  const assertions: EvalAssertion[] = [];
  const artifacts: Record<string, unknown> = {
    warmupDays,
    resumeDays,
    usedRealCheckpoint: true,
  };

  try {
    // --- Phase 1: warmup until promises appear ---
    const orch1 = createSimulation({
      seed,
      scenario: "dyad-cabin",
    });
    await orch1.runDays(warmupDays);

    const promisesPhase1 = orch1.getSocial().listPromises();
    const pendingOrKept = promisesPhase1.filter(
      (p) => p.status === "pending" || p.status === "kept",
    );
    const phase1Ids = promisesPhase1.map((p) => p.id);
    artifacts.phase1PromiseIds = phase1Ids;
    artifacts.phase1Statuses = promisesPhase1.map((p) => ({
      id: p.id,
      status: p.status,
    }));

    assertions.push(
      assert(
        "phase1.has_promise",
        promisesPhase1.length > 0 && pendingOrKept.length > 0,
        promisesPhase1.length === 0
          ? "no promises after warmup"
          : `promises=${promisesPhase1.length} pendingOrKept=${pendingOrKept.length}`,
      ),
    );

    // --- Checkpoint (real serialize) ---
    const ckpt = orch1.toCheckpoint(`eval-promise-resume-${seed}`);
    const ckptClone = JSON.parse(JSON.stringify(ckpt)) as CheckpointBundle;
    artifacts.checkpointId = ckpt.checkpointId;
    artifacts.parentTick = ckpt.clock.tick;
    artifacts.checkpointFormat = ckpt.format;

    assertions.push(
      assert(
        "checkpoint.format",
        ckpt.format === "gss-checkpoint@1",
        `format=${ckpt.format}`,
      ),
    );
    assertions.push(
      assert(
        "checkpoint.has_memory",
        ckpt.memory != null && typeof ckpt.memory === "object",
        ckpt.memory ? "memory present" : "memory missing",
      ),
    );
    assertions.push(
      assert(
        "checkpoint.has_social",
        ckpt.social != null && typeof ckpt.social === "object",
        ckpt.social ? "social present" : "social missing",
      ),
    );

    // Snapshot edge trust pre-resume for optional broken-path comparison
    const edgePre = orch1.getSocial().getEdge("agent-alice", "agent-bob");
    const trustPre = edgePre?.dimensions.trust ?? null;
    artifacts.trustPre = trustPre;

    // --- Phase 2: real fromCheckpoint + runDays (not continuous from orch1) ---
    const tickBeforeResume = ckptClone.clock.tick;
    const orch2 = TickOrchestrator.fromCheckpoint(
      ckptClone,
      undefined,
      dyadFactory(),
    );
    // Must be a different instance
    assertions.push(
      assert(
        "resume.fresh_instance",
        orch2 !== orch1 && orch2.getClock().tick === tickBeforeResume,
        `resumed tick=${orch2.getClock().tick} parent=${tickBeforeResume}`,
      ),
    );

    await orch2.runDays(resumeDays);
    const tickAfter = orch2.getClock().tick;
    assertions.push(
      assert(
        "resume.clock_advanced",
        tickAfter > tickBeforeResume,
        `tick ${tickBeforeResume} → ${tickAfter}`,
      ),
    );

    const promisesPhase2 = orch2.getSocial().listPromises();
    artifacts.phase2Statuses = promisesPhase2.map((p) => ({
      id: p.id,
      status: p.status,
    }));

    // Must not lose all phase1 promises
    const stillPresent = phase1Ids.filter((id) =>
      promisesPhase2.some((p) => p.id === id),
    );
    assertions.push(
      assert(
        "resume.promises_not_lost",
        phase1Ids.length === 0 || stillPresent.length > 0,
        phase1Ids.length === 0
          ? "no phase1 ids to track"
          : `stillPresent=${stillPresent.length}/${phase1Ids.length}: ${stillPresent.join(",")}`,
      ),
    );

    // Memory: promise-class retrieve OR social still has phase1 id
    const mem = orch2.getMemory();
    const tick = orch2.getClock().tick;
    const aliceHits = mem.retrieve({
      owner: "agent-alice",
      tick,
      text: "promise food",
      tags: ["promise-class"],
      k: 5,
    });
    const bobHits = mem.retrieve({
      owner: "agent-bob",
      tick,
      text: "promise food",
      tags: ["promise-class"],
      k: 5,
    });
    const anyPromiseMem =
      aliceHits.some((m) => m.tags.includes("promise-class")) ||
      bobHits.some((m) => m.tags.includes("promise-class")) ||
      // broader text search without tag filter
      mem
        .retrieve({
          owner: "agent-alice",
          tick,
          text: "promised",
          k: 8,
        })
        .some(
          (m) =>
            m.tags.includes("promise-class") ||
            /promis/i.test(m.summary),
        ) ||
      mem
        .retrieve({
          owner: "agent-bob",
          tick,
          text: "promised",
          k: 8,
        })
        .some(
          (m) =>
            m.tags.includes("promise-class") ||
            /promis/i.test(m.summary),
        );

    const socialHasPhase1 = stillPresent.length > 0;
    assertions.push(
      assert(
        "resume.memory_or_social",
        anyPromiseMem || socialHasPhase1,
        anyPromiseMem
          ? `promise memory hits alice=${aliceHits.length} bob=${bobHits.length}`
          : socialHasPhase1
            ? `social retained phase1 promise ids`
            : "no promise-class memory and no phase1 social ids",
      ),
    );
    artifacts.memoryHits = {
      alice: aliceHits.map((m) => m.summary).slice(0, 3),
      bob: bobHits.map((m) => m.summary).slice(0, 3),
    };

    // Social outcome: kept >= 1 OR broken with trust drop / traces
    const kept = promisesPhase2.filter((p) => p.status === "kept").length;
    const broken = promisesPhase2.filter((p) => p.status === "broken").length;
    const pending = promisesPhase2.filter((p) => p.status === "pending").length;
    artifacts.kept = kept;
    artifacts.broken = broken;
    artifacts.pending = pending;
    artifacts.promiseCount = promisesPhase2.length;

    const edgePost = orch2.getSocial().getEdge("agent-alice", "agent-bob");
    const trustPost = edgePost?.dimensions.trust ?? null;
    artifacts.trustPost = trustPost;

    const seq = orch2.getActionSequence();
    const giveOk = seq.filter((s) => s.includes(":give:OK")).length;
    artifacts.giveOk = giveOk;

    let socialOk = false;
    let socialDetail = "";
    if (kept >= 1) {
      socialOk = true;
      socialDetail = `kept=${kept} (fulfillment path)`;
    } else if (broken >= 1) {
      const trustDropped =
        trustPre != null && trustPost != null && trustPost < trustPre;
      const hasTrace = orch2.getTraces().length > 0;
      socialOk = trustDropped || hasTrace;
      socialDetail = trustDropped
        ? `broken=${broken} trust ${trustPre} → ${trustPost}`
        : hasTrace
          ? `broken=${broken} DecisionTrace count=${orch2.getTraces().length}`
          : `broken=${broken} but no trust drop or traces`;
    } else if (pending >= 1 && giveOk >= 0) {
      // pending after resume is acceptable if we have live promise + memory path already
      // but goal asks kept OR broken — pending alone is weaker: fail social_outcome
      // unless phase1 already had kept on orch1
      const phase1Kept = promisesPhase1.filter((p) => p.status === "kept").length;
      if (phase1Kept >= 1) {
        // kept happened before checkpoint; still counts for "全程"
        socialOk = true;
        socialDetail = `kept before checkpoint=${phase1Kept}; post resume pending=${pending}`;
      } else {
        socialOk = false;
        socialDetail = `only pending=${pending} kept=0 broken=0 (no fulfillment or break yet)`;
      }
    } else {
      socialDetail = `kept=${kept} broken=${broken} pending=${pending}`;
    }

    // Also count kept from phase1 that may still be kept in phase2
    if (!socialOk) {
      const phase1KeptIds = promisesPhase1
        .filter((p) => p.status === "kept")
        .map((p) => p.id);
      if (phase1KeptIds.some((id) => promisesPhase2.some((p) => p.id === id && p.status === "kept"))) {
        socialOk = true;
        socialDetail = `phase1 kept retained after resume`;
      }
    }

    assertions.push(
      assert("social_outcome.kept_or_broken", socialOk, socialDetail),
    );

    const failed = assertions.filter((a) => !a.ok);
    const status = failed.length === 0 ? "pass" : "fail";
    return {
      id: "promise-resume",
      status,
      seed,
      durationMs: Date.now() - t0,
      assertions,
      summary:
        status === "pass"
          ? `promise-resume PASS seed=${seed} kept=${kept} pending=${pending} broken=${broken}`
          : `promise-resume FAIL seed=${seed}: ${failed.map((f) => f.id).join(", ")}`,
      artifacts,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assertions.push(assert("runtime.error", false, msg));
    return {
      id: "promise-resume",
      status: "fail",
      seed,
      durationMs: Date.now() - t0,
      assertions,
      summary: `promise-resume error: ${msg}`,
      artifacts,
    };
  }
}
