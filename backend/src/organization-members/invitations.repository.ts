import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation, InvitationStatus } from './entities/invitation.entity';

@Injectable()
export class InvitationsRepository {
  constructor(
    @InjectRepository(Invitation)
    private readonly repository: Repository<Invitation>,
  ) {}

  create(data: Partial<Invitation>): Invitation {
    return this.repository.create(data);
  }

  save(invitation: Invitation): Promise<Invitation> {
    return this.repository.save(invitation);
  }

  findByToken(token: string): Promise<Invitation | null> {
    return this.repository.findOne({
      where: { token },
      relations: { organization: true, inviter: true },
    });
  }

  findById(id: string): Promise<Invitation | null> {
    return this.repository.findOne({ where: { id } });
  }

  findPendingByOrganizationAndEmail(
    organizationId: string,
    invitedEmail: string,
  ): Promise<Invitation | null> {
    return this.repository.findOne({
      where: {
        organizationId,
        invitedEmail,
        status: InvitationStatus.PENDING,
      },
    });
  }

  findByOrganization(organizationId: string): Promise<Invitation[]> {
    return this.repository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(
    id: string,
    status: InvitationStatus,
    extra?: Partial<Invitation>,
  ): Promise<void> {
    await this.repository.update({ id }, { status, ...extra });
  }
}
