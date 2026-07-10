import type { AgentId } from "@gss/contracts";
import type { TickOrchestrator } from "@gss/runtime";
import {
  normalizeInstitution,
  explainFromOrch,
  type InstitutionParams,
  type ExplainQuery,
  type EvidenceChain,
} from "@gss/experiment";
import type {
  AgentViewDTO,
  Injection,
  InjectionAudit,
  TimelineEvent,
  WorldViewDTO,
} from "./types.js";
import { buildTimeline } from "./timeline.js";

/**
 * Control Room API stub — no UI. All world mutations go through WorldAuthority.
 */
export class ControlRoomService {
  private frozen = false;
  private audit: InjectionAudit[] = [];
  private auditSeq = 1;
  private institution: InstitutionParams = {};

  constructor(private readonly orch: TickOrchestrator) {}

  isFrozen(): boolean {
    return this.frozen;
  }

  freeze(): void {
    this.frozen = true;
    this.orch.setFrozen(true);
  }

  resume(): void {
    this.frozen = false;
    this.orch.setFrozen(false);
  }

  getInstitution(): InstitutionParams {
    return { ...this.institution };
  }

  setInstitution(inst: InstitutionParams): void {
    this.institution = normalizeInstitution({
      ...this.institution,
      ...inst,
    });
    this.orch.applyInstitution(this.institution);
  }

  getWorldView(): WorldViewDTO {
    const clock = this.orch.getClock();
    const agents = this.orch.getSimulationState().agents;
    const g = this.orch.world.getPublicGood("granary");
    return {
      tick: clock.tick,
      day: clock.day,
      scenarioId: this.orch.getSimulationState().scenarioId,
      frozen: this.frozen,
      places: Object.keys(this.orch.world.snapshot().places),
      agents: Object.values(agents).map((a) => ({
        id: a.id,
        name: a.name,
        placeId: a.placeId,
      })),
      granary: g
        ? {
            stock: g.stock,
            totalContributed: g.totalContributed,
            totalWithdrawn: g.totalWithdrawn,
          }
        : undefined,
      institution: this.getInstitution(),
    };
  }

  getAgentView(id: AgentId): AgentViewDTO {
    const st = this.orch.getSimulationState().agents[id];
    if (!st) throw new Error(`unknown agent ${id}`);
    const body = this.orch.world.getAgent(id);
    const traces = this.orch.getTraces().filter((t) => t.agentId === id);
    const last = traces[traces.length - 1];
    return {
      id,
      placeId: st.placeId,
      needs: { ...st.needs },
      inventory: { ...(body?.inventory ?? {}) },
      lastTrace: last
        ? {
            tick: last.tick,
            chosen: last.chosen,
            dominantNeeds: last.dominantNeeds,
            optionsTop: last.options
              .slice(0, 3)
              .map((o) => `${o.action.verb}:${o.score.toFixed(2)}`),
          }
        : undefined,
    };
  }

  listTimeline(fromTick?: number, toTick?: number): TimelineEvent[] {
    return buildTimeline({
      eventLog: this.orch.getSimulationState().eventLog,
      actionSequence: this.orch.getActionSequence(),
      auditLog: this.audit,
      fromTick,
      toTick,
    });
  }

  getAuditLog(): InjectionAudit[] {
    return this.audit.map((a) => structuredClone(a));
  }

  /** Read-only evidence chain (GOAL-010). Does not mutate world. */
  explain(query: ExplainQuery): EvidenceChain {
    return explainFromOrch(this.orch, query);
  }

  inject(injection: Injection): InjectionAudit {
    const tick = this.orch.getClock().tick;
    let result = "ok";
    try {
      switch (injection.kind) {
        case "resource": {
          const p = injection.payload;
          if (typeof p.granaryDelta === "number") {
            const stock = this.orch.world.adjustGranaryStock(p.granaryDelta);
            result = `granaryStock=${stock}`;
          } else if (
            typeof p.placeId === "string" &&
            typeof p.kind === "string" &&
            typeof p.delta === "number"
          ) {
            const q = this.orch.world.adjustPool(p.placeId, p.kind, p.delta);
            result = `pool ${p.placeId}/${p.kind}=${q}`;
          } else {
            throw new Error("resource payload needs granaryDelta or placeId+kind+delta");
          }
          break;
        }
        case "oracle_message": {
          const agentId = String(pGet(injection.payload, "agentId", ""));
          const text = String(pGet(injection.payload, "text", "oracle"));
          if (!agentId) throw new Error("oracle_message needs agentId");
          this.orch.getMemory().encode({
            owner: agentId,
            kind: "episodic",
            summary: `oracle: ${text}`,
            tick,
            tags: ["oracle", "injected"],
            importance: 0.85,
          });
          result = `oracle to ${agentId}`;
          break;
        }
        case "param": {
          const inst = injection.payload as InstitutionParams;
          this.setInstitution(inst);
          result = `institution updated ${JSON.stringify(this.institution)}`;
          break;
        }
        case "event": {
          const summary = String(pGet(injection.payload, "summary", "event"));
          this.orch.getBus().publish({
            type: "tick.completed",
            tick,
            day: this.orch.getClock().day,
          });
          result = `event logged: ${summary}`;
          break;
        }
        default:
          throw new Error(`unknown inject kind`);
      }
    } catch (e) {
      result = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    const entry: InjectionAudit = {
      id: `inj-${this.auditSeq++}`,
      tick,
      kind: injection.kind,
      payload: structuredClone(injection.payload),
      result,
      at: new Date().toISOString(),
    };
    this.audit.push(entry);
    return structuredClone(entry);
  }
}

function pGet(p: Record<string, unknown>, k: string, d: unknown): unknown {
  return p[k] !== undefined ? p[k] : d;
}
