import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Receipt Settings — RBAC, Tenant Isolation & Defaults (e2e)
 *
 * Sprint 6 CTO Directive §37/§39. Exercises the full HTTP stack
 * (route -> PermissionsGuard -> controller), matching the pattern
 * established in product-inventory-rbac.e2e-spec.ts — this is the
 * first module where RECEIPT_SETTINGS_* permissions are actually
 * assigned in the matrix (unlike Suppliers, which forced
 * service-level-only testing because SUPPLIER_* remains entirely
 * unassigned), so HTTP-level assertions are both possible and
 * required here.
 *
 * §39 requirements covered: retrieve, update, cross-org denial
 * (both read and write), invalid color rejection, default-settings
 * behavior when nothing has been explicitly configured.
 */

interface AuthResponseBody {
  accessToken: string;
}

interface OrganizationResponseBody {
  id: string;
  name: string;
}

interface InvitationResponseBody {
  token: string;
}

interface ReceiptSettingsResponseBody {
  displayName: string;
  accentColor: string;
  organizationId: string;
}

describe('Receipt Settings — RBAC, Tenant Isolation & Defaults (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const ownerEmail = `rs-owner.${runId}@example.com`;
  const adminEmail = `rs-admin.${runId}@example.com`;
  const managerEmail = `rs-manager.${runId}@example.com`;
  const staffEmail = `rs-staff.${runId}@example.com`;
  const viewerEmail = `rs-viewer.${runId}@example.com`;
  const orgBOwnerEmail = `rs-orgb-owner.${runId}@example.com`;

  let ownerToken: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let viewerToken: string;
  let orgBOwnerToken: string;

  let orgAId: string;
  let orgAName: string;
  let orgBId: string;

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
      .post(`/organizations/${orgAId}/invitations`)
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

    ownerToken = await registerAndLogin(ownerEmail, 'RSOwner');
    adminToken = await registerAndLogin(adminEmail, 'RSAdmin');
    managerToken = await registerAndLogin(managerEmail, 'RSManager');
    staffToken = await registerAndLogin(staffEmail, 'RSStaff');
    viewerToken = await registerAndLogin(viewerEmail, 'RSViewer');
    orgBOwnerToken = await registerAndLogin(orgBOwnerEmail, 'RSOrgBOwner');

    orgAName = `Receipt Settings Org A ${runId}`;
    const orgARes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: orgAName, country: 'Nigeria', currency: 'NGN' })
      .expect(201);
    orgAId = (orgARes.body as OrganizationResponseBody).id;

    const orgBRes = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${orgBOwnerToken}`)
      .send({
        name: `Receipt Settings Org B ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgBId = (orgBRes.body as OrganizationResponseBody).id;

    await inviteAndAccept(adminEmail, adminToken, 'admin');
    await inviteAndAccept(managerEmail, managerToken, 'manager');
    await inviteAndAccept(staffEmail, staffToken, 'staff');
    await inviteAndAccept(viewerEmail, viewerToken, 'viewer');
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Unauthenticated — §37 requirement', () => {
    it('rejects an unauthenticated GET with no Authorization header', async () => {
      await request(server)
        .get(`/organizations/${orgAId}/receipt-settings`)
        .expect(401);
    });

    it('rejects an unauthenticated PATCH with no Authorization header', async () => {
      await request(server)
        .patch(`/organizations/${orgAId}/receipt-settings`)
        .send({ displayName: 'Should Fail' })
        .expect(401);
    });
  });

  describe('Defaults — §12', () => {
    it(
      'returns usable default settings on first read, defaulting ' +
        "displayName to the organization's name, before anything has " +
        'been explicitly configured',
      async () => {
        const res = await request(server)
          .get(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200);
        const body = res.body as ReceiptSettingsResponseBody;

        expect(body.displayName).toBe(orgAName);
        expect(body.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      },
    );
  });

  describe('Validation', () => {
    it('rejects an invalid (non-hex) accentColor', async () => {
      await request(server)
        .patch(`/organizations/${orgAId}/receipt-settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ accentColor: 'blue' })
        .expect(400);
    });

    it('rejects a malformed hex color missing the # prefix', async () => {
      await request(server)
        .patch(`/organizations/${orgAId}/receipt-settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ accentColor: '2563EB' })
        .expect(400);
    });

    it('accepts a valid update and persists it', async () => {
      const res = await request(server)
        .patch(`/organizations/${orgAId}/receipt-settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ displayName: 'Chisom Fashion Store', accentColor: '#2563EB' })
        .expect(200);
      const body = res.body as ReceiptSettingsResponseBody;

      expect(body.displayName).toBe('Chisom Fashion Store');
      expect(body.accentColor).toBe('#2563EB');

      const getRes = await request(server)
        .get(`/organizations/${orgAId}/receipt-settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((getRes.body as ReceiptSettingsResponseBody).displayName).toBe(
        'Chisom Fashion Store',
      );
    });
  });

  describe(
    'RBAC — RECEIPT_SETTINGS_UPDATE is Owner/Admin only, ' +
      'RECEIPT_SETTINGS_READ is every role',
    () => {
      it('allows Viewer to read receipt settings', async () => {
        await request(server)
          .get(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${viewerToken}`)
          .expect(200);
      });

      it('forbids Viewer from updating receipt settings', async () => {
        await request(server)
          .patch(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({ displayName: 'Should Fail' })
          .expect(403);
      });

      it('allows Staff to read receipt settings', async () => {
        await request(server)
          .get(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${staffToken}`)
          .expect(200);
      });

      it('forbids Staff from updating receipt settings', async () => {
        await request(server)
          .patch(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ displayName: 'Should Fail' })
          .expect(403);
      });

      it('allows Manager to read receipt settings', async () => {
        await request(server)
          .get(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200);
      });

      it(
        'forbids Manager from updating receipt settings — ' +
          'RECEIPT_SETTINGS_UPDATE is Owner/Admin only (ratified), ' +
          'matching the existing ORGANIZATION_UPDATE pattern',
        async () => {
          await request(server)
            .patch(`/organizations/${orgAId}/receipt-settings`)
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ displayName: 'Should Fail' })
            .expect(403);
        },
      );

      it('allows Admin to update receipt settings', async () => {
        await request(server)
          .patch(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ displayName: 'Updated By Admin' })
          .expect(200);
      });

      it('allows Owner to update receipt settings', async () => {
        await request(server)
          .patch(`/organizations/${orgAId}/receipt-settings`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ displayName: 'Updated By Owner' })
          .expect(200);
      });
    },
  );

  describe('Tenant isolation — §15', () => {
    it("forbids Org B's owner from reading Org A's receipt settings", async () => {
      await request(server)
        .get(`/organizations/${orgAId}/receipt-settings`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .expect(403);
    });

    it("forbids Org B's owner from updating Org A's receipt settings", async () => {
      await request(server)
        .patch(`/organizations/${orgAId}/receipt-settings`)
        .set('Authorization', `Bearer ${orgBOwnerToken}`)
        .send({ displayName: 'Hostile Takeover' })
        .expect(403);
    });

    it(
      'Org B has its own independent, default-backed settings — ' +
        "unaffected by Org A's updates above",
      async () => {
        const res = await request(server)
          .get(`/organizations/${orgBId}/receipt-settings`)
          .set('Authorization', `Bearer ${orgBOwnerToken}`)
          .expect(200);
        const body = res.body as ReceiptSettingsResponseBody;

        expect(body.displayName).not.toBe('Updated By Owner');
        expect(body.organizationId).toBe(orgBId);
      },
    );
  });
});
