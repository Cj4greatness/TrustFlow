import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { ProductsRepository } from './products.repository';
import { InventoryRepository } from './inventory.repository';
import { InventoryMovementRepository } from './inventory-movement.repository';
import { ProductsService } from './products.service';
import { InventoryService } from './inventory.service';

/**
 * No controllers yet — this module exists to wire DI (repositories,
 * services, TypeOrmModule entity registration) so the service layer
 * can be tested directly against a real database before controllers
 * are built (CTO Directive v1 implementation sequence, step 9:
 * tenant-isolation tests precede step 10: controllers).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Product, Inventory, InventoryMovement])],
  controllers: [],
  providers: [
    ProductsRepository,
    InventoryRepository,
    InventoryMovementRepository,
    ProductsService,
    InventoryService,
  ],
  exports: [
    TypeOrmModule,
    ProductsRepository,
    InventoryRepository,
    InventoryMovementRepository,
    ProductsService,
    InventoryService,
  ],
})
export class ProductsModule {}
