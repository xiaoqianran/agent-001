import type { Tick } from "./ids.js";

/** [Freeze] Experiment / run seed */
export interface Seed {
  /** Primary RNG seed string or number serialized */
  value: string;
  /** Optional run label */
  label?: string;
}

export interface SimClock {
  tick: Tick;
  /** ticks per day (default 24 = hour-ish) */
  ticksPerDay: number;
  day: number;
  hourInDay: number;
}

export function createClock(ticksPerDay = 24): SimClock {
  return { tick: 0, ticksPerDay, day: 0, hourInDay: 0 };
}

export function advanceClock(clock: SimClock, by = 1): SimClock {
  const tick = clock.tick + by;
  const day = Math.floor(tick / clock.ticksPerDay);
  const hourInDay = tick % clock.ticksPerDay;
  return { ...clock, tick, day, hourInDay };
}

/** Deterministic 32-bit hash (FNV-1a style mix) for ordering */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic agent order: sort by hash(seed, tick, agentId) */
export function agentOrder(
  seed: Seed,
  tick: Tick,
  agentIds: readonly string[],
): string[] {
  return [...agentIds].sort((a, b) => {
    const ha = hash32(`${seed.value}|${tick}|${a}`);
    const hb = hash32(`${seed.value}|${tick}|${b}`);
    if (ha !== hb) return ha - hb;
    return a.localeCompare(b);
  });
}
