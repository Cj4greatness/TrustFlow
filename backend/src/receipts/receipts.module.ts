import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Receipt } from './entities/receipt.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { ReceiptsRepository } from './receipts.repository';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptSettingsModule } from '../receipt-settings/receipt-settings.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Receipt, ReceiptCounter]),
    ReceiptSettingsModule,
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptsRepository],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
