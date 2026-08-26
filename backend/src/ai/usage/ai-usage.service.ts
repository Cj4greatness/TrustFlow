import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIUsage, AIUsageStatus } from './entities/ai-usage.entity';

export interface RecordAiUsageInput {
  organizationId: string;
  userId: string;
  provider: string;
  model: string;
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostCents: number | null;
  latencyMs: number;
  status: AIUsageStatus;
  errorCategory?: string | null;
}

/**
 * AiUsageService
 *
 * S7-01 §8. Called exclusively by AiGatewayService after every
 * provider call, success or failure (directive §17). Never called by
 * domain services directly, and never read by domain business logic
 * — this is observability/billing data only.
 */
@Injectable()
export class AiUsageService {
  constructor(
    @InjectRepository(AIUsage)
    private readonly usageRepository: Repository<AIUsage>,
  ) {}

  async record(input: RecordAiUsageInput): Promise<AIUsage> {
    const usage = this.usageRepository.create({
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      requestId: input.requestId,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      estimatedCostCents: input.estimatedCostCents,
      latencyMs: input.latencyMs,
      status: input.status,
      errorCategory: input.errorCategory ?? null,
    });
    return this.usageRepository.save(usage);
  }
}
