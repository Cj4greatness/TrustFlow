import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
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
   *
   * CTO-directed tightening (Backend Readiness & Freeze Audit,
   * Section 2, follow-up #3): invoiceId is now an OPTIONAL third
   * filter, not a required one. The HTTP controller
   * (GET .../invoices/:invoiceId/payments/:paymentId) passes it,
   * closing the original gap where a client could fetch a payment
   * belonging to a DIFFERENT invoice in the same org via a URL that
   * implied it belonged to the one in the path.
   *
   * It stays optional because get_payment (the AI Tool Registry
   * entry) has a legitimate, by-design use case: fetching a payment
   * by ID alone, with no invoice context available or needed — see
   * get-payment.tool.ts's own doc comment. Making invoiceId
   * mandatory here would break that caller's contract, which is
   * outside what this audit follow-up asked for.
   */
  async getOwnedPaymentOrThrow(
    id: string,
    organizationId: string,
    invoiceId?: string,
    manager?: EntityManager,
  ): Promise<Payment> {
    const repo = manager ? manager.getRepository(Payment) : this.repo;
    const where: FindOptionsWhere<Payment> = { id, organizationId };
    if (invoiceId !== undefined) {
      where.invoiceId = invoiceId;
    }
    const payment = await repo.findOne({ where });
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
