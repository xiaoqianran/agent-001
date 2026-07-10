import type { DomainEventLite } from "@gss/contracts";
import type { TimelineEvent } from "./types.js";
import type { InjectionAudit } from "./types.js";

/** Build ordered timeline from event log, action sequence, and inject audit. */
export function buildTimeline(args: {
  eventLog: DomainEventLite[];
  actionSequence: string[];
  auditLog?: InjectionAudit[];
  fromTick?: number;
  toTick?: number;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const from = args.fromTick ?? 0;
  const to = args.toTick ?? Number.MAX_SAFE_INTEGER;

  for (const e of args.eventLog) {
    const tick = "tick" in e ? (e as { tick: number }).tick : 0;
    if (tick < from || tick > to) continue;
    events.push(domainToTimeline(e));
  }

  for (const line of args.actionSequence) {
    // format: tick:actor:verb:OK|REJECT:...
    const parts = line.split(":");
    const tick = Number(parts[0]);
    if (Number.isNaN(tick) || tick < from || tick > to) continue;
    events.push({
      tick,
      type: "action.sequence",
      actor: parts[1],
      summary: line,
      refs: [line],
    });
  }

  for (const a of args.auditLog ?? []) {
    if (a.tick < from || a.tick > to) continue;
    events.push({
      tick: a.tick,
      type: `inject.${a.kind}`,
      summary: a.result,
      refs: [a.id],
    });
  }

  events.sort((x, y) => x.tick - y.tick || x.type.localeCompare(y.type));
  return events;
}

function domainToTimeline(e: DomainEventLite): TimelineEvent {
  const tick = "tick" in e ? e.tick : 0;
  switch (e.type) {
    case "action.applied":
      return {
        tick,
        type: e.type,
        actor: e.actor,
        summary: `${e.actor} applied ${e.verb}`,
        refs: [e.actionId],
      };
    case "action.rejected":
      return {
        tick,
        type: e.type,
        actor: e.actor,
        summary: `${e.actor} rejected ${e.code}`,
        refs: [e.actionId],
      };
    case "message.delivered":
      return {
        tick,
        type: e.type,
        actor: e.from,
        summary: `${e.from} -> ${e.to}: ${e.text.slice(0, 40)}`,
      };
    case "promise.made":
      return {
        tick,
        type: e.type,
        actor: e.from,
        summary: `promise ${e.from} -> ${e.to}: ${e.content}`,
        refs: [e.promiseId],
      };
    case "tick.completed":
      return {
        tick,
        type: e.type,
        summary: `tick ${e.tick} day ${e.day}`,
      };
    case "agent.fault":
      return {
        tick,
        type: e.type,
        actor: e.agentId,
        summary: `fault ${e.error.message}`,
      };
    default:
      return {
        tick,
        type: (e as { type: string }).type,
        summary: JSON.stringify(e).slice(0, 120),
      };
  }
}
