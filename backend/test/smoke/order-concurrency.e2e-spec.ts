import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { OrdersService } from '../../src/orders/orders.service';
import { OrdersRepository } from '../../src/orders/orders.repository';
import { CustomersService } from '../../src/customers/customers.service';
import { ProductsService } from '../../src/products/products.service';
import { InventoryService } from '../../src/products/inventory.service';
import { InvoicesService } from '../../src/invoices/invoices.service';
import { UsersService } from '../../src/users/users.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PasswordService } from '../../src/security/password.service';
import { Order, OrderStatus } from '../../src/orders/entities/order.entity';
import { InventoryMovementType } from '../../src/products/entities/inventory-movement.entity';

/**
 * Orders — Concurrency Regression Tests (e2e)
 *
 * Covers the order state transitions that have NO concurrency test today
 * (only processOrder() has one, in order-lifecycle.e2e-spec.ts):
 * cancelOrder(), completeOrder() and confirmOrder().
 *
 * Source: CTO directive D4, step 1 — "add failing regression tests for the
 * Orders concurrency defects before making fixes". Findings F-1, F-1b, F-2
 * in the repo review (04-repo-review-findings.md).
 *
 * Each race gets up to two tests, kept separate so a reviewer can see
 * exactly which guarantee is broken:
 *   - INVARIANT tests assert the data-integrity facts that must hold no
 *     matter how the loser of the race is answered (stock restored/deducted
 *     exactly once, one invoice, status consistent with stock).
 *   - IDEMPOTENT-LOSER tests assert the locked codebase convention that the
 *     loser of a race gets the already-completed result back (HTTP 200
 *     equivalent), not a 400/409/500 — the same convention processOrder()
 *     already follows.
 *
 * Result on the UNFIXED code (5 consecutive runs, identical each time):
 *   F-1  cancel invariant ........ FAILS — two "inventory restored" movements
 *                                  are written; stock ends at 13 not 10
 *   F-1  cancel idempotent loser . PASSES today, but only because the loser
 *                                  is never validated at all (that is the
 *                                  bug). It stays in the suite so a naive
 *                                  fix that re-checks status and THROWS for
 *                                  the loser is caught.
 *   F-2  complete vs cancel ...... FAILS — order ends COMPLETED while its
 *                                  stock has been restored
 *   F-1b confirm invariant ....... GUARD, passes today. Stock is deducted
 *                                  once only because the loser's transaction
 *                                  is rolled back by createInvoiceForOrder()'s
 *                                  application-level "already has invoice"
 *                                  check (the invoices (organization_id,
 *                                  order_id) index is not unique).
 *   F-1b confirm idempotent loser  FAILS — the loser gets
 *                                  BadRequestException "Order <id> already
 *                                  has invoice INV-…", a misleading error
 *                                  for a harmless double-submit.
 *
 * Calls services directly (like order-lifecycle.e2e-spec.ts), against a real
 * Postgres instance — row locks and transaction rollback are the point.
 */
