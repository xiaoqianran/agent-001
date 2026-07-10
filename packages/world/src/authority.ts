import type {
  ActionProposal,
  ActionResult,
  LocalObservation,
  ValidationResult,
  WorldDelta,
  DomainEventLite,
  Tick,
  AgentId,
} from "@gss/contracts";
import { cloneWorldState, type WorldState, type AgentBody } from "./types.js";

/**
 * WorldAuthority — sole physical write path for world facts.
 * Cognition/Agent must never hold this writable store; only Runtime does.
 */
export class WorldAuthority {
  private state: WorldState;

  constructor(initial: WorldState) {
    this.state = cloneWorldState(initial);
  }

  snapshot(): WorldState {
    return cloneWorldState(this.state);
  }

  load(state: WorldState): void {
    this.state = cloneWorldState(state);
  }

  getAgent(agentId: AgentId): AgentBody | undefined {
    return this.state.agents[agentId];
  }

  listAgentIds(): AgentId[] {
    return Object.keys(this.state.agents);
  }

  resourceTotals(): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const e of Object.values(this.state.entities)) {
      if (e.isPool) {
        totals[e.kind] = (totals[e.kind] ?? 0) + e.quantity;
      }
    }
    for (const a of Object.values(this.state.agents)) {
      for (const [k, v] of Object.entries(a.inventory)) {
        totals[`inv:${k}`] = (totals[`inv:${k}`] ?? 0) + v;
      }
    }
    return totals;
  }

  agentPlaces(): Record<string, string> {
    const m: Record<string, string> = {};
    for (const [id, a] of Object.entries(this.state.agents)) {
      m[id] = a.placeId;
    }
    return m;
  }

  /** Clear per-tick mutex after tick apply phase (runtime calls). */
  clearAllMutex(): void {
    for (const a of Object.values(this.state.agents)) {
      a.actionMutex = [];
    }
  }

  observe(agentId: AgentId, tick: Tick): LocalObservation {
    const agent = this.state.agents[agentId];
    if (!agent) {
      throw new Error(`UNKNOWN_ACTOR: ${agentId}`);
    }
    const place = this.state.places[agent.placeId];
    if (!place) {
      throw new Error(`missing place ${agent.placeId}`);
    }

    const adjacentPlaces = place.adjacent
      .map((id) => this.state.places[id])
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        name: p.name,
        adjacent: [...p.adjacent],
        visibility: p.visibility,
      }));

    const entitiesHere = Object.values(this.state.entities)
      .filter((e) => e.placeId === place.id && !e.isPool)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        placeId: e.placeId,
        label: e.label,
        quantity: e.quantity,
        portable: e.portable,
      }));

    const resourcePools = Object.values(this.state.entities)
      .filter((e) => e.placeId === place.id && e.isPool)
      .map((e) => ({ id: e.id, kind: e.kind, quantity: e.quantity }));

    const agentsHere = Object.values(this.state.agents)
      .filter((a) => a.placeId === place.id)
      .map((a) => ({ id: a.id, placeId: a.placeId, name: a.name }));

    return {
      tick,
      observer: agentId,
      place: {
        id: place.id,
        name: place.name,
        adjacent: [...place.adjacent],
        visibility: place.visibility,
      },
      adjacentPlaces,
      entitiesHere,
      agentsHere,
      resourcePools,
      selfInventory: { ...agent.inventory },
    };
  }

  validate(proposal: ActionProposal): ValidationResult {
    const actor = this.state.agents[proposal.actor];
    if (!actor) {
      return { ok: false, code: "UNKNOWN_ACTOR", message: "actor not in world" };
    }

    const slots = proposal.structured.mutexSlots;
    for (const s of slots) {
      if (actor.actionMutex.includes(s)) {
        return {
          ok: false,
          code: "MUTEX",
          message: `mutex conflict on ${s}`,
        };
      }
    }
    // rest conflicts with everything else already held
    if (slots.includes("rest") && actor.actionMutex.length > 0) {
      return { ok: false, code: "MUTEX", message: "rest requires free body" };
    }
    if (actor.actionMutex.includes("rest") && slots.length > 0) {
      return { ok: false, code: "MUTEX", message: "already resting" };
    }

    const verb = proposal.structured.verb;
    switch (verb) {
      case "move": {
        const dest = proposal.structured.targetPlaceId;
        if (!dest) {
          return { ok: false, code: "INVALID_ARGS", message: "move needs targetPlaceId" };
        }
        const place = this.state.places[actor.placeId];
        if (!place?.adjacent.includes(dest)) {
          return {
            ok: false,
            code: "OUT_OF_RANGE",
            message: `${dest} not adjacent to ${actor.placeId}`,
          };
        }
        if (!this.state.places[dest]) {
          return { ok: false, code: "UNKNOWN_TARGET", message: "unknown place" };
        }
        return { ok: true, code: "OK" };
      }
      case "rest":
        return { ok: true, code: "OK" };
      case "take": {
        const kind = proposal.structured.itemKind;
        const qty = proposal.structured.quantity ?? 1;
        if (!kind) {
          return { ok: false, code: "INVALID_ARGS", message: "take needs itemKind" };
        }
        const pool = Object.values(this.state.entities).find(
          (e) =>
            e.isPool &&
            e.kind === kind &&
            e.placeId === actor.placeId &&
            e.quantity >= qty,
        );
        if (!pool) {
          return {
            ok: false,
            code: "INSUFFICIENT_RESOURCE",
            message: `no ${kind} pool at place`,
          };
        }
        if (actor.carriedMass + qty > actor.carryCapacity) {
          return { ok: false, code: "PRECONDITION", message: "over carry capacity" };
        }
        return { ok: true, code: "OK" };
      }
      case "give": {
        const target = proposal.structured.targetAgentId;
        const kind = proposal.structured.itemKind;
        const qty = proposal.structured.quantity ?? 1;
        if (!target || !kind) {
          return { ok: false, code: "INVALID_ARGS", message: "give needs target+itemKind" };
        }
        const other = this.state.agents[target];
        if (!other) {
          return { ok: false, code: "UNKNOWN_TARGET" };
        }
        if (other.placeId !== actor.placeId) {
          return { ok: false, code: "OUT_OF_RANGE", message: "not co-located" };
        }
        if ((actor.inventory[kind] ?? 0) < qty) {
          return { ok: false, code: "INSUFFICIENT_RESOURCE" };
        }
        return { ok: true, code: "OK" };
      }
      case "speak": {
        // target optional: if set, must exist; co-location checked at apply for delivery
        const target = proposal.structured.targetAgentId;
        if (target && !this.state.agents[target]) {
          return { ok: false, code: "UNKNOWN_TARGET", message: "speak target missing" };
        }
        return { ok: true, code: "OK" };
      }
      case "work": {
        // produce food at woods or store
        if (!["woods", "storehouse"].includes(actor.placeId) && actor.placeId !== "cabin") {
          // allow work at cabin/woods/storehouse for solo-cabin
        }
        const workPlaces = new Set(
          Object.keys(this.state.places).filter((p) =>
            ["woods", "storehouse", "cabin"].includes(p),
          ),
        );
        if (!workPlaces.has(actor.placeId) && Object.keys(this.state.places).length > 0) {
          // still allow if place exists — work generates food pool at place
        }
        return { ok: true, code: "OK" };
      }
      case "observe":
        return { ok: true, code: "OK" };
      default:
        return {
          ok: false,
          code: "PRECONDITION",
          message: `verb ${verb} not supported in GOAL-001 world`,
        };
    }
  }

  apply(proposal: ActionProposal, tick: Tick): ActionResult {
    const validation = this.validate(proposal);
    if (!validation.ok) {
      const events: DomainEventLite[] = [
        {
          type: "action.rejected",
          tick,
          actionId: proposal.id,
          actor: proposal.actor,
          code: validation.code,
        },
      ];
      return {
        actionId: proposal.id,
        actor: proposal.actor,
        tick,
        failureCode: validation.code,
        producedEvents: events,
        perceptsForActor: [`rejected:${validation.code}:${validation.message ?? ""}`],
      };
    }

    const actor = this.state.agents[proposal.actor]!;
    const delta: WorldDelta = {};
    const percepts: string[] = [];
    const verb = proposal.structured.verb;

    // acquire mutex
    actor.actionMutex = [...actor.actionMutex, ...proposal.structured.mutexSlots];

    switch (verb) {
      case "move": {
        const dest = proposal.structured.targetPlaceId!;
        actor.placeId = dest;
        delta.moved = [{ entityId: actor.id, to: dest }];
        percepts.push(`moved_to:${dest}`);
        break;
      }
      case "rest": {
        percepts.push("rested");
        break;
      }
      case "take": {
        const kind = proposal.structured.itemKind!;
        const qty = proposal.structured.quantity ?? 1;
        const pool = Object.values(this.state.entities).find(
          (e) =>
            e.isPool &&
            e.kind === kind &&
            e.placeId === actor.placeId &&
            e.quantity >= qty,
        )!;
        pool.quantity -= qty;
        actor.inventory[kind] = (actor.inventory[kind] ?? 0) + qty;
        actor.carriedMass += qty;
        delta.resources = [{ poolId: pool.id, delta: -qty }];
        delta.inventory = [{ agentId: actor.id, itemKind: kind, delta: qty }];
        percepts.push(`took:${kind}x${qty}`);
        break;
      }
      case "give": {
        const target = proposal.structured.targetAgentId!;
        const kind = proposal.structured.itemKind!;
        const qty = proposal.structured.quantity ?? 1;
        const other = this.state.agents[target]!;
        actor.inventory[kind] -= qty;
        if (actor.inventory[kind] <= 0) delete actor.inventory[kind];
        actor.carriedMass = Math.max(0, actor.carriedMass - qty);
        other.inventory[kind] = (other.inventory[kind] ?? 0) + qty;
        other.carriedMass += qty;
        delta.inventory = [
          { agentId: actor.id, itemKind: kind, delta: -qty },
          { agentId: target, itemKind: kind, delta: qty },
        ];
        percepts.push(`gave:${kind}x${qty}:to:${target}`);
        break;
      }
      case "speak": {
        const intent = String(proposal.structured.args?.intent ?? "inform");
        percepts.push(`spoke:${intent}:${proposal.utterance ?? ""}`);
        break;
      }
      case "work": {
        // add food to local pool or create
        let pool = Object.values(this.state.entities).find(
          (e) => e.isPool && e.kind === "food" && e.placeId === actor.placeId,
        );
        if (!pool) {
          const id = `pool:food:${actor.placeId}`;
          this.state.entities[id] = {
            id,
            kind: "food",
            placeId: actor.placeId,
            quantity: 0,
            portable: false,
            isPool: true,
            label: "food pool",
          };
          pool = this.state.entities[id];
          delta.created = [id];
        }
        pool.quantity += 1;
        delta.resources = [...(delta.resources ?? []), { poolId: pool.id, delta: 1 }];
        percepts.push("worked:+1 food");
        break;
      }
      case "observe": {
        percepts.push("observed");
        break;
      }
    }

    const events: DomainEventLite[] = [
      {
        type: "action.applied",
        tick,
        actionId: proposal.id,
        actor: proposal.actor,
        verb,
      },
    ];

    if (verb === "speak") {
      const intent = String(proposal.structured.args?.intent ?? "inform");
      const text = proposal.utterance ?? "";
      const explicitTarget = proposal.structured.targetAgentId;
      const candidates = explicitTarget
        ? [this.state.agents[explicitTarget]].filter(Boolean)
        : Object.values(this.state.agents).filter((o) => o.id !== actor.id);

      if (explicitTarget && !this.state.agents[explicitTarget]) {
        events.push({
          type: "message.undelivered",
          tick,
          messageId: `msg-${proposal.id}-x`,
          from: actor.id,
          to: explicitTarget,
          reason: "no_target",
        });
      } else {
        for (const other of candidates) {
          if (!other || other.id === actor.id) continue;
          if (other.placeId === actor.placeId) {
            events.push({
              type: "message.delivered",
              tick,
              messageId: `msg-${proposal.id}-${other.id}`,
              from: actor.id,
              to: other.id,
              text,
              intent,
              coLocated: true,
            });
            percepts.push(`delivered:${other.id}:${intent}`);
          } else if (explicitTarget) {
            events.push({
              type: "message.undelivered",
              tick,
              messageId: `msg-${proposal.id}-${other.id}`,
              from: actor.id,
              to: other.id,
              reason: "not_co_located",
            });
            percepts.push(`undelivered:${other.id}:not_co_located`);
          }
        }
      }

      // promise speech also emits promise.made when intent=promise and co-located delivery succeeded
      if (intent === "promise" && explicitTarget) {
        const delivered = events.some(
          (e) => e.type === "message.delivered" && e.to === explicitTarget,
        );
        if (delivered) {
          const content =
            String(proposal.structured.args?.promiseContent ?? text) ||
            `promise to ${explicitTarget}`;
          const promiseId = `prom-${proposal.id}`;
          events.push({
            type: "promise.made",
            tick,
            promiseId,
            from: actor.id,
            to: explicitTarget,
            content,
          });
          percepts.push(`promise_made:${promiseId}`);
        }
      }
    }

    return {
      actionId: proposal.id,
      actor: proposal.actor,
      tick,
      worldDelta: delta,
      producedEvents: events,
      perceptsForActor: percepts,
    };
  }
}
