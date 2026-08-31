import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderCounter } from './entities/order-counter.entity';

/**
 * Not exposed via any API — purely internal to OrdersService.
 * Lazily created on an organization's first order (confirmed
 * decision), inside the same transaction as that order's creation.
 * withTransaction()'s findByOrganizationIdForUpdate mirrors
 * InventoryRepository.findByIdForUpdate exactly — same
 * concurrency-safety pattern applied to a different resource.
 */
@Injectable()
export class OrderCounterRepository {
  constructor(
    @InjectRepository(OrderCounter)
    private readonly repository: Repository<OrderCounter>,
  ) {}

  create(data: Partial<OrderCounter>): OrderCounter {
    return this.repository.create(data);
  }

  save(counter: OrderCounter): Promise<OrderCounter> {
    return this.repository.save(counter);
  }

  findByOrganizationId(organizationId: string): Promise<OrderCounter | null> {
    return this.repository.findOne({ where: { organizationId } });
  }

  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(OrderCounter);
    return {
      create: (data: Partial<OrderCounter>) => transactionalRepo.create(data),
      save: (counter: OrderCounter) => transactionalRepo.save(counter),
      findByOrganizationIdForUpdate: (organizationId: string) =>
        transactionalRepo.findOne({
          where: { organizationId },
          lock: { mode: 'pessimistic_write' },
        }),
    };
  }
}
