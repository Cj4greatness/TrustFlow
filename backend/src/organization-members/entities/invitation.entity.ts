import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { OrganizationRole } from './organization-member.entity';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/**
 * The channel an invitation was (or will be) delivered through.
 * Deliberately modeled as its own field rather than assuming email —
 * per CTO direction, TrustFlow will support WhatsApp, SMS, QR code,
 * and shareable-link invitations later. Adding a new channel means
 * adding an enum value and a new delivery provider, not restructuring
 * this entity.
 */
export enum InvitationChannel {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  LINK = 'link',
}

/**
 * Invitation
 *
 * Represents an offer to join an organization at a given role,
 * independent of how it's delivered (see InvitationChannel) or
 * whether the invitee already has a TrustFlow account (invitedEmail
 * is stored directly rather than requiring an existing User).
 *
 * Records are never deleted — per CTO directive, invitations are
 * part of audit history. Status transitions (PENDING → ACCEPTED /
 * EXPIRED / REVOKED) are the only way the lifecycle progresses.
 */
@Entity('invitations')
@Index(['token'], { unique: true })
@Index(['organizationId'])
@Index(['invitedEmail'])
export class Invitation extends BaseEntity {
  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'varchar', length: 255, name: 'invited_email' })
  invitedEmail: string;

  @Column({
    type: 'enum',
    enum: OrganizationRole,
    default: OrganizationRole.STAFF,
  })
  role: OrganizationRole;

  @Column({ type: 'uuid', unique: true })
  token: string;

  @Column({
    type: 'enum',
    enum: InvitationChannel,
    default: InvitationChannel.EMAIL,
  })
  channel: InvitationChannel;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
  })
  status: InvitationStatus;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'uuid', name: 'invited_by' })
  invitedBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_by' })
  inviter: User;

  @Column({ type: 'timestamptz', nullable: true, name: 'accepted_at' })
  acceptedAt: Date | null;
}
