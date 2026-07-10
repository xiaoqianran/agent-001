import type {
  ActionProposal,
  CognitiveTickInput,
  CognitiveTickOutput,
  DecisionTrace,
  StructuredAction,
} from "@gss/contracts";
import type { AgentState } from "@gss/agent";
import { clamp01 } from "@gss/agent";
import type { LlmPort } from "@gss/llm";
import { StubLlm } from "@gss/llm";

export interface CognitiveEngineOptions {
  llm?: LlmPort;
  /** When true, cognitive tick throws (for fault isolation tests) */
  forceThrow?: boolean;
  /**
   * Role bias:
   * - promisor/promisee: dyad
   * - cooperative / grabber / neutral: trio scarce
   */
  roleHint?:
    | "promisor"
    | "promisee"
    | "neutral"
    | "cooperative"
    | "grabber"
    | "free_rider";
}

/**
 * Rule-first multi-stage cognitive cycle with Retrieve (GOAL-002).
 * Does NOT import the world package — only consumes LocalObservation + read-only social/memories.
 */
export class RuleCognitiveEngine {
  private readonly llm: LlmPort;
  private forceThrow: boolean;
  private roleHint: NonNullable<CognitiveEngineOptions["roleHint"]>;

  constructor(opts: CognitiveEngineOptions = {}) {
    this.llm = opts.llm ?? new StubLlm();
    this.forceThrow = opts.forceThrow ?? false;
    this.roleHint = opts.roleHint ?? "neutral";
  }

  setForceThrow(v: boolean): void {
    this.forceThrow = v;
  }

