import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderQueryDto } from './dto/order-query.dto';

export interface PaginatedOrders {
  data: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class OrdersRepository {
  constructor(
    @InjectRepository(Order)
    private readonly repository: Repository<Order>,
  ) {}

  create(data: Partial<Order>): Order {
    return this.repository.create(data);
  }

  save(order: Order): Promise<Order> {
    return this.repository.save(order);
  }

  findById(id: string): Promise<Order | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByOrganization(
    organizationId: string,
    query: OrderQueryDto,
  ): Promise<PaginatedOrders> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.repository
      .createQueryBuilder('order')
      .where('order.organization_id = :organizationId', { organizationId })
      .andWhere('order.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    if (query.customerId) {
      qb.andWhere('order.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }

    qb.orderBy('order.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async hardDelete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }

  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(Order);
    return {
      create: (data: Partial<Order>) => transactionalRepo.create(data),
      save: (order: Order) => transactionalRepo.save(order),
      findByIdForUpdate: (id: string) =>
        transactionalRepo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        }),
    };
  }
}
