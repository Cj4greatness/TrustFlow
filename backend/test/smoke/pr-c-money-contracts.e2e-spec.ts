import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { CustomersService } from '../../src/customers/customers.service';
import { ProductsService } from '../../src/products/products.service';
import { InventoryService } from '../../src/products/inventory.service';
import { InventoryMovementType } from '../../src/products/entities/inventory-movement.entity';
import { OrdersService } from '../../src/orders/orders.service';
import { InvoicesService } from '../../src/invoices/invoices.service';
import { Receipt } from '../../src/receipts/entities/receipt.entity';
import { AiToolRegistry } from '../../src/ai/tools/ai-tool.registry';
import { AiContextService } from '../../src/ai/context/ai-context.service';
import { OrganizationRole } from '../../src/organization-members/entities/organization-member.entity';
import { PaymentSucceededEvent } from '../../src/events/payment-succeeded.event';

describe('PR-C — payment and AI money contracts (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let eventEmitter: EventEmitter2;

  const runId = randomUUID().slice(0, 8);
  let accessToken: string;
  let userId: string;
  let organizationId: string;
  let invoiceId: string;
  let paymentId: string;
  let orderId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    server = app.getHttpServer();
    dataSource = app.get(DataSource);
    eventEmitter = app.get(EventEmitter2);

    const registration = await app.get(AuthService).register({
      email: `pr-c-money-${runId}@example.com`,
      password: 'SecurePass123',
      firstName: 'PRC',
      lastName: 'Money',
    });
    accessToken = registration.accessToken;
    userId = registration.user.id;

    const organizationsService = app.get(OrganizationsService);
    const organization = await organizationsService.createWithOwner(
      { name: `PR-C Money ${runId}`, country: 'Nigeria', currency: 'NGN' },
      userId,
    );
    organizationId = organization.id;

    const customersService = app.get(CustomersService);
    const customer = await customersService.createCustomer(
      organizationId,
      {
        customerType: 'individual',
        firstName: 'PRC',
        lastName: 'Customer',
      } as never,
      userId,
    );

    const productsService = app.get(ProductsService);
    const product = await productsService.createProduct(
      organizationId,
      { name: 'PR-C Widget', sku: `PRC-${runId}`, sellingPrice: 1000 },
      userId,
    );
    productId = product.id;

    const inventoryService = app.get(InventoryService);
    await dataSource.transaction(async (manager) => {
      await inventoryService.adjustInventory(
        organizationId,
        productId,
        {
          type: InventoryMovementType.ADD,
          quantity: 10,
          reason: 'PR-C fixture stock',
        },
        userId,
        manager,
      );
    });

    const ordersService = app.get(OrdersService);
    const order = await ordersService.createOrder(
      organizationId,
      { customerId: customer.id, notes: 'PR-C fixture' },
      userId,
    );
    orderId = order.id;
    await ordersService.addOrderItem(organizationId, orderId, {
      productId,
      quantity: 1,
    });
    await ordersService.confirmOrder(organizationId, orderId, userId);

    const invoicesService = app.get(InvoicesService);
    const invoices = await invoicesService.listInvoices(organizationId);
    const invoice = invoices.find((entry) => entry.orderId === orderId);
    if (!invoice) {
      throw new Error('PR-C fixture: no invoice created');
    }
    invoiceId = invoice.id;
  }, 30000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('emits the shared payment shape once and creates the matching NGN receipt', async () => {
    const events: PaymentSucceededEvent[] = [];
    const listener = (event: PaymentSucceededEvent) => events.push(event);
    eventEmitter.on('payment.succeeded', listener);

    const debugSpy = jest.spyOn(Logger.prototype, 'debug');
    const amount = 1000;
    const response = await request(server)
      .post(`/organizations/${organizationId}/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        idempotencyKey: `pr-c-payment-${runId}`,
        amount,
      })
      .expect(201);

    paymentId = (response.body as { id: string }).id;
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      organizationId,
      paymentId,
      invoiceId,
      amount,
      currency: 'NGN',
      amountUnit: 'minor',
    });
    expect(Number.isInteger(events[0].amount)).toBe(true);

    let receipt: Receipt | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      receipt = await dataSource
        .getRepository(Receipt)
        .findOne({ where: { paymentId } });
      if (receipt) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(receipt?.amount).toBe(amount);
    expect(receipt?.currency).toBe('NGN');
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('AI event boundary observed payment.succeeded'),
    );

    eventEmitter.off('payment.succeeded', listener);
  });

  it('labels AI money tool outputs and context output with the unchanged values', async () => {
    const registry = app.get(AiToolRegistry);
    const payment = (await registry.execute(
      'get_payment',
      { paymentId },
      {
        organizationId,
        memberId: userId,
        role: OrganizationRole.OWNER,
        requestId: randomUUID(),
      },
    )) as { amount: number; currency: string; amountUnit: string };
    expect(payment.amount).toBe(1000);
    expect(payment.currency).toBe('NGN');
    expect(payment.amountUnit).toBe('minor');

    const invoice = (await registry.execute(
      'get_invoice',
      { invoiceId },
      {
        organizationId,
        memberId: userId,
        role: OrganizationRole.OWNER,
        requestId: randomUUID(),
      },
    )) as {
      subtotal: number;
      total: number;
      amountPaid: number;
      amountDue: number;
      currency: string;
      amountUnit: string;
    };
    expect(invoice.amountUnit).toBe('minor');
    expect(invoice.currency).toBe('NGN');
    expect(invoice.subtotal).toEqual(expect.any(Number));
    expect(invoice.total).toEqual(expect.any(Number));
    expect(invoice.amountPaid).toEqual(expect.any(Number));
    expect(invoice.amountDue).toEqual(expect.any(Number));

    const order = (await registry.execute(
      'get_order',
      { orderId },
      {
        organizationId,
        memberId: userId,
        role: OrganizationRole.OWNER,
        requestId: randomUUID(),
      },
    )) as {
      subtotal: string;
      discount: string;
      total: string;
      currency: string;
      amountUnit: string;
    };
    expect(order.subtotal).toEqual(expect.any(String));
    expect(order.discount).toEqual(expect.any(String));
    expect(order.total).toEqual(expect.any(String));
    expect(order.currency).toBe('NGN');
    expect(order.amountUnit).toBe('major');

    const product = (await registry.execute(
      'get_product',
      { productId },
      {
        organizationId,
        memberId: userId,
        role: OrganizationRole.OWNER,
        requestId: randomUUID(),
      },
    )) as {
      sellingPrice: string;
      costPrice: string | null;
      currency: string;
      amountUnit: string;
    };
    expect(product.sellingPrice).toEqual(expect.any(String));
    expect(product.costPrice).toBeNull();
    expect(product.currency).toBe('NGN');
    expect(product.amountUnit).toBe('major');

    const aiContextService = app.get<AiContextService>(AiContextService);
    const context = await aiContextService.assemble({
      organizationId,
      memberId: userId,
      role: OrganizationRole.OWNER,
      operation: 'order_summary',
      params: { orderId },
    });
    expect(typeof context.data.total).toBe('string');
    expect(context.data.currency).toBe('NGN');
    expect(context.data.amountUnit).toBe('major');
  });
});
