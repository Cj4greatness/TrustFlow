import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveriesRepository } from './deliveries.repository';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, DeliveriesRepository],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