describe('Orders — Concurrency Regression (e2e)', () => {
  let app: INestApplication;
  let ordersService: OrdersService;
  let ordersRepository: OrdersRepository;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let invoicesService: InvoicesService;
  let orgId: string;
  let userId: string;
  let customerId: string;
  let shippingAddressId: string;

  const runId = randomUUID().slice(0, 8);
  const sku = () => `CONC-SKU-${randomUUID().slice(0, 8)}`;

  const STOCK = 10;
  const QTY = 3;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    ordersService = app.get(OrdersService);
    ordersRepository = app.get(OrdersRepository);
    productsService = app.get(ProductsService);
    inventoryService = app.get(InventoryService);
    invoicesService = app.get(InvoicesService);
    const customersService = app.get(CustomersService);
    const usersService = app.get(UsersService);
    const organizationsService = app.get(OrganizationsService);
    const passwordService = app.get(PasswordService);

    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'Concurrency',
        lastName: 'Tester',
        email: `order-concurrency.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const org = await organizationsService.createWithOwner(
      {
        name: `Order Concurrency Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    orgId = org.id;

    const customer = await customersService.createCustomer(
      orgId,
      {
        customerType: 'individual',
        firstName: 'Race',
        lastName: 'Customer',
      } as any,
      userId,
    );
    customerId = customer.id;

    const address = await customersService.addAddress(orgId, customerId, {
      line1: '12 Admiralty Way',
      city: 'Lekki',
      country: 'Nigeria',
    });
    shippingAddressId = address.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /** A product with STOCK units, and a DRAFT order for QTY of it. */
  async function seedDraftOrder(): Promise<{
    productId: string;
    order: Order;
  }> {
    const product = await productsService.createProduct(
      orgId,
      { name: `Concurrency Product ${sku()}`, sku: sku(), sellingPrice: 100 },
      userId,
    );
    await inventoryService.adjustInventory(
      orgId,
      product.id,
      {
        type: InventoryMovementType.ADD,
        quantity: STOCK,
        reason: 'Seed stock',
      },
      userId,
    );
    const order = await ordersService.createOrder(
      orgId,
      { customerId, shippingAddressId },
      userId,
    );
    await ordersService.addOrderItem(orgId, order.id, {
      productId: product.id,
      quantity: QTY,
    });
    return { productId: product.id, order };
  }

  async function seedConfirmedOrder() {
    const seeded = await seedDraftOrder();
    await ordersService.confirmOrder(orgId, seeded.order.id, userId);
    return seeded;
  }

  async function seedProcessingOrder() {
    const seeded = await seedConfirmedOrder();
    await ordersService.processOrder(orgId, seeded.order.id);
    return seeded;
  }

  async function stockOf(productId: string): Promise<number> {
    const inventory = await inventoryService.getInventory(orgId, productId);
    return inventory.quantity;
  }

  /** Movements for this product whose reason mentions the order number. */
  async function orderMovements(
    productId: string,
    orderNumber: string,
    type: InventoryMovementType,
  ) {
    const result = await inventoryService.listMovements(orgId, productId, {
      page: 1,
      limit: 100,
    });
    return result.data.filter(
      (m) => m.type === type && (m.reason ?? '').includes(orderNumber),
    );
  }

  type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
  const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
    p.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );

  // -------------------------------------------------------------------
  // F-1 — cancelOrder() concurrent double-submit
  // -------------------------------------------------------------------

  describe('cancelOrder() called concurrently on one order', () => {
    it(
      'INVARIANT: restores inventory exactly ONCE and writes exactly one ' +
        'restore movement (F-1)',
      async () => {
        const { productId, order } = await seedConfirmedOrder();
        expect(await stockOf(productId)).toBe(STOCK - QTY);

        await Promise.all([
          settle(ordersService.cancelOrder(orgId, order.id, userId)),
          settle(ordersService.cancelOrder(orgId, order.id, userId)),
        ]);

        const finalOrder = await ordersService.getOrder(orgId, order.id);
        expect(finalOrder.status).toBe(OrderStatus.CANCELLED);

        const restores = await orderMovements(
          productId,
          order.orderNumber,
          InventoryMovementType.ADD,
        );
        expect(restores).toHaveLength(1);
        expect(await stockOf(productId)).toBe(STOCK);
      },
    );

    it(
      'IDEMPOTENT LOSER: both concurrent calls resolve with the CANCELLED ' +
        'order — the loser is not answered with an error (F-1)',
      async () => {
        const { order } = await seedConfirmedOrder();

        const [first, second] = await Promise.all([
          settle(ordersService.cancelOrder(orgId, order.id, userId)),
          settle(ordersService.cancelOrder(orgId, order.id, userId)),
        ]);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (first.ok) expect(first.value.status).toBe(OrderStatus.CANCELLED);
        if (second.ok) expect(second.value.status).toBe(OrderStatus.CANCELLED);
      },
    );
  });

  // -------------------------------------------------------------------
  // F-2 — completeOrder() racing a cancel
  // -------------------------------------------------------------------

  describe('completeOrder() racing cancelOrder() on a PROCESSING order', () => {
    it(
      'INVARIANT: final status and stock are consistent — an order is ' +
        'never COMPLETED with its stock restored, nor CANCELLED without it ' +
        '(F-2)',
      async () => {
        const { productId, order } = await seedProcessingOrder();
        expect(await stockOf(productId)).toBe(STOCK - QTY);

        // Deterministic interleaving. The race window in completeOrder() is
        // between its (unlocked) read of the order and its save. Promise.all
        // alone cannot hit that window reliably, so hold completeOrder()'s
        // FIRST read of the order open until cancelOrder() has fully
        // committed — exactly the stale-read situation a real concurrent
        // request would be in. If a fix stops completeOrder() reading
        // before it locks, this hold simply lapses (3 s fallback) and the
        // invariant below must still hold either way.
        const realFindById = ordersRepository.findById.bind(
          ordersRepository,
        ) as OrdersRepository['findById'];
        let releaseGate!: () => void;
        const gate = new Promise<void>((resolve) => (releaseGate = resolve));
        jest
          .spyOn(ordersRepository, 'findById')
          .mockImplementationOnce(async (id: string) => {
            const stale = await realFindById(id);
            await Promise.race([
              gate,
              new Promise<void>((resolve) => setTimeout(resolve, 3000)),
            ]);
            return stale;
          });

        // completeOrder() must be invoked first so it consumes the held read.
        const completePromise = settle(
          ordersService.completeOrder(orgId, order.id),
        );
        const cancelPromise = settle(
          ordersService.cancelOrder(orgId, order.id, userId),
        );

        await cancelPromise;
        releaseGate();
        await completePromise;

        jest.restoreAllMocks();

        const finalOrder = await ordersService.getOrder(orgId, order.id);
        const finalStock = await stockOf(productId);

        if (finalOrder.status === OrderStatus.CANCELLED) {
          // cancel won: stock restored exactly once
          expect(finalStock).toBe(STOCK);
        } else {
          // complete won: stock must NOT have been restored
          expect(finalOrder.status).toBe(OrderStatus.COMPLETED);
          expect(finalStock).toBe(STOCK - QTY);
        }
      },
      20000,
    );
  });

  // -------------------------------------------------------------------
  // F-1b — confirmOrder() concurrent double-submit
  // -------------------------------------------------------------------

  describe('confirmOrder() called concurrently on one DRAFT order', () => {
    it(
      'INVARIANT [guard — passes today]: inventory is deducted exactly ' +
        'ONCE and exactly one invoice exists (F-1b)',
      async () => {
        const { productId, order } = await seedDraftOrder();

        await Promise.all([
          settle(ordersService.confirmOrder(orgId, order.id, userId)),
          settle(ordersService.confirmOrder(orgId, order.id, userId)),
        ]);

        const finalOrder = await ordersService.getOrder(orgId, order.id);
        expect(finalOrder.status).toBe(OrderStatus.CONFIRMED);

        const deductions = await orderMovements(
          productId,
          order.orderNumber,
          InventoryMovementType.REMOVE,
        );
        expect(deductions).toHaveLength(1);
        expect(await stockOf(productId)).toBe(STOCK - QTY);

        const invoices = (await invoicesService.listInvoices(orgId)).filter(
          (i) => i.orderId === order.id,
        );
        expect(invoices).toHaveLength(1);
      },
    );

    it(
      'IDEMPOTENT LOSER: both concurrent calls resolve with the CONFIRMED ' +
        'order — the loser is not answered with a 400 (F-1b)',
      async () => {
        const { order } = await seedDraftOrder();

        const [first, second] = await Promise.all([
          settle(ordersService.confirmOrder(orgId, order.id, userId)),
          settle(ordersService.confirmOrder(orgId, order.id, userId)),
        ]);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (first.ok) expect(first.value.status).toBe(OrderStatus.CONFIRMED);
        if (second.ok) expect(second.value.status).toBe(OrderStatus.CONFIRMED);
      },
    );
  });
});
