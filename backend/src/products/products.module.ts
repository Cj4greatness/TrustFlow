import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { ProductsRepository } from './products.repository';
import { InventoryRepository } from './inventory.repository';
import { InventoryMovementRepository } from './inventory-movement.repository';
import { ProductsService } from './products.service';
import { InventoryService } from './inventory.service';
import { ProductsController } from './products.controller';
import { InventoryController } from './inventory.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Inventory, InventoryMovement]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  controllers: [ProductsController, InventoryController],
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
