import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Suppliers — RBAC (e2e)
 *
 * First HTTP-level RBAC coverage for Suppliers. Previously
 * impossible to write meaningfully: SUPPLIER_CREATE/UPDATE/DELETE/
 * PRODUCT_MANAGE were unassigned to every role (see the RBAC audit
 * finding in the Backend Readiness & Freeze Audit), so any HTTP
 * assertion would only ever see 403 regardless of role. Now
 * CTO-ratified per the RBAC Ratification Decision Record:
 *   - SUPPLIER_CREATE / SUPPLIER_UPDATE / SUPPLIER_PRODUCT_MANAGE:
 *     Owner, Admin, Manager
 *   - SUPPLIER_DELETE: Owner, Admin only
 *   - SUPPLIER_READ: UNCHANGED — remains Owner-only, the pre-existing
 *     S7-01 stopgap. Not part of this ratification. Every other role
 *     is expected to be forbidden from all supplier reads until that
 *     separate decision is reopened.
 *
 * Mirrors the assertion style of product-inventory-rbac.e2e-spec.ts:
 * every relevant role x endpoint pairing gets its own explicit
 * assertion rather than a single spot check.
 */

interface AuthResponseBody {
  accessToken: string;
}

interface OrganizationResponseBody {
  id: string;
}

interface InvitationResponseBody {
  token: string;
}

interface SupplierResponseBody {
  id: string;
}

interface ProductResponseBody {
  id: string;
}

interface SupplierProductResponseBody {
  id: string;
}

