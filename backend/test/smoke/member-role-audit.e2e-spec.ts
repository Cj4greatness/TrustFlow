import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuditLogService } from '../../src/audit/audit-log.service';
import {
  AuditAction,
  AuditLog,
} from '../../src/audit/entities/audit-log.entity';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import {
  OrganizationMember,
  OrganizationRole,
} from '../../src/organization-members/entities/organization-member.entity';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { User, UserStatus } from '../../src/users/entities/user.entity';

interface LoginTokens {
  userId: string;
  accessToken: string;
}

interface AuditContext {
  organizationId: string;
  owner: LoginTokens;
  admin: LoginTokens;
  admin2: LoginTokens;
  manager: LoginTokens;
  staff: LoginTokens;
  viewer: LoginTokens;
  ownerMemberId: string;
  adminMemberId: string;
  admin2MemberId: string;
  managerMemberId: string;
  staffMemberId: string;
  viewerMemberId: string;
}

interface ErrorResponseBody {
  details?: { code?: string };
}

describe('Member role change audit (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let auditRepository: Repository<AuditLog>;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';
  let contextIndex = 0;

  const headers = (user: LoginTokens) => ({
    Authorization: 'Bearer ' + user.accessToken,
  });

  const createUser = async (label: string): Promise<LoginTokens> => {
    const result = await app.get(AuthService).register({
      email: `role-audit-${label}.${runId}@example.com`,
      password,
      firstName: 'RoleAudit',
      lastName: label,
    });
    return { userId: result.user.id, accessToken: result.accessToken };
  };

  const addMembership = async (
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<string> => {
    const repository = dataSource.getRepository(OrganizationMember);
    const member = repository.create({
      organizationId,
      userId,
      role,
      joinedAt: new Date(),
      invitedBy: null,
    });
    return (await repository.save(member)).id;
  };

  const createContext = async (): Promise<AuditContext> => {
    contextIndex += 1;
    const label = `${contextIndex}`;
    const owner = await createUser(`owner-${label}`);
    const admin = await createUser(`admin-${label}`);
    const admin2 = await createUser(`admin2-${label}`);
    const manager = await createUser(`manager-${label}`);
    const staff = await createUser(`staff-${label}`);
    const viewer = await createUser(`viewer-${label}`);
    const organization = await app
      .get(OrganizationsService)
      .createWithOwner({ name: `Role audit ${runId} ${label}` }, owner.userId);

    return {
      organizationId: organization.id,
      owner,
      admin,
      admin2,
      manager,
      staff,
      viewer,
      ownerMemberId: (
        await dataSource.getRepository(OrganizationMember).findOneByOrFail({
          organizationId: organization.id,
          userId: owner.userId,
        })
      ).id,
      adminMemberId: await addMembership(
        organization.id,
        admin.userId,
        OrganizationRole.ADMIN,
      ),
      admin2MemberId: await addMembership(
        organization.id,
        admin2.userId,
        OrganizationRole.ADMIN,
      ),
      managerMemberId: await addMembership(
        organization.id,
        manager.userId,
        OrganizationRole.MANAGER,
      ),
      staffMemberId: await addMembership(
        organization.id,
        staff.userId,
        OrganizationRole.STAFF,
      ),
      viewerMemberId: await addMembership(
        organization.id,
        viewer.userId,
        OrganizationRole.VIEWER,
      ),
    };
  };

  const roleChange = (
    context: AuditContext,
    actor: LoginTokens,
    targetMemberId: string,
    role: OrganizationRole,
  ) =>
    request(server)
      .patch(
        `/organizations/${context.organizationId}/members/${targetMemberId}`,
      )
      .set(headers(actor))
      .send({ role });

  const transfer = (
    context: AuditContext,
    actor: LoginTokens,
    targetMemberId: string,
  ) =>
    request(server)
      .post(
        `/organizations/${context.organizationId}/members/transfer-ownership`,
      )
      .set(headers(actor))
      .send({ newOwnerMemberId: targetMemberId });

  const logsFor = (organizationId: string) =>
    auditRepository.find({
      where: { organizationId, action: AuditAction.ROLE_CHANGED },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

  const expectNoLogs = async (organizationId: string) => {
    expect(await logsFor(organizationId)).toHaveLength(0);
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
    auditRepository = dataSource.getRepository(AuditLog);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('records one role.changed row with actor, target, organization, roles, and timestamp', async () => {
    const context = await createContext();

    const response = await roleChange(
      context,
      context.owner,
      context.managerMemberId,
      OrganizationRole.STAFF,
    );
    expect([200, 204]).toContain(response.status);

    const logs = await logsFor(context.organizationId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userId: context.owner.userId,
      organizationId: context.organizationId,
      action: AuditAction.ROLE_CHANGED,
      ipAddress: null,
      userAgent: null,
      metadata: {
        targetUserId: context.manager.userId,
        targetMemberId: context.managerMemberId,
        previousRole: OrganizationRole.MANAGER,
        newRole: OrganizationRole.STAFF,
        operation: 'update_role',
      },
    });
    expect(logs[0].createdAt).toBeInstanceOf(Date);
  });

  it('records an Admin self-demotion with the same actor and target user', async () => {
    const context = await createContext();

    const response = await roleChange(
      context,
      context.admin,
      context.adminMemberId,
      OrganizationRole.STAFF,
    );
    expect([200, 204]).toContain(response.status);

    const logs = await logsFor(context.organizationId);
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(context.admin.userId);
    expect(logs[0].metadata).toMatchObject({
      targetUserId: context.admin.userId,
      previousRole: OrganizationRole.ADMIN,
      newRole: OrganizationRole.STAFF,
      operation: 'update_role',
    });
  });

  it('records an Owner promotion to Admin', async () => {
    const context = await createContext();

    const response = await roleChange(
      context,
      context.owner,
      context.managerMemberId,
      OrganizationRole.ADMIN,
    );
    expect([200, 204]).toContain(response.status);

    const logs = await logsFor(context.organizationId);
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({
      targetUserId: context.manager.userId,
      previousRole: OrganizationRole.MANAGER,
      newRole: OrganizationRole.ADMIN,
      operation: 'update_role',
    });
  });

  it('records both role changes for ownership transfer with the current Owner as actor', async () => {
    const context = await createContext();

    const response = await transfer(
      context,
      context.owner,
      context.managerMemberId,
    );
    expect(response.status).toBe(204);

    const logs = await logsFor(context.organizationId);
    expect(logs).toHaveLength(2);
    expect(logs.every((log) => log.userId === context.owner.userId)).toBe(true);
    expect(
      logs.map((log) => ({
        targetUserId: log.metadata?.targetUserId,
        targetMemberId: log.metadata?.targetMemberId,
        previousRole: log.metadata?.previousRole,
        newRole: log.metadata?.newRole,
        operation: log.metadata?.operation,
        organizationId: log.organizationId,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          targetUserId: context.owner.userId,
          targetMemberId: context.ownerMemberId,
          previousRole: OrganizationRole.OWNER,
          newRole: OrganizationRole.ADMIN,
          operation: 'transfer_ownership',
          organizationId: context.organizationId,
        },
        {
          targetUserId: context.manager.userId,
          targetMemberId: context.managerMemberId,
          previousRole: OrganizationRole.MANAGER,
          newRole: OrganizationRole.OWNER,
          operation: 'transfer_ownership',
          organizationId: context.organizationId,
        },
      ]),
    );
  });

  it('writes no audit rows for forbidden, Admin-protection, Admin-promotion, and same-role requests', async () => {
    const forbiddenContext = await createContext();
    const forbidden = await roleChange(
      forbiddenContext,
      forbiddenContext.viewer,
      forbiddenContext.managerMemberId,
      OrganizationRole.MANAGER,
    );
    expect(forbidden.status).toBe(403);
    await expectNoLogs(forbiddenContext.organizationId);

    const adminTargetContext = await createContext();
    const adminChange = await roleChange(
      adminTargetContext,
      adminTargetContext.admin,
      adminTargetContext.admin2MemberId,
      OrganizationRole.STAFF,
    );
    expect(adminChange.status).toBe(403);
    expect((adminChange.body as ErrorResponseBody).details?.code).toBe(
      'ADMIN_CANNOT_MODIFY_ADMIN',
    );
    await expectNoLogs(adminTargetContext.organizationId);

    const promotionContext = await createContext();
    const promotion = await roleChange(
      promotionContext,
      promotionContext.admin,
      promotionContext.managerMemberId,
      OrganizationRole.ADMIN,
    );
    expect(promotion.status).toBe(403);
    expect((promotion.body as ErrorResponseBody).details?.code).toBe(
      'ADMIN_PROMOTION_OWNER_ONLY',
    );
    await expectNoLogs(promotionContext.organizationId);

    const sameRoleContext = await createContext();
    const sameRole = await roleChange(
      sameRoleContext,
      sameRoleContext.owner,
      sameRoleContext.managerMemberId,
      OrganizationRole.MANAGER,
    );
    expect([200, 204]).toContain(sameRole.status);
    await expectNoLogs(sameRoleContext.organizationId);
  }, 30000);

  it('writes no audit rows for last-Owner removal, inactive transfer target, inconsistent Owners, or cross-organization target', async () => {
    const lastOwnerContext = await createContext();
    const removeOwner = await request(server)
      .delete(
        `/organizations/${lastOwnerContext.organizationId}/members/${lastOwnerContext.ownerMemberId}`,
      )
      .set(headers(lastOwnerContext.owner));
    expect(removeOwner.status).toBe(400);
    expect((removeOwner.body as ErrorResponseBody).details?.code).toBe(
      'LAST_OWNER_CANNOT_BE_REMOVED',
    );
    await expectNoLogs(lastOwnerContext.organizationId);

    const inactiveContext = await createContext();
    await dataSource
      .getRepository(User)
      .update(
        { id: inactiveContext.manager.userId },
        { status: UserStatus.SUSPENDED },
      );
    const inactiveTransfer = await transfer(
      inactiveContext,
      inactiveContext.owner,
      inactiveContext.managerMemberId,
    );
    expect(inactiveTransfer.status).toBe(400);
    expect((inactiveTransfer.body as ErrorResponseBody).details?.code).toBe(
      'OWNERSHIP_TARGET_INACTIVE',
    );
    await expectNoLogs(inactiveContext.organizationId);

    const inconsistentContext = await createContext();
    await dataSource
      .getRepository(OrganizationMember)
      .update(
        { id: inconsistentContext.managerMemberId },
        { role: OrganizationRole.OWNER },
      );
    const inconsistentTransfer = await transfer(
      inconsistentContext,
      inconsistentContext.owner,
      inconsistentContext.staffMemberId,
    );
    expect(inconsistentTransfer.status).toBe(409);
    expect((inconsistentTransfer.body as ErrorResponseBody).details?.code).toBe(
      'OWNERSHIP_STATE_INCONSISTENT',
    );
    await expectNoLogs(inconsistentContext.organizationId);

    const sourceContext = await createContext();
    const otherOwner = await createUser('cross-org-owner');
    const otherOrganization = await app
      .get(OrganizationsService)
      .createWithOwner(
        { name: `Role audit cross-org ${runId}` },
        otherOwner.userId,
      );
    const foreignTargetUser = await createUser('cross-org-target');
    const foreignMemberId = await addMembership(
      otherOrganization.id,
      foreignTargetUser.userId,
      OrganizationRole.MANAGER,
    );
    const crossOrg = await roleChange(
      sourceContext,
      sourceContext.owner,
      foreignMemberId,
      OrganizationRole.STAFF,
    );
    expect(crossOrg.status).toBe(404);
    await expectNoLogs(sourceContext.organizationId);
    await expectNoLogs(otherOrganization.id);
  }, 30000);

  it('rolls back a role change if its audit insert fails', async () => {
    const context = await createContext();
    const auditService = app.get(AuditLogService);
    const spy = jest
      .spyOn(auditService, 'recordRoleChange')
      .mockRejectedValueOnce(new Error('simulated audit failure'));

    try {
      const response = await roleChange(
        context,
        context.owner,
        context.managerMemberId,
        OrganizationRole.STAFF,
      );
      expect(response.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    const membership = await dataSource
      .getRepository(OrganizationMember)
      .findOneByOrFail({ id: context.managerMemberId });
    expect(membership.role).toBe(OrganizationRole.MANAGER);
    await expectNoLogs(context.organizationId);
  });

  it('rolls back both transfer role changes if either audit insert fails', async () => {
    const context = await createContext();
    const auditService = app.get(AuditLogService);
    const spy = jest
      .spyOn(auditService, 'recordRoleChange')
      .mockRejectedValueOnce(new Error('simulated audit failure'));

    try {
      const response = await transfer(
        context,
        context.owner,
        context.managerMemberId,
      );
      expect(response.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    const memberships = await dataSource
      .getRepository(OrganizationMember)
      .findBy([{ id: context.ownerMemberId }, { id: context.managerMemberId }]);
    expect(
      memberships.find((member) => member.id === context.ownerMemberId)?.role,
    ).toBe(OrganizationRole.OWNER);
    expect(
      memberships.find((member) => member.id === context.managerMemberId)?.role,
    ).toBe(OrganizationRole.MANAGER);
    await expectNoLogs(context.organizationId);
  });

  it('writes one audit row for each of two serialized role changes to the same member', async () => {
    const context = await createContext();

    const [first, second] = await Promise.all([
      roleChange(
        context,
        context.owner,
        context.managerMemberId,
        OrganizationRole.STAFF,
      ),
      roleChange(
        context,
        context.owner,
        context.managerMemberId,
        OrganizationRole.VIEWER,
      ),
    ]);
    expect([200, 204]).toContain(first.status);
    expect([200, 204]).toContain(second.status);

    const logs = await logsFor(context.organizationId);
    expect(logs).toHaveLength(2);
    const rolePairs = logs
      .map(
        ({ metadata }) =>
          `${String(metadata?.previousRole)}->${String(metadata?.newRole)}`,
      )
      .sort();
    expect([
      ['manager->staff', 'staff->viewer'],
      ['manager->viewer', 'viewer->staff'],
    ]).toContainEqual(rolePairs);
    expect(
      logs.every((log) => log.organizationId === context.organizationId),
    ).toBe(true);
  });
});
