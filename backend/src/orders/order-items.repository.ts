import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { OrderItem } from './entities/order-item.entity';

@Injectable()
export class OrderItemsRepository {
  constructor(
    @InjectRepository(OrderItem)
    private readonly repository: Repository<OrderItem>,
  ) {}

  create(data: Partial<OrderItem>): OrderItem {
    return this.repository.create(data);
  }

  save(item: OrderItem): Promise<OrderItem> {
    return this.repository.save(item);
  }

  findById(id: string): Promise<OrderItem | null> {
    return this.repository.findOne({ where: { id } });
  }

  findByOrderId(orderId: string): Promise<OrderItem[]> {
    return this.repository.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(OrderItem);
    return {
      create: (data: Partial<OrderItem>) => transactionalRepo.create(data),
      save: (item: OrderItem) => transactionalRepo.save(item),
      findById: (id: string) => transactionalRepo.findOne({ where: { id } }),
      findByOrderId: (orderId: string) =>
        transactionalRepo.find({
          where: { orderId },
          order: { createdAt: 'ASC' },
        }),
      hardDelete: (id: string) => transactionalRepo.delete({ id }),
    };
  }
}
