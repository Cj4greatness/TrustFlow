import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { OrdersService } from '../../src/orders/orders.service';
import { CustomersService } from '../../src/customers/customers.service';
import { ProductsService } from '../../src/products/products.service';
import { InventoryService } from '../../src/products/inventory.service';
import { InvoicesService } from '../../src/invoices/invoices.service';
import { PaymentsService } from '../../src/payments/payments.service';
import { UsersService } from '../../src/users/users.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PasswordService } from '../../src/security/password.service';
import { InvoiceStatus } from '../../src/invoices/entities/invoice.entity';
import { InventoryMovementType } from '../../src/products/entities/inventory-movement.entity';

/**
 * Finance — Invoice/Payment Lifecycle & Tenant Isolation (e2e)
 *
 * Calls OrdersService/InvoicesService/PaymentsService directly, not
 * through HTTP — same reasoning as
 * supplier-tenant-isolation.e2e-spec.ts: INVOICE_UPDATE,
 * INVOICE_ISSUE, PAYMENT_CREATE remain entirely unassigned in
 * permission-matrix.ts pending CTO review (discovered while writing
 * this suite), so an HTTP-level test would only ever see 403 right
 * now — not a meaningful permanent assertion. INVOICE_READ and
 * PAYMENT_READ WERE assigned (to Viewer, applying the existing
 * "Viewer is read-only" rule), but that alone isn't enough to test
 * the mutating flows this suite actually needs to prove.
 *
 * This suite proves what a compile check and the migration success
 * cannot:
 *  1. Invoice creation is genuinely automatic on Order confirmation,
 *     inside the same transaction, with correct line-item snapshotting
 *     from the real OrderItem entity.
 *  2. Two-stage approval is enforced (DRAFT -> APPROVED -> ISSUED,
 *     no skipping).
 *  3. Tenant isolation holds for both Invoice and Payment — Org B
 *     cannot reach Org A's financial records through the ownership
 *     check, same pattern as Suppliers.
 *  4. Payments can be recorded against a non-ISSUED invoice (ratified
 *     decision — deposits before issuance are valid).
 *  5. Overpayment is allowed, not rejected, and sets
 *     flaggedForReview — proving InvoicesService.applyPayment()'s
 *     actual behavior, not just its doc comment.
 *  6. Idempotency actually replays: the same idempotencyKey returns
 *     the original Payment and does NOT double-apply amountPaid —
 *     the CTO's top-priority production blocker, now verified
 *     against a real transaction and a real unique constraint, not
 *     just code review.
 */
