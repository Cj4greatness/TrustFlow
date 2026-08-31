import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Delivery } from './entities/delivery.entity';

/**
 * DeliveriesRepository
 *
 * Matches InvoicesRepository/PaymentsRepository/ReceiptsRepository's
 * shape — no shared base-repository class exists in this codebase
 * (confirmed via grep during Sprint 5's CTO review, Gate 6).
 */
@Injectable()
export class DeliveriesRepository {
  constructor(
    @InjectRepository(Delivery)
    private readonly repo: Repository<Delivery>,
  ) {}

  async getOwnedDeliveryOrThrow(
    id: string,
    organizationId: string,
  ): Promise<Delivery> {
    const delivery = await this.repo.findOne({
      where: { id, organizationId },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${id} not found`);
    }
    return delivery;
  }

  async findAllForOrganization(organizationId: string): Promise<Delivery[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByOrderId(
    orderId: string,
    organizationId: string,
  ): Promise<Delivery | null> {
    return this.repo.findOne({ where: { orderId, organizationId } });
  }
}
