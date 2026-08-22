import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceiptSettings } from './entities/receipt-settings.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { ReceiptSettingsRepository } from './receipt-settings.repository';
import { ReceiptSettingsService } from './receipt-settings.service';
import { ReceiptSettingsController } from './receipt-settings.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

/**
 * ReceiptSettingsModule
 *
 * AuthorizationModule + OrganizationMembersModule included from the
 * start this time (both forwardRef) — learned from the Finance
 * DI-resolution bug this same session, where their absence compiled
 * cleanly but failed at actual application boot.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ReceiptSettings, Organization]),
    forwardRef(() => AuthorizationModule),
    forwardRef(() => OrganizationMembersModule),
  ],
  controllers: [ReceiptSettingsController],
  providers: [ReceiptSettingsService, ReceiptSettingsRepository],
  exports: [ReceiptSettingsService],
})
export class ReceiptSettingsModule {}
