/**
 * AIProvider
 *
 * Sprint 7 AI Foundation, S7-01 architecture lock, §3. This is the
 * ONLY interface through which AiGatewayService talks to an external
 * LLM. No other part of TrustFlow may import a provider SDK
 * (OpenAI/Anthropic/Gemini) directly — every call goes:
 *
 *   AI application -> AiGatewayService -> AIProvider (adapter) -> External LLM
 *
 * Provider adapters (src/ai/gateway/providers/*) implement this
 * interface and own all SDK-specific request/response shaping.
 * AiGatewayService and everything above it only ever sees the
 * normalized types below.
 *
 * DI: injected via the AI_PROVIDER token (see ai.module.ts), same
 * token-injection pattern already used elsewhere in the codebase
 * for swappable infrastructure (e.g. RedisService).
 */

export interface AIGenerateRequest {
  /** System/context prompt assembled by AiContextService. Never raw DB rows. */
  systemPrompt: string;
  /** The user-facing or tool-facing prompt/messages for this request. */
  messages: AIMessage[];
  /** Optional model override; falls back to configured default. */
  model?: string;
  /** Optional max output tokens; provider-specific defaults apply if omitted. */
  maxTokens?: number;
  /** Tool definitions available for this request, if any (Tool Registry integration). */
  tools?: AIToolDefinition[];
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input, derived from the tool's inputSchema. */
  inputSchema: Record<string, unknown>;
}

export interface AIGenerateResponse {
  /** Normalized text output, if the model responded with text. */
  text: string | null;
  /** Normalized tool-call requests, if the model invoked one or more tools. */
  toolCalls: AIToolCall[];
  /** Raw usage as reported by the provider — normalized further by getUsage(). */
  rawUsage: unknown;
  /** Provider + model actually used to serve this request. */
  provider: string;
  model: string;
  /** Wall-clock latency for the provider call, measured by the adapter. */
  latencyMs: number;
}

export interface AIToolCall {
  toolName: string;
  input: Record<string, unknown>;
}

export interface AIStructuredRequest<T> extends AIGenerateRequest {
  /** JSON Schema the provider must conform its output to. */
  outputSchema: Record<string, unknown>;
  /** Runtime validator applied to the parsed output before it's returned. */
  validate: (value: unknown) => value is T;
}

export interface AIUsageMetadata {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Estimated cost in USD cents; null if the provider doesn't report pricing data. */
  estimatedCostCents: number | null;
}

/**
 * Thrown by provider adapters on failure. AiGatewayService normalizes
 * every provider-specific error into one of these before it reaches
 * any caller, so nothing above the adapter boundary ever needs to
 * know which provider it's talking to (S7-01 §4, directive §15).
 */
export class AIProviderTimeoutError extends Error {}
export class AIProviderUnavailableError extends Error {}
export class AIRateLimitError extends Error {}
export class AIMalformedResponseError extends Error {}

export interface AIProvider {
  generate(request: AIGenerateRequest): Promise<AIGenerateResponse>;
  generateStructured<T>(request: AIStructuredRequest<T>): Promise<T>;
  getUsage(response: AIGenerateResponse): AIUsageMetadata;
}

/** DI token for injecting the active AIProvider implementation. */
export const AI_PROVIDER = Symbol('AI_PROVIDER');