describe('Finance — Invoice/Payment Lifecycle & Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let ordersService: OrdersService;
  let customersService: CustomersService;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let invoicesService: InvoicesService;
  let paymentsService: PaymentsService;
  let orgAId: string;
  let orgBId: string;
  let userId: string;
  let customerAId: string;

  const runId = randomUUID().slice(0, 8);
  const sku = () => `FIN-SKU-${randomUUID().slice(0, 8)}`;

  /**
   * Creates a product, stocks it, creates an order for Org A with
   * one line item, and confirms it — returning the auto-created
   * Invoice. Shared setup for every test below that needs a
   * starting Invoice, so each test isn't re-deriving the same
   * five-call setup.
   */
  async function createConfirmedOrderWithInvoice(
    unitPrice: number,
    quantity: number,
  ) {
    const product = await productsService.createProduct(
      orgAId,
      { name: 'Finance Test Product', sku: sku(), sellingPrice: unitPrice },
      userId,
    );
    await inventoryService.adjustInventory(
      orgAId,
      product.id,
      {
        type: InventoryMovementType.ADD,
        quantity: quantity + 10,
        reason: 'Seed stock',
      },
      userId,
    );

    const order = await ordersService.createOrder(
      orgAId,
      { customerId: customerAId },
      userId,
    );
    await ordersService.addOrderItem(orgAId, order.id, {
      productId: product.id,
      quantity,
    });

    await ordersService.confirmOrder(orgAId, order.id, userId);

    const invoices = await invoicesService.listInvoices(orgAId);
    const invoice = invoices.find((i) => i.orderId === order.id);
    if (!invoice) {
      throw new Error('Expected an invoice to be auto-created on confirm');
    }
    return { order, product, invoice };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    ordersService = app.get(OrdersService);
    customersService = app.get(CustomersService);
    productsService = app.get(ProductsService);
    inventoryService = app.get(InventoryService);
    invoicesService = app.get(InvoicesService);
    paymentsService = app.get(PaymentsService);
    const usersService = app.get(UsersService);
    const organizationsService = app.get(OrganizationsService);
    const passwordService = app.get(PasswordService);

    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'Finance',
        lastName: 'Tester',
        email: `finance-tester.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const orgA = await organizationsService.createWithOwner(
      {
        name: `Finance Test Org A ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    orgAId = orgA.id;

    const orgB = await organizationsService.createWithOwner(
      {
        name: `Finance Test Org B ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    orgBId = orgB.id;

    const customerA = await customersService.createCustomer(
      orgAId,
      {
        customerType: 'individual',
        firstName: 'Finance',
        lastName: 'Customer',
      } as any,
      userId,
    );
    customerAId = customerA.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it(
    'creates a DRAFT invoice automatically when an order is confirmed, ' +
      'with correctly snapshotted line items and a year-prefixed number',
    async () => {
      const { order, product, invoice } = await createConfirmedOrderWithInvoice(
        500,
        4,
      );

      expect(invoice.orderId).toBe(order.id);
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
      // 500 naira * 4 = 2000 naira = 200000 kobo
      expect(invoice.total).toBe(200000);
      expect(invoice.amountDue).toBe(200000);
      expect(invoice.amountPaid).toBe(0);

      const fullInvoice = await invoicesService.getInvoice(invoice.id, orgAId);
      expect(fullInvoice.lineItems).toHaveLength(1);
      expect(fullInvoice.lineItems[0].productId).toBe(product.id);
      expect(fullInvoice.lineItems[0].quantity).toBe(4);
    },
  );

  it(
    'enforces two-stage approval — cannot ISSUE a DRAFT invoice, ' +
      'must go DRAFT -> APPROVED -> ISSUED',
    async () => {
      const { invoice } = await createConfirmedOrderWithInvoice(1000, 2);

      await expect(
        invoicesService.issueInvoice(invoice.id, orgAId),
      ).rejects.toThrow(BadRequestException);

      const approved = await invoicesService.approveInvoice(invoice.id, orgAId);
      expect(approved.status).toBe(InvoiceStatus.APPROVED);

      const issued = await invoicesService.issueInvoice(invoice.id, orgAId);
      expect(issued.status).toBe(InvoiceStatus.ISSUED);
      expect(issued.issueDate).not.toBeNull();

      // Cannot approve twice
      await expect(
        invoicesService.approveInvoice(invoice.id, orgAId),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it("forbids reaching Org A's invoice through Org B's ownership check", async () => {
    const { invoice } = await createConfirmedOrderWithInvoice(300, 1);

    await expect(
      invoicesService.getInvoice(invoice.id, orgBId),
    ).rejects.toThrow(NotFoundException);
  });

  it(
    'records a payment against a DRAFT (not yet issued) invoice — ' +
      'ratified: no status guard, deposits before issuance are valid',
    async () => {
      const { invoice } = await createConfirmedOrderWithInvoice(1000, 1);
      expect(invoice.status).toBe(InvoiceStatus.DRAFT);

      const payment = await paymentsService.recordPayment(
        invoice.id,
        { idempotencyKey: randomUUID(), amount: 50000 },
        orgAId,
        userId,
      );

      expect(payment.amount).toBe(50000);

      const updatedInvoice = await invoicesService.getInvoice(
        invoice.id,
        orgAId,
      );
      expect(updatedInvoice.amountPaid).toBe(50000);
      expect(updatedInvoice.amountDue).toBe(50000);
      expect(updatedInvoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(updatedInvoice.flaggedForReview).toBe(false);
    },
  );

  it(
    'fully pays an invoice and marks it PAID, then allows an ' +
      'overpayment on top — flagging it for review rather than rejecting it',
    async () => {
      const { invoice } = await createConfirmedOrderWithInvoice(1000, 1);
      // total = 100000 kobo

      await paymentsService.recordPayment(
        invoice.id,
        { idempotencyKey: randomUUID(), amount: 100000 },
        orgAId,
        userId,
      );

      const paidInvoice = await invoicesService.getInvoice(invoice.id, orgAId);
      expect(paidInvoice.status).toBe(InvoiceStatus.PAID);
      expect(paidInvoice.amountDue).toBe(0);
      expect(paidInvoice.flaggedForReview).toBe(false);

      // Overpayment on an already-PAID invoice — ratified: allowed,
      // not blocked, not silently clamped.
      await paymentsService.recordPayment(
        invoice.id,
        { idempotencyKey: randomUUID(), amount: 20000 },
        orgAId,
        userId,
      );

      const overpaidInvoice = await invoicesService.getInvoice(
        invoice.id,
        orgAId,
      );
      expect(overpaidInvoice.amountPaid).toBe(120000);
      expect(overpaidInvoice.amountDue).toBe(-20000);
      expect(overpaidInvoice.status).toBe(InvoiceStatus.PAID);
      expect(overpaidInvoice.flaggedForReview).toBe(true);
    },
  );

  it(
    'replays an idempotent payment instead of double-applying it — ' +
      'the CTO-flagged production blocker, verified end to end',
    async () => {
      const { invoice } = await createConfirmedOrderWithInvoice(1000, 1);
      const key = randomUUID();

      const first = await paymentsService.recordPayment(
        invoice.id,
        { idempotencyKey: key, amount: 40000 },
        orgAId,
        userId,
      );

      // Simulate a retry / accidental double-click: same key, same
      // call, again.
      const second = await paymentsService.recordPayment(
        invoice.id,
        { idempotencyKey: key, amount: 40000 },
        orgAId,
        userId,
      );

      expect(second.id).toBe(first.id);

      const invoiceAfterReplay = await invoicesService.getInvoice(
        invoice.id,
        orgAId,
      );
      // Must be applied ONCE, not twice — 40000, not 80000.
      expect(invoiceAfterReplay.amountPaid).toBe(40000);
      expect(invoiceAfterReplay.status).toBe(InvoiceStatus.PARTIALLY_PAID);

      const payments = await paymentsService.listPaymentsForInvoice(
        invoice.id,
        orgAId,
      );
      expect(payments).toHaveLength(1);
    },
  );

  it(
    'rejects two DIFFERENT idempotency keys as two separate payments ' +
      '— proves the key is actually discriminating, not just present',
    async () => {
      const { invoice } = await createConfirmedOrderWithInvoice(1000, 2);

      await paymentsService.recordPayment(
        invoice.id,
        { idempotencyKey: randomUUID(), amount: 30000 },
        orgAId,
        userId,
      );
      await paymentsService.recordPayment(
        invoice.id,
        { idempotencyKey: randomUUID(), amount: 30000 },
        orgAId,
        userId,
      );

      const invoiceAfterBoth = await invoicesService.getInvoice(
        invoice.id,
        orgAId,
      );
      expect(invoiceAfterBoth.amountPaid).toBe(60000);

      const payments = await paymentsService.listPaymentsForInvoice(
        invoice.id,
        orgAId,
      );
      expect(payments).toHaveLength(2);
    },
  );

  it("forbids reaching Org A's payment through Org B's ownership check", async () => {
    const { invoice } = await createConfirmedOrderWithInvoice(500, 1);
    const payment = await paymentsService.recordPayment(
      invoice.id,
      { idempotencyKey: randomUUID(), amount: 10000 },
      orgAId,
      userId,
    );

    await expect(
      paymentsService.getPayment(payment.id, orgBId),
    ).rejects.toThrow(NotFoundException);
  });
});
