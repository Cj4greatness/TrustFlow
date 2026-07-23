import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Common audit action types. Not exhaustive — new actions can be
 * added as new modules are built. Kept as a string enum rather than
 * a free-form string so the set of recorded actions stays
 * discoverable and consistent across the codebase.
 */
export enum AuditAction {
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_REGISTERED = 'user.registered',
  ORGANIZATION_CREATED = 'organization.created',
  ROLE_CHANGED = 'role.changed',
  PASSWORD_RESET = 'password.reset',
  INVITATION_SENT = 'invitation.sent',
  INVITATION_ACCEPTED = 'invitation.accepted',
}

/**
 * AuditLog
 *
 * An immutable record of a significant action taken in the system.
 * Audit logs are append-only — there is no update/delete path for
 * this entity anywhere in the application, and it deliberately does
 * not extend BaseEntity (no soft-delete semantics make sense for an
 * audit trail; a "deleted" audit record would defeat its purpose).
 *
 * userId and organizationId are both nullable: some actions
 * (e.g. a failed login with an unrecognized email) may not resolve
 * to a known user, and some actions may not yet be scoped to an
 * organization (e.g. account registration, before the org exists).
 */
@Entity('audit_logs')
@Index(['userId'])
@Index(['organizationId'])
@Index(['action'])
export class AuditLog {
  @Column({ type: 'uuid', primary: true, generated: 'uuid' })
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true, name: 'organization_id' })
  organizationId: string | null;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  userAgent: string | null;

  /**
   * Freeform structured context specific to the action (e.g. for
   * ROLE_CHANGED: { previousRole, newRole }). Kept as jsonb rather
   * than a rigid schema since different actions need different
   * metadata shapes.
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
