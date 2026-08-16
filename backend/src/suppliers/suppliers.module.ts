import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './entities/supplier.entity';
import { SupplierProduct } from './entities/supplier-product.entity';
import { SuppliersRepository } from './suppliers.repository';
import { SupplierProductsRepository } from './supplier-products.repository';
import { SuppliersService } from './suppliers.service';
import { SupplierProductsService } from './supplier-products.service';
import { SuppliersController } from './suppliers.controller';
import { SupplierProductsController } from './supplier-products.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Supplier, SupplierProduct]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
    forwardRef(() => ProductsModule),
  ],
  controllers: [SuppliersController, SupplierProductsController],
  providers: [
    SuppliersRepository,
    SupplierProductsRepository,
    SuppliersService,
    SupplierProductsService,
  ],
  exports: [
    TypeOrmModule,
    SuppliersRepository,
    SupplierProductsRepository,
    SuppliersService,
    SupplierProductsService,
  ],
})
export class SuppliersModule {}
