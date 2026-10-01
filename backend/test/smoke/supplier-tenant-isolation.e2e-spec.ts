import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { SuppliersService } from '../../src/suppliers/suppliers.service';
import { SupplierProductsService } from '../../src/suppliers/supplier-products.service';
import { ProductsService } from '../../src/products/products.service';
import { UsersService } from '../../src/users/users.service';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { PasswordService } from '../../src/security/password.service';

describe('Suppliers — DI Resolution & Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let suppliersService: SuppliersService;
  let supplierProductsService: SupplierProductsService;
  let productsService: ProductsService;
  let orgAId: string;
  let orgBId: string;
  let userId: string;

  const runId = randomUUID().slice(0, 8);
  const sku = () => `SUP-SKU-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    suppliersService = app.get(SuppliersService);
    supplierProductsService = app.get(SupplierProductsService);
    productsService = app.get(ProductsService);
    const usersService = app.get(UsersService);
    const organizationsService = app.get(OrganizationsService);
    const passwordService = app.get(PasswordService);

    const passwordHash = await passwordService.hash('SecurePass123');
    const user = await usersService.create(
      {
        firstName: 'Supplier',
        lastName: 'Tester',
        email: `supplier-tester.${runId}@example.com`,
        password: 'SecurePass123',
      },
      passwordHash,
    );
    userId = user.id;

    const orgA = await organizationsService.createWithOwner(
      {
        name: `Supplier Test Org A ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      userId,
    );
    orgAId = orgA.id;

    const orgB = await organizationsService.createWithOwner(
      {
        name: `Supplier Test Org B ${runId}`,
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

  it(
    'resolves the SuppliersModule -> ProductsModule dependency graph ' +
      'and creates a supplier',
    async () => {
      const supplier = await suppliersService.createSupplier(
        orgAId,
        { name: 'Test Supplier Co' },
        userId,
      );
      expect(supplier.id).toBeDefined();
      expect(supplier.organizationId).toBe(orgAId);
    },
  );

  it("forbids reaching Org A's supplier through Org B's ownership check", async () => {
    const supplier = await suppliersService.createSupplier(
      orgAId,
      { name: 'Cross Org Supplier' },
      userId,
    );

    await expect(
      suppliersService.getOwnedSupplierOrThrow(orgBId, supplier.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('associates a product with a supplier when both belong to the same org', async () => {
    const supplier = await suppliersService.createSupplier(
      orgAId,
      { name: 'Association Test Supplier' },
      userId,
    );
    const product = await productsService.createProduct(
      orgAId,
      { name: 'Association Test Product', sku: sku(), sellingPrice: 100 },
      userId,
    );

    const association = await supplierProductsService.addProductToSupplier(
      orgAId,
      supplier.id,
      {
        productId: product.id,
        unitCost: 50,
        leadTimeDays: 5,
        minimumOrderQuantity: 10,
      },
    );

    expect(association.supplierId).toBe(supplier.id);
    expect(association.productId).toBe(product.id);
  });

  it(
    'rejects associating a supplier with a product from a different ' +
      "organization — Directive v1 §7's cross-tenant association rule",
    async () => {
      const supplierInA = await suppliersService.createSupplier(
        orgAId,
        { name: 'Org A Supplier' },
        userId,
      );
      const productInB = await productsService.createProduct(
        orgBId,
        { name: 'Org B Product', sku: sku(), sellingPrice: 100 },
        userId,
      );

      await expect(
        supplierProductsService.addProductToSupplier(orgAId, supplierInA.id, {
          productId: productInB.id,
        }),
      ).rejects.toThrow(NotFoundException);
    },
  );

  it(
    'returns the existing association when a duplicate supplier-product ' +
      'pair is added within the same org (idempotent, not an error)',
    async () => {
      const supplier = await suppliersService.createSupplier(
        orgAId,
        { name: 'Duplicate Test Supplier' },
        userId,
      );
      const product = await productsService.createProduct(
        orgAId,
        { name: 'Duplicate Test Product', sku: sku(), sellingPrice: 100 },
        userId,
      );

      const first = await supplierProductsService.addProductToSupplier(
        orgAId,
        supplier.id,
        { productId: product.id },
      );

      const second = await supplierProductsService.addProductToSupplier(
        orgAId,
        supplier.id,
        { productId: product.id },
      );

      expect(second.id).toBe(first.id);
    },
  );

  it(
    'creates exactly ONE association when addProductToSupplier is ' +
      'called concurrently for the same supplier+product pair — both ' +
      'calls succeed, returning the same association, rather than one ' +
      'succeeding and the other throwing an unhandled 500',
    async () => {
      const supplier = await suppliersService.createSupplier(
        orgAId,
        { name: 'Concurrent Association Supplier' },
        userId,
      );
      const product = await productsService.createProduct(
        orgAId,
        {
          name: 'Concurrent Association Product',
          sku: sku(),
          sellingPrice: 100,
        },
        userId,
      );

      const [first, second] = await Promise.all([
        supplierProductsService.addProductToSupplier(orgAId, supplier.id, {
          productId: product.id,
        }),
        supplierProductsService.addProductToSupplier(orgAId, supplier.id, {
          productId: product.id,
        }),
      ]);

      expect(first.id).toBe(second.id);
      expect(first.supplierId).toBe(supplier.id);
      expect(first.productId).toBe(product.id);

      const associations = await supplierProductsService.listSupplierProducts(
        orgAId,
        supplier.id,
      );
      const matching = associations.filter((a) => a.productId === product.id);
      expect(matching).toHaveLength(1);
    },
  );
});
