import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductsService } from './products.service';
import { InventoryRepository } from './inventory.repository';
import {
  InventoryMovementRepository,
  PaginatedInventoryMovements,
} from './inventory-movement.repository';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryMovementQueryDto } from './dto/inventory-movement-query.dto';
import { Inventory } from './entities/inventory.entity';
import { InventoryMovementType } from './entities/inventory-movement.entity';

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsService: ProductsService,
    private readonly inventoryRepository: InventoryRepository,
    private readonly inventoryMovementRepository: InventoryMovementRepository,
  ) {}

  private async getOwnedInventoryOrThrow(
    organizationId: string,
    productId: string,
  ): Promise<Inventory> {
    await this.productsService.getOwnedProductOrThrow(
      organizationId,
      productId,
    );

    const inventory = await this.inventoryRepository.findByProductId(productId);
    if (!inventory || inventory.organizationId !== organizationId) {
      throw new NotFoundException('Inventory not found for this product');
    }
    return inventory;
  }

  async getInventory(
    organizationId: string,
    productId: string,
  ): Promise<Inventory> {
    return this.getOwnedInventoryOrThrow(organizationId, productId);
  }

  /**
   * The actual locked-adjustment logic, factored out so it can run
   * against either a fresh transaction (adjustInventory's default
   * behavior) or a transaction manager passed in by a caller that
   * needs this adjustment to be part of a larger atomic operation
   * (e.g. OrdersService.confirmOrder deducting inventory for
   * multiple order items — all deduct, or none do). This is the
   * exact concurrency-safe pattern proven by the earlier
   * 10-concurrent-adjustments test: SELECT ... FOR UPDATE inside
   * the transaction, compute, reject if negative, save + record
   * movement together.
   */
  private async applyAdjustment(
    manager: EntityManager,
    organizationId: string,
    inventoryId: string,
    dto: AdjustInventoryDto,
    createdByUserId: string,
  ): Promise<Inventory> {
    const inventoryRepo = this.inventoryRepository.withTransaction(manager);
    const movementRepo =
      this.inventoryMovementRepository.withTransaction(manager);

    const lockedInventory = await inventoryRepo.findByIdForUpdate(inventoryId);
    if (!lockedInventory) {
      throw new NotFoundException('Inventory not found');
    }

    const delta =
      dto.type === InventoryMovementType.ADD ? dto.quantity : -dto.quantity;
    const newQuantity = lockedInventory.quantity + delta;

    if (newQuantity < 0) {
      throw new BadRequestException(
        `Adjustment would result in negative inventory (current: ${lockedInventory.quantity}, requested: ${dto.type} ${dto.quantity})`,
      );
    }

    lockedInventory.quantity = newQuantity;
    const savedInventory = await inventoryRepo.save(lockedInventory);

    const movement = movementRepo.create({
      organizationId,
      inventoryId: lockedInventory.id,
      type: dto.type,
      quantity: dto.quantity,
      reason: dto.reason,
      createdBy: createdByUserId,
    });
    await movementRepo.save(movement);

    return savedInventory;
  }

  /**
   * Applies an ADD/REMOVE adjustment. If no `manager` is provided
   * (the normal case — a direct client-facing inventory adjustment),
   * opens and manages its own transaction, exactly as before this
   * refactor. If a `manager` IS provided, joins that caller's
   * existing transaction instead of opening a new one — this is
   * what lets OrdersService.confirmOrder() deduct inventory for
   * several order items as one atomic unit: either all products
   * have sufficient stock and all deduct together, or the entire
   * order confirmation rolls back, per Directive v1 §7.
   */
  async adjustInventory(
    organizationId: string,
    productId: string,
    dto: AdjustInventoryDto,
    createdByUserId: string,
    manager?: EntityManager,
  ): Promise<Inventory> {
    const inventory = await this.getOwnedInventoryOrThrow(
      organizationId,
      productId,
    );

    if (manager) {
      return this.applyAdjustment(
        manager,
        organizationId,
        inventory.id,
        dto,
        createdByUserId,
      );
    }

    return this.dataSource.transaction((txManager) =>
      this.applyAdjustment(
        txManager,
        organizationId,
        inventory.id,
        dto,
        createdByUserId,
      ),
    );
  }

  async listMovements(
    organizationId: string,
    productId: string,
    query: InventoryMovementQueryDto,
  ): Promise<PaginatedInventoryMovements> {
    const inventory = await this.getOwnedInventoryOrThrow(
      organizationId,
      productId,
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.inventoryMovementRepository.findByInventoryId(
      inventory.id,
      page,
      limit,
    );
  }
}
