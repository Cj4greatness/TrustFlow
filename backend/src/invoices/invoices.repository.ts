import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';

/**
 * InvoicesRepository
 *
 * ASSUMPTION FLAGGED: I don't have your actual base-repository class
 * (referenced in memory as the source of the `getOwnedXOrThrow`
 * pattern used across Customers/Products/Suppliers/Orders). This
 * reimplements that pattern's shape for Invoice specifically. If you
 * have a shared `BaseRepository<T>` with `getOwnedOrThrow()` already,
 * extend/use that instead of duplicating the method here — this
 * exists so the service layer has something correct to call today.
 *
 * Every method takes organizationId explicitly and filters by it —
 * per your established convention, tenant isolation is enforced
 * per-method here, not via a global TypeORM scope/subscriber.
 */
@Injectable()
export class InvoicesRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly repo: Repository<Invoice>,
  ) {}

  /**
   * Throws NotFoundException (not ForbiddenException) if the invoice
   * doesn't exist OR belongs to a different organization — same
   * information-leak-avoidance reasoning as the rest of the codebase
   * (a 403 would confirm the record exists for another tenant).
   */
  async getOwnedInvoiceOrThrow(
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<Invoice> {
    const repo = manager ? manager.getRepository(Invoice) : this.repo;
    const invoice = await repo.findOne({
      where: { id, organizationId },
      relations: { lineItems: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return invoice;
  }

  async findAllForOrganization(organizationId: string): Promise<Invoice[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByOrderId(
    orderId: string,
    organizationId: string,
  ): Promise<Invoice | null> {
    return this.repo.findOne({ where: { orderId, organizationId } });
  }
}
