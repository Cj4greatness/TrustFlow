import {
  BadRequestException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CustomerType } from '../../src/customers/entities/customer.entity';
import { CustomersService } from '../../src/customers/customers.service';
import { DeliveriesService } from '../../src/deliveries/deliveries.service';
import {
  Delivery,
  DeliveryStatus,
} from '../../src/deliveries/entities/delivery.entity';
import { InventoryMovementRepository } from '../../src/products/inventory-movement.repository';
import {
  InventoryMovement,
  InventoryMovementType,
} from '../../src/products/entities/inventory-movement.entity';
import { InventoryService } from '../../src/products/inventory.service';
import { ProductsService } from '../../src/products/products.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { Order, OrderStatus } from '../../src/orders/entities/order.entity';
import { OrdersService } from '../../src/orders/orders.service';
import { PasswordService } from '../../src/security/password.service';
import { UsersService } from '../../src/users/users.service';

describe('Orders — Cancellation vs Delivery (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ordersService: OrdersService;
  let deliveriesService: DeliveriesService;
  let customersService: CustomersService;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let organizationsService: OrganizationsService;
  let orgId: string;
  let otherOrgId: string;
  let userId: string;
  let customerId: string;
  let shippingAddressId: string;

  const runId = randomUUID().slice(0, 8);
  const stock = 50;
  const quantity = 10;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    ordersService = app.get(OrdersService);
    deliveriesService = app.get(DeliveriesService);
    customersService = app.get(CustomersService);
    productsService = app.get(ProductsService);
    inventoryService = app.get(InventoryService);
    organizationsService = app.get(OrganizationsService);
    const usersService = app.get(UsersService);
    const passwordService = app.get(PasswordService);

    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'Order',
        lastName: 'Cancellation',
        email: `order-cancel.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const org = await organizationsService.createWithOwner(
      {
        name: `Order Cancel Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    orgId = org.id;
    const otherOrg = await organizationsService.createWithOwner(
      {
        name: `Other Order Cancel Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    otherOrgId = otherOrg.id;

    const customer = await customersService.createCustomer(
      orgId,
      {
        customerType: CustomerType.INDIVIDUAL,
        firstName: 'Order',
        lastName: 'Customer',
      },
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

  async function seedProcessingOrder() {
    const product = await productsService.createProduct(
      orgId,
      {
        name: 'Order Cancellation Product',
        sku: `ORD-CANCEL-${randomUUID().slice(0, 8)}`,
        sellingPrice: 100,
      },
      userId,
    );
    await inventoryService.adjustInventory(
      orgId,
      product.id,
      {
        type: InventoryMovementType.ADD,
        quantity: stock,
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
      quantity,
    });
    await ordersService.confirmOrder(orgId, order.id, userId);
    await ordersService.processOrder(orgId, order.id);

    const delivery = await dataSource.getRepository(Delivery).findOneByOrFail({
      orderId: order.id,
      organizationId: orgId,
    });
    return { order, delivery, product };
  }

  async function stockOf(productId: string): Promise<number> {
    return (await inventoryService.getInventory(orgId, productId)).quantity;
  }

  async function addMovementCount(productId: string): Promise<number> {
    return dataSource.getRepository(InventoryMovement).count({
      where: {
        inventory: { productId },
        type: InventoryMovementType.ADD,
      },
    });
  }

  async function deliver(deliveryId: string): Promise<void> {
    await deliveriesService.assignDelivery(deliveryId, orgId, {
      assignedDeliveryPerson: 'Courier',
    });
    await deliveriesService.markPickedUp(deliveryId, orgId);
    await deliveriesService.markInTransit(deliveryId, orgId);
    await deliveriesService.markDelivered(deliveryId, orgId);
  }

  function expectBlockedByDelivery(error: unknown): void {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'ORDER_CANCEL_BLOCKED_DELIVERY_IN_PROGRESS',
    });
  }

  it('cancels a PENDING delivery and order, restoring inventory exactly once', async () => {
    const { order, delivery, product } = await seedProcessingOrder();
    expect(await stockOf(product.id)).toBe(stock - quantity);
    expect(await addMovementCount(product.id)).toBe(1);

    const cancelled = await ordersService.cancelOrder(orgId, order.id, userId);

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(
      await dataSource
        .getRepository(Delivery)
        .findOneByOrFail({ id: delivery.id }),
    ).toMatchObject({ status: DeliveryStatus.CANCELLED });
    expect(await stockOf(product.id)).toBe(stock);
    expect(await addMovementCount(product.id)).toBe(2);
  });

  it.each([
    [
      'in progress',
      async (deliveryId: string) => {
        await deliveriesService.assignDelivery(deliveryId, orgId, {
          assignedDeliveryPerson: 'Courier',
        });
        await deliveriesService.markPickedUp(deliveryId, orgId);
        await deliveriesService.markInTransit(deliveryId, orgId);
      },
      DeliveryStatus.IN_TRANSIT,
    ],
    ['delivered', deliver, DeliveryStatus.DELIVERED],
  ])(
    'blocks cancellation when the delivery is %s without changing anything',
    async (_description, advanceDelivery, expectedStatus) => {
      const { order, delivery, product } = await seedProcessingOrder();
      await advanceDelivery(delivery.id);
      const beforeOrder = await dataSource
        .getRepository(Order)
        .findOneByOrFail({ id: order.id });
      const beforeDelivery = await dataSource
        .getRepository(Delivery)
        .findOneByOrFail({ id: delivery.id });
      const beforeStock = await stockOf(product.id);
      const beforeAddMovements = await addMovementCount(product.id);

      try {
        await ordersService.cancelOrder(orgId, order.id, userId);
        throw new Error('Expected order cancellation to be blocked');
      } catch (error) {
        expectBlockedByDelivery(error);
      }

      expect(
        await dataSource.getRepository(Order).findOneByOrFail({ id: order.id }),
      ).toEqual(beforeOrder);
      expect(
        await dataSource
          .getRepository(Delivery)
          .findOneByOrFail({ id: delivery.id }),
      ).toEqual(beforeDelivery);
      expect(await stockOf(product.id)).toBe(beforeStock);
      expect(await addMovementCount(product.id)).toBe(beforeAddMovements);
      expect(beforeDelivery.status).toBe(expectedStatus);
    },
  );

  it('does not cancel a delivery twice when it is already CANCELLED', async () => {
    const { order, delivery, product } = await seedProcessingOrder();
    await deliveriesService.cancelDelivery(delivery.id, orgId, {
      cancellationReason: 'Already cancelled by dispatch',
    });

    const cancelled = await ordersService.cancelOrder(orgId, order.id, userId);
    const savedDelivery = await dataSource
      .getRepository(Delivery)
      .findOneByOrFail({ id: delivery.id });

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(savedDelivery.status).toBe(DeliveryStatus.CANCELLED);
    expect(savedDelivery.cancellationReason).toBe(
      'Already cancelled by dispatch',
    );
    expect(await stockOf(product.id)).toBe(stock);
    expect(await addMovementCount(product.id)).toBe(2);
  });

  it('serializes cancellation against the transition out of PENDING', async () => {
    const { order, delivery, product } = await seedProcessingOrder();
    const outcomes = await Promise.all([
      ordersService
        .cancelOrder(orgId, order.id, userId)
        .then((value) => ({ kind: 'cancelled' as const, value }))
        .catch((error: unknown) => ({
          kind: 'cancel-rejected' as const,
          error,
        })),
      deliveriesService
        .assignDelivery(delivery.id, orgId, {
          assignedDeliveryPerson: 'Race Courier',
        })
        .then((value) => ({ kind: 'assigned' as const, value }))
        .catch((error: unknown) => ({
          kind: 'assignment-rejected' as const,
          error,
        })),
    ]);

    const savedOrder = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    const savedDelivery = await dataSource
      .getRepository(Delivery)
      .findOneByOrFail({ id: delivery.id });

    if (savedOrder.status === OrderStatus.CANCELLED) {
      expect(outcomes.map((outcome) => outcome.kind)).toEqual([
        'cancelled',
        'assignment-rejected',
      ]);
      expect(savedDelivery.status).toBe(DeliveryStatus.CANCELLED);
      expect(await stockOf(product.id)).toBe(stock);
      expect(await addMovementCount(product.id)).toBe(2);
    } else {
      expect(savedOrder.status).toBe(OrderStatus.PROCESSING);
      expect(savedDelivery.status).toBe(DeliveryStatus.ASSIGNED);
      expect(outcomes.map((outcome) => outcome.kind)).toEqual([
        'cancel-rejected',
        'assigned',
      ]);
      const cancelOutcome = outcomes[0];
      if (cancelOutcome.kind !== 'cancel-rejected') {
        throw new Error('Expected cancellation to be rejected');
      }
      expectBlockedByDelivery(cancelOutcome.error);
      expect(await stockOf(product.id)).toBe(stock - quantity);
      expect(await addMovementCount(product.id)).toBe(1);
    }

    expect(
      savedOrder.status !== OrderStatus.CANCELLED ||
        savedDelivery.status === DeliveryStatus.CANCELLED,
    ).toBe(true);
  });

  it('rolls back delivery, order, and inventory writes if inventory movement save fails', async () => {
    const { order, delivery, product } = await seedProcessingOrder();
    const movementRepository = app.get(InventoryMovementRepository);
    const originalWithTransaction = movementRepository.withTransaction;
    let shouldFail = true;
    const writeSpy = jest
      .spyOn(movementRepository, 'withTransaction')
      .mockImplementation((manager: EntityManager) => {
        const transactionalRepository = originalWithTransaction(manager);
        return {
          ...transactionalRepository,
          save: (movement: InventoryMovement) => {
            if (shouldFail) {
              shouldFail = false;
              return Promise.reject(
                new Error('Injected inventory movement write failure'),
              );
            }
            return transactionalRepository.save(movement);
          },
        };
      });

    try {
      await expect(
        ordersService.cancelOrder(orgId, order.id, userId),
      ).rejects.toThrow('Injected inventory movement write failure');
    } finally {
      writeSpy.mockRestore();
    }

    expect(
      await dataSource.getRepository(Order).findOneByOrFail({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.PROCESSING });
    expect(
      await dataSource
        .getRepository(Delivery)
        .findOneByOrFail({ id: delivery.id }),
    ).toMatchObject({ status: DeliveryStatus.PENDING });
    expect(await stockOf(product.id)).toBe(stock - quantity);
    expect(await addMovementCount(product.id)).toBe(1);
  });

  it('keeps repeated order cancellation idempotent', async () => {
    const { order, product } = await seedProcessingOrder();

    const first = await ordersService.cancelOrder(orgId, order.id, userId);
    const second = await ordersService.cancelOrder(orgId, order.id, userId);

    expect(first.status).toBe(OrderStatus.CANCELLED);
    expect(second.status).toBe(OrderStatus.CANCELLED);
    expect(await stockOf(product.id)).toBe(stock);
    expect(await addMovementCount(product.id)).toBe(2);
  });

  it('returns the existing 404 for a cross-organization cancellation', async () => {
    const { order, delivery, product } = await seedProcessingOrder();

    await expect(
      ordersService.cancelOrder(otherOrgId, order.id, userId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      await dataSource.getRepository(Order).findOneByOrFail({ id: order.id }),
    ).toMatchObject({ status: OrderStatus.PROCESSING });
    expect(
      await dataSource
        .getRepository(Delivery)
        .findOneByOrFail({ id: delivery.id }),
    ).toMatchObject({ status: DeliveryStatus.PENDING });
    expect(await stockOf(product.id)).toBe(stock - quantity);
  });

  it('keeps cancellation behavior when an order has no delivery', async () => {
    const order = await ordersService.createOrder(
      orgId,
      { customerId },
      userId,
    );

    const cancelled = await ordersService.cancelOrder(orgId, order.id, userId);

    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
  });
});
