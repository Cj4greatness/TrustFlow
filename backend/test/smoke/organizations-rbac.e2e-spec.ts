import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Organizations — RBAC (e2e)
 *
 * Regression suite for the critical gap found in the Backend
 * Readiness & Freeze Audit (Organizations/Members/Invitations pass):
 * PATCH /organizations/:id had no @Permissions() decorator at all —
 * only AuthGuard('jwt'), meaning any authenticated user, member or
 * not, could update any organization's name/industry/country/
 * timezone/logo. Fixed by adding
 * @Permissions(Permission.ORGANIZATION_UPDATE), which is Owner/Admin
 * -only per the ratified matrix.
 *
 * The "forbids a completely unrelated user" test below is the
 * actual vulnerability that was found — do not weaken it.
 */

interface OrganizationResponseBody {
  id: string;
  name: string;
}

interface InvitationResponseBody {
  token: string;
}

describe('Organizations — RBAC (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  let orgId: string;
  let ownerToken: string;
  let adminToken: string;
  let managerToken: string;
  let viewerToken: string;
  let unrelatedToken: string;

  const registerAndLogin = async (
    email: string,
    firstName: string,
  ): Promise<string> => {
    const authService = app.get(AuthService);
    const { accessToken } = await authService.register({
      email,
      password: PASSWORD,
      firstName,
      lastName: 'Test',
    });
    return accessToken;
  };

  const inviteAndAccept = async (
    email: string,
    firstName: string,
    role: string,
  ): Promise<string> => {
    const token = await registerAndLogin(email, firstName);

    const inviteRes = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email, role })
      .expect(201);

    const invite = inviteRes.body as InvitationResponseBody;

    await request(server)
      .post(`/organizations/invitations/${invite.token}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    return token;
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

    ownerToken = await registerAndLogin(
      `org-owner.${runId}@example.com`,
      'Owner',
    );

    const orgRes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `RBAC Test Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgId = (orgRes.body as OrganizationResponseBody).id;

    adminToken = await inviteAndAccept(
      `org-admin.${runId}@example.com`,
      'Admin',
      'admin',
    );
    managerToken = await inviteAndAccept(
      `org-manager.${runId}@example.com`,
      'Manager',
      'manager',
    );
    viewerToken = await inviteAndAccept(
      `org-viewer.${runId}@example.com`,
      'Viewer',
      'viewer',
    );
    unrelatedToken = await registerAndLogin(
      `org-unrelated.${runId}@example.com`,
      'Unrelated',
    );
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('allows Owner to update the organization', async () => {
    const res = await request(server)
      .patch(`/organizations/${orgId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ industry: 'Retail' })
      .expect(200);

    expect((res.body as OrganizationResponseBody).name).toBeDefined();
  });

  it('allows Admin to update the organization', async () => {
    await request(server)
      .patch(`/organizations/${orgId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ industry: 'Wholesale' })
      .expect(200);
  });

  it('forbids Manager from updating the organization', async () => {
    await request(server)
      .patch(`/organizations/${orgId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ industry: 'Blocked' })
      .expect(403);
  });

  it('forbids Viewer from updating the organization', async () => {
    await request(server)
      .patch(`/organizations/${orgId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ industry: 'Blocked' })
      .expect(403);
  });

  it(
    'forbids a completely unrelated authenticated user (no membership ' +
      'in this organization at all) from updating it — this is the ' +
      'exact vulnerability found in the audit: PATCH /organizations/:id ' +
      'previously had no permission check, so any authenticated user ' +
      "could rewrite any other organization's details given only its " +
      'UUID. A 200 here would mean the vulnerability has regressed.',
    async () => {
      const res = await request(server)
        .patch(`/organizations/${orgId}`)
        .set('Authorization', `Bearer ${unrelatedToken}`)
        .send({ industry: 'Hijacked' });

      expect(res.status).toBe(403);
    },
  );
});
