import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ContentBlock,
  Message,
} from '@anthropic-ai/sdk/resources/messages';
import {
  APIConnectionTimeoutError,
  APIConnectionError,
  RateLimitError,
  APIError,
} from '@anthropic-ai/sdk';
import { AppConfig } from '../../../config/configuration';
import {
  AIProvider,
  AIGenerateRequest,
  AIGenerateResponse,
  AIStructuredRequest,
  AIUsageMetadata,
  AIToolCall,
  AIProviderTimeoutError,
  AIProviderUnavailableError,
  AIRateLimitError,
  AIMalformedResponseError,
} from '../ai-provider.interface';

/**
 * AnthropicProvider
 *
 * The first real AIProvider adapter, using Anthropic (Claude).
 * Everything here is private to this file — no other part of
 * TrustFlow imports @anthropic-ai/sdk or sees Anthropic-specific
 * types. AiGatewayService only ever sees the normalized
 * AIGenerateRequest/AIGenerateResponse shapes from
 * ai-provider.interface.ts.
 */
@Injectable()
export class AnthropicProvider implements AIProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(
    @Inject(ConfigService) configService: ConfigService<AppConfig, true>,
  ) {
    const config = configService.get('ai', { infer: true }).anthropic;
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.model;
  }

  async generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    const startedAt = Date.now();
    try {
      const response = await this.client.messages.create({
        model: request.model ?? this.defaultModel,
        max_tokens: request.maxTokens ?? 1024,
        system: request.systemPrompt,
        messages: this.toAnthropicMessages(request.messages),
        tools: request.tools?.map((tool) => this.toAnthropicTool(tool)),
      });

      return this.normalizeResponse(response, Date.now() - startedAt);
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  async generateStructured<T>(request: AIStructuredRequest<T>): Promise<T> {
    try {
      const response = await this.client.messages.create({
        model: request.model ?? this.defaultModel,
        max_tokens: request.maxTokens ?? 1024,
        system: request.systemPrompt,
        messages: this.toAnthropicMessages(request.messages),
        tools: [
          {
            name: 'emit_structured_output',
            description:
              'Emit the final structured result conforming to the required schema.',
            input_schema: request.outputSchema as Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'emit_structured_output' },
      });

      const toolUse = response.content.find(
        (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use',
      );
      if (!toolUse) {
        throw new AIMalformedResponseError(
          'Anthropic response did not include the expected structured tool_use block.',
        );
      }

      if (!request.validate(toolUse.input)) {
        throw new AIMalformedResponseError(
          'Anthropic structured output failed the caller-provided schema validator.',
        );
      }

      // Note: AiGatewayService's usage-recording only runs on the
      // generate() path today — structured-call usage recording is
      // a known gap, not solved here.
      return toolUse.input;
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  getUsage(response: AIGenerateResponse): AIUsageMetadata {
    const raw = response.rawUsage as {
      input_tokens: number;
      output_tokens: number;
    };
    const inputTokens = raw?.input_tokens ?? 0;
    const outputTokens = raw?.output_tokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      // Anthropic doesn't return pricing in the response — cost
      // estimation from a rate table is out of scope for now.
      estimatedCostCents: null,
    };
  }

  private toAnthropicMessages(
    messages: AIGenerateRequest['messages'],
  ): MessageParam[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  private toAnthropicTool(
    tool: NonNullable<AIGenerateRequest['tools']>[number],
  ): Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Tool.InputSchema,
    };
  }

  private normalizeResponse(
    response: Message,
    latencyMs: number,
  ): AIGenerateResponse {
    const textBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'text' }> =>
        block.type === 'text',
    );
    const toolUseBlocks = response.content.filter(
      (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
        block.type === 'tool_use',
    );

    const toolCalls: AIToolCall[] = toolUseBlocks.map((block) => ({
      toolName: block.name,
      input: block.input as Record<string, unknown>,
    }));

    return {
      text:
        textBlocks.length > 0 ? textBlocks.map((b) => b.text).join('') : null,
      toolCalls,
      rawUsage: response.usage,
      provider: 'anthropic',
      model: response.model,
      latencyMs,
    };
  }

  private normalizeError(err: unknown): Error {
    if (err instanceof APIConnectionTimeoutError) {
      return new AIProviderTimeoutError('Anthropic request timed out.');
    }
    if (err instanceof RateLimitError) {
      return new AIRateLimitError('Anthropic rate limit exceeded.');
    }
    if (err instanceof APIConnectionError) {
      return new AIProviderUnavailableError('Could not connect to Anthropic.');
    }
    if (err instanceof APIError) {
      this.logger.error(
        `Anthropic API error (status ${err.status})`,
        err.stack,
      );
      return new AIProviderUnavailableError('Anthropic API request failed.');
    }
    if (err instanceof AIMalformedResponseError) {
      return err;
    }
    this.logger.error(
      'Unrecognized error from Anthropic SDK',
      err instanceof Error ? err.stack : err,
    );
    return new AIProviderUnavailableError('Anthropic provider call failed.');
  }
}
