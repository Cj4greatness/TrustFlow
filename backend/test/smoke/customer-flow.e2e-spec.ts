import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Customer Flow E2E
 *
 * Mirrors test/smoke/invitation-flow.e2e-spec.ts's structure and
 * conventions. Covers the Customer module's core lifecycle
 * (create/list/get/update/soft-delete), cross-organization tenant
 * isolation, and current RBAC behavior — including the unresolved
 * CUSTOMER_UPDATE gap for Manager/Staff flagged in
 * permission-matrix.ts. This suite documents that gap's actual
 * behavior; it does not assert it is correct, and should be
 * updated deliberately (not silently) if the CTO's decision changes
 * the matrix.
 *
 * Test users are registered dynamically with randomized emails per
 * run, matching the invitation suite's self-contained, rerunnable
 * design.
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

interface CustomerResponseBody {
  id: string;
  organizationId: string;
  displayName: string;
  status: string;
  phone: string | null;
}

interface PaginatedCustomersResponseBody {
  data: CustomerResponseBody[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

describe('Customer Flow (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const ownerAEmail = `ownerA.${runId}@example.com`;
  const viewerAEmail = `viewerA.${runId}@example.com`;
  const staffAEmail = `staffA.${runId}@example.com`;
  const ownerBEmail = `ownerB.${runId}@example.com`;

  let ownerAToken: string;
  let viewerAToken: string;
  let staffAToken: string;
  let ownerBToken: string;

  let orgAId: string;
  let orgBId: string;
  let customerId: string;

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

    const body = loginRes.body as AuthResponseBody;
    return body.accessToken;
  };

  const inviteAndAccept = async (
    orgId: string,
    inviterToken: string,
    inviteeEmail: string,
    inviteeToken: string,
    role: string,
  ): Promise<void> => {
    const inviteRes = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${inviterToken}`)
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

    ownerAToken = await registerAndLogin(ownerAEmail, 'OwnerA');
    viewerAToken = await registerAndLogin(viewerAEmail, 'ViewerA');
    staffAToken = await registerAndLogin(staffAEmail, 'StaffA');
    ownerBToken = await registerAndLogin(ownerBEmail, 'OwnerB');

    const orgARes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: `Customer Smoke Org A ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgAId = (orgARes.body as OrganizationResponseBody).id;

    const orgBRes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({
        name: `Customer Smoke Org B ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgBId = (orgBRes.body as OrganizationResponseBody).id;

    await inviteAndAccept(
      orgAId,
      ownerAToken,
      viewerAEmail,
      viewerAToken,
      'viewer',
    );
    await inviteAndAccept(
      orgAId,
      ownerAToken,
      staffAEmail,
      staffAToken,
      'staff',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a customer as Owner', async () => {
    const res = await request(server)
      .post(`/organizations/${orgAId}/customers`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        customerType: 'individual',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: `customer.${runId}@example.com`,
      })
      .expect(201);

    const body = res.body as CustomerResponseBody;
    expect(body.id).toBeDefined();
    expect(body.organizationId).toBe(orgAId);
    expect(body.displayName).toBe('Ada Lovelace');
    customerId = body.id;
  });

  it('lists customers in the organization, including the one just created', async () => {
    const res = await request(server)
      .get(`/organizations/${orgAId}/customers`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    const body = res.body as PaginatedCustomersResponseBody;
    const found = body.data.find((c) => c.id === customerId);
    expect(found).toBeDefined();
  });

  it('gets the single customer', async () => {
    const res = await request(server)
      .get(`/organizations/${orgAId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    const body = res.body as CustomerResponseBody;
    expect(body.id).toBe(customerId);
  });

  it('allows a Viewer to read customers', async () => {
    await request(server)
      .get(`/organizations/${orgAId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${viewerAToken}`)
      .expect(200);
  });

  it('forbids a Viewer from creating a customer', async () => {
    await request(server)
      .post(`/organizations/${orgAId}/customers`)
      .set('Authorization', `Bearer ${viewerAToken}`)
      .send({
        customerType: 'individual',
        firstName: 'Should',
        lastName: 'Fail',
      })
      .expect(403);
  });

  it('updates the customer as Owner', async () => {
    const res = await request(server)
      .patch(`/organizations/${orgAId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ status: 'active', phone: '+2348012345678' })
      .expect(200);

    const body = res.body as CustomerResponseBody;
    expect(body.status).toBe('active');
    expect(body.phone).toBe('+2348012345678');
  });

  it(
    'allows Staff to create a customer, but forbids Staff from updating it ' +
      '(documents the current, unresolved CUSTOMER_UPDATE gap flagged in ' +
      'permission-matrix.ts — this is expected behavior today, not a bug ' +
      'this suite is asserting is correct)',
    async () => {
      const createRes = await request(server)
        .post(`/organizations/${orgAId}/customers`)
        .set('Authorization', `Bearer ${staffAToken}`)
        .send({
          customerType: 'business',
          companyName: `Staff Created Co ${runId}`,
        })
        .expect(201);

      const staffCustomer = createRes.body as CustomerResponseBody;

      await request(server)
        .patch(`/organizations/${orgAId}/customers/${staffCustomer.id}`)
        .set('Authorization', `Bearer ${staffAToken}`)
        .send({ status: 'active' })
        .expect(403);
    },
  );

  it(
    "forbids reaching Org A's customer through Org B's route, even with a " +
      'valid customer UUID and a valid Owner token for Org B — same class ' +
      'of cross-tenant bug the Sprint 3 RBAC audit found in listMembers()',
    async () => {
      await request(server)
        .get(`/organizations/${orgBId}/customers/${customerId}`)
        .set('Authorization', `Bearer ${ownerBToken}`)
        .expect(404);
    },
  );

  it('soft-deletes the customer as Owner, after which it 404s on GET', async () => {
    await request(server)
      .delete(`/organizations/${orgAId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(204);

    await request(server)
      .get(`/organizations/${orgAId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(404);
  });
});
