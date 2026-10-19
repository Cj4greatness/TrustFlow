import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { PERMISSION_MATRIX } from '../../src/authorization/permission-matrix';
import { OrganizationRole } from '../../src/organization-members/entities/organization-member.entity';
import { Permission } from '../../src/authorization/permissions.enum';

/**
 * GET /organizations/:id/me (CTO directive D5)
 *
 * The frontend renders role-aware UI from this response, so the
 * contract that matters is: it returns exactly what the server
 * enforces (parity with PERMISSION_MATRIX), only to real members, and
 * a client-supplied org id never grants anything by itself.
 */
interface MyMembershipBody {
  organizationId: string;
  memberId: string;
  userId: string;
  role: string;
  permissions: string[];
}

describe('Organizations — GET /:id/me (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  let orgId: string;
  let otherOrgId: string;
  let ownerToken: string;
  let viewerToken: string;
  let outsiderToken: string;

  const registerAndLogin = async (email: string, firstName: string) => {
    const { accessToken } = await app.get(AuthService).register({
      email,
      password: PASSWORD,
      firstName,
      lastName: 'Test',
    });
    return accessToken;
  };

  const createOrg = async (token: string, name: string) => {
    const res = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, country: 'Nigeria', currency: 'NGN' })
      .expect(201);
    return (res.body as { id: string }).id;
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

    ownerToken = await registerAndLogin(`me-owner.${runId}@example.com`, 'Own');
    orgId = await createOrg(ownerToken, `Me Org ${runId}`);

    viewerToken = await registerAndLogin(
      `me-viewer.${runId}@example.com`,
      'View',
    );
    const invite = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: `me-viewer.${runId}@example.com`, role: 'viewer' })
      .expect(201);
    await request(server)
      .post(
        `/organizations/invitations/${(invite.body as { token: string }).token}/accept`,
      )
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(204);

    outsiderToken = await registerAndLogin(
      `me-outsider.${runId}@example.com`,
      'Out',
    );
    otherOrgId = await createOrg(outsiderToken, `Outsider Org ${runId}`);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('rejects an anonymous caller with 401', async () => {
    await request(server).get(`/organizations/${orgId}/me`).expect(401);
  });

  it('returns the Owner role with exactly the matrix permissions', async () => {
    const res = await request(server)
      .get(`/organizations/${orgId}/me`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const body = res.body as MyMembershipBody;

    expect(body.organizationId).toBe(orgId);
    expect(body.role).toBe(OrganizationRole.OWNER);
    expect(body.permissions).toEqual(
      [...PERMISSION_MATRIX[OrganizationRole.OWNER]].sort(),
    );
    expect(body.permissions).toContain(Permission.ORDER_CREATE);
  });

  it('returns the Viewer role with exactly the matrix permissions — no write access leaks through', async () => {
    const res = await request(server)
      .get(`/organizations/${orgId}/me`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    const body = res.body as MyMembershipBody;

    expect(body.role).toBe(OrganizationRole.VIEWER);
    expect(body.permissions).toEqual(
      [...PERMISSION_MATRIX[OrganizationRole.VIEWER]].sort(),
    );
    expect(body.permissions).not.toContain(Permission.ORDER_CREATE);
    expect(body.permissions).not.toContain(Permission.MEMBER_INVITE);
    expect(body.permissions).toContain(Permission.INVOICE_READ);
  });

  it("forbids a non-member from learning a role in an organization they don't belong to", async () => {
    await request(server)
      .get(`/organizations/${orgId}/me`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });

  it("scopes the answer to the requested org: the same user is Owner in their own org and a stranger in another's", async () => {
    const mine = await request(server)
      .get(`/organizations/${otherOrgId}/me`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);
    expect((mine.body as MyMembershipBody).role).toBe(OrganizationRole.OWNER);

    await request(server)
      .get(`/organizations/${otherOrgId}/me`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
  });
});
