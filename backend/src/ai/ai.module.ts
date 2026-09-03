import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AIUsage } from './usage/entities/ai-usage.entity';
import { AIMemory } from './memory/entities/ai-memory.entity';
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
import { CustomersModule } from '../customers/customers.module';
import { CustomersService } from '../customers/customers.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { InvoicesService } from '../invoices/invoices.service';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { SuppliersService } from '../suppliers/suppliers.service';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { ProductsModule } from '../products/products.module';
import { ProductsService } from '../products/products.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { createGetCustomerTool } from './tools/get-customer.tool';
import { createGetOrderTool } from './tools/get-order.tool';
import { createGetInvoiceTool } from './tools/get-invoice.tool';
import { createGetSupplierTool } from './tools/get-supplier.tool';
import { createGetDeliveryTool } from './tools/get-delivery.tool';
import { createGetProductTool } from './tools/get-product.tool';
import { createGetPaymentTool } from './tools/get-payment.tool';
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
    TypeOrmModule.forFeature([AIUsage, AIMemory]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => InvoicesModule),
    forwardRef(() => SuppliersModule),
    forwardRef(() => DeliveriesModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => PaymentsModule),
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
export class AiModule implements OnModuleInit {
  constructor(
    private readonly aiToolRegistry: AiToolRegistry,
    private readonly customersService: CustomersService,
    private readonly ordersService: OrdersService,
    private readonly invoicesService: InvoicesService,
    private readonly suppliersService: SuppliersService,
    private readonly deliveriesService: DeliveriesService,
    private readonly productsService: ProductsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.aiToolRegistry.register(createGetCustomerTool(this.customersService));
    this.aiToolRegistry.register(createGetOrderTool(this.ordersService));
    this.aiToolRegistry.register(createGetInvoiceTool(this.invoicesService));
    this.aiToolRegistry.register(createGetSupplierTool(this.suppliersService));
    this.aiToolRegistry.register(createGetDeliveryTool(this.deliveriesService));
    this.aiToolRegistry.register(createGetProductTool(this.productsService));
    this.aiToolRegistry.register(createGetPaymentTool(this.paymentsService));
  }
}
