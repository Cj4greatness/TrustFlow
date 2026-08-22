import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderCounter } from './entities/order-counter.entity';
import { OrdersRepository } from './orders.repository';
import { OrderItemsRepository } from './order-items.repository';
import { OrderCounterRepository } from './order-counter.repository';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderItemsController } from './order-items.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderCounter]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => ProductsModule),
    InvoicesModule,
  ],
  controllers: [OrdersController, OrderItemsController],
  providers: [
    OrdersRepository,
    OrderItemsRepository,
    OrderCounterRepository,
    OrdersService,
  ],
  exports: [
    TypeOrmModule,
    OrdersRepository,
    OrderItemsRepository,
    OrderCounterRepository,
    OrdersService,
  ],
})
export class OrdersModule {}
