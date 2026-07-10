export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  tokensUsed: number;
  provider: string;
}

export interface LlmPort {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
