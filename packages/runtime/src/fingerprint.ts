import { hash32, type AuthorityFingerprint } from "@gss/contracts";
import type { WorldAuthority } from "@gss/world";
import type { AgentState } from "@gss/agent";
import type { SimClock, Seed } from "@gss/contracts";

export function computeFingerprint(
  world: WorldAuthority,
  agents: Record<string, AgentState>,
  clock: SimClock,
  actionSequence: string[],
): AuthorityFingerprint {
  const needs: Record<string, Record<string, number>> = {};
  for (const [id, a] of Object.entries(agents)) {
    needs[id] = { ...a.needs };
  }
  const seq = actionSequence.join("|");
  return {
    tick: clock.tick,
    day: clock.day,
    agentPlaces: world.agentPlaces(),
    resourceTotals: world.resourceTotals(),
    actionSequenceHash: hash32(seq).toString(16),
    needs,
  };
}

export function fingerprintEqual(
  a: AuthorityFingerprint,
  b: AuthorityFingerprint,
): boolean {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function stable(fp: AuthorityFingerprint): unknown {
  return {
    tick: fp.tick,
    day: fp.day,
    agentPlaces: sortObj(fp.agentPlaces),
    resourceTotals: sortObj(fp.resourceTotals),
    actionSequenceHash: fp.actionSequenceHash,
    needs: Object.fromEntries(
      Object.entries(fp.needs)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, v]) => [k, sortObj(v as Record<string, number>)]),
    ),
  };
}

function sortObj(o: Record<string, string | number>): Record<string, string | number> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

export function seedLabel(seed: Seed): string {
  return seed.value;
}
