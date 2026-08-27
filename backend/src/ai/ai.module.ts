import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AIUsage } from './usage/entities/ai-usage.entity';
import { AiUsageService } from './usage/ai-usage.service';
import { AiGatewayService } from './gateway/ai.gateway';
import { AI_PROVIDER, AIProvider } from './gateway/ai-provider.interface';
import { UnconfiguredProvider } from './gateway/providers/unconfigured.provider';
import { AnthropicProvider } from './gateway/providers/anthropic.provider';
import { AiContextService } from './context/ai-context.service';
import { AiToolRegistry } from './tools/ai-tool.registry';
import { AiMemoryService } from './memory/ai-memory.service';
import { AiEventConsumer } from './events/ai-event.consumer';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';
import { AppConfig } from '../config/configuration';

/**
 * AiModule
 *
 * Bundles the Gateway, Context Engine, Tool Registry, Memory
 * boundary, Usage tracking, and domain-event integration boundary
 * into one module, matching the codebase's one-module-per-domain
 * convention.
 *
 * AI_PROVIDER resolution: AnthropicProvider is bound only when
 * ANTHROPIC_API_KEY is configured. If it's absent (e.g. a dev/CI
 * environment that hasn't set one up), AI_PROVIDER falls back to
 * UnconfiguredProvider so the app still boots — it just fails loud
 * if anything actually tries to call the AI Gateway.
 *
 * No controller is exported yet — exact route surface is still an
 * open decision. AiGatewayService/AiContextService/AiToolRegistry
 * are exported for future feature modules to consume directly.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([AIUsage]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  providers: [
    AiUsageService,
    AiGatewayService,
    AnthropicProvider,
    UnconfiguredProvider,
    {
      provide: AI_PROVIDER,
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        anthropicProvider: AnthropicProvider,
        unconfiguredProvider: UnconfiguredProvider,
      ): AIProvider => {
        const apiKey = configService.get('ai', { infer: true }).anthropic
          .apiKey;
        return apiKey ? anthropicProvider : unconfiguredProvider;
      },
      inject: [ConfigService, AnthropicProvider, UnconfiguredProvider],
    },
    AiContextService,
    AiToolRegistry,
    AiMemoryService,
    AiEventConsumer,
  ],
  exports: [
    AiGatewayService,
    AiContextService,
    AiToolRegistry,
    AiMemoryService,
    AiUsageService,
  ],
})
export class AiModule {}
