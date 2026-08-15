import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { ProductsService } from '../../src/products/products.service';
import { InventoryService } from '../../src/products/inventory.service';
import { UsersService } from '../../src/users/users.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PasswordService } from '../../src/security/password.service';
import { InventoryMovementType } from '../../src/products/entities/inventory-movement.entity';

/**
 * Product & Inventory — Tenant Isolation & Transaction Correctness
 *
 * Calls ProductsService/InventoryService directly (no HTTP/controllers
 * exist yet — see CTO Directive v1 implementation sequence, step 9
 * precedes step 10). Proves the transaction boundaries and row-lock
 * behavior that a compile check cannot: atomic Product+Inventory
 * creation, cross-org isolation, negative-quantity rejection with
 * rollback, and — critically — that concurrent adjustments serialize
 * correctly via the pessimistic_write lock instead of producing a
 * lost update.
 */
describe('Product & Inventory — Tenant Isolation & Transactions (e2e)', () => {
  let app: INestApplication;
  let productsService: ProductsService;
  let inventoryService: InventoryService;
  let orgAId: string;
  let orgBId: string;
  let userId: string;

  const runId = randomUUID().slice(0, 8);
  const sku = () => `SKU-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    productsService = app.get(ProductsService);
    inventoryService = app.get(InventoryService);
    const usersService = app.get(UsersService);
    const organizationsService = app.get(OrganizationsService);
    const passwordService = app.get(PasswordService);

    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'Product',
        lastName: 'Tester',
        email: `product-tester.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const orgA = await organizationsService.createWithOwner(
      {
        name: `Product Test Org A ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    orgAId = orgA.id;

    const orgB = await organizationsService.createWithOwner(
      {
        name: `Product Test Org B ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    orgBId = orgB.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('creates a product with an auto-provisioned zero-quantity inventory row, atomically', async () => {
    const product = await productsService.createProduct(
      orgAId,
      { name: 'Test Widget', sku: sku(), sellingPrice: 100 },
      userId,
    );

    expect(product.id).toBeDefined();
    expect(product.organizationId).toBe(orgAId);

    const inventory = await inventoryService.getInventory(orgAId, product.id);
    expect(inventory.quantity).toBe(0);
    expect(inventory.productId).toBe(product.id);
  });

  it(
    "forbids reaching Org A's product and inventory through Org B's " +
      'ownership check, even with a valid UUID — same class of bug the ' +
      'Sprint 3 RBAC audit and Customer module isolation checks exist to prevent',
    async () => {
      const product = await productsService.createProduct(
        orgAId,
        { name: 'Cross Org Widget', sku: sku(), sellingPrice: 50 },
        userId,
      );

      await expect(
        productsService.getOwnedProductOrThrow(orgBId, product.id),
      ).rejects.toThrow(NotFoundException);

      await expect(
        inventoryService.getInventory(orgBId, product.id),
      ).rejects.toThrow(NotFoundException);
    },
  );

  it('applies an ADD adjustment, increasing quantity and recording a movement', async () => {
    const product = await productsService.createProduct(
      orgAId,
      { name: 'Add Test Widget', sku: sku(), sellingPrice: 10 },
      userId,
    );

    const updated = await inventoryService.adjustInventory(
      orgAId,
      product.id,
      {
        type: InventoryMovementType.ADD,
        quantity: 20,
        reason: 'Initial stock',
      },
      userId,
    );

    expect(updated.quantity).toBe(20);

    const movements = await inventoryService.listMovements(orgAId, product.id, {
      page: 1,
      limit: 20,
    });
    expect(movements.total).toBe(1);
    expect(movements.data[0].type).toBe(InventoryMovementType.ADD);
    expect(movements.data[0].quantity).toBe(20);
  });

  it(
    'rejects a REMOVE that would go negative and leaves quantity unchanged ' +
      '— proves the transaction rolls back rather than partially applying',
    async () => {
      const product = await productsService.createProduct(
        orgAId,
        { name: 'Reject Test Widget', sku: sku(), sellingPrice: 10 },
        userId,
      );

      await expect(
        inventoryService.adjustInventory(
          orgAId,
          product.id,
          {
            type: InventoryMovementType.REMOVE,
            quantity: 5,
            reason: 'Should fail',
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);

      const inventory = await inventoryService.getInventory(orgAId, product.id);
      expect(inventory.quantity).toBe(0);

      const movements = await inventoryService.listMovements(
        orgAId,
        product.id,
        {
          page: 1,
          limit: 20,
        },
      );
      expect(movements.total).toBe(0);
    },
  );

  it(
    'serializes concurrent adjustments via the pessimistic row lock, ' +
      'producing a correct final balance instead of a lost update — without ' +
      'the lock, concurrent transactions could each read quantity=100 and ' +
      'independently compute 100-5=95, silently losing 9 of 10 decrements',
    async () => {
      const product = await productsService.createProduct(
        orgAId,
        { name: 'Concurrency Test Widget', sku: sku(), sellingPrice: 10 },
        userId,
      );

      await inventoryService.adjustInventory(
        orgAId,
        product.id,
        {
          type: InventoryMovementType.ADD,
          quantity: 100,
          reason: 'Seed stock',
        },
        userId,
      );

      const concurrentAdjustments = Array.from({ length: 10 }, () =>
        inventoryService.adjustInventory(
          orgAId,
          product.id,
          {
            type: InventoryMovementType.REMOVE,
            quantity: 5,
            reason: 'Concurrent decrement',
          },
          userId,
        ),
      );

      await Promise.all(concurrentAdjustments);

      const finalInventory = await inventoryService.getInventory(
        orgAId,
        product.id,
      );
      expect(finalInventory.quantity).toBe(50);

      const movements = await inventoryService.listMovements(
        orgAId,
        product.id,
        {
          page: 1,
          limit: 20,
        },
      );
      expect(movements.total).toBe(11);
    },
    30000,
  );
});
