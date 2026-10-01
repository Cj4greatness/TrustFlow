import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
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
const POSTGRES_UNIQUE_VIOLATION = '23505';

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

    let saved: Invitation;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const invitation = manager.create(Invitation, {
          organizationId,
          invitedEmail,
          role,
          token: randomUUID(),
          channel: InvitationChannel.EMAIL,
          status: InvitationStatus.PENDING,
          expiresAt,
          invitedBy: invitedByUserId,
        });
        return manager.save(Invitation, invitation);
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'A pending invitation already exists for this email',
        );
      }
      throw err;
    }

    await this.emailProvider.sendInvitation({
      toEmail: invitedEmail,
      organizationName: organization.name,
      inviterName: `${inviter.firstName} ${inviter.lastName}`,
      invitationLink: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/invite/${saved.token}`,
      expiresAt,
    });

    return saved;
  }

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

    try {
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
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(
          'You are already a member of this organization',
        );
      }
      throw err;
    }
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

    await this.invitationsRepository.updateStatus(
      invitation.id,
      InvitationStatus.REVOKED,
    );
  }

  async revoke(organizationId: string, invitationId: string): Promise<void> {
    const invitation = await this.invitationsRepository.findById(invitationId);
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
