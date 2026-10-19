import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { OrdersService } from '../../src/orders/orders.service';
import { CustomersService } from '../../src/customers/customers.service';
import { ProductsService } from '../../src/products/products.service';
import { InventoryService } from '../../src/products/inventory.service';
import { UsersService } from '../../src/users/users.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PasswordService } from '../../src/security/password.service';
import { DeliveriesService } from '../../src/deliveries/deliveries.service';
import { InvoicesService } from '../../src/invoices/invoices.service';
import { OrderStatus } from '../../src/orders/entities/order.entity';
import { InventoryMovementType } from '../../src/products/entities/inventory-movement.entity';

/**
 * Orders — Concurrency Hardening (e2e)
 *
 * Reproduces the three deferred Orders races from the Backend
 * Readiness & Freeze Audit (CTO directive D4, steps 1-2):
 *
 *   1. confirmOrder() deducted inventory BEFORE taking the order
 *      row lock, so two concurrent confirms could both deduct.
 *   2. cancelOrder() restored inventory BEFORE taking the order row
 *      lock, so two concurrent cancels could both restore.
 *   3. completeOrder() had no transaction and no lock, so it could
 *      overwrite a concurrent cancel (lost update) and leave an
 *      order COMPLETED while its inventory had been restored.
 *
 * Every assertion checks the side effects directly (inventory
 * quantity, invoice count, delivery count) rather than inferring
 * correctness from the absence of an error, matching the convention
 * set by the processOrder() concurrency test in
 * order-lifecycle.e2e-spec.ts.
 *
 * Convention under test: when a concurrent loser finds the locked
 * row already in the exact target state, it returns the order as an
 * idempotent no-op (same as processOrder()). When it finds the row
 * in any other state that makes its transition illegal, it gets the
 * normal 400.
 */
