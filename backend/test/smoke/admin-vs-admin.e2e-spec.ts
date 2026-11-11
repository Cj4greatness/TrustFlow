import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import {
  OrganizationMember,
  OrganizationRole,
} from '../../src/organization-members/entities/organization-member.entity';

interface OrganizationBody {
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

interface ErrorResponseBody {
  details?: { code?: string };
}

type Identity =
  'owner' | 'admin' | 'admin2' | 'manager' | 'staff' | 'viewer' | 'outsider';
type ContextName =
  | 'adminRemoveAdmin'
  | 'adminChangeAdmin'
  | 'ownerRemoveAdmin'
  | 'ownerChangeAdmin'
  | 'adminLowerRemoval'
  | 'adminLowerChanges'
  | 'adminOwnerRemoval'
  | 'adminSelf'
  | 'crossOrgSource'
  | 'crossOrgTarget'
  | 'race'
  | 'adminPromotion'
  | 'adminSelfDemoteStaff'
  | 'adminSelfDemoteViewer'
  | 'adminSelfInvalid'
  | 'selfDemotionRace';

interface OrganizationContext {
  id: string;
  memberIds: Record<Exclude<Identity, 'outsider'>, string>;
}

describe('Admin versus Admin governance (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';
  const members: Exclude<Identity, 'outsider' | 'owner'>[] = [
    'admin',
    'admin2',
    'manager',
    'staff',
    'viewer',
  ];
  const identities: Identity[] = ['owner', ...members, 'outsider'];
  const emailFor = (identity: Identity) => `${identity}.${runId}@example.com`;
  const tokens = {} as Record<Identity, string>;
  const ipFor = (identity: Identity) =>
    `10.98.0.${identities.indexOf(identity) + 1}`;
  const contexts = {} as Record<ContextName, OrganizationContext>;

  const headersFor = (identity: Identity) => ({
    Authorization: `Bearer ${tokens[identity]}`,
    'X-Test-Client-Ip': ipFor(identity),
  });

  const register = async (identity: Identity): Promise<string> => {
    const { accessToken } = await app.get(AuthService).register({
      email: emailFor(identity),
      password,
      firstName: identity,
      lastName: 'AdminGovernanceTest',
    });
    return accessToken;
  };

  const createOrganizationContext = async (
    contextName: ContextName,
  ): Promise<OrganizationContext> => {
    const response = await request(server)
      .post('/organizations')
      .set(headersFor('owner'))
      .send({
        name: `Admin governance ${contextName} ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    const organizationId = (response.body as OrganizationBody).id;

    for (const identity of members) {
      const inviteResponse = await request(server)
        .post(`/organizations/${organizationId}/invitations`)
        .set(headersFor('owner'))
        .send({
          email: emailFor(identity),
          role: identity === 'admin2' ? 'admin' : identity,
        })
        .expect(201);
      const invitation = inviteResponse.body as InvitationBody;

      await request(server)
        .post(`/organizations/invitations/${invitation.token}/accept`)
        .set(headersFor(identity))
        .expect(204);
    }

    const listResponse = await request(server)
      .get(`/organizations/${organizationId}/members`)
      .set(headersFor('owner'))
      .expect(200);
    const listedMembers = listResponse.body as MemberBody[];
    const memberIds = {} as Record<Exclude<Identity, 'outsider'>, string>;

    for (const identity of ['owner', ...members] as const) {
      const member = listedMembers.find(
        (candidate) => candidate.user.email === emailFor(identity),
      );
      const expectedRole =
        identity === 'admin2' ? OrganizationRole.ADMIN : identity;
      expect(member?.role).toBe(expectedRole);
      memberIds[identity] = member!.id;
    }

    return { id: organizationId, memberIds };
  };

  const getMembership = (
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMember | null> =>
    app
      .get(DataSource)
      .getRepository(OrganizationMember)
      .findOneBy({ id: memberId, organizationId });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer();

    for (const identity of identities) {
      tokens[identity] = await register(identity);
    }

    const contextNames: ContextName[] = [
      'adminRemoveAdmin',
      'adminChangeAdmin',
      'ownerRemoveAdmin',
      'ownerChangeAdmin',
      'adminLowerRemoval',
      'adminLowerChanges',
      'adminOwnerRemoval',
      'adminSelf',
      'crossOrgSource',
      'crossOrgTarget',
      'race',
      'adminPromotion',
      'adminSelfDemoteStaff',
      'adminSelfDemoteViewer',
      'adminSelfInvalid',
      'selfDemotionRace',
    ];
    for (const contextName of contextNames) {
      contexts[contextName] = await createOrganizationContext(contextName);
    }
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  it('forbids an Admin from removing another Admin with a stable code', async () => {
    const context = contexts.adminRemoveAdmin;
    const response = await request(server)
      .delete(
        `/organizations/${context.id}/members/${context.memberIds.admin2}`,
      )
      .set(headersFor('admin'));

    expect(response.status).toBe(403);
    expect((response.body as ErrorResponseBody).details?.code).toBe(
      'ADMIN_CANNOT_MODIFY_ADMIN',
    );
    expect(
      await getMembership(context.id, context.memberIds.admin2),
    ).not.toBeNull();
  });

  it('forbids an Admin from changing another Admin role without changing the row', async () => {
    const context = contexts.adminChangeAdmin;
    const response = await request(server)
      .patch(`/organizations/${context.id}/members/${context.memberIds.admin2}`)
      .set(headersFor('admin'))
      .send({ role: OrganizationRole.MANAGER });

    expect(response.status).toBe(403);
    expect((response.body as ErrorResponseBody).details?.code).toBe(
      'ADMIN_CANNOT_MODIFY_ADMIN',
    );
    expect(
      (await getMembership(context.id, context.memberIds.admin2))?.role,
    ).toBe(OrganizationRole.ADMIN);
  });

  it('allows the Owner to remove an Admin', async () => {
    const context = contexts.ownerRemoveAdmin;
    await request(server)
      .delete(`/organizations/${context.id}/members/${context.memberIds.admin}`)
      .set(headersFor('owner'))
      .expect(204);

    expect(await getMembership(context.id, context.memberIds.admin)).toBeNull();
  });

  it('allows the Owner to change an Admin role and promote a Manager to Admin', async () => {
    const context = contexts.ownerChangeAdmin;
    await request(server)
      .patch(`/organizations/${context.id}/members/${context.memberIds.admin}`)
      .set(headersFor('owner'))
      .send({ role: OrganizationRole.MANAGER })
      .expect((response) => expect([200, 204]).toContain(response.status));

    expect(
      (await getMembership(context.id, context.memberIds.admin))?.role,
    ).toBe(OrganizationRole.MANAGER);

    await request(server)
      .patch(
        `/organizations/${context.id}/members/${context.memberIds.manager}`,
      )
      .set(headersFor('owner'))
      .send({ role: OrganizationRole.ADMIN })
      .expect((response) => expect([200, 204]).toContain(response.status));
    expect(
      (await getMembership(context.id, context.memberIds.manager))?.role,
    ).toBe(OrganizationRole.ADMIN);
  });

  it.each(['manager', 'staff', 'viewer'] as const)(
    'allows an Admin to remove a %s',
    async (role) => {
      const context = contexts.adminLowerRemoval;
      await request(server)
        .delete(
          `/organizations/${context.id}/members/${context.memberIds[role]}`,
        )
        .set(headersFor('admin'))
        .expect(204);
      expect(
        await getMembership(context.id, context.memberIds[role]),
      ).toBeNull();
    },
  );

  it.each([
    ['manager', OrganizationRole.STAFF],
    ['staff', OrganizationRole.VIEWER],
    ['viewer', OrganizationRole.MANAGER],
  ] as const)('allows an Admin to change a %s role', async (role, newRole) => {
    const context = contexts.adminLowerChanges;
    await request(server)
      .patch(`/organizations/${context.id}/members/${context.memberIds[role]}`)
      .set(headersFor('admin'))
      .send({ role: newRole })
      .expect((response) => expect([200, 204]).toContain(response.status));
    expect(
      (await getMembership(context.id, context.memberIds[role]))?.role,
    ).toBe(newRole);
  });

  it('keeps the existing restriction against Admin removal of the Owner', async () => {
    const context = contexts.adminOwnerRemoval;
    await request(server)
      .delete(`/organizations/${context.id}/members/${context.memberIds.owner}`)
      .set(headersFor('admin'))
      .expect(400);

    expect(
      (await getMembership(context.id, context.memberIds.owner))?.role,
    ).toBe(OrganizationRole.OWNER);
  });

  it('allows an Admin to demote themselves, then revokes Admin-only member actions', async () => {
    const context = contexts.adminSelf;
    const removeResponse = await request(server)
      .delete(`/organizations/${context.id}/members/${context.memberIds.admin}`)
      .set(headersFor('admin'));
    expect(removeResponse.status).toBe(403);
    expect((removeResponse.body as ErrorResponseBody).details?.code).toBe(
      'ADMIN_CANNOT_MODIFY_ADMIN',
    );

    await request(server)
      .patch(`/organizations/${context.id}/members/${context.memberIds.admin}`)
      .set(headersFor('admin'))
      .send({ role: OrganizationRole.MANAGER })
      .expect((response) => expect([200, 204]).toContain(response.status));

    expect(
      (await getMembership(context.id, context.memberIds.admin))?.role,
    ).toBe(OrganizationRole.MANAGER);

    await request(server)
      .delete(
        `/organizations/${context.id}/members/${context.memberIds.manager}`,
      )
      .set(headersFor('admin'))
      .expect(403);
  });

  it('returns the existing 404 for a target in another organization', async () => {
    const source = contexts.crossOrgSource;
    const target = contexts.crossOrgTarget;
    await request(server)
      .delete(`/organizations/${source.id}/members/${target.memberIds.viewer}`)
      .set(headersFor('owner'))
      .expect(404);

    await request(server)
      .patch(`/organizations/${source.id}/members/${target.memberIds.viewer}`)
      .set(headersFor('owner'))
      .send({ role: OrganizationRole.MANAGER })
      .expect(404);
  });

  it('blocks Admin promotion to Admin while allowing the Owner to promote', async () => {
    const context = contexts.adminPromotion;
    const response = await request(server)
      .patch(
        `/organizations/${context.id}/members/${context.memberIds.manager}`,
      )
      .set(headersFor('admin'))
      .send({ role: OrganizationRole.ADMIN })
      .expect(403);

    expect((response.body as ErrorResponseBody).details?.code).toBe(
      'ADMIN_PROMOTION_OWNER_ONLY',
    );
    expect(
      (await getMembership(context.id, context.memberIds.manager))?.role,
    ).toBe(OrganizationRole.MANAGER);
  });

  it.each([
    ['staff', 'adminSelfDemoteStaff', OrganizationRole.STAFF],
    ['viewer', 'adminSelfDemoteViewer', OrganizationRole.VIEWER],
  ] as const)(
    'allows an Admin to demote themselves to %s',
    async (_role, contextName, newRole) => {
      const context = contexts[contextName];
      await request(server)
        .patch(
          `/organizations/${context.id}/members/${context.memberIds.admin}`,
        )
        .set(headersFor('admin'))
        .send({ role: newRole })
        .expect((response) => expect([200, 204]).toContain(response.status));

      expect(
        (await getMembership(context.id, context.memberIds.admin))?.role,
      ).toBe(newRole);
    },
  );

  it('keeps Admin self-change to ADMIN or OWNER rejected', async () => {
    const context = contexts.adminSelfInvalid;

    const adminResponse = await request(server)
      .patch(`/organizations/${context.id}/members/${context.memberIds.admin}`)
      .set(headersFor('admin'))
      .send({ role: OrganizationRole.ADMIN })
      .expect(403);
    expect((adminResponse.body as ErrorResponseBody).details?.code).toBe(
      'ADMIN_PROMOTION_OWNER_ONLY',
    );

    await request(server)
      .patch(`/organizations/${context.id}/members/${context.memberIds.admin}`)
      .set(headersFor('admin'))
      .send({ role: OrganizationRole.OWNER })
      .expect(400);

    expect(
      (await getMembership(context.id, context.memberIds.admin))?.role,
    ).toBe(OrganizationRole.ADMIN);
  });

  it('serializes an Owner role change against Admin self-demotion', async () => {
    const context = contexts.selfDemotionRace;
    const [ownerResponse, adminResponse] = await Promise.all([
      request(server)
        .patch(
          `/organizations/${context.id}/members/${context.memberIds.admin}`,
        )
        .set(headersFor('owner'))
        .send({ role: OrganizationRole.MANAGER }),
      request(server)
        .patch(
          `/organizations/${context.id}/members/${context.memberIds.admin}`,
        )
        .set(headersFor('admin'))
        .send({ role: OrganizationRole.VIEWER }),
    ]);

    expect([200, 204]).toContain(ownerResponse.status);
    expect([200, 204, 403]).toContain(adminResponse.status);
    expect(ownerResponse.status).not.toBe(500);
    expect(adminResponse.status).not.toBe(500);
    const role = (await getMembership(context.id, context.memberIds.admin))
      ?.role;
    expect([OrganizationRole.MANAGER, OrganizationRole.VIEWER]).toContain(role);
  });

  it('serializes Admin removal against the Owner promoting a Manager to Admin', async () => {
    const context = contexts.race;
    const [removeResponse, promoteResponse] = await Promise.all([
      request(server)
        .delete(
          `/organizations/${context.id}/members/${context.memberIds.manager}`,
        )
        .set(headersFor('admin')),
      request(server)
        .patch(
          `/organizations/${context.id}/members/${context.memberIds.manager}`,
        )
        .set(headersFor('owner'))
        .send({ role: OrganizationRole.ADMIN }),
    ]);

    expect([204, 403]).toContain(removeResponse.status);
    expect([200, 404]).toContain(promoteResponse.status);

    const membership = await getMembership(
      context.id,
      context.memberIds.manager,
    );
    if (!membership) {
      expect(removeResponse.status).toBe(204);
      expect(promoteResponse.status).toBe(404);
    } else {
      expect(membership.role).toBe(OrganizationRole.ADMIN);
      expect(removeResponse.status).toBe(403);
      expect((removeResponse.body as ErrorResponseBody).details?.code).toBe(
        'ADMIN_CANNOT_MODIFY_ADMIN',
      );
      expect(promoteResponse.status).toBe(200);
    }
  });
});
