import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Inventory } from './entities/inventory.entity';

@Injectable()
export class InventoryRepository {
  constructor(
    @InjectRepository(Inventory)
    private readonly repository: Repository<Inventory>,
  ) {}

  create(data: Partial<Inventory>): Inventory {
    return this.repository.create(data);
  }

  save(inventory: Inventory): Promise<Inventory> {
    return this.repository.save(inventory);
  }

  findById(id: string): Promise<Inventory | null> {
    return this.repository.findOne({ where: { id } });
  }

  findByProductId(productId: string): Promise<Inventory | null> {
    return this.repository.findOne({ where: { productId } });
  }

  /**
   * Same operations as above, but bound to a transactional
   * EntityManager. Used by ProductsService.createProduct() (atomic
   * Product + Inventory creation) and InventoryService.adjustInventory()
   * (atomic quantity update + InventoryMovement insert).
   */
  withTransaction(manager: EntityManager) {
    const transactionalRepo = manager.getRepository(Inventory);
    return {
      create: (data: Partial<Inventory>) => transactionalRepo.create(data),
      save: (inventory: Inventory) => transactionalRepo.save(inventory),
      /**
       * Loads the Inventory row with a PostgreSQL row-level lock
       * (SELECT ... FOR UPDATE) so concurrent adjustments serialize
       * instead of both reading the same starting quantity and
       * producing an incorrect final balance. Only meaningful inside
       * an active transaction — a pessimistic lock outside one has
       * no effect and is released immediately.
       */
      findByIdForUpdate: (id: string) =>
        transactionalRepo.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        }),
    };
  }
}