describe('Orders — Concurrency Hardening (e2e)', () => {
  let app: INestApplication;
  let ordersService: OrdersService;
  let customersService: CustomersService;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let deliveriesService: DeliveriesService;
  let invoicesService: InvoicesService;
  let orgId: string;
  let userId: string;
  let customerId: string;
  let shippingAddressId: string;

  const runId = randomUUID().slice(0, 8);
  const sku = () => `CONC-SKU-${randomUUID().slice(0, 8)}`;

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
    deliveriesService = app.get(DeliveriesService);
    invoicesService = app.get(InvoicesService);
    const usersService = app.get(UsersService);
    const organizationsService = app.get(OrganizationsService);
    const passwordService = app.get(PasswordService);

    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'Concurrency',
        lastName: 'Tester',
        email: `conc-tester.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const org = await organizationsService.createWithOwner(
      {
        name: `Concurrency Test Org ${runId}`,
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
        firstName: 'Conc',
        lastName: 'Customer',
      } as any,
      userId,
    );
    customerId = customer.id;

    const address = await customersService.addAddress(orgId, customerId, {
      line1: '1 Race Condition Way',
      city: 'Lekki',
      country: 'Nigeria',
    });
    shippingAddressId = address.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const STOCK = 50;
  const QTY = 10;

  /** A DRAFT order with one item, product stocked at STOCK. */
  async function seedDraftOrder() {
    const product = await productsService.createProduct(
      orgId,
      { name: 'Concurrency Product', sku: sku(), sellingPrice: 100 },
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
    return { product, order };
  }

  const stockOf = async (productId: string) =>
    (await inventoryService.getInventory(orgId, productId)).quantity;

  const invoiceCount = async (orderId: string) =>
    (await invoicesService.listInvoices(orgId)).filter(
      (i) => i.orderId === orderId,
    ).length;

  const deliveryCount = async (orderId: string) =>
    (await deliveriesService.listDeliveries(orgId)).filter(
      (d) => d.orderId === orderId,
    ).length;

  it(
    'deducts inventory exactly ONCE and creates exactly ONE invoice when ' +
      'confirmOrder is called concurrently — both calls succeed, the ' +
      'loser as an idempotent no-op',
    async () => {
      const { product, order } = await seedDraftOrder();

      const [first, second] = await Promise.all([
        ordersService.confirmOrder(orgId, order.id, userId),
        ordersService.confirmOrder(orgId, order.id, userId),
      ]);

      expect(first.status).toBe(OrderStatus.CONFIRMED);
      expect(second.status).toBe(OrderStatus.CONFIRMED);
      expect(await stockOf(product.id)).toBe(STOCK - QTY);
      expect(await invoiceCount(order.id)).toBe(1);
    },
  );

  it(
    'restores inventory exactly ONCE when cancelOrder is called ' +
      'concurrently on a CONFIRMED order — both calls succeed, the ' +
      'loser as an idempotent no-op',
    async () => {
      const { product, order } = await seedDraftOrder();
      await ordersService.confirmOrder(orgId, order.id, userId);
      expect(await stockOf(product.id)).toBe(STOCK - QTY);

      const [first, second] = await Promise.all([
        ordersService.cancelOrder(orgId, order.id, userId),
        ordersService.cancelOrder(orgId, order.id, userId),
      ]);

      expect(first.status).toBe(OrderStatus.CANCELLED);
      expect(second.status).toBe(OrderStatus.CANCELLED);
      // The bug: both calls restored, leaving STOCK + QTY.
      expect(await stockOf(product.id)).toBe(STOCK);
    },
  );

  it(
    'completes a PROCESSING order exactly once when completeOrder is ' +
      'called concurrently — both calls succeed',
    async () => {
      const { order } = await seedDraftOrder();
      await ordersService.confirmOrder(orgId, order.id, userId);
      await ordersService.processOrder(orgId, order.id);

      const [first, second] = await Promise.all([
        ordersService.completeOrder(orgId, order.id),
        ordersService.completeOrder(orgId, order.id),
      ]);

      expect(first.status).toBe(OrderStatus.COMPLETED);
      expect(second.status).toBe(OrderStatus.COMPLETED);
    },
  );

  it(
    'never lets completeOrder overwrite a concurrent cancelOrder (lost ' +
      'update): exactly one of the two wins, and the final status always ' +
      'agrees with the inventory — COMPLETED means stock stays deducted, ' +
      'CANCELLED means stock was restored',
    async () => {
      // Several rounds: a single run can win the race by luck.
      for (let round = 0; round < 8; round++) {
        const { product, order } = await seedDraftOrder();
        await ordersService.confirmOrder(orgId, order.id, userId);
        await ordersService.processOrder(orgId, order.id);

        const results = await Promise.allSettled([
          ordersService.completeOrder(orgId, order.id),
          ordersService.cancelOrder(orgId, order.id, userId),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBeInstanceOf(BadRequestException);

        const final = await ordersService.getOrder(orgId, order.id);
        const stock = await stockOf(product.id);
        if (final.status === OrderStatus.COMPLETED) {
          expect(stock).toBe(STOCK - QTY);
        } else {
          expect(final.status).toBe(OrderStatus.CANCELLED);
          expect(stock).toBe(STOCK);
        }
      }
    },
  );

  it(
    'keeps status, inventory and Delivery consistent when cancelOrder ' +
      'races processOrder on a CONFIRMED order — whichever wins, stock ' +
      'is restored exactly when the order ends CANCELLED, and at most ' +
      'one Delivery ever exists',
    async () => {
      for (let round = 0; round < 8; round++) {
        const { product, order } = await seedDraftOrder();
        await ordersService.confirmOrder(orgId, order.id, userId);

        const results = await Promise.allSettled([
          ordersService.processOrder(orgId, order.id),
          ordersService.cancelOrder(orgId, order.id, userId),
        ]);

        // No raw 500s: every rejection is a clean 400 from the
        // loser seeing an illegal transition on the locked row.
        for (const r of results) {
          if (r.status === 'rejected') {
            expect(r.reason).toBeInstanceOf(BadRequestException);
          }
        }

        const final = await ordersService.getOrder(orgId, order.id);
        const stock = await stockOf(product.id);
        const deliveries = await deliveryCount(order.id);

        expect(deliveries).toBeLessThanOrEqual(1);
        if (final.status === OrderStatus.PROCESSING) {
          // Process won and cancel never applied.
          expect(stock).toBe(STOCK - QTY);
          expect(deliveries).toBe(1);
        } else {
          // Either cancel won outright (no Delivery), or process won
          // first and cancel then legitimately followed
          // (PROCESSING -> CANCELLED is an allowed transition). In
          // both cases stock must have been restored exactly once.
          expect(final.status).toBe(OrderStatus.CANCELLED);
          expect(stock).toBe(STOCK);
        }
      }
    },
  );
});
