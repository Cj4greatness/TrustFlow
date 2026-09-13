import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ReceiptsService } from '../../src/receipts/receipts.service';
import { ReceiptSettingsService } from '../../src/receipt-settings/receipt-settings.service';
import { DataSource } from 'typeorm';
import { Receipt } from '../../src/receipts/entities/receipt.entity';
import {
  Payment,
  PaymentStatus,
  PaymentMethod,
} from '../../src/payments/entities/payment.entity';

interface AuthResponseBody {
  accessToken: string;
}
interface OrganizationResponseBody {
  id: string;
  name: string;
}
interface InvitationResponseBody {
  token: string;
}
interface CustomerResponseBody {
  id: string;
}
interface ProductResponseBody {
  id: string;
}
interface OrderResponseBody {
  id: string;
}
interface InvoiceResponseBody {
  id: string;
  orderId: string;
  status: string;
}
interface PaymentResponseBody {
  id: string;
  amount: number;
}
interface ReceiptResponseBody {
  id: string;
  paymentId: string;
  receiptNumber: string;
  amount: number;
  displayNameSnapshot: string;
  accentColorSnapshot: string;
  status: string;
}

describe('Receipts — Full Chain, Branding Snapshot, RBAC & Idempotency (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let receiptsService: ReceiptsService;
  let receiptSettingsService: ReceiptSettingsService;
  let dataSource: DataSource;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const ownerEmail = `rc-owner.${runId}@example.com`;
  const adminEmail = `rc-admin.${runId}@example.com`;
  const managerEmail = `rc-manager.${runId}@example.com`;
  const viewerEmail = `rc-viewer.${runId}@example.com`;
  const orgBOwnerEmail = `rc-orgb-owner.${runId}@example.com`;

  let ownerToken: string;
  let adminToken: string;
  let managerToken: string;
  let viewerToken: string;
  let orgBOwnerToken: string;

  let orgAId: string;
  let orgBId: string;
  let customerAId: string;

  const registerAndLogin = async (
    email: string,
    firstName: string,
  ): Promise<string> => {
    await request(server).post('/auth/register').send({
      email,
      password: PASSWORD,
      firstName,
      lastName: 'Test',
    });
    const loginRes = await request(server)
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (loginRes.body as AuthResponseBody).accessToken;
  };

  const inviteAndAccept = async (
    inviteeEmail: string,
    inviteeToken: string,
    role: string,
  ): Promise<void> => {
    const inviteRes = await request(server)
      .post(`/organizations/${orgAId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: inviteeEmail, role })
      .expect(201);
    const invite = inviteRes.body as InvitationResponseBody;
    await request(server)
      .post(`/organizations/invitations/${invite.token}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(204);
  };

  const createPaidOrderWithReceipt = async (
    unitPrice: number,
    quantity: number,
  ): Promise<{ payment: PaymentResponseBody; invoiceId: string }> => {
    const productRes = await request(server)
      .post(`/organizations/${orgAId}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Receipt Chain Product',
        sku: `RC-${randomUUID().slice(0, 8)}`,
        sellingPrice: unitPrice,
      })
      .expect(201);
    const product = productRes.body as ProductResponseBody;

    await request(server)
      .post(
        `/organizations/${orgAId}/products/${product.id}/inventory/adjustments`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'add', quantity: quantity + 10, reason: 'Seed stock' })
      .expect(201);

    const orderRes = await request(server)
      .post(`/organizations/${orgAId}/orders`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ customerId: customerAId })
      .expect(201);
    const order = orderRes.body as OrderResponseBody;

    await request(server)
      .post(`/organizations/${orgAId}/orders/${order.id}/items`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId: product.id, quantity })
      .expect(201);

    await request(server)
      .post(`/organizations/${orgAId}/orders/${order.id}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const invoicesRes = await request(server)
      .get(`/organizations/${orgAId}/invoices`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const invoices = invoicesRes.body as InvoiceResponseBody[];
    const invoice = invoices.find((i) => i.orderId === order.id);
    if (!invoice) throw new Error('Expected auto-created invoice not found');

    const totalKobo = unitPrice * quantity * 100;
    const paymentRes = await request(server)
      .post(`/organizations/${orgAId}/invoices/${invoice.id}/payments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: randomUUID(), amount: totalKobo })
      .expect(201);

    return {
      payment: paymentRes.body as PaymentResponseBody,
      invoiceId: invoice.id,
    };
  };

  const waitForReceipt = async (
    paymentId: string,
  ): Promise<ReceiptResponseBody> => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await request(server)
        .get(`/organizations/${orgAId}/receipts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const receipts = res.body as ReceiptResponseBody[];
      const match = receipts.find((r) => r.paymentId === paymentId);
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(
      `Receipt for payment ${paymentId} did not appear after polling`,
    );
  };

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
    receiptsService = app.get(ReceiptsService);
    receiptSettingsService = app.get(ReceiptSettingsService);
    dataSource = app.get(DataSource);

    ownerToken = await registerAndLogin(ownerEmail, 'RCOwner');
    adminToken = await registerAndLogin(adminEmail, 'RCAdmin');
    managerToken = await registerAndLogin(managerEmail, 'RCManager');
    viewerToken = await registerAndLogin(viewerEmail, 'RCViewer');
    orgBOwnerToken = await registerAndLogin(orgBOwnerEmail, 'RCOrgBOwner');

    const orgARes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Receipts Org A ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgAId = (orgARes.body as OrganizationResponseBody).id;

    const orgBRes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${orgBOwnerToken}`)
      .send({
        name: `Receipts Org B ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgBId = (orgBRes.body as OrganizationResponseBody).id;

    await inviteAndAccept(adminEmail, adminToken, 'admin');
    await inviteAndAccept(managerEmail, managerToken, 'manager');
    await inviteAndAccept(viewerEmail, viewerToken, 'viewer');

    const customerRes = await request(server)
      .post(`/organizations/${orgAId}/customers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        customerType: 'individual',
        firstName: 'Receipt',
        lastName: 'Customer',
      })
      .expect(201);
    customerAId = (customerRes.body as CustomerResponseBody).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Full chain — §20', () => {
    it(
      'creates a receipt automatically when a payment succeeds, with a ' +
        'sequential TF-prefixed number and correct branding snapshot',
      async () => {
        await receiptSettingsService.updateSettings(orgAId, {
          displayName: 'Chisom Fashion Store',
          accentColor: '#2563EB',
        });

        const { payment } = await createPaidOrderWithReceipt(1000, 2);
        const receipt = await waitForReceipt(payment.id);

        expect(receipt.receiptNumber).toMatch(/^TF-\d{6}$/);
        expect(receipt.amount).toBe(payment.amount);
        expect(receipt.displayNameSnapshot).toBe('Chisom Fashion Store');
        expect(receipt.accentColorSnapshot).toBe('#2563EB');
        expect(receipt.status).toBe('issued');
      },
    );
  });

  describe('Branding snapshot immutability — §19', () => {
    it(
      'changing ReceiptSettings after a receipt is issued does NOT ' +
        'retroactively change that receipt',
      async () => {
        await receiptSettingsService.updateSettings(orgAId, {
          displayName: 'Original Name',
          accentColor: '#111111',
        });

        const { payment: firstPayment } = await createPaidOrderWithReceipt(
          500,
          1,
        );
        const firstReceipt = await waitForReceipt(firstPayment.id);
        expect(firstReceipt.displayNameSnapshot).toBe('Original Name');
        expect(firstReceipt.accentColorSnapshot).toBe('#111111');

        await receiptSettingsService.updateSettings(orgAId, {
          displayName: 'Changed Name',
          accentColor: '#222222',
        });

        const { payment: secondPayment } = await createPaidOrderWithReceipt(
          500,
          1,
        );
        const secondReceipt = await waitForReceipt(secondPayment.id);
        expect(secondReceipt.displayNameSnapshot).toBe('Changed Name');
        expect(secondReceipt.accentColorSnapshot).toBe('#222222');

        const firstReceiptRefetch = await request(server)
          .get(`/organizations/${orgAId}/receipts/${firstReceipt.id}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);
        const refetched = firstReceiptRefetch.body as ReceiptResponseBody;
        expect(refetched.displayNameSnapshot).toBe('Original Name');
        expect(refetched.accentColorSnapshot).toBe('#111111');
      },
    );
  });

  describe('Idempotency — §20 (direct service call, see file header)', () => {
    it(
      'creates only ONE receipt even when handlePaymentSucceeded fires ' +
        'twice for the same payment',
      async () => {
        const { payment } = await createPaidOrderWithReceipt(300, 1);
        await waitForReceipt(payment.id);

        await receiptsService.handlePaymentSucceeded({
          paymentId: payment.id,
          invoiceId: '',
          organizationId: orgAId,
          amount: payment.amount,
        });

        const listRes = await request(server)
          .get(`/organizations/${orgAId}/receipts`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);
        const matching = (listRes.body as ReceiptResponseBody[]).filter(
          (r) => r.paymentId === payment.id,
        );
        expect(matching).toHaveLength(1);
      },
    );
  });

  describe('No create endpoint — §4', () => {
    it('has no POST /receipts route at all', async () => {
      await request(server)
        .post(`/organizations/${orgAId}/receipts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1000 })
        .expect(404);
    });
  });

  describe('RBAC — RECEIPT_READ is every role, RECEIPT_VOID is Owner/Admin only', () => {
    it('allows Viewer to read receipts', async () => {
      await request(server)
        .get(`/organizations/${orgAId}/receipts`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('forbids Manager from voiding a receipt', async () => {
      const { payment } = await createPaidOrderWithReceipt(200, 1);
      const receipt = await waitForReceipt(payment.id);

      await request(server)
        .post(`/organizations/${orgAId}/receipts/${receipt.id}/void`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('allows Admin to void a receipt', async () => {
      const { payment } = await createPaidOrderWithReceipt(200, 1);
      const receipt = await waitForReceipt(payment.id);

      const res = await request(server)
        .post(`/organizations/${orgAId}/receipts/${receipt.id}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect((res.body as ReceiptResponseBody).status).toBe('voided');
    });
  });

  describe('Tenant isolation', () => {
    it("forbids Org B's owner from reading Org A's receipts", async () => {
      await request(server)
        .get(`/organizations/${orgAId}/receipts`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(403);
    });

    it("forbids Org B's owner from reaching a specific Org A receipt by ID", async () => {
      const { payment } = await createPaidOrderWithReceipt(150, 1);
      const receipt = await waitForReceipt(payment.id);
      await request(server)
        .get(`/organizations/${orgAId}/receipts/${receipt.id}`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(403);
    });

    it("Org B's own receipts list is unaffected by Org A's activity", async () => {
      const res = await request(server)
        .get(`/organizations/${orgBId}/receipts`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(200);
      const orgBReceipts = res.body as ReceiptResponseBody[];
      expect(orgBReceipts).toHaveLength(0);
    });
  });

  describe('Regenerate — recovery mechanism (Backend Readiness & Freeze Audit, Section 3)', () => {
    it('creates the missing receipt when none exists for a successful payment', async () => {
      const { payment } = await createPaidOrderWithReceipt(400, 1);
      const original = await waitForReceipt(payment.id);

      await dataSource.getRepository(Receipt).delete({ id: original.id });

      const res = await request(server)
        .post(`/organizations/${orgAId}/receipts/regenerate/${payment.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const regenerated = res.body as ReceiptResponseBody;

      expect(regenerated.paymentId).toBe(payment.id);
      expect(regenerated.amount).toBe(payment.amount);
      expect(regenerated.status).toBe('issued');

      const listRes = await request(server)
        .get(`/organizations/${orgAId}/receipts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const matching = (listRes.body as ReceiptResponseBody[]).filter(
        (r) => r.paymentId === payment.id,
      );
      expect(matching).toHaveLength(1);
    });

    it('returns the existing receipt unchanged when one already exists, rather than creating a duplicate', async () => {
      const { payment } = await createPaidOrderWithReceipt(350, 1);
      const original = await waitForReceipt(payment.id);

      const res = await request(server)
        .post(`/organizations/${orgAId}/receipts/regenerate/${payment.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const returned = res.body as ReceiptResponseBody;

      expect(returned.id).toBe(original.id);
      expect(returned.receiptNumber).toBe(original.receiptNumber);

      const listRes = await request(server)
        .get(`/organizations/${orgAId}/receipts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const matching = (listRes.body as ReceiptResponseBody[]).filter(
        (r) => r.paymentId === payment.id,
      );
      expect(matching).toHaveLength(1);
    });

    it("forbids reaching Org A's payment through Org B's regenerate call", async () => {
      const { payment } = await createPaidOrderWithReceipt(250, 1);
      await waitForReceipt(payment.id);

      await request(server)
        .post(`/organizations/${orgBId}/receipts/regenerate/${payment.id}`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(404);
    });

    it('rejects regenerating a receipt for a payment that never succeeded', async () => {
      const { payment, invoiceId } = await createPaidOrderWithReceipt(100, 1);
      await waitForReceipt(payment.id);

      const paymentRows = await dataSource.query<{ created_by: string }[]>(
        'SELECT created_by FROM payments WHERE id = $1',
        [payment.id],
      );
      const createdBy: string = paymentRows[0].created_by;

      const ineligiblePayment = await dataSource.getRepository(Payment).save(
        dataSource.getRepository(Payment).create({
          organizationId: orgAId,
          invoiceId,
          idempotencyKey: randomUUID(),
          amount: 10000,
          currency: 'NGN',
          method: PaymentMethod.MANUAL,
          status: PaymentStatus.FAILED,
          createdBy,
        }),
      );

      await request(server)
        .post(
          `/organizations/${orgAId}/receipts/regenerate/${ineligiblePayment.id}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });

    it('creates exactly one receipt when regenerate is called concurrently for the same payment with no existing receipt', async () => {
      const { payment } = await createPaidOrderWithReceipt(450, 1);
      const original = await waitForReceipt(payment.id);

      await dataSource.getRepository(Receipt).delete({ id: original.id });

      const [firstRes, secondRes] = await Promise.all([
        request(server)
          .post(`/organizations/${orgAId}/receipts/regenerate/${payment.id}`)
          .set('Authorization', `Bearer ${ownerToken}`),
        request(server)
          .post(`/organizations/${orgAId}/receipts/regenerate/${payment.id}`)
          .set('Authorization', `Bearer ${ownerToken}`),
      ]);

      expect(firstRes.status).toBe(200);
      expect(secondRes.status).toBe(200);
      const first = firstRes.body as ReceiptResponseBody;
      const second = secondRes.body as ReceiptResponseBody;
      expect(first.id).toBe(second.id);

      const listRes = await request(server)
        .get(`/organizations/${orgAId}/receipts`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const matching = (listRes.body as ReceiptResponseBody[]).filter(
        (r) => r.paymentId === payment.id,
      );
      expect(matching).toHaveLength(1);
    });

    it('forbids Manager from regenerating a receipt', async () => {
      const { payment } = await createPaidOrderWithReceipt(200, 1);
      await waitForReceipt(payment.id);

      await request(server)
        .post(`/organizations/${orgAId}/receipts/regenerate/${payment.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });
  });
});
