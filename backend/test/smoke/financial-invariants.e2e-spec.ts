import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { KoboTransformer } from '../../src/common/transformers/kobo.transformer';
import { Delivery } from '../../src/deliveries/entities/delivery.entity';
import { Invoice } from '../../src/invoices/entities/invoice.entity';
import { Inventory } from '../../src/products/entities/inventory.entity';
import { InventoryMovement } from '../../src/products/entities/inventory-movement.entity';
import { Order, OrderStatus } from '../../src/orders/entities/order.entity';
import { CreatePaymentDto } from '../../src/payments/dto/create-payment.dto';

interface IdResponse {
  id: string;
}

interface InvoiceResponse extends IdResponse {
  orderId: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  lineItems: Array<{ lineTotal: number }>;
}

interface OrderResponse extends IdResponse {
  status: OrderStatus;
  discount: string;
}

interface ApiErrorResponse {
  statusCode: number;
  details: { code: string };
}

interface PaymentResponse extends IdResponse {
  amount: number;
}

interface ReceiptResponse extends IdResponse {
  paymentId: string;
  amount: number;
}

describe('Financial invariants (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let organizationId: string;
  let customerId: string;
  let accessToken: string;

  const runId = randomUUID().slice(0, 8);

  function authorized<T extends request.Test>(testRequest: T): T {
    return testRequest.set('Authorization', `Bearer ${accessToken}`);
  }

  async function createDraftOrder(
    lines: Array<{ unitPrice: number; quantity: number }>,
  ): Promise<{ order: IdResponse; products: IdResponse[] }> {
    const products: IdResponse[] = [];

    for (const line of lines) {
      const productResponse = await authorized(
        request(server).post(`/organizations/${organizationId}/products`),
      )
        .send({
          name: 'Exact Money Test Product',
          sku: `MONEY-${randomUUID().slice(0, 8)}`,
          sellingPrice: line.unitPrice,
        })
        .expect(201);
      const product = productResponse.body as IdResponse;
      products.push(product);

      await authorized(
        request(server).post(
          `/organizations/${organizationId}/products/${product.id}/inventory/adjustments`,
        ),
      )
        .send({
          type: 'add',
          quantity: line.quantity + 5,
          reason: 'Seed stock for exact money test',
        })
        .expect(201);
    }

    const orderResponse = await authorized(
      request(server).post(`/organizations/${organizationId}/orders`),
    )
      .send({ customerId })
      .expect(201);
    const order = orderResponse.body as IdResponse;

    for (let index = 0; index < lines.length; index++) {
      await authorized(
        request(server).post(
          `/organizations/${organizationId}/orders/${order.id}/items`,
        ),
      )
        .send({
          productId: products[index].id,
          quantity: lines[index].quantity,
        })
        .expect(201);
    }

    return { order, products };
  }

  async function confirmAndPayOrder(
    order: IdResponse,
    expectedTotal: number,
    expectedLineTotals: number[],
  ): Promise<void> {
    const confirmedResponse = await authorized(
      request(server).post(
        `/organizations/${organizationId}/orders/${order.id}/confirm`,
      ),
    ).expect(201);
    const confirmedOrder = confirmedResponse.body as OrderResponse;
    expect(confirmedOrder.status).toBe(OrderStatus.CONFIRMED);
    expect(confirmedOrder.discount).toBe('0.00');

    const invoiceResponse = await authorized(
      request(server).get(`/organizations/${organizationId}/invoices`),
    ).expect(200);
    const invoiceList = invoiceResponse.body as InvoiceResponse[];
    const listedInvoice = invoiceList.find(
      (invoice) => invoice.orderId === order.id,
    );
    expect(listedInvoice).toBeDefined();
    if (!listedInvoice) {
      throw new Error('Expected the confirmed order to have an invoice');
    }

    const fullInvoiceResponse = await authorized(
      request(server).get(
        `/organizations/${organizationId}/invoices/${listedInvoice.id}`,
      ),
    ).expect(200);
    const invoice = fullInvoiceResponse.body as InvoiceResponse;
    expect(invoice.total).toBe(expectedTotal);
    expect(invoice.amountPaid).toBe(0);
    expect(invoice.amountDue).toBe(expectedTotal);
    expect(invoice.lineItems.map((item) => item.lineTotal)).toEqual(
      expectedLineTotals,
    );

    const paymentResponse = await authorized(
      request(server).post(
        `/organizations/${organizationId}/invoices/${invoice.id}/payments`,
      ),
    )
      .send({
        idempotencyKey: randomUUID(),
        amount: invoice.total,
      })
      .expect(201);
    const payment = paymentResponse.body as PaymentResponse;
    expect(payment.amount).toBe(invoice.total);

    const paidInvoiceResponse = await authorized(
      request(server).get(
        `/organizations/${organizationId}/invoices/${invoice.id}`,
      ),
    ).expect(200);
    const paidInvoice = paidInvoiceResponse.body as InvoiceResponse;
    expect(paidInvoice.amountPaid).toBe(invoice.total);
    expect(paidInvoice.amountDue).toBe(0);

    let receipt: ReceiptResponse | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const receiptResponse = await authorized(
        request(server).get(`/organizations/${organizationId}/receipts`),
      ).expect(200);
      receipt = (receiptResponse.body as ReceiptResponse[]).find(
        (candidate) => candidate.paymentId === payment.id,
      );
      if (receipt) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!receipt) {
      throw new Error(`Expected receipt for payment ${payment.id}`);
    }
    expect(receipt.amount).toBe(invoice.total);
  }

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

    const registration = await app.get(AuthService).register({
      email: `financial-invariants.${runId}@example.com`,
      password: 'SecurePass123',
      firstName: 'Financial',
      lastName: 'Tester',
    });
    accessToken = registration.accessToken;

    const organizationResponse = await authorized(
      request(server).post('/organizations'),
    )
      .send({
        name: `Financial Invariants ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    organizationId = (organizationResponse.body as IdResponse).id;

    const customerResponse = await authorized(
      request(server).post(`/organizations/${organizationId}/customers`),
    )
      .send({
        customerType: 'individual',
        firstName: 'Exact',
        lastName: 'Money',
      })
      .expect(201);
    customerId = (customerResponse.body as IdResponse).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('keeps single-line invoice, payment, and receipt values exact', async () => {
    for (const testCase of [
      { unitPrice: 0.1, quantity: 1, total: 10 },
      { unitPrice: 0.2, quantity: 1, total: 20 },
      { unitPrice: 19.99, quantity: 3, total: 5997 },
      { unitPrice: 33.33, quantity: 3, total: 9999 },
      { unitPrice: 0.01, quantity: 1000000, total: 1000000 },
    ]) {
      const { order } = await createDraftOrder([testCase]);
      await confirmAndPayOrder(order, testCase.total, [testCase.total]);
    }
  }, 60000);

  it('sums two invoice lines exactly and conserves the total through payment and receipt', async () => {
    const { order } = await createDraftOrder([
      { unitPrice: 0.1, quantity: 1 },
      { unitPrice: 0.2, quantity: 1 },
    ]);
    await confirmAndPayOrder(order, 30, [10, 20]);
  }, 30000);

  it('rejects a discounted order atomically without changing inventory or creating financial/delivery rows', async () => {
    const { order, products } = await createDraftOrder([
      { unitPrice: 10, quantity: 2 },
    ]);
    await dataSource
      .getRepository(Order)
      .update(order.id, { discount: '0.01' });

    const inventoryBefore = await dataSource
      .getRepository(Inventory)
      .findOneByOrFail({ productId: products[0].id });
    const movementCountBefore = await dataSource
      .getRepository(InventoryMovement)
      .countBy({ inventoryId: inventoryBefore.id });

    const response = await authorized(
      request(server).post(
        `/organizations/${organizationId}/orders/${order.id}/confirm`,
      ),
    ).expect(409);
    expect((response.body as ApiErrorResponse).details.code).toBe(
      'ORDER_DISCOUNT_NOT_SUPPORTED',
    );

    const unchangedOrder = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    const unchangedInventory = await dataSource
      .getRepository(Inventory)
      .findOneByOrFail({ id: inventoryBefore.id });
    expect(unchangedOrder.status).toBe(OrderStatus.DRAFT);
    expect(unchangedInventory.quantity).toBe(inventoryBefore.quantity);
    expect(
      await dataSource
        .getRepository(InventoryMovement)
        .countBy({ inventoryId: inventoryBefore.id }),
    ).toBe(movementCountBefore);
    expect(
      await dataSource.getRepository(Invoice).countBy({ orderId: order.id }),
    ).toBe(0);
    expect(
      await dataSource.getRepository(Delivery).countBy({ orderId: order.id }),
    ).toBe(0);
  }, 30000);

  it('validates safe payment integer bounds and rejects unsafe transformer writes', async () => {
    const validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      validationPipe.transform(
        { idempotencyKey: 'max-safe-amount', amount: Number.MAX_SAFE_INTEGER },
        { type: 'body', metatype: CreatePaymentDto },
      ),
    ).resolves.toMatchObject({ amount: Number.MAX_SAFE_INTEGER });

    for (const amountLiteral of ['9007199254740992', '9007199254740993']) {
      const requestBody = `{"idempotencyKey":"${randomUUID()}","amount":${amountLiteral}}`;
      const response = await authorized(
        request(server).post(
          `/organizations/${organizationId}/invoices/${randomUUID()}/payments`,
        ),
      )
        .set('Content-Type', 'application/json')
        .send(requestBody)
        .expect(400);
      expect((response.body as ApiErrorResponse).statusCode).toBe(400);
    }

    const transformer = new KoboTransformer();
    expect(transformer.to(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(() => transformer.to(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'safe integer',
    );
  });
});
