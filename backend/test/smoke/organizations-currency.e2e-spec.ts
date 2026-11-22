import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { CustomerType } from '../../src/customers/entities/customer.entity';
import { CustomersService } from '../../src/customers/customers.service';
import { Invoice } from '../../src/invoices/entities/invoice.entity';
import { InvoicesService } from '../../src/invoices/invoices.service';
import { Organization } from '../../src/organizations/entities/organization.entity';
import {
  OrganizationMember,
  OrganizationRole,
} from '../../src/organization-members/entities/organization-member.entity';
import { InventoryMovementType } from '../../src/products/entities/inventory-movement.entity';
import { InventoryService } from '../../src/products/inventory.service';
import { ProductsService } from '../../src/products/products.service';
import { Order } from '../../src/orders/entities/order.entity';
import { OrdersService } from '../../src/orders/orders.service';

interface OrganizationResponseBody {
  id: string;
  currency: string;
}

describe('Organizations — creation currency (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let ownerId: string;
  let accessToken: string;

  const runId = randomUUID().slice(0, 8);

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
      email: `organization-currency.${runId}@example.com`,
      password: 'SecurePass123',
      firstName: 'Currency',
      lastName: 'Tester',
    });
    ownerId = registration.user.id;
    accessToken = registration.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  function createOrganization(
    name: string,
    body: Record<string, unknown> = {},
  ) {
    return request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name, ...body });
  }

  async function expectRejectedAttemptHasNoRecords(name: string) {
    expect(await dataSource.getRepository(Organization).countBy({ name })).toBe(
      0,
    );
    const membershipCount = await dataSource
      .getRepository(OrganizationMember)
      .createQueryBuilder('membership')
      .innerJoin('membership.organization', 'organization')
      .where('organization.name = :name', { name })
      .getCount();
    expect(membershipCount).toBe(0);
  }

  it('creates organizations with explicit NGN and with the default NGN', async () => {
    for (const [label, body] of [
      ['explicit NGN', { currency: 'NGN' }],
      ['omitted currency', {}],
    ] as const) {
      const name = `NGN Create ${label} ${runId} ${randomUUID().slice(0, 8)}`;
      const response = await createOrganization(name, body).expect(201);
      expect((response.body as OrganizationResponseBody).currency).toBe('NGN');
    }
  });

  it('rejects each non-NGN release currency without persisting an organization or membership', async () => {
    for (const currency of ['USD', 'GHS', 'KES', 'ZAR', 'RWF']) {
      const name = `Unsupported ${currency} ${runId} ${randomUUID().slice(0, 8)}`;
      const response = await createOrganization(name, { currency }).expect(400);

      expect(
        JSON.stringify((response.body as { message: unknown }).message),
      ).toContain('Only NGN organizations are supported in this release');
      await expectRejectedAttemptHasNoRecords(name);
    }
  });

  it('rejects EUR, lowercase, empty, and numeric currencies', async () => {
    const invalidCurrencies: Array<{ label: string; currency: unknown }> = [
      { label: 'EUR', currency: 'EUR' },
      { label: 'lowercase ngn', currency: 'ngn' },
      { label: 'empty string', currency: '' },
      { label: 'number', currency: 123 },
    ];
    for (const { label, currency } of invalidCurrencies) {
      const name = `Invalid ${label} ${runId} ${randomUUID().slice(0, 8)}`;
      const response = await createOrganization(name, { currency }).expect(400);

      expect(
        JSON.stringify((response.body as { message: unknown }).message),
      ).toContain('Only NGN organizations are supported in this release');
      await expectRejectedAttemptHasNoRecords(name);
    }
  });

  it('rejects null currency with 400 without persisting an organization or membership', async () => {
    const name = `Invalid null ${runId} ${randomUUID().slice(0, 8)}`;
    const response = await createOrganization(name, { currency: null }).expect(
      400,
    );

    expect(
      JSON.stringify((response.body as { message: unknown }).message),
    ).toContain('Only NGN organizations are supported in this release');
    await expectRejectedAttemptHasNoRecords(name);
  });

  it('rejects currency changes through PATCH and leaves the stored currency NGN', async () => {
    const name = `Patch Currency ${runId}`;
    const createResponse = await createOrganization(name, {
      currency: 'NGN',
    }).expect(201);
    const organization = createResponse.body as OrganizationResponseBody;

    const patchResponse = await request(server)
      .patch(`/organizations/${organization.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currency: 'USD' })
      .expect(400);

    expect(
      JSON.stringify((patchResponse.body as { message: unknown }).message),
    ).toContain('property currency should not exist');
    const storedOrganization = await dataSource
      .getRepository(Organization)
      .findOneByOrFail({ id: organization.id });
    expect(storedOrganization.currency).toBe('NGN');
  });

  it('loads a legacy USD organization and its endpoints without crashing; generated invoice remains NGN', async () => {
    const organizationRepository = dataSource.getRepository(Organization);
    const organization = await organizationRepository.save(
      organizationRepository.create({
        name: `Legacy USD ${runId}`,
        slug: `legacy-usd-${runId}`,
        industry: null,
        country: 'United States',
        timezone: null,
        currency: 'USD',
        logo: null,
      }),
    );
    await dataSource.getRepository(OrganizationMember).save({
      organizationId: organization.id,
      userId: ownerId,
      role: OrganizationRole.OWNER,
      joinedAt: new Date(),
      invitedBy: null,
    });

    const mineResponse = await request(server)
      .get('/organizations/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const listedOrganization = (
      mineResponse.body as OrganizationResponseBody[]
    ).find((entry) => entry.id === organization.id);
    expect(listedOrganization?.currency).toBe('USD');

    await request(server)
      .get(`/organizations/${organization.id}/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const customer = await app.get(CustomersService).createCustomer(
      organization.id,
      {
        customerType: CustomerType.INDIVIDUAL,
        firstName: 'Legacy',
        lastName: 'Customer',
      },
      ownerId,
    );
    const product = await app.get(ProductsService).createProduct(
      organization.id,
      {
        name: 'Legacy USD Product',
        sku: `LEGACY-USD-${runId}`,
        sellingPrice: 12.34,
      },
      ownerId,
    );
    await app.get(InventoryService).adjustInventory(
      organization.id,
      product.id,
      {
        type: InventoryMovementType.ADD,
        quantity: 2,
        reason: 'Legacy currency compatibility test',
      },
      ownerId,
    );
    const order = await app
      .get(OrdersService)
      .createOrder(organization.id, { customerId: customer.id }, ownerId);
    await app.get(OrdersService).addOrderItem(organization.id, order.id, {
      productId: product.id,
      quantity: 1,
    });
    await app
      .get(OrdersService)
      .confirmOrder(organization.id, order.id, ownerId);

    await request(server)
      .get(`/organizations/${organization.id}/products`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(server)
      .get(`/organizations/${organization.id}/orders`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const invoices = await app
      .get(InvoicesService)
      .listInvoices(organization.id);
    const invoice = invoices.find(
      (entry: Invoice) => entry.orderId === order.id,
    );
    expect(invoice).toBeDefined();
    expect(invoice?.currency).toBe('NGN');
    expect(invoice?.total).toBe(1234);

    await request(server)
      .get(`/organizations/${organization.id}/invoices`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const persistedOrder = await dataSource
      .getRepository(Order)
      .findOneByOrFail({ id: order.id });
    expect(persistedOrder.total).toBe('12.34');
  });
});
