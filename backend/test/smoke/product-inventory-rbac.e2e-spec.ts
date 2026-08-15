import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Product & Inventory — RBAC (e2e)
 *
 * Exercises the full HTTP stack (route -> PermissionsGuard ->
 * controller), not just the service layer — this is the layer where
 * a real corruption occurred: a misplaced edit caused Viewer to
 * inherit PRODUCT_CREATE/UPDATE/DELETE and INVENTORY_ADJUST, and
 * every other role to lose its Product/Inventory permissions
 * entirely. That bug compiled cleanly and passed the (service-level)
 * tenant-isolation suite, because neither checks *which* role can
 * call *which* endpoint — only that ownership checks work once a
 * call is already authorized. This suite exists to close that gap.
 *
 * Every mutating endpoint gets an explicit Viewer-must-403 case
 * asserted individually, rather than a single spot check — a
 * corrupted matrix could grant Viewer three of four mutations and
 * still pass a single assertion.
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

interface ProductResponseBody {
  id: string;
}

describe('Product & Inventory — RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const ownerEmail = `pi-owner.${runId}@example.com`;
  const adminEmail = `pi-admin.${runId}@example.com`;
  const managerEmail = `pi-manager.${runId}@example.com`;
  const staffEmail = `pi-staff.${runId}@example.com`;
  const viewerEmail = `pi-viewer.${runId}@example.com`;

  let ownerToken: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let viewerToken: string;

  let orgId: string;
  let sharedProductId: string;

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

    ownerToken = await registerAndLogin(ownerEmail, 'PIOwner');
    adminToken = await registerAndLogin(adminEmail, 'PIAdmin');
    managerToken = await registerAndLogin(managerEmail, 'PIManager');
    staffToken = await registerAndLogin(staffEmail, 'PIStaff');
    viewerToken = await registerAndLogin(viewerEmail, 'PIViewer');

    const orgRes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `PI RBAC Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgId = (orgRes.body as OrganizationResponseBody).id;

    await inviteAndAccept(adminEmail, adminToken, 'admin');
    await inviteAndAccept(managerEmail, managerToken, 'manager');
    await inviteAndAccept(staffEmail, staffToken, 'staff');
    await inviteAndAccept(viewerEmail, viewerToken, 'viewer');

    const productRes = await request(server)
      .post(`/organizations/${orgId}/products`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'RBAC Test Product',
        sku: `RBAC-${runId}`,
        sellingPrice: 100,
      })
      .expect(201);
    sharedProductId = (productRes.body as ProductResponseBody).id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Viewer — read-only, must be forbidden from every mutation', () => {
    it('forbids Viewer from creating a product', async () => {
      await request(server)
        .post(`/organizations/${orgId}/products`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Should Fail', sku: `FAIL-${runId}-1`, sellingPrice: 10 })
        .expect(403);
    });

    it('forbids Viewer from updating a product', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/products/${sharedProductId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
    });

    it('forbids Viewer from deleting a product', async () => {
      await request(server)
        .delete(`/organizations/${orgId}/products/${sharedProductId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });

    it('forbids Viewer from adjusting inventory', async () => {
      await request(server)
        .post(
          `/organizations/${orgId}/products/${sharedProductId}/inventory/adjustments`,
        )
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ type: 'add', quantity: 10, reason: 'Should fail' })
        .expect(403);
    });

    it('allows Viewer to read a product', async () => {
      await request(server)
        .get(`/organizations/${orgId}/products/${sharedProductId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('allows Viewer to read inventory', async () => {
      await request(server)
        .get(`/organizations/${orgId}/products/${sharedProductId}/inventory`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });
  });

  describe('Staff — read-only on products, cannot adjust inventory (pending CTO decision)', () => {
    it('forbids Staff from creating a product', async () => {
      await request(server)
        .post(`/organizations/${orgId}/products`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Should Fail', sku: `STAFF-${runId}`, sellingPrice: 20 })
        .expect(403);
    });

    it('forbids Staff from updating a product', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/products/${sharedProductId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Should Fail' })
        .expect(403);
    });

    it('allows Staff to read a product', async () => {
      await request(server)
        .get(`/organizations/${orgId}/products/${sharedProductId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
    });

    it(
      'forbids Staff from adjusting inventory — INVENTORY_ADJUST is ' +
        'intentionally withheld pending explicit CTO confirmation ' +
        '(see permission-matrix.ts). This assertion documents current ' +
        'behavior; it must be updated deliberately, not silently, if ' +
        'that decision changes.',
      async () => {
        await request(server)
          .post(
            `/organizations/${orgId}/products/${sharedProductId}/inventory/adjustments`,
          )
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ type: 'add', quantity: 5, reason: 'Should fail for now' })
          .expect(403);
      },
    );
  });

  describe('Manager — full product CRUD except delete, can adjust inventory', () => {
    it('allows Manager to update a product', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/products/${sharedProductId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ description: 'Updated by manager' })
        .expect(200);
    });

    it('forbids Manager from deleting a product', async () => {
      await request(server)
        .delete(`/organizations/${orgId}/products/${sharedProductId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('allows Manager to adjust inventory', async () => {
      await request(server)
        .post(
          `/organizations/${orgId}/products/${sharedProductId}/inventory/adjustments`,
        )
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ type: 'add', quantity: 15, reason: 'Manager stock check' })
        .expect(201);
    });
  });

  describe('Admin/Owner — full CRUD including delete', () => {
    it('allows Admin to delete a product', async () => {
      const createRes = await request(server)
        .post(`/organizations/${orgId}/products`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Delete Target',
          sku: `ADMIN-DEL-${runId}`,
          sellingPrice: 5,
        })
        .expect(201);
      const product = createRes.body as ProductResponseBody;

      await request(server)
        .delete(`/organizations/${orgId}/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('allows Owner to delete a product', async () => {
      const createRes = await request(server)
        .post(`/organizations/${orgId}/products`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Owner Delete Target',
          sku: `OWNER-DEL-${runId}`,
          sellingPrice: 5,
        })
        .expect(201);
      const product = createRes.body as ProductResponseBody;

      await request(server)
        .delete(`/organizations/${orgId}/products/${product.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
    });
  });
});
