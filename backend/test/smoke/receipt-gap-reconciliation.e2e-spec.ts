import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { ReceiptsService } from '../../src/receipts/receipts.service';
import { Receipt } from '../../src/receipts/entities/receipt.entity';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from '../../src/payments/entities/payment.entity';

describe('Receipt gap reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let receiptsService: ReceiptsService;

  const runId = randomUUID().slice(0, 8);
  let accessToken: string;
  let userId: string;
  let organizationAId: string;
  let organizationBId: string;
  let invoiceAId: string;
  let paymentAId: string;
  let paymentBId: string;
  let failedPaymentId: string;

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
    receiptsService = app.get(ReceiptsService);

    const registration = await app.get(AuthService).register({
      email: `receipt-reconcile-${runId}@example.com`,
      password: 'SecurePass123',
      firstName: 'Receipt',
      lastName: 'Reconcile',
    });
    accessToken = registration.accessToken;
    userId = registration.user.id;

    const organizationsService = app.get(OrganizationsService);
    const organizationA = await organizationsService.createWithOwner(
      { name: `Reconcile Org A ${runId}`, country: 'Nigeria', currency: 'NGN' },
      userId,
    );
    const organizationB = await organizationsService.createWithOwner(
      { name: `Reconcile Org B ${runId}`, country: 'Nigeria', currency: 'NGN' },
      userId,
    );
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    for (const organizationId of [organizationAId, organizationBId]) {
      const customersService = app.get(CustomersService);
      const customer = await customersService.createCustomer(
        organizationId,
        {
          customerType: 'individual',
          firstName: 'Receipt',
          lastName: 'Customer',
        } as never,
        userId,
      );

      const productsService = app.get(ProductsService);
      const product = await productsService.createProduct(
        organizationId,
        {
          name: `Reconcile Widget ${runId}`,
          sku: `REC-${organizationId.slice(0, 8)}-${runId}`,
          sellingPrice: 1234,
        },
        userId,
      );

      const inventoryService = app.get(InventoryService);
      await dataSource.transaction(async (manager) => {
        await inventoryService.adjustInventory(
          organizationId,
          product.id,
          {
            type: InventoryMovementType.ADD,
            quantity: 10,
            reason: 'Receipt reconciliation fixture stock',
          },
          userId,
          manager,
        );
      });

      const ordersService = app.get(OrdersService);
      const order = await ordersService.createOrder(
        organizationId,
        { customerId: customer.id, notes: 'Receipt reconciliation fixture' },
        userId,
      );
      await ordersService.addOrderItem(organizationId, order.id, {
        productId: product.id,
        quantity: 1,
      });
      await ordersService.confirmOrder(organizationId, order.id, userId);

      const invoices = await app
        .get(InvoicesService)
        .listInvoices(organizationId);
      const invoice = invoices.find((entry) => entry.orderId === order.id);
      if (!invoice) {
        throw new Error('Reconciliation fixture: invoice missing');
      }

      const paymentResponse = await request(server)
        .post(
          `/organizations/${organizationId}/invoices/${invoice.id}/payments`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          idempotencyKey: `receipt-gap-${organizationId}-${runId}`,
          amount: 1234,
        })
        .expect(201);

      if (organizationId === organizationAId) {
        invoiceAId = invoice.id;
        paymentAId = (paymentResponse.body as { id: string }).id;
      } else {
        paymentBId = (paymentResponse.body as { id: string }).id;
      }
    }

    for (const paymentId of [paymentAId, paymentBId]) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const receipt = await dataSource
          .getRepository(Receipt)
          .findOne({ where: { paymentId } });
        if (receipt) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    await dataSource
      .getRepository(Receipt)
      .delete({ paymentId: paymentAId, organizationId: organizationAId });
    await dataSource
      .getRepository(Receipt)
      .delete({ paymentId: paymentBId, organizationId: organizationBId });

    const failedPayment = dataSource.getRepository(Payment).create({
      organizationId: organizationAId,
      invoiceId: invoiceAId,
      idempotencyKey: `failed-payment-no-reconcile-${runId}`,
      amount: 100,
      currency: 'NGN',
      method: PaymentMethod.MANUAL,
      providerReference: null,
      status: PaymentStatus.FAILED,
      confirmedBy: null,
      confirmedAt: null,
      createdBy: userId,
    });
    const savedFailed = await dataSource
      .getRepository(Payment)
      .save(failedPayment);
    failedPaymentId = savedFailed.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('reproduces a successful-payment gap when the receipt handler fails', async () => {
    const privateReceiptService = receiptsService as unknown as {
      createReceiptForPayment: (
        paymentId: string,
        organizationId: string,
      ) => Promise<unknown>;
    };
    const handlerSpy = jest
      .spyOn(privateReceiptService, 'createReceiptForPayment')
      .mockRejectedValue(new Error('isolated receipt handler failure'));

    const response = await request(server)
      .post(`/organizations/${organizationAId}/invoices/${invoiceAId}/payments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        idempotencyKey: `receipt-gap-repro-${runId}`,
        amount: 1,
      })
      .expect(201);
    const reproducedPaymentId = (response.body as { id: string }).id;

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      await dataSource
        .getRepository(Receipt)
        .findOne({ where: { paymentId: reproducedPaymentId } }),
    ).toBeNull();

    const candidates = await receiptsService.reconcileMissingReceipts({
      organizationId: organizationAId,
      limit: 100,
      execute: false,
    });
    expect(
      candidates.candidates.map((candidate) => candidate.paymentId),
    ).toContain(reproducedPaymentId);

    handlerSpy.mockRestore();
  });

  it('dry-run reports an orphan without writing a receipt', async () => {
    const before = await dataSource.getRepository(Receipt).count({
      where: { paymentId: paymentAId, organizationId: organizationAId },
    });
    expect(before).toBe(0);

    const result = await receiptsService.reconcileMissingReceipts({
      organizationId: organizationAId,
      limit: 100,
      execute: false,
    });
    expect(result.dryRun).toBe(true);
    expect(result.candidates.map((candidate) => candidate.paymentId)).toContain(
      paymentAId,
    );
    expect(result.reconciled).toHaveLength(0);

    const after = await dataSource.getRepository(Receipt).count({
      where: { paymentId: paymentAId, organizationId: organizationAId },
    });
    expect(after).toBe(before);
  });

  it('execute creates exactly one matching receipt with a sequential number', async () => {
    const result = await receiptsService.reconcileMissingReceipts({
      organizationId: organizationAId,
      limit: 100,
      execute: true,
    });
    expect(result.reconciled).toContain(paymentAId);

    const receipts = await dataSource.getRepository(Receipt).find({
      where: { paymentId: paymentAId, organizationId: organizationAId },
    });
    expect(receipts).toHaveLength(1);
    expect(receipts[0].amount).toBe(1234);
    expect(receipts[0].organizationId).toBe(organizationAId);
    expect(receipts[0].receiptNumber).toMatch(/^TF-\d{6}$/);
  });

  it('running execute again creates nothing', async () => {
    const result = await receiptsService.reconcileMissingReceipts({
      organizationId: organizationAId,
      limit: 100,
      execute: true,
    });
    expect(result.reconciled).not.toContain(paymentAId);
    expect(
      await dataSource.getRepository(Receipt).count({
        where: { paymentId: paymentAId, organizationId: organizationAId },
      }),
    ).toBe(1);
  });

  it('leaves existing receipts and non-successful payments untouched', async () => {
    const before = await dataSource
      .getRepository(Receipt)
      .find({ where: { organizationId: organizationAId } });

    const result = await receiptsService.reconcileMissingReceipts({
      organizationId: organizationAId,
      limit: 100,
      execute: true,
    });
    expect(
      result.candidates.map((candidate) => candidate.paymentId),
    ).not.toContain(failedPaymentId);

    const after = await dataSource
      .getRepository(Receipt)
      .find({ where: { organizationId: organizationAId } });
    expect(after).toEqual(before);
  });

  it('isolates reconciliation by organization', async () => {
    const orgADryRun = await receiptsService.reconcileMissingReceipts({
      organizationId: organizationAId,
      limit: 100,
      execute: false,
    });
    expect(
      orgADryRun.candidates.map((candidate) => candidate.paymentId),
    ).not.toContain(paymentBId);

    const orgBDryRun = await receiptsService.reconcileMissingReceipts({
      organizationId: organizationBId,
      limit: 100,
      execute: false,
    });
    expect(
      orgBDryRun.candidates.map((candidate) => candidate.paymentId),
    ).toContain(paymentBId);

    await receiptsService.reconcileMissingReceipts({
      organizationId: organizationBId,
      limit: 100,
      execute: true,
    });
    expect(
      await dataSource.getRepository(Receipt).count({
        where: { paymentId: paymentBId, organizationId: organizationBId },
      }),
    ).toBe(1);
  });
});
