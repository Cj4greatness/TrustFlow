import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InventoryMovement } from './entities/inventory-movement.entity';

export interface PaginatedInventoryMovements {
  data: InventoryMovement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class InventoryMovementRepository {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly repository: Repository<InventoryMovement>,
  ) {}

  create(data: Partial<InventoryMovement>): InventoryMovement {
    return this.repository.create(data);
  }

  save(movement: InventoryMovement): Promise<InventoryMovement> {
    return this.repository.save(movement);
  }

  async findByInventoryId(
    inventoryId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedInventoryMovements> {
    const [data, total] = await this.repository.findAndCount({
      where: { inventoryId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  /**
   * Bound to a transactional EntityManager — used by
   * InventoryService.adjustInventory() so the movement record is
   * inserted in the same transaction as the Inventory quantity
   * update, matching InventoryMovement's append-only, audit-trail
   * design intent.
   */
  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(InventoryMovement);
    return {
      create: (data: Partial<InventoryMovement>) =>
        transactionalRepo.create(data),
      save: (movement: InventoryMovement) => transactionalRepo.save(movement),
    };
  }
}
