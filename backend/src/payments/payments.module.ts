import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { InvoicesModule } from '../invoices/invoices.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    InvoicesModule,
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsRepository, PaymentsService],
  exports: [PaymentsRepository, PaymentsService],
})
export class PaymentsModule {}
