import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Invitation Lifecycle Smoke Test
 *
 * Mirrors scripts/invitation-smoke-test.sh, encoded as a permanent
 * regression suite. Covers the full lifecycle: org creation, invite,
 * accept, duplicate-accept rejection, wrong-user rejection, revoke,
 * reject, and wrong-user-reject rejection.
 *
 * NOTE: runs against whatever DATABASE_* env vars are active — no
 * .env.test exists yet. Before wiring into CI, set up a dedicated
 * test database per the CTO's CI plan (start Postgres, run
 * migrations, then run this suite).
 *
 * Test users are registered dynamically with randomized emails per
 * run, so this suite is self-contained and safely rerunnable without
 * manual seeding or DB cleanup between runs.
 */

interface AuthResponseBody {
  accessToken: string;
}

interface OrganizationResponseBody {
  id: string;
}

interface InvitationResponseBody {
  id: string;
  token: string;
  status: string;
}

interface MemberResponseBody {
  role: string;
  user: {
    email: string;
  };
}

describe('Invitation Lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const ownerEmail = `owner.${runId}@example.com`;
  const invitedEmail = `invited.${runId}@example.com`;
  const unrelatedEmail = `unrelated.${runId}@example.com`;
  const secondInviteEmail = `second.${runId}@example.com`;
  const revokeTargetEmail = `revoke.${runId}@example.com`;
  const rejectTargetEmail = `reject.${runId}@example.com`;
  const wrongRejectEmail = `wrongreject.${runId}@example.com`;

  let ownerToken: string;
  let invitedToken: string;
  let unrelatedToken: string;
  let rejectTargetToken: string;

  let orgId: string;
  let invitationToken: string;

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors src/main.ts global setup — without this, DTO validation
    // (e.g. @IsEmail, @IsEnum on CreateInvitationDto) won't be
    // enforced and error response shapes won't match production.
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

    ownerToken = await registerAndLogin(ownerEmail, 'Owner');
    invitedToken = await registerAndLogin(invitedEmail, 'Invited');
    unrelatedToken = await registerAndLogin(unrelatedEmail, 'Unrelated');
    await registerAndLogin(secondInviteEmail, 'Second');
    await registerAndLogin(revokeTargetEmail, 'RevokeTarget');
    rejectTargetToken = await registerAndLogin(
      rejectTargetEmail,
      'RejectTarget',
    );
    await registerAndLogin(wrongRejectEmail, 'WrongReject');
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('creates an organization', async () => {
    const res = await request(server)
      .post('/organizations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Smoke Test Org ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);

    const body = res.body as OrganizationResponseBody;
    expect(body.id).toBeDefined();
    orgId = body.id;
  });

  it('invites a user, returning a pending invitation with a token', async () => {
    const res = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: invitedEmail, role: 'viewer' })
      .expect(201);

    const body = res.body as InvitationResponseBody;
    expect(body.token).toBeDefined();
    expect(body.status).toBe('pending');
    invitationToken = body.token;
  });

  it('accepts the invitation', async () => {
    await request(server)
      .post(`/organizations/invitations/${invitationToken}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .expect(204);
  });

  it('lists the new member with the correct role', async () => {
    const res = await request(server)
      .get(`/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const members = res.body as MemberResponseBody[];
    const member = members.find((m) => m.user.email === invitedEmail);
    expect(member).toBeDefined();
    expect(member?.role).toBe('viewer');
  });
  it('allows a viewer-role member to list org members (regression check for a permission bug where listMembers() incorrectly required admin rank)', async () => {
    await request(server)
      .get(`/organizations/${orgId}/members`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .expect(200);
  });
  it('rejects a duplicate accept of the same invitation', async () => {
    const res = await request(server)
      .post(`/organizations/invitations/${invitationToken}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`);

    expect([400, 409, 410]).toContain(res.status);
  });

  it("forbids an unrelated user from accepting someone else's invitation", async () => {
    const secondInviteRes = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: secondInviteEmail, role: 'viewer' })
      .expect(201);

    const secondInvite = secondInviteRes.body as InvitationResponseBody;

    const res = await request(server)
      .post(`/organizations/invitations/${secondInvite.token}/accept`)
      .set('Authorization', `Bearer ${unrelatedToken}`);

    // A 204 here would mean any authenticated user can accept anyone's
    // invitation — this is the exact vulnerability found and fixed
    // during Sprint 3 manual testing. Do not weaken this assertion.
    expect(res.status).toBe(403);
  });

  it('lets the owner revoke a pending invitation, after which it can no longer be accepted', async () => {
    const inviteRes = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: revokeTargetEmail, role: 'viewer' })
      .expect(201);

    const invite = inviteRes.body as InvitationResponseBody;

    await request(server)
      .delete(`/organizations/${orgId}/invitations/${invite.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const res = await request(server)
      .post(`/organizations/invitations/${invite.token}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect([400, 409, 410]).toContain(res.status);
  });
  it(
    "forbids revoking another organization's invitation, even with a " +
      'valid Owner token and a valid MEMBER_INVITE permission — regression ' +
      'test for the InvitationsService.revoke() ownership gap found in the ' +
      'Sprint 3 audit, where organizationId from the route was never ' +
      "checked against the invitation's actual organizationId",
    async () => {
      const otherOrgOwnerEmail = `otherorgowner.${runId}@example.com`;
      const otherOrgOwnerToken = await registerAndLogin(
        otherOrgOwnerEmail,
        'OtherOrgOwner',
      );

      const otherOrgRes = await request(server)
        .post('/organizations')
        .set('Authorization', `Bearer ${otherOrgOwnerToken}`)
        .send({
          name: `Smoke Test Other Org ${runId}`,
          country: 'Nigeria',
          currency: 'NGN',
        })
        .expect(201);
      const otherOrg = otherOrgRes.body as OrganizationResponseBody;

      const crossOrgInviteEmail = `crossorgtarget.${runId}@example.com`;
      const inviteRes = await request(server)
        .post(`/organizations/${orgId}/invitations`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: crossOrgInviteEmail, role: 'viewer' })
        .expect(201);
      const invite = inviteRes.body as InvitationResponseBody;

      // otherOrgOwnerToken has MEMBER_INVITE within otherOrg.id (they're
      // its Owner) — but the invitation belongs to orgId, not otherOrg.id.
      // A 204 here would mean any org owner can revoke any other org's
      // pending invitations, as long as they know the invitation's UUID.
      const res = await request(server)
        .delete(`/organizations/${otherOrg.id}/invitations/${invite.id}`)
        .set('Authorization', `Bearer ${otherOrgOwnerToken}`);

      expect(res.status).toBe(404);
    },
  );

  it('lets the invited user reject their own invitation, after which it can no longer be accepted', async () => {
    const inviteRes = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: rejectTargetEmail, role: 'viewer' })
      .expect(201);

    const invite = inviteRes.body as InvitationResponseBody;

    await request(server)
      .post(`/organizations/invitations/${invite.token}/reject`)
      .set('Authorization', `Bearer ${rejectTargetToken}`)
      .expect(204);

    const res = await request(server)
      .post(`/organizations/invitations/${invite.token}/accept`)
      .set('Authorization', `Bearer ${rejectTargetToken}`);

    expect([400, 409, 410]).toContain(res.status);
  });

  it("forbids an unrelated user from rejecting someone else's pending invitation", async () => {
    const inviteRes = await request(server)
      .post(`/organizations/${orgId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: wrongRejectEmail, role: 'viewer' })
      .expect(201);

    const invite = inviteRes.body as InvitationResponseBody;

    const res = await request(server)
      .post(`/organizations/invitations/${invite.token}/reject`)
      .set('Authorization', `Bearer ${unrelatedToken}`);

    // Same class of bug as the accept() check above — a 204 here
    // would mean anyone can cancel anyone else's pending invitation.
    expect(res.status).toBe(403);
  });

  it('forbids a viewer from removing a member, but allows the owner to', async () => {
    const forbiddenRes = await request(server)
      .delete(`/organizations/${orgId}/members/nonexistent-placeholder`)
      .set('Authorization', `Bearer ${invitedToken}`);

    // PermissionsGuard should reject before the service ever looks up
    // the member, so this 403s regardless of whether the ID is real.
    expect(forbiddenRes.status).toBe(403);
  });
});
