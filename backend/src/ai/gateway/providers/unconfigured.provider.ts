import { Injectable, Logger } from '@nestjs/common';
import {
  AIProvider,
  AIGenerateRequest,
  AIGenerateResponse,
  AIStructuredRequest,
  AIUsageMetadata,
  AIProviderUnavailableError,
} from '../ai-provider.interface';

/**
 * UnconfiguredProvider
 *
 * Placeholder AIProvider wired in until a real adapter is bound.
 * Fails safe and loud rather than silently no-op'ing, so the gap is
 * impossible to miss in staging/dev if the real adapter isn't wired
 * in before first use.
 */
@Injectable()
export class UnconfiguredProvider implements AIProvider {
  private readonly logger = new Logger(UnconfiguredProvider.name);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
    this.logger.error('AI provider not configured.');
    throw new AIProviderUnavailableError('No AI provider is configured.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generateStructured<T>(request: AIStructuredRequest<T>): Promise<T> {
    this.logger.error('AI provider not configured.');
    throw new AIProviderUnavailableError('No AI provider is configured.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getUsage(response: AIGenerateResponse): AIUsageMetadata {
    throw new AIProviderUnavailableError('No AI provider is configured.');
  }
}
