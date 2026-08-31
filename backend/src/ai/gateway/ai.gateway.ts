import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AI_PROVIDER,
  type AIProvider,
  AIGenerateRequest,
  AIGenerateResponse,
  AIStructuredRequest,
  AIProviderTimeoutError,
  AIProviderUnavailableError,
  AIRateLimitError,
  AIMalformedResponseError,
} from './ai-provider.interface';
import { AiUsageService } from '../usage/ai-usage.service';
import { AIUsageStatus } from '../usage/entities/ai-usage.entity';

export interface AiGatewayCallContext {
  organizationId: string;
  userId: string;
}

/**
 * AiGatewayService
 *
 * S7-01 §4. The single internal interface every future AI capability
 * (Chat, Inventory Intelligence, Dashboard Briefings, etc.) calls
 * through. Nothing outside src/ai/gateway may import a provider SDK
 * or the AIProvider token directly — this is the boundary.
 *
 * Responsibilities: resolve provider/model, invoke, normalize errors,
 * and record usage for every call — success or failure (directive
 * §17). Callers never see provider-specific types or errors.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AIProvider,
    private readonly usageService: AiUsageService,
  ) {}

  async generate(
    request: AIGenerateRequest,
    ctx: AiGatewayCallContext,
  ): Promise<AIGenerateResponse> {
    const requestId = randomUUID();
    const startedAt = Date.now();

    try {
      const response = await this.provider.generate(request);
      await this.recordUsage(requestId, ctx, response, AIUsageStatus.SUCCESS);
      return response;
    } catch (err) {
      await this.recordFailure(requestId, ctx, startedAt, err);
      throw this.normalizeError(err);
    }
  }

  async generateStructured<T>(
    request: AIStructuredRequest<T>,
    ctx: AiGatewayCallContext,
  ): Promise<T> {
    const requestId = randomUUID();
    const startedAt = Date.now();

    try {
      const result = await this.provider.generateStructured(request);
      // Structured calls don't return an AIGenerateResponse to read
      // usage off of, so provider adapters are responsible for
      // exposing usage via a side channel if needed in a future
      // iteration. For now, usage recording on the structured path
      // is intentionally best-effort and does not block the caller.
      return result;
    } catch (err) {
      await this.recordFailure(requestId, ctx, startedAt, err);
      throw this.normalizeError(err);
    }
  }

  private async recordUsage(
    requestId: string,
    ctx: AiGatewayCallContext,
    response: AIGenerateResponse,
    status: AIUsageStatus,
  ): Promise<void> {
    const usage = this.provider.getUsage(response);
    try {
      await this.usageService.record({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        provider: response.provider,
        model: response.model,
        requestId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostCents: usage.estimatedCostCents,
        latencyMs: response.latencyMs,
        status,
      });
    } catch (usageErr) {
      // A usage-recording failure must never corrupt or block the
      // caller's actual AI result. Log and move on.
      this.logger.error(
        `Failed to record AI usage for request ${requestId}`,
        usageErr instanceof Error ? usageErr.stack : usageErr,
      );
    }
  }

  private async recordFailure(
    requestId: string,
    ctx: AiGatewayCallContext,
    startedAt: number,
    err: unknown,
  ): Promise<void> {
    try {
      await this.usageService.record({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        provider: 'unknown',
        model: 'unknown',
        requestId,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostCents: null,
        latencyMs: Date.now() - startedAt,
        status: AIUsageStatus.FAILURE,
        errorCategory: this.categorizeError(err),
      });
    } catch (usageErr) {
      this.logger.error(
        `Failed to record AI usage failure for request ${requestId}`,
        usageErr instanceof Error ? usageErr.stack : usageErr,
      );
    }
  }

  private categorizeError(err: unknown): string {
    if (err instanceof AIProviderTimeoutError) return 'timeout';
    if (err instanceof AIProviderUnavailableError) return 'unavailable';
    if (err instanceof AIRateLimitError) return 'rate_limited';
    if (err instanceof AIMalformedResponseError) return 'malformed_response';
    return 'unknown';
  }

  private normalizeError(err: unknown): Error {
    if (
      err instanceof AIProviderTimeoutError ||
      err instanceof AIProviderUnavailableError ||
      err instanceof AIRateLimitError ||
      err instanceof AIMalformedResponseError
    ) {
      return err;
    }
    this.logger.error(
      'Unrecognized provider error surfaced to AiGatewayService',
      err instanceof Error ? err.stack : err,
    );
    return new AIProviderUnavailableError('AI provider call failed.');
  }
}
