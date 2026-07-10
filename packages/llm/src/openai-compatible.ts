import type { LlmPort, LlmRequest, LlmResponse } from "./port.js";
import { StubLlm } from "./stub.js";

export interface OpenAiCompatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * OpenAI-compatible Chat Completions client (NewAPI etc.).
 * On network failure, falls back to stub content so sim does not crash.
 */
export class OpenAiCompatibleLlm implements LlmPort {
  readonly name = "openai-compatible";
  private readonly cfg: OpenAiCompatConfig;

  constructor(cfg: OpenAiCompatConfig) {
    this.cfg = cfg;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const url = `${this.cfg.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          messages: req.messages,
          temperature: req.temperature ?? 0,
          max_tokens: req.maxTokens ?? 256,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          content: `[llm-error ${res.status}] ${text.slice(0, 200)}`,
          tokensUsed: 0,
          provider: this.name,
        };
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      return {
        content: data.choices?.[0]?.message?.content ?? "",
        tokensUsed: data.usage?.total_tokens ?? 0,
        provider: this.name,
      };
    } catch (e) {
      return {
        content: `[llm-network-error] ${e instanceof Error ? e.message : String(e)}`,
        tokensUsed: 0,
        provider: this.name,
      };
    }
  }
}

/** Prefer real client when key present and GSS_LLM=1; else Stub. */
export function createLlmFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LlmPort {
  const key = env.NEWAPI_API_KEY ?? env.OPENAI_API_KEY;
  const want = env.GSS_LLM === "1" || env.GSS_LLM === "true";
  if (!want || !key) {
    return new StubLlm();
  }
  const baseUrl =
    env.NEWAPI_BASE_URL ?? env.OPENAI_BASE_URL ?? "https://api.openai.com";
  const model =
    env.NEWAPI_MODEL ?? env.OPENAI_MODEL ?? "openai/gpt-oss-120b";
  return new OpenAiCompatibleLlm({ baseUrl, apiKey: key, model });
}
