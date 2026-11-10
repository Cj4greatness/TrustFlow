import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

interface OrganizationBody {
  id: string;
}

interface InvitationBody {
  token: string;
}

interface MemberBody {
  id: string;
  role: string;
  user: {
    email: string;
    status: string;
  };
}

interface ErrorResponseBody {
  details?: {
    code?: string;
  };
}

type MemberRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
type ContextName =
  | 'removeLastOwner'
  | 'leaveLastOwner'
  | 'transfer'
  | 'removeRace'
  | 'leaveRace'
  | 'transferRace'
  | 'roleChanges'
  | 'crossOrg'
  | 'crossOrgTarget';

interface OrganizationContext {
  id: string;
  memberIds: Record<MemberRole, string>;
}

describe('Organization membership ownership invariants (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';
  const roles: Exclude<MemberRole, 'owner'>[] = [
    'admin',
    'manager',
    'staff',
    'viewer',
  ];
  const emailFor = (role: MemberRole) => `${role}.${runId}@example.com`;
  const tokens = {} as Record<MemberRole, string>;
  const contexts = {} as Record<ContextName, OrganizationContext>;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const register = async (role: MemberRole): Promise<string> => {
    const { accessToken } = await app.get(AuthService).register({
      email: emailFor(role),
      password,
      firstName: role,
      lastName: 'OwnerInvariantTest',
    });
    return accessToken;
  };

  const createOrganizationContext = async (
    contextName: ContextName,
  ): Promise<OrganizationContext> => {
    const response = await request(server)
      .post('/organizations')
      .set(auth(tokens.owner))
      .send({
        name: `Owner invariant ${contextName} ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    const organizationId = (response.body as OrganizationBody).id;

    for (const role of roles) {
      const invitationResponse = await request(server)
        .post(`/organizations/${organizationId}/invitations`)
        .set(auth(tokens.owner))
        .send({ email: emailFor(role), role })
        .expect(201);
      const invitation = invitationResponse.body as InvitationBody;

      await request(server)
        .post(`/organizations/invitations/${invitation.token}/accept`)
        .set(auth(tokens[role]))
        .expect(204);
    }

    const membersResponse = await request(server)
      .get(`/organizations/${organizationId}/members`)
      .set(auth(tokens.owner))
      .expect(200);
    const members = membersResponse.body as MemberBody[];
    const memberIds = {} as Record<MemberRole, string>;

    for (const role of ['owner', ...roles] as MemberRole[]) {
      const member = members.find(
        (candidate) => candidate.user.email === emailFor(role),
      );
      expect(member?.role).toBe(role);
      memberIds[role] = member!.id;
    }

    return { id: organizationId, memberIds };
  };

  const listMembers = async (
    organizationId: string,
    token: string,
  ): Promise<MemberBody[]> => {
    const response = await request(server)
      .get(`/organizations/${organizationId}/members`)
      .set(auth(token))
      .expect(200);
    return response.body as MemberBody[];
  };

  const expectOneActiveOwner = async (organizationId: string) => {
    const members = await listMembers(organizationId, tokens.owner);
    expect(
      members.filter(
        (member) => member.role === 'owner' && member.user.status === 'active',
      ),
    ).toHaveLength(1);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer();

    for (const role of ['owner', ...roles] as MemberRole[]) {
      tokens[role] = await register(role);
    }

    const contextNames: ContextName[] = [
      'removeLastOwner',
      'leaveLastOwner',
      'transfer',
      'removeRace',
      'leaveRace',
      'transferRace',
      'roleChanges',
      'crossOrg',
      'crossOrgTarget',
    ];
    for (const name of contextNames) {
      contexts[name] = await createOrganizationContext(name);
    }
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('blocks removal of the last active Owner with a stable error code', async () => {
    const context = contexts.removeLastOwner;
    const response = await request(server)
      .delete(`/organizations/${context.id}/members/${context.memberIds.owner}`)
      .set(auth(tokens.owner));

    expect(response.status).toBe(400);
    expect((response.body as ErrorResponseBody).details?.code).toBe(
      'LAST_OWNER_CANNOT_BE_REMOVED',
    );
    await expectOneActiveOwner(context.id);
  });

  it('blocks the last active Owner from leaving with a stable error code', async () => {
    const context = contexts.leaveLastOwner;
    const response = await request(server)
      .post(`/organizations/${context.id}/members/leave`)
      .set(auth(tokens.owner));

    expect(response.status).toBe(400);
    expect((response.body as ErrorResponseBody).details?.code).toBe(
      'LAST_OWNER_CANNOT_BE_REMOVED',
    );
    await expectOneActiveOwner(context.id);
  });

  it('still transfers ownership atomically', async () => {
    const context = contexts.transfer;
    await request(server)
      .post(`/organizations/${context.id}/members/transfer-ownership`)
      .set(auth(tokens.owner))
      .send({ newOwnerMemberId: context.memberIds.admin })
      .expect(204);

    const members = await listMembers(context.id, tokens.admin);
    expect(
      members.find((member) => member.id === context.memberIds.admin)?.role,
    ).toBe('owner');
    expect(
      members.find((member) => member.id === context.memberIds.owner)?.role,
    ).toBe('admin');
    await expectOneActiveOwner(context.id);
  });

  it('serializes concurrent removal of a transfer target against ownership transfer', async () => {
    const context = contexts.removeRace;
    const [removeResponse, transferResponse] = await Promise.all([
      request(server)
        .delete(
          `/organizations/${context.id}/members/${context.memberIds.viewer}`,
        )
        .set(auth(tokens.owner)),
      request(server)
        .post(`/organizations/${context.id}/members/transfer-ownership`)
        .set(auth(tokens.owner))
        .send({ newOwnerMemberId: context.memberIds.viewer }),
    ]);

    expect([204, 400]).toContain(removeResponse.status);
    expect([204, 404]).toContain(transferResponse.status);
    await expectOneActiveOwner(context.id);
  });

  it('serializes a transfer target leaving against ownership transfer', async () => {
    const context = contexts.leaveRace;
    const [leaveResponse, transferResponse] = await Promise.all([
      request(server)
        .post(`/organizations/${context.id}/members/leave`)
        .set(auth(tokens.viewer)),
      request(server)
        .post(`/organizations/${context.id}/members/transfer-ownership`)
        .set(auth(tokens.owner))
        .send({ newOwnerMemberId: context.memberIds.viewer }),
    ]);

    expect([204, 400]).toContain(leaveResponse.status);
    expect([204, 404]).toContain(transferResponse.status);
    await expectOneActiveOwner(context.id);
  });

  it('serializes concurrent ownership transfers to different members', async () => {
    const context = contexts.transferRace;
    const responses = await Promise.all([
      request(server)
        .post(`/organizations/${context.id}/members/transfer-ownership`)
        .set(auth(tokens.owner))
        .send({ newOwnerMemberId: context.memberIds.admin }),
      request(server)
        .post(`/organizations/${context.id}/members/transfer-ownership`)
        .set(auth(tokens.owner))
        .send({ newOwnerMemberId: context.memberIds.manager }),
    ]);

    for (const response of responses) {
      expect([204, 403]).toContain(response.status);
    }
    await expectOneActiveOwner(context.id);
  });

  it('keeps ordinary non-Owner role changes intact', async () => {
    const context = contexts.roleChanges;
    await request(server)
      .patch(`/organizations/${context.id}/members/${context.memberIds.viewer}`)
      .set(auth(tokens.owner))
      .send({ role: 'staff' })
      .expect((response) => expect([200, 204]).toContain(response.status));

    const members = await listMembers(context.id, tokens.owner);
    expect(
      members.find((member) => member.id === context.memberIds.admin)?.role,
    ).toBe('admin');
    expect(
      members.find((member) => member.id === context.memberIds.manager)?.role,
    ).toBe('manager');
    expect(
      members.find((member) => member.id === context.memberIds.staff)?.role,
    ).toBe('staff');
    expect(
      members.find((member) => member.id === context.memberIds.viewer)?.role,
    ).toBe('staff');
    await expectOneActiveOwner(context.id);
  });

  it('returns the existing 404 for a member in another organization', async () => {
    const organization = contexts.crossOrg;
    const otherOrganization = contexts.crossOrgTarget;

    await request(server)
      .delete(
        `/organizations/${organization.id}/members/${otherOrganization.memberIds.viewer}`,
      )
      .set(auth(tokens.owner))
      .expect(404);
  });
});
