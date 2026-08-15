import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
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

  /**
   * Confirms the product belongs to the organization, then loads its
   * Inventory row. Mirrors CustomersService.getOwnedAddressOrThrow —
   * walks the ownership chain from the parent (Product) down before
   * trusting the child (Inventory).
   */
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
      // Should be unreachable in practice — every product gets an
      // Inventory row atomically at creation (see
      // ProductsService.createProduct) — but kept as a real check
      // rather than a non-null assertion.
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
   * Applies an ADD/REMOVE adjustment atomically: locks the Inventory
   * row (SELECT ... FOR UPDATE) inside the transaction so concurrent
   * adjustments can't both read the same starting quantity and
   * produce an incorrect final balance, computes the new quantity,
   * rejects it if it would go negative, then updates Inventory and
   * inserts the InventoryMovement audit record together. Either both
   * succeed or neither does.
   */
  async adjustInventory(
    organizationId: string,
    productId: string,
    dto: AdjustInventoryDto,
    createdByUserId: string,
  ): Promise<Inventory> {
    const inventory = await this.getOwnedInventoryOrThrow(
      organizationId,
      productId,
    );

    return this.dataSource.transaction(async (manager) => {
      const inventoryRepo = this.inventoryRepository.withTransaction(manager);
      const movementRepo =
        this.inventoryMovementRepository.withTransaction(manager);

      const lockedInventory = await inventoryRepo.findByIdForUpdate(
        inventory.id,
      );
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
    });
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