  async tick(
    state: AgentState,
    input: CognitiveTickInput,
  ): Promise<CognitiveTickOutput> {
    if (this.forceThrow) {
      throw new Error("injected cognitive fault");
    }

    const obs = input.observation;
    const social = input.social;
    const memories = input.memories ?? [];

    // 2 Attend
    const attended: DecisionTrace["attended"] = [];
    if (state.needs.hunger > 0.55) {
      attended.push({ kind: "need.hunger", salience: state.needs.hunger });
    }
    if (state.needs.rest > 0.6) {
      attended.push({ kind: "need.rest", salience: state.needs.rest });
    }
    if (state.needs.energy < 0.35) {
      attended.push({ kind: "need.energy", salience: 1 - state.needs.energy });
    }
    for (const p of obs.resourcePools) {
      attended.push({
        kind: "resource",
        salience: Math.min(1, p.quantity / 10),
        ref: p.id,
      });
    }
    if (social?.pendingPromisesAsPromisor.length) {
      attended.push({
        kind: "promise.owed",
        salience: 0.9,
        ref: social.pendingPromisesAsPromisor[0]!.id,
      });
    }
    if (memories.length) {
      attended.push({
        kind: "memory",
        salience: memories[0]!.importance,
        ref: memories[0]!.id,
      });
    }
    if (attended.length === 0) {
      attended.push({ kind: "idle", salience: 0.1 });
    }

    // 3–4 Retrieve — ids already provided by runtime from MemoryStore
    const retrievedMemoryIds = memories.map((m) => m.id);

    // 5 Feel
    const emotion = { ...state.emotion };
    if (state.needs.hunger > 0.7) emotion.fear = clamp01(emotion.fear + 0.05);
    if (state.needs.rest > 0.7) emotion.sadness = clamp01(emotion.sadness + 0.03);
    if (social?.pendingPromisesAsPromisor.length) {
      emotion.guilt = clamp01(emotion.guilt + 0.05);
    }

    // 6 Deliberate
    const options: DecisionTrace["options"] = [];
    const add = (action: StructuredAction, score: number) => {
      options.push({ action, score });
    };

    const foodHere = obs.resourcePools.find((p) => p.kind === "food" && p.quantity > 0);
    const othersHere = obs.agentsHere.filter((a) => a.id !== input.agentId);
    const inv = obs.selfInventory ?? {};

    // Fulfill pending promise: only give when inventory sufficient; else take/move first
    const myPromise = social?.pendingPromisesAsPromisor[0];
    if (myPromise) {
      const itemKind = myPromise.itemKind ?? "food";
      const qty = myPromise.quantity ?? 1;
      const have = inv[itemKind] ?? 0;
      const canGive = have >= qty;
      const targetHere = othersHere.some((a) => a.id === myPromise.to);

      if (canGive && targetHere) {
        // Highest priority: deliver when we hold the item and promisee is here
        add(
          {
            verb: "give",
            targetAgentId: myPromise.to,
            itemKind,
            quantity: qty,
            mutexSlots: ["manual"],
          },
          0.99,
        );
      } else if (!canGive && foodHere) {
        // Acquire before giving — must outrank any give option
        add(
          {
            verb: "take",
            itemKind: "food",
            quantity: 1,
            mutexSlots: ["manual"],
          },
          0.97,
        );
      } else if (!canGive) {
        // Move to food sources
        for (const t of ["storehouse", "woods", "cabin"]) {
          if (obs.place.adjacent.includes(t)) {
            add(
              {
                verb: "move",
                targetPlaceId: t,
                mutexSlots: ["locomotion"],
              },
              0.93 + (t === "storehouse" ? 0.03 : 0),
            );
          }
        }
      } else if (canGive && !targetHere) {
        // Have item, seek promisee — prefer cabin as meeting place
        for (const t of obs.place.adjacent) {
          add(
            {
              verb: "move",
              targetPlaceId: t,
              mutexSlots: ["locomotion"],
            },
            0.91 + (t === "cabin" ? 0.04 : 0),
          );
        }
      }
    }

    // Early dyad: promisor makes promise when co-located and no pending
    if (
      !myPromise &&
      (this.roleHint === "promisor" || input.clock.tick <= 6) &&
      othersHere.length > 0 &&
      input.clock.tick <= 12
    ) {
      const other = othersHere[0]!;
      add(
        {
          verb: "speak",
          targetAgentId: other.id,
          mutexSlots: ["speech"],
          args: {
            intent: "promise",
            promiseContent: "I will give you food soon",
            // Enough ticks to take food and return (several days of hours)
            dueTick: input.clock.tick + 100,
          },
        },
        this.roleHint === "promisor" ? 0.92 : 0.35,
      );
    }

    // Promisee may request
    if (
      this.roleHint === "promisee" &&
      othersHere.length > 0 &&
      !social?.pendingPromisesAsPromisee.length &&
      input.clock.tick < 10
    ) {
      add(
        {
          verb: "speak",
          targetAgentId: othersHere[0]!.id,
          mutexSlots: ["speech"],
          args: { intent: "request" },
        },
        0.4,
      );
    }

    if (state.needs.hunger > 0.5 && foodHere) {
      add(
        {
          verb: "take",
          itemKind: "food",
          quantity: 1,
          mutexSlots: ["manual"],
        },
        0.9 + state.needs.hunger * 0.1,
      );
    }

    if (state.needs.hunger > 0.5 && !foodHere) {
      for (const t of ["storehouse", "woods", "cabin"]) {
        if (obs.place.adjacent.includes(t)) {
          add(
            {
              verb: "move",
              targetPlaceId: t,
              mutexSlots: ["locomotion"],
            },
            0.75 + (t === "storehouse" ? 0.1 : 0),
          );
        }
      }
    }

    if (
      state.needs.rest > 0.55 ||
      input.clock.hourInDay >= 21 ||
      input.clock.hourInDay < 5
    ) {
      add({ verb: "rest", mutexSlots: ["rest"] }, 0.7 + state.needs.rest * 0.2);
    }

    if (state.needs.energy < 0.5 && state.needs.hunger < 0.6) {
      add({ verb: "work", mutexSlots: ["manual"] }, 0.55);
    }

    // Trio / commons role biases
    if ((this.roleHint === "grabber" || this.roleHint === "free_rider") && foodHere) {
      add(
        {
          verb: "take",
          itemKind: "food",
          quantity: 1,
          mutexSlots: ["manual"],
        },
        0.93,
      );
    }
    // Free-rider: prefer withdrawing public stock at cabin
    if (this.roleHint === "free_rider") {
      if (obs.place.id === "cabin") {
        add(
          {
            verb: "withdraw_public",
            quantity: 1,
            mutexSlots: ["manual"],
            args: { publicGoodId: "granary" },
          },
          0.96,
        );
      } else if (obs.place.adjacent.includes("cabin")) {
        add(
          {
            verb: "move",
            targetPlaceId: "cabin",
            mutexSlots: ["locomotion"],
          },
          0.9,
        );
      }
    }
    if (this.roleHint === "cooperative") {
      const haveFood = (inv.food ?? 0) >= 1;
      // Contribute to granary when at cabin with food
      if (haveFood && obs.place.id === "cabin") {
        add(
          {
            verb: "contribute",
            itemKind: "food",
            quantity: 1,
            mutexSlots: ["manual"],
            args: { publicGoodId: "granary" },
          },
          0.94,
        );
      }
      if (haveFood && othersHere.length > 0) {
        add(
          {
            verb: "give",
            targetAgentId: othersHere[0]!.id,
            itemKind: "food",
            quantity: 1,
            mutexSlots: ["manual"],
          },
          0.72,
        );
      }
      if (!haveFood && foodHere) {
        add(
          {
            verb: "take",
            itemKind: "food",
            quantity: 1,
            mutexSlots: ["manual"],
          },
          0.85,
        );
      }
      // go cabin to contribute
      if (haveFood && obs.place.id !== "cabin" && obs.place.adjacent.includes("cabin")) {
        add(
          {
            verb: "move",
            targetPlaceId: "cabin",
            mutexSlots: ["locomotion"],
          },
          0.88,
        );
      }
      if (haveFood && obs.place.id !== "cabin") {
        for (const t of obs.place.adjacent) {
          add(
            {
              verb: "move",
              targetPlaceId: t,
              mutexSlots: ["locomotion"],
            },
            0.7 + (t === "cabin" || t === "woods" ? 0.1 : 0),
          );
        }
      }
      add({ verb: "work", mutexSlots: ["manual"] }, 0.62);
    }

    for (const adj of obs.place.adjacent) {
      add(
        {
          verb: "move",
          targetPlaceId: adj,
          mutexSlots: ["locomotion"],
        },
        0.25,
      );
    }

    add({ verb: "observe", mutexSlots: ["observe"] }, 0.15);

    // GOAL-003: micro-weight options matching active descriptive norms at this place
    const norms = social?.activeNorms ?? [];
    if (norms.length) {
      attended.push({
        kind: "norm.active",
        salience: norms[0]!.strength,
        ref: norms[0]!.id,
      });
    }
    for (const n of norms) {
      if (n.placeId !== obs.place.id) continue;
      for (const o of options) {
        if (o.action.verb === n.actionType) {
          o.score += 0.08 * n.strength;
        }
      }
    }

    // Boost options that align with retrieved promise memories (never promote invalid give)
    for (const m of memories) {
      if (m.tags.includes("promise-class") && m.summary.includes("promised")) {
        for (const o of options) {
          if (o.action.verb === "take") o.score += 0.05;
          if (
            o.action.verb === "give" &&
            (inv[o.action.itemKind ?? "food"] ?? 0) >= (o.action.quantity ?? 1)
          ) {
            o.score += 0.05;
          }
        }
      }
    }

    // Strip give/contribute options that exceed inventory (safety net)
    for (const o of options) {
      if (o.action.verb === "give" || o.action.verb === "contribute") {
        const need = o.action.quantity ?? 1;
        const kind = o.action.itemKind ?? "food";
        if ((inv[kind] ?? 0) < need) {
          o.score = -1;
          o.rejectReason = "insufficient_inventory";
        }
      }
    }

    let utterance: string | undefined;
    let tokensUsed = 0;
    if (this.llm.name !== "stub" || process.env.GSS_LLM_STUB_UTTERANCE === "1") {
      const resp = await this.llm.complete({
        messages: [
          {
            role: "system",
            content: "One short first-person status line.",
          },
          {
            role: "user",
            content: `place=${obs.place.id} hunger=${state.needs.hunger.toFixed(2)}`,
          },
        ],
        temperature: 0,
        maxTokens: 64,
      });
      tokensUsed = resp.tokensUsed;
      if (resp.content && !resp.content.startsWith("[llm-")) {
        utterance = resp.content.slice(0, 120);
      }
    }

    options.sort((a, b) => b.score - a.score);
    const best = options.find((o) => o.score >= 0) ?? options[0];
    const actionId = `act-${input.agentId}-${input.clock.tick}`;
    let action: ActionProposal | undefined;
    if (best && best.score >= 0) {
      const u =
        best.action.verb === "speak"
          ? utterance ??
            (best.action.args?.intent === "promise"
              ? "I promise to bring you food."
              : best.action.args?.intent === "request"
                ? "Could you help with food?"
                : "Hello.")
          : utterance;
      action = {
        id: actionId,
        actor: input.agentId,
        tickProposed: input.clock.tick,
        structured: best.action,
        utterance: u,
      };
    }

    const dominantNeeds = Object.entries(state.needs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    const decisionTrace: DecisionTrace = {
      agentId: input.agentId,
      tick: input.clock.tick,
      attended,
      retrievedMemoryIds,
      beliefsUsed: [],
      personModelsUsed: [],
      emotionSnapshot: emotion,
      physiologySnapshot: { ...state.physiology },
      dominantNeeds,
      goalsConsidered: state.goals
        .filter((g) => g.status === "active")
        .map((g) => g.id),
      options,
      chosen: action?.id,
      reflectionInsightsUsed: [],
      modelTier: input.budget.tier,
    };

    return {
      action,
      internalUpdates: { emotion, needs: {}, physiology: {} },
      memoryOps: [{ op: "encode_intent", payload: { actionId: action?.id } }],
      decisionTrace,
      tokensUsed,
    };
  }

  applyFeedback(state: AgentState, percepts: string[]): AgentState {
    const next = structuredClone(state);
    for (const p of percepts) {
      if (p.startsWith("took:food")) {
        next.needs.hunger = clamp01(next.needs.hunger - 0.35);
        next.needs.energy = clamp01(next.needs.energy + 0.15);
      }
      if (p === "rested") {
        next.needs.rest = clamp01(next.needs.rest - 0.4);
        next.needs.energy = clamp01(next.needs.energy + 0.25);
        next.physiology.sleepDebt = clamp01(next.physiology.sleepDebt - 0.2);
      }
      if (p.startsWith("worked:")) {
        next.needs.energy = clamp01(next.needs.energy - 0.1);
        next.needs.rest = clamp01(next.needs.rest + 0.05);
      }
      if (p.startsWith("moved_to:")) {
        next.needs.energy = clamp01(next.needs.energy - 0.05);
        next.placeId = p.slice("moved_to:".length);
      }
      if (p.startsWith("gave:food")) {
        next.needs.energy = clamp01(next.needs.energy - 0.02);
      }
    }
    next.physiology.hunger = next.needs.hunger;
    next.physiology.fatigue = next.needs.rest;
    next.physiology.energy = next.needs.energy;
    return next;
  }
}
