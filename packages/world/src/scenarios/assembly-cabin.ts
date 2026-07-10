import { createCommonsCabinWorld, type CommonsOpts } from "./commons-cabin.js";
import type { WorldState } from "../types.js";

/**
 * assembly-cabin: commons-cabin layout + assembly at cabin for policy votes.
 * Same map/public good; used with legislature cognition roles.
 */
export function createAssemblyCabinWorld(
  aliceId = "agent-alice",
  bobId = "agent-bob",
  carolId = "agent-carol",
  opts?: CommonsOpts,
): WorldState {
  return createCommonsCabinWorld(aliceId, bobId, carolId, {
    initialGranary: opts?.initialGranary ?? 3,
    storehouseFood: opts?.storehouseFood ?? 4,
    woodsFood: opts?.woodsFood ?? 2,
    ...opts,
  });
}