describe('Suppliers — RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const ownerEmail = `sup-owner.${runId}@example.com`;
  const adminEmail = `sup-admin.${runId}@example.com`;
  const managerEmail = `sup-manager.${runId}@example.com`;
  const staffEmail = `sup-staff.${runId}@example.com`;
  const viewerEmail = `sup-viewer.${runId}@example.com`;

  let ownerToken: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let viewerToken: string;

  let orgId: string;
  let sharedSupplierId: string;
  let sharedProductId: string;
  let sharedAssociationId: string;

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
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: inviteeEmail, role })
      .expect(201);
    const invite = inviteRes.body as InvitationResponseBody;
    await request(server)
      .post(`/organizations/invitations/${invite.token}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(204);
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

    ownerToken = await registerAndLogin(ownerEmail, 'SupOwner');
    adminToken = await registerAndLogin(adminEmail, 'SupAdmin');
    managerToken = await registerAndLogin(managerEmail, 'SupManager');
    staffToken = await registerAndLogin(staffEmail, 'SupStaff');
    viewerToken = await registerAndLogin(viewerEmail, 'SupViewer');

    const orgRes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Supplier RBAC Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgId = (orgRes.body as OrganizationResponseBody).id;

    await inviteAndAccept(adminEmail, adminToken, 'admin');
    await inviteAndAccept(managerEmail, managerToken, 'manager');
    await inviteAndAccept(staffEmail, staffToken, 'staff');
    await inviteAndAccept(viewerEmail, viewerToken, 'viewer');

    const supplierRes = await request(server)
      .post(`/organizations/${orgId}/suppliers`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'RBAC Test Supplier' })
      .expect(201);
    sharedSupplierId = (supplierRes.body as SupplierResponseBody).id;

    const productRes = await request(server)
      .post(`/organizations/${orgId}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Supplier RBAC Test Product',
        sku: `SUP-RBAC-${runId}`,
        sellingPrice: 100,
      })
      .expect(201);
    sharedProductId = (productRes.body as ProductResponseBody).id;

    const associationRes = await request(server)
      .post(`/organizations/${orgId}/suppliers/${sharedSupplierId}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId: sharedProductId, unitCost: 50 })
      .expect(201);
    sharedAssociationId = (associationRes.body as SupplierProductResponseBody)
      .id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('SUPPLIER_READ — unchanged S7-01 stopgap, Owner-only', () => {
    it('allows Owner to read a supplier', async () => {
      await request(server)
        .get(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
    });

    it('forbids Admin from reading a supplier', async () => {
      await request(server)
        .get(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('forbids Manager from reading a supplier', async () => {
      await request(server)
        .get(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('forbids Staff from reading a supplier', async () => {
      await request(server)
        .get(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('forbids Viewer from reading a supplier', async () => {
      await request(server)
        .get(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  describe('SUPPLIER_CREATE / SUPPLIER_UPDATE — Owner, Admin, Manager', () => {
    it('allows Owner to create a supplier', async () => {
      await request(server)
        .post(`/organizations/${orgId}/suppliers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Owner Created Supplier' })
        .expect(201);
    });

    it('allows Admin to create a supplier', async () => {
      await request(server)
        .post(`/organizations/${orgId}/suppliers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Admin Created Supplier' })
        .expect(201);
    });

    it('allows Manager to create a supplier', async () => {
      await request(server)
        .post(`/organizations/${orgId}/suppliers`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Manager Created Supplier' })
        .expect(201);
    });

    it('forbids Staff from creating a supplier', async () => {
      await request(server)
        .post(`/organizations/${orgId}/suppliers`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
    });

    it('forbids Viewer from creating a supplier', async () => {
      await request(server)
        .post(`/organizations/${orgId}/suppliers`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
    });

    it('allows Manager to update a supplier', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Updated by Manager' })
        .expect(200);
    });

    it('forbids Staff from updating a supplier', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
    });

    it('forbids Viewer from updating a supplier', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
    });
  });

  describe('SUPPLIER_DELETE — Owner, Admin only (not Manager)', () => {
    it('forbids Manager from deleting a supplier', async () => {
      await request(server)
        .delete(`/organizations/${orgId}/suppliers/${sharedSupplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('allows Admin to delete a supplier', async () => {
      const createRes = await request(server)
        .post(`/organizations/${orgId}/suppliers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Admin Delete Target' })
        .expect(201);
      const supplier = createRes.body as SupplierResponseBody;

      await request(server)
        .delete(`/organizations/${orgId}/suppliers/${supplier.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('allows Owner to delete a supplier', async () => {
      const createRes = await request(server)
        .post(`/organizations/${orgId}/suppliers`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Owner Delete Target' })
        .expect(201);
      const supplier = createRes.body as SupplierResponseBody;

      await request(server)
        .delete(`/organizations/${orgId}/suppliers/${supplier.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
    });
  });

  describe('SUPPLIER_PRODUCT_MANAGE — Owner, Admin, Manager', () => {
    it('allows Manager to associate a product with a supplier', async () => {
      const productRes = await request(server)
        .post(`/organizations/${orgId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Manager Association Product',
          sku: `SUP-MGR-${runId}`,
          sellingPrice: 75,
        })
        .expect(201);
      const product = productRes.body as ProductResponseBody;

      await request(server)
        .post(`/organizations/${orgId}/suppliers/${sharedSupplierId}/products`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ productId: product.id, unitCost: 30 })
        .expect(201);
    });

    it('forbids Staff from associating a product with a supplier', async () => {
      await request(server)
        .post(`/organizations/${orgId}/suppliers/${sharedSupplierId}/products`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ productId: sharedProductId, unitCost: 30 })
        .expect(403);
    });

    it('allows Manager to update a supplier-product association', async () => {
      await request(server)
        .patch(
          `/organizations/${orgId}/suppliers/${sharedSupplierId}/products/${sharedAssociationId}`,
        )
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ unitCost: 60 })
        .expect(200);
    });

    it('forbids Viewer from updating a supplier-product association', async () => {
      await request(server)
        .patch(
          `/organizations/${orgId}/suppliers/${sharedSupplierId}/products/${sharedAssociationId}`,
        )
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ unitCost: 99 })
        .expect(403);
    });

    it('forbids Staff from removing a supplier-product association', async () => {
      await request(server)
        .delete(
          `/organizations/${orgId}/suppliers/${sharedSupplierId}/products/${sharedAssociationId}`,
        )
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    it('allows Owner to remove a supplier-product association', async () => {
      await request(server)
        .delete(
          `/organizations/${orgId}/suppliers/${sharedSupplierId}/products/${sharedAssociationId}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
    });
  });
});
