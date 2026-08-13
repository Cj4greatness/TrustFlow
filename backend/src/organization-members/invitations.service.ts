import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { InvitationsRepository } from './invitations.repository';
import { OrganizationMembersRepository } from './organization-members.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { UsersRepository } from '../users/users.repository';
import { EMAIL_PROVIDER } from '../email/interfaces/email-provider.interface';
import type { EmailProvider } from '../email/interfaces/email-provider.interface';
import {
  Invitation,
  InvitationChannel,
  InvitationStatus,
} from './entities/invitation.entity';
import { OrganizationRole } from './entities/organization-member.entity';

const INVITATION_EXPIRY_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly invitationsRepository: InvitationsRepository,
    private readonly organizationMembersRepository: OrganizationMembersRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly usersRepository: UsersRepository,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  /**
   * Creates a pending invitation and asks the configured
   * EmailProvider to deliver it. Only the delivery step depends on
   * the email provider — token generation, expiry, and persistence
   * are pure business logic, independent of how (or whether) the
   * invitee is ever notified.
   */
  async invite(
    organizationId: string,
    invitedEmail: string,
    role: OrganizationRole,
    invitedByUserId: string,
  ): Promise<Invitation> {
    const organization =
      await this.organizationsRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existingPending =
      await this.invitationsRepository.findPendingByOrganizationAndEmail(
        organizationId,
        invitedEmail,
      );
    if (existingPending) {
      throw new ConflictException(
        'A pending invitation already exists for this email',
      );
    }

    const inviter = await this.usersRepository.findById(invitedByUserId);
    if (!inviter) {
      throw new NotFoundException('Inviting user not found');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

    const invitation = this.invitationsRepository.create({
      organizationId,
      invitedEmail,
      role,
      token: randomUUID(),
      channel: InvitationChannel.EMAIL,
      status: InvitationStatus.PENDING,
      expiresAt,
      invitedBy: invitedByUserId,
    });
    const saved = await this.invitationsRepository.save(invitation);

    // Delivery is best-effort from the business workflow's
    // perspective: the invitation record exists and is valid
    // regardless of whether notifying the invitee succeeds. A future
    // real provider failing to send shouldn't roll back the
    // invitation itself — that's a delivery concern, not a business
    // rule violation.
    await this.emailProvider.sendInvitation({
      toEmail: invitedEmail,
      organizationName: organization.name,
      inviterName: `${inviter.firstName} ${inviter.lastName}`,
      invitationLink: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/invite/${saved.token}`,
      expiresAt,
    });

    return saved;
  }

  /**
   * Validates a token and returns the invitation if it's usable
   * (pending, not expired). Does not mutate anything — used both by
   * accept()/reject() internally and could back a "preview this
   * invitation" endpoint later without side effects.
   */
  async validateToken(token: string): Promise<Invitation> {
    const invitation = await this.invitationsRepository.findByToken(token);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new BadRequestException(
        'This invitation has already been accepted',
      );
    }

    if (invitation.status === InvitationStatus.REVOKED) {
      throw new BadRequestException('This invitation has been revoked');
    }

    if (
      invitation.status === InvitationStatus.EXPIRED ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      // Lazily transition to EXPIRED on read if the expiry has
      // passed but a background job hasn't marked it yet — keeps
      // the status accurate without requiring a scheduler for
      // Sprint 3's scope.
      if (invitation.status !== InvitationStatus.EXPIRED) {
        await this.invitationsRepository.updateStatus(
          invitation.id,
          InvitationStatus.EXPIRED,
        );
      }
      throw new BadRequestException('This invitation has expired');
    }

    return invitation;
  }

  /**
   * Accepts an invitation: creates the membership and marks the
   * invitation ACCEPTED atomically. If either step fails, neither
   * happens — matching the same transactional discipline used for
   * organization creation.
   */
  async accept(token: string, acceptingUserId: string): Promise<void> {
    const invitation = await this.validateToken(token);

    const acceptingUser = await this.usersRepository.findById(acceptingUserId);
    if (!acceptingUser) {
      throw new NotFoundException('User not found');
    }
    if (invitation.invitedEmail !== acceptingUser.email) {
      throw new ForbiddenException(
        'This invitation was not issued to your account',
      );
    }

    const existingMembership =
      await this.organizationMembersRepository.findByOrganizationAndUser(
        invitation.organizationId,
        acceptingUserId,
      );
    if (existingMembership) {
      throw new ConflictException(
        'You are already a member of this organization',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);
      const invitationRepo = manager.getRepository(Invitation);

      const membership = memberRepo.create({
        organizationId: invitation.organizationId,
        userId: acceptingUserId,
        role: invitation.role,
        joinedAt: new Date(),
        invitedBy: invitation.invitedBy,
      });
      await memberRepo.save(membership);

      await invitationRepo.update(
        { id: invitation.id },
        { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      );
    });
  }

  async reject(token: string, rejectingUserId: string): Promise<void> {
    const invitation = await this.validateToken(token);

    const rejectingUser = await this.usersRepository.findById(rejectingUserId);
    if (!rejectingUser) {
      throw new NotFoundException('User not found');
    }
    if (invitation.invitedEmail !== rejectingUser.email) {
      throw new ForbiddenException(
        'This invitation was not issued to your account',
      );
    }

    // Rejecting doesn't have a dedicated status per the CTO's
    // specified lifecycle (PENDING → ACCEPTED / EXPIRED / REVOKED) —
    // modeled as a revocation initiated by the invitee rather than
    // the inviter, since the end state (invitation no longer usable,
    // no membership created) is identical.
    await this.invitationsRepository.updateStatus(
      invitation.id,
      InvitationStatus.REVOKED,
    );
  }

  /**
   * Revokes a pending invitation before it's accepted — initiated by
   * an organization admin/owner, not the invitee (see reject() for
   * that case). Kept as a separate method despite the identical
   * resulting status, since the two are distinct business actions
   * with different callers and, eventually, different audit log
   * entries.
   */
  async revoke(organizationId: string, invitationId: string): Promise<void> {
    const invitation = await this.invitationsRepository.findById(invitationId);
    // organizationId is checked here, not just via PermissionsGuard —
    // the guard only confirms the actor has MEMBER_INVITE permission
    // within the org identified by the route, not that this specific
    // invitation belongs to that org. Same class of gap the Sprint 3
    // RBAC audit found in listMembers(), and the pattern the Customer
    // module's getOwnedXOrThrow() helpers were built to prevent.
    if (!invitation || invitation.organizationId !== organizationId) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Only pending invitations can be revoked');
    }
    await this.invitationsRepository.updateStatus(
      invitationId,
      InvitationStatus.REVOKED,
    );
  }
}
