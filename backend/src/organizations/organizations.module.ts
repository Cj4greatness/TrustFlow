import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { CommonServicesModule } from '../common/services/common-services.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization]),
    CommonServicesModule,
    OrganizationMembersModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsRepository, OrganizationsService],
  exports: [TypeOrmModule, OrganizationsRepository, OrganizationsService],
})
export class OrganizationsModule {}
