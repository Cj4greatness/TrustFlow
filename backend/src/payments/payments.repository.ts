import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';

/**
 * PaymentsRepository
 *
 * Matches InvoicesRepository's shape exactly (optional `manager` per
 * method, not a .withTransaction() factory) — its own doc comment
 * flags that it's reimplementing an assumed shared base-repository
 * pattern rather than confirmed to extend one. Same caveat applies
 * here: if a real BaseRepository<T> exists, use that instead.
 *
 * Every method takes organizationId explicitly — tenant isolation
 * enforced per-method, matching the rest of the codebase.
 */
@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectRepository(Payment)
    private readonly repo: Repository<Payment>,
  ) {}

  /**
   * Throws NotFoundException (not ForbiddenException) if the payment
   * doesn't exist OR belongs to a different organization — same
   * information-leak-avoidance reasoning as InvoicesRepository.
   */
  async getOwnedPaymentOrThrow(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<Payment> {
    const repo = manager ? manager.getRepository(Payment) : this.repo;
    const payment = await repo.findOne({ where: { id, organizationId } });
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    return payment;
  }

  async findAllForInvoice(
    invoiceId: string,
    organizationId: string,
  ): Promise<Payment[]> {
    return this.repo.find({
      where: { invoiceId, organizationId },
      order: { createdAt: 'DESC' },
    });
  }
}
