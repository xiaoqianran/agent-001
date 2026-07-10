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
}

/**
 * Rule-first multi-stage cognitive cycle.
 * Stages: Perceive → Attend → Feel → Deliberate → Decide → Act(proposal) → Feedback(via runtime).
 * Does NOT import the world package — only consumes LocalObservation.
 */
export class RuleCognitiveEngine {
  private readonly llm: LlmPort;
  private forceThrow: boolean;

  constructor(opts: CognitiveEngineOptions = {}) {
    this.llm = opts.llm ?? new StubLlm();
    this.forceThrow = opts.forceThrow ?? false;
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

    // 1 Perceive — observation already provided
    const obs = input.observation;

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
    if (attended.length === 0) {
      attended.push({ kind: "idle", salience: 0.1 });
    }

    // 3–4 Retrieve simplified (no memory store yet)
    const retrievedMemoryIds: string[] = [];

    // 5 Feel — update emotion lightly from needs
    const emotion = { ...state.emotion };
    if (state.needs.hunger > 0.7) emotion.fear = clamp01(emotion.fear + 0.05);
    if (state.needs.rest > 0.7) emotion.sadness = clamp01(emotion.sadness + 0.03);

    // 6 Deliberate — rule options
    const options: DecisionTrace["options"] = [];
    const add = (action: StructuredAction, score: number) => {
      options.push({ action, score });
    };

    const foodHere = obs.resourcePools.find((p) => p.kind === "food" && p.quantity > 0);

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
      // prefer storehouse then woods
      const targets = ["storehouse", "woods", "cabin"].filter((p) =>
        obs.place.adjacent.includes(p) || obs.adjacentPlaces.some((a) => a.id === p),
      );
      for (const t of targets) {
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

    if (state.needs.rest > 0.55 || input.clock.hourInDay >= 21 || input.clock.hourInDay < 5) {
      add({ verb: "rest", mutexSlots: ["rest"] }, 0.7 + state.needs.rest * 0.2);
    }

    if (state.needs.energy < 0.5 && state.needs.hunger < 0.6) {
      add({ verb: "work", mutexSlots: ["manual"] }, 0.55);
    }

    // explore / maintain
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
    add(
      {
        verb: "speak",
        mutexSlots: ["speech"],
        visibility: "private",
      },
      0.05,
    );

    // optional LLM flavor for utterance only (does not choose action)
    let utterance: string | undefined;
    let tokensUsed = 0;
    if (this.llm.name !== "stub" || process.env.GSS_LLM_STUB_UTTERANCE === "1") {
      const resp = await this.llm.complete({
        messages: [
          {
            role: "system",
            content: "One short first-person status line for a cabin dweller.",
          },
          {
            role: "user",
            content: `place=${obs.place.id} hunger=${state.needs.hunger.toFixed(2)} rest=${state.needs.rest.toFixed(2)}`,
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

    // 7 Decide — satisficing: highest score
    options.sort((a, b) => b.score - a.score);
    const best = options[0];
    const actionId = `act-${input.agentId}-${input.clock.tick}`;
    let action: ActionProposal | undefined;
    if (best) {
      action = {
        id: actionId,
        actor: input.agentId,
        tickProposed: input.clock.tick,
        structured: best.action,
        utterance:
          best.action.verb === "speak"
            ? utterance ?? "All quiet at the cabin."
            : utterance,
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
      goalsConsidered: state.goals.filter((g) => g.status === "active").map((g) => g.id),
      options,
      chosen: action?.id,
      reflectionInsightsUsed: [],
      modelTier: input.budget.tier,
    };

    // internal updates from anticipated act (runtime may refine after feedback)
    const internalUpdates: CognitiveTickOutput["internalUpdates"] = {
      emotion,
      needs: {},
      physiology: {},
    };

    return {
      action,
      internalUpdates,
      memoryOps: [{ op: "encode_intent", payload: { actionId: action?.id } }],
      decisionTrace,
      tokensUsed,
    };
  }

  /** Apply action feedback to needs after world apply */
  applyFeedback(
    state: AgentState,
    percepts: string[],
  ): AgentState {
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
    }
    next.physiology.hunger = next.needs.hunger;
    next.physiology.fatigue = next.needs.rest;
    next.physiology.energy = next.needs.energy;
    return next;
  }
}
