import type { LlmPort, LlmRequest, LlmResponse } from "./port.js";

/** Always available; no network. Deterministic empty assist. */
export class StubLlm implements LlmPort {
  readonly name = "stub";

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    return {
      content: `[stub] no-op assist for: ${last.slice(0, 80)}`,
      tokensUsed: 0,
      provider: "stub",
    };
  }
}
