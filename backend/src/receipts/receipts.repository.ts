import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Receipt } from './entities/receipt.entity';

/**
 * ReceiptsRepository
 *
 * Matches InvoicesRepository/PaymentsRepository's shape — no shared
 * base-repository class exists in this codebase (confirmed via grep
 * during Sprint 5's CTO review, Gate 6).
 */
@Injectable()
export class ReceiptsRepository {
  constructor(
    @InjectRepository(Receipt)
    private readonly repo: Repository<Receipt>,
  ) {}

  async getOwnedReceiptOrThrow(
    id: string,
    organizationId: string,
  ): Promise<Receipt> {
    const receipt = await this.repo.findOne({ where: { id, organizationId } });
    if (!receipt) {
      throw new NotFoundException(`Receipt ${id} not found`);
    }
    return receipt;
  }

  async findAllForOrganization(organizationId: string): Promise<Receipt[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByPaymentId(
    paymentId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<Receipt | null> {
    const repo = manager ? manager.getRepository(Receipt) : this.repo;
    return repo.findOne({ where: { paymentId, organizationId } });
  }
}
