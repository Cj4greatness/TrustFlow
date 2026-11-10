import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { User } from '../../src/users/entities/user.entity';
import { UsersRepository } from '../../src/users/users.repository';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

describe('Deleted-user access token revocation (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let usersRepository: UsersRepository;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';

  const auth = (user: TestUser) => ({
    Authorization: `Bearer ${user.accessToken}`,
    'x-test-client-ip': `deleted-user-${user.id}`,
  });

  const createUser = async (label: string): Promise<TestUser> => {
    const email = `${label}.${runId}@example.com`;
    const response = await app.get(AuthService).register({
      email,
      password,
      firstName: label,
      lastName: 'DeletedUserTest',
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
        name: `Deleted user access ${label} ${runId}`,
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

  const primeSessionFields = async (userId: string): Promise<void> => {
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
    dataSource = app.get(DataSource);
    usersRepository = app.get(UsersRepository);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('rejects a deleted user token on membership-checked and JWT-only routes', async () => {
    const owner = await createUser('route-owner');
    const deleted = await createUser('route-deleted');
    const organizationId = await createOrganization(owner, 'route-checks');
    await addMembership(organizationId, deleted.id, OrganizationRole.STAFF);

    await request(server)
      .delete(`/users/${deleted.id}`)
      .set(auth(deleted))
      .expect(204);

    await request(server)
      .get(`/organizations/${organizationId}/members`)
      .set(auth(deleted))
      .expect(401);

    await request(server)
      .get('/organizations/me')
      .set(auth(deleted))
      .expect(401);

    await request(server)
      .post('/organizations')
      .set(auth(deleted))
      .send({ name: `Must not create ${runId}` })
      .expect(401);
  });

  it('rolls back session and membership changes when the final user delete fails', async () => {
    const owner = await createUser('rollback-owner');
    const target = await createUser('rollback-target');
    const organizationId = await createOrganization(owner, 'rollback');
    await addMembership(organizationId, target.id, OrganizationRole.STAFF);
    await primeSessionFields(target.id);

    const userRepository = dataSource.getRepository(User);
    const membershipRepository = dataSource.getRepository(OrganizationMember);
    const userBefore = await userRepository.findOne({
      where: { id: target.id },
    });
    const membershipBefore = await membershipRepository.findOne({
      where: { organizationId, userId: target.id },
    });
    const softDeleteSpy = jest
      .spyOn(usersRepository, 'softDelete')
      .mockImplementationOnce(() =>
        Promise.reject(new Error('forced final deletion failure')),
      );

    try {
      await request(server)
        .delete(`/users/${target.id}`)
        .set(auth(target))
        .expect(500);
    } finally {
      softDeleteSpy.mockRestore();
    }

    const userAfter = await userRepository.findOne({
      where: { id: target.id },
      withDeleted: true,
    });
    expect(userAfter?.deletedAt).toBeNull();
    expect({
      refreshTokenHash: userAfter?.refreshTokenHash,
      previousRefreshTokenHash: userAfter?.previousRefreshTokenHash,
      refreshTokenRotatedAt: userAfter?.refreshTokenRotatedAt,
      displacedRefreshTokenHash: userAfter?.displacedRefreshTokenHash,
      displacedAt: userAfter?.displacedAt,
    }).toEqual({
      refreshTokenHash: userBefore?.refreshTokenHash,
      previousRefreshTokenHash: userBefore?.previousRefreshTokenHash,
      refreshTokenRotatedAt: userBefore?.refreshTokenRotatedAt,
      displacedRefreshTokenHash: userBefore?.displacedRefreshTokenHash,
      displacedAt: userBefore?.displacedAt,
    });

    const membershipAfter = await membershipRepository.findOne({
      where: { organizationId, userId: target.id },
      withDeleted: true,
    });
    expect(membershipAfter).toMatchObject({
      id: membershipBefore?.id,
      organizationId,
      userId: target.id,
      role: OrganizationRole.STAFF,
      deletedAt: null,
    });
  });

  it('serializes deletion against an Owner removing the same member', async () => {
    const owner = await createUser('race-owner');
    const target = await createUser('race-target');
    const organizationId = await createOrganization(owner, 'membership-race');
    const membership = await addMembership(
      organizationId,
      target.id,
      OrganizationRole.STAFF,
    );

    const [deleteResponse, removeResponse] = await Promise.all([
      request(server).delete(`/users/${target.id}`).set(auth(target)),
      request(server)
        .delete(`/organizations/${organizationId}/members/${membership.id}`)
        .set(auth(owner)),
    ]);

    expect(deleteResponse.status).toBe(204);
    expect([204, 404]).toContain(removeResponse.status);

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
    expect(
      (membersResponse.body as Array<{ user: { id: string } }>).some(
        (member) => member.user.id === target.id,
      ),
    ).toBe(false);
  });

  it('returns 401 on a repeated DELETE with the old access token and leaves data unchanged', async () => {
    const owner = await createUser('repeat-owner');
    const target = await createUser('repeat-target');
    const organizationId = await createOrganization(owner, 'repeat-delete');
    await addMembership(organizationId, target.id, OrganizationRole.STAFF);
    await primeSessionFields(target.id);

    await request(server)
      .delete(`/users/${target.id}`)
      .set(auth(target))
      .expect(204);

    const userRepository = dataSource.getRepository(User);
    const membershipRepository = dataSource.getRepository(OrganizationMember);
    const userBeforeRepeat = await userRepository.findOne({
      where: { id: target.id },
      withDeleted: true,
    });
    const membershipBeforeRepeat = await membershipRepository.findOne({
      where: { organizationId, userId: target.id },
      withDeleted: true,
    });

    await request(server)
      .delete(`/users/${target.id}`)
      .set(auth(target))
      .expect(401);

    const userAfterRepeat = await userRepository.findOne({
      where: { id: target.id },
      withDeleted: true,
    });
    const membershipAfterRepeat = await membershipRepository.findOne({
      where: { organizationId, userId: target.id },
      withDeleted: true,
    });
    expect(userAfterRepeat?.deletedAt).toEqual(userBeforeRepeat?.deletedAt);
    expect(userAfterRepeat?.refreshTokenHash).toBe(
      userBeforeRepeat?.refreshTokenHash,
    );
    expect(userAfterRepeat?.previousRefreshTokenHash).toBe(
      userBeforeRepeat?.previousRefreshTokenHash,
    );
    expect(userAfterRepeat?.refreshTokenRotatedAt).toEqual(
      userBeforeRepeat?.refreshTokenRotatedAt,
    );
    expect(userAfterRepeat?.displacedRefreshTokenHash).toBe(
      userBeforeRepeat?.displacedRefreshTokenHash,
    );
    expect(userAfterRepeat?.displacedAt).toEqual(userBeforeRepeat?.displacedAt);
    expect(membershipAfterRepeat).toMatchObject({
      id: membershipBeforeRepeat?.id,
      role: OrganizationRole.STAFF,
      deletedAt: membershipBeforeRepeat?.deletedAt,
    });
  });
});
