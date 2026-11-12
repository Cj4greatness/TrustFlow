import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OrganizationRole } from '../organization-members/entities/organization-member.entity';
import { AuditAction, AuditLog } from './entities/audit-log.entity';

export type RoleChangeOperation = 'update_role' | 'transfer_ownership';

export interface RecordRoleChangeInput {
  actorUserId: string;
  targetUserId: string;
  targetMemberId: string;
  organizationId: string;
  previousRole: OrganizationRole;
  newRole: OrganizationRole;
  operation: RoleChangeOperation;
}

@Injectable()
export class AuditLogService {
  recordRoleChange(
    manager: EntityManager,
    input: RecordRoleChangeInput,
  ): Promise<AuditLog> {
    const repository = manager.getRepository(AuditLog);
    const auditLog = repository.create({
      userId: input.actorUserId,
      organizationId: input.organizationId,
      action: AuditAction.ROLE_CHANGED,
      ipAddress: null,
      userAgent: null,
      metadata: {
        targetUserId: input.targetUserId,
        targetMemberId: input.targetMemberId,
        previousRole: input.previousRole,
        newRole: input.newRole,
        operation: input.operation,
      },
      createdAt: new Date(),
    });

    return repository.save(auditLog);
  }
}
