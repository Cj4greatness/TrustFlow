import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Member Governance Authorization (e2e)
 *
 * Pins the ratified Permission matrix on the organization-members
 * endpoints now that the PermissionsGuard + matrix are the single
 * authorization system (the legacy rank-based membership-rules.ts
 * was removed in Sprint 8). This is a behavior-preservation suite:
 * every expectation below held before the consolidation too.
 *
 * Ratified rules exercised here:
 *  - MEMBER_UPDATE / MEMBER_REMOVE: Owner and Admin only
 *  - OWNERSHIP_TRANSFER: Owner only
 *  - Owner role can only change via ownership transfer
 *  - Admin-vs-Admin hierarchy is intentionally NOT asserted: it is an
 *    open business-rule question for the CTO, not ratified behavior.
 *
 * Users are registered with randomized emails per run, so the suite
 * is self-contained and rerunnable without cleanup.
 */

interface IdBody {
  id: string;
}

interface InvitationBody {
  token: string;
}

interface MemberBody {
  id: string;
  role: string;
  user: { email: string };
}

describe('Member governance authorization (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  type RoleName = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
  const invitedRoles: Exclude<RoleName, 'owner'>[] = [
    'admin',
    'manager',
    'staff',
    'viewer',
  ];

  const emailFor = (role: RoleName) => `${role}.${runId}@example.com`;
  const tokens = {} as Record<RoleName, string>;
  const memberIds = {} as Record<RoleName, string>;
  let spareToken: string;
  let orgId: string;

  const register = async (email: string, firstName: string) => {
    const { accessToken } = await app.get(AuthService).register({
      email,
      password: PASSWORD,
      firstName,
      lastName: 'Test',
    });
    return accessToken;
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const listMembers = async (token: string): Promise<MemberBody[]> => {
    const res = await request(server)
      .get(`/organizations/${orgId}/members`)
      .set(auth(token))
      .expect(200);
    return res.body as MemberBody[];
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

    tokens.owner = await register(emailFor('owner'), 'Owner');
    for (const role of invitedRoles) {
      tokens[role] = await register(emailFor(role), role);
    }
    spareToken = await register(`spare.${runId}@example.com`, 'Spare');

    const orgRes = await request(server)
      .post('/organizations')
      .set(auth(tokens.owner))
      .send({
        name: `Authz Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    orgId = (orgRes.body as IdBody).id;

    for (const role of invitedRoles) {
      const inviteRes = await request(server)
        .post(`/organizations/${orgId}/invitations`)
        .set(auth(tokens.owner))
        .send({ email: emailFor(role), role })
        .expect(201);
      await request(server)
        .post(
          `/organizations/invitations/${(inviteRes.body as InvitationBody).token}/accept`,
        )
        .set(auth(tokens[role]))
        .expect(204);
    }

    const members = await listMembers(tokens.owner);
    for (const role of ['owner', ...invitedRoles] as RoleName[]) {
      const found = members.find((m) => m.user.email === emailFor(role));
      expect(found?.role).toBe(role);
      memberIds[role] = found!.id;
    }
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('role changes (MEMBER_UPDATE: Owner/Admin only)', () => {
    it.each(['manager', 'staff', 'viewer'] as const)(
      'forbids a %s from changing a member role',
      async (actor) => {
        await request(server)
          .patch(`/organizations/${orgId}/members/${memberIds.viewer}`)
          .set(auth(tokens[actor]))
          .send({ role: 'staff' })
          .expect(403);
      },
    );

    it('lets an admin promote and demote a lower-ranked member', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/members/${memberIds.viewer}`)
        .set(auth(tokens.admin))
        .send({ role: 'staff' })
        .expect((res) => expect([200, 204]).toContain(res.status));

      await request(server)
        .patch(`/organizations/${orgId}/members/${memberIds.viewer}`)
        .set(auth(tokens.admin))
        .send({ role: 'viewer' })
        .expect((res) => expect([200, 204]).toContain(res.status));

      const members = await listMembers(tokens.owner);
      expect(members.find((m) => m.id === memberIds.viewer)?.role).toBe(
        'viewer',
      );
    });

    it('rejects changing the Owner role through the role endpoint, even for the owner', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/members/${memberIds.owner}`)
        .set(auth(tokens.admin))
        .send({ role: 'admin' })
        .expect(400);
      await request(server)
        .patch(`/organizations/${orgId}/members/${memberIds.owner}`)
        .set(auth(tokens.owner))
        .send({ role: 'admin' })
        .expect(400);
    });

    it('rejects granting the Owner role through the role endpoint', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/members/${memberIds.staff}`)
        .set(auth(tokens.owner))
        .send({ role: 'owner' })
        .expect(400);
    });

    it('rejects a non-member', async () => {
      await request(server)
        .patch(`/organizations/${orgId}/members/${memberIds.viewer}`)
        .set(auth(spareToken))
        .send({ role: 'staff' })
        .expect(403);
    });
  });

  describe('member removal (MEMBER_REMOVE: Owner/Admin only)', () => {
    it.each(['manager', 'staff', 'viewer'] as const)(
      'forbids a %s from removing a member',
      async (actor) => {
        await request(server)
          .delete(`/organizations/${orgId}/members/${memberIds.viewer}`)
          .set(auth(tokens[actor]))
          .expect(403);
      },
    );

    it('refuses to remove the owner, even for the owner', async () => {
      await request(server)
        .delete(`/organizations/${orgId}/members/${memberIds.owner}`)
        .set(auth(tokens.owner))
        .expect(400);
    });
  });

  describe('ownership transfer (OWNERSHIP_TRANSFER: Owner only)', () => {
    it.each(['admin', 'manager', 'staff', 'viewer'] as const)(
      'forbids a %s from transferring ownership',
      async (actor) => {
        await request(server)
          .post(`/organizations/${orgId}/members/transfer-ownership`)
          .set(auth(tokens[actor]))
          .send({ newOwnerMemberId: memberIds[actor] })
          .expect(403);
      },
    );

    it('lets the owner transfer ownership, demoting themselves to admin', async () => {
      await request(server)
        .post(`/organizations/${orgId}/members/transfer-ownership`)
        .set(auth(tokens.owner))
        .send({ newOwnerMemberId: memberIds.admin })
        .expect(204);

      const members = await listMembers(tokens.admin);
      expect(members.find((m) => m.id === memberIds.admin)?.role).toBe('owner');
      expect(members.find((m) => m.id === memberIds.owner)?.role).toBe('admin');
    });

    it('revokes ownership powers from the former owner immediately', async () => {
      await request(server)
        .post(`/organizations/${orgId}/members/transfer-ownership`)
        .set(auth(tokens.owner))
        .send({ newOwnerMemberId: memberIds.owner })
        .expect(403);
    });
  });

  describe('admin removal of a lower member (runs after transfer)', () => {
    it('lets an admin remove a lower-ranked member', async () => {
      // Former owner is now an admin; the new owner is the old admin.
      await request(server)
        .delete(`/organizations/${orgId}/members/${memberIds.viewer}`)
        .set(auth(tokens.owner))
        .expect(204);

      const members = await listMembers(tokens.admin);
      expect(members.find((m) => m.id === memberIds.viewer)).toBeUndefined();
    });
  });
});
