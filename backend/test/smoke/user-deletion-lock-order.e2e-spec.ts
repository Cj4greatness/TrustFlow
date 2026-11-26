import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { Organization } from '../../src/organizations/entities/organization.entity';
import { User } from '../../src/users/entities/user.entity';

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

interface OrganizationResponse {
  id: string;
}

interface InvitationResponse {
  token: string;
}

describe('User deletion lock ordering (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';

  const auth = (user: TestUser) => ({
    Authorization: `Bearer ${user.accessToken}`,
    'x-test-client-ip': `deletion-lock-${user.id}`,
  });

  const createUser = async (label: string): Promise<TestUser> => {
    const email = `${label}.${runId}@example.com`;
    const response = await app.get(AuthService).register({
      email,
      password,
      firstName: label,
      lastName: 'LockTest',
    });
    return { id: response.user.id, email, accessToken: response.accessToken };
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
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('serializes organization creation against deletion for fresh users', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const user = await createUser(`org-race-${attempt}`);
      const [createResponse, deleteResponse] = await Promise.all([
        request(server)
          .post('/organizations')
          .set(auth(user))
          .send({
            name: `Deletion lock race ${runId} ${attempt}`,
            country: 'Nigeria',
            currency: 'NGN',
          }),
        request(server).delete(`/users/${user.id}`).set(auth(user)),
      ]);

      expect(createResponse.status).not.toBe(500);
      expect(deleteResponse.status).not.toBe(500);

      const storedUser = await dataSource.getRepository(User).findOne({
        where: { id: user.id },
        withDeleted: true,
      });
      const memberships = await dataSource
        .getRepository(OrganizationMember)
        .find({ where: { userId: user.id }, withDeleted: true });
      const activeMemberships = memberships.filter(
        (membership) => membership.deletedAt === null,
      );

      if (storedUser?.deletedAt) {
        expect(deleteResponse.status).toBe(204);
        expect(createResponse.status).toBe(401);
        expect(activeMemberships).toHaveLength(0);
      } else {
        expect(storedUser).not.toBeNull();
        expect(deleteResponse.status).toBe(400);
        expect(createResponse.status).toBe(201);
        const createdOrganization = createResponse.body as OrganizationResponse;
        const organization = await dataSource
          .getRepository(Organization)
          .findOneBy({ id: createdOrganization.id });
        expect(organization).not.toBeNull();
        expect(activeMemberships).toHaveLength(1);
        expect(activeMemberships[0].role).toBe(OrganizationRole.OWNER);
        expect(activeMemberships[0].organizationId).toBe(organization?.id);
      }
    }
  });

  it('serializes invitation acceptance against deletion', async () => {
    const owner = await createUser('invite-race-owner');
    const invitee = await createUser('invite-race-target');
    const organizationResponse = await request(server)
      .post('/organizations')
      .set(auth(owner))
      .send({
        name: `Invitation deletion race ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    const organization = organizationResponse.body as OrganizationResponse;

    const invitationResponse = await request(server)
      .post(`/organizations/${organization.id}/invitations`)
      .set(auth(owner))
      .send({ email: invitee.email, role: 'viewer' })
      .expect(201);
    const invitation = invitationResponse.body as InvitationResponse;

    const [acceptResponse, deleteResponse] = await Promise.all([
      request(server)
        .post(`/organizations/invitations/${invitation.token}/accept`)
        .set(auth(invitee)),
      request(server).delete(`/users/${invitee.id}`).set(auth(invitee)),
    ]);

    expect(acceptResponse.status).not.toBe(500);
    expect(deleteResponse.status).not.toBe(500);
    expect([204, 401]).toContain(acceptResponse.status);
    expect(deleteResponse.status).toBe(204);

    const storedUser = await dataSource.getRepository(User).findOne({
      where: { id: invitee.id },
      withDeleted: true,
    });
    const memberships = await dataSource
      .getRepository(OrganizationMember)
      .find({ where: { userId: invitee.id }, withDeleted: true });
    const activeMembership = memberships.find(
      (membership) => membership.deletedAt === null,
    );

    expect(
      (storedUser?.deletedAt === null && activeMembership !== undefined) ||
        (storedUser?.deletedAt instanceof Date &&
          activeMembership === undefined),
    ).toBe(true);
  });

  it('still supports a single organization creation and invitation acceptance', async () => {
    const owner = await createUser('single-flow-owner');
    const invitee = await createUser('single-flow-invitee');

    const organizationResponse = await request(server)
      .post('/organizations')
      .set(auth(owner))
      .send({
        name: `Single flow organization ${runId}`,
        country: 'Nigeria',
        currency: 'NGN',
      })
      .expect(201);
    const organization = organizationResponse.body as OrganizationResponse;

    const invitationResponse = await request(server)
      .post(`/organizations/${organization.id}/invitations`)
      .set(auth(owner))
      .send({ email: invitee.email, role: 'viewer' })
      .expect(201);
    const invitation = invitationResponse.body as InvitationResponse;

    await request(server)
      .post(`/organizations/invitations/${invitation.token}/accept`)
      .set(auth(invitee))
      .expect(204);

    const membership = await dataSource
      .getRepository(OrganizationMember)
      .findOne({
        where: { organizationId: organization.id, userId: invitee.id },
      });
    expect(membership?.role).toBe(OrganizationRole.VIEWER);
  });
});
