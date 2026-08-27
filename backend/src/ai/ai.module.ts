import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIUsage } from './usage/entities/ai-usage.entity';
import { AiUsageService } from './usage/ai-usage.service';
import { AiGatewayService } from './gateway/ai.gateway';
import { AI_PROVIDER } from './gateway/ai-provider.interface';
import { UnconfiguredProvider } from './gateway/providers/unconfigured.provider';
import { AiContextService } from './context/ai-context.service';
import { AiToolRegistry } from './tools/ai-tool.registry';
import { AiMemoryService } from './memory/ai-memory.service';
import { AiEventConsumer } from './events/ai-event.consumer';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

/**
 * AiModule
 *
 * Sprint 7 AI Foundation, S7-01 §10. Bundles the Gateway, Context
 * Engine, Tool Registry, Memory boundary, Usage tracking, and
 * domain-event integration boundary into one module, matching the
 * codebase's one-module-per-domain convention.
 *
 * AI_PROVIDER currently binds to UnconfiguredProvider, which fails
 * loud on any real call — swapped for the real Anthropic adapter in
 * a later step.
 *
 * No controller is exported yet — exact route surface is still an
 * open decision, and the directive warns against prematurely
 * exposing a public AI API. AiGatewayService/AiContextService/
 * AiToolRegistry are exported for future feature modules to consume
 * directly.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AIUsage]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  providers: [
    AiUsageService,
    AiGatewayService,
    { provide: AI_PROVIDER, useClass: UnconfiguredProvider },
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
