import {
  BadRequestException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CustomersService } from '../../src/customers/customers.service';
import { CreateCustomerDto } from '../../src/customers/dto/create-customer.dto';
import { CustomerType } from '../../src/customers/entities/customer.entity';
import { Invoice } from '../../src/invoices/entities/invoice.entity';
import { InventoryMovementType } from '../../src/products/entities/inventory-movement.entity';
import { InventoryService } from '../../src/products/inventory.service';
import { ProductsService } from '../../src/products/products.service';
import { CreateOrderItemDto } from '../../src/orders/dto/create-order-item.dto';
import { UpdateOrderItemDto } from '../../src/orders/dto/update-order-item.dto';
import { OrderItem } from '../../src/orders/entities/order-item.entity';
import { OrderStatus } from '../../src/orders/entities/order.entity';
import { OrdersService } from '../../src/orders/orders.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PasswordService } from '../../src/security/password.service';
import { UsersService } from '../../src/users/users.service';

describe('Order item edit locking (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ordersService: OrdersService;
  let customersService: CustomersService;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let customerId: string;

  const runId = randomUUID().slice(0, 8);
  const sku = () => `ITEM-LOCK-${randomUUID().slice(0, 8)}`;

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
    dataSource = app.get(DataSource);

    const usersService = app.get(UsersService);
    const organizationsService = app.get(OrganizationsService);
    const passwordService = app.get(PasswordService);
    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'OrderItem',
        lastName: 'Locker',
        email: `order-item-locking.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const organization = await organizationsService.createWithOwner(
      {
        name: `Order Item Locking ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    organizationId = organization.id;

    const otherOrganization = await organizationsService.createWithOwner(
      {
        name: `Other Order Item Locking ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    otherOrganizationId = otherOrganization.id;

    const customer = await customersService.createCustomer(
      organizationId,
      {
        customerType: CustomerType.INDIVIDUAL,
        firstName: 'Item',
        lastName: 'Customer',
      } satisfies CreateCustomerDto,
      userId,
    );
    customerId = customer.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const createProduct = async (
    name: string,
    sellingPrice: number,
    stock = 100,
  ) => {
    const product = await productsService.createProduct(
      organizationId,
      { name, sku: sku(), sellingPrice },
      userId,
    );
    await inventoryService.adjustInventory(
      organizationId,
      product.id,
      {
        type: InventoryMovementType.ADD,
        quantity: stock,
        reason: 'Seed stock',
      },
      userId,
    );
    return product;
  };

  const createDraftOrder = () =>
    ordersService.createOrder(organizationId, { customerId }, userId);

  const addItem = (
    orderId: string,
    productId: string,
    quantity: number,
  ): Promise<OrderItem> =>
    ordersService.addOrderItem(organizationId, orderId, {
      productId,
      quantity,
    } satisfies CreateOrderItemDto);

  const updateItem = (
    orderId: string,
    itemId: string,
    quantity: number,
  ): Promise<OrderItem> =>
    ordersService.updateOrderItem(organizationId, orderId, itemId, {
      quantity,
    } satisfies UpdateOrderItemDto);

  const expectOrderTotalsMatchItems = async (orderId: string) => {
    const order = await ordersService.getOrder(organizationId, orderId);
    const items = await ordersService.listOrderItems(organizationId, orderId);
    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );
    expect(order.subtotal).toBe(subtotal.toFixed(2));
    expect(order.total).toBe((subtotal - Number(order.discount)).toFixed(2));
    return { order, items };
  };

  it('serializes a concurrent item add against confirmation and deducts stock for the confirmed lines exactly once', async () => {
    const initialProduct = await createProduct('Initial line', 99.95, 50);
    const concurrentProduct = await createProduct('Concurrent line', 21.25, 30);
    const order = await createDraftOrder();
    await addItem(order.id, initialProduct.id, 3);

    const [editResult, confirmResult] = await Promise.allSettled([
      addItem(order.id, concurrentProduct.id, 4),
      ordersService.confirmOrder(organizationId, order.id, userId),
    ]);

    expect(confirmResult.status).toBe('fulfilled');
    if (editResult.status === 'rejected') {
      if (!(editResult.reason instanceof BadRequestException)) {
        throw editResult.reason;
      }
      expect(editResult.reason.message).toBe(
        'Items can only be added while the order is DRAFT',
      );
    } else {
      expect(editResult.value.orderId).toBe(order.id);
    }

    const { order: confirmedOrder, items } = await expectOrderTotalsMatchItems(
      order.id,
    );
    expect(confirmedOrder.status).toBe(OrderStatus.CONFIRMED);

    const quantitiesByProduct = new Map(
      items.map((item) => [item.productId, item.quantity]),
    );
    const initialInventory = await inventoryService.getInventory(
      organizationId,
      initialProduct.id,
    );
    expect(initialInventory.quantity).toBe(
      50 - (quantitiesByProduct.get(initialProduct.id) ?? 0),
    );
    const concurrentInventory = await inventoryService.getInventory(
      organizationId,
      concurrentProduct.id,
    );
    expect(concurrentInventory.quantity).toBe(
      30 - (quantitiesByProduct.get(concurrentProduct.id) ?? 0),
    );

    const invoice = await dataSource.getRepository(Invoice).findOne({
      where: { orderId: order.id, organizationId },
      relations: { lineItems: true },
    });
    expect(invoice).not.toBeNull();
    const invoiceLines = invoice!.lineItems.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    }));
    expect(invoiceLines).toHaveLength(items.length);
    for (const item of items) {
      const line = invoiceLines.find(
        (invoiceLine) => invoiceLine.productId === item.productId,
      );
      expect(line).toMatchObject({
        quantity: item.quantity,
        lineTotal: Math.round(Number(item.unitPrice) * 100) * item.quantity,
      });
    }
    expect(invoice!.total).toBe(Math.round(Number(confirmedOrder.total) * 100));
  });

  it('keeps totals equal to the final item sum after two concurrent edits', async () => {
    const firstProduct = await createProduct('First concurrent edit', 24.5);
    const secondProduct = await createProduct('Second concurrent edit', 13.75);
    const order = await createDraftOrder();
    const firstItem = await addItem(order.id, firstProduct.id, 2);
    const secondItem = await addItem(order.id, secondProduct.id, 3);

    await Promise.all([
      updateItem(order.id, firstItem.id, 7),
      updateItem(order.id, secondItem.id, 5),
    ]);

    const { items } = await expectOrderTotalsMatchItems(order.id);
    expect(items.find((item) => item.id === firstItem.id)?.quantity).toBe(7);
    expect(items.find((item) => item.id === secondItem.id)?.quantity).toBe(5);
  });

  it('supports add, update, and remove while the order is DRAFT', async () => {
    const firstProduct = await createProduct('Editable first line', 15.5);
    const secondProduct = await createProduct('Editable second line', 8.25);
    const order = await createDraftOrder();
    const firstItem = await addItem(order.id, firstProduct.id, 2);
    const secondItem = await addItem(order.id, secondProduct.id, 3);

    await updateItem(order.id, firstItem.id, 4);
    await ordersService.removeOrderItem(
      organizationId,
      order.id,
      secondItem.id,
    );

    const { items } = await expectOrderTotalsMatchItems(order.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: firstItem.id,
      quantity: 4,
      subtotal: '62.00',
    });
  });

  it('rejects item edits after confirmation with the existing error', async () => {
    const product = await createProduct('Confirmed edit', 12);
    const order = await createDraftOrder();
    const item = await addItem(order.id, product.id, 2);
    await ordersService.confirmOrder(organizationId, order.id, userId);

    await expect(updateItem(order.id, item.id, 5)).rejects.toThrow(
      'Items can only be updated while the order is DRAFT',
    );
  });

  it('returns the existing 404 for an order owned by another organization', async () => {
    const product = await createProduct('Cross organization item', 5);
    const order = await createDraftOrder();
    const item = await addItem(order.id, product.id, 1);

    await expect(
      ordersService.updateOrderItem(otherOrganizationId, order.id, item.id, {
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
