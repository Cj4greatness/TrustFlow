import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import {
  OrganizationMember,
  OrganizationRole,
} from '../../src/organization-members/entities/organization-member.entity';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { User } from '../../src/users/entities/user.entity';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

interface ErrorResponseBody {
  details?: {
    code?: string;
  };
}

describe('User deletion revokes sessions and memberships (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';

  const auth = (user: TestUser) => ({
    Authorization: `Bearer ${user.accessToken}`,
    'x-test-client-ip': `user-deletion-${user.id}`,
  });

  const createUser = async (label: string): Promise<TestUser> => {
    const email = `${label}.${runId}@example.com`;
    const response = await app.get(AuthService).register({
      email,
      password,
      firstName: label,
      lastName: 'DeletionTest',
    });
    return {
      id: response.user.id,
      email,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    };
  };

  const createOrganization = async (
    owner: TestUser,
    label: string,
  ): Promise<string> => {
    const organization = await app.get(OrganizationsService).createWithOwner(
      {
        name: `User deletion ${label} ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      },
      owner.id,
    );
    return organization.id;
  };

  const addMembership = async (
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMember> => {
    const repository = dataSource.getRepository(OrganizationMember);
    return repository.save(
      repository.create({
        organizationId,
        userId,
        role,
        joinedAt: new Date(),
        invitedBy: null,
      }),
    );
  };

  const primeAdditionalSessionFields = async (
    userId: string,
  ): Promise<void> => {
    await dataSource.getRepository(User).update(
      { id: userId },
      {
        previousRefreshTokenHash: `previous-${userId}`,
        refreshTokenRotatedAt: new Date('2026-01-01T00:00:00.000Z'),
        displacedRefreshTokenHash: `displaced-${userId}`,
        displacedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    );
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer();
    dataSource = app.get(DataSource);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('revokes sessions and soft-deletes memberships across multiple organizations', async () => {
    const owner = await createUser('multi-org-owner');
    const member = await createUser('multi-org-member');
    const organizationIds = [
      await createOrganization(owner, 'first'),
      await createOrganization(owner, 'second'),
    ];
    for (const organizationId of organizationIds) {
      await addMembership(organizationId, member.id, OrganizationRole.STAFF);
    }
    await primeAdditionalSessionFields(member.id);

    await request(server)
      .delete(`/users/${member.id}`)
      .set(auth(member))
      .expect(204);

    await request(server)
      .post('/auth/refresh')
      .set('x-test-client-ip', `user-deletion-${member.id}`)
      .send({ refreshToken: member.refreshToken })
      .expect(401);

    await request(server)
      .post('/auth/login')
      .set('x-test-client-ip', `user-deletion-${member.id}`)
      .send({ email: member.email, password })
      .expect(401);

    await request(server)
      .get(`/organizations/${organizationIds[0]}/members`)
      .set(auth(member))
      .expect(401);

    const deletedUser = await dataSource.getRepository(User).findOne({
      where: { id: member.id },
      withDeleted: true,
    });
    expect(deletedUser?.deletedAt).toBeInstanceOf(Date);
    expect({
      refreshTokenHash: deletedUser?.refreshTokenHash,
      previousRefreshTokenHash: deletedUser?.previousRefreshTokenHash,
      refreshTokenRotatedAt: deletedUser?.refreshTokenRotatedAt,
      displacedRefreshTokenHash: deletedUser?.displacedRefreshTokenHash,
      displacedAt: deletedUser?.displacedAt,
    }).toEqual({
      refreshTokenHash: null,
      previousRefreshTokenHash: null,
      refreshTokenRotatedAt: null,
      displacedRefreshTokenHash: null,
      displacedAt: null,
    });

    const membershipRepository = dataSource.getRepository(OrganizationMember);
    const memberships = await membershipRepository.find({
      where: { userId: member.id },
      withDeleted: true,
    });
    expect(memberships).toHaveLength(2);
    expect(memberships.every((membership) => membership.deletedAt)).toBe(true);

    for (const organizationId of organizationIds) {
      const response = await request(server)
        .get(`/organizations/${organizationId}/members`)
        .set(auth(owner))
        .expect(200);
      expect(
        (response.body as Array<{ user: { id: string } }>).some(
          (listedMember) => listedMember.user.id === member.id,
        ),
      ).toBe(false);
    }
  });

  it('rejects a sole Owner deletion without changing user, membership, or session data', async () => {
    const owner = await createUser('sole-owner');
    const organizationId = await createOrganization(owner, 'sole-owner');
    await primeAdditionalSessionFields(owner.id);
    const userRepository = dataSource.getRepository(User);
    const membershipRepository = dataSource.getRepository(OrganizationMember);
    const sessionBefore = await userRepository.findOne({
      where: { id: owner.id },
    });

    const response = await request(server)
      .delete(`/users/${owner.id}`)
      .set(auth(owner));
    expect(response.status).toBe(400);
    expect((response.body as ErrorResponseBody).details?.code).toBe(
      'LAST_OWNER_CANNOT_BE_REMOVED',
    );

    const userAfter = await userRepository.findOne({
      where: { id: owner.id },
    });
    expect(userAfter?.deletedAt).toBeNull();
    expect({
      refreshTokenHash: userAfter?.refreshTokenHash,
      previousRefreshTokenHash: userAfter?.previousRefreshTokenHash,
      refreshTokenRotatedAt: userAfter?.refreshTokenRotatedAt,
      displacedRefreshTokenHash: userAfter?.displacedRefreshTokenHash,
      displacedAt: userAfter?.displacedAt,
    }).toEqual({
      refreshTokenHash: sessionBefore?.refreshTokenHash,
      previousRefreshTokenHash: sessionBefore?.previousRefreshTokenHash,
      refreshTokenRotatedAt: sessionBefore?.refreshTokenRotatedAt,
      displacedRefreshTokenHash: sessionBefore?.displacedRefreshTokenHash,
      displacedAt: sessionBefore?.displacedAt,
    });
    const memberships = await membershipRepository.find({
      where: { userId: owner.id, organizationId },
      withDeleted: true,
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].deletedAt).toBeNull();
  });

  it('allows an Owner to delete themselves after transferring ownership', async () => {
    const owner = await createUser('transferring-owner');
    const newOwner = await createUser('replacement-owner');
    const organizationId = await createOrganization(owner, 'transfer');
    const membership = await addMembership(
      organizationId,
      newOwner.id,
      OrganizationRole.STAFF,
    );

    await request(server)
      .post(`/organizations/${organizationId}/members/transfer-ownership`)
      .set(auth(owner))
      .send({ newOwnerMemberId: membership.id })
      .expect(204);

    await request(server)
      .delete(`/users/${owner.id}`)
      .set(auth(owner))
      .expect(204);

    const listedMembers = await request(server)
      .get(`/organizations/${organizationId}/members`)
      .set(auth(newOwner))
      .expect(200);
    expect(
      (listedMembers.body as Array<{ user: { id: string } }>).some(
        (listedMember) => listedMember.user.id === owner.id,
      ),
    ).toBe(false);
    expect(
      (
        listedMembers.body as Array<{ user: { id: string }; role: string }>
      ).find((listedMember) => listedMember.user.id === newOwner.id)?.role,
    ).toBe(OrganizationRole.OWNER);
  });

  it('serializes ownership transfer against deletion of the transfer target', async () => {
    const owner = await createUser('racing-owner');
    const target = await createUser('racing-target');
    const organizationId = await createOrganization(owner, 'owner-race');
    const membership = await addMembership(
      organizationId,
      target.id,
      OrganizationRole.STAFF,
    );

    const [transferResponse, deleteResponse] = await Promise.all([
      request(server)
        .post(`/organizations/${organizationId}/members/transfer-ownership`)
        .set(auth(owner))
        .send({ newOwnerMemberId: membership.id }),
      request(server).delete(`/users/${target.id}`).set(auth(target)),
    ]);

    expect([204, 404]).toContain(transferResponse.status);
    expect([204, 400]).toContain(deleteResponse.status);
    const membersResponse = await request(server)
      .get(`/organizations/${organizationId}/members`)
      .set(auth(owner))
      .expect(200);
    const activeOwners = (
      membersResponse.body as Array<{
        role: string;
        user: { status: string };
      }>
    ).filter(
      (member) => member.role === 'owner' && member.user.status === 'active',
    );
    expect(activeOwners).toHaveLength(1);
  });
});
